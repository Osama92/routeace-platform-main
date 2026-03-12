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
    avgTransitDays: 0,       // actual average days in transit (delivered dispatches MTD)
    avgTargetDays: 0,        // average route ETA days (target) for those same dispatches
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

      // Revenue MTD — use invoice_date for consistent attribution across all screens
      let revenueMtd = 0;
      let totalCostMtd = 0;

      const mtdStart = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
      const mtdEnd = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${new Date(currentYear, currentMonth, 0).getDate()}`;

      const { data: invoices } = await supabase
        .from("invoices")
        .select("total_amount")
        .gte("invoice_date", mtdStart)
        .lte("invoice_date", mtdEnd);
      revenueMtd = (invoices || []).reduce((sum, r: any) => sum + Number(r.total_amount || 0), 0);

      // Costs from approved expenses MTD
      const { data: expensesMtd } = await supabase
        .from("expenses")
        .select("amount")
        .gte("expense_date", mtdStart)
        .lte("expense_date", mtdEnd)
        .eq("approval_status", "approved");
      totalCostMtd = (expensesMtd || []).reduce((sum, e: any) => sum + Number(e.amount || 0), 0);

      // Distance MTD — sum of total_distance_km (To & Fro) for ALL dispatches
      // created this month (regardless of status), excluding historical imports.
      // total_distance_km = distance_km * 2 (set at dispatch creation/edit)
      // Falls back to distance_km * 2 for older dispatches where total_distance_km is null
      const { data: allDispatches } = await supabase
        .from("dispatches")
        .select("total_distance_km, distance_km, cost")
        .neq("is_historical", true)
        .gte("created_at", start);

      // Sum Total Distance (To & Fro) for all dispatches created this month
      let totalDistanceKm = (allDispatches || []).reduce((sum, r: any) => {
        const dist = r.total_distance_km ?? (r.distance_km ? Number(r.distance_km) * 2 : 0);
        return sum + Number(dist);
      }, 0);

      // If no dispatch distance data, try historical_invoice_data as fallback
      if (totalDistanceKm === 0) {
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
        const totalCost = (allDispatches || []).reduce((sum, r: any) => sum + Number(r.cost || 0), 0);
        avgCostPerKm = totalDistanceKm > 0 ? totalCost / totalDistanceKm : 0;
      }

      // OTD: measure avg actual transit days vs avg route target days for delivered dispatches MTD
      const DEFAULT_ETA_DAYS = 2;

      const { data: deliveredWithDates } = await supabase
        .from("dispatches")
        .select("id, actual_pickup, scheduled_pickup, actual_delivery, created_at, routes:route_id (estimated_duration_hours)")
        .eq("status", "delivered")
        .gte("created_at", start);

      let totalTransitDays = 0;
      let totalTargetDays = 0;
      let deliveryCount = 0;

      (deliveredWithDates || []).forEach((dispatch: any) => {
        const startDate = dispatch.actual_pickup || dispatch.scheduled_pickup || dispatch.created_at;
        const deliveryDate = dispatch.actual_delivery;
        const routeRow = Array.isArray(dispatch.routes) ? dispatch.routes[0] : dispatch.routes;
        const routeEtaDays = routeRow?.estimated_duration_hours;

        if (startDate && deliveryDate) {
          const msInTransit = new Date(deliveryDate).getTime() - new Date(startDate).getTime();
          if (msInTransit < 0) return; // skip bad data
          deliveryCount++;
          totalTransitDays += Math.ceil(msInTransit / (1000 * 60 * 60 * 24));
          totalTargetDays += routeEtaDays ? Number(routeEtaDays) : DEFAULT_ETA_DAYS;
        }
      });

      const avgTransitDays = deliveryCount > 0
        ? Math.round((totalTransitDays / deliveryCount) * 10) / 10
        : 0;
      const avgTargetDays = deliveryCount > 0
        ? Math.round((totalTargetDays / deliveryCount) * 10) / 10
        : DEFAULT_ETA_DAYS;

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
        avgTransitDays,
        avgTargetDays,
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
          title: "Avg Transit Days (MTD)",
          value: kpis.avgTransitDays > 0 ? `${kpis.avgTransitDays}d` : "—",
          change: kpis.avgTransitDays > 0
            ? `Target: ${kpis.avgTargetDays}d — ${kpis.avgTransitDays <= kpis.avgTargetDays ? "On Track" : `+${(kpis.avgTransitDays - kpis.avgTargetDays).toFixed(1)}d over`}`
            : "No deliveries yet",
          changeType: kpis.avgTransitDays === 0 ? "neutral" as const
            : kpis.avgTransitDays <= kpis.avgTargetDays ? "positive" as const
            : kpis.avgTransitDays <= kpis.avgTargetDays + 1 ? "neutral" as const
            : "negative" as const,
          icon: Clock,
          link: "/dispatch",
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
