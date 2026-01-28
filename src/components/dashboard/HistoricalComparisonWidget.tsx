import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, BarChart3, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, subYears, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear } from "date-fns";

interface MetricData {
  label: string;
  current: number;
  previous: number;
  trend: number;
  format: 'currency' | 'number' | 'distance';
}

const formatValue = (value: number, type: 'currency' | 'number' | 'distance'): string => {
  switch (type) {
    case 'currency':
      if (value >= 1000000) {
        return `₦${(value / 1000000).toFixed(1)}M`;
      }
      if (value >= 1000) {
        return `₦${(value / 1000).toFixed(0)}K`;
      }
      return `₦${value.toFixed(0)}`;
    case 'distance':
      if (value >= 1000) {
        return `${(value / 1000).toFixed(1)}K km`;
      }
      return `${value.toFixed(0)} km`;
    default:
      return value.toLocaleString();
  }
};

const HistoricalComparisonWidget = () => {
  const [loading, setLoading] = useState(true);
  const [comparisonPeriod, setComparisonPeriod] = useState<"month" | "quarter" | "year">("month");
  const [metrics, setMetrics] = useState<MetricData[]>([]);
  const [currentPeriodLabel, setCurrentPeriodLabel] = useState("");
  const [previousPeriodLabel, setPreviousPeriodLabel] = useState("");

  const fetchComparisonData = async () => {
    setLoading(true);
    try {
      const now = new Date();
      let currentStart: Date, currentEnd: Date, lastYearStart: Date, lastYearEnd: Date;

      switch (comparisonPeriod) {
        case "month":
          currentStart = startOfMonth(now);
          currentEnd = endOfMonth(now);
          lastYearStart = startOfMonth(subYears(now, 1));
          lastYearEnd = endOfMonth(subYears(now, 1));
          setCurrentPeriodLabel(format(now, "MMMM yyyy"));
          setPreviousPeriodLabel(format(subYears(now, 1), "MMMM yyyy"));
          break;
        case "quarter":
          currentStart = startOfQuarter(now);
          currentEnd = endOfQuarter(now);
          lastYearStart = startOfQuarter(subYears(now, 1));
          lastYearEnd = endOfQuarter(subYears(now, 1));
          setCurrentPeriodLabel(`Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear()}`);
          setPreviousPeriodLabel(`Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear() - 1}`);
          break;
        case "year":
          currentStart = startOfYear(now);
          currentEnd = now;
          lastYearStart = startOfYear(subYears(now, 1));
          lastYearEnd = subYears(now, 1);
          setCurrentPeriodLabel(`YTD ${now.getFullYear()}`);
          setPreviousPeriodLabel(`YTD ${now.getFullYear() - 1}`);
          break;
      }

      // Fetch current period dispatches
      const { data: currentDispatches, error: currentDispatchErr } = await supabase
        .from("dispatches")
        .select("id, distance_km, cost")
        .eq("status", "delivered")
        .gte("created_at", currentStart.toISOString())
        .lte("created_at", currentEnd.toISOString());

      if (currentDispatchErr) throw currentDispatchErr;

      // Fetch current period invoices
      const { data: currentInvoices, error: currentInvoiceErr } = await supabase
        .from("invoices")
        .select("total_amount")
        .gte("created_at", currentStart.toISOString())
        .lte("created_at", currentEnd.toISOString());

      if (currentInvoiceErr) throw currentInvoiceErr;

      // Try to fetch historical data first (for revenue/trips summary)
      const { data: historicalData } = await supabase
        .from("historical_invoice_data")
        .select("trips_count, total_revenue, total_cost, total_distance")
        .eq("period_year", lastYearStart.getFullYear())
        .gte("period_month", lastYearStart.getMonth() + 1)
        .lte("period_month", lastYearEnd.getMonth() + 1);

      let previousRevenue = 0;
      let previousTrips = 0;
      let previousDistance = 0;

      // Always try to get actual dispatch data from last year for accurate distance
      const { data: lastYearDispatches } = await supabase
        .from("dispatches")
        .select("id, distance_km, cost")
        .eq("status", "delivered")
        .gte("created_at", lastYearStart.toISOString())
        .lte("created_at", lastYearEnd.toISOString());

      const { data: lastYearInvoices } = await supabase
        .from("invoices")
        .select("total_amount")
        .gte("created_at", lastYearStart.toISOString())
        .lte("created_at", lastYearEnd.toISOString());

      // Use historical summary data if available, otherwise fall back to dispatch data
      if (historicalData && historicalData.length > 0) {
        previousRevenue = historicalData.reduce((sum, d) => sum + (d.total_revenue || 0), 0);
        previousTrips = historicalData.reduce((sum, d) => sum + (d.trips_count || 0), 0);
        // Use total_distance from historical data if available, otherwise calculate from dispatches
        const historicalDistance = historicalData.reduce((sum, d) => sum + (d.total_distance || 0), 0);
        previousDistance = historicalDistance > 0
          ? historicalDistance
          : (lastYearDispatches || []).reduce((sum, d) => sum + (d.distance_km || 0), 0);
      } else {
        // Use dispatch data directly
        previousRevenue = (lastYearInvoices || []).reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
        previousTrips = (lastYearDispatches || []).length;
        previousDistance = (lastYearDispatches || []).reduce((sum, d) => sum + (d.distance_km || 0), 0);
      }

      // Calculate current metrics
      const currentRevenue = (currentInvoices || []).reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
      const currentTrips = (currentDispatches || []).length;
      const currentDistance = (currentDispatches || []).reduce((sum, d) => sum + (d.distance_km || 0), 0);
      const currentAvgRevenue = currentTrips > 0 ? currentRevenue / currentTrips : 0;
      const previousAvgRevenue = previousTrips > 0 ? previousRevenue / previousTrips : 0;

      // Calculate trends
      const calculateTrend = (current: number, previous: number): number => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return Math.round(((current - previous) / previous) * 100);
      };

      setMetrics([
        {
          label: "Revenue",
          current: currentRevenue,
          previous: previousRevenue,
          trend: calculateTrend(currentRevenue, previousRevenue),
          format: 'currency'
        },
        {
          label: "Trips Completed",
          current: currentTrips,
          previous: previousTrips,
          trend: calculateTrend(currentTrips, previousTrips),
          format: 'number'
        },
        {
          label: "Distance Covered",
          current: currentDistance,
          previous: previousDistance,
          trend: calculateTrend(currentDistance, previousDistance),
          format: 'distance'
        },
        {
          label: "Avg. Revenue/Trip",
          current: currentAvgRevenue,
          previous: previousAvgRevenue,
          trend: calculateTrend(currentAvgRevenue, previousAvgRevenue),
          format: 'currency'
        }
      ]);
    } catch (error) {
      console.error("Failed to fetch comparison data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComparisonData();
  }, [comparisonPeriod]);

  const TrendBadge = ({ trend }: { trend: number }) => {
    if (trend === 0) {
      return (
        <Badge variant="outline" className="flex items-center gap-1">
          <Minus className="w-3 h-3" />
          0%
        </Badge>
      );
    }
    return trend > 0 ? (
      <Badge className="flex items-center gap-1 bg-green-500/15 text-green-600 hover:bg-green-500/20">
        <TrendingUp className="w-3 h-3" />
        +{trend}%
      </Badge>
    ) : (
      <Badge className="flex items-center gap-1 bg-destructive/15 text-destructive hover:bg-destructive/20">
        <TrendingDown className="w-3 h-3" />
        {trend}%
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="w-5 h-5 text-primary" />
            Year-over-Year Comparison
          </CardTitle>
          <Select value={comparisonPeriod} onValueChange={(v: "month" | "quarter" | "year") => setComparisonPeriod(v)}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">This Quarter</SelectItem>
              <SelectItem value="year">YTD</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <CardDescription className="text-xs">
          Comparing {currentPeriodLabel} vs {previousPeriodLabel}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {metrics.map((metric) => (
              <div key={metric.label} className="space-y-1">
                <p className="text-xs text-muted-foreground">{metric.label}</p>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold">
                    {formatValue(metric.current, metric.format)}
                  </span>
                  <TrendBadge trend={metric.trend} />
                </div>
                <p className="text-xs text-muted-foreground">
                  vs {formatValue(metric.previous, metric.format)} last year
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default HistoricalComparisonWidget;
