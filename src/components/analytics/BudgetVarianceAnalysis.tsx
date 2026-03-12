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
} from "recharts";
import { ArrowUp, ArrowDown, Minus, AlertTriangle, CheckCircle, Download } from "lucide-react";
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
  const [totals, setTotals] = useState({ budgeted: 0, actual: 0, variance: 0 });
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchData();
  }, [month, year]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch selected month's approved target
      const { data: target } = await supabase
        .from("financial_targets")
        .select("*")
        .eq("target_type", "monthly")
        .eq("target_month", month)
        .eq("target_year", year)
        .eq("status", "approved")
        .maybeSingle();

      // Fetch selected month's expenses by category
      const startOfMonth = new Date(year, month - 1, 1).toISOString().split('T')[0];
      const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0];

      const { data: expenses } = await supabase
        .from("expenses")
        .select("category, amount, is_cogs")
        .gte("expense_date", startOfMonth)
        .lte("expense_date", endOfMonth);

      // Group expenses by category
      const categoryTotals: Record<string, number> = {};
      let totalActual = 0;

      expenses?.forEach((exp) => {
        const cat = exp.category;
        if (!categoryTotals[cat]) categoryTotals[cat] = 0;
        categoryTotals[cat] += Number(exp.amount);
        totalActual += Number(exp.amount);
      });

      // Separate COGS and non-COGS categories
      const cogsActual = categoryTotals["cogs"] || 0;
      const nonCogsTotal = totalActual - cogsActual;

      // Non-COGS categories split expense_target proportionally by their actual spend
      const expenseBudget = target?.expense_target || 0;
      const cogsBudget = target?.cogs_target || 0;
      const totalBudget = expenseBudget + cogsBudget;

      // Build variance data
      const varianceData: CategoryVariance[] = Object.entries(categoryTotals).map(([cat, actual]) => {
        let budgeted: number;
        if (cat === "cogs") {
          // COGS gets its own target directly
          budgeted = cogsBudget;
        } else if (nonCogsTotal > 0 && expenseBudget > 0) {
          // Allocate expense_target proportionally to each category's share of non-COGS spend
          budgeted = (actual / nonCogsTotal) * expenseBudget;
        } else {
          // No target set — treat budgeted = actual so variance = 0 (neutral)
          budgeted = actual;
        }

        const variance = budgeted - actual;
        const variancePercent = budgeted > 0 ? (variance / budgeted) * 100 : 0;

        let status: "under" | "on-target" | "over" = "on-target";
        if (variancePercent < -10) status = "over";
        else if (variancePercent > 10) status = "under";

        return {
          category: cat,
          label: expenseCategoryLabels[cat] || cat,
          budgeted,
          actual,
          variance,
          variancePercent,
          status,
        };
      });

      // Sort by variance (most over budget first)
      varianceData.sort((a, b) => a.variance - b.variance);

      setVariances(varianceData);
      setTotals({
        budgeted: totalBudget,
        actual: totalActual,
        variance: totalBudget - totalActual,
      });
    } catch (error) {
      console.error("Error fetching budget variance:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    if (Math.abs(amount) >= 1000000) return `₦${(amount / 1000000).toFixed(1)}M`;
    if (Math.abs(amount) >= 1000) return `₦${(amount / 1000).toFixed(0)}K`;
    return `₦${amount.toFixed(0)}`;
  };

  const formatFullCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "under":
        return <ArrowDown className="w-4 h-4 text-success" />;
      case "over":
        return <ArrowUp className="w-4 h-4 text-destructive" />;
      default:
        return <Minus className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string, percent: number) => {
    if (status === "over") {
      return <Badge className="bg-destructive/15 text-destructive">{Math.abs(percent).toFixed(0)}% Over</Badge>;
    }
    if (status === "under") {
      return <Badge className="bg-success/15 text-success">{percent.toFixed(0)}% Under</Badge>;
    }
    return <Badge variant="secondary">On Target</Badge>;
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' });

      // Title
      doc.setFontSize(18);
      doc.setTextColor(40);
      doc.text("Budget Variance Analysis", pageWidth / 2, 20, { align: "center" });

      // Subtitle
      doc.setFontSize(12);
      doc.setTextColor(100);
      doc.text(`${monthName} ${currentYear}`, pageWidth / 2, 28, { align: "center" });

      // Date
      doc.setFontSize(10);
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, 35, { align: "center" });

      // Summary
      doc.setFontSize(12);
      doc.setTextColor(40);
      doc.text("Summary", 14, 48);

      doc.setFontSize(10);
      doc.setTextColor(60);
      doc.text(`Total Budget: ${formatFullCurrency(totals.budgeted)}`, 14, 56);
      doc.text(`Actual Spending: ${formatFullCurrency(totals.actual)}`, 14, 63);
      doc.text(`Variance: ${formatFullCurrency(totals.variance)} (${totals.variance >= 0 ? 'Under' : 'Over'} Budget)`, 14, 70);

      const overBudgetCount = variances.filter((v) => v.status === "over").length;
      const underBudgetCount = variances.filter((v) => v.status === "under").length;
      doc.text(`Categories Over Budget: ${overBudgetCount}`, 14, 77);
      doc.text(`Categories Under Budget: ${underBudgetCount}`, 14, 84);

      // Table
      const tableData = variances.map((item) => [
        item.label,
        formatFullCurrency(item.budgeted),
        formatFullCurrency(item.actual),
        formatFullCurrency(item.variance),
        `${item.variancePercent >= 0 ? '+' : ''}${item.variancePercent.toFixed(0)}%`,
        item.status === "over" ? "Over Budget" : item.status === "under" ? "Under Budget" : "On Target",
      ]);

      autoTable(doc, {
        startY: 92,
        head: [["Category", "Budgeted", "Actual", "Variance", "% Var", "Status"]],
        body: tableData,
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [59, 130, 246], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        columnStyles: {
          5: { fontStyle: 'bold' },
        },
      });

      doc.save("budget-variance-analysis.pdf");
    } catch (error) {
      console.error("Error exporting PDF:", error);
    } finally {
      setExporting(false);
    }
  };

  const chartData = variances.map((v) => ({
    name: v.label.length > 12 ? v.label.slice(0, 12) + "..." : v.label,
    budgeted: v.budgeted,
    actual: v.actual,
    variance: v.variance,
  }));

  const overBudgetCount = variances.filter((v) => v.status === "over").length;
  const underBudgetCount = variances.filter((v) => v.status === "under").length;

  if (loading) {
    return (
      <Card className="glass-card border-border/50">
        <CardContent className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
        </CardContent>
      </Card>
    );
  }

  const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' });

  return (
    <div className="space-y-6">
      {/* Header with Export */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-heading font-semibold">Budget Variance Analysis</h3>
        <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={exporting}>
          <Download className="w-4 h-4 mr-2" />
          {exporting ? "Exporting..." : "Export PDF"}
        </Button>
      </div>

      {/* Summary Alert */}
      {overBudgetCount > 0 && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-4 bg-warning/10 border border-warning/30 rounded-lg flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-warning" />
          <div>
            <p className="font-semibold text-warning">{overBudgetCount} Categories Over Budget</p>
            <p className="text-sm text-muted-foreground">Review spending in flagged categories</p>
          </div>
        </motion.div>
      )}

      {overBudgetCount === 0 && underBudgetCount > 0 && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-4 bg-success/10 border border-success/30 rounded-lg flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-success" />
          <div>
            <p className="font-semibold text-success">All Categories Within Budget</p>
            <p className="text-sm text-muted-foreground">{underBudgetCount} categories under budget</p>
          </div>
        </motion.div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
          <p className="text-sm text-muted-foreground mb-1">{monthName} Budget</p>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(totals.budgeted)}</p>
          <Progress value={100} className="h-2 mt-2" />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-5">
          <p className="text-sm text-muted-foreground mb-1">Actual Spending</p>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(totals.actual)}</p>
          <Progress 
            value={totals.budgeted > 0 ? Math.min((totals.actual / totals.budgeted) * 100, 100) : 0} 
            className="h-2 mt-2" 
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-5">
          <p className="text-sm text-muted-foreground mb-1">Variance</p>
          <p className={`text-2xl font-bold ${totals.variance >= 0 ? 'text-success' : 'text-destructive'}`}>
            {totals.variance >= 0 ? '+' : ''}{formatCurrency(totals.variance)}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            {totals.variance >= 0 ? 'Under budget' : 'Over budget'}
          </p>
        </motion.div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="text-sm font-heading">Budget vs Actual by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} angle={-45} textAnchor="end" height={80} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--popover))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Bar dataKey="budgeted" name="Budgeted" fill="hsl(var(--primary))" opacity={0.4} radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" name="Actual" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell 
                      key={index} 
                      fill={entry.variance >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"} 
                    />
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
          <CardTitle className="text-sm font-heading">Category Variance Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Budgeted</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {variances.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No expense data for this month
                  </TableCell>
                </TableRow>
              ) : (
                variances.map((item) => (
                  <TableRow key={item.category} className="border-border/50">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(item.status)}
                        {item.label}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(item.budgeted)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.actual)}</TableCell>
                    <TableCell className={`text-right font-medium ${item.variance >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {item.variance >= 0 ? '+' : ''}{formatCurrency(item.variance)}
                    </TableCell>
                    <TableCell className="text-center">
                      {getStatusBadge(item.status, item.variancePercent)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default BudgetVarianceAnalysis;