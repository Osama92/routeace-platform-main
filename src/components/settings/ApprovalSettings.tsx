import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  UserCheck,
  UserPlus,
  Trash2,
  Shield,
  CheckCheck,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface ApprovalRole {
  id: string;
  user_id: string;
  approval_level: "first_level" | "second_level";
  created_at: string;
  profiles?: {
    full_name: string;
    email: string;
    avatar_url: string | null;
  };
}

interface AvailableUser {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
}

const ApprovalSettings = () => {
  const [approvalRoles, setApprovalRoles] = useState<ApprovalRole[]>([]);
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [deleteConfirm, setDeleteConfirm] = useState<ApprovalRole | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchData = async () => {
    try {
      // Fetch existing approval roles
      const { data: roles, error: rolesError } = await supabase
        .from("approval_roles")
        .select("*")
        .order("approval_level", { ascending: true });

      if (rolesError) throw rolesError;

      // Fetch all approved users (potential approvers)
      const { data: users, error: usersError } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, email, avatar_url")
        .eq("approval_status", "approved")
        .eq("is_active", true)
        .order("full_name");

      if (usersError) throw usersError;

      // Enrich approval roles with profile data
      const enrichedRoles = (roles || []).map((role) => {
        const userProfile = (users || []).find((u) => u.user_id === role.user_id);
        return {
          ...role,
          profiles: userProfile ? {
            full_name: userProfile.full_name,
            email: userProfile.email,
            avatar_url: userProfile.avatar_url,
          } : undefined,
        };
      });

      setApprovalRoles(enrichedRoles);
      setAvailableUsers(users || []);
    } catch (error: any) {
      console.error("Error loading approval settings:", error);
      toast({
        title: "Error",
        description: "Failed to load approval settings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddApprover = async () => {
    if (!selectedUser || !selectedLevel) {
      toast({
        title: "Validation Error",
        description: "Please select both a user and approval level",
        variant: "destructive",
      });
      return;
    }

    // Check if user already has this role
    const existing = approvalRoles.find(
      (role) => role.user_id === selectedUser && role.approval_level === selectedLevel
    );

    if (existing) {
      toast({
        title: "Already Assigned",
        description: "This user already has this approval level",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("approval_roles").insert({
        user_id: selectedUser,
        approval_level: selectedLevel,
        assigned_by: user?.id,
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Approval role assigned successfully",
      });

      setSelectedUser("");
      setSelectedLevel("");
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to assign approval role",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveApprover = async () => {
    if (!deleteConfirm) return;

    try {
      const { error } = await supabase
        .from("approval_roles")
        .delete()
        .eq("id", deleteConfirm.id);

      if (error) throw error;

      toast({
        title: "Removed",
        description: "Approval role removed successfully",
      });

      setDeleteConfirm(null);
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to remove approval role",
        variant: "destructive",
      });
    }
  };

  const firstLevelApprovers = approvalRoles.filter((r) => r.approval_level === "first_level");
  const secondLevelApprovers = approvalRoles.filter((r) => r.approval_level === "second_level");

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return (
      <Card className="glass-card border-border/50">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add New Approver */}
      <Card className="glass-card border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Assign Approval Authority
          </CardTitle>
          <CardDescription>
            Assign users to approve invoices at first level or second level
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger className="flex-1 bg-secondary/50">
                <SelectValue placeholder="Select user" />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>
                    <div className="flex items-center gap-2">
                      <span>{u.full_name}</span>
                      <span className="text-muted-foreground text-xs">({u.email})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedLevel} onValueChange={setSelectedLevel}>
              <SelectTrigger className="w-full md:w-48 bg-secondary/50">
                <SelectValue placeholder="Approval level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="first_level">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-warning" />
                    First Level
                  </div>
                </SelectItem>
                <SelectItem value="second_level">
                  <div className="flex items-center gap-2">
                    <CheckCheck className="w-4 h-4 text-success" />
                    Second Level (Final)
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            <Button onClick={handleAddApprover} disabled={saving || !selectedUser || !selectedLevel}>
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <UserPlus className="w-4 h-4 mr-2" />
              )}
              Assign
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* First Level Approvers */}
      <Card className="glass-card border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserCheck className="w-5 h-5 text-warning" />
                First Level Approvers
              </CardTitle>
              <CardDescription>
                Users who can give first approval on invoices
              </CardDescription>
            </div>
            <Badge variant="secondary" className="bg-warning/15 text-warning">
              {firstLevelApprovers.length} assigned
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {firstLevelApprovers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No first level approvers assigned</p>
              <p className="text-sm">Add users above to enable invoice approvals</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {firstLevelApprovers.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="w-8 h-8">
                          <AvatarImage src={role.profiles?.avatar_url || undefined} />
                          <AvatarFallback className="bg-warning/20 text-warning text-xs">
                            {getInitials(role.profiles?.full_name || "?")}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{role.profiles?.full_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {role.profiles?.email}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(role.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteConfirm(role)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Second Level Approvers */}
      <Card className="glass-card border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CheckCheck className="w-5 h-5 text-success" />
                Second Level Approvers (Final)
              </CardTitle>
              <CardDescription>
                Users who can give final approval on invoices
              </CardDescription>
            </div>
            <Badge variant="secondary" className="bg-success/15 text-success">
              {secondLevelApprovers.length} assigned
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {secondLevelApprovers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No second level approvers assigned</p>
              <p className="text-sm">Add users above to enable final approvals</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {secondLevelApprovers.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="w-8 h-8">
                          <AvatarImage src={role.profiles?.avatar_url || undefined} />
                          <AvatarFallback className="bg-success/20 text-success text-xs">
                            {getInitials(role.profiles?.full_name || "?")}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{role.profiles?.full_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {role.profiles?.email}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(role.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteConfirm(role)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Approval Authority</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {deleteConfirm?.profiles?.full_name} from{" "}
              {deleteConfirm?.approval_level === "first_level" ? "first" : "second"} level approvals?
              They will no longer be able to approve invoices at this level.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveApprover}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ApprovalSettings;
