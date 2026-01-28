import { motion } from "framer-motion";
import { Ban, LogOut, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

interface SuspendedAccountScreenProps {
  reason?: string;
}

const SuspendedAccountScreen = ({ reason }: SuspendedAccountScreenProps) => {
  const { signOut, user } = useAuth();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-8 max-w-md w-full text-center"
      >
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-destructive/20 flex items-center justify-center">
          <Ban className="w-10 h-10 text-destructive" />
        </div>
        
        <h1 className="text-2xl font-heading font-bold text-foreground mb-2">
          Account Suspended
        </h1>
        
        <p className="text-muted-foreground mb-6">
          Your account has been suspended and you no longer have access to the platform.
        </p>

        {reason && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-6">
            <p className="text-sm font-medium text-destructive mb-1">Reason for suspension:</p>
            <p className="text-sm text-foreground">{reason}</p>
          </div>
        )}

        <div className="bg-secondary/50 rounded-lg p-4 mb-6">
          <p className="text-sm text-muted-foreground mb-2">Account:</p>
          <p className="font-medium text-foreground">{user?.email}</p>
        </div>

        <div className="border-t border-border pt-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            If you believe this is an error, please contact your administrator.
          </p>
          
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={handleSignOut}
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

export default SuspendedAccountScreen;
