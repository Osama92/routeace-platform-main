import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Circle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useUserPresence } from "@/hooks/useUserPresence";

interface UserInfo {
  id: string;
  email: string;
  full_name: string;
}

const OnlineUsersIndicator = () => {
  const { onlineUsers, getOnlineCount } = useUserPresence();
  const [expanded, setExpanded] = useState(false);
  const [userProfiles, setUserProfiles] = useState<Record<string, UserInfo>>({});

  // Fetch user profiles for online users
  useEffect(() => {
    const fetchProfiles = async () => {
      const userIds = onlineUsers.map((u) => u.user_id);
      if (userIds.length === 0) return;

      const { data } = await supabase
        .from("profiles")
        .select("user_id, email, full_name")
        .in("user_id", userIds);

      if (data) {
        const profiles: Record<string, UserInfo> = {};
        data.forEach((p) => {
          profiles[p.user_id] = {
            id: p.user_id,
            email: p.email,
            full_name: p.full_name,
          };
        });
        setUserProfiles(profiles);
      }
    };

    fetchProfiles();
  }, [onlineUsers]);

  const onlineCount = getOnlineCount();
  const awayCount = onlineUsers.filter((u) => u.status === "away").length;

  return (
    <div className="fixed bottom-4 right-4 z-40">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="glass-card shadow-lg"
      >
        <Button
          variant="ghost"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 px-4 py-2"
        >
          <div className="relative">
            <Users className="w-5 h-5 text-foreground" />
            {onlineCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-success rounded-full animate-pulse" />
            )}
          </div>
          <span className="font-medium text-foreground">{onlineCount} online</span>
          {awayCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {awayCount} away
            </Badge>
          )}
          {expanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronUp className="w-4 h-4" />
          )}
        </Button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 max-h-64 overflow-y-auto space-y-2">
                {onlineUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">
                    No users currently online
                  </p>
                ) : (
                  onlineUsers.map((presence) => {
                    const profile = userProfiles[presence.user_id];
                    const initials = profile?.full_name
                      ?.split(" ")
                      .map((n) => n[0])
                      .join("") || "?";

                    return (
                      <div
                        key={presence.user_id}
                        className="flex items-center gap-3 p-2 rounded-lg bg-secondary/30"
                      >
                        <div className="relative">
                          <Avatar className="w-8 h-8">
                            <AvatarFallback className="bg-primary/20 text-primary text-xs">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <Circle
                            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 ${
                              presence.status === "online"
                                ? "text-success fill-success"
                                : "text-warning fill-warning"
                            }`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate text-foreground">
                            {profile?.full_name || "Unknown User"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {presence.current_page || "Dashboard"}
                          </p>
                        </div>
                        <Badge
                          variant={
                            presence.status === "online"
                              ? "default"
                              : "secondary"
                          }
                          className="text-xs"
                        >
                          {presence.status}
                        </Badge>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default OnlineUsersIndicator;
