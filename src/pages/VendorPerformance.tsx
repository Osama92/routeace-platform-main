import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Handshake,
  TrendingUp,
  TrendingDown,
  Truck,
  Clock,
  AlertTriangle,
  DollarSign,
  BarChart3,
  Download,
  RefreshCw,
  Target,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth } from "date-fns";
import VendorTargetForm from "@/components/vendor/VendorTargetForm";
import VendorTargetProgress from "@/components/vendor/VendorTargetProgress";
import { useAuth } from "@/contexts/AuthContext";

const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

interface VendorMetrics {
  id: string;
  name: string;
  totalTrips: number;
  completedTrips: number;
  onTimeDeliveries: number;
  lateDeliveries: number;
  slaBreaches: number;
  totalRevenue: number;
  totalCost: number;
  avgTripValue: number;
  onTimeRate: number;
  performanceScore: number;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format(amount);
};

const VendorPerformance = () => {
  const [vendors, setVendors] = useState<VendorMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [activeTab, setActiveTab] = useState("overview");
  const { userRole } = useAuth();

  // Operations role should not see financial data
  const hideFinancialData = userRole === "operations";

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  useEffect(() => {
    fetchVendorMetrics();
  }, [selectedMonth, selectedYear]);

  const getDateRange = () => {
    const start = startOfMonth(new Date(selectedYear, selectedMonth - 1));
    const end = endOfMonth(new Date(selectedYear, selectedMonth - 1));
    return { start, end };
  };

  const [vendorTargets, setVendorTargets] = useState<Record<string, number>>({});

  const fetchVendorMetrics = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();
      const mtdStart = start.toISOString().split("T")[0];
      const mtdEnd = end.toISOString().split("T")[0];

      // Fetch all partners regardless of partner_type
      const { data: partnersData, error: partnersError } = await supabase
        .from("partners")
        .select("id, company_name, partner_type");

      if (partnersError) throw partnersError;

      const DEFAULT_ETA_DAYS = 2;

      // Fetch dispatches in the selected month.
      // Vehicles link to partners via vendor_id (set in Fleet when fleet_type = "3pl").
      // Drivers also have partner_id as a fallback.
      const { data: dispatchesData } = await supabase
        .from("dispatches")
        .select(`
          id,
          status,
          actual_pickup,
          scheduled_pickup,
          actual_delivery,
          created_at,
          cost,
          driver_id,
          vehicle_id,
          vehicles(vendor_id, partner_id),
          drivers(partner_id),
          routes:route_id(estimated_duration_hours)
        `)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      const dispatchIds = (dispatchesData || []).map((d: any) => d.id).filter(Boolean);

      // Revenue: invoices linked to dispatches in this period (by dispatch_id),
      // or invoices with invoice_date in this month if not dispatch-linked.
      const { data: invoicesData } = dispatchIds.length > 0
        ? await supabase.from("invoices").select("dispatch_id, total_amount").in("dispatch_id", dispatchIds)
        : { data: [] };

      // SLA breaches for dispatches in the period
      const { data: breachesData } = dispatchIds.length > 0
        ? await supabase.from("sla_breach_alerts").select("dispatch_id").in("dispatch_id", dispatchIds)
        : { data: [] };

      // Fetch trip targets for the selected month (sum across all truck types per vendor)
      const { data: targetsData } = await supabase
        .from("vendor_truck_targets")
        .select("vendor_id, target_trips")
        .eq("target_month", selectedMonth)
        .eq("target_year", selectedYear);

      const targetsMap: Record<string, number> = {};
      (targetsData || []).forEach((t: any) => {
        targetsMap[t.vendor_id] = (targetsMap[t.vendor_id] || 0) + t.target_trips;
      });
      setVendorTargets(targetsMap);

      // Invoice lookup by dispatch_id
      const invoiceLookup: Record<string, number> = {};
      invoicesData?.forEach((inv) => {
        if (inv.dispatch_id) {
          invoiceLookup[inv.dispatch_id] = (invoiceLookup[inv.dispatch_id] || 0) + Number(inv.total_amount || 0);
        }
      });

      const breachLookup = new Set(breachesData?.map((b) => b.dispatch_id) || []);

      // Build metrics per partner
      const metricsMap: Record<string, VendorMetrics> = {};
      partnersData?.forEach((partner) => {
        metricsMap[partner.id] = {
          id: partner.id,
          name: partner.company_name,
          totalTrips: 0,
          completedTrips: 0,
          onTimeDeliveries: 0,
          lateDeliveries: 0,
          slaBreaches: 0,
          totalRevenue: 0,
          totalCost: 0,
          avgTripValue: 0,
          onTimeRate: 0,
          performanceScore: 0,
        };
      });

      dispatchesData?.forEach((dispatch: any) => {
        const veh = Array.isArray(dispatch.vehicles) ? dispatch.vehicles[0] : dispatch.vehicles;
        const drv = Array.isArray(dispatch.drivers) ? dispatch.drivers[0] : dispatch.drivers;
        // vendor_id is what Fleet saves when assigning a 3PL partner to a vehicle.
        // Fall back to partner_id on vehicle, then partner_id on driver.
        const partnerId = veh?.vendor_id || veh?.partner_id || drv?.partner_id;
        if (!partnerId || !metricsMap[partnerId]) return;

        const vendor = metricsMap[partnerId];
        vendor.totalTrips++;

        if (dispatch.status === "delivered") {
          vendor.completedTrips++;
          const startDate = dispatch.actual_pickup || dispatch.scheduled_pickup || dispatch.created_at;
          if (startDate && dispatch.actual_delivery) {
            const msInTransit = new Date(dispatch.actual_delivery).getTime() - new Date(startDate).getTime();
            if (msInTransit >= 0) {
              const hoursInTransit = msInTransit / (1000 * 60 * 60);
              const routeRow = Array.isArray(dispatch.routes) ? dispatch.routes[0] : dispatch.routes;
              const targetHours = (routeRow?.estimated_duration_hours ? Number(routeRow.estimated_duration_hours) : DEFAULT_ETA_DAYS) * 24;
              if (hoursInTransit <= targetHours) vendor.onTimeDeliveries++;
              else vendor.lateDeliveries++;
            }
          }
        }

        vendor.totalRevenue += invoiceLookup[dispatch.id] || 0;
        vendor.totalCost += dispatch.cost || 0;
        if (breachLookup.has(dispatch.id)) vendor.slaBreaches++;
      });

      Object.values(metricsMap).forEach((vendor) => {
        const trackedTrips = vendor.onTimeDeliveries + vendor.lateDeliveries;
        vendor.onTimeRate = trackedTrips > 0
          ? Math.round((vendor.onTimeDeliveries / trackedTrips) * 100) : 0;
        vendor.avgTripValue = vendor.completedTrips > 0
          ? Math.round(vendor.totalRevenue / vendor.completedTrips) : 0;

        const slaPenalty = vendor.completedTrips > 0
          ? Math.min(100, (vendor.slaBreaches / vendor.completedTrips) * 100 * 2) : 0;
        const slaScore = 100 - slaPenalty;

        // Score = 50% Target Attainment + 25% On-Time + 25% SLA
        // Each component: (actual % achieved) × weight
        // e.g. 10% of target → 10% × 50 = 5 pts; 80% OTD → 80% × 25 = 20 pts; etc.
        // Max possible = 50 + 25 + 25 = 100
        const target = targetsMap[vendor.id] || 0;
        const targetAttainmentPct = target > 0
          ? Math.min(100, (vendor.completedTrips / target) * 100) : 0;

        vendor.performanceScore = Math.round(
          (targetAttainmentPct * 50 / 100) +
          (vendor.onTimeRate * 25 / 100) +
          (slaScore * 25 / 100)
        );
      });

      // Only show partners that have activity in this period OR have targets set
      const sortedVendors = Object.values(metricsMap)
        .filter((v) => v.totalTrips > 0 || targetsMap[v.id] > 0)
        .sort((a, b) => b.performanceScore - a.performanceScore);

      setVendors(sortedVendors);
    } catch (error) {
      console.error("Error fetching vendor metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  const getScoreBadge = (score: number) => {
    if (score >= 75) return <Badge className="bg-success text-success-foreground">Excellent</Badge>;
    if (score >= 55) return <Badge className="bg-warning text-warning-foreground">Good</Badge>;
    if (score >= 35) return <Badge variant="secondary">Average</Badge>;
    return <Badge variant="destructive">Needs Improvement</Badge>;
  };

  const chartData = vendors
    .filter(v => v.totalTrips > 0)
    .slice(0, 10)
    .map((v) => ({
      name: v.name.length > 15 ? v.name.slice(0, 15) + "..." : v.name,
      "On-Time Rate": v.onTimeRate,
      "Performance Score": v.performanceScore,
      "Trips": v.completedTrips,
      "Target": vendorTargets[v.id] || 0,
      "Revenue (₦k)": Math.round(v.totalRevenue / 1000),
    }));

  const totals = vendors.reduce(
    (acc, v) => ({
      trips: acc.trips + v.completedTrips,
      revenue: acc.revenue + v.totalRevenue,
      onTime: acc.onTime + v.onTimeDeliveries,
      breaches: acc.breaches + v.slaBreaches,
    }),
    { trips: 0, revenue: 0, onTime: 0, breaches: 0 }
  );

  const avgOnTimeRate = totals.trips > 0 
    ? Math.round((totals.onTime / totals.trips) * 100) 
    : 0;

  return (
    <DashboardLayout
      title="Partner Performance"
      subtitle="Track and analyze partner metrics and delivery performance"
    >
      <div className="space-y-6">
        {/* Tabs for different sections */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Overview
            </TabsTrigger>
            {userRole === "admin" && (
              <TabsTrigger value="targets" className="flex items-center gap-2">
                <Target className="w-4 h-4" />
                Set Targets
              </TabsTrigger>
            )}
            <TabsTrigger value="progress" className="flex items-center gap-2">
              <Truck className="w-4 h-4" />
              Target Progress
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6 mt-6">
            {/* Header Actions */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex gap-2">
                <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Month" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m) => (
                      <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                  <SelectTrigger className="w-24">
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={fetchVendorMetrics} disabled={loading}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
              </div>
            </div>

            {/* Summary Cards */}
            <div className={`grid grid-cols-1 ${hideFinancialData ? "md:grid-cols-3" : "md:grid-cols-4"} gap-4`}>
              {[
                {
                  label: "Active Partners",
                  value: vendors.filter(v => v.totalTrips > 0).length.toString(),
                  icon: Handshake,
                  color: "text-primary",
                },
                {
                  label: "Total Trips",
                  value: totals.trips.toLocaleString(),
                  icon: Truck,
                  color: "text-blue-500",
                },
                {
                  label: "Avg. On-Time Rate",
                  value: `${avgOnTimeRate}%`,
                  icon: Clock,
                  color: avgOnTimeRate >= 80 ? "text-success" : "text-warning",
                },
                // Only show Total Revenue for non-Operations users
                ...(!hideFinancialData ? [{
                  label: "Total Revenue",
                  value: formatCurrency(totals.revenue),
                  icon: DollarSign,
                  color: "text-success",
                }] : []),
              ].map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">{stat.label}</p>
                          <p className="text-2xl font-bold">{stat.value}</p>
                        </div>
                        <stat.icon className={`w-8 h-8 ${stat.color} opacity-70`} />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* Performance Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Partner Comparison — {MONTHS.find(m => m.value === selectedMonth)?.label} {selectedYear}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {vendors.length === 0 && !loading ? (
                  <div className="h-80 flex items-center justify-center text-center text-muted-foreground text-sm px-8">
                    No partner data for this period. Ensure each vehicle used in dispatches has a Partner assigned (Fleet → edit vehicle → Partner field), or each driver has a Partner set.
                  </div>
                ) : (
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ left: 0, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 11 }}
                          angle={-45}
                          textAnchor="end"
                          height={80}
                        />
                        <YAxis yAxisId="left" />
                        {!hideFinancialData && (
                          <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `₦${v}k`} />
                        )}
                        <Tooltip
                          formatter={(value, name) =>
                            name === "Revenue (₦k)"
                              ? [`₦${Number(value).toLocaleString()}k`, "Revenue"]
                              : [value, name]
                          }
                        />
                        <Legend />
                        <Bar yAxisId="left" dataKey="Trips" fill="hsl(var(--primary))" />
                        <Bar yAxisId="left" dataKey="Target" fill="hsl(var(--muted-foreground))" opacity={0.5} />
                        <Bar yAxisId="left" dataKey="On-Time Rate" fill="hsl(var(--success))" />
                        {!hideFinancialData && (
                          <Bar yAxisId="right" dataKey="Revenue (₦k)" fill="hsl(var(--warning))" />
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Vendors Table */}
            <Card>
              <CardHeader>
                <CardTitle>Partner Rankings</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Partner</TableHead>
                      <TableHead className="text-center">Trips vs Target</TableHead>
                      <TableHead className="text-center">On-Time Rate</TableHead>
                      <TableHead className="text-center">SLA Breaches</TableHead>
                      {!hideFinancialData && <TableHead className="text-right">Revenue</TableHead>}
                      {!hideFinancialData && <TableHead className="text-right">Avg. Trip Value</TableHead>}
                      <TableHead className="text-center">
                        <span title="Score = 50% Target Attainment + 25% On-Time Rate + 25% SLA Compliance">Score ⓘ</span>
                      </TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendors.map((vendor, index) => {
                      const target = vendorTargets[vendor.id] || 0;
                      const tripPct = target > 0 ? Math.round((vendor.completedTrips / target) * 100) : null;
                      return (
                      <TableRow key={vendor.id}>
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell className="font-medium">{vendor.name}</TableCell>
                        <TableCell className="text-center">
                          {target > 0 ? (
                            <div className="space-y-1 min-w-[100px]">
                              <div className="text-sm">
                                <span className="font-medium">{vendor.completedTrips}</span>
                                <span className="text-muted-foreground"> / {target}</span>
                                <span className={`ml-1 text-xs font-semibold ${tripPct! >= 80 ? "text-success" : tripPct! >= 50 ? "text-warning" : "text-destructive"}`}>
                                  ({tripPct}%)
                                </span>
                              </div>
                              <Progress value={Math.min(tripPct!, 100)} className="h-1.5" />
                            </div>
                          ) : (
                            <span className="text-muted-foreground">{vendor.completedTrips} <span className="text-xs">(no target)</span></span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center gap-2">
                            <Progress
                              value={vendor.onTimeRate}
                              className="h-2 w-16"
                            />
                            <span className={vendor.onTimeRate >= 80 ? "text-success" : "text-warning"}>
                              {vendor.onTimeRate}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {vendor.slaBreaches > 0 ? (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              {vendor.slaBreaches}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-success/10 text-success">0</Badge>
                          )}
                        </TableCell>
                        {!hideFinancialData && (
                          <TableCell className="text-right">
                            {formatCurrency(vendor.totalRevenue)}
                          </TableCell>
                        )}
                        {!hideFinancialData && (
                          <TableCell className="text-right">
                            {formatCurrency(vendor.avgTripValue)}
                          </TableCell>
                        )}
                        <TableCell className="text-center font-bold">
                          {vendor.performanceScore}
                        </TableCell>
                        <TableCell className="text-center">
                          {getScoreBadge(vendor.performanceScore)}
                        </TableCell>
                      </TableRow>
                      );
                    })}
                    {vendors.length === 0 && !loading && (
                      <TableRow>
                        <TableCell colSpan={hideFinancialData ? 7 : 9} className="text-center py-8 text-muted-foreground">
                          No partner activity for {MONTHS.find(m => m.value === selectedMonth)?.label} {selectedYear}. Ensure vehicles used in dispatches have a Partner assigned (Fleet → edit vehicle → Partner field).
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Set Targets Tab (Admin Only) */}
          {userRole === "admin" && (
            <TabsContent value="targets" className="mt-6">
              <VendorTargetForm onSaveComplete={() => setActiveTab("progress")} />
            </TabsContent>
          )}

          {/* Target Progress Tab */}
          <TabsContent value="progress" className="mt-6">
            <VendorTargetProgress />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default VendorPerformance;