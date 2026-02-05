import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface UserPresence {
  user_id: string;
  status: "online" | "away" | "offline";
  last_active_at: string;
  current_page?: string;
}

export const useUserPresence = () => {
  const { user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<UserPresence[]>([]);
  const channelRef = useRef<any>(null);
  const isInitializedRef = useRef(false);

  // Fetch online users from database
  const fetchOnlineUsers = useCallback(async () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("user_presence")
      .select("user_id, status, last_active_at, current_page")
      .in("status", ["online", "away"])
      .gte("last_active_at", fiveMinutesAgo);

    if (!error && data) {
      setOnlineUsers(data as UserPresence[]);
    }
  }, []);

  // Update presence in database
  const updatePresence = useCallback(
    async (status: "online" | "away" | "offline", currentPage?: string) => {
      if (!user) return;

      const presenceData = {
        user_id: user.id,
        status,
        last_active_at: new Date().toISOString(),
        current_page: currentPage || window.location.pathname,
        updated_at: new Date().toISOString(),
      };

      // First try to update existing record
      const { error: updateError, count } = await supabase
        .from("user_presence")
        .update(presenceData)
        .eq("user_id", user.id)
        .select();

      // If no record exists, insert one
      if (updateError || count === 0) {
        const { error: insertError } = await supabase
          .from("user_presence")
          .insert(presenceData);

        if (insertError && !insertError.message.includes("duplicate")) {
          console.error("Error inserting presence:", insertError);
        }
      }

      // Also track in realtime channel for instant updates
      if (channelRef.current && status !== "offline") {
        try {
          await channelRef.current.track({
            user_id: user.id,
            status,
            last_active_at: new Date().toISOString(),
            current_page: currentPage || window.location.pathname,
          });
        } catch (e) {
          // Channel might not be ready
        }
      }

      // Refresh the list after updating
      await fetchOnlineUsers();
    },
    [user, fetchOnlineUsers]
  );

  // Set up presence tracking
  useEffect(() => {
    if (!user || isInitializedRef.current) return;
    isInitializedRef.current = true;

    // Initial fetch
    fetchOnlineUsers();

    // Set up realtime presence channel
    const channel = supabase.channel(`presence-${Date.now()}`, {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        // When presence syncs, also refresh from DB for accuracy
        fetchOnlineUsers();
      })
      .on("presence", { event: "join" }, () => {
        fetchOnlineUsers();
      })
      .on("presence", { event: "leave" }, () => {
        fetchOnlineUsers();
      })
      .subscribe(async (status, err) => {
        if (status === "SUBSCRIBED") {
          channelRef.current = channel;
          // Update presence when subscribed
          await updatePresence("online", window.location.pathname);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // Silently handle realtime connection errors - fall back to DB polling
          console.warn("Realtime presence channel error, using DB fallback");
        }
      });

    // Subscribe to database changes for cross-tab/device sync
    const dbChannel = supabase
      .channel("presence-db-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_presence" },
        () => {
          fetchOnlineUsers();
        }
      )
      .subscribe();

    // Track visibility changes
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        updatePresence("away");
      } else {
        updatePresence("online", window.location.pathname);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Heartbeat to keep presence alive (every 30 seconds)
    const heartbeat = setInterval(() => {
      if (document.visibilityState !== "hidden") {
        updatePresence("online", window.location.pathname);
      }
    }, 30000);

    // Cleanup on unmount
    return () => {
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      isInitializedRef.current = false;

      // Mark user as offline
      if (user) {
        supabase
          .from("user_presence")
          .update({
            status: "offline",
            updated_at: new Date().toISOString()
          })
          .eq("user_id", user.id)
          .then(() => {});
      }

      supabase.removeChannel(channel);
      supabase.removeChannel(dbChannel);
    };
  }, [user, updatePresence, fetchOnlineUsers]);

  return {
    onlineUsers,
    updatePresence,
    refreshOnlineUsers: fetchOnlineUsers,
    isUserOnline: (userId: string) =>
      onlineUsers.some((u) => u.user_id === userId && u.status === "online"),
    isUserAway: (userId: string) =>
      onlineUsers.some((u) => u.user_id === userId && u.status === "away"),
    getOnlineCount: () =>
      onlineUsers.filter((u) => u.status === "online").length,
  };
};
