import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { UserPlus, ArrowRight, Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface PendingUser {
  id: string;
  full_name: string;
  email: string;
  created_at: string;
}

const PendingUserApprovalsWidget = () => {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { hasRole } = useAuth();

  const isAdmin = hasRole("admin");

  useEffect(() => {
    if (!isAdmin) return;

    const fetchPendingUsers = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, created_at")
        .eq("approval_status", "pending")
        .order("created_at", { ascending: false })
        .limit(5);

      if (!error && data) {
        setPendingUsers(data);
      }
      setLoading(false);
    };

    fetchPendingUsers();

    // Subscribe to realtime changes
    const channel = supabase
      .channel("pending-users-widget")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: "approval_status=eq.pending",
        },
        () => {
          fetchPendingUsers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  if (!isAdmin) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-warning/20 flex items-center justify-center">
            <UserPlus className="w-5 h-5 text-warning" />
          </div>
          <div>
            <h3 className="font-heading font-semibold text-foreground">
              Pending User Approvals
            </h3>
            <p className="text-sm text-muted-foreground">
              New registrations awaiting approval
            </p>
          </div>
        </div>
        {pendingUsers.length > 0 && (
          <Badge variant="secondary" className="bg-warning/15 text-warning">
            {pendingUsers.length} pending
          </Badge>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : pendingUsers.length === 0 ? (
        <div className="text-center py-8">
          <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">No pending approvals</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingUsers.slice(0, 3).map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-medium text-primary">
                    {user.full_name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-foreground text-sm">
                    {user.full_name}
                  </p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span className="text-xs">
                  {new Date(user.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {pendingUsers.length > 0 && (
        <Button
          variant="ghost"
          className="w-full mt-4 text-primary hover:text-primary"
          onClick={() => navigate("/users?tab=pending")}
        >
          Review All Pending
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      )}
    </motion.div>
  );
};

export default PendingUserApprovalsWidget;
