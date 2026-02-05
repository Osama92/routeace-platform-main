import { motion, AnimatePresence } from "framer-motion";
import { Truck, Play, SkipForward, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { useAuth } from "@/contexts/AuthContext";
import { roleWelcomeMessages } from "./tourSteps";

const WelcomeModal = () => {
  const { state, startTour, skipTour } = useOnboarding();
  const { userRole, user } = useAuth();

  if (!state.showWelcome) {
    return null;
  }

  const welcomeContent = userRole
    ? roleWelcomeMessages[userRole]
    : roleWelcomeMessages.admin;

  // Get user's first name from full_name metadata
  const fullName = user?.user_metadata?.full_name || "";
  const firstName = fullName.split(" ")[0] || "there";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", duration: 0.5 }}
          className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header with gradient */}
          <div className="relative bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-6 pb-8">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />

            {/* Logo and sparkles */}
            <div className="relative flex items-center gap-4">
              <motion.div
                initial={{ rotate: -10 }}
                animate={{ rotate: 0 }}
                transition={{ delay: 0.2, type: "spring" }}
                className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center shadow-lg"
              >
                <Truck className="w-7 h-7 text-primary-foreground" />
              </motion.div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-heading font-bold text-xl text-foreground">RouteAce</h1>
                  <motion.div
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ delay: 0.5, duration: 0.5 }}
                  >
                    <Sparkles className="w-5 h-5 text-yellow-500" />
                  </motion.div>
                </div>
                <p className="text-sm text-muted-foreground">Logistics Platform</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            <div>
              <h2 className="font-heading text-2xl font-bold text-foreground mb-2">
                Hi {firstName}! {welcomeContent.title.replace("Welcome", "")}
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                {welcomeContent.description}
              </p>
            </div>

            {/* Quick highlights */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Real-time Tracking", icon: "MapPin" },
                { label: "Smart Analytics", icon: "BarChart" },
                { label: "Easy Invoicing", icon: "FileText" },
                { label: "Fleet Management", icon: "Truck" },
              ].map((feature, index) => (
                <motion.div
                  key={feature.label}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  className="flex items-center gap-2 p-3 rounded-lg bg-secondary/50"
                >
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <span className="text-sm font-medium text-foreground">{feature.label}</span>
                </motion.div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                onClick={startTour}
                className="flex-1 gap-2 bg-primary hover:bg-primary/90"
              >
                <Play className="w-4 h-4" />
                Take the Tour
                <ArrowRight className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                onClick={skipTour}
                className="flex-1 gap-2"
              >
                <SkipForward className="w-4 h-4" />
                Skip for Now
              </Button>
            </div>

            <p className="text-xs text-center text-muted-foreground">
              You can always restart the tour from Settings
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default WelcomeModal;
