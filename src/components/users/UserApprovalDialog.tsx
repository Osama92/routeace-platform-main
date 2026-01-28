import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserCheck, UserX, Crown, Settings, Headphones, ClipboardList, Truck } from "lucide-react";

interface UserApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: {
    id: string;
    user_id: string;
    full_name: string;
    email: string;
  } | null;
  action: "approve" | "reject";
  onConfirm: (role?: string, reason?: string) => Promise<void>;
  loading: boolean;
}

const UserApprovalDialog = ({
  open,
  onOpenChange,
  user,
  action,
  onConfirm,
  loading,
}: UserApprovalDialogProps) => {
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [reason, setReason] = useState("");

  const handleConfirm = async () => {
    if (action === "approve" && !selectedRole) {
      return;
    }
    await onConfirm(selectedRole, reason);
    setSelectedRole("");
    setReason("");
  };

  const handleClose = () => {
    setSelectedRole("");
    setReason("");
    onOpenChange(false);
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            {action === "approve" ? (
              <>
                <UserCheck className="w-5 h-5 text-success" />
                Approve User
              </>
            ) : (
              <>
                <UserX className="w-5 h-5 text-destructive" />
                Reject User
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {action === "approve"
              ? `Approve ${user.full_name} and assign a role to grant access.`
              : `Reject the registration for ${user.full_name}. They will not be able to access the platform.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-secondary/50 rounded-lg p-3">
            <p className="text-sm text-muted-foreground">User</p>
            <p className="font-medium text-foreground">{user.full_name}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>

          {action === "approve" ? (
            <div className="space-y-2">
              <Label>Assign Role <span className="text-destructive">*</span></Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <Crown className="w-4 h-4" />
                      Admin - Full access
                    </div>
                  </SelectItem>
                  <SelectItem value="operations">
                    <div className="flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      Operations - Manage dispatches
                    </div>
                  </SelectItem>
                  <SelectItem value="support">
                    <div className="flex items-center gap-2">
                      <Headphones className="w-4 h-4" />
                      Support - Handle queries
                    </div>
                  </SelectItem>
                  <SelectItem value="dispatcher">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="w-4 h-4" />
                      Dispatcher - Assign drivers
                    </div>
                  </SelectItem>
                  <SelectItem value="driver">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4" />
                      Driver - View own trips
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Reason for Rejection</Label>
              <Textarea
                placeholder="Enter reason for rejection (optional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="bg-secondary/50"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading || (action === "approve" && !selectedRole)}
            variant={action === "approve" ? "default" : "destructive"}
          >
            {loading
              ? "Processing..."
              : action === "approve"
              ? "Approve & Assign Role"
              : "Reject User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UserApprovalDialog;
