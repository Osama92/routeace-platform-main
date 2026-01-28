import { useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, Truck, MapPin, Clock, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface RecentDispatch {
  id: string;
  dispatch_number: string;
  pickup_address: string;
  delivery_address: string;
  status: string;
  created_at: string;
  customers?: { company_name: string };
}

const statusColors: Record<string, string> = {
  pending: "bg-warning/15 text-warning",
  assigned: "bg-info/15 text-info",
  picked_up: "bg-info/15 text-info",
  in_transit: "bg-primary/15 text-primary",
  delivered: "bg-success/15 text-success",
  cancelled: "bg-destructive/15 text-destructive",
};

const UserDashboard = () => {
  const [dispatches, setDispatches] = useState<RecentDispatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    delivered: 0,
    inTransit: 0,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data, error } = await supabase
        .from("dispatches")
        .select(`
          id, dispatch_number, pickup_address, delivery_address, status, created_at,
          customers (company_name)
        `)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;

      setDispatches(data || []);

      // Calculate stats
      const total = data?.length || 0;
      const active = data?.filter(d => !["delivered", "cancelled"].includes(d.status)).length || 0;
      const delivered = data?.filter(d => d.status === "delivered").length || 0;
      const inTransit = data?.filter(d => d.status === "in_transit").length || 0;

      setStats({ total, active, delivered, inTransit });
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { label: "Total Shipments", value: stats.total, icon: Package, color: "text-primary" },
    { label: "Active", value: stats.active, icon: Truck, color: "text-info" },
    { label: "In Transit", value: stats.inTransit, icon: MapPin, color: "text-warning" },
    { label: "Delivered", value: stats.delivered, icon: CheckCircle, color: "text-success" },
  ];

  return (
    <DashboardLayout
      title="Dashboard"
      subtitle="Your shipment overview"
    >
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
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

      {/* Recent Shipments */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="font-heading flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Recent Shipments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : dispatches.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">No shipments found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {dispatches.map((dispatch, index) => (
                  <motion.div
                    key={dispatch.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="p-4 bg-secondary/30 rounded-lg hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <span className="font-semibold text-foreground">{dispatch.dispatch_number}</span>
                        {dispatch.customers && (
                          <p className="text-sm text-muted-foreground">{dispatch.customers.company_name}</p>
                        )}
                      </div>
                      <Badge className={statusColors[dispatch.status] || statusColors.pending}>
                        {dispatch.status?.replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                        <span className="text-muted-foreground truncate">{dispatch.pickup_address}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                        <span className="text-muted-foreground truncate">{dispatch.delivery_address}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {format(new Date(dispatch.created_at), "MMM dd, yyyy HH:mm")}
                    </p>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </DashboardLayout>
  );
};

export default UserDashboard;
