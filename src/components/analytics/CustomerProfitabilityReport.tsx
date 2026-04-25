import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { TrendingUp, TrendingDown, Users, DollarSign, Download, ChevronRight, Truck, Package, MapPin, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface CustomerProfitability {
  id: string;
  company_name: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  margin: number;
  dispatchCount: number;
}

interface DispatchDetail {
  id: string;
  dispatch_number: string;
  pickup_address: string;
  delivery_address: string;
  cost: number | null;
  status: string | null;
  created_at: string;
  distance_km: number | null;
  total_distance_km: number | null;
  cogs: number;
  cogsBreakdown: { category: string; amount: number }[];
}

interface Invoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  status: string | null;
  created_at: string;
}

interface Props {
  month: number;
  year: number;
}

const CustomerProfitabilityReport = ({ month, year }: Props) => {
  const [data, setData] = useState<CustomerProfitability[]>([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({ revenue: 0, cogs: 0, profit: 0 });
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfitability | null>(null);
  const [customerDispatches, setCustomerDispatches] = useState<DispatchDetail[]>([]);
  const [customerInvoices, setCustomerInvoices] = useState<Invoice[]>([]);
  const [loadingDispatches, setLoadingDispatches] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchData();
  }, [month, year]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const periodEnd = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

      // Fetch customers
      const { data: customers } = await supabase
        .from("customers")
        .select("id, company_name");

      // Fetch invoices for the selected period using invoice_date
      const { data: invoices } = await supabase
        .from("invoices")
        .select("customer_id, total_amount, status")
        .gte("invoice_date", periodStart)
        .lte("invoice_date", periodEnd);

      // Fetch approved COGS expenses for the period (include dispatch_id for fallback attribution)
      const { data: expenses } = await supabase
        .from("expenses")
        .select("customer_id, dispatch_id, amount, is_cogs, approval_status")
        .gte("expense_date", periodStart)
        .lte("expense_date", periodEnd)
        .eq("approval_status", "approved")
        .eq("is_cogs", true);

      // Fetch bills for the period (exclude drafts and void)
      const { data: bills } = await (supabase as any)
        .from("bills")
        .select("line_items, bill_date, amount, status")
        .gte("bill_date", periodStart)
        .lte("bill_date", periodEnd)
        .not("status", "in", "(draft,void)");

      // Fetch dispatches for the period (for dispatch count + customer mapping)
      const { data: dispatches } = await supabase
        .from("dispatches")
        .select("customer_id, id")
        .gte("created_at", periodStart)
        .lte("created_at", periodEnd + "T23:59:59");

      // Build dispatch→customer lookup so expenses with dispatch_id but no customer_id
      // can still be attributed to the correct customer
      const dispatchToCustomer = new Map<string, string>();
      dispatches?.forEach((d) => { if (d.customer_id) dispatchToCustomer.set(d.id, d.customer_id); });

      // For expenses that reference dispatches outside the period, fetch those dispatches too
      const missingDispatchIds = (expenses || [])
        .filter(e => e.dispatch_id && !dispatchToCustomer.has(e.dispatch_id))
        .map(e => e.dispatch_id as string);
      if (missingDispatchIds.length > 0) {
        const { data: extraDispatches } = await supabase
          .from("dispatches")
          .select("id, customer_id")
          .in("id", missingDispatchIds);
        extraDispatches?.forEach((d) => { if (d.customer_id) dispatchToCustomer.set(d.id, d.customer_id); });
      }

      // Build profitability data
      const profitabilityMap = new Map<string, CustomerProfitability>();

      customers?.forEach((customer) => {
        profitabilityMap.set(customer.id, {
          id: customer.id,
          company_name: customer.company_name,
          revenue: 0,
          cogs: 0,
          grossProfit: 0,
          margin: 0,
          dispatchCount: 0,
        });
      });

      // Add revenue from invoices
      invoices?.forEach((inv) => {
        const existing = profitabilityMap.get(inv.customer_id);
        if (existing) {
          existing.revenue += Number(inv.total_amount);
        }
      });

      // Add COGS from approved expenses
      // Resolution order: expense.customer_id → dispatch.customer_id → unattributed (skip)
      expenses?.forEach((exp) => {
        const customerId = exp.customer_id ||
          (exp.dispatch_id ? dispatchToCustomer.get(exp.dispatch_id) : null);
        if (customerId) {
          const existing = profitabilityMap.get(customerId);
          if (existing) existing.cogs += Number(exp.amount);
        }
      });

      // Add COGS from bills — only line items that have an explicit customer_id
      // Bills without customer attribution are excluded from per-customer COGS
      // (they are already counted in the overall P&L COGS)
      ((bills as any[]) || []).forEach((bill: any) => {
        const lines: any[] = bill.line_items || [];
        lines.forEach((l: any) => {
          if (l.customer_id) {
            const existing = profitabilityMap.get(l.customer_id);
            if (existing) existing.cogs += Number(l.rate || 0) * Number(l.quantity || 1);
          }
        });
      });

      // Count dispatches
      dispatches?.forEach((disp) => {
        const existing = profitabilityMap.get(disp.customer_id);
        if (existing) {
          existing.dispatchCount += 1;
        }
      });

      // Calculate gross profit and margin
      const results: CustomerProfitability[] = [];
      profitabilityMap.forEach((item) => {
        item.grossProfit = item.revenue - item.cogs;
        item.margin = item.revenue > 0 ? (item.grossProfit / item.revenue) * 100 : 0;
        if (item.revenue > 0 || item.cogs > 0 || item.dispatchCount > 0) {
          results.push(item);
        }
      });

      // Sort by gross profit descending
      results.sort((a, b) => b.grossProfit - a.grossProfit);

      // Calculate totals
      const totalRevenue = results.reduce((sum, r) => sum + r.revenue, 0);
      const totalCogs = results.reduce((sum, r) => sum + r.cogs, 0);
      const totalProfit = totalRevenue - totalCogs;

      setTotals({ revenue: totalRevenue, cogs: totalCogs, profit: totalProfit });
      setData(results);
    } catch (error) {
      console.error("Error fetching profitability data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerDispatches = async (customerId: string) => {
    setLoadingDispatches(true);
    try {
      // Fetch dispatches for this customer
      const { data: dispatches } = await supabase
        .from("dispatches")
        .select("id, dispatch_number, pickup_address, delivery_address, cost, status, created_at, distance_km, total_distance_km")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });

      // Fetch approved COGS expenses for this customer (direct or via dispatch)
      const { data: cogsExpenses } = await supabase
        .from("expenses")
        .select("dispatch_id, amount, category")
        .eq("customer_id", customerId)
        .eq("is_cogs", true)
        .eq("approval_status", "approved");

      // Fetch invoices for this customer
      const { data: invoices } = await supabase
        .from("invoices")
        .select("id, invoice_number, total_amount, status, created_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });

      // Map COGS to dispatches with breakdown
      const cogsMap = new Map<string, { total: number; breakdown: { category: string; amount: number }[] }>();
      cogsExpenses?.forEach((exp) => {
        if (exp.dispatch_id) {
          const existing = cogsMap.get(exp.dispatch_id) || { total: 0, breakdown: [] };
          existing.total += Number(exp.amount);
          const categoryEntry = existing.breakdown.find(b => b.category === exp.category);
          if (categoryEntry) {
            categoryEntry.amount += Number(exp.amount);
          } else {
            existing.breakdown.push({ category: exp.category, amount: Number(exp.amount) });
          }
          cogsMap.set(exp.dispatch_id, existing);
        }
      });

      const dispatchDetails: DispatchDetail[] = (dispatches || []).map((d) => {
        const cogsData = cogsMap.get(d.id) || { total: 0, breakdown: [] };
        return {
          ...d,
          cogs: cogsData.total,
          cogsBreakdown: cogsData.breakdown,
        };
      });

      setCustomerDispatches(dispatchDetails);
      setCustomerInvoices(invoices || []);
    } catch (error) {
      console.error("Error fetching customer dispatches:", error);
    } finally {
      setLoadingDispatches(false);
    }
  };

  const handleCustomerClick = async (customer: CustomerProfitability) => {
    setSelectedCustomer(customer);
    await fetchCustomerDispatches(customer.id);
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) return `₦${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `₦${(amount / 1000).toFixed(0)}K`;
    return `₦${amount.toFixed(0)}`;
  };

  const formatFullCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const handleExportCSV = () => {
    const headers = ["Customer", "Revenue", "COGS", "Gross Profit", "Margin %", "Dispatches"];
    const rows = data.map((item) => [
      item.company_name,
      item.revenue.toFixed(2),
      item.cogs.toFixed(2),
      item.grossProfit.toFixed(2),
      item.margin.toFixed(1),
      item.dispatchCount.toString(),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `customer-profitability-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      // Title
      doc.setFontSize(18);
      doc.setTextColor(40);
      doc.text("Customer Profitability Report", pageWidth / 2, 20, { align: "center" });

      // Date
      const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' });
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Period: ${monthName} ${year} | Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, 28, { align: "center" });

      // Summary
      doc.setFontSize(12);
      doc.setTextColor(40);
      doc.text("Summary", 14, 40);

      doc.setFontSize(10);
      doc.setTextColor(60);
      doc.text(`Total Revenue: ${formatFullCurrency(totals.revenue)}`, 14, 48);
      doc.text(`Total COGS: ${formatFullCurrency(totals.cogs)}`, 14, 55);
      doc.text(`Gross Profit: ${formatFullCurrency(totals.profit)}`, 14, 62);
      doc.text(`Active Customers: ${data.length}`, 14, 69);

      // Table
      const tableData = data.map((item, index) => [
        index + 1,
        item.company_name,
        formatFullCurrency(item.revenue),
        formatFullCurrency(item.cogs),
        formatFullCurrency(item.grossProfit),
        `${item.margin.toFixed(1)}%`,
        item.dispatchCount,
      ]);

      autoTable(doc, {
        startY: 78,
        head: [["#", "Customer", "Revenue", "COGS", "Gross Profit", "Margin", "Dispatches"]],
        body: tableData,
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [59, 130, 246], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
      });

      doc.save("customer-profitability-report.pdf");
    } catch (error) {
      console.error("Error exporting PDF:", error);
    } finally {
      setExporting(false);
    }
  };

  const chartData = data.slice(0, 10).map((item) => ({
    name: item.company_name.length > 15 ? item.company_name.slice(0, 15) + "..." : item.company_name,
    revenue: item.revenue,
    cogs: item.cogs,
    profit: item.grossProfit,
  }));

  if (loading) {
    return (
      <Card className="glass-card border-border/50">
        <CardContent className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Export */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-heading font-semibold">Customer Profitability</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={exporting}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={exporting}>
            <Download className="w-4 h-4 mr-2" />
            {exporting ? "Exporting..." : "Export PDF"}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">{formatCurrency(totals.revenue)}</p>
              <p className="text-xs text-muted-foreground">Total Revenue</p>
            </div>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-warning" />
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">{formatCurrency(totals.cogs)}</p>
              <p className="text-xs text-muted-foreground">Total COGS</p>
            </div>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className={`text-lg font-bold ${totals.profit >= 0 ? 'text-success' : 'text-destructive'}`}>
                {formatCurrency(totals.profit)}
              </p>
              <p className="text-xs text-muted-foreground">Gross Profit</p>
            </div>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-secondary/50 flex items-center justify-center">
              <Users className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">{data.length}</p>
              <p className="text-xs text-muted-foreground">Active Customers</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="text-sm font-heading">Top 10 Customers by Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--popover))", borderColor: "hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--popover-foreground))" }}
                  labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                  itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Bar dataKey="profit" name="Gross Profit" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={index} fill={entry.profit >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card className="glass-card border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-heading">Customer Profitability Details</CardTitle>
          <p className="text-xs text-muted-foreground">Click on a customer to see dispatch details and COGS breakdown</p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">COGS</TableHead>
                <TableHead className="text-right">Gross Profit</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-center">Dispatches</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No customer data available
                  </TableCell>
                </TableRow>
              ) : (
                data.map((item, index) => (
                  <TableRow 
                    key={item.id} 
                    className="border-border/50 cursor-pointer hover:bg-secondary/50 transition-colors"
                    onClick={() => handleCustomerClick(item)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-5">#{index + 1}</span>
                        {item.company_name}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-success">{formatCurrency(item.revenue)}</TableCell>
                    <TableCell className="text-right text-warning">{formatCurrency(item.cogs)}</TableCell>
                    <TableCell className={`text-right font-medium ${item.grossProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {formatCurrency(item.grossProfit)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={item.margin >= 30 ? "default" : item.margin >= 15 ? "secondary" : "outline"}>
                        {item.margin.toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{item.dispatchCount}</TableCell>
                    <TableCell>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Customer Drill-Down Dialog */}
      <Dialog open={!!selectedCustomer} onOpenChange={(open) => !open && setSelectedCustomer(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Package className="w-5 h-5" />
              {selectedCustomer?.company_name} - Dispatch Details
            </DialogTitle>
            <DialogDescription>
              View individual dispatches and associated COGS for this customer
            </DialogDescription>
          </DialogHeader>

          {loadingDispatches ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Customer Summary */}
              <div className="grid grid-cols-4 gap-4 p-4 bg-secondary/30 rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground">Revenue</p>
                  <p className="font-semibold text-success">{formatFullCurrency(selectedCustomer?.revenue || 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total COGS</p>
                  <p className="font-semibold text-warning">{formatFullCurrency(selectedCustomer?.cogs || 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Gross Profit</p>
                  <p className={`font-semibold ${(selectedCustomer?.grossProfit || 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {formatFullCurrency(selectedCustomer?.grossProfit || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Margin</p>
                  <p className="font-semibold">{(selectedCustomer?.margin || 0).toFixed(1)}%</p>
                </div>
              </div>

              {/* Dispatches Table */}
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead>Dispatch #</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">COGS</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customerDispatches.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No dispatches found for this customer
                      </TableCell>
                    </TableRow>
                  ) : (
                    customerDispatches.map((dispatch) => {
                      const revenue = dispatch.cost || 0;
                      const profit = revenue - dispatch.cogs;
                      return (
                        <TableRow key={dispatch.id} className="border-border/50">
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Truck className="w-4 h-4 text-muted-foreground" />
                              {dispatch.dispatch_number}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            <div className="max-w-xs truncate">
                              {dispatch.pickup_address.split(",")[0]} → {dispatch.delivery_address.split(",")[0]}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-success">
                            {formatFullCurrency(revenue)}
                          </TableCell>
                          <TableCell className="text-right text-warning">
                            {formatFullCurrency(dispatch.cogs)}
                          </TableCell>
                          <TableCell className={`text-right font-medium ${profit >= 0 ? 'text-success' : 'text-destructive'}`}>
                            {formatFullCurrency(profit)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={dispatch.status === "delivered" ? "default" : "secondary"}>
                              {dispatch.status || "pending"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(dispatch.created_at).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomerProfitabilityReport;