import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileCheck, ArrowRight, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

interface ApprovalCounts {
  pendingFirst: number;
  pendingSecond: number;
  total: number;
}

const PendingApprovalsWidget = () => {
  const [counts, setCounts] = useState<ApprovalCounts>({
    pendingFirst: 0,
    pendingSecond: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const { hasAnyRole } = useAuth();
  const navigate = useNavigate();

  const isAdmin = hasAnyRole(["admin"]);

  useEffect(() => {
    if (!isAdmin) return;

    const fetchCounts = async () => {
      try {
        const [firstRes, secondRes] = await Promise.all([
          supabase
            .from("invoices")
            .select("id", { count: "exact", head: true })
            .eq("approval_status", "pending_first_approval"),
          supabase
            .from("invoices")
            .select("id", { count: "exact", head: true })
            .eq("approval_status", "pending_second_approval"),
        ]);

        const pendingFirst = firstRes.count || 0;
        const pendingSecond = secondRes.count || 0;

        setCounts({
          pendingFirst,
          pendingSecond,
          total: pendingFirst + pendingSecond,
        });
      } catch (error) {
        console.error("Error fetching approval counts:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCounts();

    // Subscribe to realtime updates
    const channel = supabase
      .channel("invoice-approvals")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "invoices",
        },
        () => {
          fetchCounts();
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
      transition={{ duration: 0.3 }}
    >
      <Card className="glass-card overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-primary" />
              Pending Approvals
            </CardTitle>
            {counts.total > 0 && (
              <Badge variant="destructive" className="animate-pulse">
                {counts.total} pending
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : counts.total === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">No pending approvals</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-2 rounded-lg bg-warning/10">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-warning" />
                  <span className="text-sm">First Approval</span>
                </div>
                <Badge variant="outline" className="bg-warning/20 text-warning border-warning/30">
                  {counts.pendingFirst}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-info/10">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-info" />
                  <span className="text-sm">Second Approval</span>
                </div>
                <Badge variant="outline" className="bg-info/20 text-info border-info/30">
                  {counts.pendingSecond}
                </Badge>
              </div>
              <Button
                variant="default"
                size="sm"
                className="w-full mt-2"
                onClick={() => navigate("/invoice-approvals")}
              >
                Review Approvals
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default PendingApprovalsWidget;
