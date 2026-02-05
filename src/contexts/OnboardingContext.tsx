import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type AppRole = "admin" | "operations" | "support" | "dispatcher" | "driver";

interface OnboardingState {
  isActive: boolean;
  showWelcome: boolean;
  currentStep: number;
  tourProgress: Record<string, boolean>;
  completedAt: Date | null;
  isLoading: boolean;
}

interface OnboardingContextType {
  state: OnboardingState;
  startTour: () => void;
  endTour: () => void;
  skipTour: () => void;
  completeTour: () => void;
  restartTour: () => void;
  dismissWelcome: () => void;
  setCurrentStep: (step: number) => void;
  shouldShowOnboarding: boolean;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export const useOnboarding = () => {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboarding must be used within an OnboardingProvider");
  }
  return context;
};

// Role-based tour paths - which sections each role should see
export const roleTourPaths: Record<AppRole, string[]> = {
  admin: ["welcome", "dashboard", "dispatch", "invoices", "tracking", "settings"],
  operations: ["welcome", "dashboard", "dispatch", "invoices"],
  dispatcher: ["welcome", "dispatch", "tracking"],
  driver: ["welcome", "dispatch"],
  support: ["welcome", "dashboard", "invoices"],
};

export const OnboardingProvider = ({ children }: { children: ReactNode }) => {
  const { user, userRole } = useAuth();
  const [state, setState] = useState<OnboardingState>({
    isActive: false,
    showWelcome: false,
    currentStep: 0,
    tourProgress: {},
    completedAt: null,
    isLoading: true,
  });

  // Fetch onboarding status from database
  const fetchOnboardingStatus = useCallback(async () => {
    if (!user) {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("onboarding_completed, onboarding_completed_at, onboarding_skipped, tour_progress")
        .eq("user_id", user.id)
        .single();

      if (error) {
        console.error("Error fetching onboarding status:", error);
        setState(prev => ({ ...prev, isLoading: false }));
        return;
      }

      const hasCompleted = data?.onboarding_completed === true;
      const hasSkipped = data?.onboarding_skipped === true;
      const shouldShowWelcome = !hasCompleted && !hasSkipped;

      setState({
        isActive: false,
        showWelcome: shouldShowWelcome,
        currentStep: 0,
        tourProgress: (data?.tour_progress as Record<string, boolean>) || {},
        completedAt: data?.onboarding_completed_at ? new Date(data.onboarding_completed_at) : null,
        isLoading: false,
      });
    } catch (error) {
      console.error("Error fetching onboarding status:", error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [user]);

  useEffect(() => {
    fetchOnboardingStatus();
  }, [fetchOnboardingStatus]);

  // Update database with onboarding progress
  const updateOnboardingStatus = async (updates: {
    onboarding_completed?: boolean;
    onboarding_completed_at?: string | null;
    onboarding_skipped?: boolean;
    tour_progress?: Record<string, boolean>;
  }) => {
    if (!user) return;

    try {
      await supabase
        .from("profiles")
        .update(updates)
        .eq("user_id", user.id);
    } catch (error) {
      console.error("Error updating onboarding status:", error);
    }
  };

  const startTour = () => {
    setState(prev => ({
      ...prev,
      isActive: true,
      showWelcome: false,
      currentStep: 0,
    }));
  };

  const endTour = () => {
    setState(prev => ({
      ...prev,
      isActive: false,
      currentStep: 0,
    }));
  };

  const skipTour = async () => {
    setState(prev => ({
      ...prev,
      isActive: false,
      showWelcome: false,
    }));

    await updateOnboardingStatus({
      onboarding_skipped: true,
    });
  };

  const completeTour = async () => {
    const now = new Date();
    setState(prev => ({
      ...prev,
      isActive: false,
      showWelcome: false,
      completedAt: now,
    }));

    await updateOnboardingStatus({
      onboarding_completed: true,
      onboarding_completed_at: now.toISOString(),
      onboarding_skipped: false,
    });
  };

  const restartTour = async () => {
    setState(prev => ({
      ...prev,
      isActive: true,
      showWelcome: false,
      currentStep: 0,
      tourProgress: {},
      completedAt: null,
    }));

    await updateOnboardingStatus({
      onboarding_completed: false,
      onboarding_completed_at: null,
      onboarding_skipped: false,
      tour_progress: {},
    });
  };

  const dismissWelcome = () => {
    setState(prev => ({
      ...prev,
      showWelcome: false,
    }));
  };

  const setCurrentStep = (step: number) => {
    setState(prev => ({
      ...prev,
      currentStep: step,
    }));
  };

  // Determine if onboarding should be shown based on user status
  const shouldShowOnboarding = Boolean(
    user &&
    !state.isLoading &&
    (state.showWelcome || state.isActive)
  );

  return (
    <OnboardingContext.Provider
      value={{
        state,
        startTour,
        endTour,
        skipTour,
        completeTour,
        restartTour,
        dismissWelcome,
        setCurrentStep,
        shouldShowOnboarding,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
};
