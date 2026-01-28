import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Users,
  Activity,
  TrendingUp,
  Clock,
  Package,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Zap,
  Target,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

interface DailyMetrics {
  date: string;
  sessions: number;
  dispatches: number;
  invoices: number;
  revenue: number;
}

const ProductMetricsPage = () => {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    totalUsers: 0,
    activeSessions: 0,
    totalDispatches: 0,
    totalInvoices: 0,
    totalRevenue: 0,
    avgSessionMinutes: 0,
    slaBreachRate: 0,
    onTimeRate: 0,
  });
  const [dailyData, setDailyData] = useState<DailyMetrics[]>([]);
  const [featureUsage, setFeatureUsage] = useState<{ name: string; value: number; color: string }[]>([]);

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    try {
      // Fetch user count from profiles
      const { count: userCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });

      // Fetch session data
      const { data: sessions } = await supabase
        .from("user_sessions")
        .select("*")
        .gte("login_at", subDays(new Date(), 30).toISOString());

      // Fetch dispatches
      const { data: dispatches } = await supabase
        .from("dispatches")
        .select("id, status, created_at, scheduled_delivery, actual_delivery")
        .gte("created_at", subDays(new Date(), 30).toISOString());

      // Fetch invoices
      const { data: invoices } = await supabase
        .from("invoices")
        .select("id, total_amount, created_at, status")
        .gte("created_at", subDays(new Date(), 30).toISOString());

      // Fetch SLA breaches
      const { count: breachCount } = await supabase
        .from("sla_breach_alerts")
        .select("*", { count: "exact", head: true })
        .gte("created_at", subDays(new Date(), 30).toISOString());

      // Calculate metrics
      const totalRevenue = (invoices || []).reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
      
      const avgSessionMinutes = sessions?.length 
        ? sessions.reduce((sum, s) => sum + (s.session_duration_minutes || 0), 0) / sessions.length 
        : 0;

      // Calculate on-time rate
      const deliveredWithTimes = (dispatches || []).filter(
        d => d.status === "delivered" && d.scheduled_delivery && d.actual_delivery
      );
      const onTime = deliveredWithTimes.filter(
        d => new Date(d.actual_delivery!) <= new Date(d.scheduled_delivery!)
      ).length;
      const onTimeRate = deliveredWithTimes.length > 0 ? (onTime / deliveredWithTimes.length) * 100 : 0;

      const slaBreachRate = (dispatches?.length || 0) > 0 
        ? ((breachCount || 0) / (dispatches?.length || 1)) * 100 
        : 0;

      setMetrics({
        totalUsers: userCount || 0,
        activeSessions: sessions?.filter(s => !s.logout_at).length || 0,
        totalDispatches: dispatches?.length || 0,
        totalInvoices: invoices?.length || 0,
        totalRevenue,
        avgSessionMinutes: Math.round(avgSessionMinutes),
        slaBreachRate: Math.round(slaBreachRate * 10) / 10,
        onTimeRate: Math.round(onTimeRate * 10) / 10,
      });

      // Build daily data for charts
      const last14Days: DailyMetrics[] = [];
      for (let i = 13; i >= 0; i--) {
        const date = subDays(new Date(), i);
        const dayStart = startOfDay(date);
        const dayEnd = endOfDay(date);
        
        const daySessions = (sessions || []).filter(s => 
          new Date(s.login_at) >= dayStart && new Date(s.login_at) <= dayEnd
        ).length;
        
        const dayDispatches = (dispatches || []).filter(d => 
          new Date(d.created_at) >= dayStart && new Date(d.created_at) <= dayEnd
        ).length;
        
        const dayInvoices = (invoices || []).filter(inv => 
          new Date(inv.created_at) >= dayStart && new Date(inv.created_at) <= dayEnd
        );
        
        const dayRevenue = dayInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);

        last14Days.push({
          date: format(date, "MMM dd"),
          sessions: daySessions,
          dispatches: dayDispatches,
          invoices: dayInvoices.length,
          revenue: dayRevenue,
        });
      }
      setDailyData(last14Days);

      // Feature usage breakdown (simulated based on data)
      setFeatureUsage([
        { name: "Dispatch", value: dispatches?.length || 0, color: "hsl(var(--primary))" },
        { name: "Invoicing", value: invoices?.length || 0, color: "hsl(var(--success))" },
        { name: "Tracking", value: Math.round((dispatches?.length || 0) * 0.8), color: "hsl(var(--warning))" },
        { name: "Reports", value: Math.round((sessions?.length || 0) * 0.4), color: "hsl(var(--info))" },
      ]);

    } catch (error) {
      console.error("Error fetching metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `₦${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `₦${(value / 1000).toFixed(0)}K`;
    return `₦${value.toFixed(0)}`;
  };

  const kpis = [
    { title: "Total Users", value: metrics.totalUsers, icon: Users, color: "text-primary" },
    { title: "Active Sessions", value: metrics.activeSessions, icon: Activity, color: "text-success" },
    { title: "Dispatches (30d)", value: metrics.totalDispatches, icon: Package, color: "text-info" },
    { title: "Revenue (30d)", value: formatCurrency(metrics.totalRevenue), icon: DollarSign, color: "text-warning" },
    { title: "Avg Session", value: `${metrics.avgSessionMinutes}m`, icon: Clock, color: "text-muted-foreground" },
    { title: "On-Time Rate", value: `${metrics.onTimeRate}%`, icon: CheckCircle, color: "text-success" },
    { title: "SLA Breach Rate", value: `${metrics.slaBreachRate}%`, icon: AlertTriangle, color: "text-destructive" },
    { title: "Invoices (30d)", value: metrics.totalInvoices, icon: Target, color: "text-primary" },
  ];

  if (loading) {
    return (
      <DashboardLayout title="Product Metrics" subtitle="Loading...">
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Product Metrics"
      subtitle="Key metrics for product development and management"
    >
      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-8">
        {kpis.map((kpi, index) => (
          <motion.div
            key={kpi.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            className="glass-card p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
            </div>
            <p className="text-xl font-heading font-bold text-foreground">{kpi.value}</p>
            <p className="text-xs text-muted-foreground">{kpi.title}</p>
          </motion.div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* User Activity Trend */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="glass-card border-border/50">
            <CardHeader>
              <CardTitle className="text-sm font-heading flex items-center gap-2">
                <Activity className="w-4 h-4" />
                User Sessions (14 days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={dailyData}>
                  <defs>
                    <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="sessions"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#colorSessions)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Dispatch Volume */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <Card className="glass-card border-border/50">
            <CardHeader>
              <CardTitle className="text-sm font-heading flex items-center gap-2">
                <Package className="w-4 h-4" />
                Dispatch Volume (14 days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <Bar dataKey="dispatches" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Trend */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-2"
        >
          <Card className="glass-card border-border/50">
            <CardHeader>
              <CardTitle className="text-sm font-heading flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Revenue Trend (14 days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                  <YAxis 
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} 
                    tickFormatter={(value) => formatCurrency(value)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number) => [formatCurrency(value), "Revenue"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(var(--warning))"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "hsl(var(--warning))" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Feature Usage */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          <Card className="glass-card border-border/50">
            <CardHeader>
              <CardTitle className="text-sm font-heading flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Feature Usage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={featureUsage}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {featureUsage.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {featureUsage.map((item) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-xs text-muted-foreground">{item.name} ({item.value})</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default ProductMetricsPage;
