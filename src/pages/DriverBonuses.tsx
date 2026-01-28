import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Gift,
  Settings,
  Calculator,
  Trophy,
  CheckCircle,
  XCircle,
  Loader2,
  Calendar,
  TrendingUp,
  Star,
  Clock,
  Target,
  History,
  Plus,
  Save,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, subMonths, parseISO } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";

interface BonusConfig {
  id: string;
  bonus_type: string;
  metric: string;
  threshold: number;
  bonus_amount: number;
  is_active: boolean;
}

interface DriverBonus {
  id: string;
  driver_id: string;
  driver_name: string;
  bonus_type: string;
  amount: number;
  metrics: Record<string, any>;
  status: string;
  period_start: string;
  period_end: string;
  created_at: string;
}

interface DriverMetrics {
  driver_id: string;
  driver_name: string;
  trip_count: number;
  on_time_rate: number;
  rating: number;
  sla_breaches: number;
  eligible_bonuses: { type: string; amount: number; metric_value: number; threshold: number }[];
  total_bonus: number;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format(amount);
};

const bonusTypeLabels: Record<string, { label: string; icon: any; color: string }> = {
  trip_completion: { label: "Trip Completion", icon: Target, color: "bg-primary/10 text-primary" },
  on_time_delivery: { label: "On-Time Delivery", icon: Clock, color: "bg-success/10 text-success" },
  rating_bonus: { label: "Rating Bonus", icon: Star, color: "bg-warning/10 text-warning" },
  zero_breach: { label: "Zero SLA Breach", icon: Trophy, color: "bg-info/10 text-info" },
};

