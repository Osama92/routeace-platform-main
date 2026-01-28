import { ReactNode } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { SidebarProvider, useSidebar } from "@/contexts/SidebarContext";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

const DashboardContent = ({ children, title, subtitle }: DashboardLayoutProps) => {
  const { isCollapsed } = useSidebar();

  return (
    <div className="min-h-screen bg-background">
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
