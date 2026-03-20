import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  AreaChart,
  Area,
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
  TrendingUp,
  TrendingDown,
  Truck,
  Clock,
  DollarSign,
  MapPin,
  Download,
  CalendarRange,
  ChevronDown,
  ChevronUp,
  User,
  Building2,
  Tag,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { subDays, format, startOfDay, endOfDay } from "date-fns";

const formatCurrency = (value: number) => {
  if (value >= 1000000) {
    return `₦${(value / 1000000).toFixed(1)}M`;
  }
  return `₦${(value / 1000).toFixed(0)}K`;
};

const AnalyticsPage = () => {
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();
  const { userRole } = useAuth();

  // Operations role should not see financial data
  const hideFinancialData = userRole === "operations";

  const [kpis, setKpis] = useState({
    totalDeliveries: 0,
    avgTransitDays: 0,
    avgTargetDays: 0,
    revenueMtd: 0,
    avgDistance: 0,
  });

  const [deliveryData, setDeliveryData] = useState<any[]>([]);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [fleetUtilization, setFleetUtilization] = useState<any[]>([]);
  const [delayReasons, setDelayReasons] = useState<{
    reason: string;
    count: number;
    dispatches: { id: string; dispatch_number: string; truck: string; customer: string; driver: string; vendor: string | null }[];
  }[]>([]);
  const [expandedDelayReason, setExpandedDelayReason] = useState<string | null>(null);
  const [editingVendor, setEditingVendor] = useState<{ dispatchId: string; value: string } | null>(null);
  const [idleFleet, setIdleFleet] = useState<{ id: string; registration: string; truck_type: string | null; status: string; idleReason: string }[]>([]);
  const [totalFleetCount, setTotalFleetCount] = useState(0);
  const [editingIdleReason, setEditingIdleReason] = useState<{ vehicleId: string; value: string } | null>(null);
  const [topRoutes, setTopRoutes] = useState<any[]>([]);
  const [driverPerformance, setDriverPerformance] = useState<any[]>([]);

  useEffect(() => {
    fetchAnalyticsData();
  }, [dateRange.from, dateRange.to]);

  const fetchAnalyticsData = async () => {
    if (!dateRange.from || !dateRange.to) return;
    setLoading(true);
    try {
      const start = startOfDay(dateRange.from);
      const end = endOfDay(dateRange.to);
      // Use plain date strings to avoid timezone drift — same as Dispatch page
      const startISO = format(start, "yyyy-MM-dd");
      const endISO = format(end, "yyyy-MM-dd") + "T23:59:59";

      const DEFAULT_ETA_DAYS = 2;

      // Helper: is a delivered dispatch on-time based on route ETA?
      // Start priority: actual_pickup → scheduled_pickup → created_at (covers all dispatch flows)
      const isOnTime = (d: any): boolean => {
        const startDate = d.actual_pickup || d.scheduled_pickup || d.created_at;
        const deliveryDate = d.actual_delivery;
        if (!startDate || !deliveryDate) return false;
        const msInTransit = new Date(deliveryDate).getTime() - new Date(startDate).getTime();
        if (msInTransit < 0) return false;
        // Compare actual hours against ETA hours directly — avoids Math.ceil rounding
        // e.g. 24.5 hours vs 24hr ETA → late, but 23.5 hours → on time
        const hoursInTransit = msInTransit / (1000 * 60 * 60);
        const routeRow = Array.isArray(d.routes) ? d.routes[0] : d.routes;
        const etaHours = routeRow?.estimated_duration_hours
          ? Number(routeRow.estimated_duration_hours) * 24
          : DEFAULT_ETA_DAYS * 24;
        return hoursInTransit <= etaHours;
      };

      // Fetch dispatches in date range — exclude historical (same logic as Dispatch page date filter)
      const { data: dispatches } = await supabase
        .from("dispatches")
        .select("id, status, distance_km, actual_pickup, scheduled_pickup, actual_delivery, pickup_address, delivery_address, created_at, vehicle_id, is_historical, delay_reason, dispatch_number, vendor_delay_note, routes:route_id(estimated_duration_hours), vehicles:vehicle_id(registration_number, truck_type), customers:customer_id(company_name), drivers:driver_id(full_name)")
        .gte("created_at", startISO)
        .lte("created_at", endISO)
        .or("is_historical.is.null,is_historical.eq.false");

      // Fetch invoices in date range using invoice_date (consistent with P&L and Admin Analytics)
      const { data: invoices } = await supabase
        .from("invoices")
        .select("total_amount, invoice_date")
        .gte("invoice_date", startISO)
        .lte("invoice_date", format(end, "yyyy-MM-dd"));

      // Fetch vehicles for fleet utilization (current snapshot is fine — status is live)
      const { data: vehicles } = await supabase
        .from("vehicles")
        .select("id, status, registration_number, truck_type, idle_reason");

      // Fetch dispatches with driver info for period-specific driver performance (exclude historical)
      const { data: driverDispatches } = await supabase
        .from("dispatches")
        .select("driver_id, status, actual_pickup, scheduled_pickup, actual_delivery, created_at, drivers:driver_id(full_name, rating, status), routes:route_id(estimated_duration_hours)")
        .gte("created_at", startISO)
        .lte("created_at", endISO)
        .not("driver_id", "is", null)
        .or("is_historical.is.null,is_historical.eq.false");

      // Fetch expenses in period for cost calculation
      const { data: expenses } = await supabase
        .from("expenses")
        .select("amount, expense_date")
        .gte("expense_date", startISO.split("T")[0])
        .lte("expense_date", endISO.split("T")[0])
        .eq("approval_status", "approved");

      // Calculate KPIs
      const allDispatches = dispatches || [];
      const deliveredDispatches = allDispatches.filter(d => d.status === "delivered");
      // Total deliveries = completed (delivered) dispatches in the period
      const totalDeliveries = deliveredDispatches.length;

      // OTD: average actual transit days vs average route target days
      const DEFAULT_ETA_DAYS_KPI = 2;
      let totalTransitDays = 0;
      let totalTargetDays = 0;
      let deliveryCount = 0;
      deliveredDispatches.forEach((d: any) => {
        const startD = d.actual_pickup || d.scheduled_pickup || d.created_at;
        if (startD && d.actual_delivery) {
          const ms = new Date(d.actual_delivery).getTime() - new Date(startD).getTime();
          if (ms < 0) return;
          deliveryCount++;
          totalTransitDays += ms / (1000 * 60 * 60 * 24); // actual fractional days
          const routeRow = Array.isArray(d.routes) ? d.routes[0] : d.routes;
          totalTargetDays += routeRow?.estimated_duration_hours ? Number(routeRow.estimated_duration_hours) : DEFAULT_ETA_DAYS_KPI;
        }
      });
      const avgTransitDays = deliveryCount > 0 ? Math.round((totalTransitDays / deliveryCount) * 10) / 10 : 0;
      const avgTargetDays = deliveryCount > 0 ? Math.round((totalTargetDays / deliveryCount) * 10) / 10 : DEFAULT_ETA_DAYS_KPI;

      const revenueMtd = invoices?.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0) || 0;

      const totalDistance = allDispatches.reduce((sum, d) => sum + Number(d.distance_km || 0), 0);
      const avgDistance = totalDeliveries > 0 ? totalDistance / totalDeliveries : 0;

      setKpis({ totalDeliveries, avgTransitDays, avgTargetDays, revenueMtd, avgDistance });

      // Generate delivery trend: daily buckets across selected range
      const deliveryTrend: any[] = [];
      const totalDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      // Limit to 90 points; for long ranges bucket by week or month
      const useDailyBuckets = totalDays <= 90;
      const bucketCount = useDailyBuckets ? totalDays : Math.ceil(totalDays / 7);

      for (let i = 0; i < bucketCount; i++) {
        const bucketStart = useDailyBuckets
          ? startOfDay(new Date(start.getTime() + i * 86400000))
          : startOfDay(new Date(start.getTime() + i * 7 * 86400000));
        const bucketEnd = useDailyBuckets
          ? endOfDay(bucketStart)
          : endOfDay(new Date(Math.min(bucketStart.getTime() + 6 * 86400000, end.getTime())));

        const bucketDispatches = dispatches?.filter(d => {
          const created = new Date(d.created_at);
          return created >= bucketStart && created <= bucketEnd;
        }) || [];

        const delivered = bucketDispatches.filter(d => d.status === "delivered").length;
        const delayed = bucketDispatches.filter((d: any) =>
          d.status === "delivered" && !isOnTime(d)
        ).length;

        deliveryTrend.push({
          date: useDailyBuckets ? format(bucketStart, "MMM d") : `${format(bucketStart, "MMM d")}–${format(bucketEnd, "d")}`,
          deliveries: bucketDispatches.length,
          onTime: delivered - delayed,
          delayed,
        });
      }
      setDeliveryData(deliveryTrend);

      // Fleet utilization: combine live status snapshot with period activity
      const statusCounts = { available: 0, in_use: 0, maintenance: 0, inactive: 0 };
      vehicles?.forEach(v => {
        const s = v.status || "available";
        if (s in statusCounts) statusCounts[s as keyof typeof statusCounts]++;
        else statusCounts.available++;
      });
      const totalVehicles = vehicles?.length || 1;
      // Count distinct vehicles that had at least one dispatch in the period
      const activeVehicleIds = new Set(
        dispatches?.map(d => (d as any).vehicle_id).filter(Boolean)
      );
      const periodActiveCount = activeVehicleIds.size;
      setFleetUtilization([
        { name: "Active (period)", value: Math.round((periodActiveCount / totalVehicles) * 100), color: "hsl(142, 76%, 36%)" },
        { name: "Available", value: Math.round((statusCounts.available / totalVehicles) * 100), color: "hsl(38, 92%, 50%)" },
        { name: "Maintenance", value: Math.round((statusCounts.maintenance / totalVehicles) * 100), color: "hsl(199, 89%, 48%)" },
        { name: "Inactive", value: Math.round((statusCounts.inactive / totalVehicles) * 100), color: "hsl(222, 30%, 18%)" },
      ]);

      // Delay reasons breakdown — from dispatches that have a delay_reason set
      const delayReasonLabels: Record<string, string> = {
        traffic: "Traffic congestion",
        vehicle_breakdown: "Vehicle breakdown",
        bad_road: "Bad road condition",
        customer_unavailable: "Customer unavailable",
        wrong_address: "Wrong address",
        weather: "Weather",
        security: "Security / roadblock",
        loading_delay: "Offloading/Loading delay",
        driver_issue: "Driver issue",
        other: "Other",
      };
      const reasonMap: Record<string, { count: number; dispatches: any[] }> = {};
      dispatches?.forEach((d: any) => {
        if (d.delay_reason && d.delay_reason !== "none") {
          const label = delayReasonLabels[d.delay_reason] || d.delay_reason;
          if (!reasonMap[label]) reasonMap[label] = { count: 0, dispatches: [] };
          reasonMap[label].count++;
          const vehicleInfo = Array.isArray(d.vehicles) ? d.vehicles[0] : d.vehicles;
          const customerInfo = Array.isArray(d.customers) ? d.customers[0] : d.customers;
          const driverInfo = Array.isArray(d.drivers) ? d.drivers[0] : d.drivers;
          reasonMap[label].dispatches.push({
            id: d.id,
            dispatch_number: d.dispatch_number || d.id.slice(0, 8),
            truck: vehicleInfo?.registration_number || "—",
            customer: customerInfo?.company_name || "—",
            driver: driverInfo?.full_name || "—",
            vendor: d.vendor_delay_note || null,
          });
        }
      });
      const delayReasonData = Object.entries(reasonMap)
        .map(([reason, data]) => ({ reason, count: data.count, dispatches: data.dispatches }))
        .sort((a, b) => {
          // Offloading/Loading delay always sorts first among same-count ties
          if (a.reason === "Offloading/Loading delay" && b.reason !== "Offloading/Loading delay") return -1;
          if (b.reason === "Offloading/Loading delay" && a.reason !== "Offloading/Loading delay") return 1;
          return b.count - a.count;
        });
      setDelayReasons(delayReasonData);

      // Idle fleet — vehicles not active in the period
      const idleVehicles = (vehicles || []).filter(v => !activeVehicleIds.has(v.id));
      setTotalFleetCount(vehicles?.length || 0);
      setIdleFleet(idleVehicles.map((v: any) => ({
        id: v.id,
        registration: v.registration_number || "Unknown",
        truck_type: v.truck_type || null,
        status: v.status || "available",
        idleReason: v.idle_reason || "",
      })));

      // Top routes by frequency
      const routeMap = new Map<string, { trips: number; distance: number; revenue: number }>();
      dispatches?.forEach(d => {
        const route = `${d.pickup_address?.split(",")[0] || "Unknown"} → ${d.delivery_address?.split(",")[0] || "Unknown"}`;
        const existing = routeMap.get(route) || { trips: 0, distance: 0, revenue: 0 };
        existing.trips++;
        existing.distance += Number(d.distance_km || 0);
        routeMap.set(route, existing);
      });
      
      const routeArray = Array.from(routeMap.entries())
        .map(([route, data]) => ({ route, ...data }))
        .sort((a, b) => b.trips - a.trips)
        .slice(0, 5);
      setTopRoutes(routeArray);

      // Driver performance — computed from dispatches in selected period
      const driverMap = new Map<string, { name: string; rating: number; trips: number; onTime: number; trackedOnTime: number; total: number; status: string }>();
      (driverDispatches || []).forEach((d: any) => {
        if (!d.driver_id) return;
        // drivers join may come back as array or object depending on Supabase version
        const driverInfo = Array.isArray(d.drivers) ? d.drivers[0] : d.drivers;
        const existing = driverMap.get(d.driver_id) || {
          name: driverInfo?.full_name || "Driver",
          rating: driverInfo?.rating || 0,
          trips: 0,
          onTime: 0,
          trackedOnTime: 0, // delivered trips with actual_pickup stamped (trackable)
          total: 0,
          status: driverInfo?.status || "available",
        };
        existing.total++;
        if (d.status === "delivered") {
          existing.trips++;
          // Count OTD using fallback start dates so historical dispatches are included
          const startDate = d.actual_pickup || d.scheduled_pickup || d.created_at;
          if (startDate && d.actual_delivery) {
            existing.trackedOnTime++;
            if (isOnTime(d)) {
              existing.onTime++;
            }
          }
        }
        driverMap.set(d.driver_id, existing);
      });

      // Also fetch drivers directly to fill in any gaps (in case join returns null)
      const allDriverIds = Array.from(driverMap.keys());
      let driverInfoMap = new Map<string, { full_name: string; rating: number; status: string }>();
      if (allDriverIds.length > 0) {
        const { data: driversData } = await supabase
          .from("drivers")
          .select("id, full_name, rating, status")
          .in("id", allDriverIds);
        (driversData || []).forEach((dr: any) => {
          driverInfoMap.set(dr.id, { full_name: dr.full_name, rating: dr.rating || 0, status: dr.status || "available" });
        });
      }

      const driverPerfArray = Array.from(driverMap.entries())
        .map(([driverId, d]) => {
          const info = driverInfoMap.get(driverId);
          // OTD: if any trips had scheduled_delivery set, use that; otherwise show N/A (-1)
          const onTimeVal = d.trackedOnTime > 0
            ? Math.round((d.onTime / d.trackedOnTime) * 100)
            : -1; // -1 = N/A
          return {
            name: info?.full_name || d.name,
            rating: info?.rating ?? d.rating,
            trips: d.trips,
            onTime: onTimeVal,
            status: info?.status || d.status,
          };
        })
        .sort((a, b) => b.trips - a.trips)
        .slice(0, 5);
      setDriverPerformance(driverPerfArray);

      // Revenue trend — daily buckets for ≤60 days, weekly for longer ranges
      const revenueTrend: any[] = [];
      const revUseDailyBuckets = totalDays <= 60;
      const revBucketCount = revUseDailyBuckets ? totalDays : Math.ceil(totalDays / 7);

      for (let i = 0; i < revBucketCount; i++) {
        const bucketStart = revUseDailyBuckets
          ? startOfDay(new Date(start.getTime() + i * 86400000))
          : startOfDay(new Date(start.getTime() + i * 7 * 86400000));
        const bucketEnd = revUseDailyBuckets
          ? endOfDay(bucketStart)
          : endOfDay(new Date(Math.min(bucketStart.getTime() + 6 * 86400000, end.getTime())));

        const bucketInvoices = invoices?.filter(inv => {
          const d = new Date(inv.invoice_date);
          return d >= bucketStart && d <= bucketEnd;
        }) || [];
        const bucketExpenses = expenses?.filter(e => {
          const d = new Date(e.expense_date);
          return d >= bucketStart && d <= bucketEnd;
        }) || [];

        revenueTrend.push({
          month: revUseDailyBuckets ? format(bucketStart, "MMM d") : `${format(bucketStart, "MMM d")}–${format(bucketEnd, "d")}`,
          revenue: bucketInvoices.reduce((s, inv) => s + Number(inv.total_amount || 0), 0),
          costs: bucketExpenses.reduce((s, e) => s + Number(e.amount || 0), 0),
        });
      }
      setRevenueData(revenueTrend);

    } catch (error) {
      console.error("Error fetching analytics:", error);
      toast({
        title: "Error",
        description: "Failed to load analytics data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const saveVendorNote = async (dispatchId: string, note: string) => {
    await supabase.from("dispatches").update({ vendor_delay_note: note }).eq("id", dispatchId);
    setDelayReasons(prev => prev.map(r => ({
      ...r,
      dispatches: r.dispatches.map(d => d.id === dispatchId ? { ...d, vendor: note || null } : d),
    })));
    setEditingVendor(null);
  };

  const saveIdleReason = async (vehicleId: string, reason: string) => {
    await supabase.from("vehicles").update({ idle_reason: reason } as any).eq("id", vehicleId);
    setIdleFleet(prev => prev.map(v => v.id === vehicleId ? { ...v, idleReason: reason } : v));
    setEditingIdleReason(null);
  };

  const handleExportReport = async () => {
    setExporting(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      // Title
      doc.setFontSize(18);
      doc.setTextColor(40);
      doc.text("Analytics Report", pageWidth / 2, 20, { align: "center" });

      // Date range
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Date Range: ${dateRange.from ? format(dateRange.from, "MMM d, yyyy") : ""} to ${dateRange.to ? format(dateRange.to, "MMM d, yyyy") : ""}`, pageWidth / 2, 28, { align: "center" });
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, 34, { align: "center" });

      // KPIs
      doc.setFontSize(12);
      doc.setTextColor(40);
      doc.text("Key Performance Indicators", 14, 48);

      doc.setFontSize(10);
      doc.setTextColor(60);
      doc.text(`Total Deliveries: ${kpis.totalDeliveries}`, 14, 56);
      doc.text(`Avg Transit Days: ${kpis.avgTransitDays > 0 ? `${kpis.avgTransitDays}d (Target: ${kpis.avgTargetDays}d)` : "No deliveries"}`, 14, 63);
      doc.text(`Revenue: ${formatCurrency(kpis.revenueMtd)}`, 14, 70);
      doc.text(`Avg. Distance: ${kpis.avgDistance.toFixed(0)} km`, 14, 77);

      // Top Routes Table
      if (topRoutes.length > 0) {
        doc.setFontSize(12);
        doc.text("Top Routes", 14, 92);

        autoTable(doc, {
          startY: 98,
          head: [["Route", "Trips", "Distance (km)"]],
          body: topRoutes.map(route => [
            route.route,
            route.trips.toString(),
            route.distance.toFixed(0),
          ]),
          styles: { fontSize: 9, cellPadding: 2 },
          headStyles: { fillColor: [59, 130, 246], textColor: 255 },
        });
      }

      // Driver Performance
      if (driverPerformance.length > 0) {
        const finalY = (doc as any).lastAutoTable?.finalY || 140;
        doc.setFontSize(12);
        doc.text("Top Drivers", 14, finalY + 15);

        autoTable(doc, {
          startY: finalY + 21,
          head: [["Driver", "Rating", "Trips", "On-Time %"]],
          body: driverPerformance.map(driver => [
            driver.name,
            driver.rating.toFixed(1),
            driver.trips.toString(),
            driver.onTime === -1 ? "N/A" : `${driver.onTime}%`,
          ]),
          styles: { fontSize: 9, cellPadding: 2 },
          headStyles: { fillColor: [59, 130, 246], textColor: 255 },
        });
      }

      doc.save(`analytics-report-${dateRange.from ? format(dateRange.from, "yyyy-MM-dd") : "start"}-to-${dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : "end"}.pdf`);
      toast({
        title: "Report Downloaded",
        description: "Analytics report has been saved as PDF",
      });
    } catch (error) {
      console.error("Error exporting report:", error);
      toast({
        title: "Export Failed",
        description: "Failed to generate report",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Analytics" subtitle="Performance insights and business intelligence">
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Analytics"
      subtitle="Performance insights and business intelligence"
    >
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-auto bg-secondary/50 border-border/50">
              <CalendarRange className="w-4 h-4 mr-2" />
              {dateRange.from ? (
                dateRange.to ? (
                  <>{format(dateRange.from, "MMM d")} – {format(dateRange.to, "MMM d, yyyy")}</>
                ) : (
                  format(dateRange.from, "MMM d, yyyy")
                )
              ) : (
                "Date Range"
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarComponent
              initialFocus
              mode="range"
              defaultMonth={dateRange.from || new Date()}
              selected={{ from: dateRange.from || undefined, to: dateRange.to || undefined }}
              onSelect={(range) => setDateRange({ from: range?.from || null, to: range?.to || null })}
              numberOfMonths={2}
            />
            {(dateRange.from || dateRange.to) && (
              <div className="p-2 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => setDateRange({ from: subDays(new Date(), 30), to: new Date() })}
                >
                  Reset to Last 30 Days
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
        <Button variant="outline" onClick={handleExportReport} disabled={exporting}>
          <Download className="w-4 h-4 mr-2" />
          {exporting ? "Exporting..." : "Export Report"}
        </Button>
      </div>

      {/* KPI Cards */}
      <div className={`grid grid-cols-1 md:grid-cols-2 ${hideFinancialData ? "lg:grid-cols-3" : "lg:grid-cols-4"} gap-4 mb-8`}>
        {[
          {
            title: "Total Deliveries",
            value: kpis.totalDeliveries.toString(),
            change: (() => {
              if (!dateRange.from || !dateRange.to) return "Select date range";
              const sLabel = format(dateRange.from, "MMM yyyy");
              const eLabel = format(dateRange.to, "MMM yyyy");
              return sLabel === eLabel ? sLabel : `${format(dateRange.from, "MMM")} – ${format(dateRange.to, "MMM yyyy")}`;
            })(),
            positive: true,
            icon: Truck,
          },
          {
            title: "Avg Transit Days",
            value: kpis.avgTransitDays > 0 ? `${kpis.avgTransitDays}d` : "—",
            change: kpis.avgTransitDays > 0
              ? (() => {
                  const otdPct = Math.round((kpis.avgTargetDays / kpis.avgTransitDays) * 100);
                  const status = kpis.avgTransitDays <= kpis.avgTargetDays
                    ? `On Track (${otdPct}%)`
                    : `+${(kpis.avgTransitDays - kpis.avgTargetDays).toFixed(1)}d over (${otdPct}%)`;
                  return `Target: ${kpis.avgTargetDays}d — ${status}`;
                })()
              : "No deliveries yet",
            positive: kpis.avgTransitDays === 0 || kpis.avgTransitDays <= kpis.avgTargetDays,
            icon: Clock,
          },
          // Only show Revenue KPI for non-Operations users
          ...(!hideFinancialData ? [{
            title: "Revenue",
            value: formatCurrency(kpis.revenueMtd),
            change: "Period total",
            positive: true,
            icon: DollarSign,
          }] : []),
          {
            title: "Avg. Distance/Trip",
            value: `${kpis.avgDistance.toFixed(0)} km`,
            change: "Delivered trips",
            positive: true,
            icon: MapPin,
          },
        ].map((kpi, index) => (
          <motion.div
            key={kpi.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            className="glass-card p-6"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{kpi.title}</p>
                <p className="text-3xl font-heading font-bold text-foreground mt-2">
                  {kpi.value}
                </p>
                <div className="flex items-center gap-1 mt-2">
                  {kpi.positive ? (
                    <TrendingUp className="w-4 h-4 text-success" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-destructive" />
                  )}
                  <span
                    className={`text-sm ${
                      kpi.positive ? "text-success" : "text-destructive"
                    }`}
                  >
                    {kpi.change}
                  </span>
                </div>
              </div>
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <kpi.icon className="w-6 h-6 text-primary" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Delivery Trends */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="lg:col-span-2 glass-card p-6"
        >
          <h3 className="font-heading font-semibold text-lg text-foreground mb-4">
            Delivery Performance
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={deliveryData}>
                <defs>
                  <linearGradient id="colorOnTime" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorDelayed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="onTime"
                  stroke="hsl(142, 76%, 36%)"
                  strokeWidth={2}
                  fill="url(#colorOnTime)"
                  name="On Time"
                />
                <Area
                  type="monotone"
                  dataKey="delayed"
                  stroke="hsl(0, 72%, 51%)"
                  strokeWidth={2}
                  fill="url(#colorDelayed)"
                  name="Delayed"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Fleet Utilization */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
          className="glass-card p-6"
        >
          <h3 className="font-heading font-semibold text-lg text-foreground mb-4">
            Fleet Utilization
          </h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={fleetUtilization}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {fleetUtilization.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            {fleetUtilization.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-sm text-muted-foreground">
                  {item.name} ({item.value}%)
                </span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Delay Reasons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="glass-card p-6"
        >
          <h3 className="font-heading font-semibold text-lg text-foreground mb-1">
            Delivery Delay Reasons
          </h3>
          <p className="text-xs text-muted-foreground mb-4">Click a reason to see linked trucks, customers & drivers. Tag impacting vendor inline.</p>
          {delayReasons.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Clock className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">No delays recorded in this period</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(() => {
                const total = delayReasons.reduce((s, r) => s + r.count, 0);
                return delayReasons.map((item, index) => {
                  const pct = Math.round((item.count / total) * 100);
                  const isExpanded = expandedDelayReason === item.reason;
                  return (
                    <div key={index} className="space-y-1">
                      <button
                        className="w-full text-left"
                        onClick={() => setExpandedDelayReason(isExpanded ? null : item.reason)}
                      >
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-foreground flex items-center gap-1">
                            {item.reason}
                            {isExpanded ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
                          </span>
                          <span className="font-semibold text-warning">
                            {pct}% <span className="text-xs text-muted-foreground font-normal">({item.count} trip{item.count > 1 ? "s" : ""})</span>
                          </span>
                        </div>
                        <div className="w-full h-2 bg-secondary rounded-full overflow-hidden mt-1">
                          <div
                            className="h-full bg-warning rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="mt-2 rounded-lg border border-border/50 overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-secondary/60 text-muted-foreground">
                                <th className="text-left px-3 py-2 font-medium">Dispatch</th>
                                <th className="text-left px-3 py-2 font-medium"><Truck className="inline w-3 h-3 mr-1" />Truck</th>
                                <th className="text-left px-3 py-2 font-medium"><Building2 className="inline w-3 h-3 mr-1" />Customer</th>
                                <th className="text-left px-3 py-2 font-medium"><User className="inline w-3 h-3 mr-1" />Driver</th>
                                <th className="text-left px-3 py-2 font-medium"><Tag className="inline w-3 h-3 mr-1" />Vendor Note</th>
                              </tr>
                            </thead>
                            <tbody>
                              {item.dispatches.map((d) => (
                                <tr key={d.id} className="border-t border-border/30 hover:bg-secondary/30">
                                  <td className="px-3 py-2 text-foreground font-mono">{d.dispatch_number}</td>
                                  <td className="px-3 py-2 text-foreground">{d.truck}</td>
                                  <td className="px-3 py-2 text-foreground">{d.customer}</td>
                                  <td className="px-3 py-2 text-foreground">{d.driver}</td>
                                  <td className="px-3 py-2">
                                    {editingVendor?.dispatchId === d.id ? (
                                      <div className="flex items-center gap-1">
                                        <input
                                          className="flex-1 bg-background border border-border rounded px-2 py-0.5 text-xs text-foreground min-w-0"
                                          value={editingVendor.value}
                                          autoFocus
                                          onChange={e => setEditingVendor({ dispatchId: d.id, value: e.target.value })}
                                          onKeyDown={e => {
                                            if (e.key === "Enter") saveVendorNote(d.id, editingVendor.value);
                                            if (e.key === "Escape") setEditingVendor(null);
                                          }}
                                        />
                                        <button onClick={() => saveVendorNote(d.id, editingVendor.value)} className="text-success hover:opacity-80"><Check className="w-3 h-3" /></button>
                                        <button onClick={() => setEditingVendor(null)} className="text-destructive hover:opacity-80"><X className="w-3 h-3" /></button>
                                      </div>
                                    ) : (
                                      <button
                                        className="flex items-center gap-1 text-muted-foreground hover:text-foreground group"
                                        onClick={() => setEditingVendor({ dispatchId: d.id, value: d.vendor || "" })}
                                      >
                                        <span>{d.vendor || <span className="italic opacity-50">Add vendor</span>}</span>
                                        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </motion.div>
      </div>

      {/* Charts Row 2 */}
      <div className={`grid grid-cols-1 ${hideFinancialData ? "" : "lg:grid-cols-2"} gap-6 mb-8`}>
        {/* Revenue vs Costs - Hidden for Operations role */}
        {!hideFinancialData && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="glass-card p-6"
          >
            <h3 className="font-heading font-semibold text-lg text-foreground mb-4">
              Revenue vs Operating Costs
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="month"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    tickFormatter={formatCurrency}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number) => [formatCurrency(value), ""]}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Revenue" />
                  <Bar dataKey="costs" fill="hsl(var(--muted))" radius={[4, 4, 0, 0]} name="Costs" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}

        {/* Top Routes */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35 }}
          className="glass-card p-6"
        >
          <h3 className="font-heading font-semibold text-lg text-foreground mb-4">
            Top Routes by Trips
          </h3>
          <div className="space-y-4">
            {topRoutes.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No route data available</p>
            ) : (
              topRoutes.map((route, index) => (
                <div
                  key={route.route}
                  className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-semibold text-primary">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-medium text-foreground text-sm">{route.route}</p>
                      <p className="text-xs text-muted-foreground">
                        {route.trips} trips • {route.distance.toFixed(0)} km
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </div>

      {/* Driver Performance */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.4 }}
        className="glass-card p-6"
      >
        <h3 className="font-heading font-semibold text-lg text-foreground mb-4">
          Driver Performance Rankings
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-3 px-4 text-sm font-semibold text-muted-foreground">
                  Rank
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-muted-foreground">
                  Driver
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-muted-foreground">
                  Rating
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-muted-foreground">
                  Total Trips
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-muted-foreground">
                  On-Time Rate
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-muted-foreground">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {driverPerformance.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    No driver data available
                  </td>
                </tr>
              ) : (
                driverPerformance
                  .sort((a, b) => b.rating - a.rating)
                  .map((driver, index) => (
                    <tr key={driver.name} className="border-b border-border/50">
                      <td className="py-3 px-4">
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                            index === 0
                              ? "bg-warning/20 text-warning"
                              : index === 1
                              ? "bg-muted text-muted-foreground"
                              : index === 2
                              ? "bg-warning/10 text-warning/70"
                              : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {index + 1}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-foreground">
                        {driver.name}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          <span className="text-warning">★</span>
                          <span className="text-foreground">{driver.rating.toFixed(1)}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {driver.trips}
                      </td>
                      <td className="py-3 px-4">
                        {driver.onTime === -1 ? (
                          <span className="text-muted-foreground text-sm">N/A</span>
                        ) : (
                          <Badge
                            className={
                              driver.onTime >= 95
                                ? "bg-success/15 text-success"
                                : driver.onTime >= 90
                                ? "bg-warning/15 text-warning"
                                : "bg-destructive/15 text-destructive"
                            }
                          >
                            {driver.onTime}%
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={driver.status === "available" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}>
                          {driver.status}
                        </Badge>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Idle Fleet Tracker */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.45 }}
        className="glass-card p-6 mt-6"
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-heading font-semibold text-lg text-foreground">Idle Fleet Tracker</h3>
          <Badge className="bg-destructive/15 text-destructive">
            {idleFleet.length} idle of {totalFleetCount} trucks ({totalFleetCount > 0 ? Math.round((idleFleet.length / totalFleetCount) * 100) : 0}% idle)
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mb-4">Trucks with no dispatch activity in selected period. Record reason for idleness below.</p>
        {idleFleet.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 text-muted-foreground">
            <Truck className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">All registered trucks were active in this period</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-muted-foreground text-xs">
                  <th className="text-left py-2 px-3 font-medium">Registration</th>
                  <th className="text-left py-2 px-3 font-medium">Type</th>
                  <th className="text-left py-2 px-3 font-medium">Status</th>
                  <th className="text-left py-2 px-3 font-medium">Reason for Idleness</th>
                </tr>
              </thead>
              <tbody>
                {idleFleet.map((v) => (
                  <tr key={v.id} className="border-t border-border/30 hover:bg-secondary/20">
                    <td className="py-2 px-3 font-mono font-medium text-foreground">{v.registration}</td>
                    <td className="py-2 px-3 text-muted-foreground">{v.truck_type || "—"}</td>
                    <td className="py-2 px-3">
                      <Badge className={
                        v.status === "maintenance" ? "bg-warning/15 text-warning" :
                        v.status === "inactive" ? "bg-secondary text-muted-foreground" :
                        "bg-muted/30 text-muted-foreground"
                      }>
                        {v.status}
                      </Badge>
                    </td>
                    <td className="py-2 px-3">
                      {editingIdleReason?.vehicleId === v.id ? (
                        <div className="flex items-center gap-1">
                          <select
                            className="flex-1 bg-background border border-border rounded px-2 py-1 text-xs text-foreground"
                            value={editingIdleReason.value}
                            onChange={e => setEditingIdleReason({ vehicleId: v.id, value: e.target.value })}
                          >
                            <option value="">Select reason...</option>
                            <option value="Low orders">Low orders</option>
                            <option value="Partner-related">Partner-related</option>
                            <option value="Driver unavailable">Driver unavailable</option>
                            <option value="Awaiting maintenance">Awaiting maintenance</option>
                            <option value="Customer delay">Customer delay</option>
                            <option value="Other">Other</option>
                          </select>
                          <button onClick={() => saveIdleReason(v.id, editingIdleReason.value)} className="text-success hover:opacity-80"><Check className="w-3 h-3" /></button>
                          <button onClick={() => setEditingIdleReason(null)} className="text-destructive hover:opacity-80"><X className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <button
                          className="flex items-center gap-1 text-muted-foreground hover:text-foreground group"
                          onClick={() => setEditingIdleReason({ vehicleId: v.id, value: v.idleReason })}
                        >
                          <span>{v.idleReason || <span className="italic opacity-50">Set reason</span>}</span>
                          <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </DashboardLayout>
  );
};

export default AnalyticsPage;