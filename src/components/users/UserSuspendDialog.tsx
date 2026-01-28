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
import { Ban, UserCheck } from "lucide-react";

interface UserSuspendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: {
    id: string;
    user_id: string;
    full_name: string;
    email: string;
    approval_status?: string;
  } | null;
  action: "suspend" | "reactivate";
  onConfirm: (reason?: string) => Promise<void>;
  loading: boolean;
}

const UserSuspendDialog = ({
  open,
  onOpenChange,
  user,
  action,
  onConfirm,
  loading,
}: UserSuspendDialogProps) => {
  const [reason, setReason] = useState("");

  const handleConfirm = async () => {
    await onConfirm(reason);
    setReason("");
  };

  const handleClose = () => {
    setReason("");
    onOpenChange(false);
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            {action === "suspend" ? (
              <>
                <Ban className="w-5 h-5 text-destructive" />
                Suspend User Access
              </>
            ) : (
              <>
                <UserCheck className="w-5 h-5 text-success" />
                Reactivate User
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {action === "suspend"
              ? `Suspend ${user.full_name}'s access to the platform. This action can be reversed.`
              : `Restore ${user.full_name}'s access to the platform.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-secondary/50 rounded-lg p-3">
            <p className="text-sm text-muted-foreground">User</p>
            <p className="font-medium text-foreground">{user.full_name}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>

          {action === "suspend" && (
            <>
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                <p className="text-sm text-destructive font-medium">Warning</p>
                <p className="text-sm text-muted-foreground">
                  This user will immediately lose access to all platform features. 
                  Use this for terminations or resignations.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Reason for Suspension <span className="text-destructive">*</span></Label>
                <Textarea
                  placeholder="e.g., Employee resignation, Termination, Temporary leave..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="bg-secondary/50"
                  required
                />
              </div>
            </>
          )}

          {action === "reactivate" && (
            <div className="bg-success/10 border border-success/20 rounded-lg p-3">
              <p className="text-sm text-success font-medium">Restore Access</p>
              <p className="text-sm text-muted-foreground">
                This user will regain access to the platform with their existing role.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading || (action === "suspend" && !reason.trim())}
            variant={action === "suspend" ? "destructive" : "default"}
          >
            {loading
              ? "Processing..."
              : action === "suspend"
              ? "Suspend Access"
              : "Reactivate User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UserSuspendDialog;
