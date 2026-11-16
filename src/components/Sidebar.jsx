import React, { useState, useRef, useEffect } from "react";
import { Nav, Offcanvas } from "react-bootstrap";
import { Link, useLocation } from "react-router-dom";
import "./Sidebar.css";
import {
  LayoutDashboard,
  Puzzle,
  Building2,
  ClipboardList,
  PlusCircle,
  BookOpen,
  FileText,
  Landmark,
  Users,
  UserCog,
  CalendarDays,
  FileSignature,
  BarChart3,
  Tag,
  ImagePlus,
  Dot,
  Utensils,
  Trophy,
  Award,
  BadgeCheck,
  KeyRound,
  Plug,
} from "lucide-react";
import { FaAd, FaBrain, FaBullhorn, FaBullseye, FaFileAlt, FaImages, FaRobot, FaTags, FaUser } from "react-icons/fa";
import axiosInstance from "./AxiosInstance";
// Booking-code search box — hidden for now. To bring it back, uncomment this
// import, the three blocks marked "Booking-code search (hidden)" below, and
// the matching block at the end of Sidebar.css.
// import BookingCodeSearch from "./BookingCodeSearch";
import { isAgentComingSoon, COMING_SOON_TITLE } from "../config/agentComingSoon";
import { isPartnerRole } from "../config/partnerFeatures";
import PartnerSidebar from "./PartnerSidebar";
import { getUserRole, getCurrentActiveRole, setCurrentActiveRole, getUserName } from "../utils/authSession";


let labelForDashboard = " ";

/**
 * Menus whose flyout opens UPWARDS (`.submenu-up` — bottom anchored to the top
 * of the row) because they sit low enough in the sidebar that a downward panel
 * would run off the bottom of the screen.
 *
 * "Report" belongs here rather than in the `submenu-center` group: that variant
 * anchors the panel at `top: 0` of its row, and with Report near the foot of
 * the admin menu its 22rem panel was being cut off by the viewport.
 */
const SUBMENU_UP = new Set([
  "Inhouse Accounts",
  "Agent Incentive",
  "Marketing",
  "Report",
]);

/**
 * A New Booking submenu entry whose flow is not open to agents yet.
 *
 * Mirrors the AgentDashboard quick-action tile for the same route: greyed and
 * non-clickable, "Coming soon…" tooltip, orange "Coming soon" pill (styles in
 * custom.scss next to .submenu-link). Renders a span, not a Link, so there is
 * nothing to navigate to — the unfinished page is never opened.
 */
function ComingSoonSubmenuItem({ label, color }) {
  return (
    <span
      className="nav-link submenu-link is-coming-soon"
      role="link"
      aria-disabled="true"
      title={COMING_SOON_TITLE}
      onClick={(e) => e.preventDefault()}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "8px 12px",
        color,
        textDecoration: "none",
        cursor: "not-allowed",
        fontWeight: 450,
      }}
    >
      <span className="submenu-coming-label">{label}</span>
      <span className="submenu-coming-badge" aria-hidden="true">
        Coming soon
      </span>
    </span>
  );
}

/**
 * Pending-approval pill for an Approvals submenu entry (Hotel / Agent /
 * Supplier / DMC). Styled by .submenu-pending-badge in custom.scss.
 */
function SubmenuPendingBadge({ count }) {
  if (!count) return null;
  return (
    <span
      className="ms-2 badge rounded-pill submenu-pending-badge"
      title={`${count} pending approval${count === 1 ? "" : "s"}`}
    >
      {count}
    </span>
  );
}

