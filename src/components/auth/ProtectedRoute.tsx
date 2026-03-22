import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import PendingApprovalScreen from "./PendingApprovalScreen";
import SuspendedAccountScreen from "./SuspendedAccountScreen";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: ("admin" | "operations" | "support" | "dispatcher" | "driver")[];
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, userRole, loading, isApproved, approvalStatus, suspensionReason, grantedRoutes } = useAuth();
  const location = useLocation();

  // Show spinner while auth is initialising OR while user is known but approval not yet fetched
  if (loading || (user && approvalStatus === null)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Check approval status
  if (approvalStatus === "pending") {
    return <PendingApprovalScreen />;
  }

  if (approvalStatus === "suspended") {
    return <SuspendedAccountScreen reason={suspensionReason || undefined} />;
  }

  if (approvalStatus === "rejected") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="glass-card p-8 text-center max-w-md">
          <h2 className="text-xl font-heading font-bold text-foreground mb-2">Registration Rejected</h2>
          <p className="text-muted-foreground mb-4">
            Your registration request was not approved. Please contact an administrator for more information.
          </p>
        </div>
      </div>
    );
  }

  // Only check roles if user is approved
  if (!isApproved) {
    return <PendingApprovalScreen />;
  }

  // If roles are specified and user doesn't have any of the allowed roles,
  // also check if admin has explicitly granted this route to the user
  if (allowedRoles && allowedRoles.length > 0 && userRole && !allowedRoles.includes(userRole) && !grantedRoutes.has(location.pathname)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="glass-card p-8 text-center max-w-md">
          <h2 className="text-xl font-heading font-bold text-foreground mb-2">Access Denied</h2>
          <p className="text-muted-foreground mb-4">
            You don't have permission to access this page.
          </p>
          <p className="text-sm text-muted-foreground">
            Your role: <span className="text-primary capitalize">{userRole}</span>
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
