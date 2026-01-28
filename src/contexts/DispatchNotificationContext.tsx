import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Truck, CheckCircle, AlertTriangle, Package } from "lucide-react";

interface DispatchNotification {
  id: string;
  type: "created" | "status_changed" | "sla_warning";
  dispatchNumber: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

interface DispatchNotificationContextType {
  notifications: DispatchNotification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
}

const DispatchNotificationContext = createContext<DispatchNotificationContextType | undefined>(
  undefined
);

export const useDispatchNotifications = () => {
  const context = useContext(DispatchNotificationContext);
  if (!context) {
    throw new Error(
      "useDispatchNotifications must be used within a DispatchNotificationProvider"
    );
  }
  return context;
};

interface ProviderProps {
  children: ReactNode;
}

export const DispatchNotificationProvider = ({ children }: ProviderProps) => {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<DispatchNotification[]>([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    // Only subscribe if user is logged in and has appropriate role
    if (!user || !userRole) return;
    if (!["admin", "operations", "dispatcher"].includes(userRole)) return;

    console.log("Setting up dispatch realtime subscription...");

    const channel = supabase
      .channel("dispatch-notifications")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dispatches",
        },
        (payload) => {
          console.log("Dispatch change received:", payload);
          handleDispatchChange(payload);
        }
      )
      .subscribe((status) => {
        console.log("Realtime subscription status:", status);
      });

    return () => {
      console.log("Cleaning up dispatch subscription");
      supabase.removeChannel(channel);
    };
  }, [user, userRole]);

  const handleDispatchChange = (payload: any) => {
    if (!notificationsEnabled) return;

    const { eventType, new: newRecord, old: oldRecord } = payload;

    let notification: DispatchNotification | null = null;

    if (eventType === "INSERT") {
      notification = {
        id: crypto.randomUUID(),
        type: "created",
        dispatchNumber: newRecord.dispatch_number,
        message: `New dispatch ${newRecord.dispatch_number} created`,
        timestamp: new Date(),
        read: false,
      };

      toast({
        title: "New Dispatch Created",
        description: `Dispatch ${newRecord.dispatch_number} has been created`,
        duration: 5000,
      });
    } else if (eventType === "UPDATE" && oldRecord?.status !== newRecord?.status) {
      const statusMessages: Record<string, string> = {
        pending: "is pending",
        assigned: "has been assigned",
        in_transit: "is now in transit",
        delivered: "has been delivered",
        cancelled: "has been cancelled",
      };

      const statusMessage = statusMessages[newRecord.status] || `status changed to ${newRecord.status}`;

      notification = {
        id: crypto.randomUUID(),
        type: "status_changed",
        dispatchNumber: newRecord.dispatch_number,
        message: `Dispatch ${newRecord.dispatch_number} ${statusMessage}`,
        timestamp: new Date(),
        read: false,
      };

      // Show toast for status changes
      const getStatusIcon = () => {
        switch (newRecord.status) {
          case "delivered":
            return <CheckCircle className="w-4 h-4 text-success" />;
          case "in_transit":
            return <Truck className="w-4 h-4 text-primary" />;
          case "cancelled":
            return <AlertTriangle className="w-4 h-4 text-destructive" />;
          default:
            return <Package className="w-4 h-4" />;
        }
      };

      toast({
        title: "Dispatch Status Updated",
        description: notification.message,
        duration: 4000,
      });

      // Check for SLA warning (if scheduled_delivery is approaching)
      if (newRecord.status === "in_transit" && newRecord.scheduled_delivery) {
        const scheduledTime = new Date(newRecord.scheduled_delivery);
        const now = new Date();
        const hoursUntilDeadline = (scheduledTime.getTime() - now.getTime()) / (1000 * 60 * 60);

        if (hoursUntilDeadline > 0 && hoursUntilDeadline < 2) {
          const slaNotification: DispatchNotification = {
            id: crypto.randomUUID(),
            type: "sla_warning",
            dispatchNumber: newRecord.dispatch_number,
            message: `SLA Warning: ${newRecord.dispatch_number} due in ${Math.round(hoursUntilDeadline * 60)} minutes`,
            timestamp: new Date(),
            read: false,
          };

          setNotifications((prev) => [slaNotification, ...prev].slice(0, 50));

          toast({
            title: "SLA Warning",
            description: slaNotification.message,
            variant: "destructive",
            duration: 10000,
          });
        }
      }
    }

    if (notification) {
      setNotifications((prev) => [notification!, ...prev].slice(0, 50));
    }
  };

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  return (
    <DispatchNotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        clearNotifications,
        notificationsEnabled,
        setNotificationsEnabled,
      }}
    >
      {children}
    </DispatchNotificationContext.Provider>
  );
};

export default DispatchNotificationProvider;