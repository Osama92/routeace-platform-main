import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface AuditLogEntry {
  table_name: string;
  record_id: string;
  action: "insert" | "update" | "delete";
  old_data?: Record<string, any>;
  new_data?: Record<string, any>;
}

export const useAuditLog = () => {
  const { user } = useAuth();

  const logChange = async ({
    table_name,
    record_id,
    action,
    old_data,
    new_data,
  }: AuditLogEntry) => {
    if (!user) return;

    try {
      await supabase.from("audit_logs").insert({
        table_name,
        record_id,
        action,
        old_data: old_data || null,
        new_data: new_data || null,
        user_id: user.id,
        user_email: user.email,
      });
    } catch (error) {
      console.error("Failed to log audit entry:", error);
    }
  };

  return { logChange };
};

export default useAuditLog;