const DriverBonuses = () => {
  const [configs, setConfigs] = useState<BonusConfig[]>([]);
  const [driverMetrics, setDriverMetrics] = useState<DriverMetrics[]>([]);
  const [bonusHistory, setBonusHistory] = useState<DriverBonus[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [selectedDriverIds, setSelectedDriverIds] = useState<Set<string>>(new Set());
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [editingConfig, setEditingConfig] = useState<BonusConfig | null>(null);
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  // Generate month options
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const date = subMonths(new Date(), i);
    return {
      value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: format(date, "MMMM yyyy"),
    };
  });

  const fetchConfigs = async () => {
    try {
      const { data, error } = await supabase
        .from("driver_bonus_config")
        .select("*")
        .order("bonus_type");

      if (error) throw error;
      setConfigs(data || []);
    } catch (error: any) {
      console.error("Failed to fetch bonus configs:", error);
    }
  };

  const fetchBonusHistory = async () => {
    try {
      const { data, error } = await supabase
        .from("driver_bonuses")
        .select(`
          *,
          drivers (full_name)
        `)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      
      setBonusHistory((data || []).map((b: any) => ({
        ...b,
        driver_name: b.drivers?.full_name || "Unknown",
      })));
    } catch (error: any) {
      console.error("Failed to fetch bonus history:", error);
    }
  };

  const calculateBonuses = async () => {
    setCalculating(true);
    try {
      const [year, month] = selectedMonth.split("-").map(Number);
      const startDate = startOfMonth(new Date(year, month - 1));
      const endDate = endOfMonth(new Date(year, month - 1));

      // Fetch drivers
      const { data: drivers, error: driverErr } = await supabase
        .from("drivers")
        .select("id, full_name, rating")
        .eq("driver_type", "owned")
        .eq("status", "active");

      if (driverErr) throw driverErr;

      // Fetch dispatches for the period
      const { data: dispatches, error: dispatchErr } = await supabase
        .from("dispatches")
        .select("id, driver_id, status, scheduled_delivery, actual_delivery")
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString());

      if (dispatchErr) throw dispatchErr;

      // Fetch SLA breaches for the period
      const { data: breaches, error: breachErr } = await supabase
        .from("sla_breach_alerts")
        .select("dispatch_id")
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString());

      if (breachErr) throw breachErr;

      // Group data by driver
      const dispatchesByDriver: Record<string, any[]> = {};
      const breachesByDispatch = new Set((breaches || []).map(b => b.dispatch_id));

      (dispatches || []).forEach(d => {
        if (d.driver_id) {
          if (!dispatchesByDriver[d.driver_id]) dispatchesByDriver[d.driver_id] = [];
          dispatchesByDriver[d.driver_id].push(d);
        }
      });

      // Calculate metrics for each driver
      const activeConfigs = configs.filter(c => c.is_active);
      
      const metrics: DriverMetrics[] = (drivers || []).map(driver => {
        const driverDispatches = dispatchesByDriver[driver.id] || [];
        const deliveredTrips = driverDispatches.filter(d => d.status === "delivered");
        
        // Calculate on-time rate
        let onTimeCount = 0;
        deliveredTrips.forEach(d => {
          if (d.scheduled_delivery && d.actual_delivery) {
            const scheduled = new Date(d.scheduled_delivery);
            const actual = new Date(d.actual_delivery);
            if (actual <= scheduled) onTimeCount++;
          } else {
            onTimeCount++; // Count as on-time if no scheduled time
          }
        });
        
        const onTimeRate = deliveredTrips.length > 0 
          ? (onTimeCount / deliveredTrips.length) * 100 
          : 100;

        // Count SLA breaches
        const driverBreaches = driverDispatches.filter(d => breachesByDispatch.has(d.id)).length;

        const driverMetrics = {
          driver_id: driver.id,
          driver_name: driver.full_name,
          trip_count: deliveredTrips.length,
          on_time_rate: onTimeRate,
          rating: driver.rating || 0,
          sla_breaches: driverBreaches,
          eligible_bonuses: [] as { type: string; amount: number; metric_value: number; threshold: number }[],
          total_bonus: 0,
        };

        // Check each bonus type
        activeConfigs.forEach(config => {
          let metricValue = 0;
          let eligible = false;

          switch (config.metric) {
            case "trip_count":
              metricValue = driverMetrics.trip_count;
              eligible = metricValue >= config.threshold;
              break;
            case "on_time_rate":
              metricValue = driverMetrics.on_time_rate;
              eligible = metricValue >= config.threshold;
              break;
            case "rating":
              metricValue = driverMetrics.rating;
              eligible = metricValue >= config.threshold;
              break;
            case "sla_breaches":
              metricValue = driverMetrics.sla_breaches;
              eligible = metricValue <= config.threshold;
              break;
          }

          if (eligible) {
            driverMetrics.eligible_bonuses.push({
              type: config.bonus_type,
              amount: config.bonus_amount,
              metric_value: metricValue,
              threshold: config.threshold,
            });
            driverMetrics.total_bonus += config.bonus_amount;
          }
        });

        return driverMetrics;
      });

      setDriverMetrics(metrics.filter(m => m.eligible_bonuses.length > 0 || m.trip_count > 0));
    } catch (error: any) {
      console.error("Failed to calculate bonuses:", error);
      toast({
        title: "Error",
        description: "Failed to calculate bonuses",
        variant: "destructive",
      });
    } finally {
      setCalculating(false);
    }
  };

  const handleApproveSelected = async () => {
    if (selectedDriverIds.size === 0) {
      toast({
        title: "No Drivers Selected",
        description: "Please select drivers to approve bonuses",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    try {
      const [year, month] = selectedMonth.split("-").map(Number);
      const periodStart = startOfMonth(new Date(year, month - 1)).toISOString().split("T")[0];
      const periodEnd = endOfMonth(new Date(year, month - 1)).toISOString().split("T")[0];

      const selectedMetrics = driverMetrics.filter(m => selectedDriverIds.has(m.driver_id));

      const bonusInserts = selectedMetrics.flatMap(m => 
        m.eligible_bonuses.map(b => ({
          driver_id: m.driver_id,
          bonus_type: b.type,
          amount: b.amount,
          period_start: periodStart,
          period_end: periodEnd,
          metrics: {
            metric_value: b.metric_value,
            threshold: b.threshold,
            trip_count: m.trip_count,
            on_time_rate: m.on_time_rate,
            rating: m.rating,
            sla_breaches: m.sla_breaches,
          },
          status: "approved",
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        }))
      );

      const { error } = await supabase.from("driver_bonuses").insert(bonusInserts);
      if (error) throw error;

      toast({
        title: "Bonuses Approved",
        description: `Approved ${bonusInserts.length} bonuses for ${selectedDriverIds.size} drivers`,
      });

      setSelectedDriverIds(new Set());
      fetchBonusHistory();
    } catch (error: any) {
      console.error("Failed to approve bonuses:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to approve bonuses",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!editingConfig) return;

    try {
      const { error } = await supabase
        .from("driver_bonus_config")
        .update({
          threshold: editingConfig.threshold,
          bonus_amount: editingConfig.bonus_amount,
          is_active: editingConfig.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingConfig.id);

      if (error) throw error;

      toast({
        title: "Configuration Saved",
        description: "Bonus rule updated successfully",
      });

      setIsConfigDialogOpen(false);
      fetchConfigs();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save configuration",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    Promise.all([fetchConfigs(), fetchBonusHistory()]).then(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (configs.length > 0) {
      calculateBonuses();
    }
  }, [selectedMonth, configs]);

  // Totals
  const totals = {
    eligibleDrivers: driverMetrics.filter(m => m.total_bonus > 0).length,
    totalBonus: driverMetrics.reduce((acc, m) => acc + m.total_bonus, 0),
    totalTrips: driverMetrics.reduce((acc, m) => acc + m.trip_count, 0),
    avgOnTime: driverMetrics.length > 0
      ? driverMetrics.reduce((acc, m) => acc + m.on_time_rate, 0) / driverMetrics.length
      : 0,
  };

  return (
    <DashboardLayout
      title="Driver Performance Bonuses"
      subtitle="Configure and manage driver bonus programs"
    >
      <Tabs defaultValue="calculate" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="calculate" className="gap-2">
            <Calculator className="w-4 h-4" />
            Calculate Bonuses
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-2">
            <Settings className="w-4 h-4" />
            Bonus Rules
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="w-4 h-4" />
            History
          </TabsTrigger>
        </TabsList>

        {/* Calculate Tab */}
        <TabsContent value="calculate">
          {/* Controls */}
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-6">
            <div className="flex gap-4 items-center">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Period</Label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-48 bg-secondary/50">
                    <Calendar className="w-4 h-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={calculateBonuses} disabled={calculating}>
                {calculating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Calculator className="w-4 h-4 mr-2" />
                )}
                Recalculate
              </Button>
            </div>
            {selectedDriverIds.size > 0 && (
              <Button 
                onClick={handleApproveSelected} 
                disabled={processing}
                className="bg-success hover:bg-success/90"
              >
                {processing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4 mr-2" />
                )}
                Approve Selected ({selectedDriverIds.size})
              </Button>
            )}
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Eligible Drivers", value: totals.eligibleDrivers, icon: Trophy, color: "bg-primary/10 text-primary" },
              { label: "Total Bonuses", value: formatCurrency(totals.totalBonus), icon: Gift, color: "bg-success/10 text-success" },
              { label: "Total Trips", value: totals.totalTrips, icon: Target, color: "bg-warning/10 text-warning" },
              { label: "Avg On-Time Rate", value: `${totals.avgOnTime.toFixed(1)}%`, icon: Clock, color: "bg-info/10 text-info" },
            ].map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl ${stat.color} flex items-center justify-center`}>
                        <stat.icon className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-2xl font-heading font-bold">{stat.value}</p>
                        <p className="text-sm text-muted-foreground">{stat.label}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Driver Metrics Table */}
          {calculating ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : driverMetrics.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Trophy className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">No driver data for this period</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Driver Performance & Eligible Bonuses</CardTitle>
                <CardDescription>
                  {monthOptions.find(m => m.value === selectedMonth)?.label}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedDriverIds.size === driverMetrics.filter(m => m.total_bonus > 0).length}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedDriverIds(new Set(driverMetrics.filter(m => m.total_bonus > 0).map(m => m.driver_id)));
                            } else {
                              setSelectedDriverIds(new Set());
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead className="text-center">Trips</TableHead>
                      <TableHead className="text-center">On-Time</TableHead>
                      <TableHead className="text-center">Rating</TableHead>
                      <TableHead className="text-center">Breaches</TableHead>
                      <TableHead>Eligible Bonuses</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {driverMetrics.map((m) => (
                      <TableRow key={m.driver_id} className={selectedDriverIds.has(m.driver_id) ? "bg-primary/5" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={selectedDriverIds.has(m.driver_id)}
                            disabled={m.total_bonus === 0}
                            onCheckedChange={() => {
                              const next = new Set(selectedDriverIds);
                              if (next.has(m.driver_id)) {
                                next.delete(m.driver_id);
                              } else {
                                next.add(m.driver_id);
                              }
                              setSelectedDriverIds(next);
                            }}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{m.driver_name}</TableCell>
                        <TableCell className="text-center">{m.trip_count}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={m.on_time_rate >= 95 ? "default" : "secondary"}>
                            {m.on_time_rate.toFixed(0)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Star className="w-3 h-3 text-warning" />
                            {m.rating.toFixed(1)}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {m.sla_breaches === 0 ? (
                            <CheckCircle className="w-4 h-4 text-success mx-auto" />
                          ) : (
                            <Badge variant="destructive">{m.sla_breaches}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {m.eligible_bonuses.map((b, i) => {
                              const info = bonusTypeLabels[b.type] || { label: b.type, color: "bg-muted" };
                              return (
                                <Badge key={i} variant="outline" className="text-xs">
                                  {info.label}: {formatCurrency(b.amount)}
                                </Badge>
                              );
                            })}
                            {m.eligible_bonuses.length === 0 && (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-success">
                          {m.total_bonus > 0 ? formatCurrency(m.total_bonus) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Config Tab */}
        <TabsContent value="config">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {configs.map((config) => {
              const info = bonusTypeLabels[config.bonus_type] || { 
                label: config.bonus_type, 
                icon: Gift, 
                color: "bg-muted" 
              };
              const Icon = info.icon;

              return (
                <motion.div
                  key={config.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Card className={!config.is_active ? "opacity-60" : ""}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg ${info.color} flex items-center justify-center`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div>
                            <CardTitle className="text-lg">{info.label}</CardTitle>
                            <CardDescription>Metric: {config.metric}</CardDescription>
                          </div>
                        </div>
                        <Badge variant={config.is_active ? "default" : "secondary"}>
                          {config.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="p-3 bg-secondary/30 rounded-lg">
                          <p className="text-xs text-muted-foreground">Threshold</p>
                          <p className="font-semibold">
                            {config.metric === "sla_breaches" 
                              ? `≤ ${config.threshold}` 
                              : `≥ ${config.threshold}${config.metric.includes("rate") ? "%" : ""}`}
                          </p>
                        </div>
                        <div className="p-3 bg-success/10 rounded-lg">
                          <p className="text-xs text-muted-foreground">Bonus Amount</p>
                          <p className="font-semibold text-success">{formatCurrency(config.bonus_amount)}</p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setEditingConfig(config);
                          setIsConfigDialogOpen(true);
                        }}
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        Configure
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          {bonusHistory.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <History className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">No bonus history yet</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Approved Bonuses</CardTitle>
                <CardDescription>History of all processed driver bonuses</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Driver</TableHead>
                      <TableHead>Bonus Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Approved</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bonusHistory.map((bonus) => {
                      const info = bonusTypeLabels[bonus.bonus_type] || { label: bonus.bonus_type };
                      return (
                        <TableRow key={bonus.id}>
                          <TableCell className="font-medium">{bonus.driver_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{info.label}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-success">
                            {formatCurrency(bonus.amount)}
                          </TableCell>
                          <TableCell>
                            {bonus.period_start && format(parseISO(bonus.period_start), "MMM yyyy")}
                          </TableCell>
                          <TableCell>
                            <Badge variant={bonus.status === "approved" ? "default" : "secondary"}>
                              {bonus.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(parseISO(bonus.created_at), "PP")}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Config Edit Dialog */}
      <Dialog open={isConfigDialogOpen} onOpenChange={setIsConfigDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure Bonus Rule</DialogTitle>
            <DialogDescription>
              Update the threshold and bonus amount for this rule
            </DialogDescription>
          </DialogHeader>
          {editingConfig && (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between">
                <Label>Status</Label>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editingConfig.is_active}
                    onCheckedChange={(checked) => 
                      setEditingConfig({ ...editingConfig, is_active: checked })
                    }
                  />
                  <span className="text-sm">{editingConfig.is_active ? "Active" : "Inactive"}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Threshold ({editingConfig.metric})</Label>
                <Input
                  type="number"
                  value={editingConfig.threshold}
                  onChange={(e) => 
                    setEditingConfig({ ...editingConfig, threshold: parseFloat(e.target.value) || 0 })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {editingConfig.metric === "sla_breaches"
                    ? "Driver must have this many or fewer breaches"
                    : "Driver must meet or exceed this value"}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Bonus Amount (₦)</Label>
                <Input
                  type="number"
                  value={editingConfig.bonus_amount}
                  onChange={(e) => 
                    setEditingConfig({ ...editingConfig, bonus_amount: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfigDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveConfig}>
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default DriverBonuses;
