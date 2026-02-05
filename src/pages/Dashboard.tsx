import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import MetricCard from "@/components/dashboard/MetricCard";
import RecentShipments from "@/components/dashboard/RecentShipments";
import DeliveryChart from "@/components/dashboard/DeliveryChart";
import ActiveDrivers from "@/components/dashboard/ActiveDrivers";
import LiveMap from "@/components/dashboard/LiveMap";
import TargetPerformanceWidget from "@/components/dashboard/TargetPerformanceWidget";
import PendingApprovalsWidget from "@/components/dashboard/PendingApprovalsWidget";
import PendingUserApprovalsWidget from "@/components/dashboard/PendingUserApprovalsWidget";
import HistoricalComparisonWidget from "@/components/dashboard/HistoricalComparisonWidget";
import { Package, Truck, MapPin, DollarSign, Clock, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const formatCurrencyCompact = (amount: number) => {
  if (amount >= 1_000_000) return `₦${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `₦${(amount / 1_000).toFixed(0)}K`;
  return `₦${amount.toFixed(0)}`;
};

const formatNumberCompact = (value: number) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return `${Math.round(value)}`;
};

const startOfMonthISO = () => {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  return start.toISOString();
};

const Dashboard = () => {
  const { userRole } = useAuth();
  const hideFinancialData = userRole === "operations";

  const [kpis, setKpis] = useState({
    activeShipments: 0,
    onTimeRate: 0,
    fleetUtilizationText: "—",
    totalDistanceKm: 0,
    revenueMtd: 0,
    avgCostPerKm: 0,
  });

  useEffect(() => {
    const fetchKpis = async () => {
      const start = startOfMonthISO();
      const currentMonth = new Date().getMonth() + 1;
      const currentYear = new Date().getFullYear();

      // Active shipments (not delivered/cancelled)
      const { count: activeCount } = await supabase
        .from("dispatches")
        .select("id", { count: "exact", head: true })
        .not("status", "in", "(delivered,cancelled)");

      // Revenue MTD - First try historical_invoice_data (transactions), then fall back to invoices
      let revenueMtd = 0;
      let totalCostMtd = 0;

      // Try historical_invoice_data first (more comprehensive)
      const { data: transactions } = await supabase
        .from("historical_invoice_data")
        .select("total_revenue, total_cost, total_vendor_cost")
        .eq("period_year", currentYear)
        .eq("period_month", currentMonth);

      if (transactions && transactions.length > 0) {
        revenueMtd = transactions.reduce((sum, t: any) => sum + Number(t.total_revenue || 0), 0);
        totalCostMtd = transactions.reduce((sum, t: any) =>
          sum + Number(t.total_cost || 0) + Number(t.total_vendor_cost || 0), 0);
      } else {
        // Fall back to invoices if no transaction data
        const { data: invoices } = await supabase
          .from("invoices")
          .select("total_amount")
          .gte("created_at", start);
        revenueMtd = (invoices || []).reduce((sum, r: any) => sum + Number(r.total_amount || 0), 0);
      }

      // Distance MTD (sum delivered dispatches this month) - primary source
      // Using total_distance_km which includes return distance, falling back to distance_km
      // Filter by updated_at since that's when the dispatch was marked as delivered
      const { data: delivered } = await supabase
        .from("dispatches")
        .select("distance_km, total_distance_km, cost")
        .eq("status", "delivered")
        .gte("updated_at", start);

      // Calculate total distance from dispatches (authoritative source)
      // Prefer total_distance_km (includes return), fall back to distance_km
      let totalDistanceKm = (delivered || []).reduce((sum, r: any) =>
        sum + Number(r.total_distance_km || r.distance_km || 0), 0);

      // If no dispatch distance data, try historical_invoice_data as fallback
      if (totalDistanceKm === 0 && transactions && transactions.length > 0) {
        const { data: transactionsWithDistance } = await supabase
          .from("historical_invoice_data")
          .select("km_covered")
          .eq("period_year", currentYear)
          .eq("period_month", currentMonth);
        totalDistanceKm = (transactionsWithDistance || []).reduce((sum, t: any) =>
          sum + Number(t.km_covered || 0), 0);
      }

      // Calculate average cost per km from transaction data or dispatches
      let avgCostPerKm = 0;
      if (totalCostMtd > 0 && totalDistanceKm > 0) {
        avgCostPerKm = totalCostMtd / totalDistanceKm;
      } else {
        const totalCost = (delivered || []).reduce((sum, r: any) => sum + Number(r.cost || 0), 0);
        avgCostPerKm = totalDistanceKm > 0 ? totalCost / totalDistanceKm : 0;
      }

      // Completion rate - count dispatches delivered this month vs total created this month
      // Use updated_at for delivered count (when status changed to delivered)
      const { count: deliveredCount } = await supabase
        .from("dispatches")
        .select("id", { count: "exact", head: true })
        .eq("status", "delivered")
        .gte("updated_at", start);

      const { count: totalDispatchCount } = await supabase
        .from("dispatches")
        .select("id", { count: "exact", head: true })
        .gte("created_at", start)
        .not("status", "eq", "cancelled");

      // Completion rate = delivered this month / total created this month
      const onTimeRate = totalDispatchCount && totalDispatchCount > 0
        ? ((deliveredCount || 0) / totalDispatchCount) * 100
        : 0;

      // Fleet utilization: vehicles currently assigned to active dispatches / total available/in_use vehicles
      const { count: totalVehicles } = await supabase
        .from("vehicles")
        .select("id", { count: "exact", head: true })
        .in("status", ["available", "in_use"]);

      const { data: activeDispatchVehicles } = await supabase
        .from("dispatches")
        .select("vehicle_id")
        .in("status", ["assigned", "in_transit"])
        .not("vehicle_id", "is", null);

      const uniqueVehiclesInUse = new Set((activeDispatchVehicles || []).map((d: any) => d.vehicle_id)).size;
      const fleetUtilization = totalVehicles && totalVehicles > 0
        ? Math.round((uniqueVehiclesInUse / totalVehicles) * 100)
        : 0;
      const fleetUtilizationText = totalVehicles && totalVehicles > 0
        ? `${fleetUtilization}%`
        : "No fleet";

      setKpis({
        activeShipments: activeCount || 0,
        onTimeRate,
        fleetUtilizationText,
        totalDistanceKm,
        revenueMtd,
        avgCostPerKm,
      });
    };

    fetchKpis();
  }, []);

  const metrics = useMemo(
    () => {
      const allMetrics = [
        {
          title: "Active Shipments",
          value: String(kpis.activeShipments),
          change: "Live",
          changeType: "neutral" as const,
          icon: Package,
          link: "/dispatch",
          isFinancial: false,
        },
        {
          title: "On-Time Delivery (MTD)",
          value: `${kpis.onTimeRate.toFixed(1)}%`,
          change: "This month",
          changeType: "positive" as const,
          icon: Clock,
          link: "/driver-performance",
          isFinancial: false,
        },
        {
          title: "Fleet Utilization",
          value: kpis.fleetUtilizationText,
          change: "Active vehicles",
          changeType: "neutral" as const,
          icon: Truck,
          link: "/fleet",
          isFinancial: false,
        },
        {
          title: "Total Distance (MTD)",
          value: `${formatNumberCompact(kpis.totalDistanceKm)} km`,
          change: "Delivered",
          changeType: "positive" as const,
          icon: MapPin,
          link: "/tracking",
          isFinancial: false,
        },
        {
          title: "Revenue (MTD)",
          value: formatCurrencyCompact(kpis.revenueMtd),
          change: "Invoices raised",
          changeType: "positive" as const,
          icon: DollarSign,
          link: "/profit-loss",
          isFinancial: true,
        },
        {
          title: "Avg. Cost/KM (MTD)",
          value: kpis.avgCostPerKm ? `₦${Math.round(kpis.avgCostPerKm)}` : "₦0",
          change: "Delivered",
          changeType: "neutral" as const,
          icon: TrendingUp,
          link: "/expenses",
          isFinancial: true,
        },
      ];

      // Filter out financial metrics for Operations role
      return hideFinancialData
        ? allMetrics.filter((m) => !m.isFinancial)
        : allMetrics;
    },
    [kpis, hideFinancialData]
  );

  return (
    <DashboardLayout title="Dashboard" subtitle="Overview of your logistics operations">
      {/* Metrics Grid */}
      <div className={`dashboard-stats-grid grid gap-3 sm:gap-4 mb-6 sm:mb-8 ${
        hideFinancialData
          ? "grid-cols-2 sm:grid-cols-2 lg:grid-cols-4"
          : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
      }`}>
        {metrics.map((metric, index) => (
          <MetricCard key={metric.title} {...metric} index={index} />
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="dashboard-revenue-chart grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
        <div className="xl:col-span-2">
          <DeliveryChart />
        </div>
        <div className="min-h-[300px]">
          <LiveMap />
        </div>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
        <div className="dashboard-recent-activity xl:col-span-2 overflow-x-auto">
          <RecentShipments />
        </div>
        <div className="space-y-4 sm:space-y-6">
          {userRole === "admin" && <PendingUserApprovalsWidget />}
          <HistoricalComparisonWidget />
          {userRole === "admin" && <PendingApprovalsWidget />}
          {!hideFinancialData && <TargetPerformanceWidget />}
          <ActiveDrivers />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
