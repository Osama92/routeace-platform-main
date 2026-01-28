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
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import VendorTargetForm from "@/components/vendor/VendorTargetForm";
import VendorTargetProgress from "@/components/vendor/VendorTargetProgress";
import { useAuth } from "@/contexts/AuthContext";

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
  const [period, setPeriod] = useState("3months");
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const { userRole } = useAuth();

  // Operations role should not see financial data
  const hideFinancialData = userRole === "operations";

  useEffect(() => {
    fetchVendorMetrics();
  }, [period]);

  const getDateRange = () => {
    const end = endOfMonth(new Date());
    let start: Date;
    
    switch (period) {
      case "1month":
        start = startOfMonth(new Date());
        break;
      case "3months":
        start = startOfMonth(subMonths(new Date(), 2));
        break;
      case "6months":
        start = startOfMonth(subMonths(new Date(), 5));
        break;
      case "1year":
        start = startOfMonth(subMonths(new Date(), 11));
        break;
      default:
        start = startOfMonth(subMonths(new Date(), 2));
    }
    
    return { start, end };
  };

  const fetchVendorMetrics = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();

      // Fetch all vendors
      const { data: partnersData, error: partnersError } = await supabase
        .from("partners")
        .select("id, company_name")
        .eq("partner_type", "vendor")
        .eq("approval_status", "approved");

      if (partnersError) throw partnersError;

      // Fetch dispatches with vendor-linked drivers
      const { data: dispatchesData, error: dispatchesError } = await supabase
        .from("dispatches")
        .select(`
          id,
          status,
          scheduled_delivery,
          actual_delivery,
          cost,
          driver_id,
          drivers!inner(partner_id)
        `)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      // Fetch invoices for revenue
      const { data: invoicesData, error: invoicesError } = await supabase
        .from("invoices")
        .select("dispatch_id, total_amount")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      // Fetch SLA breaches
      const { data: breachesData, error: breachesError } = await supabase
        .from("sla_breach_alerts")
        .select("dispatch_id")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      // Create invoice lookup
      const invoiceLookup: Record<string, number> = {};
      invoicesData?.forEach((inv) => {
        if (inv.dispatch_id) {
          invoiceLookup[inv.dispatch_id] = inv.total_amount;
        }
      });

      // Create breach lookup
      const breachLookup = new Set(breachesData?.map((b) => b.dispatch_id) || []);

      // Calculate metrics per vendor
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
        const partnerId = dispatch.drivers?.partner_id;
        if (!partnerId || !metricsMap[partnerId]) return;

        const vendor = metricsMap[partnerId];
        vendor.totalTrips++;

        if (dispatch.status === "delivered") {
          vendor.completedTrips++;

          // Check on-time delivery
          if (dispatch.scheduled_delivery && dispatch.actual_delivery) {
            const scheduled = new Date(dispatch.scheduled_delivery);
            const actual = new Date(dispatch.actual_delivery);
            
            if (actual <= scheduled) {
              vendor.onTimeDeliveries++;
            } else {
              vendor.lateDeliveries++;
            }
          }
        }

        // Add revenue and cost
        vendor.totalRevenue += invoiceLookup[dispatch.id] || 0;
        vendor.totalCost += dispatch.cost || 0;

        // Check SLA breach
        if (breachLookup.has(dispatch.id)) {
          vendor.slaBreaches++;
        }
      });

      // Calculate derived metrics
      Object.values(metricsMap).forEach((vendor) => {
        vendor.onTimeRate = vendor.completedTrips > 0
          ? Math.round((vendor.onTimeDeliveries / vendor.completedTrips) * 100)
          : 0;
        
        vendor.avgTripValue = vendor.completedTrips > 0
          ? Math.round(vendor.totalRevenue / vendor.completedTrips)
          : 0;

        // Performance score: weighted average
        const onTimeWeight = 40;
        const slaWeight = 30;
        const completionWeight = 30;
        
        const completionRate = vendor.totalTrips > 0
          ? (vendor.completedTrips / vendor.totalTrips) * 100
          : 0;
        
        const slaPenalty = vendor.completedTrips > 0
          ? Math.min(100, (vendor.slaBreaches / vendor.completedTrips) * 100 * 2)
          : 0;

        vendor.performanceScore = Math.round(
          (vendor.onTimeRate * onTimeWeight / 100) +
          ((100 - slaPenalty) * slaWeight / 100) +
          (completionRate * completionWeight / 100)
        );
      });

      // Sort by performance score
      const sortedVendors = Object.values(metricsMap)
        .filter((v) => v.totalTrips > 0)
        .sort((a, b) => b.performanceScore - a.performanceScore);

      setVendors(sortedVendors);
    } catch (error) {
      console.error("Error fetching vendor metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  const getScoreBadge = (score: number) => {
    if (score >= 80) return <Badge className="bg-success text-success-foreground">Excellent</Badge>;
    if (score >= 60) return <Badge className="bg-warning text-warning-foreground">Good</Badge>;
    if (score >= 40) return <Badge variant="secondary">Average</Badge>;
    return <Badge variant="destructive">Needs Improvement</Badge>;
  };

  const chartData = vendors.slice(0, 10).map((v) => ({
    name: v.name.length > 15 ? v.name.slice(0, 15) + "..." : v.name,
    "On-Time Rate": v.onTimeRate,
    "Performance Score": v.performanceScore,
    Trips: v.completedTrips,
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
      title="Vendor Performance"
      subtitle="Track and analyze vendor partner metrics and delivery performance"
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
            <div className="flex items-center justify-between">
              <div className="flex gap-3">
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1month">This Month</SelectItem>
                    <SelectItem value="3months">Last 3 Months</SelectItem>
                    <SelectItem value="6months">Last 6 Months</SelectItem>
                    <SelectItem value="1year">Last Year</SelectItem>
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
                  label: "Active Vendors",
                  value: vendors.length.toString(),
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
                  Vendor Comparison
                </CardTitle>
              </CardHeader>
              <CardContent>
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
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="On-Time Rate" fill="hsl(var(--primary))" />
                      <Bar dataKey="Performance Score" fill="hsl(var(--success))" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Vendors Table */}
            <Card>
              <CardHeader>
                <CardTitle>Vendor Rankings</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead className="text-center">Trips</TableHead>
                      <TableHead className="text-center">On-Time Rate</TableHead>
                      <TableHead className="text-center">SLA Breaches</TableHead>
                      {!hideFinancialData && <TableHead className="text-right">Revenue</TableHead>}
                      {!hideFinancialData && <TableHead className="text-right">Avg. Trip Value</TableHead>}
                      <TableHead className="text-center">Score</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendors.map((vendor, index) => (
                      <TableRow key={vendor.id}>
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell className="font-medium">{vendor.name}</TableCell>
                        <TableCell className="text-center">{vendor.completedTrips}</TableCell>
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
                    ))}
                    {vendors.length === 0 && !loading && (
                      <TableRow>
                        <TableCell colSpan={hideFinancialData ? 7 : 9} className="text-center py-8 text-muted-foreground">
                          No vendor data available for this period
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