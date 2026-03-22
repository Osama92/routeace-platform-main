import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
} from "recharts";
import { ArrowUp, ArrowDown, Minus, AlertTriangle, CheckCircle, Download, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface CategoryVariance {
  category: string;
  label: string;
  budgeted: number;
  actual: number;
  variance: number;
  variancePercent: number;
  status: "under" | "on-target" | "over";
}

const expenseCategoryLabels: Record<string, string> = {
  cogs: "Cost of Goods Sold",
  fuel: "Fuel",
  maintenance: "Maintenance",
  driver_salary: "Driver Salary",
  insurance: "Insurance",
  tolls: "Tolls",
  parking: "Parking",
  repairs: "Repairs",
  administrative: "Administrative",
  marketing: "Marketing",
  utilities: "Utilities",
  rent: "Rent",
  equipment: "Equipment",
  other: "Other",
};

interface Props {
  month: number;
  year: number;
}

const BudgetVarianceAnalysis = ({ month, year }: Props) => {
  const [variances, setVariances] = useState<CategoryVariance[]>([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({
    revenueBudget: 0,
    revenueActual: 0,
    expenseBudget: 0,   // cogs_target + expense_target combined
    expenseActual: 0,
    profitBudget: 0,
    profitActual: 0,
    variance: 0,
  });
  const [hasTarget, setHasTarget] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchData();
  }, [month, year]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const startOfMonth = new Date(year, month - 1, 1).toISOString().split("T")[0];
      const endOfMonth = new Date(year, month, 0).toISOString().split("T")[0];

      // Fetch approved target for this month
      const { data: target } = await supabase
        .from("financial_targets")
        .select("*")
        .eq("target_type", "monthly")
        .eq("target_month", month)
        .eq("target_year", year)
        .eq("status", "approved")
        .maybeSingle();

      // Fetch approved expenses only
      const { data: expenses } = await supabase
        .from("expenses")
        .select("category, amount, is_cogs")
        .gte("expense_date", startOfMonth)
        .lte("expense_date", endOfMonth)
        .eq("approval_status", "approved");

      // Fetch actual revenue (approved invoices by invoice_date)
      const { data: invoices } = await supabase
        .from("invoices")
        .select("total_amount")
        .gte("invoice_date", startOfMonth)
        .lte("invoice_date", endOfMonth);

      // --- Actuals ---
      const categoryTotals: Record<string, number> = {};
      let totalExpenseActual = 0;
      let cogsActual = 0;

      (expenses || []).forEach((exp) => {
        const cat = exp.is_cogs ? "cogs" : exp.category;
        categoryTotals[cat] = (categoryTotals[cat] || 0) + Number(exp.amount);
        totalExpenseActual += Number(exp.amount);
        if (exp.is_cogs) cogsActual += Number(exp.amount);
      });

      const revenueActual = (invoices || []).reduce((s, inv) => s + Number(inv.total_amount), 0);
      const profitActual = revenueActual - totalExpenseActual;

      // --- Budgets from target ---
      const revenueBudget = Number(target?.revenue_target || 0);
      const cogsBudget = Number(target?.cogs_target || 0);
      const expenseBudget = Number(target?.expense_target || 0);   // non-COGS opex budget
      const profitBudget = Number(target?.profit_target || 0);
      const totalExpenseBudget = cogsBudget + expenseBudget;

      setHasTarget(!!target);

      // --- Per-category variance ---
      // COGS: use cogs_target directly
      // Non-COGS: if expense_target > 0 and we have actuals, distribute expense_target proportionally
      //           by actual share (best we can do without per-category targets)
      //           If no actuals yet, each category gets equal share of expense_target
      const nonCogsActual = totalExpenseActual - cogsActual;
      const nonCogsCategories = Object.entries(categoryTotals).filter(([cat]) => cat !== "cogs");

      const varianceData: CategoryVariance[] = [];

      // COGS row
      if (categoryTotals["cogs"] !== undefined || cogsBudget > 0) {
        const actual = categoryTotals["cogs"] || 0;
        const budgeted = cogsBudget;
        const variance = budgeted - actual;
        const variancePercent = budgeted > 0 ? (variance / budgeted) * 100 : actual > 0 ? -100 : 0;
        varianceData.push({
          category: "cogs",
          label: "Cost of Goods Sold",
          budgeted,
          actual,
          variance,
          variancePercent,
          status: variancePercent < -10 ? "over" : variancePercent > 10 ? "under" : "on-target",
        });
      }

      // Non-COGS categories
      nonCogsCategories.forEach(([cat, actual]) => {
        let budgeted: number;
        if (expenseBudget > 0 && nonCogsActual > 0) {
          // Proportional share of expense_target by actual spend
          budgeted = (actual / nonCogsActual) * expenseBudget;
        } else if (expenseBudget > 0 && nonCogsCategories.length > 0) {
          // No actuals yet — equal share
          budgeted = expenseBudget / nonCogsCategories.length;
        } else {
          // No target at all — neutral
          budgeted = actual;
        }

        const variance = budgeted - actual;
        const variancePercent = budgeted > 0 ? (variance / budgeted) * 100 : actual > 0 ? -100 : 0;
        varianceData.push({
          category: cat,
          label: expenseCategoryLabels[cat] || cat,
          budgeted,
          actual,
          variance,
          variancePercent,
          status: variancePercent < -10 ? "over" : variancePercent > 10 ? "under" : "on-target",
        });
      });

      // Add categories that have a budget but zero actual spend (only if target exists)
      if (target) {
        // Revenue row is handled in totals — no per-category needed
        // If expense_target set but no non-COGS spend at all, show a placeholder
        if (expenseBudget > 0 && nonCogsCategories.length === 0) {
          varianceData.push({
            category: "_opex",
            label: "Operating Expenses (no spend yet)",
            budgeted: expenseBudget,
            actual: 0,
            variance: expenseBudget,
            variancePercent: 100,
            status: "under",
          });
        }
      }

      varianceData.sort((a, b) => a.variance - b.variance);
      setVariances(varianceData);

      setTotals({
        revenueBudget,
        revenueActual,
        expenseBudget: totalExpenseBudget,
        expenseActual: totalExpenseActual,
        profitBudget,
        profitActual,
        variance: totalExpenseBudget - totalExpenseActual,
      });
    } catch (error) {
      console.error("Error fetching budget variance:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    if (Math.abs(amount) >= 1_000_000) return `₦${(amount / 1_000_000).toFixed(1)}M`;
    if (Math.abs(amount) >= 1_000) return `₦${(amount / 1_000).toFixed(0)}K`;
    return `₦${Math.round(amount).toLocaleString()}`;
  };

  const formatFullCurrency = (amount: number) =>
    new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

  const getStatusIcon = (status: string) => {
    if (status === "under") return <ArrowDown className="w-4 h-4 text-success" />;
    if (status === "over") return <ArrowUp className="w-4 h-4 text-destructive" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  const getStatusBadge = (status: string, percent: number) => {
    if (status === "over") return <Badge className="bg-destructive/15 text-destructive">{Math.abs(percent).toFixed(0)}% Over</Badge>;
    if (status === "under") return <Badge className="bg-success/15 text-success">{percent.toFixed(0)}% Under</Badge>;
    return <Badge variant="secondary">On Target</Badge>;
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const monthName = new Date(year, month - 1, 1).toLocaleString("default", { month: "long" });

      doc.setFontSize(18);
      doc.setTextColor(40);
      doc.text("Budget Variance Analysis", pageWidth / 2, 20, { align: "center" });
      doc.setFontSize(12);
      doc.setTextColor(100);
      doc.text(`${monthName} ${year}`, pageWidth / 2, 28, { align: "center" });
      doc.setFontSize(10);
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, 35, { align: "center" });

      doc.setFontSize(12);
      doc.setTextColor(40);
      doc.text("Summary", 14, 48);
      doc.setFontSize(10);
      doc.setTextColor(60);
      doc.text(`Revenue Budget: ${formatFullCurrency(totals.revenueBudget)}`, 14, 56);
      doc.text(`Revenue Actual: ${formatFullCurrency(totals.revenueActual)}`, 14, 63);
      doc.text(`Expense Budget: ${formatFullCurrency(totals.expenseBudget)}`, 14, 70);
      doc.text(`Actual Spending: ${formatFullCurrency(totals.expenseActual)}`, 14, 77);
      doc.text(`Expense Variance: ${formatFullCurrency(totals.variance)} (${totals.variance >= 0 ? "Under" : "Over"} Budget)`, 14, 84);
      doc.text(`Profit Budget: ${formatFullCurrency(totals.profitBudget)}`, 14, 91);
      doc.text(`Actual Profit: ${formatFullCurrency(totals.profitActual)}`, 14, 98);

      const tableData = variances.map((item) => [
        item.label,
        formatFullCurrency(item.budgeted),
        formatFullCurrency(item.actual),
        formatFullCurrency(item.variance),
        `${item.variancePercent >= 0 ? "+" : ""}${item.variancePercent.toFixed(0)}%`,
        item.status === "over" ? "Over Budget" : item.status === "under" ? "Under Budget" : "On Target",
      ]);

      autoTable(doc, {
        startY: 106,
        head: [["Category", "Budgeted", "Actual", "Variance", "% Var", "Status"]],
        body: tableData,
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [59, 130, 246], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
      });

      doc.save(`budget-variance-${monthName}-${year}.pdf`);
    } catch (error) {
      console.error("Error exporting PDF:", error);
    } finally {
      setExporting(false);
    }
  };

  const overBudgetCount = variances.filter((v) => v.status === "over").length;
  const underBudgetCount = variances.filter((v) => v.status === "under").length;
  const monthName = new Date(year, month - 1, 1).toLocaleString("default", { month: "long" });

  const chartData = variances.map((v) => ({
    name: v.label.length > 14 ? v.label.slice(0, 14) + "…" : v.label,
    Budgeted: Math.round(v.budgeted),
    Actual: Math.round(v.actual),
    variance: v.variance,
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
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-heading font-semibold">Budget Variance Analysis</h3>
        <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={exporting}>
          <Download className="w-4 h-4 mr-2" />
          {exporting ? "Exporting..." : "Export PDF"}
        </Button>
      </div>

      {/* No target warning */}
      {!hasTarget && (
        <div className="p-4 bg-info/10 border border-info/30 rounded-lg flex items-center gap-3">
          <Info className="w-5 h-5 text-info flex-shrink-0" />
          <div>
            <p className="font-semibold text-info">No Approved Target for {monthName} {year}</p>
            <p className="text-sm text-muted-foreground">Actual spending is shown but variance cannot be calculated. Set and approve a target in the Financial Targets tab.</p>
          </div>
        </div>
      )}

      {/* Budget alerts */}
      {hasTarget && overBudgetCount > 0 && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-4 bg-warning/10 border border-warning/30 rounded-lg flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-warning" />
          <div>
            <p className="font-semibold text-warning">{overBudgetCount} Categor{overBudgetCount > 1 ? "ies" : "y"} Over Budget</p>
            <p className="text-sm text-muted-foreground">Review spending in flagged categories</p>
          </div>
        </motion.div>
      )}
      {hasTarget && overBudgetCount === 0 && variances.length > 0 && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-4 bg-success/10 border border-success/30 rounded-lg flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-success" />
          <div>
            <p className="font-semibold text-success">All Categories Within Budget</p>
            <p className="text-sm text-muted-foreground">{underBudgetCount} categor{underBudgetCount !== 1 ? "ies" : "y"} under budget</p>
          </div>
        </motion.div>
      )}

      {/* Revenue vs Budget summary */}
      {hasTarget && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
            <p className="text-xs text-muted-foreground mb-0.5">Revenue Budget</p>
            <p className="text-xl font-bold text-foreground">{formatCurrency(totals.revenueBudget)}</p>
            <p className="text-xs text-muted-foreground mt-1">Actual: <span className={totals.revenueActual >= totals.revenueBudget ? "text-success" : "text-destructive"}>{formatCurrency(totals.revenueActual)}</span></p>
            <Progress value={totals.revenueBudget > 0 ? Math.min((totals.revenueActual / totals.revenueBudget) * 100, 100) : 0} className="h-2 mt-2" />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-5">
            <p className="text-xs text-muted-foreground mb-0.5">{monthName} Expense Budget</p>
            <p className="text-xl font-bold text-foreground">{formatCurrency(totals.expenseBudget)}</p>
            <p className="text-xs text-muted-foreground mt-1">Actual: <span className={totals.expenseActual <= totals.expenseBudget ? "text-success" : "text-destructive"}>{formatCurrency(totals.expenseActual)}</span></p>
            <Progress value={totals.expenseBudget > 0 ? Math.min((totals.expenseActual / totals.expenseBudget) * 100, 100) : 0} className="h-2 mt-2" />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-5">
            <p className="text-xs text-muted-foreground mb-0.5">Profit Budget vs Actual</p>
            <p className={`text-xl font-bold ${totals.profitBudget >= 0 ? "text-foreground" : "text-destructive"}`}>{formatCurrency(totals.profitBudget)}</p>
            <p className="text-xs text-muted-foreground mt-1">Actual: <span className={totals.profitActual >= totals.profitBudget ? "text-success" : "text-destructive"}>{formatCurrency(totals.profitActual)}</span></p>
            <p className="text-xs mt-1 font-medium">
              <span className={totals.profitActual >= totals.profitBudget ? "text-success" : "text-destructive"}>
                {totals.profitActual >= totals.profitBudget ? "+" : ""}{formatCurrency(totals.profitActual - totals.profitBudget)} vs target
              </span>
            </p>
          </motion.div>
        </div>
      )}

      {/* Actuals-only summary when no target */}
      {!hasTarget && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
            <p className="text-xs text-muted-foreground mb-0.5">Revenue (Actual)</p>
            <p className="text-xl font-bold text-success">{formatCurrency(totals.revenueActual)}</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-5">
            <p className="text-xs text-muted-foreground mb-0.5">Total Expenses (Actual)</p>
            <p className="text-xl font-bold text-foreground">{formatCurrency(totals.expenseActual)}</p>
          </motion.div>
        </div>
      )}

      {/* Chart — only meaningful when target exists */}
      {chartData.length > 0 && (
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="text-sm font-heading">
              Budget vs Actual by Category
              {!hasTarget && <span className="text-xs font-normal text-muted-foreground ml-2">(actuals only — no target set)</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} angle={-35} textAnchor="end" height={70} />
                <YAxis
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  tickFormatter={(v: number) => {
                    if (Math.abs(v) >= 1_000_000) return `₦${(v / 1_000_000).toFixed(1)}M`;
                    if (Math.abs(v) >= 1_000) return `₦${(v / 1_000).toFixed(0)}K`;
                    return `₦${v}`;
                  }}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--popover))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                  formatter={(value: number, name: string) => [formatFullCurrency(value), name]}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                {hasTarget && (
                  <Bar dataKey="Budgeted" fill="hsl(var(--primary))" opacity={0.35} radius={[4, 4, 0, 0]} />
                )}
                <Bar dataKey="Actual" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.variance >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Details Table */}
      <Card className="glass-card border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-heading">Category Breakdown — {monthName} {year}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead>Category</TableHead>
                {hasTarget && <TableHead className="text-right">Budgeted</TableHead>}
                <TableHead className="text-right">Actual (Approved)</TableHead>
                {hasTarget && <TableHead className="text-right">Variance</TableHead>}
                {hasTarget && <TableHead className="text-center">Status</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {variances.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No approved expense data for {monthName} {year}
                  </TableCell>
                </TableRow>
              ) : (
                variances.map((item) => (
                  <TableRow key={item.category} className="border-border/50">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {hasTarget && getStatusIcon(item.status)}
                        {item.label}
                      </div>
                    </TableCell>
                    {hasTarget && <TableCell className="text-right">{formatCurrency(item.budgeted)}</TableCell>}
                    <TableCell className="text-right">{formatCurrency(item.actual)}</TableCell>
                    {hasTarget && (
                      <TableCell className={`text-right font-medium ${item.variance >= 0 ? "text-success" : "text-destructive"}`}>
                        {item.variance >= 0 ? "+" : ""}{formatCurrency(item.variance)}
                      </TableCell>
                    )}
                    {hasTarget && (
                      <TableCell className="text-center">
                        {getStatusBadge(item.status, item.variancePercent)}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {hasTarget && variances.length > 0 && (
            <p className="text-xs text-muted-foreground mt-3 px-1">
              * Per-category budget is estimated proportionally from the total expense target. Set per-category targets in Financial Targets for exact allocation.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BudgetVarianceAnalysis;
