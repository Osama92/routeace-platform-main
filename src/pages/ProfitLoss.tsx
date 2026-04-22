import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Cell,
  Legend,
  ReferenceLine,
} from "recharts";
import { Download, TrendingUp, TrendingDown, DollarSign, Package, FileText, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";

interface MonthlyPL {
  month: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  revenueTarget: number;
  netProfitTarget: number;
}

interface ExpenseBreakdown {
  category: string;
  amount: number;
}

const ProfitLossPage = () => {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("current");
  const [plData, setPLData] = useState({
    revenue: 0,
    cogs: 0,
    grossProfit: 0,
    operatingExpenses: 0,
    netProfit: 0,
    grossMargin: 0,
    netMargin: 0,
  });
  const [expenseBreakdown, setExpenseBreakdown] = useState<ExpenseBreakdown[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyPL[]>([]);
  const [dispatches, setDispatches] = useState(0);
  const [invoiceCount, setInvoiceCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, [period]);

  const getDateRange = () => {
    const now = new Date();
    switch (period) {
      case "current":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "last":
        return { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) };
      case "q1":
        return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear(), 2, 31) };
      case "ytd":
        return { start: new Date(now.getFullYear(), 0, 1), end: now };
      default:
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();

      // Fetch invoices (revenue)
      const { data: invoices } = await supabase
        .from("invoices")
        .select("total_amount, status")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      // Fetch expenses
      const { data: expenses } = await supabase
        .from("expenses")
        .select("amount, category, is_cogs, approval_status")
        .gte("expense_date", format(start, "yyyy-MM-dd"))
        .lte("expense_date", format(end, "yyyy-MM-dd"));

      // Fetch bills — full bill amount counts toward COGS
      const { data: periodBills } = await (supabase as any)
        .from("bills")
        .select("amount, bill_date")
        .gte("bill_date", format(start, "yyyy-MM-dd"))
        .lte("bill_date", format(end, "yyyy-MM-dd"));

      // Fetch dispatches count
      const { count: dispatchCount } = await supabase
        .from("dispatches")
        .select("*", { count: "exact", head: true })
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      // Calculate P&L
      const revenue = (invoices || []).reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
      const approvedExpenses = (expenses || []).filter(e => e.approval_status === "approved");
      const billsCogs = ((periodBills as any[]) || []).reduce((sum: number, bill: any) => sum + Number(bill.amount || 0), 0);
      const cogs = approvedExpenses.filter(e => e.is_cogs).reduce((sum, e) => sum + Number(e.amount || 0), 0) + billsCogs;
      const operatingExpenses = approvedExpenses.filter(e => !e.is_cogs).reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const grossProfit = revenue - cogs;
      const netProfit = grossProfit - operatingExpenses;
      const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
      const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

      setPLData({
        revenue,
        cogs,
        grossProfit,
        operatingExpenses,
        netProfit,
        grossMargin,
        netMargin,
      });

      setDispatches(dispatchCount || 0);
      setInvoiceCount(invoices?.length || 0);

      // Build expense breakdown
      const breakdown = new Map<string, number>();
      (expenses || []).filter(e => !e.is_cogs && e.approval_status === "approved").forEach(e => {
        const current = breakdown.get(e.category) || 0;
        breakdown.set(e.category, current + Number(e.amount));
      });
      setExpenseBreakdown(
        Array.from(breakdown.entries())
          .map(([category, amount]) => ({ category, amount }))
          .sort((a, b) => b.amount - a.amount)
      );

      // Fetch monthly trend (last 6 months) + targets
      const now = new Date();
      const targetMonths = Array.from({ length: 6 }, (_, i) => {
        const d = subMonths(now, 5 - i);
        return { year: d.getFullYear(), month: d.getMonth() + 1 };
      });
      const { data: targetsData } = await supabase
        .from("financial_targets")
        .select("target_year, target_month, revenue_target, profit_target")
        .eq("target_type", "monthly")
        .in("target_year", [...new Set(targetMonths.map(t => t.year))])
        .in("target_month", [...new Set(targetMonths.map(t => t.month))]);

      const targetMap = new Map<string, { revenueTarget: number; profitTarget: number }>();
      (targetsData || []).forEach((t: any) => {
        targetMap.set(`${t.target_year}-${t.target_month}`, {
          revenueTarget: Number(t.revenue_target || 0),
          profitTarget: Number(t.profit_target || 0),
        });
      });

      const monthlyPL: MonthlyPL[] = [];
      for (let i = 5; i >= 0; i--) {
        const monthStart = startOfMonth(subMonths(now, i));
        const monthEnd = endOfMonth(subMonths(now, i));

        const { data: monthInvoices } = await supabase
          .from("invoices")
          .select("total_amount")
          .gte("created_at", monthStart.toISOString())
          .lte("created_at", monthEnd.toISOString());

        const [{ data: monthExpenses }, { data: monthBills }] = await Promise.all([
          supabase
            .from("expenses")
            .select("amount, is_cogs, approval_status")
            .gte("expense_date", format(monthStart, "yyyy-MM-dd"))
            .lte("expense_date", format(monthEnd, "yyyy-MM-dd")),
          (supabase as any)
            .from("bills")
            .select("amount, bill_date")
            .gte("bill_date", format(monthStart, "yyyy-MM-dd"))
            .lte("bill_date", format(monthEnd, "yyyy-MM-dd")),
        ]);

        const approvedMonthExpenses = (monthExpenses || []).filter(e => e.approval_status === "approved");
        const monthBillsCogs = ((monthBills as any[]) || []).reduce((sum: number, bill: any) => sum + Number(bill.amount || 0), 0);
        const monthRevenue = (monthInvoices || []).reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
        const monthCogs = approvedMonthExpenses.filter(e => e.is_cogs).reduce((sum, e) => sum + Number(e.amount || 0), 0) + monthBillsCogs;
        const monthOpex = approvedMonthExpenses.filter(e => !e.is_cogs).reduce((sum, e) => sum + Number(e.amount || 0), 0);
        const monthGrossProfit = monthRevenue - monthCogs;
        const monthNetProfit = monthGrossProfit - monthOpex;
        const targetKey = `${monthStart.getFullYear()}-${monthStart.getMonth() + 1}`;
        const target = targetMap.get(targetKey);

        monthlyPL.push({
          month: format(monthStart, "MMM"),
          revenue: monthRevenue,
          cogs: monthCogs,
          grossProfit: monthGrossProfit,
          expenses: monthOpex,
          netProfit: monthNetProfit,
          revenueTarget: target?.revenueTarget || 0,
          netProfitTarget: target?.profitTarget || 0,
        });
      }
      setMonthlyData(monthlyPL);

    } catch (error) {
      console.error("Error fetching P&L data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatCompact = (amount: number) => {
    if (amount >= 1000000) return `₦${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `₦${(amount / 1000).toFixed(0)}K`;
    return `₦${amount.toFixed(0)}`;
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(18);
    doc.text("Profit & Loss Statement", pageWidth / 2, 20, { align: "center" });

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Period: ${period === "current" ? "Current Month" : period === "last" ? "Last Month" : period}`, pageWidth / 2, 28, { align: "center" });

    const tableData = [
      ["Revenue", formatCurrency(plData.revenue)],
      ["Cost of Goods Sold (COGS)", `(${formatCurrency(plData.cogs)})`],
      ["Gross Profit", formatCurrency(plData.grossProfit)],
      ["Operating Expenses", `(${formatCurrency(plData.operatingExpenses)})`],
      ["Net Profit", formatCurrency(plData.netProfit)],
      ["", ""],
      ["Gross Margin", `${plData.grossMargin.toFixed(1)}%`],
      ["Net Margin", `${plData.netMargin.toFixed(1)}%`],
    ];

    autoTable(doc, {
      startY: 40,
      head: [["Item", "Amount"]],
      body: tableData,
      styles: { fontSize: 11 },
      headStyles: { fillColor: [59, 130, 246] },
    });

    doc.save("profit-loss-statement.pdf");
  };

  if (loading) {
    return (
      <DashboardLayout title="Profit & Loss" subtitle="Loading...">
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Profit & Loss Statement"
      subtitle="Financial performance from dispatches to invoices to profit"
    >
      {/* Controls */}
      <div className="flex items-center justify-between mb-8">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-48 bg-secondary/50 border-border/50">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current">Current Month</SelectItem>
            <SelectItem value="last">Last Month</SelectItem>
            <SelectItem value="q1">Q1</SelectItem>
            <SelectItem value="ytd">Year to Date</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={handleExportPDF}>
          <Download className="w-4 h-4 mr-2" />
          Export PDF
        </Button>
      </div>

      {/* Flow Summary */}
      <div className="flex items-center justify-center gap-4 mb-8 overflow-x-auto py-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => navigate("/dispatch")}
        >
          <Package className="w-8 h-8 text-info mx-auto mb-2" />
          <p className="text-2xl font-bold">{dispatches}</p>
          <p className="text-xs text-muted-foreground">Dispatches</p>
        </motion.div>
        <ArrowRight className="w-6 h-6 text-muted-foreground flex-shrink-0" />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => navigate("/invoices")}
        >
          <FileText className="w-8 h-8 text-warning mx-auto mb-2" />
          <p className="text-2xl font-bold">{invoiceCount}</p>
          <p className="text-xs text-muted-foreground">Invoices</p>
        </motion.div>
        <ArrowRight className="w-6 h-6 text-muted-foreground flex-shrink-0" />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => navigate("/admin-analytics")}
        >
          <DollarSign className={`w-8 h-8 mx-auto mb-2 ${plData.netProfit >= 0 ? "text-success" : "text-destructive"}`} />
          <p className={`text-2xl font-bold ${plData.netProfit >= 0 ? "text-success" : "text-destructive"}`}>
            {formatCompact(plData.netProfit)}
          </p>
          <p className="text-xs text-muted-foreground">Net Profit</p>
        </motion.div>
      </div>

      {/* P&L Statement */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2"
        >
          <Card className="glass-card border-border/50">
            <CardHeader>
              <CardTitle className="text-sm font-heading">Income Statement</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableCell className="font-semibold text-success">Revenue</TableCell>
                    <TableCell className="text-right font-semibold text-success">
                      {formatCurrency(plData.revenue)}
                    </TableCell>
                  </TableRow>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableCell className="pl-8 text-muted-foreground">Cost of Goods Sold (COGS)</TableCell>
                    <TableCell className="text-right text-warning">
                      ({formatCurrency(plData.cogs)})
                    </TableCell>
                  </TableRow>
                  <TableRow className="border-border/50 bg-secondary/20 hover:bg-secondary/30">
                    <TableCell className="font-semibold">Gross Profit</TableCell>
                    <TableCell className={`text-right font-semibold ${plData.grossProfit >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(plData.grossProfit)}
                    </TableCell>
                  </TableRow>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableCell className="pl-8 text-muted-foreground">Operating Expenses</TableCell>
                    <TableCell className="text-right text-warning">
                      ({formatCurrency(plData.operatingExpenses)})
                    </TableCell>
                  </TableRow>
                  <TableRow className="border-border/50 bg-primary/10 hover:bg-primary/15">
                    <TableCell className="font-bold text-lg">Net Profit</TableCell>
                    <TableCell className={`text-right font-bold text-lg ${plData.netProfit >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(plData.netProfit)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-border/50">
                <div className="text-center p-3 bg-secondary/30 rounded-lg">
                  <p className="text-sm text-muted-foreground">Gross Margin</p>
                  <p className="text-xl font-bold">{plData.grossMargin.toFixed(1)}%</p>
                </div>
                <div className="text-center p-3 bg-secondary/30 rounded-lg">
                  <p className="text-sm text-muted-foreground">Net Margin</p>
                  <p className={`text-xl font-bold ${plData.netMargin >= 0 ? "text-success" : "text-destructive"}`}>
                    {plData.netMargin.toFixed(1)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Expense Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="glass-card border-border/50 h-full">
            <CardHeader>
              <CardTitle className="text-sm font-heading">Operating Expense Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {expenseBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No expenses recorded</p>
              ) : (
                <div className="space-y-3">
                  {expenseBreakdown.slice(0, 8).map((expense, index) => (
                    <div key={expense.category} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-4">{index + 1}</span>
                        <span className="text-sm capitalize">{expense.category.replace("_", " ")}</span>
                      </div>
                      <span className="text-sm font-medium">{formatCompact(expense.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Monthly Trend */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="text-sm font-heading">6-Month P&L Trend vs Targets</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={monthlyData} barCategoryGap="20%" barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={formatCompact} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: "8px",
                    color: "hsl(var(--popover-foreground))",
                  }}
                  labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                  itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                  formatter={(value: number, name: string) => [formatCurrency(value), name]}
                />
                <Legend
                  wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }}
                  formatter={(value) => <span style={{ color: "hsl(var(--foreground))" }}>{value}</span>}
                />
                <ReferenceLine y={0} stroke="hsl(var(--border))" />
                <Bar dataKey="revenue" name="Revenue (Actual)" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="revenueTarget" name="Revenue (Target)" fill="hsl(var(--success) / 0.3)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="netProfit" name="Net Profit (Actual)" radius={[4, 4, 0, 0]}>
                  {monthlyData.map((entry, index) => (
                    <Cell key={index} fill={entry.netProfit >= 0 ? "hsl(var(--primary))" : "hsl(var(--destructive))"} />
                  ))}
                </Bar>
                <Bar dataKey="netProfitTarget" name="Net Profit (Target)" fill="hsl(var(--primary) / 0.25)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            {monthlyData.every(m => m.revenueTarget === 0) && (
              <p className="text-xs text-muted-foreground text-center mt-2">No targets set yet — configure them in Target Settings</p>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </DashboardLayout>
  );
};

export default ProfitLossPage;
