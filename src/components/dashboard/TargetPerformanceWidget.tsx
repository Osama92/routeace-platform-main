import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Target, TrendingUp, TrendingDown, DollarSign, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TargetData {
  revenue: { target: number; actual: number; percentage: number };
  cogs: { target: number; actual: number; percentage: number };
  profit: { target: number; actual: number; percentage: number };
  expenses: { target: number; actual: number; percentage: number };
}

const TargetPerformanceWidget = () => {
  const [data, setData] = useState<TargetData | null>(null);
  const [loading, setLoading] = useState(true);
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch current month's approved target
      const { data: target } = await supabase
        .from("financial_targets")
        .select("*")
        .eq("target_type", "monthly")
        .eq("target_month", currentMonth)
        .eq("target_year", currentYear)
        .eq("status", "approved")
        .single();

      // Fetch current month's actual revenue
      const startOfMonth = new Date(currentYear, currentMonth - 1, 1).toISOString();
      const endOfMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59).toISOString();

      // First try historical_invoice_data (transactions) for most accurate figures
      const { data: transactions } = await supabase
        .from("historical_invoice_data")
        .select("total_revenue, total_cost, total_vendor_cost, gross_profit")
        .eq("period_year", currentYear)
        .eq("period_month", currentMonth);

      let actualRevenue = 0;
      let actualCogs = 0;

      if (transactions && transactions.length > 0) {
        actualRevenue = transactions.reduce((sum, t) => sum + Number(t.total_revenue || 0), 0);
        actualCogs = transactions.reduce((sum, t) =>
          sum + Number(t.total_cost || 0) + Number(t.total_vendor_cost || 0), 0);
      } else {
        // Fall back to invoices
        const { data: invoices } = await supabase
          .from("invoices")
          .select("total_amount")
          .eq("status", "paid")
          .gte("created_at", startOfMonth)
          .lte("created_at", endOfMonth);
        actualRevenue = invoices?.reduce((sum, inv) => sum + Number(inv.total_amount), 0) || 0;
      }

      const { data: expenses } = await supabase
        .from("expenses")
        .select("amount, is_cogs, approval_status")
        .gte("expense_date", startOfMonth.split('T')[0])
        .lte("expense_date", endOfMonth.split('T')[0]);

      const approvedExpenses = expenses?.filter(e => e.approval_status === "approved") || [];
      // If no transaction data for COGS, use expenses
      if (actualCogs === 0) {
        actualCogs = approvedExpenses.filter(e => e.is_cogs).reduce((sum, exp) => sum + Number(exp.amount), 0);
      }
      const actualOpex = approvedExpenses.filter(e => !e.is_cogs).reduce((sum, exp) => sum + Number(exp.amount), 0);
      const actualProfit = actualRevenue - actualCogs - actualOpex;

      if (target) {
        setData({
          revenue: {
            target: target.revenue_target,
            actual: actualRevenue,
            percentage: target.revenue_target > 0 ? (actualRevenue / target.revenue_target) * 100 : 0,
          },
          cogs: {
            target: target.cogs_target,
            actual: actualCogs,
            percentage: target.cogs_target > 0 ? (actualCogs / target.cogs_target) * 100 : 0,
          },
          profit: {
            target: target.profit_target,
            actual: actualProfit,
            percentage: target.profit_target > 0 ? (actualProfit / target.profit_target) * 100 : 0,
          },
          expenses: {
            target: target.expense_target,
            actual: actualOpex,
            percentage: target.expense_target > 0 ? (actualOpex / target.expense_target) * 100 : 0,
          },
        });
      } else {
        setData(null);
      }
    } catch (error) {
      console.error("Error fetching target data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) {
      return `₦${(amount / 1000000).toFixed(1)}M`;
    }
    if (amount >= 1000) {
      return `₦${(amount / 1000).toFixed(0)}K`;
    }
    return `₦${amount.toFixed(0)}`;
  };

  const getProgressColor = (percentage: number, isExpense: boolean = false) => {
    if (isExpense) {
      // For expenses, lower is better
      if (percentage > 100) return "bg-destructive";
      if (percentage > 80) return "bg-warning";
      return "bg-success";
    }
    // For revenue/profit, higher is better
    if (percentage >= 100) return "bg-success";
    if (percentage >= 70) return "bg-warning";
    return "bg-destructive";
  };

  if (loading) {
    return (
      <Card className="glass-card border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-heading flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            Monthly Targets
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="glass-card border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-heading flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            Monthly Targets
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No approved targets for this month
          </p>
        </CardContent>
      </Card>
    );
  }

  const monthName = new Date().toLocaleString('default', { month: 'long' });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <Card className="glass-card border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-heading flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            {monthName} Target Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Revenue */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-success" />
                Revenue
              </span>
              <span className="font-medium">
                {formatCurrency(data.revenue.actual)} / {formatCurrency(data.revenue.target)}
              </span>
            </div>
            <Progress 
              value={Math.min(data.revenue.percentage, 100)} 
              className="h-2"
            />
            <p className="text-xs text-muted-foreground text-right">
              {data.revenue.percentage.toFixed(0)}% of target
            </p>
          </div>

          {/* COGS */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-warning" />
                COGS
              </span>
              <span className="font-medium">
                {formatCurrency(data.cogs.actual)} / {formatCurrency(data.cogs.target)}
              </span>
            </div>
            <Progress 
              value={Math.min(data.cogs.percentage, 100)} 
              className="h-2"
            />
            <p className="text-xs text-muted-foreground text-right">
              {data.cogs.percentage.toFixed(0)}% of budget
            </p>
          </div>

          {/* Expenses */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5 text-destructive" />
                Expenses
              </span>
              <span className="font-medium">
                {formatCurrency(data.expenses.actual)} / {formatCurrency(data.expenses.target)}
              </span>
            </div>
            <Progress 
              value={Math.min(data.expenses.percentage, 100)} 
              className="h-2"
            />
            <p className="text-xs text-muted-foreground text-right">
              {data.expenses.percentage.toFixed(0)}% of budget
            </p>
          </div>

          {/* Net Profit */}
          <div className="pt-2 border-t border-border/50 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 font-semibold">
                <DollarSign className="w-3.5 h-3.5 text-primary" />
                Net Profit
              </span>
              <span className={`font-bold ${data.profit.actual >= 0 ? 'text-success' : 'text-destructive'}`}>
                {formatCurrency(data.profit.actual)} / {formatCurrency(data.profit.target)}
              </span>
            </div>
            <Progress 
              value={Math.min(Math.max(data.profit.percentage, 0), 100)} 
              className="h-2"
            />
            <p className="text-xs text-muted-foreground text-right">
              {data.profit.percentage.toFixed(0)}% of target
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default TargetPerformanceWidget;
