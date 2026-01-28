import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  DollarSign,
  CheckCircle,
  Clock,
  AlertTriangle,
  Calendar,
  Download,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  total_amount: number;
  status: string;
  due_date: string | null;
  paid_date: string | null;
  created_at: string;
  customers?: { company_name: string };
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format(amount);
};

const InvoiceReports = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState("month");
  const [exporting, setExporting] = useState(false);

  const getDateRange = () => {
    const now = new Date();
    switch (dateRange) {
      case "week":
        return { start: subMonths(now, 0), end: now };
      case "month":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "quarter":
        return { start: subMonths(now, 3), end: now };
      case "year":
        return { start: subMonths(now, 12), end: now };
      default:
        return { start: startOfMonth(now), end: now };
    }
  };

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();

      const { data, error } = await supabase
        .from("invoices")
        .select(`
          *,
          customers(company_name)
        `)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Update overdue status
      const now = new Date();
      const processed = (data || []).map((inv) => {
        if (inv.status === "pending" && inv.due_date && new Date(inv.due_date) < now) {
          return { ...inv, status: "overdue" };
        }
        return inv;
      });

      setInvoices(processed);
    } catch (error) {
      console.error("Error fetching invoices:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [dateRange]);

  const paidInvoices = invoices.filter((inv) => inv.status === "paid");
  const unpaidInvoices = invoices.filter((inv) => inv.status !== "paid" && inv.status !== "cancelled");

  const totals = {
    total: invoices.reduce((sum, inv) => sum + inv.total_amount, 0),
    paid: paidInvoices.reduce((sum, inv) => sum + inv.total_amount, 0),
    unpaid: unpaidInvoices.reduce((sum, inv) => sum + inv.total_amount, 0),
    overdue: invoices.filter((inv) => inv.status === "overdue").reduce((sum, inv) => sum + inv.total_amount, 0),
    pending: invoices.filter((inv) => inv.status === "pending").reduce((sum, inv) => sum + inv.total_amount, 0),
  };

  const pieData = [
    { name: "Paid", value: totals.paid, color: "hsl(var(--success))" },
    { name: "Pending", value: totals.pending, color: "hsl(var(--warning))" },
    { name: "Overdue", value: totals.overdue, color: "hsl(var(--destructive))" },
  ].filter((d) => d.value > 0);

  // Group by customer for top customers chart
  const customerTotals: Record<string, { name: string; paid: number; unpaid: number }> = {};
  invoices.forEach((inv) => {
    const name = inv.customers?.company_name || "Unknown";
    if (!customerTotals[name]) {
      customerTotals[name] = { name, paid: 0, unpaid: 0 };
    }
    if (inv.status === "paid") {
      customerTotals[name].paid += inv.total_amount;
    } else {
      customerTotals[name].unpaid += inv.total_amount;
    }
  });

  const topCustomers = Object.values(customerTotals)
    .sort((a, b) => (b.paid + b.unpaid) - (a.paid + a.unpaid))
    .slice(0, 10);

  const handleExportPDF = (type: "paid" | "unpaid" | "all") => {
    setExporting(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      const title = type === "paid" ? "Paid Invoices Report" : type === "unpaid" ? "Unpaid Invoices Report" : "All Invoices Report";
      const data = type === "paid" ? paidInvoices : type === "unpaid" ? unpaidInvoices : invoices;

      doc.setFontSize(18);
      doc.text(title, pageWidth / 2, 20, { align: "center" });
      doc.setFontSize(10);
      doc.text(`Generated: ${format(new Date(), "PPP")}`, pageWidth / 2, 28, { align: "center" });

      const total = data.reduce((sum, inv) => sum + inv.total_amount, 0);
      doc.setFontSize(12);
      doc.text(`Total: ${formatCurrency(total)}`, 14, 42);
      doc.text(`Count: ${data.length} invoices`, 14, 49);

      const tableData = data.map((inv) => [
        inv.invoice_number,
        inv.customers?.company_name || "N/A",
        formatCurrency(inv.total_amount),
        inv.status,
        inv.due_date ? format(new Date(inv.due_date), "dd/MM/yyyy") : "-",
        inv.paid_date ? format(new Date(inv.paid_date), "dd/MM/yyyy") : "-",
      ]);

      autoTable(doc, {
        startY: 58,
        head: [["Invoice #", "Customer", "Amount", "Status", "Due Date", "Paid Date"]],
        body: tableData,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [59, 130, 246] },
      });

      doc.save(`${type}-invoices-report.pdf`);
    } catch (error) {
      console.error("Error exporting PDF:", error);
    } finally {
      setExporting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-success/15 text-success">Paid</Badge>;
      case "pending":
        return <Badge className="bg-warning/15 text-warning">Pending</Badge>;
      case "overdue":
        return <Badge className="bg-destructive/15 text-destructive">Overdue</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Invoice Reports" subtitle="Paid and unpaid invoices analysis">
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Invoice Reports"
      subtitle="Track paid and unpaid invoices with aging analysis"
    >
      {/* Filters */}
      <div className="flex items-center justify-between mb-8">
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-40 bg-secondary/50 border-border/50">
            <Calendar className="w-4 h-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="quarter">Last 3 Months</SelectItem>
            <SelectItem value="year">This Year</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleExportPDF("paid")} disabled={exporting}>
            <Download className="w-4 h-4 mr-2" />
            Export Paid
          </Button>
          <Button variant="outline" onClick={() => handleExportPDF("unpaid")} disabled={exporting}>
            <Download className="w-4 h-4 mr-2" />
            Export Unpaid
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">{formatCurrency(totals.total)}</p>
              <p className="text-xs text-muted-foreground">Total Invoiced</p>
            </div>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-lg font-bold text-success">{formatCurrency(totals.paid)}</p>
              <p className="text-xs text-muted-foreground">Collected ({paidInvoices.length})</p>
            </div>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-warning" />
            </div>
            <div>
              <p className="text-lg font-bold text-warning">{formatCurrency(totals.pending)}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-destructive/20 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="text-lg font-bold text-destructive">{formatCurrency(totals.overdue)}</p>
              <p className="text-xs text-muted-foreground">Overdue</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="text-sm font-heading">Payment Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="value"
                  paddingAngle={2}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-2">
              {pieData.map((entry) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="text-xs text-muted-foreground">{entry.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-border/50 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-heading">Top Customers by Invoice Value</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topCustomers} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={100}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Bar dataKey="paid" name="Paid" fill="hsl(var(--success))" stackId="a" />
                <Bar dataKey="unpaid" name="Unpaid" fill="hsl(var(--warning))" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Invoice Tables */}
      <Tabs defaultValue="unpaid" className="space-y-6">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="unpaid">
            Unpaid ({unpaidInvoices.length})
          </TabsTrigger>
          <TabsTrigger value="paid">
            Paid ({paidInvoices.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="unpaid">
          <Card className="glass-card border-border/50">
            <CardHeader>
              <CardTitle className="text-sm font-heading">Unpaid Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unpaidInvoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No unpaid invoices
                      </TableCell>
                    </TableRow>
                  ) : (
                    unpaidInvoices.map((inv) => (
                      <TableRow key={inv.id} className="border-border/50">
                        <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                        <TableCell>{inv.customers?.company_name || "N/A"}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(inv.total_amount)}</TableCell>
                        <TableCell className="text-center">{getStatusBadge(inv.status)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {inv.due_date ? format(new Date(inv.due_date), "dd MMM yyyy") : "-"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(inv.created_at), "dd MMM yyyy")}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="paid">
          <Card className="glass-card border-border/50">
            <CardHeader>
              <CardTitle className="text-sm font-heading">Paid Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead>Paid Date</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paidInvoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No paid invoices
                      </TableCell>
                    </TableRow>
                  ) : (
                    paidInvoices.map((inv) => (
                      <TableRow key={inv.id} className="border-border/50">
                        <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                        <TableCell>{inv.customers?.company_name || "N/A"}</TableCell>
                        <TableCell className="text-right font-medium text-success">{formatCurrency(inv.total_amount)}</TableCell>
                        <TableCell className="text-center">{getStatusBadge(inv.status)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {inv.paid_date ? format(new Date(inv.paid_date), "dd MMM yyyy") : "-"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(inv.created_at), "dd MMM yyyy")}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
};

export default InvoiceReports;
