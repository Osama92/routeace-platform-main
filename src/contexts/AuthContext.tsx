import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "admin" | "operations" | "support" | "dispatcher" | "driver";
type ApprovalStatus = "pending" | "approved" | "suspended" | "rejected";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: AppRole | null;
  loading: boolean;
  currentSessionId: string | null;
  isApproved: boolean;
  approvalStatus: ApprovalStatus | null;
  suspensionReason: string | null;
  grantedRoutes: Set<string>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  hasAnyRole: (roles: AppRole[]) => boolean;
  refreshApprovalStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus | null>(null);
  const [suspensionReason, setSuspensionReason] = useState<string | null>(null);
  const [grantedRoutes, setGrantedRoutes] = useState<Set<string>>(new Set());
  const sessionIdRef = useRef<string | null>(null);
  // Tracks whether SIGNED_IN event already created a session record, so the
  // subsequent getSession() call does not create a duplicate on page load.
  const sessionCreatedByEventRef = useRef(false);

  const isApproved = approvalStatus === "approved";

  const fetchGrantedRoutes = async (userId: string) => {
    try {
      const { data } = await (supabase as any)
        .from("user_menu_overrides")
        .select("menu_href")
        .eq("user_id", userId)
        .eq("hidden", false);
      return new Set<string>((data || []).map((r: any) => r.menu_href as string));
    } catch {
      return new Set<string>();
    }
  };

  const fetchUserRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .single();

      if (error) {
        console.log("No role found for user");
        return null;
      }
      return data?.role as AppRole;
    } catch (error) {
      console.error("Error fetching user role:", error);
      return null;
    }
  };

  const fetchApprovalStatus = async (userId: string, userRole: AppRole | null) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("approval_status, suspension_reason")
        .eq("user_id", userId)
        .single();

      if (error) {
        console.log("No profile found for user");
        // If user has a role but no profile, consider them approved
        if (userRole) {
          return { status: "approved" as ApprovalStatus, reason: null };
        }
        return { status: null, reason: null };
      }

      // If user has a valid role and is not explicitly suspended/rejected, consider them approved
      // This handles cases where profile exists but approval_status is pending/null
      const profileStatus = data?.approval_status as ApprovalStatus;
      if (userRole && profileStatus !== "suspended" && profileStatus !== "rejected") {
        return { status: "approved" as ApprovalStatus, reason: null };
      }

      return {
        status: profileStatus,
        reason: data?.suspension_reason,
      };
    } catch (error) {
      console.error("Error fetching approval status:", error);
      return { status: null, reason: null };
    }
  };

  const refreshApprovalStatus = async () => {
    if (user) {
      const { status, reason } = await fetchApprovalStatus(user.id, userRole);
      setApprovalStatus(status);
      setSuspensionReason(reason);
    }
  };

  // Create a new session record when user logs in
  const createSessionRecord = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_sessions")
        .insert({
          user_id: userId,
          login_at: new Date().toISOString(),
          ip_address: null,
          user_agent: navigator.userAgent,
        })
        .select("id")
        .single();

      if (error) {
        console.error("Error creating session record:", error);
        return null;
      }

      return data?.id || null;
    } catch (error) {
      console.error("Error creating session record:", error);
      return null;
    }
  };

  // Update session record when user logs out
  const updateSessionRecord = async (sessionId: string) => {
    if (!sessionId) return;

    try {
      const { data: sessionData } = await supabase
        .from("user_sessions")
        .select("login_at")
        .eq("id", sessionId)
        .single();

      let sessionDuration = null;
      if (sessionData?.login_at) {
        const loginTime = new Date(sessionData.login_at);
        const logoutTime = new Date();
        sessionDuration = Math.round((logoutTime.getTime() - loginTime.getTime()) / 60000);
      }

      await supabase
        .from("user_sessions")
        .update({
          logout_at: new Date().toISOString(),
          session_duration_minutes: sessionDuration,
        })
        .eq("id", sessionId);
    } catch (error) {
      console.error("Error updating session record:", error);
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Handle session tracking based on auth events
        if (event === "SIGNED_IN" && session?.user) {
          // Defer session creation with setTimeout to avoid deadlock
          setTimeout(async () => {
            // Only create a session record for a genuine new login, not token refresh
            if (!sessionIdRef.current) {
              const newSessionId = await createSessionRecord(session.user.id);
              if (newSessionId) {
                sessionIdRef.current = newSessionId;
                setCurrentSessionId(newSessionId);
                sessionCreatedByEventRef.current = true;
              }
            }
            const role = await fetchUserRole(session.user.id);
            setUserRole(role);
            const { status, reason } = await fetchApprovalStatus(session.user.id, role);
            setApprovalStatus(status);
            setSuspensionReason(reason);
            setGrantedRoutes(await fetchGrantedRoutes(session.user.id));
          }, 0);
        } else if (event === "SIGNED_OUT") {
          // Update session record on sign out
          if (sessionIdRef.current) {
            updateSessionRecord(sessionIdRef.current);
            sessionIdRef.current = null;
            setCurrentSessionId(null);
          }
          setUserRole(null);
          setApprovalStatus(null);
          setSuspensionReason(null);
          setGrantedRoutes(new Set());
        } else if (session?.user) {
          // For token refresh or other events, just fetch role and status
          setTimeout(async () => {
            const role = await fetchUserRole(session.user.id);
            setUserRole(role);
            const { status, reason } = await fetchApprovalStatus(session.user.id, role);
            setApprovalStatus(status);
            setSuspensionReason(reason);
            setGrantedRoutes(await fetchGrantedRoutes(session.user.id));
          }, 0);
        }
        
        setLoading(false);
      }
    );

    // THEN check for existing session (page refresh / initial load)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        // Only create a session record if the SIGNED_IN event hasn't already done so.
        // On a page refresh Supabase fires INITIAL_SESSION (not SIGNED_IN), so we
        // create the record here. On a fresh login, SIGNED_IN fires first and sets
        // sessionCreatedByEventRef so we skip creation here to avoid duplicates.
        if (!sessionCreatedByEventRef.current && !sessionIdRef.current) {
          const newSessionId = await createSessionRecord(session.user.id);
          if (newSessionId) {
            sessionIdRef.current = newSessionId;
            setCurrentSessionId(newSessionId);
          }
        }
        const role = await fetchUserRole(session.user.id);
        setUserRole(role);
        const { status, reason } = await fetchApprovalStatus(session.user.id, role);
        setApprovalStatus(status);
        setSuspensionReason(reason);
        setGrantedRoutes(await fetchGrantedRoutes(session.user.id));
      }
      setLoading(false);
    });

    // Clean up session on page unload
    const handleBeforeUnload = () => {
      if (sessionIdRef.current) {
        const payload = JSON.stringify({
          session_id: sessionIdRef.current,
          logout_at: new Date().toISOString(),
        });
        navigator.sendBeacon?.(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/user_sessions?id=eq.${sessionIdRef.current}`,
          payload
        );
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signOut = async () => {
    // Update session record before signing out
    if (sessionIdRef.current) {
      await updateSessionRecord(sessionIdRef.current);
      sessionIdRef.current = null;
      setCurrentSessionId(null);
    }
    
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setUserRole(null);
    setApprovalStatus(null);
    setSuspensionReason(null);
  };

  const hasRole = (role: AppRole) => userRole === role;
  
  const hasAnyRole = (roles: AppRole[]) => userRole !== null && roles.includes(userRole);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        userRole,
        loading,
        currentSessionId,
        isApproved,
        approvalStatus,
        suspensionReason,
        grantedRoutes,
        signUp,
        signIn,
        signOut,
        hasRole,
        hasAnyRole,
        refreshApprovalStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