export default function Sidebar() {
  const [show, setShow] = useState(false);
  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);
  const [openGroups, setOpenGroups] = useState({});
  const sidebarRef = useRef(null);
  const offcanvasRef = useRef(null);
  const [hotelId, setHotelId] = useState(null);

  /**
   * Codes that super_admin has explicitly HIDDEN for the caller's role,
   * fetched once on mount from /api/sidebar/hidden-menus. Empty set on
   * error → sidebar keeps its full hardcoded menu (fail-open, so a
   * transient DB hiccup never blanks the sidebar).
   */
  const [hiddenCodes, setHiddenCodes] = useState(() => new Set());
  /**
   * PENDING self-registration counts per Approvals submenu entry, keyed by
   * the child's menu code. The Approvals label shows their sum so admins
   * see there's queue work without opening the menu; once expanded, each
   * entry (Hotel / Agent / Supplier / DMC) shows its own share. Only admins
   * fetch it.
   */
  const [approvalsPendingByCode, setApprovalsPendingByCode] = useState({});
  // Entries hidden by super_admin are left out so the total always equals
  // the sum of the counts visible in the expanded submenu.
  const approvalsPendingCount = Object.entries(approvalsPendingByCode)
    .filter(([code]) => !hiddenCodes.has(code))
    .reduce((sum, [, n]) => sum + n, 0);

  // Desktop sidebar collapse (remembered across reloads). When collapsed the
  // <aside> is removed so the page content reclaims the space, and a small
  // floating button restores it.
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sidebarCollapsed") === "true",
  );
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("sidebarCollapsed", String(next));
      return next;
    });
  };

  const storedRoles = getUserRole()
    .split(",")
    .map((role) => role.trim().toLowerCase());

  // The dashboard landing pages define which "hat" a multi-role user is
  // currently wearing — opening /agentDashboard means acting as an agent
  // even if the last role picked on /select-userRole was admin (that
  // selection lives in localStorage, which goes stale across tabs and
  // direct URL visits). Deriving the role from the dashboard route keeps
  // the menu — including admin-only entries like Report → Hotel Booking
  // History — consistent with the dashboard being viewed.
  const { pathname } = useLocation();
  const dashboardRoleByPath = {
    "/adminDashboard": "admin",
    "/agentDashboard": "agent",
    "/staffDashboard": "staff",
    "/extranetDashboard": "extranet",
    // Super admin — same landing surface as admin (reuses AdminDashboard)
    // but this path pins the active role to super_admin so the sidebar
    // filter shows the SUPER_ADMIN-only groups (API Access, Credential Vault).
    "/superAdminDashboard": "super_admin",
    // Supplier / DMC portal — same trick, so a direct visit to either
    // dashboard pins the partner role before PartnerSidebar renders.
    "/supplierDashboard": "supplier",
    "/dmcDashboard": "dmc",
  };
  // Honour the dashboard's role only when this login actually holds it, so
  // typing /adminDashboard cannot switch an agent into the admin menu.
  // Super admin may still open the admin dashboard (it inherits admin).
  const requestedPathRole = dashboardRoleByPath[pathname];
  const pathRole =
    requestedPathRole &&
    (storedRoles.includes(requestedPathRole) ||
      (requestedPathRole === "admin" && storedRoles.includes("super_admin")))
      ? requestedPathRole
      : undefined;

  const currentRole =
    pathRole ||
    getCurrentActiveRole().toLowerCase() ||
    storedRoles[0] ||
    "";

  // Sub-account (sub-agent / sub-user) logins use a "prefix.mainAgent"
  // username, which always contains a dot; main-agent login usernames are
  // validated to letters/digits/underscore only (no dot). Sub-accounts must
  // not see the agent "Registration" menu — they can't create their own
  // sub-users / sub-agents. Only affects agent-role logins; every other role
  // is unchanged.
  const loginUserName = getUserName();
  const isSubAccountAgent =
    currentRole === "agent" && loginUserName.includes(".");

  // New Booking flows that are "Coming soon" for AGENT logins (same set the
  // AgentDashboard quick actions use — config/agentComingSoon.js). Admin,
  // super_admin, staff and extranet keep the normal links.
  const isComingSoonForRole = (child) =>
    currentRole === "agent" && !!child?.to && isAgentComingSoon(child.to);

  // Re-sync the stored active role with the dashboard context so the
  // role-guarded routes (PrivateRoute roles=[...]) agree with the menu.
  useEffect(() => {
    if (pathRole && getCurrentActiveRole().toLowerCase() !== pathRole) {
      setCurrentActiveRole(pathRole);
    }
  }, [pathRole]);

  useEffect(() => {
    const fetchHotelId = async () => {
      try {
        const userName = getUserName();
        if (userName && currentRole === "extranet") {
          const response = await axiosInstance.get(`/api/personalProfile/${userName}`);
          if (response.data && response.data.id) {
            setHotelId(response.data.id);
          }
        }
      } catch (error) {
        console.error("Error fetching hotelId for sidebar:", error);
      }
    };

    fetchHotelId();
  }, [currentRole]);

  // Poll pending-approval count for admins. One-shot on mount is enough
  // for the badge to stay reasonably fresh across a session; the count
  // also refreshes whenever this component remounts (route changes).
  useEffect(() => {
    if (currentRole !== "admin") {
      setApprovalsPendingByCode({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [hotelRes, agentRes, partnerRes] = await Promise.all([
          axiosInstance
            .get("/api/hotel-external-register/pending-count")
            .catch(() => null),
          axiosInstance
            .get("/api/agent-external-register/pending-count")
            .catch(() => null),
          // Supplier / DMC self-registrations awaiting review.
          axiosInstance
            .get("/api/partner-external-register/pending-count")
            .catch(() => null),
        ]);
        if (cancelled) return;
        setApprovalsPendingByCode({
          appr_hotel: Number(hotelRes?.data?.count) || 0,
          appr_agent: Number(agentRes?.data?.count) || 0,
          appr_partner: Number(partnerRes?.data?.count) || 0,
        });
      } catch (_) {
        if (!cancelled) setApprovalsPendingByCode({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentRole]);

  // Fetch the per-role hidden-menu set from the backend once per role
  // change. Fail-open — any error keeps the full hardcoded menu visible,
  // so a network hiccup can never blank the sidebar. Applied via
  // roleAllows below (returns false when the item's code is in the set).
  // Also re-fetched when the Assign Menu screen saves or resets a role
  // ("sidebarHiddenMenusChanged"), so the change shows without a reload.
  useEffect(() => {
    if (!currentRole) {
      setHiddenCodes(new Set());
      return undefined;
    }
    let cancelled = false;
    const loadHiddenCodes = async () => {
      try {
        const res = await axiosInstance.get("/api/sidebar/hidden-menus", {
          params: { role: currentRole },
        });
        if (cancelled) return;
        const codes = Array.isArray(res?.data?.codes) ? res.data.codes : [];
        setHiddenCodes(new Set(codes));
      } catch (_) {
        if (!cancelled) setHiddenCodes(new Set());
      }
    };
    loadHiddenCodes();
    window.addEventListener("sidebarHiddenMenusChanged", loadHiddenCodes);
    return () => {
      cancelled = true;
      window.removeEventListener("sidebarHiddenMenusChanged", loadHiddenCodes);
    };
  }, [currentRole]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const sidebarEl = sidebarRef.current;
      const offcanvasEl = offcanvasRef.current;

      // If click is outside both sidebar and offcanvas
      if (
        sidebarEl &&
        !sidebarEl.contains(event.target) &&
        (!offcanvasEl || !offcanvasEl.contains(event.target))
      ) {
        setOpenGroups({}); // 👈 close all dropdowns
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // TopBar renders the open toggle button (next to the Globosoft logo)
  // and broadcasts this event on click, since TopBar and Sidebar are
  // separate sibling components with no shared parent to wire a prop
  // through. Below the lg breakpoint the offcanvas menu opens; at/above
  // it, the desktop collapsed flag flips instead.
  useEffect(() => {
    const handleToggleRequest = () => {
      if (window.innerWidth <= 991) {
        setShow((s) => !s);
      } else {
        toggleCollapsed();
      }
    };

    window.addEventListener("sidebarToggleRequest", handleToggleRequest);

    return () => {
      window.removeEventListener("sidebarToggleRequest", handleToggleRequest);
    };
  }, []);

  // Tell TopBar whether the desktop sidebar is collapsed so it can show
  // its logo-side toggle button only while the sidebar is closed. When the
  // sidebar is open the collapse control lives inside the sidebar itself
  // (the « button below), matching the previous UI.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("sidebarCollapsedChange", { detail: { collapsed } }),
    );
  }, [collapsed]);


  console.log("currentRole in sidebar::", currentRole);

  // Supplier / DMC logins get a menu generated from their approved
  // features instead of the hardcoded items below. Delegated here (after
  // every hook above has run) so the reused product pages, which all render
  // <Sidebar />, show the partner menu without any change of their own.
  if (isPartnerRole(currentRole)) {
    return (
      <PartnerSidebar
        role={currentRole}
        show={show}
        onClose={handleClose}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
      />
    );
  }

  // Set dashboard path based on current active role
  let dashboardPath = "/";

  if (currentRole === "admin") {
    dashboardPath = "/adminDashboard";
    labelForDashboard = "Admin Dashboard";
  } else if (currentRole === "super_admin") {
    dashboardPath = "/superAdminDashboard";
    labelForDashboard = "Super Admin Dashboard";
  } else if (currentRole === "agent") {
    dashboardPath = "/agentDashboard";
    labelForDashboard = "Agent Dashboard";
  } else if (currentRole === "staff") {
    dashboardPath = "/staffDashboard";
    labelForDashboard = "Staff Dashboard";
  } else if (currentRole === "extranet") {
    dashboardPath = "/extranetDashboard";
    labelForDashboard = "Hotel Dashboard";
  }

  const items = buildSidebarItems({ currentRole, hotelId, dashboardPath });

  return renderSidebar({
    items,
    currentRole,
    hiddenCodes,
    isSubAccountAgent,
    isComingSoonForRole,
    openGroups,
    setOpenGroups,
    collapsed,
    toggleCollapsed,
    show,
    handleClose,
    sidebarRef,
    offcanvasRef,
    approvalsPendingByCode,
    approvalsPendingCount,
  });
}

/**
 * The full, unfiltered sidebar menu. Kept outside the component so the
 * Assign Menu screen reads the very same entries and role rules the sidebar
 * renders (see sidebarMenuCodesForRole) instead of a copy that drifts.
 * Add, rename or re-role menu entries here exactly as before.
 */
export function buildSidebarItems({ currentRole, hotelId, dashboardPath }) {
  return [
    {
      code: "top_dashboard",
      label: labelForDashboard,
      to: dashboardPath,
      roles: ["admin", "agent", "staff", "extranet", "super_admin"],
    },
    {
      // super_admin-only sidebar group that surfaces the identity-and-access
      // tools together: Roles (master), Login Logs (audit trail), Role
      // Assign (attach roles to users), Admin Management (CRUD on ADMIN
      // logins and their company binding). Kept above Manage Masters so
      // it's the first stop after the dashboard.
      //
      // "Admin Management" also appears under the "Access Control" group
      // further down for discoverability from the API-access side. Both
      // entries link to the same route (/super-admin/admins) — kept dual
      // so the pre-existing Access Control layout is untouched.
      code: "top_user_management",
      label: "User Management",
      roles: ["super_admin"],
      children: [
        { label: "Roles",            to: "/masters/user-roles" },
        { label: "Login Logs",       to: "/user-management/login-logs" },
        { label: "Activity Logs",    to: "/user-management/activity-logs" },
        { label: "Role Assign",      to: "/user-management/role-assign" },
        { label: "Admin Management", to: "/super-admin/admins" },
      ],
    },
    {
      code: "top_manage_masters",
      label: "Manage Masters",
      // to: "/manage-masters",
      roles: ["admin"],
      groups: [
        {
          label: "Basic settings",
          children: [
            { label: "Designation", to: "/masters/designations" },
            { label: "Bank", to: "/masters/bank" },
            //Roles and  Assign Menu are super_admin-only tool (per-role sidebar
            // visibility). Kept inside Manage Masters → Basic settings
            // for discoverability but role-gated so admin doesn't see it.
            { label: "Roles", to: "/masters/user-roles", roles: ["super_admin"] },
            { label: "Assign Menu", to: "/masters/assign-menu", roles: ["super_admin"] },
            { label: "Contact Type", to: "/masters/contact-type" },
            { label: "Markup Type", to: "/masters/markup-type" },
            { label: "Cab Type", to: "/masters/cab-type" },
            { label: "Currency", to: "/masters/currency" },
          ],
        },
        {
          label: "Location settings",
          children: [
            // Country → City → Location manager: add a city under a chosen
            // country, a location under a chosen city, and (soft) delete any
            // of them. Feeds the Country / City / Location registration dropdowns.
            { label: "Country / City / Location", to: "/masters/location-hierarchy" },
            { label: "Market Type", to: "/masters/market-type" },
            { label: "Region", to: "/masters/region" },
            { label: "Countries", to: "/masters/countries" },
            { label: "City / Province", to: "/masters/states" },
            { label: "Destinations", to: "/masters/destination" },
            { label: "Locality", to: "/masters/sub-location" },
            { label: "Airport", to: "/masters/airport" },
          ],
        },
        {
          label: "Mapping settings",
          children: [
            // { label: "Country", to: "/masters/country-mapping" },
            { label: "City", to: "/masters/city-mapping" },
            // super_admin-only automatic filler for api_city_mapping — same
            // matching engine the manual "City" screen drives, run for every
            // supplier at once. See /masters/city-mapping-bulk (route also
            // gated to super_admin).
            { label: "Bulk (Auto) Mapping", to: "/masters/city-mapping-bulk", roles: ["super_admin"] },
            { label: "Hotel", to: "/masters/hotel-mapping" },
            { label: "Fetch Hotels", to: "/masters/fetch-new-hotels" },

            // Nested subgroup — a child carrying its own `children` renders as
            // a collapsible accordion inside the group (see the group renderer
            // below). Translates our location masters to i'way's own locations
            // before the transfer search calls the supplier.
            {
              label: "Transfer Location Mapping",
              children: [
                { label: "Airport Mapping", to: "/masters/transfer-airport-mapping" },
                { label: "Hotel Mapping", to: "/masters/transfer-hotel-mapping" },
                { label: "Place Mapping", to: "/masters/transfer-place-mapping" },
              ],
            },

            { label: "Mapped List", to: "/masters/mapped-list" },

          ],
        },
        {
          label: "UnMapping settings",
          children: [
            // { label: "Country", to: "/masters/country-unmapping" },
            { label: "City", to: "/masters/city-unmapping" },
            // { label: "Hotel", to: "/masters/hotel-unmapping" },
          ],
        },
        {
          label: "Hotel settings",
          children: [
            { label: "Hotel Category", to: "/masters/hotel-category" },
            { label: "Hotel Type", to: "/masters/hotel-type" },
            { label: "Occupancy Type", to: "/masters/occupancy-type" },
            { label: "Season Type", to: "/masters/season-type" },
            { label: "Room Category", to: "/masters/room-category" },
            { label: "Room Types", to: "/masters/room-types" },
            { label: "Hotel Amenities", to: "/masters/hotel-amenity" },
            { label: "Room Amenities", to: "/masters/room-amenity" },
            { label: "Meal Plans", to: "/masters/meal-plans" },
          ],
        },
        {
          label: "Agent settings",
          children: [
            { label: "Agent Category", to: "/masters/agent-category" },
          ],
        },
        {
          label: "Package settings",
          children: [
            { label: "Package Category", to: "/masters/package-category" },
            { label: "Package Type", to: "/masters/package-type" },
            { label: "Day Activity", to: "/masters/day-activity" },
            { label: "Itinerary Details", to: "/masters/itinerary-details" },
            { label: "Visa Information", to: "/masters/visa-information" },
            {
              label: "Terms and Conditions",
              to: "/masters/terms-and-conditions",
            },
          ],
        },
      ],
    },
    {
      code: "top_company_profile",
      label: "Company Profile",
      to: "/company-profile",
      roles: ["admin"],
      children: [],
    },
    {
      // Admin-side API access — per-API on/off overlay + Test/Live
      // credential management. Only APIs super_admin enabled for this
      // admin's company show up on the page; toggles here are subtractive.
      code: "top_admin_api_access",
      label: "API Access",
      to: "/admin/api-access",
      roles: ["admin"],
      excludeRoles: ["super_admin"],
      children: [],
    },
    {
      // SUPER_ADMIN-only group. Controls which of our APIs each external
      // client may call, plus the encrypted Credential Vault. Restricted
      // to super_admin so an ADMIN login never sees this group. Backend
      // guards (SuperAdminGuard / SuperAdminOnlyGuard) still enforce the
      // same restriction at the API layer.
      //
      // Group label deliberately named "Access Control" — describes the
      // contents (API surface + client keys + secrets vault) rather than
      // repeating the "Super Admin Dashboard" title above.
      code: "top_access_control",
      label: "Access Control",
      roles: ["super_admin"],
      children: [
        { label: "Endpoint Catalog", to: "/super-admin/api-access/endpoints" },
        { label: "API Clients", to: "/super-admin/api-access/clients" },
        { label: "Admin Management", to: "/super-admin/admins" },
        // Credential Vault deliberately hidden — companies now manage
        // per-API credentials from the admin login (/admin/api-access),
        // and super_admin no longer needs a separate encrypted store.
        // Routes in App.jsx are left intact so a direct URL still works
        // (and this line can be uncommented if the vault is needed later).
      ],
    },
    {
      code: "top_approvals",
      label: "Approvals",
      roles: ["admin"],
      children: [
        { code: "appr_hotel", label: "Hotel", to: "/admin/approval/hotels" },
        { code: "appr_agent", label: "Agent", to: "/admin/approval/agents" },
        { code: "appr_partner", label: "Supplier / DMC", to: "/admin/approval/partners" },
      ],
    },
    {
      code: "top_registration",
      label: "Registration",
      roles: ["admin"],
      // Hidden from super_admin — the SUPER_ADMIN dashboard is a
      // config/identity surface, not a place to onboard hotels / agents.
      // Admin, staff and others still see this group unchanged. Applied
      // via excludeRoles because roleAllows() otherwise inherits every
      // admin-scoped menu for super_admin (see line 907).
      excludeRoles: ["super_admin"],
      // "Agent Management" is an inline nested accordion (has its own
      // children[]) — the render code detects this and renders it as an
      // in-line accordion at this exact position, so it sits right after
      // "Hotel" as required. Sub Agent / Sub User reuse the same
      // /agent-registration routes that agents themselves use.
      children: [
        { code: "reg_all",         label: "All Registrations",                to: "/registration/all" },
        { code: "reg_hotel",         label: "Hotel",                          to: "/registration/hotel" },
        {
          code: "reg_agent_management",
          label: "Agent Management",
          children: [
            { label: "Agent",     to: "/registration/agent" },
            { label: "Sub Agent", to: "/agent-registration/sub-agent" },
            { label: "Sub User",  to: "/agent-registration/sub-user" },
          ],
        },
        { code: "reg_employee",      label: "Employee",                       to: "/registration/employee" },
        { code: "reg_transfers",     label: "Transfers",                      to: "/registration/cabProvider" },
        { code: "reg_activity",      label: "Tours and Activity",             to: "/registration/activityProvider" },
        { code: "reg_package",       label: "Package",                        to: "/registration/package" },
        { code: "reg_supplier",      label: "Supplier",                       to: "/registration/supplier" },
        { code: "reg_restaurants",   label: "Restaurants",                    to: "/restaurant/list" },
        { code: "reg_honeymoon",     label: "Honeymoon Packages",             to: "/honeymoon/list" },
        { code: "reg_ayurveda",      label: "Ayurveda",                       to: "/registration/ayurveda" },
        { code: "reg_scheffer",      label: "Chauffeur Driver and Limousine", to: "/registration/schefferDriver" },
        { code: "reg_package_addons", label: "Build Your Own Package Add-Ons", to: "/registration/package-addons" },
      ],
    },
    {
      code: "top_registration", // same visibility bucket — agent variant of the same top-level slot
      label: "Registration",
      roles: ["agent"],
      // Hidden for sub-account logins (sub-agent / sub-user) — only a main
      // agent may register sub-users / sub-agents.
      subAccountHidden: true,
      children: [
        { label: "Sub User", to: "/agent-registration/sub-user" },
        { label: "Sub Agent", to: "/agent-registration/sub-agent" },
      ],
    },
    {
      code: "top_new_booking",
      label: "New Booking",
      roles: ["admin", "agent"],
      // Hidden from super_admin — booking creation is an operational
      // action, not a config surface. Admin and agent views unchanged.
      excludeRoles: ["super_admin"],
      children: [
        { code: "nb_hotel",         label: "Hotel", to: "/new-booking/hotel" },
        { code: "nb_24hr",          label: "24 Hour", to: "/new-booking/hotel-24hr" },
        { code: "nb_last_minute",   label: "Last Minute", to: "/new-booking/last-minute-booking" },
        { code: "nb_long_stay",     label: "Long Stay", to: "/new-booking/long-stay" },
        { code: "nb_day_stay",      label: "Day Stay", to: "/new-booking/day-stay" },
        {
          code: "nb_byop",
          label: "Build Your Own Package",
          to: "/new-booking/make-your-own-package-v2",
        },
        { code: "nb_package",       label: "Package", to: "/new-booking/package-search" },
        { code: "nb_transfers",     label: "Transfers", to: "/new-booking/cab" },
        { code: "nb_chauffeur",     label: "Chauffeur Driver and Limousine", to: "/new-booking/scheffer-driver" },
        { code: "nb_activity",      label: "Tours and Activity", to: "/new-booking/tours-and-activities" },
        {
          code: "nb_offline",
          label: "Offline",
          to: "/new-booking/offline-search",
          roles: ["admin", "agent"],
        },
        { code: "nb_restaurant",    label: "Restaurant",       to: "/new-booking/restaurant" },
        { code: "nb_honeymoon",     label: "Honeymoon Package", to: "/new-booking/honeymoon" },
        { code: "nb_meet_space",    label: "Meet & Space",     to: "/new-booking/meet-and-space" },
        { code: "nb_gov",           label: "Govt / Airlines",  to: "/new-booking/gov-employee" },
        { code: "nb_ayurveda",      label: "Ayurveda",         to: "/new-booking/ayurveda" },
        {
          code: "nb_student",
          label: "Student",
          to: "/new-booking/student",
        },
        {
          code: "nb_senior_citizen",
         label: "Senior Citizen",
         to: "/new-booking/senior-citizen",
        },
        // Religious flow — same HotelSearch, destination locked to Mecca/Medina.
        {
          code: "nb_religious",
          label: "Religious",
          to: "/new-booking/religious",
        },

         // Flight flow
        {
          label: "Flight",
          to: "/new-booking/flight",
        },
      ],
    },
    {
      code: "top_promotion",
      label: "Promotion",
      to: "/promotion",
      roles: ["admin"],
    },
    {
      code: "top_ai_insights",
      label: "AI Insights",
      roles: ["admin"],
      // Hidden from super_admin — the AI dashboard is admin-facing
      // operational analytics; SUPER_ADMIN uses config/access screens.
      excludeRoles: ["super_admin"],
      children: [
        { label: "Overview", to: "/ai" },
        { label: "Demand & ADR Forecast", to: "/ai/demand-forecast" },
        { label: "Agent Behavior", to: "/ai/agent-behavior" },
        { label: "No-show / Overbooking Risk", to: "/ai/no-show-risk" },
        // Additive admin-only entry — the parent group is already
        // restricted to roles: ["admin"], so AGENT / EXTRANET / STAFF /
        // RESTAURANT_EXTRANET never see it.
        { label: "Unbooked Opportunities", to: "/admin/unbooked-opportunities" },
      ],
    },
    {
      code: "top_booking_list",
      label: "Booking List",
      roles: ["admin", "agent", "staff"],
      // Hidden from super_admin — booking browsing/editing is an
      // operational task. Admin / agent / staff views unchanged.
      excludeRoles: ["super_admin"],
      children: [
        // Unified list combining all booking types below into one view
        // (new, additive page — every other entry here is unchanged).
        { code: "bl_all",         label: "All Bookings",  to: "/booking-details/all-bookings-list" },
        { code: "bl_hotel",       label: "Hotel",         to: "/booking-details/hotel-booking-list" },
        // Dedicated 24-Hour Check-In list — same page wrapped with
        // force24HourOnly so only is24HourCheckin=true rows are shown.
        { code: "bl_24hr",        label: "24 Hour",       to: "/booking-details/24hr-booking-list" },
        // Dedicated Religious booking list — same page wrapped with
        // religiousOnly so only isReligiousBooking=true rows are shown.
        { code: "bl_religious",   label: "Religious",     to: "/booking-details/religious-booking-list" },
        { code: "bl_flight",   label: "Flight",     to: "/booking-details/flight-booking-list" },

        { code: "bl_last_minute", label: "Last Minute",   to: "/booking-details/last-minute-booking-list" },
        { code: "bl_long_stay",   label: "Long Stay",     to: "/booking-details/long-stay-booking-list" },
        { code: "bl_day_stay",    label: "Day Stay",      to: "/booking-details/day-stay-booking-list" },
        // {
        //   label: "Custom Bookings",
        //   to: "/booking-details/custom-booking-list",
        // },
        { code: "bl_byop",        label: "Build Your Own Package", to: "/booking-details/make-your-own-package-v2-list" },
        { code: "bl_package",     label: "Package Booking",   to: "/booking-details/package-booking-list" },
        { code: "bl_activity",    label: "Tours and Activity", to: "/booking-details/activity-booking-list" },
        { code: "bl_transfers",   label: "Transfers",         to: "/booking-details/cab-booking-list" },
        { code: "bl_chauffeur",   label: "Chauffeur Driver and Limousine", to: "/booking-details/scheffer-driver-booking-list" },
        // {
        //   label: "Complete Booking",
        //   to: "/booking-details/complete-booking-list",
        // },
        // {
        //   label: "Quotation List",
        //   to: "/booking-details/quotation-list-list",
        // },
        {
          code: "bl_offline",
          label: "Offline",
          to: "/booking-details/offline-booking-list",
          roles: ["admin", "agent"],
        },
        {
          code: "bl_restaurant",
          label: "Restaurants",
          to: "/booking-details/restaurant-booking-list",
        },
        {
          code: "bl_honeymoon",
          label: "Honeymoon Packages",
          to: "/booking-details/honeymoon-booking-list",
        },
        // Meet & Space booking list — view + cancel from this page
        {
          code: "bl_meet_space",
          label: "Meet & Space",
          to: "/booking-details/meet-and-space-booking-list",
        },
        {
          code: "bl_gov",
          label: "Govt / Airlines",
          to: "/booking-details/gov-employee-booking-list",
        },
        {
          code: "bl_ayurveda",
          label: "Ayurveda",
          to: "/booking-details/ayurveda-booking-list",
        },
        {
          code: "bl_student",
          label: "Student",
          to: "/booking-details/student-booking-list",
        },
        {
          code: "bl_senior_citizen",
          label: "Senior Citizen",
          to: "/booking-details/senior-citizen-booking-list",
        },
      ],
    },
    {
      code: "top_invoice",
      label: "Invoice",
      to: "/invoice",
      roles: ["admin", "agent"],
      // Hidden from super_admin — invoice generation belongs to the
      // admin/agent finance flow. Admin and agent views unchanged.
      excludeRoles: ["super_admin"],
    },
    {
      code: "top_inhouse_accounts",
      label: "Inhouse Accounts",
      roles: ["admin", "agent"],
      children: [
        {
          label: "Agent Accounts",
          to: "/inhouse-accounts/agent",
        },
        {
          // Statement of every credit movement — bookings debit, cancellations
          // and payments credit. Inherits the parent's ["admin", "agent"]
          // roles; an agent login is scoped to its own account server-side.
          label: "Ledger",
          to: "/inhouse-accounts/ledger",
        },
        {
          // Unlike the two above, admin only: the list covers every agent.
          label: "Credit Exceptions",
          to: "/inhouse-accounts/booking-credit-exceptions",
          roles: ["admin"],
        },
        // {
        //   label: "Payment Gateway Transactions",
        //   to: "/inhouse-accounts/payment-gateway-transactions",
        // },
        // {
        //   label: "Statement of Accounts Online",
        //   to: "/inhouse-accounts/statement-of-accounts-online",
        // },
        // {
        //   label: "Statement of Accounts offline",
        //   to: "/inhouse-accounts/statement-of-accounts-offline",
        // },
      ],
    },
    {
      // Finance's daily list of cancelled bookings whose refund is made by
      // hand (today: hotel bookings paid by card through CC Avenue); resolve
      // each within 2 working days. Staff only; super_admin inherits the
      // admin entry. Both codes are seeded in the backend (MenuItemSeeder),
      // so super_admin can hide them per role in Assign Menu.
      code: "top_finance",
      label: "Finance",
      roles: ["admin", "staff"],
      children: [
        {
          code: "fin_refund_review",
          label: "Refund Review",
          to: "/finance/refund-review",
        },
      ],
    },
    // {
    //   label: "Assigned Agents",
    //   to: "/assigned-agents",
    //   roles: ["admin"],
    // },
    {
      code: "top_calendar",
      label: "Calendar",
      // Extranet (hotel) users get their own hotel-scoped calendar page.
      to: currentRole === "extranet" ? "/extranet/calendar" : "/calendar",
      roles: ["admin", "agent", "staff", "extranet"],
    },
    // {
    //   label: "Extranet Contract",
    //   to: "/extranet-contract",
    //   roles: ["admin"],
    // },
    {
      code: "top_report",
      label: "Report",
      to: "/report",
      roles: ["admin", "agent"],
      // Hidden from super_admin — operational reporting is admin-facing.
      // Admin and agent views unchanged; the notes below about agent
      // scoping apply to the admin path only.
      excludeRoles: ["super_admin"],
      // Agents see ONLY the three daily-sales reports here. Everything else is
      // marked admin-only rather than the menu being split in two, so the list
      // stays one definition — and roleAllows() lets super_admin through any
      // roles:["admin"] entry, so their Report menu is unchanged.
      children: [
        {
          label: "Booking",
          to: "/report/booking",
          roles: ["admin"],
        },
        {
          label: "Cancellation",
          to: "/report/cancellation",
          roles: ["admin"],
        },
        // {
        //   label: "Inventory",
        //   to: "/report/inventory",
        // },
        {
          label: "Hotel Wise",
          to: "/report/hotel-wise",
          roles: ["admin"],
        },
        {
          label: "Accounts",
          to: "/report/accounts",
          roles: ["admin"],
        },
        {
          label: "Day Wise",
          to: "/report/day-wise",
          roles: ["admin"],
        },
        {
          label: "Monthly Wise",
          to: "/report/monthly-wise",
          roles: ["admin"],
        },
        {
          label: "Comparison",
          to: "/report/comparison",
          roles: ["admin"],
        },
        {
          label: "Agent Wise",
          to: "/report/agent-wise",
          roles: ["admin"],
        },
        {
          label: "Contract Expiry",
          to: "/report/contract-expiry",
          roles: ["admin"],
        },
        {
          label: "Contract Rate",
          to: "/report/contract-rate",
          roles: ["admin"],
        },
        {
          label: "User Report",
          to: "/report/user-report",
          roles: ["admin"],
        },
        {
          label: "Stop Sale",
          to: "/report/stop-sale",
          roles: ["admin"],
        },
        {
          label: "User Logins",
          to: "/report/user-logins",
          roles: ["admin"],
        },
        // ── Daily sales reports (shared: admin + agent) ──
        {
          label: "Offline Daily Sales",
          to: "/report/offline-daily-sales",
          roles: ["admin", "agent"],
        },
        {
          label: "Online Daily Sales",
          to: "/report/online-daily-sales",
          roles: ["admin", "agent"],
        },
        {
          label: "Time Limit Daily Sales",
          to: "/report/time-limit-daily-sales",
          roles: ["admin", "agent"],
        },
        {
          label: "Hotel Booking History",
          to: "/report/hotel-booking-history",
          roles: ["admin"],
        },
      ],
    },

    // Agent Incentive Module — admin manages rules + reviews claims;
    // agents see their points dashboard and claim history.
    {
      code: "top_agent_incentive",
      label: "Agent Incentive",
      roles: ["admin"],
      children: [
        { label: "Configuration", to: "/incentive/config" },
        { label: "Agent Summary", to: "/incentive/my-incentives" },
        { label: "Claims", to: "/incentive/claims" },
      ],
    },
    {
      code: "top_agent_incentive", // agent-side variant of the same top-level slot 
      label: "My Incentives",
      roles: ["agent"],
      children: [
        { label: "Dashboard", to: "/incentive/my-incentives" }, 
        { label: "My Claims", to: "/incentive/claims" },
      ],
    },


    {
      code: "top_marketing",
      label: "Marketing",
      roles: ["admin"],
      children: [
        { label: "Banners", to: "/offer" },
        { label: "Offer Image", to: "/upload-offer-image" },
        { label: "Advertisements", to: "/advertisements" },
        { label: "Promotion Flyer", to: "/marketing/promotion-flyer" },
      ],
    },


    // {Extranet menus}
    // {
    //   label: "Occupancy",
    //   to: hotelId ? `/extranet/${hotelId}/occupancy-and-minimumlength` : "#",
    //   roles: ["extranet"],
    // },
    // {
    //   label: "Availability",
    //   to: hotelId ? `/extranet/${hotelId}/hotel-availability` : "#",
    //   roles: ["extranet"],
    // },
    // {
    //   label: "Contract Rate",
    //   to: hotelId ? `/extranet/${hotelId}/contract-rate` : "#",
    //   roles: ["extranet"],
    // },
    // {
    //   label: "Promotions",
    //   to: hotelId ? `/extranet/${hotelId}/promotions` : "#",
    //   roles: ["extranet"],
    // },
    // {
    //   label: "Policy",
    //   to: hotelId ? `/extranet/${hotelId}/hotel-policy` : "#",
    //   roles: ["extranet"],
    // },
    {
      code: "top_gallery",
      label: "Gallery",
      to: hotelId ? `/extranet/${hotelId}/gallery` : "#",
      roles: ["extranet"],
    },


  ];
}

  // Filter menu based on allowed roles. Child items (and items inside
  // groups) may also carry a `roles` key — those without one stay visible
  // to every role that can see the parent.
  //
  // super_admin inherits every menu that admin can see so a SUPER_ADMIN
  // login keeps every admin tool (Manage Masters, Reports, Registration,
  // …) and additionally sees SUPER_ADMIN-only groups (roles: ["super_admin"]).
  //
  // `excludeRoles` opts individual items OUT of that inheritance — used for
  // screens where admin's context (their own company) makes sense but
  // super_admin's "sees everything" model doesn't (e.g., the per-company
  // API access page super_admin governs via a different super_admin screen).
export function sidebarEntryAllowed(entry, role) {
  if (!entry.roles) return true;
  if (Array.isArray(entry.excludeRoles) && entry.excludeRoles.includes(role)) return false;
  if (entry.roles.includes(role)) return true;
  if (role === "super_admin" && entry.roles.includes("admin")) return true;
  return false;
}

const hasEntries = (entry) =>
  (Array.isArray(entry.children) && entry.children.length > 0) ||
  (Array.isArray(entry.groups) && entry.groups.length > 0);

/**
 * Codes of the menu entries `role` sees before any super_admin override —
 * the entries the Assign Menu screen offers for that role. Walks the same
 * items with the same rules as the rendered sidebar (role filter, and a
 * group left with nothing to open is not shown). Per-login rules such as
 * the sub-account Registration rule are ignored: the screen assigns per
 * role, not per user.
 */
export function sidebarMenuCodesForRole(role) {
  const codes = new Set();
  const visit = (entries) => {
    (entries || []).forEach((entry) => {
      if (!sidebarEntryAllowed(entry, role)) return;
      const kids = [
        ...(Array.isArray(entry.children) ? entry.children : []),
        ...(Array.isArray(entry.groups)
          ? entry.groups.flatMap((group) => group.children || [])
          : []),
      ];
      const allowedKids = kids.filter((kid) => sidebarEntryAllowed(kid, role));
      if (hasEntries(entry) && allowedKids.length === 0 && !entry.to) return;
      if (entry.code) codes.add(entry.code);
      visit(allowedKids);
    });
  };
  visit(buildSidebarItems({ currentRole: role, hotelId: null, dashboardPath: "/" }));
  return codes;
}

// Second half of <Sidebar />: filters the menu for the active role and
// renders it. A plain function (no hooks) called from Sidebar's render.
function renderSidebar({
  items,
  currentRole,
  hiddenCodes,
  isSubAccountAgent,
  isComingSoonForRole,
  openGroups,
  setOpenGroups,
  collapsed,
  toggleCollapsed,
  show,
  handleClose,
  sidebarRef,
  offcanvasRef,
  approvalsPendingByCode,
  approvalsPendingCount,
}) {
  const roleAllows = (entry) => {
    // Super_admin's per-role visibility overlay — an entry whose stable
    // {@code code} appears in the hidden-set is dropped no matter what
    // the hardcoded roles/excludeRoles say. Only entries with a code are
    // eligible for hiding; sub-menu leaves without a code stay visible
    // as before (they're gated only by their parent's visibility today).
    if (entry.code && hiddenCodes.has(entry.code)) return false;
    return sidebarEntryAllowed(entry, currentRole);
  };

  const filteredItems = items
    .filter(roleAllows)
    // Drop the agent Registration menu for sub-account logins.
    .filter((entry) => !(entry.subAccountHidden && isSubAccountAgent))
    .map((item) => {
    const next = { ...item };
    if (Array.isArray(item.children)) {
      next.children = item.children.filter(roleAllows);
    }
    if (Array.isArray(item.groups)) {
      next.groups = item.groups
        .map((group) => ({
          ...group,
          children: Array.isArray(group.children)
            ? group.children.filter(roleAllows)
            : group.children,
        }))
        .filter(
          (group) =>
            !Array.isArray(group.children) || group.children.length > 0,
        );
    }
    // A group whose every entry was filtered out (e.g. super_admin hid all
    // of Approvals' children on Assign Menu) has nothing left to open and
    // no page of its own — without this it rendered as a dead "#" link.
    if (hasEntries(item) && !hasEntries(next) && !item.to) return null;
    return next;
  })
    .filter(Boolean);

  // Booking-code search (hidden) — pinned above the menu. Same audience as
  // Booking List (super_admin inherits it via roleAllows) and hideable per
  // role from Assign Menu through its code.
  // const showBookingSearch = roleAllows({
  //   code: "top_booking_search",
  //   roles: ["admin", "agent", "staff"],
  // });
  // const bookingSearchInputRef = useRef(null);
  // const focusBookingSearchOnExpand = useRef(false);
  //
  // // "/" (outside text fields) or Ctrl/⌘+K jumps to the booking search,
  // // re-opening a collapsed desktop sidebar first.
  // useEffect(() => {
  //   if (!showBookingSearch) return undefined;
  //   const handleShortcut = (event) => {
  //     const key = String(event.key || "");
  //     const isSlash = key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey;
  //     const isCtrlK = (event.ctrlKey || event.metaKey) && !event.altKey && key.toLowerCase() === "k";
  //     if (!isSlash && !isCtrlK) return;
  //     const target = event.target;
  //     const isTyping =
  //       target instanceof HTMLElement &&
  //       (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
  //     if (isSlash && isTyping) return;
  //     if (window.innerWidth <= 991) return; // desktop sidebar only
  //     event.preventDefault();
  //     if (collapsed) {
  //       focusBookingSearchOnExpand.current = true;
  //       setCollapsed(false);
  //       localStorage.setItem("sidebarCollapsed", "false");
  //     } else {
  //       bookingSearchInputRef.current?.focus();
  //     }
  //   };
  //   document.addEventListener("keydown", handleShortcut);
  //   return () => document.removeEventListener("keydown", handleShortcut);
  // }, [showBookingSearch, collapsed]);
  //
  // useEffect(() => {
  //   if (!collapsed && focusBookingSearchOnExpand.current) {
  //     focusBookingSearchOnExpand.current = false;
  //     bookingSearchInputRef.current?.focus();
  //   }
  // }, [collapsed]);

  const toggleGroup = (groupKey, isTopLevelItem = false) => {
    console.log("Toggling group:", groupKey, "isTopLevelItem:", isTopLevelItem); // Debug log
    setOpenGroups((prev) => {
      const newOpenGroups = {};

      // If it's a top-level menu item (like "Registration", "Manage Masters", etc.)
      if (isTopLevelItem) {
        // Get list of all top-level menu item labels that have children or groups
        const topLevelItems = filteredItems
          .filter(
            (item) =>
              (Array.isArray(item.children) && item.children.length > 0) ||
              (Array.isArray(item.groups) && item.groups.length > 0),
          )
          .map((item) => item.label);

        // Close all other top-level items and their nested groups
        Object.keys(prev).forEach((key) => {
          // Skip the clicked item (we'll handle it separately)
          if (key === groupKey) {
            return;
          }

          // If it's a top-level item, don't keep it (close it)
          if (topLevelItems.includes(key)) {
            return; // Close this top-level item
          }

          // If it's a nested group, check if it belongs to a closed top-level item
          // Nested groups have format: "ParentItem-GroupName"
          if (key.includes("-")) {
            const parentName = key.split("-")[0];
            // Close nested groups that belong to other top-level items
            if (topLevelItems.includes(parentName) && parentName !== groupKey) {
              return; // Close nested groups of other top-level items
            }
            // Keep nested groups that don't belong to top-level items (edge case)
            if (!topLevelItems.includes(parentName)) {
              newOpenGroups[key] = prev[key];
            }
          } else {
            // Keep other non-top-level groups (if any exist)
            newOpenGroups[key] = prev[key];
          }
        });

        // Toggle the clicked top-level item
        newOpenGroups[groupKey] = !prev[groupKey];

        // If we're closing the clicked item, also remove its nested groups
        if (!newOpenGroups[groupKey]) {
          Object.keys(newOpenGroups).forEach((key) => {
            if (key.includes("-") && key.startsWith(groupKey + "-")) {
              delete newOpenGroups[key];
            }
          });
        }
      } else {
        // For nested groups (like "Manage Masters-Basic settings")
        // Copy all existing state and toggle the clicked group
        Object.keys(prev).forEach((key) => {
          newOpenGroups[key] = prev[key];
        });
        newOpenGroups[groupKey] = !prev[groupKey];
      }

      console.log("New open groups:", newOpenGroups); // Debug log
      return newOpenGroups;
    });
  };

  return (
    <>
      {/* Sidebar for large screens.
          d-lg-flex, not d-lg-block: Bootstrap's display utilities carry
          !important, so d-lg-block was silently beating the `display: flex`
          that .sidebar has always declared. The column layout is what lets the
          menu take the scrolling and the Globosoft mark stay pinned below it. */}
      {!collapsed && (
      <aside
        className="sidebar d-none d-lg-flex"
        ref={sidebarRef}
        style={{
          position: "sticky",
          top: "60px", // 👈 height of top bar
          height: "calc(100vh - 60px)", // 👈 reserve space
          background: "var(--color-bg, #fff)",
          borderRight: "1px solid var(--color-border, #e5e7eb)",
          // Must sit above page-level sticky strips (e.g. the hotel search
          // .hs-summary-bar at 1020): submenus rendered inside this <aside>
          // are trapped in its stacking context and were painted underneath.
          // Modals / toasts use 9999+, so they still sit above the sidebar.
          zIndex: 1050,
        }}
      >
        {/* Collapse control — pinned to the top-right corner of the sidebar
            (previous UI). Closing the sidebar hands the toggle back to the
            button next to the Globosoft logo in TopBar. */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            zIndex: 5,
            border: "1px solid var(--color-border, #e5e7eb)",
            background: "#fff",
            color: "#EC0B43",
            width: 30,
            height: 30,
            borderRadius: 8,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          «
        </button>
        {/* Booking-code search (hidden) — the search row, left of the
            collapse button above (.sidebar-search-row keeps room for it). */}
        {/* {showBookingSearch && (
          <div className="sidebar-search-row">
            <BookingCodeSearch
              inputRef={bookingSearchInputRef}
              showAgent={currentRole !== "agent"}
              onActivate={() => setOpenGroups({})}
            />
          </div>
        )} */}
        {/* Two constraints here, both learned the hard way:

            1. NO `overflow` value. The submenus are flyout panels
               (`position: absolute; left: 100%`, see
               .nav-item-has-children .submenu) that sit entirely outside this
               element's right edge; any overflow but `visible` turns this into
               a clipping container and cuts them off on click.
            2. `flex: 0 0 auto` + `nowrap`, never `1 1 auto`. Bootstrap's .nav
               is `flex-wrap: wrap`, so the moment this box is allowed to
               shrink below its content the last menu items WRAP INTO A SECOND
               COLUMN beside the sidebar and float over the page. Letting the
               box keep its content height is what keeps the menu one column.

            .sidebar-globo below still pins to the bottom via margin-top:auto
            whenever the menu leaves room for it. */}
        <Nav
          className="flex-column"
          style={{ paddingTop: 6, flex: "0 0 auto", flexWrap: "nowrap" }}
        >
          {filteredItems.map((item) => {
            const hasChildren =
              Array.isArray(item.children) && item.children.length > 0;
            const hasGroups =
              Array.isArray(item.groups) && item.groups.length > 0;

            return (
              <Nav.Item
                key={item.label}
                className={`nav-item-custom ${hasChildren || hasGroups ? "nav-item-has-children" : ""} ${SUBMENU_UP.has(item.label) ? "submenu-up" : ""} ${item.label === "Booking List" || item.label === "New Booking" || (item.label === "Registration" && (item.children?.length ?? 0) > 4) ? "submenu-center" : ""}`}
              >
                <Nav.Link
                  as={hasChildren || hasGroups ? "div" : Link}
                  to={hasChildren || hasGroups ? undefined : item.to || "#"}
                  className={`d-flex align-items-center justify-content-between${(hasChildren || hasGroups) && openGroups[item.label] ? " rw-active" : ""}`}
                  onClick={
                    hasChildren || hasGroups
                      ? (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log("Clicked on:", item.label); // Debug log
                          const groupKey = item.label;
                          toggleGroup(groupKey, true); // Pass true to indicate it's a top-level item
                        }
                      : undefined
                  }
                  style={{
                    cursor: hasChildren || hasGroups ? "pointer" : "default",
                  }}
                >
                  <span className="d-flex align-items-center">
                    <span className="me-2">{getIcon(item.label)}</span>
                    <span>{item.label}</span>
                    {item.label === "Approvals" && approvalsPendingCount > 0 && (
                      <span
                        className="ms-2 badge rounded-pill"
                        style={{
                          background: "#EC0B43",
                          color: "#fff",
                          fontSize: "0.65rem",
                          padding: "3px 7px",
                          lineHeight: 1,
                        }}
                        title={`${approvalsPendingCount} pending approval${approvalsPendingCount === 1 ? "" : "s"}`}
                      >
                        {approvalsPendingCount}
                      </span>
                    )}
                  </span>
                  {(hasChildren || hasGroups) && (
                    <span className="caret">
                      {openGroups[item.label] ? "▴" : "▾"}
                    </span>
                  )}
                </Nav.Link>

                {(hasChildren || hasGroups) && (
                  <div
                    className={`submenu ${openGroups[item.label] ? "show" : ""}`}
                    style={{
                      display: openGroups[item.label] ? "block" : "none",
                      zIndex: 9999,
                      marginLeft: "12px",
                      marginTop: "6px",
                      paddingLeft: "8px",
                      borderLeft: "1px solid var(--color-border, #e5e7eb)",

                      // ⭐ IMPORTANT FIX
                      maxHeight: "380px", // controls submenu height
                      overflowY: "auto", // enables scroll
                      scrollbarWidth: "thin", // Firefox
                      scrollbarColor: "#eeeaea",
                    }}
                  >
                    {hasChildren &&
                      // Sort the "New Booking" submenu so active flows show
                      // above "Coming soon" ones for agent logins — matches
                      // the AgentDashboard Quick Actions ordering the agent
                      // now sees. Stable sort preserves the declared order
                      // WITHIN each group (Hotel → 24 Hour → Last Minute …
                      // among active, then Long Stay → Day Stay → … among
                      // coming-soon). Gated on label + agent role so every
                      // other menu (Booking List, Manage Masters, etc.) and
                      // every non-agent role keeps its original order — no
                      // impact on existing flows.
                      (item.label === "New Booking" && currentRole === "agent"
                        ? [...item.children].sort(
                            (a, b) =>
                              Number(isComingSoonForRole(a)) -
                              Number(isComingSoonForRole(b))
                          )
                        : item.children
                      ).map((child) => {
                        // Inline nested group: a child with its own children[]
                        // renders as an in-line accordion so it can sit at any
                        // position in the flat list (e.g. "Agent Management"
                        // right after "Hotel"). The item-level `groups: [...]`
                        // field below is still supported for pages like Manage
                        // Masters that only need grouped sub-sections.
                        if (Array.isArray(child.children) && child.children.length > 0) {
                          const groupKey = `${item.label}-${child.label}`;
                          const isOpen = !!openGroups[groupKey];
                          return (
                            <div key={child.label} className="submenu-group">
                              <button
                                type="button"
                                className={`submenu-accordion-header d-flex justify-content-between align-items-center ${
                                  isOpen ? "open" : ""
                                }`}
                                onClick={(e) => {
                                  e.preventDefault();
                                  toggleGroup(groupKey);
                                }}
                              >
                                <span>{child.label}</span>
                                <span className="caret-small">
                                  {isOpen ? "▴" : "▾"}
                                </span>
                              </button>
                              {isOpen && (
                                <div className="submenu-children">
                                  {child.children.map((sub) => (
                                    <Nav.Link
                                      as={Link}
                                      to={sub.to}
                                      key={`${groupKey}-${sub.label}`}
                                      className="submenu-link"
                                    >
                                      {sub.label}
                                    </Nav.Link>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        }
                        if (isComingSoonForRole(child)) {
                          return (
                            <ComingSoonSubmenuItem
                              key={`${item.label}-${child.label}`}
                              label={child.label}
                              color="var(--color-secondary, #111827)"
                            />
                          );
                        }
                        return (
                          <Nav.Link
                            as={Link}
                            to={child.to}
                            key={`${item.label}-${child.label}`}
                            className="submenu-link"
                            style={{
                              display: "block",
                              padding: "8px 12px",
                              color: "var(--color-secondary, #111827)",
                              textDecoration: "none",
                              cursor: "pointer",
                              fontWeight: 450,
                            }}
                          >
                            {child.label}
                            <SubmenuPendingBadge
                              count={approvalsPendingByCode[child.code]}
                            />
                          </Nav.Link>
                        );
                      })}
                    {hasGroups &&
                      item.groups.map((group) => {
                        const groupKey = `${item.label}-${group.label}`;
                        const isOpen = !!openGroups[groupKey];
                        return (
                          <div key={group.label} className="submenu-group">
                            <button
                              type="button"
                              className={`submenu-accordion-header d-flex justify-content-between align-items-center ${
                                isOpen ? "open" : ""
                              }`}
                              onClick={(e) => {
                                e.preventDefault();
                                toggleGroup(groupKey);
                              }}
                            >
                              <span>{group.label}</span>
                              <span className="caret-small">
                                {isOpen ? "▴" : "▾"}
                              </span>
                            </button>
                            {isOpen && (
                              <div className="submenu-children">
                                {group.children.map((sub) => {
                                  // A child with its own children is a nested
                                  // subgroup, not a link — render it as a
                                  // second-level accordion.
                                  if (
                                    Array.isArray(sub.children) &&
                                    sub.children.length > 0
                                  ) {
                                    const subKey = `${groupKey}-${sub.label}`;
                                    const subOpen = !!openGroups[subKey];
                                    return (
                                      <div
                                        key={subKey}
                                        className="submenu-group"
                                        style={{ marginLeft: 8 }}
                                      >
                                        <button
                                          type="button"
                                          className={`submenu-accordion-header d-flex justify-content-between align-items-center ${
                                            subOpen ? "open" : ""
                                          }`}
                                          onClick={(e) => {
                                            e.preventDefault();
                                            toggleGroup(subKey);
                                          }}
                                        >
                                          <span>{sub.label}</span>
                                          <span className="caret-small">
                                            {subOpen ? "▴" : "▾"}
                                          </span>
                                        </button>
                                        {subOpen && (
                                          <div className="submenu-children">
                                            {sub.children.map((leaf) => (
                                              <Nav.Link
                                                as={Link}
                                                to={leaf.to}
                                                key={`${subKey}-${leaf.label}`}
                                                className="submenu-link"
                                              >
                                                {leaf.label}
                                              </Nav.Link>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  }
                                  return (
                                    <Nav.Link
                                      as={Link}
                                      to={sub.to}
                                      key={`${groupKey}-${sub.label}`}
                                      className="submenu-link"
                                    >
                                      {sub.label}
                                    </Nav.Link>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </Nav.Item>
            );
          })}
        </Nav>

        {/* Pinned to the foot of the sidebar. Red cut, because this column is
            white — the white lockups would disappear here. */}
        <div className="sidebar-globo">
          <img
            src={`${process.env.PUBLIC_URL}/images/globo-red-logo-with-text.png`}
            alt="Globosoft"
          />
        </div>
      </aside>
      )}

      {/* Offcanvas for small screens */}
      <Offcanvas show={show} onHide={handleClose}>
        <Offcanvas.Header closeButton>
          <Offcanvas.Title>Globosoft</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body ref={offcanvasRef}>
          {/* Booking-code search (hidden) — mobile menu variant. */}
          {/* {showBookingSearch && (
            <BookingCodeSearch
              inline
              showAgent={currentRole !== "agent"}
              onActivate={() => setOpenGroups({})}
              onNavigate={handleClose}
            />
          )} */}
          <Nav className="flex-column">
            {filteredItems.map((item) => {
              const hasChildren =
                Array.isArray(item.children) && item.children.length > 0;
              const hasGroups =
                Array.isArray(item.groups) && item.groups.length > 0;

              return (
                <Nav.Item
                  key={item.label}
                  className={`nav-item-custom ${hasChildren || hasGroups ? "nav-item-has-children" : ""}`}
                >
                  <Nav.Link
                    as={hasChildren || hasGroups ? "div" : Link}
                    to={hasChildren || hasGroups ? undefined : item.to || "#"}
                    onClick={
                      hasChildren || hasGroups
                        ? (e) => {
                            e.preventDefault();
                            const groupKey = item.label;
                            toggleGroup(groupKey, true); // Pass true to indicate it's a top-level item
                          }
                        : handleClose
                    }
                    style={{
                      cursor: hasChildren || hasGroups ? "pointer" : "default",
                    }}
                  >
                    {getIcon(item.label)} {item.label}
                    {item.label === "Approvals" && approvalsPendingCount > 0 && (
                      <span
                        className="ms-2 badge rounded-pill"
                        style={{
                          background: "#EC0B43",
                          color: "#fff",
                          fontSize: "0.65rem",
                          padding: "3px 7px",
                          lineHeight: 1,
                        }}
                      >
                        {approvalsPendingCount}
                      </span>
                    )}
                    {(hasChildren || hasGroups) && (
                      <span className="caret ms-2">
                        {openGroups[item.label] ? "▴" : "▾"}
                      </span>
                    )}
                  </Nav.Link>

                  {(hasChildren || hasGroups) && (
                    <div
                      className={`submenu ${openGroups[item.label] ? "show" : ""}`}
                      style={{
                        display: openGroups[item.label] ? "block" : "none",
                        zIndex: 9999,
                      }}
                    >
                      {hasChildren &&
                        item.children.map((child) => {
                          // Mirror the desktop render — inline nested group
                          // support so a child with children[] renders as an
                          // accordion at its natural position in the list.
                          if (Array.isArray(child.children) && child.children.length > 0) {
                            const groupKey = `${item.label}-${child.label}`;
                            const isOpen = !!openGroups[groupKey];
                            return (
                              <div key={`${child.label}-mobile`} className="submenu-group">
                                <button
                                  type="button"
                                  className={`submenu-accordion-header d-flex justify-content-between align-items-center ${
                                    isOpen ? "open" : ""
                                  }`}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    toggleGroup(groupKey);
                                  }}
                                >
                                  <span>{child.label}</span>
                                  <span className="caret-small">
                                    {isOpen ? "▴" : "▾"}
                                  </span>
                                </button>
                                {isOpen && (
                                  <div className="submenu-children">
                                    {child.children.map((sub) => (
                                      <Nav.Link
                                        as={Link}
                                        to={sub.to}
                                        key={`${groupKey}-mobile-${sub.label}`}
                                        onClick={handleClose}
                                        className="submenu-link"
                                      >
                                        {sub.label}
                                      </Nav.Link>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          }
                          if (isComingSoonForRole(child)) {
                            return (
                              <ComingSoonSubmenuItem
                                key={`${item.label}-mobile-${child.label}`}
                                label={child.label}
                                color="#111827"
                              />
                            );
                          }
                          return (
                            <Nav.Link
                              as={Link}
                              to={child.to}
                              key={`${item.label}-mobile-${child.label}`}
                              onClick={handleClose}
                              className="submenu-link"
                              style={{
                                display: "block",
                                padding: "8px 12px",
                                color: "#111827",
                                textDecoration: "none",
                                cursor: "pointer",
                              }}
                            >
                              {child.label}
                              <SubmenuPendingBadge
                                count={approvalsPendingByCode[child.code]}
                              />
                            </Nav.Link>
                          );
                        })}
                      {hasGroups &&
                        item.groups.map((group) => {
                          const groupKey = `${item.label}-${group.label}`;
                          const isOpen = !!openGroups[groupKey];
                          return (
                            <div
                              key={`${group.label}-mobile`}
                              className="submenu-group"
                            >
                              <button
                                type="button"
                                className={`submenu-accordion-header d-flex justify-content-between align-items-center ${
                                  isOpen ? "open" : ""
                                }`}
                                onClick={(e) => {
                                  e.preventDefault();
                                  toggleGroup(groupKey);
                                }}
                              >
                                <span>{group.label}</span>
                                <span className="caret-small">
                                  {isOpen ? "▴" : "▾"}
                                </span>
                              </button>
                              {isOpen && (
                                <div className="submenu-children">
                                  {group.children.map((sub) => {
                                    // Same nested-subgroup handling as the
                                    // desktop sidebar above.
                                    if (
                                      Array.isArray(sub.children) &&
                                      sub.children.length > 0
                                    ) {
                                      const subKey = `${groupKey}-${sub.label}`;
                                      const subOpen = !!openGroups[subKey];
                                      return (
                                        <div
                                          key={`${subKey}-mobile`}
                                          className="submenu-group"
                                          style={{ marginLeft: 8 }}
                                        >
                                          <button
                                            type="button"
                                            className={`submenu-accordion-header d-flex justify-content-between align-items-center ${
                                              subOpen ? "open" : ""
                                            }`}
                                            onClick={(e) => {
                                              e.preventDefault();
                                              toggleGroup(subKey);
                                            }}
                                          >
                                            <span>{sub.label}</span>
                                            <span className="caret-small">
                                              {subOpen ? "▴" : "▾"}
                                            </span>
                                          </button>
                                          {subOpen && (
                                            <div className="submenu-children">
                                              {sub.children.map((leaf) => (
                                                <Nav.Link
                                                  as={Link}
                                                  to={leaf.to}
                                                  key={`${subKey}-mobile-${leaf.label}`}
                                                  onClick={handleClose}
                                                  className="submenu-link"
                                                >
                                                  {leaf.label}
                                                </Nav.Link>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    }
                                    return (
                                      <Nav.Link
                                        as={Link}
                                        to={sub.to}
                                        key={`${groupKey}-mobile-${sub.label}`}
                                        onClick={handleClose}
                                        className="submenu-link"
                                      >
                                        {sub.label}
                                      </Nav.Link>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </Nav.Item>
              );
            })}
          </Nav>
        </Offcanvas.Body>
      </Offcanvas>
    </>
  );
}

function getIcon(label) {
  const iconProps = {
    size: 18,
    strokeWidth: 1.5, // 👈 thinner (IMPORTANT)
    className: "sidebar-icon",
  };

  switch (label) {
    case labelForDashboard:
      return <LayoutDashboard {...iconProps} />;

    // Super-admin-only identity-and-access group — Roles, Login Logs,
    // Role Assign, Admin Management.
    case "User Management":
      return <UserCog {...iconProps} />;

    case "Manage Masters":
      return <Puzzle {...iconProps} />;

    case "Company Profile":
      return <Building2 {...iconProps} />;

    // SUPER_ADMIN-only group housing API surface + client keys + secrets
    // vault. Renamed from "API Access"; label must stay in sync with the
    // sidebar items array above (roles: ["super_admin"]).
    case "Access Control":
      return <KeyRound {...iconProps} />;

    // Admin-side "API Access" — per-API on/off + Test/Live credentials.
    // Uses Plug to visually distinguish from super_admin's KeyRound-marked
    // "Access Control" group (which is about issuing API keys), while
    // still keeping the same connection/access theme.
    case "API Access":
      return <Plug {...iconProps} />;

    case "Approvals":
      return <BadgeCheck {...iconProps} />;

    case "Registration":
      return <ClipboardList {...iconProps} />;

    case "Restaurant":
      return <Utensils {...iconProps} />;

    case "New Booking":
      return <PlusCircle {...iconProps} />;

    case "Promotion":
      return <Tag {...iconProps} />;

    case "AI Insights":
      return <FaRobot {...iconProps} />;

    case "Booking List":
      return <BookOpen {...iconProps} />;

    case "Invoice":
      return <FileText {...iconProps} />;

    case "Inhouse Accounts":
      return <Landmark {...iconProps} />;

    case "Assigned Agents":
      return <Users {...iconProps} />;

    case "Calendar":
      return <CalendarDays {...iconProps} />;

    case "Extranet Contract":
      return <FileSignature {...iconProps} />;

    case "Report":
      return <BarChart3 {...iconProps} />;

    // case "Banners":
    //   return <Tag {...iconProps} />;

    // case "Offer Image":
    //   return <ImagePlus {...iconProps} />;

    // case "Advertisements":
    //   return <FaAd {...iconProps} />;

    case "Marketing":
      return <FaBullhorn {...iconProps} />;

    case "Occupancy":
      return <FaUser {...iconProps} />;

    case "Contract Rate":
      return <FileSignature {...iconProps} />;
    
    case "Promotions":
     return <FaTags {...iconProps} />;

    case "Policy":
      return <FaFileAlt {...iconProps} />;

    case "Availability":
      return <FaBullhorn {...iconProps} />;

    case "Gallery":
      return <FaImages {...iconProps} />;
    
    case "Agent Incentive":
      return <Trophy {...iconProps} />;

    case "My Incentives":
      return <Award {...iconProps} />;

    default:
      return <Dot {...iconProps} />;
  }
}
