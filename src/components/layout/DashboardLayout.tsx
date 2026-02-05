import { ReactNode, useMemo } from "react";
import { useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { SidebarProvider, useSidebar } from "@/contexts/SidebarContext";
import { useOnboarding, roleTourPaths } from "@/contexts/OnboardingContext";
import { useAuth } from "@/contexts/AuthContext";
import { WelcomeModal, ProductTour, getStepsForPage } from "@/components/onboarding";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

// Map paths to tour section names
const pathToSectionMap: Record<string, string> = {
  "/": "dashboard",
  "/dispatch": "dispatch",
  "/invoices": "invoices",
  "/tracking": "tracking",
  "/settings": "settings",
};

const DashboardContent = ({ children, title, subtitle }: DashboardLayoutProps) => {
  const { isCollapsed } = useSidebar();
  const { state } = useOnboarding();
  const { userRole } = useAuth();
  const location = useLocation();

  // Get tour steps for current page and role
  const tourSteps = useMemo(() => {
    if (!state.isActive || !userRole) return [];

    const currentSection = pathToSectionMap[location.pathname];
    if (!currentSection) return [];

    // Check if this section is in the user's tour path
    const tourPath = roleTourPaths[userRole as keyof typeof roleTourPaths] || [];
    if (!tourPath.includes(currentSection)) return [];

    // Always include welcome steps on dashboard, then current section steps
    const steps = [];
    if (location.pathname === "/" && tourPath.includes("welcome")) {
      steps.push(...getStepsForPage("welcome"));
    }
    steps.push(...getStepsForPage(currentSection));

    return steps;
  }, [state.isActive, userRole, location.pathname]);

  return (
    <div className="min-h-screen bg-background">
      {/* Onboarding components */}
      <WelcomeModal />
      <ProductTour steps={tourSteps} />

      <Sidebar />
      <main
        className={cn(
          "transition-all duration-150",
          "lg:ml-[280px]",
          isCollapsed && "lg:ml-[80px]"
        )}
      >
        <Header title={title} subtitle={subtitle} />
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
};

const DashboardLayout = (props: DashboardLayoutProps) => {
  return (
    <SidebarProvider>
      <DashboardContent {...props} />
    </SidebarProvider>
  );
};

export default DashboardLayout;
