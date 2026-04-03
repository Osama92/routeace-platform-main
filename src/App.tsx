import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { DispatchNotificationProvider } from "@/contexts/DispatchNotificationContext";
import { OnboardingProvider } from "@/contexts/OnboardingContext";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import UserAuth from "./pages/UserAuth";
import Dashboard from "./pages/Dashboard";
import UserDashboard from "./pages/UserDashboard";
import Dispatch from "./pages/Dispatch";
import Tracking from "./pages/Tracking";
import Track from "./pages/Track";
import Drivers from "./pages/Drivers";
import DriverPerformance from "./pages/DriverPerformance";
import DriverPayroll from "./pages/DriverPayroll";
import Fleet from "./pages/Fleet";
import RoutesPage from "./pages/Routes";
import Customers from "./pages/Customers";
import Partners from "./pages/Partners";
import VendorPerformance from "./pages/VendorPerformance";
import Invoices from "./pages/Invoices";
import InvoiceApprovals from "./pages/InvoiceApprovals";
import InvoiceReports from "./pages/InvoiceReports";
import Expenses from "./pages/Expenses";
import Bills from "./pages/Bills";
import ExpenseApprovals from "./pages/ExpenseApprovals";
import VendorPayables from "./pages/VendorPayables";
import Analytics from "./pages/Analytics";
import AdminAnalytics from "./pages/AdminAnalytics";
import SessionAnalytics from "./pages/SessionAnalytics";
import SessionAlerts from "./pages/SessionAlerts";
import Settings from "./pages/Settings";
import UsersPage from "./pages/Users";
import AuditLogs from "./pages/AuditLogs";
import EmailNotifications from "./pages/EmailNotifications";
import EmailTemplates from "./pages/EmailTemplates";
import TargetSettings from "./pages/TargetSettings";
import ProductMetrics from "./pages/ProductMetrics";
import ProfitLoss from "./pages/ProfitLoss";
import TaxFilingReport from "./pages/TaxFilingReport";
import DriverBonuses from "./pages/DriverBonuses";
import TripRateConfig from "./pages/TripRateConfig";
import HistoricalDataMigration from "./pages/HistoricalDataMigration";
import PendingApprovals from "./pages/PendingApprovals";
import NotFound from "./pages/NotFound";
import OnlineUsersIndicator from "./components/shared/OnlineUsersIndicator";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <AuthProvider>
        <OnboardingProvider>
          <DispatchNotificationProvider>
            <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <OnlineUsersIndicator />
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/user-auth" element={<UserAuth />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/user-dashboard"
              element={
                <ProtectedRoute>
                  <UserDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dispatch"
              element={
                <ProtectedRoute allowedRoles={["admin", "operations", "dispatcher"]}>
                  <Dispatch />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tracking"
              element={
                <ProtectedRoute>
                  <Tracking />
                </ProtectedRoute>
              }
            />
            <Route
              path="/drivers"
              element={
                <ProtectedRoute allowedRoles={["admin", "operations", "dispatcher"]}>
                  <Drivers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/fleet"
              element={
                <ProtectedRoute allowedRoles={["admin", "operations"]}>
                  <Fleet />
                </ProtectedRoute>
              }
            />
            <Route
              path="/routes"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <RoutesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/customers"
              element={
                <ProtectedRoute allowedRoles={["admin", "support"]}>
                  <Customers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/partners"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <Partners />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vendor-performance"
              element={
                <ProtectedRoute allowedRoles={["admin", "operations"]}>
                  <VendorPerformance />
                </ProtectedRoute>
              }
            />
            <Route
              path="/invoices"
              element={
                <ProtectedRoute allowedRoles={["admin", "support", "operations"]}>
                  <Invoices />
                </ProtectedRoute>
              }
            />
            <Route
              path="/invoice-approvals"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <InvoiceApprovals />
                </ProtectedRoute>
              }
            />
            <Route
              path="/analytics"
              element={
                <ProtectedRoute allowedRoles={["admin", "operations"]}>
                  <Analytics />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <UsersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/emails"
              element={
                <ProtectedRoute allowedRoles={["admin", "support", "operations"]}>
                  <EmailNotifications />
                </ProtectedRoute>
              }
            />
            <Route path="/track" element={<Track />} />
            <Route
              path="/expenses"
              element={
                <ProtectedRoute allowedRoles={["admin", "operations"]}>
                  <Expenses />
                </ProtectedRoute>
              }
            />
            <Route
              path="/bills"
              element={
                <ProtectedRoute allowedRoles={["admin", "operations"]}>
                  <Bills />
                </ProtectedRoute>
              }
            />
            <Route
              path="/expense-approvals"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <ExpenseApprovals />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin-analytics"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <AdminAnalytics />
                </ProtectedRoute>
              }
            />
            <Route
              path="/driver-performance"
              element={
                <ProtectedRoute allowedRoles={["admin", "operations"]}>
                  <DriverPerformance />
                </ProtectedRoute>
              }
            />
            <Route
              path="/driver-payroll"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <DriverPayroll />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vendor-payables"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <VendorPayables />
                </ProtectedRoute>
              }
            />
            <Route
              path="/invoice-reports"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <InvoiceReports />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profit-loss"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <ProfitLoss />
                </ProtectedRoute>
              }
            />
            <Route
              path="/target-settings"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <TargetSettings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/audit-logs"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <AuditLogs />
                </ProtectedRoute>
              }
            />
            <Route
              path="/email-templates"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <EmailTemplates />
                </ProtectedRoute>
              }
            />
            <Route
              path="/product-metrics"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <ProductMetrics />
                </ProtectedRoute>
              }
            />
            <Route
              path="/session-analytics"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <SessionAnalytics />
                </ProtectedRoute>
              }
            />
            <Route
              path="/session-alerts"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <SessionAlerts />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tax-filing-report"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <TaxFilingReport />
                </ProtectedRoute>
              }
            />
            <Route
              path="/driver-bonuses"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <DriverBonuses />
                </ProtectedRoute>
              }
            />
            <Route
              path="/trip-rate-config"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <TripRateConfig />
                </ProtectedRoute>
              }
            />
            <Route
              path="/historical-data"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <HistoricalDataMigration />
                </ProtectedRoute>
              }
            />
            <Route
              path="/pending-approvals"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <PendingApprovals />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </BrowserRouter>
          </TooltipProvider>
        </DispatchNotificationProvider>
      </OnboardingProvider>
    </AuthProvider>
  </ThemeProvider>
</QueryClientProvider>
);

export default App;
