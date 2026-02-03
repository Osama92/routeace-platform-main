import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  AlertTriangle,
  Receipt,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface FinancialSummary {
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  outstandingBalance: number;
  overdueInvoices: number;
  averagePaymentGap: number;
  interestAccrued: number;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

interface FinancialSummaryWidgetProps {
  year?: number;
  month?: number;
}

const FinancialSummaryWidget = ({ year, month }: FinancialSummaryWidgetProps) => {
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFinancialSummary();
  }, [year, month]);

  const fetchFinancialSummary = async () => {
    try {
      setLoading(true);

      let query = supabase.from("historical_invoice_data" as any).select("*");

      if (year) {
        query = query.eq("period_year", year);
      }
      if (month) {
        query = query.eq("period_month", month);
      }

      const { data, error } = await query as any;

      if (error) throw error;

      const records = data || [];

      // Calculate summary metrics
      const totalRevenue = records.reduce((sum: number, r: any) => sum + (r.total_revenue || 0), 0);
      const totalCost = records.reduce((sum: number, r: any) => sum + (r.total_cost || 0), 0);
      const grossProfit = records.reduce((sum: number, r: any) => sum + (r.gross_profit || (r.total_revenue - r.total_cost) || 0), 0);
      const outstandingBalance = records.reduce((sum: number, r: any) => sum + (r.balance_owed || 0), 0);

      // Count overdue invoices (due date passed and not fully paid)
      const today = new Date();
      const overdueInvoices = records.filter((r: any) => {
        if (!r.due_date) return false;
        const dueDate = new Date(r.due_date);
        const isPaid = r.customer_payment_status?.toLowerCase()?.includes("paid") &&
                       !r.customer_payment_status?.toLowerCase()?.includes("not");
        return dueDate < today && !isPaid;
      }).length;

      // Average payment gap
      const gapValues = records
        .filter((r: any) => r.gap_in_payment !== null && r.gap_in_payment !== undefined)
        .map((r: any) => r.gap_in_payment);
      const averagePaymentGap = gapValues.length > 0
        ? gapValues.reduce((sum: number, v: number) => sum + v, 0) / gapValues.length
        : 0;

      // Total interest accrued
      const interestAccrued = records.reduce((sum: number, r: any) =>
        sum + (r.interest_not_paid || 0), 0
      );

      setSummary({
        totalRevenue,
        totalCost,
        grossProfit,
        outstandingBalance,
        overdueInvoices,
        averagePaymentGap: Math.round(averagePaymentGap),
        interestAccrued,
      });
    } catch (error) {
      console.error("Error fetching financial summary:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="glass-card">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!summary) {
    return null;
  }

  const profitMargin = summary.totalRevenue > 0
    ? ((summary.grossProfit / summary.totalRevenue) * 100).toFixed(1)
    : "0";

  const metrics = [
    {
      label: "Total Revenue",
      value: formatCurrency(summary.totalRevenue),
      icon: DollarSign,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      label: "Gross Profit",
      value: formatCurrency(summary.grossProfit),
      subValue: `${profitMargin}% margin`,
      icon: summary.grossProfit >= 0 ? TrendingUp : TrendingDown,
      color: summary.grossProfit >= 0 ? "text-green-500" : "text-red-500",
      bgColor: summary.grossProfit >= 0 ? "bg-green-500/10" : "bg-red-500/10",
    },
    {
      label: "Outstanding Balance",
      value: formatCurrency(summary.outstandingBalance),
      icon: Receipt,
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10",
    },
    {
      label: "Overdue Invoices",
      value: summary.overdueInvoices.toString(),
      icon: AlertTriangle,
      color: summary.overdueInvoices > 0 ? "text-red-500" : "text-green-500",
      bgColor: summary.overdueInvoices > 0 ? "bg-red-500/10" : "bg-green-500/10",
    },
    {
      label: "Avg Payment Gap",
      value: `${summary.averagePaymentGap} days`,
      icon: Clock,
      color: summary.averagePaymentGap > 30 ? "text-yellow-500" : "text-blue-500",
      bgColor: summary.averagePaymentGap > 30 ? "bg-yellow-500/10" : "bg-blue-500/10",
    },
    {
      label: "Interest Accrued",
      value: formatCurrency(summary.interestAccrued),
      icon: TrendingUp,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
  ];

  return (
    <Card className="glass-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Financial Summary</CardTitle>
            <CardDescription>
              {year && month
                ? `Overview for ${new Date(year, month - 1).toLocaleString("en", { month: "long", year: "numeric" })}`
                : year
                ? `Overview for ${year}`
                : "All-time overview from historical data"}
            </CardDescription>
          </div>
          {summary.overdueInvoices > 0 && (
            <Badge variant="destructive" className="animate-pulse">
              {summary.overdueInvoices} Overdue
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {metrics.map((metric, index) => (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`${metric.bgColor} rounded-lg p-4`}
            >
              <div className="flex items-center gap-2 mb-2">
                <metric.icon className={`w-4 h-4 ${metric.color}`} />
                <span className="text-sm text-muted-foreground">{metric.label}</span>
              </div>
              <p className={`text-xl font-bold ${metric.color}`}>{metric.value}</p>
              {metric.subValue && (
                <p className="text-xs text-muted-foreground mt-1">{metric.subValue}</p>
              )}
            </motion.div>
          ))}
        </div>

        {/* Quick Stats Row */}
        <div className="mt-4 pt-4 border-t border-border/50 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Total Cost</p>
            <p className="font-medium">{formatCurrency(summary.totalCost)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Profit Margin</p>
            <p className={`font-medium ${parseFloat(profitMargin) >= 0 ? "text-green-500" : "text-red-500"}`}>
              {profitMargin}%
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Net After Interest</p>
            <p className="font-medium">
              {formatCurrency(summary.grossProfit - summary.interestAccrued)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default FinancialSummaryWidget;
