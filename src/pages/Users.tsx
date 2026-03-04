import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Users,
  Shield,
  Mail,
  Phone,
  MoreVertical,
  UserCheck,
  UserX,
  Crown,
  Headphones,
  Settings,
  Truck,
  ClipboardList,
  Clock,
  Ban,
  UserPlus,
  RefreshCw,
  CheckCircle,
  XCircle,
  LayoutDashboard,
  Menu,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import UserApprovalDialog from "@/components/users/UserApprovalDialog";
import UserSuspendDialog from "@/components/users/UserSuspendDialog";

interface UserProfile {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  phone: string | null;
  created_at: string;
  approval_status: string;
  is_active: boolean;
  suspension_reason: string | null;
  role?: string;
}

const roleInfo: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  admin: { icon: Crown, color: "bg-warning/15 text-warning", label: "Admin" },
  operations: { icon: Settings, color: "bg-primary/15 text-primary", label: "Operations" },
  support: { icon: Headphones, color: "bg-info/15 text-info", label: "Support" },
  dispatcher: { icon: ClipboardList, color: "bg-success/15 text-success", label: "Dispatcher" },
  driver: { icon: Truck, color: "bg-muted text-muted-foreground", label: "Driver" },
};

const statusInfo: Record<string, { color: string; label: string; icon: React.ElementType }> = {
  pending: { color: "bg-warning/15 text-warning", label: "Pending", icon: Clock },
  approved: { color: "bg-success/15 text-success", label: "Approved", icon: CheckCircle },
  suspended: { color: "bg-destructive/15 text-destructive", label: "Suspended", icon: Ban },
  rejected: { color: "bg-muted text-muted-foreground", label: "Rejected", icon: XCircle },
};

// All navigable menus — must match Sidebar.tsx arrays
const ALL_MENUS = [
  // Main nav
  { name: "Dashboard", href: "/", roles: ["admin", "operations", "support", "dispatcher", "driver"] },
  { name: "Dispatch", href: "/dispatch", roles: ["admin", "operations", "dispatcher"] },
  { name: "Tracking", href: "/tracking", roles: ["admin", "operations", "support", "dispatcher", "driver"] },
  { name: "Drivers", href: "/drivers", roles: ["admin", "operations", "dispatcher"] },
  { name: "Driver Payroll", href: "/driver-payroll", roles: ["admin"] },
  { name: "Driver Bonuses", href: "/driver-bonuses", roles: ["admin"] },
  { name: "Tax Filing", href: "/tax-filing-report", roles: ["admin"] },
  { name: "Fleet", href: "/fleet", roles: ["admin", "operations"] },
  { name: "Routes", href: "/routes", roles: ["admin"] },
  { name: "Customers", href: "/customers", roles: ["admin", "support"] },
  { name: "Partners", href: "/partners", roles: ["admin"] },
  { name: "Partner Performance", href: "/vendor-performance", roles: ["admin", "operations"] },
  { name: "Invoices", href: "/invoices", roles: ["admin", "support", "operations"] },
  { name: "Expenses", href: "/expenses", roles: ["admin", "operations"] },
  { name: "Analytics", href: "/analytics", roles: ["admin", "operations"] },
  // Communications
  { name: "Email Notifications", href: "/emails", roles: ["admin", "support", "operations"] },
  // Admin
  { name: "Pending Approvals", href: "/pending-approvals", roles: ["admin"] },
  { name: "Invoice Approvals", href: "/invoice-approvals", roles: ["admin"] },
  { name: "Expense Approvals", href: "/expense-approvals", roles: ["admin"] },
  { name: "Trip Rate Config", href: "/trip-rate-config", roles: ["admin"] },
  { name: "Historical Data", href: "/historical-data", roles: ["admin"] },
  { name: "P&L Analytics", href: "/admin-analytics", roles: ["admin"] },
  { name: "Session Analytics", href: "/session-analytics", roles: ["admin"] },
  { name: "Session Alerts", href: "/session-alerts", roles: ["admin"] },
  { name: "Email Templates", href: "/email-templates", roles: ["admin"] },
  { name: "Users", href: "/users", roles: ["admin"] },
  { name: "Settings", href: "/settings", roles: ["admin"] },
];

const UsersPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { hasRole, user: currentUser } = useAuth();

  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>("");

  // Menu management
  const [isMenuDialogOpen, setIsMenuDialogOpen] = useState(false);
  const [menuOverrides, setMenuOverrides] = useState<Record<string, boolean>>({}); // href -> hidden
  const [savingMenus, setSavingMenus] = useState(false);

  // Approval/Suspend dialogs
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [approvalAction, setApprovalAction] = useState<"approve" | "reject">("approve");
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [suspendAction, setSuspendAction] = useState<"suspend" | "reactivate">("suspend");

  const activeTab = searchParams.get("tab") || "all";
  const canManage = hasRole("admin");

  const fetchUsers = async () => {
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      const usersWithRoles = (profiles || []).map((profile) => {
        const userRole = roles?.find((r) => r.user_id === profile.user_id);
        return {
          ...profile,
          role: userRole?.role || undefined,
        };
      });

      setUsers(usersWithRoles);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to fetch users",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAssignRole = async () => {
    if (!selectedUser || !selectedRole) {
      toast({
        title: "Error",
        description: "Please select a role",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const roleValue = selectedRole as "admin" | "operations" | "support" | "dispatcher" | "driver";
      
      const { data: existing } = await supabase
        .from("user_roles")
        .select("id, role")
        .eq("user_id", selectedUser.user_id)
        .single();

      if (existing) {
        const { error } = await supabase
          .from("user_roles")
          .update({ role: roleValue })
          .eq("user_id", selectedUser.user_id);

        if (error) throw error;

        // Log role change
        await supabase.from("user_access_log").insert({
          user_id: selectedUser.user_id,
          action: "role_assigned",
          performed_by: currentUser?.id,
          previous_role: existing.role,
          new_role: roleValue,
        });
      } else {
        const { error } = await supabase
          .from("user_roles")
          .insert([{ user_id: selectedUser.user_id, role: roleValue }]);

        if (error) throw error;

        // Log role assignment
        await supabase.from("user_access_log").insert({
          user_id: selectedUser.user_id,
          action: "role_assigned",
          performed_by: currentUser?.id,
          new_role: roleValue,
        });
      }

      toast({
        title: "Success",
        description: `Role ${selectedRole} assigned to ${selectedUser.full_name}`,
      });
      setIsRoleDialogOpen(false);
      setSelectedUser(null);
      setSelectedRole("");
      fetchUsers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to assign role",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleApproveReject = async (role?: string, reason?: string) => {
    if (!selectedUser) return;

    setSaving(true);
    try {
      if (approvalAction === "approve") {
        // Update profile to approved
        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            approval_status: "approved",
            is_active: true,
            approved_at: new Date().toISOString(),
            approved_by: currentUser?.id,
          })
          .eq("user_id", selectedUser.user_id);

        if (profileError) throw profileError;

        // Assign role
        if (role) {
          const roleValue = role as "admin" | "operations" | "support" | "dispatcher" | "driver";
          const { error: roleError } = await supabase
            .from("user_roles")
            .insert([{ user_id: selectedUser.user_id, role: roleValue }]);

          if (roleError) throw roleError;
        }

        // Log approval
        await supabase.from("user_access_log").insert({
          user_id: selectedUser.user_id,
          action: "approved",
          performed_by: currentUser?.id,
          previous_status: selectedUser.approval_status,
          new_status: "approved",
          new_role: role,
        });

        toast({
          title: "User Approved",
          description: `${selectedUser.full_name} has been approved and assigned the ${role} role.`,
        });
      } else {
        // Reject user
        const { error } = await supabase
          .from("profiles")
          .update({
            approval_status: "rejected",
            is_active: false,
            suspension_reason: reason,
          })
          .eq("user_id", selectedUser.user_id);

        if (error) throw error;

        // Log rejection
        await supabase.from("user_access_log").insert({
          user_id: selectedUser.user_id,
          action: "rejected",
          performed_by: currentUser?.id,
          previous_status: selectedUser.approval_status,
          new_status: "rejected",
          reason,
        });

        toast({
          title: "User Rejected",
          description: `${selectedUser.full_name}'s registration has been rejected.`,
        });
      }

      setApprovalDialogOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to process user",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSuspendReactivate = async (reason?: string) => {
    if (!selectedUser) return;

    setSaving(true);
    try {
      if (suspendAction === "suspend") {
        const { error } = await supabase
          .from("profiles")
          .update({
            approval_status: "suspended",
            is_active: false,
            suspended_at: new Date().toISOString(),
            suspended_by: currentUser?.id,
            suspension_reason: reason,
          })
          .eq("user_id", selectedUser.user_id);

        if (error) throw error;

        // Log suspension
        await supabase.from("user_access_log").insert({
          user_id: selectedUser.user_id,
          action: "suspended",
          performed_by: currentUser?.id,
          previous_status: selectedUser.approval_status,
          new_status: "suspended",
          reason,
        });

        toast({
          title: "User Suspended",
          description: `${selectedUser.full_name}'s access has been suspended.`,
        });
      } else {
        const { error } = await supabase
          .from("profiles")
          .update({
            approval_status: "approved",
            is_active: true,
            suspended_at: null,
            suspended_by: null,
            suspension_reason: null,
          })
          .eq("user_id", selectedUser.user_id);

        if (error) throw error;

        // Log reactivation
        await supabase.from("user_access_log").insert({
          user_id: selectedUser.user_id,
          action: "reactivated",
          performed_by: currentUser?.id,
          previous_status: selectedUser.approval_status,
          new_status: "approved",
        });

        toast({
          title: "User Reactivated",
          description: `${selectedUser.full_name}'s access has been restored.`,
        });
      }

      setSuspendDialogOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to process user",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveRole = async (user: UserProfile) => {
    if (!user.role) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", user.user_id);

      if (error) throw error;

      // Log role removal
      await supabase.from("user_access_log").insert({
        user_id: user.user_id,
        action: "role_removed",
        performed_by: currentUser?.id,
        previous_role: user.role,
      });

      toast({
        title: "Role Removed",
        description: `Role removed from ${user.full_name}`,
      });
      fetchUsers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to remove role",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleOpenMenuDialog = async (user: UserProfile) => {
    setSelectedUser(user);
    // Fetch existing overrides for this user
    const { data } = await (supabase as any)
      .from("user_menu_overrides")
      .select("menu_href, hidden")
      .eq("user_id", user.user_id);
    const map: Record<string, boolean> = {};
    (data || []).forEach((r: any) => { map[r.menu_href] = r.hidden; });
    setMenuOverrides(map);
    setIsMenuDialogOpen(true);
  };

  const handleSaveMenuOverrides = async () => {
    if (!selectedUser) return;
    setSavingMenus(true);
    try {
      // Delete all existing overrides for this user, then insert fresh set
      await (supabase as any)
        .from("user_menu_overrides")
        .delete()
        .eq("user_id", selectedUser.user_id);

      const rows = Object.entries(menuOverrides).map(([menu_href, hidden]) => ({
        user_id: selectedUser.user_id,
        menu_href,
        hidden,
      }));
      if (rows.length > 0) {
        await (supabase as any)
          .from("user_menu_overrides")
          .insert(rows);
      }
      toast({ title: "Menu access updated", description: `Saved menu settings for ${selectedUser.full_name}` });
      setIsMenuDialogOpen(false);
    } catch (e: any) {
      toast({ title: "Failed to save", description: e.message, variant: "destructive" });
    } finally {
      setSavingMenus(false);
    }
  };

  const getFilteredUsers = () => {
    let filtered = users;

    // Filter by tab
    if (activeTab === "pending") {
      filtered = filtered.filter((u) => u.approval_status === "pending");
    } else if (activeTab === "suspended") {
      filtered = filtered.filter((u) => u.approval_status === "suspended");
    } else if (activeTab === "active") {
      filtered = filtered.filter((u) => u.approval_status === "approved" && u.is_active);
    }

    // Filter by search
    filtered = filtered.filter((user) => {
      const matchesSearch =
        user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    });

    // Filter by role
    if (roleFilter !== "all") {
      filtered = filtered.filter((u) => u.role === roleFilter);
    }

    return filtered;
  };

  const filteredUsers = getFilteredUsers();
  const pendingCount = users.filter((u) => u.approval_status === "pending").length;
  const suspendedCount = users.filter((u) => u.approval_status === "suspended").length;
  const activeCount = users.filter((u) => u.approval_status === "approved" && u.is_active).length;

  const renderUserTable = (userList: UserProfile[]) => (
    <Table>
      <TableHeader>
        <TableRow className="border-border/50 hover:bg-transparent">
          <TableHead className="text-muted-foreground">User</TableHead>
          <TableHead className="text-muted-foreground">Email</TableHead>
          <TableHead className="text-muted-foreground">Status</TableHead>
          <TableHead className="text-muted-foreground">Role</TableHead>
          <TableHead className="text-muted-foreground">Joined</TableHead>
          <TableHead className="text-muted-foreground w-10"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <TableRow>
            <TableCell colSpan={6} className="text-center py-12">
              <div className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <span className="text-muted-foreground">Loading users...</span>
              </div>
            </TableCell>
          </TableRow>
        ) : userList.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="text-center py-12">
              <Users className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground">No users found</p>
            </TableCell>
          </TableRow>
        ) : (
          userList.map((user) => {
            const role = user.role ? roleInfo[user.role] : null;
            const status = statusInfo[user.approval_status] || statusInfo.pending;
            const RoleIcon = role?.icon || Shield;
            const StatusIcon = status.icon;
            
            return (
              <TableRow key={user.id} className="data-table-row">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-medium text-primary">
                        {user.full_name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-foreground">{user.full_name}</span>
                      {user.phone && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {user.phone}
                        </p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="w-4 h-4" />
                    {user.email}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={`${status.color} gap-1`}>
                    <StatusIcon className="w-3 h-3" />
                    {status.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  {user.role ? (
                    <Badge className={`${role?.color} gap-1`}>
                      <RoleIcon className="w-3 h-3" />
                      {role?.label}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      No Role
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(user.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {user.approval_status === "pending" && (
                          <>
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedUser(user);
                                setApprovalAction("approve");
                                setApprovalDialogOpen(true);
                              }}
                            >
                              <UserCheck className="w-4 h-4 mr-2 text-success" />
                              Approve
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedUser(user);
                                setApprovalAction("reject");
                                setApprovalDialogOpen(true);
                              }}
                            >
                              <XCircle className="w-4 h-4 mr-2 text-destructive" />
                              Reject
                            </DropdownMenuItem>
                          </>
                        )}
                        {user.approval_status === "approved" && (
                          <>
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedUser(user);
                                setSelectedRole(user.role || "");
                                setIsRoleDialogOpen(true);
                              }}
                            >
                              <Shield className="w-4 h-4 mr-2" />
                              {user.role ? "Change Role" : "Assign Role"}
                            </DropdownMenuItem>
                            {user.role && (
                              <DropdownMenuItem onClick={() => handleRemoveRole(user)}>
                                <UserX className="w-4 h-4 mr-2" />
                                Remove Role
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleOpenMenuDialog(user)}>
                              <Menu className="w-4 h-4 mr-2" />
                              Manage Menus
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedUser(user);
                                setSuspendAction("suspend");
                                setSuspendDialogOpen(true);
                              }}
                              className="text-destructive"
                            >
                              <Ban className="w-4 h-4 mr-2" />
                              Suspend Access
                            </DropdownMenuItem>
                          </>
                        )}
                        {user.approval_status === "suspended" && (
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedUser(user);
                              setSuspendAction("reactivate");
                              setSuspendDialogOpen(true);
                            }}
                          >
                            <RefreshCw className="w-4 h-4 mr-2 text-success" />
                            Reactivate
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );

  return (
    <DashboardLayout
      title="User Management"
      subtitle="Manage users, approvals, and access control"
    >
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold text-foreground">{users.length}</p>
              <p className="text-sm text-muted-foreground">Total Users</p>
            </div>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-6 cursor-pointer hover:ring-2 hover:ring-warning/50"
          onClick={() => setSearchParams({ tab: "pending" })}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-warning/20 flex items-center justify-center">
              <Clock className="w-6 h-6 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold text-foreground">{pendingCount}</p>
              <p className="text-sm text-muted-foreground">Pending Approval</p>
            </div>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-6 cursor-pointer hover:ring-2 hover:ring-success/50"
          onClick={() => setSearchParams({ tab: "active" })}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
              <UserCheck className="w-6 h-6 text-success" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold text-foreground">{activeCount}</p>
              <p className="text-sm text-muted-foreground">Active Users</p>
            </div>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-6 cursor-pointer hover:ring-2 hover:ring-destructive/50"
          onClick={() => setSearchParams({ tab: "suspended" })}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-destructive/20 flex items-center justify-center">
              <Ban className="w-6 h-6 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold text-foreground">{suspendedCount}</p>
              <p className="text-sm text-muted-foreground">Suspended</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(val) => setSearchParams({ tab: val })} className="mb-6">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="all">All Users</TabsTrigger>
          <TabsTrigger value="pending" className="gap-2">
            Pending
            {pendingCount > 0 && (
              <Badge variant="secondary" className="bg-warning/15 text-warning text-xs">
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="suspended">Suspended</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Actions Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-6">
        <div className="flex gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-secondary/50 border-border/50"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-40 bg-secondary/50 border-border/50">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="operations">Operations</SelectItem>
              <SelectItem value="support">Support</SelectItem>
              <SelectItem value="dispatcher">Dispatcher</SelectItem>
              <SelectItem value="driver">Driver</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Users Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card overflow-hidden"
      >
        {renderUserTable(filteredUsers)}
      </motion.div>

      {/* Assign Role Dialog */}
      <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {selectedUser?.role ? "Update Role" : "Assign Role"}
            </DialogTitle>
            <DialogDescription>
              {selectedUser?.role
                ? `Change role for ${selectedUser?.full_name}`
                : `Assign a role to ${selectedUser?.full_name}`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="role">Select Role</Label>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger className="mt-2 bg-secondary/50">
                <SelectValue placeholder="Choose a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">
                  <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4" />
                    Admin - Full access to all features
                  </div>
                </SelectItem>
                <SelectItem value="operations">
                  <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    Operations - Manage dispatches and routes
                  </div>
                </SelectItem>
                <SelectItem value="support">
                  <div className="flex items-center gap-2">
                    <Headphones className="w-4 h-4" />
                    Support - Handle customer queries
                  </div>
                </SelectItem>
                <SelectItem value="dispatcher">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="w-4 h-4" />
                    Dispatcher - Assign drivers to dispatches
                  </div>
                </SelectItem>
                <SelectItem value="driver">
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4" />
                    Driver - View and update own trips
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRoleDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssignRole} disabled={saving}>
              {saving ? "Saving..." : selectedUser?.role ? "Update Role" : "Assign Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approval Dialog */}
      <UserApprovalDialog
        open={approvalDialogOpen}
        onOpenChange={setApprovalDialogOpen}
        user={selectedUser}
        action={approvalAction}
        onConfirm={handleApproveReject}
        loading={saving}
      />

      {/* Suspend Dialog */}
      <UserSuspendDialog
        open={suspendDialogOpen}
        onOpenChange={setSuspendDialogOpen}
        user={selectedUser}
        action={suspendAction}
        onConfirm={handleSuspendReactivate}
        loading={saving}
      />

      {/* Manage Menus Dialog */}
      <Dialog open={isMenuDialogOpen} onOpenChange={setIsMenuDialogOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[82vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Menu className="w-5 h-5" />
              Manage Menus — {selectedUser?.full_name}
            </DialogTitle>
            <DialogDescription>
              Turn menus on or off for this user. Menus outside their role can be individually granted.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-2 space-y-4">
            {(() => {
              const userMenuRole = selectedUser?.role || "";
              const roleMenus = ALL_MENUS.filter(m => m.roles.includes(userMenuRole));
              const extraMenus = ALL_MENUS.filter(m => !m.roles.includes(userMenuRole));

              const renderMenuRow = (menu: typeof ALL_MENUS[0], hasRoleAccess: boolean) => {
                // Effective access: role grants + not hidden, OR explicitly granted (hidden:false in overrides)
                const override = menuOverrides[menu.href];
                // override === true → hidden, override === false → explicitly granted, undefined → default
                let isVisible: boolean;
                if (override === true) isVisible = false;           // explicitly hidden
                else if (override === false) isVisible = true;       // explicitly granted
                else isVisible = hasRoleAccess;                      // default from role

                return (
                  <div
                    key={menu.href}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-secondary/40"
                  >
                    <div className="flex items-center gap-3">
                      <LayoutDashboard className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <span className="text-sm font-medium text-foreground">{menu.name}</span>
                        {!hasRoleAccess && (
                          <span className="ml-2 text-xs text-warning bg-warning/10 px-1.5 py-0.5 rounded">Extra Access</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${isVisible ? "text-success" : "text-muted-foreground"}`}>
                        {isVisible ? "Visible" : "Hidden"}
                      </span>
                      <Switch
                        checked={isVisible}
                        onCheckedChange={(checked) => {
                          setMenuOverrides(prev => {
                            const next = { ...prev };
                            if (hasRoleAccess) {
                              // Role has it by default: hidden=true removes it, undefined restores default
                              if (!checked) next[menu.href] = true;
                              else delete next[menu.href];
                            } else {
                              // Role doesn't have it: hidden=false grants it, undefined means no access
                              if (checked) next[menu.href] = false;
                              else delete next[menu.href];
                            }
                            return next;
                          });
                        }}
                      />
                    </div>
                  </div>
                );
              };

              return (
                <>
                  {roleMenus.length > 0 && (
                    <div>
                      <p className="px-3 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Role Menus ({userMenuRole || "no role"})
                      </p>
                      {roleMenus.map(m => renderMenuRow(m, true))}
                    </div>
                  )}
                  <div>
                    <p className="px-3 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Grant Extra Access
                    </p>
                    {extraMenus.map(m => renderMenuRow(m, false))}
                  </div>
                </>
              );
            })()}
          </div>
          <DialogFooter className="pt-2 border-t border-border/50">
            <Button variant="outline" onClick={() => setIsMenuDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveMenuOverrides} disabled={savingMenus}>
              {savingMenus ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default UsersPage;
