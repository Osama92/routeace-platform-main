import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Truck,
  Users,
  MapPin,
  FileText,
  Package,
  Settings,
  ChevronLeft,
  ChevronRight,
  Route,
  BarChart3,
  Mail,
  Building2,
  Handshake,
  UserCog,
  LogOut,
  CircleDollarSign,
  PieChart,
  Timer,
  AlertTriangle,
  Wallet,
  FileEdit,
  TrendingUp,
  X,
  ClipboardCheck,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/contexts/SidebarContext";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, roles: ["admin", "operations", "support", "dispatcher", "driver"] },
  { name: "Dispatch", href: "/dispatch", icon: Package, roles: ["admin", "operations", "dispatcher"] },
  { name: "Tracking", href: "/tracking", icon: MapPin, roles: ["admin", "operations", "support", "dispatcher", "driver"] },
  { name: "Drivers", href: "/drivers", icon: Users, roles: ["admin", "operations", "dispatcher"] },
  { name: "Driver Payroll", href: "/driver-payroll", icon: Wallet, roles: ["admin"] }, // Removed operations
  { name: "Driver Bonuses", href: "/driver-bonuses", icon: TrendingUp, roles: ["admin"] }, // Removed operations
  { name: "Tax Filing", href: "/tax-filing-report", icon: FileText, roles: ["admin"] }, // Removed operations (financial)
  { name: "Fleet", href: "/fleet", icon: Truck, roles: ["admin", "operations"] },
  { name: "Routes", href: "/routes", icon: Route, roles: ["admin"] }, // Removed operations
  { name: "Customers", href: "/customers", icon: Building2, roles: ["admin", "support"] }, // Removed operations
  { name: "Partners", href: "/partners", icon: Handshake, roles: ["admin"] }, // Removed operations
  { name: "Vendor Performance", href: "/vendor-performance", icon: TrendingUp, roles: ["admin", "operations"] }, // Keep but hide revenue
  { name: "Invoices", href: "/invoices", icon: FileText, roles: ["admin", "support", "operations"] },
  { name: "Expenses", href: "/expenses", icon: CircleDollarSign, roles: ["admin", "operations"] },
  { name: "Analytics", href: "/analytics", icon: BarChart3, roles: ["admin", "operations"] }, // Keep but hide revenue
];

const adminNavigation = [
  { name: "Pending Approvals", href: "/pending-approvals", icon: ClipboardCheck },
  { name: "Invoice Approvals", href: "/invoice-approvals", icon: FileText },
  { name: "Trip Rate Config", href: "/trip-rate-config", icon: Settings },
  { name: "Historical Data", href: "/historical-data", icon: BarChart3 },
  { name: "P&L Analytics", href: "/admin-analytics", icon: PieChart },
  { name: "Session Analytics", href: "/session-analytics", icon: Timer },
  { name: "Session Alerts", href: "/session-alerts", icon: AlertTriangle },
  { name: "Email Templates", href: "/email-templates", icon: FileEdit },
  { name: "Users", href: "/users", icon: UserCog },
  { name: "Settings", href: "/settings", icon: Settings },
];

const supportNavigation = [
  { name: "Email Notifications", href: "/emails", icon: Mail, roles: ["admin", "support", "operations"] },
];

const Sidebar = () => {
  const { isOpen, setIsOpen, isCollapsed, setIsCollapsed } = useSidebar();
  const location = useLocation();
  const { userRole, signOut, user } = useAuth();
  const [isMobile, setIsMobile] = useState(false);

  // Check screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Close mobile sidebar on navigation
  useEffect(() => {
    if (isMobile) {
      setIsOpen(false);
    }
  }, [location.pathname, isMobile, setIsOpen]);

  const filteredNavigation = navigation.filter((item) => {
    if (!userRole) return true;
    return item.roles.includes(userRole);
  });

  const handleSignOut = async () => {
    await signOut();
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 p-5 border-b border-sidebar-border">
        <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <Truck className="w-5 h-5 text-primary-foreground" />
        </div>
        {(!isCollapsed || isMobile) && (
          <div className="flex-1">
            <h1 className="font-heading font-semibold text-lg text-foreground">RouteAce</h1>
            <p className="text-xs text-muted-foreground">Logistics Platform</p>
          </div>
        )}
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setIsOpen(false)}
          >
            <X className="w-5 h-5" />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto scrollbar-thin">
        {filteredNavigation.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                "nav-link",
                isActive && "active",
                isCollapsed && !isMobile && "justify-center px-3"
              )}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {(!isCollapsed || isMobile) && <span className="font-medium">{item.name}</span>}
            </Link>
          );
        })}

        {/* Support/Operations Section */}
        {(userRole === "admin" || userRole === "support" || userRole === "operations") && (
          <>
            {(!isCollapsed || isMobile) && (
              <div className="pt-4 pb-2">
                <p className="px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Communications
                </p>
              </div>
            )}
            {supportNavigation
              .filter(item => item.roles.includes(userRole || ""))
              .map((item) => {
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={cn(
                      "nav-link",
                      isActive && "active",
                      isCollapsed && !isMobile && "justify-center px-3"
                    )}
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    {(!isCollapsed || isMobile) && <span className="font-medium">{item.name}</span>}
                  </Link>
                );
              })}
          </>
        )}

        {/* Admin Section */}
        {userRole === "admin" && (
          <>
            {(!isCollapsed || isMobile) && (
              <div className="pt-4 pb-2">
                <p className="px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Admin
                </p>
              </div>
            )}
            {adminNavigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "nav-link",
                    isActive && "active",
                    isCollapsed && !isMobile && "justify-center px-3"
                  )}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {(!isCollapsed || isMobile) && <span className="font-medium">{item.name}</span>}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* Bottom section */}
      <div className="p-4 border-t border-sidebar-border space-y-1">
        {user && (
          <Button
            variant="ghost"
            onClick={handleSignOut}
            className={cn(
              "w-full nav-link text-destructive hover:text-destructive hover:bg-destructive/10",
              isCollapsed && !isMobile && "justify-center px-3"
            )}
          >
            <LogOut className="w-5 h-5" />
            {(!isCollapsed || isMobile) && <span className="font-medium">Sign Out</span>}
          </Button>
        )}
      </div>
    </>
  );

  // Mobile: overlay drawer
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        {isOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setIsOpen(false)}
          />
        )}
        {/* Drawer */}
        <aside
          className={cn(
            "fixed left-0 top-0 h-screen w-[280px] bg-sidebar border-r border-sidebar-border z-50 flex flex-col transition-transform duration-200 lg:hidden",
            isOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          {sidebarContent}
        </aside>
      </>
    );
  }

  // Desktop: fixed sidebar
  return (
    <aside
      style={{ width: isCollapsed ? 80 : 280 }}
      className="fixed left-0 top-0 h-screen bg-sidebar border-r border-sidebar-border z-50 flex-col transition-[width] duration-150 hidden lg:flex"
    >
      {sidebarContent}

      {/* Collapse button - desktop only */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-20 w-6 h-6 bg-secondary border border-border rounded-md flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors"
      >
        {isCollapsed ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <ChevronLeft className="w-4 h-4" />
        )}
      </button>
    </aside>
  );
};

export default Sidebar;
