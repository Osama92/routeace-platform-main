import { useCallback } from "react";
import Joyride, { CallBackProps, STATUS, Step, ACTIONS, EVENTS } from "react-joyride";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { roleAhaMoments } from "./tourSteps";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface ProductTourProps {
  steps: Step[];
}

const ProductTour = ({ steps }: ProductTourProps) => {
  const { state, completeTour, endTour, setCurrentStep } = useOnboarding();
  const { userRole } = useAuth();
  const { toast } = useToast();

  const handleCallback = useCallback((data: CallBackProps) => {
    const { status, action, index, type } = data;

    // Handle step changes
    if (type === EVENTS.STEP_AFTER && action === ACTIONS.NEXT) {
      setCurrentStep(index + 1);
    } else if (type === EVENTS.STEP_AFTER && action === ACTIONS.PREV) {
      setCurrentStep(index - 1);
    }

    // Handle tour completion
    if (status === STATUS.FINISHED) {
      completeTour();

      // Show "aha!" moment toast
      const ahaMessage = userRole ? roleAhaMoments[userRole] : roleAhaMoments.admin;
      toast({
        title: "You're all set!",
        description: ahaMessage,
      });
    }

    // Handle tour skip
    if (status === STATUS.SKIPPED || (action === ACTIONS.CLOSE && type === EVENTS.STEP_AFTER)) {
      endTour();
    }
  }, [completeTour, endTour, setCurrentStep, userRole, toast]);

  if (!state.isActive || steps.length === 0) {
    return null;
  }

  return (
    <Joyride
      steps={steps}
      run={state.isActive}
      continuous
      showSkipButton
      showProgress
      stepIndex={state.currentStep}
      callback={handleCallback}
      scrollToFirstStep
      disableOverlayClose
      spotlightClicks
      locale={{
        back: "Back",
        close: "Close",
        last: "Finish",
        next: "Next",
        skip: "Skip Tour",
      }}
      styles={{
        options: {
          primaryColor: "hsl(var(--primary))",
          backgroundColor: "hsl(var(--card))",
          textColor: "hsl(var(--card-foreground))",
          arrowColor: "hsl(var(--card))",
          overlayColor: "rgba(0, 0, 0, 0.5)",
          zIndex: 10000,
        },
        tooltip: {
          borderRadius: "12px",
          padding: "16px 20px",
        },
        tooltipTitle: {
          fontSize: "16px",
          fontWeight: 600,
          marginBottom: "8px",
        },
        tooltipContent: {
          fontSize: "14px",
          lineHeight: 1.5,
        },
        buttonNext: {
          backgroundColor: "hsl(var(--primary))",
          borderRadius: "8px",
          padding: "8px 16px",
          fontWeight: 500,
        },
        buttonBack: {
          color: "hsl(var(--muted-foreground))",
          marginRight: "8px",
        },
        buttonSkip: {
          color: "hsl(var(--muted-foreground))",
          fontSize: "13px",
        },
        spotlight: {
          borderRadius: "8px",
        },
        beacon: {
          display: "none", // We're using disableBeacon on steps, but hide globally too
        },
      }}
      floaterProps={{
        styles: {
          floater: {
            filter: "drop-shadow(0 10px 30px rgba(0, 0, 0, 0.3))",
          },
        },
      }}
    />
  );
};

export default ProductTour;
