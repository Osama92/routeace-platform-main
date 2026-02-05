import { Step } from "react-joyride";

// Tour steps organized by section
export const tourSteps: Record<string, Step[]> = {
  welcome: [
    {
      target: ".sidebar-navigation",
      content: "Welcome to RouteAce! This is your navigation menu. Use it to access all features of the platform.",
      placement: "right",
      disableBeacon: true,
    },
    {
      target: ".sidebar-logo",
      content: "Click the logo anytime to return to your dashboard.",
      placement: "right",
    },
  ],
  dashboard: [
    {
      target: ".dashboard-stats-grid",
      content: "View your key metrics at a glance - active shipments, deliveries, revenue, and more.",
      placement: "bottom",
    },
    {
      target: ".dashboard-revenue-chart",
      content: "Track your revenue and performance trends over time with interactive charts.",
      placement: "top",
    },
    {
      target: ".dashboard-recent-activity",
      content: "Stay updated with recent activity including new dispatches, deliveries, and status changes.",
      placement: "left",
    },
  ],
  dispatch: [
    {
      target: ".dispatch-actions-bar",
      content: "Create new dispatches and manage your logistics operations from here.",
      placement: "bottom",
    },
    {
      target: ".dispatch-status-filters",
      content: "Filter dispatches by status - pending, in transit, delivered, or cancelled.",
      placement: "bottom",
    },
    {
      target: ".dispatch-list",
      content: "View and manage all your dispatches. Click any dispatch to see details or take action.",
      placement: "top",
    },
  ],
  invoices: [
    {
      target: ".invoices-actions-bar",
      content: "Generate invoices from completed dispatches and manage your billing.",
      placement: "bottom",
    },
    {
      target: ".invoices-list",
      content: "Track invoice status, payments, and sync with your accounting system.",
      placement: "top",
    },
  ],
  tracking: [
    {
      target: ".tracking-map-container",
      content: "Monitor your fleet in real-time on the interactive map. See vehicle locations, routes, and status.",
      placement: "left",
    },
    {
      target: ".tracking-vehicle-list",
      content: "View detailed information about each vehicle including driver, status, and last update time.",
      placement: "right",
    },
  ],
  settings: [
    {
      target: ".settings-profile-section",
      content: "Manage your profile, company information, and preferences.",
      placement: "right",
    },
    {
      target: ".settings-integrations-section",
      content: "Connect with external services like Zoho Books, Google Sheets, and GPS tracking systems.",
      placement: "left",
    },
  ],
};

// Combined steps for the full tour based on current page
export const getStepsForPage = (pageName: string): Step[] => {
  return tourSteps[pageName] || [];
};

// Get all steps for a complete tour path
export const getFullTourSteps = (path: string[]): Step[] => {
  return path.flatMap(section => tourSteps[section] || []);
};

// Role-specific "aha!" messages
export const roleAhaMoments: Record<string, string> = {
  admin: "You now have full control over your logistics operations. Monitor everything from one dashboard!",
  operations: "Efficiently manage dispatches and track your team's performance from here.",
  dispatcher: "Easily assign drivers and track deliveries in real-time.",
  driver: "View your assigned deliveries and update status on the go.",
  support: "Access customer information and invoice details to provide excellent support.",
};

// Welcome messages by role
export const roleWelcomeMessages: Record<string, { title: string; description: string }> = {
  admin: {
    title: "Welcome, Administrator!",
    description: "As an admin, you have full access to manage users, view analytics, configure settings, and oversee all logistics operations.",
  },
  operations: {
    title: "Welcome to Operations!",
    description: "Manage dispatches, track fleet performance, and coordinate deliveries efficiently from your operations dashboard.",
  },
  dispatcher: {
    title: "Welcome, Dispatcher!",
    description: "Assign drivers, create dispatches, and monitor real-time tracking to ensure smooth deliveries.",
  },
  driver: {
    title: "Welcome, Driver!",
    description: "View your assigned dispatches and update delivery status easily from your dashboard.",
  },
  support: {
    title: "Welcome to Support!",
    description: "Access customer information, manage invoices, and provide excellent customer service.",
  },
};
