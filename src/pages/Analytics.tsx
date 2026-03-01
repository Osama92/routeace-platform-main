import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Calendar,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { subDays, subHours, format, startOfDay, endOfDay } from "date-fns";

const formatCurrency = (value: number) => {
  if (value >= 1000000) {
    return `₦${(value / 1000000).toFixed(1)}M`;
  }
  return `₦${(value / 1000).toFixed(0)}K`;
};

const AnalyticsPage = () => {
  const [timeRange, setTimeRange] = useState("7d");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();
  const { userRole } = useAuth();

  // Operations role should not see financial data
  const hideFinancialData = userRole === "operations";

  const [kpis, setKpis] = useState({
    totalDeliveries: 0,
    onTimeRate: 0,
    revenueMtd: 0,
    avgDistance: 0,
  });

  const [deliveryData, setDeliveryData] = useState<any[]>([]);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [fleetUtilization, setFleetUtilization] = useState<any[]>([]);
  const [topRoutes, setTopRoutes] = useState<any[]>([]);
  const [driverPerformance, setDriverPerformance] = useState<any[]>([]);

  const getDateRange = (range: string) => {
    const now = new Date();
    switch (range) {
      case "24h":
        return { start: subHours(now, 24), end: now };
      case "7d":
        return { start: subDays(now, 7), end: now };
      case "30d":
        return { start: subDays(now, 30), end: now };
      case "90d":
        return { start: subDays(now, 90), end: now };
      default:
        return { start: subDays(now, 7), end: now };
    }
  };

  useEffect(() => {
    fetchAnalyticsData();
  }, [timeRange]);

  const fetchAnalyticsData = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange(timeRange);
      const startISO = start.toISOString();
      const endISO = end.toISOString();

      // Fetch dispatches in date range
      const { data: dispatches } = await supabase
        .from("dispatches")
        .select("id, status, distance_km, scheduled_delivery, actual_delivery, pickup_address, delivery_address, created_at, vehicle_id")
        .gte("created_at", startISO)
        .lte("created_at", endISO);

      // Fetch invoices in date range
      const { data: invoices } = await supabase
        .from("invoices")
        .select("total_amount, created_at")
        .gte("created_at", startISO)
        .lte("created_at", endISO);

      // Fetch vehicles for fleet utilization (current snapshot is fine — status is live)
      const { data: vehicles } = await supabase
        .from("vehicles")
        .select("id, status");

      // Fetch dispatches with driver info for period-specific driver performance
      const { data: driverDispatches } = await supabase
        .from("dispatches")
        .select("driver_id, status, scheduled_delivery, actual_delivery, drivers:driver_id(full_name, rating, status)")
        .gte("created_at", startISO)
        .lte("created_at", endISO)
        .not("driver_id", "is", null);

      // Fetch expenses in period for cost calculation
      const { data: expenses } = await supabase
        .from("expenses")
        .select("amount, expense_date")
        .gte("expense_date", startISO.split("T")[0])
        .lte("expense_date", endISO.split("T")[0])
        .eq("approval_status", "approved");

      // Calculate KPIs
      const deliveredDispatches = dispatches?.filter(d => d.status === "delivered") || [];
      const totalDeliveries = deliveredDispatches.length;
      
      const onTimeDeliveries = deliveredDispatches.filter(d => 
        d.scheduled_delivery && d.actual_delivery && 
        new Date(d.actual_delivery) <= new Date(d.scheduled_delivery)
      ).length;
      const onTimeRate = totalDeliveries > 0 ? (onTimeDeliveries / totalDeliveries) * 100 : 0;

      const revenueMtd = invoices?.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0) || 0;
      
      const totalDistance = deliveredDispatches.reduce((sum, d) => sum + Number(d.distance_km || 0), 0);
      const avgDistance = totalDeliveries > 0 ? totalDistance / totalDeliveries : 0;

      setKpis({ totalDeliveries, onTimeRate, revenueMtd, avgDistance });

      // Generate delivery trend data based on time range
      const deliveryTrend: any[] = [];
      const daysToShow = timeRange === "24h" ? 24 : timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
      
      for (let i = daysToShow - 1; i >= 0; i--) {
        const date = timeRange === "24h" 
          ? subHours(new Date(), i)
          : subDays(new Date(), i);
        
        const dayStart = timeRange === "24h" ? date : startOfDay(date);
        const dayEnd = timeRange === "24h" ? date : endOfDay(date);
        
        const dayDispatches = dispatches?.filter(d => {
          const created = new Date(d.created_at);
          return created >= dayStart && created <= dayEnd;
        }) || [];

        const delivered = dayDispatches.filter(d => d.status === "delivered").length;
        const delayed = dayDispatches.filter(d => 
          d.status === "delivered" && d.scheduled_delivery && d.actual_delivery &&
          new Date(d.actual_delivery) > new Date(d.scheduled_delivery)
        ).length;

        deliveryTrend.push({
          date: timeRange === "24h" 
            ? format(date, "HH:mm")
            : format(date, "MMM d"),
          deliveries: dayDispatches.length,
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
          trackedOnTime: 0, // count of delivered trips that had scheduled_delivery set
          total: 0,
          status: driverInfo?.status || "available",
        };
        existing.total++;
        if (d.status === "delivered") {
          existing.trips++;
          if (d.scheduled_delivery) {
            existing.trackedOnTime++;
            if (d.actual_delivery && new Date(d.actual_delivery) <= new Date(d.scheduled_delivery)) {
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

      // Revenue trend — bucketed to match the selected timeRange
      const revenueTrend: any[] = [];

      if (timeRange === "24h") {
        // Hourly buckets for last 24 hours
        for (let i = 23; i >= 0; i--) {
          const bucketStart = subHours(new Date(), i + 1);
          const bucketEnd = subHours(new Date(), i);
          const bucketInvoices = invoices?.filter(inv => {
            const d = new Date(inv.created_at);
            return d >= bucketStart && d < bucketEnd;
          }) || [];
          const bucketExpenses = expenses?.filter(e => {
            const d = new Date(e.expense_date);
            return d >= bucketStart && d < bucketEnd;
          }) || [];
          revenueTrend.push({
            month: format(bucketEnd, "HH:mm"),
            revenue: bucketInvoices.reduce((s, i) => s + Number(i.total_amount || 0), 0),
            costs: bucketExpenses.reduce((s, e) => s + Number(e.amount || 0), 0),
          });
        }
      } else if (timeRange === "7d") {
        // Daily buckets for last 7 days
        for (let i = 6; i >= 0; i--) {
          const day = subDays(new Date(), i);
          const dayStart = startOfDay(day);
          const dayEnd = endOfDay(day);
          const dayInvoices = invoices?.filter(inv => {
            const d = new Date(inv.created_at);
            return d >= dayStart && d <= dayEnd;
          }) || [];
          const dayExpenses = expenses?.filter(e => {
            const d = new Date(e.expense_date);
            return d >= dayStart && d <= dayEnd;
          }) || [];
          revenueTrend.push({
            month: format(day, "MMM d"),
            revenue: dayInvoices.reduce((s, i) => s + Number(i.total_amount || 0), 0),
            costs: dayExpenses.reduce((s, e) => s + Number(e.amount || 0), 0),
          });
        }
      } else {
        // Monthly buckets for 30d / 90d
        const monthCount = timeRange === "30d" ? 1 : 3;
        for (let i = monthCount - 1; i >= 0; i--) {
          const monthStart = new Date();
          monthStart.setMonth(monthStart.getMonth() - i);
          monthStart.setDate(1);
          monthStart.setHours(0, 0, 0, 0);
          const monthEnd = new Date(monthStart);
          monthEnd.setMonth(monthEnd.getMonth() + 1);
          monthEnd.setDate(0);
          monthEnd.setHours(23, 59, 59, 999);
          const monthInvoices = invoices?.filter(inv => {
            const d = new Date(inv.created_at);
            return d >= monthStart && d <= monthEnd;
          }) || [];
          const monthExpenses = expenses?.filter(e => {
            const d = new Date(e.expense_date);
            return d >= monthStart && d <= monthEnd;
          }) || [];
          revenueTrend.push({
            month: format(monthStart, "MMM yyyy"),
            revenue: monthInvoices.reduce((s, i) => s + Number(i.total_amount || 0), 0),
            costs: monthExpenses.reduce((s, e) => s + Number(e.amount || 0), 0),
          });
        }
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
      doc.text(`Time Range: ${timeRange === "24h" ? "Last 24 Hours" : timeRange === "7d" ? "Last 7 Days" : timeRange === "30d" ? "Last 30 Days" : "Last 90 Days"}`, pageWidth / 2, 28, { align: "center" });
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, 34, { align: "center" });

      // KPIs
      doc.setFontSize(12);
      doc.setTextColor(40);
      doc.text("Key Performance Indicators", 14, 48);

      doc.setFontSize(10);
      doc.setTextColor(60);
      doc.text(`Total Deliveries: ${kpis.totalDeliveries}`, 14, 56);
      doc.text(`On-Time Rate: ${kpis.onTimeRate.toFixed(1)}%`, 14, 63);
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

      doc.save(`analytics-report-${timeRange}-${new Date().toISOString().split("T")[0]}.pdf`);
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
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-40 bg-secondary/50 border-border/50">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
            change: `${timeRange === "24h" ? "24h" : timeRange === "7d" ? "7d" : timeRange === "30d" ? "30d" : "90d"}`,
            positive: true,
            icon: Truck,
          },
          {
            title: "On-Time Rate",
            value: `${kpis.onTimeRate.toFixed(1)}%`,
            change: kpis.onTimeRate >= 90 ? "Good" : "Needs Improvement",
            positive: kpis.onTimeRate >= 90,
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
    </DashboardLayout>
  );
};

export default AnalyticsPage;