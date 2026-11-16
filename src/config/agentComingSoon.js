// "Coming soon" New-Booking flows for AGENT logins.
//
// Single source of truth shared by two surfaces that must never disagree:
//   • AgentDashboard.jsx  → Quick Actions tiles (disabled tile + hover badge)
//   • components/Sidebar.jsx → New Booking submenu (disabled entry + pill)
// Both derive their Coming Soon state from this set, keyed by route, because
// the route is the one thing the two surfaces share (their labels differ:
// "24 Hours" vs "24 Hour"). Delete a route here when its flow goes live for
// agents and both surfaces open up together.
//
// Agent-only by design: admin / extranet / staff menus never consult this.
export const AGENT_COMING_SOON_ROUTES = new Set([
  "/new-booking/hotel-24hr",        // 24 Hours
  "/new-booking/long-stay",         // Long Stays
  "/new-booking/day-stay",          // Day Stays
  "/new-booking/cab",               // Transfers
  "/new-booking/scheffer-driver",   // Chauffeur & Limousines
  "/new-booking/restaurant",        // Restaurants
  "/new-booking/honeymoon",         // Honeymoon Packages
  "/new-booking/meet-and-space",    // Meeting Spaces
  "/new-booking/ayurveda",          // Ayurveda
]);

/** True when the given route is not open to agents yet. */
export const isAgentComingSoon = (to) => AGENT_COMING_SOON_ROUTES.has(to);

/** Tooltip text both surfaces show on a Coming Soon entry. */
export const COMING_SOON_TITLE = "Coming soon…";
