import { motion } from "framer-motion";
import { Clock, LogOut, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

const PendingApprovalScreen = () => {
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
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-warning/20 flex items-center justify-center">
          <Clock className="w-10 h-10 text-warning" />
        </div>
        
        <h1 className="text-2xl font-heading font-bold text-foreground mb-2">
          Account Pending Approval
        </h1>
        
        <p className="text-muted-foreground mb-6">
          Thank you for signing up! Your account is currently awaiting approval from an administrator.
          You will be notified once your account has been approved.
        </p>

        <div className="bg-secondary/50 rounded-lg p-4 mb-6">
          <p className="text-sm text-muted-foreground mb-2">Signed in as:</p>
          <p className="font-medium text-foreground">{user?.email}</p>
        </div>

        <div className="space-y-3 text-left mb-6">
          <div className="flex items-start gap-3 text-sm">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-primary font-medium">1</span>
            </div>
            <div>
              <p className="font-medium text-foreground">Application Received</p>
              <p className="text-muted-foreground">Your registration has been submitted</p>
            </div>
          </div>
          <div className="flex items-start gap-3 text-sm">
            <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center flex-shrink-0">
              <span className="text-warning font-medium">2</span>
            </div>
            <div>
              <p className="font-medium text-foreground">Under Review</p>
              <p className="text-muted-foreground">An admin will review your application shortly</p>
            </div>
          </div>
          <div className="flex items-start gap-3 text-sm opacity-50">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <span className="text-muted-foreground font-medium">3</span>
            </div>
            <div>
              <p className="font-medium text-foreground">Access Granted</p>
              <p className="text-muted-foreground">You'll get access once approved</p>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Need assistance? Contact your administrator.
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

export default PendingApprovalScreen;
