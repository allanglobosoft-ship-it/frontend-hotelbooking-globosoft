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


let labelForDashboard = " ";

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
   * Combined count of PENDING hotel + agent self-registration requests.
   * Shown as a red pill next to the Approvals menu label so admins see
   * there's queue work without opening the menu. Only admins fetch it.
   */
  const [approvalsPendingCount, setApprovalsPendingCount] = useState(0);

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

  const storedRoles = (localStorage.getItem("userRole") || "")
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
  };
  const pathRole = dashboardRoleByPath[pathname];

  const currentRole =
    pathRole ||
    localStorage.getItem("currentActiveRole")?.toLowerCase() ||
    storedRoles[0] ||
    "";

  // Sub-account (sub-agent / sub-user) logins use a "prefix.mainAgent"
  // username, which always contains a dot; main-agent login usernames are
  // validated to letters/digits/underscore only (no dot). Sub-accounts must
  // not see the agent "Registration" menu — they can't create their own
  // sub-users / sub-agents. Only affects agent-role logins; every other role
  // is unchanged.
  const loginUserName =
    localStorage.getItem("UserName") || sessionStorage.getItem("UserName") || "";
  const isSubAccountAgent =
    currentRole === "agent" && loginUserName.includes(".");

  // Re-sync the stored active role with the dashboard context so the
  // role-guarded routes (PrivateRoute roles=[...]) agree with the menu.
  useEffect(() => {
    if (
      pathRole &&
      localStorage.getItem("currentActiveRole")?.toLowerCase() !== pathRole
    ) {
      localStorage.setItem("currentActiveRole", pathRole);
    }
  }, [pathRole]);

  useEffect(() => {
    const fetchHotelId = async () => {
      try {
        const userName = localStorage.getItem("UserName") || sessionStorage.getItem("UserName");
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
      setApprovalsPendingCount(0);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [hotelRes, agentRes] = await Promise.all([
          axiosInstance
            .get("/api/hotel-external-register/pending-count")
            .catch(() => null),
          axiosInstance
            .get("/api/agent-external-register/pending-count")
            .catch(() => null),
        ]);
        if (cancelled) return;
        const h = Number(hotelRes?.data?.count) || 0;
        const a = Number(agentRes?.data?.count) || 0;
        setApprovalsPendingCount(h + a);
      } catch (_) {
        if (!cancelled) setApprovalsPendingCount(0);
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
  useEffect(() => {
    if (!currentRole) {
      setHiddenCodes(new Set());
      return undefined;
    }
    let cancelled = false;
    (async () => {
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
    })();
    return () => {
      cancelled = true;
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

  const items = [
    {
      code: "top_dashboard",
      label: labelForDashboard,
      to: dashboardPath,
      roles: ["admin", "agent", "staff", "extranet", "super_admin"],
    },
    {
      // super_admin-only sidebar group that surfaces the identity-and-access
      // tools together: Roles (master), Login Logs (audit trail), Role
      // Assign (attach roles to users). Kept above Manage Masters so it's
      // the first stop after the dashboard.
      code: "top_user_management",
      label: "User Management",
      roles: ["super_admin"],
      children: [
        { label: "Roles",       to: "/masters/user-roles" },
        { label: "Login Logs",  to: "/user-management/login-logs" },
        { label: "Role Assign", to: "/user-management/role-assign" },
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
      ],
    },
    {
      code: "top_registration",
      label: "Registration",
      roles: ["admin"],
      // "Agent Management" is an inline nested accordion (has its own
      // children[]) — the render code detects this and renders it as an
      // in-line accordion at this exact position, so it sits right after
      // "Hotel" as required. Sub Agent / Sub User reuse the same
      // /agent-registration routes that agents themselves use.
      children: [
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
        { code: "reg_scheffer",      label: "Chauffer Driver and Limousine",  to: "/registration/schefferDriver" },
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
          roles: ["admin"],
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
         label: "Senior Citizen",
         to: "/new-booking/senior-citizen",
        },
        // Religious flow — same HotelSearch, destination locked to Mecca/Medina.
        {
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
          label: "Offline",
          to: "/booking-details/offline-booking-list",
          roles: ["admin"],
        },
        {
          label: "Restaurants",
          to: "/booking-details/restaurant-booking-list",
        },
        {
          label: "Honeymoon Packages",
          to: "/booking-details/honeymoon-booking-list",
        },
        // Meet & Space booking list — view + cancel from this page
        {
          label: "Meet & Space",
          to: "/booking-details/meet-and-space-booking-list",
        },
        {
          label: "Govt / Airlines",
          to: "/booking-details/gov-employee-booking-list",
        },
        {
          label: "Ayurveda",
          to: "/booking-details/ayurveda-booking-list",
        },
        {
          label: "Student",
          to: "/booking-details/student-booking-list",
        },
        {
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
      children: [
        {
          label: "Booking",
          to: "/report/booking",
        },
        {
          label: "Cancellation",
          to: "/report/cancellation",
        },
        // {
        //   label: "Inventory",
        //   to: "/report/inventory",
        // },
        {
          label: "Hotel Wise",
          to: "/report/hotel-wise",
        },
        {
          label: "Accounts",
          to: "/report/accounts",
        },
        {
          label: "Day Wise",
          to: "/report/day-wise",
        },
        {
          label: "Monthly Wise",
          to: "/report/monthly-wise",
        },
        {
          label: "Comparison",
          to: "/report/comparison",
        },
        {
          label: "Agent Wise",
          to: "/report/agent-wise",
        },
        {
          label: "Contract Expiry",
          to: "/report/contract-expiry",
        },
        {
          label: "Contract Rate",
          to: "/report/contract-rate",
        },
        {
          label: "User Report",
          to: "/report/user-report",
        },
        {
          label: "Stop Sale",
          to: "/report/stop-sale",
        },
        {
          label: "User Logins",
          to: "/report/user-logins",
        },
        {
          label: "Offline Daily Sales",
          to: "/report/offline-daily-sales",
        },
        {
          label: "Online Daily Sales",
          to: "/report/online-daily-sales",
        },
        {
          label: "Time Limit Daily Sales",
          to: "/report/time-limit-daily-sales",
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

  // Filter menu based on allowed roles
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
  const roleAllows = (entry) => {
    // Super_admin's per-role visibility overlay — an entry whose stable
    // {@code code} appears in the hidden-set is dropped no matter what
    // the hardcoded roles/excludeRoles say. Only entries with a code are
    // eligible for hiding; sub-menu leaves without a code stay visible
    // as before (they're gated only by their parent's visibility today).
    if (entry.code && hiddenCodes.has(entry.code)) return false;
    if (!entry.roles) return true;
    if (Array.isArray(entry.excludeRoles) && entry.excludeRoles.includes(currentRole)) return false;
    if (entry.roles.includes(currentRole)) return true;
    if (currentRole === "super_admin" && entry.roles.includes("admin")) return true;
    return false;
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
    return next;
  });

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
      {/* Sidebar for large screens */}
      {!collapsed && (
      <aside
        className="sidebar d-none d-lg-block"
        ref={sidebarRef}
        style={{
          position: "sticky",
          top: "60px", // 👈 height of top bar
          height: "calc(100vh - 60px)", // 👈 reserve space
          background: "var(--color-bg, #fff)",
          borderRight: "1px solid var(--color-border, #e5e7eb)",
          zIndex: 100,
          // zIndex: 100,
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
        <Nav className="flex-column" style={{ paddingTop: 6 }}>
          {filteredItems.map((item) => {
            const hasChildren =
              Array.isArray(item.children) && item.children.length > 0;
            const hasGroups =
              Array.isArray(item.groups) && item.groups.length > 0;

            return (
              <Nav.Item
                key={item.label}
                className={`nav-item-custom ${hasChildren || hasGroups ? "nav-item-has-children" : ""} ${(item.label === "Inhouse Accounts" || item.label === "Agent Incentive" || item.label === "Marketing") ? "submenu-up" : ""} ${item.label === "Booking List" || item.label === "New Booking" || item.label === "Report" || (item.label === "Registration" && (item.children?.length ?? 0) > 4) ? "submenu-center" : ""}`}
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
                      item.children.map((child) => {
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
      </aside>
      )}

      {/* Offcanvas for small screens */}
      <Offcanvas show={show} onHide={handleClose}>
        <Offcanvas.Header closeButton>
          <Offcanvas.Title>Globosoft</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body ref={offcanvasRef}>
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
