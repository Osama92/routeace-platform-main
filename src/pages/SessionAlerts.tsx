import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Clock,
  Shield,
  UserX,
  CheckCircle,
  Eye,
  Filter,
  Bell,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { format, differenceInMinutes } from "date-fns";

interface SessionAlert {
  id: string;
  user_id: string;
  alert_type: string;
  message: string;
  is_read: boolean;
  is_resolved: boolean;
  created_at: string;
  resolved_at: string | null;
  user_email?: string;
  user_name?: string;
}

const alertTypeConfig: Record<string, { icon: any; color: string; label: string }> = {
  idle_warning: { icon: Clock, color: "bg-warning/15 text-warning", label: "Idle Warning" },
  unusual_login: { icon: Shield, color: "bg-destructive/15 text-destructive", label: "Unusual Login" },
  long_session: { icon: UserX, color: "bg-info/15 text-info", label: "Long Session" },
  suspicious_activity: { icon: AlertTriangle, color: "bg-destructive/15 text-destructive", label: "Suspicious" },
};

const SessionAlerts = () => {
  const [alerts, setAlerts] = useState<SessionAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchAlerts = async () => {
    try {
      let query = supabase
        .from("session_alerts")
        .select("*")
        .order("created_at", { ascending: false });

      if (filter === "unresolved") {
        query = query.eq("is_resolved", false);
      } else if (filter === "unread") {
        query = query.eq("is_read", false);
      }

      const { data, error } = await query.limit(100);

      if (error) throw error;

      // Fetch user profiles for the alerts
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map((a) => a.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, email, full_name")
          .in("user_id", userIds);

        const profileMap: Record<string, { email: string; name: string }> = {};
        profiles?.forEach((p) => {
          profileMap[p.user_id] = { email: p.email, name: p.full_name };
        });

        const enrichedAlerts = data.map((alert) => ({
          ...alert,
          user_email: profileMap[alert.user_id]?.email,
          user_name: profileMap[alert.user_id]?.name,
        }));

        setAlerts(enrichedAlerts);
      } else {
        setAlerts([]);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to fetch alerts",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();

    // Subscribe to new alerts
    const channel = supabase
      .channel("session_alerts_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "session_alerts" },
        () => {
          fetchAlerts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filter]);

  const handleMarkResolved = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from("session_alerts")
        .update({
          is_resolved: true,
          is_read: true,
          resolved_by: user?.id,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", alertId);

      if (error) throw error;

      toast({
        title: "Alert Resolved",
        description: "The alert has been marked as resolved",
      });
      fetchAlerts();
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to update alert",
        variant: "destructive",
      });
    }
  };

  const handleMarkRead = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from("session_alerts")
        .update({ is_read: true })
        .eq("id", alertId);

      if (error) throw error;
      fetchAlerts();
    } catch (error: any) {
      console.error("Error marking read:", error);
    }
  };

  // Generate sample alerts for demo purposes
  const generateSampleAlerts = async () => {
    try {
      const sampleAlerts = [
        {
          user_id: user?.id || "",
          alert_type: "idle_warning",
          message: "User has been idle for over 30 minutes",
        },
        {
          user_id: user?.id || "",
          alert_type: "unusual_login",
          message: "Login detected from new device/location",
        },
        {
          user_id: user?.id || "",
          alert_type: "long_session",
          message: "Session active for over 8 hours",
        },
      ];

      const { error } = await supabase.from("session_alerts").insert(sampleAlerts);
      if (error) throw error;

      toast({
        title: "Sample Alerts Created",
        description: "Demo alerts have been generated",
      });
      fetchAlerts();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const stats = {
    total: alerts.length,
    unread: alerts.filter((a) => !a.is_read).length,
    unresolved: alerts.filter((a) => !a.is_resolved).length,
    critical: alerts.filter((a) => 
      ["unusual_login", "suspicious_activity"].includes(a.alert_type) && !a.is_resolved
    ).length,
  };

  return (
    <DashboardLayout
      title="Session Alerts"
      subtitle="Monitor user activity and security alerts"
    >
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Alerts", value: stats.total, icon: Bell, color: "text-foreground" },
          { label: "Unread", value: stats.unread, icon: Eye, color: "text-warning" },
          { label: "Unresolved", value: stats.unresolved, icon: Clock, color: "text-info" },
          { label: "Critical", value: stats.critical, icon: AlertTriangle, color: "text-destructive" },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="glass-card p-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-heading font-bold text-foreground">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40 bg-secondary/50">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Alerts</SelectItem>
              <SelectItem value="unread">Unread</SelectItem>
              <SelectItem value="unresolved">Unresolved</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={fetchAlerts}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
        <Button variant="secondary" onClick={generateSampleAlerts}>
          Generate Test Alerts
        </Button>
      </div>

      {/* Alerts Table */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="font-heading flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Security & Session Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="w-12 h-12 text-success mx-auto mb-3" />
              <p className="text-muted-foreground">No alerts to display</p>
              <p className="text-sm text-muted-foreground mt-1">
                All clear! No security concerns at the moment.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert) => {
                  const config = alertTypeConfig[alert.alert_type] || alertTypeConfig.idle_warning;
                  const Icon = config.icon;
                  const timeAgo = differenceInMinutes(new Date(), new Date(alert.created_at));

                  return (
                    <TableRow key={alert.id} className={!alert.is_read ? "bg-primary/5" : ""}>
                      <TableCell>
                        <Badge className={config.color}>
                          <Icon className="w-3 h-3 mr-1" />
                          {config.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-foreground">{alert.user_name || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground">{alert.user_email}</p>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">
                        {alert.message}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm text-foreground">
                            {format(new Date(alert.created_at), "MMM dd, HH:mm")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {timeAgo < 60 ? `${timeAgo}m ago` : `${Math.floor(timeAgo / 60)}h ago`}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {!alert.is_read && (
                            <Badge variant="secondary" className="text-xs">New</Badge>
                          )}
                          {alert.is_resolved ? (
                            <Badge variant="default" className="bg-success/15 text-success">
                              Resolved
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-warning border-warning/30">
                              Open
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {!alert.is_read && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleMarkRead(alert.id)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          )}
                          {!alert.is_resolved && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleMarkResolved(alert.id)}
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Resolve
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default SessionAlerts;
