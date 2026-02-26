import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  Clock,
  Activity,
  Timer,
  TrendingUp,
  Calendar,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

interface SessionData {
  id: string;
  user_id: string;
  login_at: string | null;
  logout_at: string | null;
  session_duration_minutes: number | null;
  user_email?: string;
  user_full_name?: string;
}

interface DailySummary {
  date: string;
  total_sessions: number;
  unique_users: number;
  total_hours: number;
  avg_duration: number;
}

interface HourlyData {
  hour: string;
  active_users: number;
}

interface UserDurationSummary {
  user_id: string;
  user_full_name: string;
  user_email: string;
  total_sessions: number;
  total_minutes: number;
  avg_minutes: number;
}

const SessionAnalytics = () => {
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [dailySummary, setDailySummary] = useState<DailySummary[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
  const [userDurations, setUserDurations] = useState<UserDurationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState("14");
  const { toast } = useToast();

  // Returns effective duration in minutes.
  // - Ended sessions: use the stored session_duration_minutes.
  // - Sessions started within the last 8 hours with no logout: they are genuinely
  //   still active, so compute elapsed time from login_at to now.
  // - Older sessions with no logout_at: treat as 0 — these are zombie records from
  //   browser crashes / tab closes where the unload beacon failed. Including them
  //   would inflate totals drastically (e.g. a session from 3 days ago would add
  //   4320 minutes to the sum).
  const MAX_ACTIVE_SESSION_HOURS = 8;
  const getEffectiveDuration = (session: SessionData): number => {
    if (session.session_duration_minutes != null) {
      return session.session_duration_minutes;
    }
    if (session.login_at && !session.logout_at) {
      const elapsedMinutes = Math.round((Date.now() - new Date(session.login_at).getTime()) / 60000);
      if (elapsedMinutes <= MAX_ACTIVE_SESSION_HOURS * 60) {
        return elapsedMinutes;
      }
      // Stale unclosed session — cap to avoid inflating totals
      return 0;
    }
    return 0;
  };

  // KPI stats
  const [stats, setStats] = useState({
    todaySessions: 0,
    activeUsers: 0,
    avgDuration: 0,
    totalHoursToday: 0,
  });

  useEffect(() => {
    fetchSessionData();
  }, [dateRange]);

  const fetchSessionData = async () => {
    try {
      setLoading(true);
      const daysAgo = parseInt(dateRange);
      const startDate = startOfDay(subDays(new Date(), daysAgo));
      const today = new Date();
      const todayStart = startOfDay(today);
      const todayEnd = endOfDay(today);

      // Fetch sessions with user info
      const { data: sessionsData, error: sessionsError } = await supabase
        .from("user_sessions")
        .select("*")
        .gte("login_at", startDate.toISOString())
        .order("login_at", { ascending: false });

      if (sessionsError) throw sessionsError;

      // Fetch profiles to get user emails
      const userIds = [...new Set((sessionsData || []).map(s => s.user_id))];
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("user_id, email, full_name")
        .in("user_id", userIds);

      const profileMap = new Map((profilesData || []).map(p => [p.user_id, p]));

      // Enrich sessions with user info
      const enrichedSessions = (sessionsData || []).map(session => ({
        ...session,
        user_email: profileMap.get(session.user_id)?.email || "Unknown",
        user_full_name: profileMap.get(session.user_id)?.full_name || "Unknown User",
      }));

      setSessions(enrichedSessions);

      // Calculate today's stats
      const todaySessions = enrichedSessions.filter(s => {
        const loginDate = new Date(s.login_at || "");
        return loginDate >= todayStart && loginDate <= todayEnd;
      });

      // Only count sessions as "active" if they have no logout and were started
      // within the last MAX_ACTIVE_SESSION_HOURS (avoids zombie records counting)
      const activeUsers = enrichedSessions.filter(s => {
        if (s.logout_at) return false;
        if (!s.login_at) return false;
        const elapsedMinutes = (Date.now() - new Date(s.login_at).getTime()) / 60000;
        return elapsedMinutes <= MAX_ACTIVE_SESSION_HOURS * 60;
      }).length;

      // Use effective duration (elapsed time for active sessions, stored value for ended)
      // Only include sessions that have measurable duration (> 0) in the average
      const sessionsWithDuration = todaySessions.filter(s => getEffectiveDuration(s) > 0);
      const totalMinutesToday = sessionsWithDuration.reduce((acc, s) =>
        acc + getEffectiveDuration(s), 0);

      const avgDuration = sessionsWithDuration.length > 0
        ? totalMinutesToday / sessionsWithDuration.length
        : 0;

      setStats({
        todaySessions: todaySessions.length,
        activeUsers,
        avgDuration: Math.round(avgDuration),
        totalHoursToday: Math.round(totalMinutesToday / 60 * 10) / 10,
      });

      // Calculate daily summary
      const dailyMap = new Map<string, { sessions: SessionData[] }>();
      enrichedSessions.forEach(session => {
        const date = format(new Date(session.login_at || ""), "yyyy-MM-dd");
        if (!dailyMap.has(date)) {
          dailyMap.set(date, { sessions: [] });
        }
        dailyMap.get(date)?.sessions.push(session);
      });

      const summaries: DailySummary[] = [];
      dailyMap.forEach((value, date) => {
        const uniqueUsers = new Set(value.sessions.map(s => s.user_id)).size;
        const sessionsWithDur = value.sessions.filter(s => getEffectiveDuration(s) > 0);
        const totalMinutes = sessionsWithDur.reduce((acc, s) =>
          acc + getEffectiveDuration(s), 0);
        summaries.push({
          date,
          total_sessions: value.sessions.length,
          unique_users: uniqueUsers,
          total_hours: Math.round(totalMinutes / 60 * 10) / 10,
          avg_duration: sessionsWithDur.length > 0
            ? Math.round(totalMinutes / sessionsWithDur.length)
            : 0,
        });
      });

      summaries.sort((a, b) => a.date.localeCompare(b.date));
      setDailySummary(summaries);

      // Compute duration per user across the selected date range
      const userMap = new Map<string, { sessions: SessionData[]; name: string; email: string }>();
      enrichedSessions.forEach(session => {
        if (!userMap.has(session.user_id)) {
          userMap.set(session.user_id, {
            sessions: [],
            name: session.user_full_name || "Unknown",
            email: session.user_email || "Unknown",
          });
        }
        userMap.get(session.user_id)!.sessions.push(session);
      });

      const userDurationList: UserDurationSummary[] = [];
      userMap.forEach((value, userId) => {
        const sessionsWithDur = value.sessions.filter(s => getEffectiveDuration(s) > 0);
        const totalMins = sessionsWithDur.reduce((acc, s) => acc + getEffectiveDuration(s), 0);
        userDurationList.push({
          user_id: userId,
          user_full_name: value.name,
          user_email: value.email,
          total_sessions: value.sessions.length,
          total_minutes: totalMins,
          avg_minutes: sessionsWithDur.length > 0 ? Math.round(totalMins / sessionsWithDur.length) : 0,
        });
      });
      userDurationList.sort((a, b) => b.total_minutes - a.total_minutes);
      setUserDurations(userDurationList);

      // Calculate hourly activity for today
      const hourlyMap = new Map<number, number>();
      for (let i = 0; i < 24; i++) {
        hourlyMap.set(i, 0);
      }

      todaySessions.forEach(session => {
        const loginHour = new Date(session.login_at || "").getHours();
        const logoutHour = session.logout_at 
          ? new Date(session.logout_at).getHours() 
          : new Date().getHours();
        
        for (let h = loginHour; h <= logoutHour; h++) {
          hourlyMap.set(h, (hourlyMap.get(h) || 0) + 1);
        }
      });

      const hourlyArray: HourlyData[] = [];
      hourlyMap.forEach((count, hour) => {
        hourlyArray.push({
          hour: `${hour.toString().padStart(2, "0")}:00`,
          active_users: count,
        });
      });
      hourlyArray.sort((a, b) => a.hour.localeCompare(b.hour));
      setHourlyData(hourlyArray);

    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to fetch session data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return "—";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  return (
    <DashboardLayout
      title="Session Analytics"
      subtitle="Monitor user login activity and session trends"
    >
      {/* Filters */}
      <div className="flex justify-end mb-6">
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-48 bg-secondary/50">
            <Calendar className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Sessions Today</p>
                  <p className="text-3xl font-bold font-heading mt-1">{stats.todaySessions}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center">
                  <Users className="w-6 h-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Now</p>
                  <p className="text-3xl font-bold font-heading mt-1 text-success">{stats.activeUsers}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-success/15 flex items-center justify-center">
                  <Activity className="w-6 h-6 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg Duration</p>
                  <p className="text-3xl font-bold font-heading mt-1">{formatDuration(stats.avgDuration)}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-info/15 flex items-center justify-center">
                  <Timer className="w-6 h-6 text-info" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Hours Today</p>
                  <p className="text-3xl font-bold font-heading mt-1">{stats.totalHoursToday}h</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-warning/15 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-warning" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="font-heading flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Daily Login Hours
              </CardTitle>
              <CardDescription>Total hours logged in per day</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailySummary}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => format(new Date(value), "MMM d")}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))", 
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number) => [`${value} hours`, "Total Hours"]}
                      labelFormatter={(label) => format(new Date(label), "PPP")}
                    />
                    <Bar 
                      dataKey="total_hours" 
                      fill="hsl(var(--primary))" 
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="font-heading flex items-center gap-2">
                <Activity className="w-5 h-5 text-success" />
                Active Users by Hour
              </CardTitle>
              <CardDescription>Today's hourly activity pattern</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={hourlyData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis 
                      dataKey="hour" 
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))", 
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number) => [`${value} users`, "Active Users"]}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="active_users" 
                      stroke="hsl(var(--success))"
                      fill="hsl(var(--success) / 0.2)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Sessions Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="font-heading">Recent Sessions</CardTitle>
              <CardDescription>Latest user login activity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Login</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8">
                          Loading sessions...
                        </TableCell>
                      </TableRow>
                    ) : sessions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          No sessions found
                        </TableCell>
                      </TableRow>
                    ) : (
                      sessions.slice(0, 10).map((session) => (
                        <TableRow key={session.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{session.user_full_name}</p>
                              <p className="text-xs text-muted-foreground">{session.user_email}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {session.login_at ? format(new Date(session.login_at), "MMM d, HH:mm") : "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatDuration(session.session_duration_minutes)}
                          </TableCell>
                          <TableCell>
                            {session.logout_at ? (
                              <Badge variant="outline" className="text-muted-foreground">
                                Ended
                              </Badge>
                            ) : (
                              <Badge className="bg-success/15 text-success border-success/30">
                                Active
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Daily Summary Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="font-heading">Daily Summary</CardTitle>
              <CardDescription>Aggregated stats per day</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Sessions</TableHead>
                      <TableHead>Users</TableHead>
                      <TableHead>Total Hours</TableHead>
                      <TableHead>Avg Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8">
                          Loading summary...
                        </TableCell>
                      </TableRow>
                    ) : dailySummary.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No data available
                        </TableCell>
                      </TableRow>
                    ) : (
                      [...dailySummary].reverse().slice(0, 14).map((day) => (
                        <TableRow key={day.date}>
                          <TableCell className="font-medium text-sm">
                            {format(new Date(day.date), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="text-sm">{day.total_sessions}</TableCell>
                          <TableCell className="text-sm">{day.unique_users}</TableCell>
                          <TableCell className="text-sm">{day.total_hours}h</TableCell>
                          <TableCell className="text-sm">{formatDuration(day.avg_duration)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Duration per User Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9 }}
        className="mt-6"
      >
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="font-heading flex items-center gap-2">
              <Timer className="w-5 h-5 text-info" />
              Duration per User
            </CardTitle>
            <CardDescription>Total and average session time per user for the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Sessions</TableHead>
                    <TableHead>Total Time</TableHead>
                    <TableHead>Avg Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                        Loading user durations...
                      </TableCell>
                    </TableRow>
                  ) : userDurations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No data available
                      </TableCell>
                    </TableRow>
                  ) : (
                    userDurations.map((ud) => (
                      <TableRow key={ud.user_id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{ud.user_full_name}</p>
                            <p className="text-xs text-muted-foreground">{ud.user_email}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{ud.total_sessions}</TableCell>
                        <TableCell className="text-sm font-medium">
                          {formatDuration(ud.total_minutes)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDuration(ud.avg_minutes)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </DashboardLayout>
  );
};

export default SessionAnalytics;
