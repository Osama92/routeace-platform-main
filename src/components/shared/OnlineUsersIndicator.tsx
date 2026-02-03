import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { Users, Circle, ChevronDown, ChevronUp, GripVertical } from "lucide-react";
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
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const constraintsRef = useRef<HTMLDivElement>(null);

  // Load saved position from localStorage
  useEffect(() => {
    const savedPosition = localStorage.getItem("onlineIndicatorPosition");
    if (savedPosition) {
      try {
        const parsed = JSON.parse(savedPosition);
        setPosition(parsed);
      } catch (e) {
        // Invalid saved position, use default
      }
    }
  }, []);

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

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const newPosition = {
      x: position.x + info.offset.x,
      y: position.y + info.offset.y,
    };
    setPosition(newPosition);
    localStorage.setItem("onlineIndicatorPosition", JSON.stringify(newPosition));
    setIsDragging(false);
  };

  const handleDragStart = () => {
    setIsDragging(true);
  };

  const handleClick = () => {
    // Only toggle if not dragging
    if (!isDragging) {
      setExpanded(!expanded);
    }
  };

  return (
    <>
      {/* Invisible constraint boundary for dragging */}
      <div
        ref={constraintsRef}
        className="fixed inset-0 pointer-events-none z-30"
        style={{ margin: "16px" }}
      />

      <motion.div
        drag
        dragConstraints={constraintsRef}
        dragElastic={0.1}
        dragMomentum={false}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        initial={{ scale: 0.9, opacity: 0, x: position.x, y: position.y }}
        animate={{ scale: 1, opacity: 1, x: position.x, y: position.y }}
        className="fixed bottom-4 right-4 z-40 touch-none"
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
      >
        <div className="glass-card shadow-lg">
          {/* Drag handle - visible on mobile */}
          <div className="md:hidden flex justify-center pt-2 pb-1">
            <div className="w-8 h-1 bg-muted-foreground/30 rounded-full" />
          </div>

          <div className="flex items-center">
            {/* Drag handle icon for desktop */}
            <div
              className="hidden md:flex items-center justify-center px-2 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground"
            >
              <GripVertical className="w-4 h-4" />
            </div>

            <Button
              variant="ghost"
              onClick={handleClick}
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
          </div>

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
        </div>
      </motion.div>
    </>
  );
};

export default OnlineUsersIndicator;
