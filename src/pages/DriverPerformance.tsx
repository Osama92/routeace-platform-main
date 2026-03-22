import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  User,
  Clock,
  Star,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Calendar,
  Filter,
  Download,
  Truck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfMonth, endOfMonth, parseISO } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface DriverPerformanceData {
  id: string;
  full_name: string;
  phone: string;
  status: string;
  rating: number;
  total_trips: number;
  on_time_count: number;
  late_count: number;
  on_time_rate: number;
  sla_breaches: number;
  total_distance_km: number;
  avg_trip_distance: number;
}

const DriverPerformance = () => {
  const [drivers, setDrivers] = useState<DriverPerformanceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState("month");
  const [selectedDriver, setSelectedDriver] = useState<string>("all");
  const [exporting, setExporting] = useState(false);

  const getDateRange = () => {
    const now = new Date();
    switch (dateRange) {
      case "week":
        return { start: subDays(now, 7), end: now };
      case "month":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "quarter":
        return { start: subDays(now, 90), end: now };
      case "year":
        return { start: subDays(now, 365), end: now };
      default:
        return { start: startOfMonth(now), end: now };
    }
  };

  const fetchPerformanceData = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();

      // Fetch all drivers
      const { data: driversData } = await supabase
        .from("drivers")
        .select("id, full_name, phone, status, rating, total_trips");

      // Fetch dispatches within date range
      const { data: dispatches } = await supabase
        .from("dispatches")
        .select("id, driver_id, status, actual_pickup, scheduled_pickup, created_at, actual_delivery, distance_km, routes:route_id(estimated_duration_hours)")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .not("driver_id", "is", null);

      // SLA breaches are derived from OTD — late deliveries = SLA breaches (no separate table needed)

      // Build performance map
      const performanceMap = new Map<string, DriverPerformanceData>();

      driversData?.forEach((driver) => {
        performanceMap.set(driver.id, {
          id: driver.id,
          full_name: driver.full_name,
          phone: driver.phone,
          status: driver.status || "inactive",
          rating: driver.rating || 0,
          total_trips: 0,
          on_time_count: 0,
          late_count: 0,
          on_time_rate: 0,
          sla_breaches: 0,
          total_distance_km: 0,
          avg_trip_distance: 0,
        });
      });

      // Calculate metrics from dispatches
      dispatches?.forEach((dispatch) => {
        if (!dispatch.driver_id) return;
        const perf = performanceMap.get(dispatch.driver_id);
        if (!perf) return;

        if ((dispatch as any).status === "delivered") {
          perf.total_trips += 1;
          perf.total_distance_km += Number((dispatch as any).distance_km || 0);

          const startDate = (dispatch as any).actual_pickup || (dispatch as any).scheduled_pickup || (dispatch as any).created_at;
          const deliveryDate = (dispatch as any).actual_delivery;
          if (startDate && deliveryDate) {
            const ms = new Date(deliveryDate).getTime() - new Date(startDate).getTime();
            if (ms >= 0) {
              const hoursInTransit = ms / (1000 * 60 * 60);
              const routeRow = (dispatch as any).routes;
              const etaHours = (routeRow?.estimated_duration_hours ? Number(routeRow.estimated_duration_hours) : 2) * 24;
              if (hoursInTransit <= etaHours) perf.on_time_count += 1;
              else perf.late_count += 1;
            }
          }
        }
      });

      // Calculate rates and averages; sla_breaches = late_count (same metric, inverse view)
      performanceMap.forEach((perf) => {
        const totalTimed = perf.on_time_count + perf.late_count;
        perf.on_time_rate = totalTimed > 0 ? (perf.on_time_count / totalTimed) * 100 : 0;
        perf.sla_breaches = perf.late_count;
        perf.avg_trip_distance = perf.total_trips > 0 ? perf.total_distance_km / perf.total_trips : 0;
      });

      const results = Array.from(performanceMap.values())
        .filter((p) => p.total_trips > 0 || p.status === "available")
        .sort((a, b) => b.on_time_rate - a.on_time_rate);

      setDrivers(results);
    } catch (error) {
      console.error("Error fetching performance data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPerformanceData();
  }, [dateRange]);

  const filteredDrivers = selectedDriver === "all"
    ? drivers
    : drivers.filter((d) => d.id === selectedDriver);

  const totals = {
    totalTrips: drivers.reduce((sum, d) => sum + d.total_trips, 0),
    avgOnTimeRate: drivers.length > 0
      ? drivers.reduce((sum, d) => sum + d.on_time_rate, 0) / drivers.length
      : 0,
    totalBreaches: drivers.reduce((sum, d) => sum + d.sla_breaches, 0),
    avgRating: drivers.length > 0
      ? drivers.reduce((sum, d) => sum + d.rating, 0) / drivers.length
      : 0,
  };

  const chartData = filteredDrivers.slice(0, 10).map((d) => ({
    name: d.full_name.split(" ")[0],
    onTimeRate: d.on_time_rate,
    trips: d.total_trips,
    breaches: d.sla_breaches,
    rating: d.rating,
  }));

  const pieData = [
    { name: "On Time", value: drivers.reduce((s, d) => s + d.on_time_count, 0), color: "hsl(var(--success))" },
    { name: "Late", value: drivers.reduce((s, d) => s + d.late_count, 0), color: "hsl(var(--destructive))" },
  ];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFontSize(18);
      doc.text("Driver Performance Report", pageWidth / 2, 20, { align: "center" });

      doc.setFontSize(10);
      doc.text(`Period: ${dateRange}`, pageWidth / 2, 28, { align: "center" });
      doc.text(`Generated: ${format(new Date(), "PPP")}`, pageWidth / 2, 35, { align: "center" });

      doc.setFontSize(12);
      doc.text(`Total Trips: ${totals.totalTrips}`, 14, 48);
      doc.text(`Avg On-Time Rate: ${totals.avgOnTimeRate.toFixed(1)}%`, 14, 55);
      doc.text(`Total SLA Breaches: ${totals.totalBreaches}`, 14, 62);
      doc.text(`Avg Rating: ${totals.avgRating.toFixed(1)}/5`, 14, 69);

      const tableData = filteredDrivers.map((d, i) => [
        i + 1,
        d.full_name,
        d.total_trips,
        `${d.on_time_rate.toFixed(1)}%`,
        d.sla_breaches,
        d.rating.toFixed(1),
        `${formatCurrency(d.total_distance_km)} km`,
      ]);

      autoTable(doc, {
        startY: 78,
        head: [["#", "Driver", "Trips", "On-Time %", "SLA Breaches", "Rating", "Distance"]],
        body: tableData,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [59, 130, 246] },
      });

      doc.save("driver-performance-report.pdf");
    } catch (error) {
      console.error("Error exporting PDF:", error);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Driver Performance" subtitle="Track driver metrics and SLA compliance">
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Driver Performance"
      subtitle="Track on-time delivery rates, SLA compliance, and customer ratings"
    >
      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-8">
        <div className="flex gap-4">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-40 bg-secondary/50 border-border/50">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Last 7 Days</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">Last 90 Days</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedDriver} onValueChange={setSelectedDriver}>
            <SelectTrigger className="w-48 bg-secondary/50 border-border/50">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="All Drivers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Drivers</SelectItem>
              {drivers.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={handleExportPDF} disabled={exporting}>
          <Download className="w-4 h-4 mr-2" />
          {exporting ? "Exporting..." : "Export PDF"}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Truck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{totals.totalTrips}</p>
              <p className="text-xs text-muted-foreground">Total Trips</p>
            </div>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{totals.avgOnTimeRate.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground">Avg On-Time Rate</p>
            </div>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-destructive/20 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{totals.totalBreaches}</p>
              <p className="text-xs text-muted-foreground">SLA Breaches</p>
            </div>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
              <Star className="w-5 h-5 text-warning" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{totals.avgRating.toFixed(1)}/5</p>
              <p className="text-xs text-muted-foreground">Avg Rating</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Card className="glass-card border-border/50 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-heading">On-Time Rate by Driver</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--popover))", borderColor: "hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--popover-foreground))" }}
                  labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                  itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                  formatter={(value: number) => `${value.toFixed(1)}%`}
                />
                <Bar dataKey="onTimeRate" name="On-Time Rate" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="text-sm font-heading">Delivery Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="value"
                  paddingAngle={2}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--popover))", borderColor: "hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--popover-foreground))" }}
                  labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                  itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-2">
              {pieData.map((entry) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="text-xs text-muted-foreground">{entry.name}: {entry.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Driver Table */}
      <Card className="glass-card border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-heading">Driver Performance Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead>Driver</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">Trips</TableHead>
                <TableHead className="text-center">On-Time Rate</TableHead>
                <TableHead className="text-center">SLA Breaches</TableHead>
                <TableHead className="text-center">Rating</TableHead>
                <TableHead className="text-right">Total KM</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDrivers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No driver data available for this period
                  </TableCell>
                </TableRow>
              ) : (
                filteredDrivers.map((driver, index) => (
                  <TableRow key={driver.id} className="border-border/50">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{driver.full_name}</p>
                          <p className="text-xs text-muted-foreground">{driver.phone}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={driver.status === "available" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}>
                        {driver.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center font-medium">{driver.total_trips}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <Badge className={
                          driver.on_time_rate >= 90 ? "bg-success/15 text-success" :
                          driver.on_time_rate >= 75 ? "bg-warning/15 text-warning" :
                          "bg-destructive/15 text-destructive"
                        }>
                          {driver.on_time_rate.toFixed(1)}%
                        </Badge>
                        <Progress value={driver.on_time_rate} className="h-1 w-16" />
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {driver.sla_breaches > 0 ? (
                        <Badge className="bg-destructive/15 text-destructive">{driver.sla_breaches}</Badge>
                      ) : (
                        <Badge className="bg-success/15 text-success">0</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Star className="w-3 h-3 text-warning fill-warning" />
                        <span>{driver.rating.toFixed(1)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(driver.total_distance_km)} km</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default DriverPerformance;
