// Supplier / DMC ("partner") feature catalog — the frontend half of the
// backend's PartnerFeatureCatalog.java. Both are keyed by the same codes,
// which are the New Booking menu codes (nb_hotel, nb_package, …).
//
// One entry per feature says what an approved feature unlocks on this side:
//   • newBooking   – the New Booking flow entry (sidebar + dashboard tile)
//   • registration – the registration / inventory page(s) behind it
//   • bookingList  – its Booking List page
//   • routes       – URL patterns the partner route guard lets through when
//                    the feature is approved ("*" = one path segment; a
//                    pattern also matches anything nested below it)
//
// Hotel-family features (24 Hour, Last Minute, …) have no registration page
// of their own: their setup lives as a tile on the per-hotel Hotel Actions
// hub, so `hotelHub: true` additionally unlocks the hotel list + hub routes.
//
// Three consumers read this file and must never disagree:
//   components/PartnerSidebar.jsx, pages/PartnerDashboard.jsx and the partner
//   branch of components/PrivateRoute.jsx. Labels here are fallbacks — the
//   label stored in partner_feature (returned by /api/partner/me and
//   /api/partner-features) wins when present.
//
// To add a feature: add its entry here + the matching FeatureDef on the
// backend. Nothing else needs to change.

export const PARTNER_ROLES = ["supplier", "dmc"];

export const PARTNER_DASHBOARD_BY_ROLE = {
  supplier: "/supplierDashboard",
  dmc: "/dmcDashboard",
};

export const PARTNER_TYPE_LABEL = {
  supplier: "Supplier",
  dmc: "DMC",
};

/** Hotel list + Hotel Actions hub, shared by every hotel-family feature. */
const HOTEL_HUB_ROUTES = [
  "/registration/hotel",
  "/hotel-details/*",
];

export const PARTNER_FEATURES = [
  {
    code: "nb_hotel",
    label: "Hotel",
    icon: "hotel",
    tone: "pink",
    hotelHub: true,
    newBooking: { label: "Hotel", to: "/new-booking/hotel" },
    registration: [{ label: "Hotel", to: "/registration/hotel" }],
    bookingList: { label: "Hotel", to: "/booking-details/hotel-booking-list" },
    routes: [
      "/new-booking/hotel",
      "/room-list",
      "/hotel-booking-page",
      "/booking-details/hotel-booking-list",
      "/booking-details/hotel-booking/*",
      "/registration/hotel/create",
      "/registration/hotel/*/compulsory-events",
      "/hotel-actions/*/contract-rate",
      "/hotel-actions/hotel/*/contract-rate",
      "/hotel-actions/*/promotions",
      "/hotel-actions/*/promotion",
      "/hotel-actions/*/hotel-policy",
      "/hotel-actions/*/hotel-availability",
      "/hotel-actions/*/occupancy-and-minimumlength",
      "/hotel-actions/*/validity-period-details",
      "/hotel-actions/*/individual-hotel-search",
    ],
  },
  {
    code: "nb_24hr",
    label: "24 Hour",
    icon: "clock",
    tone: "pink",
    hotelHub: true,
    newBooking: { label: "24 Hour", to: "/new-booking/hotel-24hr" },
    registration: [{ label: "24 Hour Check-In (per hotel)", to: "/registration/hotel" }],
    bookingList: { label: "24 Hour", to: "/booking-details/24hr-booking-list" },
    routes: [
      "/new-booking/hotel-24hr",
      "/room-list-24hr",
      "/hotel-booking-page-24hr",
      "/booking-details/24hr-booking-list",
      "/hotel-actions/*/24-hour-checkin",
      "/hotel-actions/hotel/*/24-hour-checkin",
    ],
  },
  {
    code: "nb_last_minute",
    label: "Last Minute",
    icon: "fire",
    tone: "orange",
    hotelHub: true,
    newBooking: { label: "Last Minute", to: "/new-booking/last-minute-booking" },
    registration: [{ label: "Last Minute Contract (per hotel)", to: "/registration/hotel" }],
    bookingList: { label: "Last Minute", to: "/booking-details/last-minute-booking-list" },
    routes: [
      "/new-booking/last-minute-booking",
      "/last-minute-room-list",
      "/booking-details/last-minute-booking-list",
      "/booking-details/last-minute-booking/*",
      "/hotel-actions/*/last-minute-contract-rate",
      "/hotel-actions/hotel/*/last-minute-contract-rate",
    ],
  },
  {
    code: "nb_long_stay",
    label: "Long Stay",
    icon: "briefcase",
    tone: "purple",
    hotelHub: true,
    newBooking: { label: "Long Stay", to: "/new-booking/long-stay" },
    registration: [{ label: "Long Stay Contract (per hotel)", to: "/registration/hotel" }],
    bookingList: { label: "Long Stay", to: "/booking-details/long-stay-booking-list" },
    routes: [
      "/new-booking/long-stay",
      "/long-stay-room-list",
      "/long-stay-booking-page",
      "/booking-details/long-stay-booking-list",
      "/booking-details/long-stay-booking/*",
      "/hotel-actions/*/long-stay-contract",
      "/hotel-actions/hotel/*/long-stay-contract",
    ],
  },
  {
    code: "nb_day_stay",
    label: "Day Stay",
    icon: "sun",
    tone: "blue",
    hotelHub: true,
    newBooking: { label: "Day Stay", to: "/new-booking/day-stay" },
    registration: [{ label: "Day Stay Contract (per hotel)", to: "/registration/hotel" }],
    bookingList: { label: "Day Stay", to: "/booking-details/day-stay-booking-list" },
    routes: [
      "/new-booking/day-stay",
      "/day-stay-room-list",
      "/day-stay-booking-page",
      "/booking-details/day-stay-booking-list",
      "/booking-details/day-stay-booking/*",
      "/hotel-actions/*/day-stay-contract",
      "/hotel-actions/hotel/*/day-stay-contract",
    ],
  },
  {
    code: "nb_byop",
    label: "Build Your Own Package",
    icon: "box",
    tone: "green",
    newBooking: { label: "Build Your Own Package", to: "/new-booking/make-your-own-package-v2" },
    registration: [{ label: "Package Add-Ons", to: "/registration/package-addons" }],
    bookingList: { label: "Build Your Own Package", to: "/booking-details/make-your-own-package-v2-list" },
    routes: [
      "/new-booking/make-your-own-package",
      "/new-booking/make-your-own-package-v2",
      "/new-booking/make-your-own-package-v3",
      "/make-your-own-package",
      "/make-your-pkg-room-list",
      "/booking-details/make-your-own-package-v2-list",
      "/booking-details/make-your-own-package-v2/*",
      "/registration/package-addons",
      "/package-addons-rates",
    ],
  },
  {
    code: "nb_package",
    label: "Package",
    icon: "gift",
    tone: "orange",
    newBooking: { label: "Package", to: "/new-booking/package-search" },
    registration: [{ label: "Package", to: "/registration/package" }],
    bookingList: { label: "Package Booking", to: "/booking-details/package-booking-list" },
    routes: [
      "/new-booking/package-search",
      "/new-booking/package-booking",
      "/new-booking/package-checkout",
      "/booking-details/package-booking-list",
      "/booking-details/package-booking/*",
      "/registration/package",
      "/package-rates",
    ],
  },
  {
    code: "nb_transfers",
    label: "Transfers",
    icon: "car",
    tone: "teal",
    newBooking: { label: "Transfers", to: "/new-booking/cab" },
    registration: [{ label: "Transfers", to: "/registration/cabProvider" }],
    bookingList: { label: "Transfers", to: "/booking-details/cab-booking-list" },
    routes: [
      "/new-booking/cab",
      "/cab-booking-page",
      "/booking-details/cab-booking-list",
      "/booking-details/cab-booking/*",
      "/registration/cabProvider",
      "/cab-rates",
    ],
  },
  {
    code: "nb_chauffeur",
    label: "Chauffeur Driver and Limousine",
    icon: "taxi",
    tone: "purple",
    newBooking: { label: "Chauffeur Driver and Limousine", to: "/new-booking/scheffer-driver" },
    registration: [{ label: "Chauffeur Driver and Limousine", to: "/registration/schefferDriver" }],
    bookingList: { label: "Chauffeur Driver and Limousine", to: "/booking-details/scheffer-driver-booking-list" },
    routes: [
      "/new-booking/scheffer-driver",
      "/scheffer-driver-booking-page",
      "/booking-details/scheffer-driver-booking-list",
      "/booking-details/scheffer-driver-booking/*",
      "/registration/schefferDriver",
      "/scheffer-driver-rates",
    ],
  },
  {
    code: "nb_activity",
    label: "Tours and Activity",
    icon: "globe",
    tone: "green",
    newBooking: { label: "Tours and Activity", to: "/new-booking/tours-and-activities" },
    registration: [{ label: "Tours and Activity", to: "/registration/activityProvider" }],
    bookingList: { label: "Tours and Activity", to: "/booking-details/activity-booking-list" },
    routes: [
      "/new-booking/tours-and-activities",
      "/booking-details/activity-booking-list",
      "/booking-details/activity-booking/*",
      "/registration/activityProvider",
      "/registration/activity-rate",
      "/activity-rates",
    ],
  },
  {
    code: "nb_offline",
    label: "Offline",
    icon: "offline",
    tone: "blue",
    newBooking: { label: "Offline", to: "/new-booking/offline-search" },
    registration: [{ label: "Supplier (Offline)", to: "/registration/supplier" }],
    bookingList: { label: "Offline", to: "/booking-details/offline-booking-list" },
    routes: [
      "/new-booking/offline-search",
      "/booking-details/offline-booking-list",
      "/booking-details/offline-booking/*",
      "/registration/supplier",
    ],
  },
  {
    code: "nb_restaurant",
    label: "Restaurant",
    icon: "utensils",
    tone: "orange",
    newBooking: { label: "Restaurant", to: "/new-booking/restaurant" },
    registration: [{ label: "Restaurants", to: "/restaurant/list" }],
    bookingList: { label: "Restaurants", to: "/booking-details/restaurant-booking-list" },
    routes: [
      "/new-booking/restaurant",
      "/booking-details/restaurant-booking-list",
      "/booking-details/restaurant-booking/*",
      "/restaurant/list",
      "/restaurant/register",
      "/restaurant/edit",
      "/restaurant/view",
    ],
  },
  {
    code: "nb_honeymoon",
    label: "Honeymoon Package",
    icon: "heart",
    tone: "pink",
    newBooking: { label: "Honeymoon Package", to: "/new-booking/honeymoon" },
    registration: [{ label: "Honeymoon Packages", to: "/honeymoon/list" }],
    bookingList: { label: "Honeymoon Packages", to: "/booking-details/honeymoon-booking-list" },
    routes: [
      "/new-booking/honeymoon",
      "/booking-details/honeymoon-booking-list",
      "/honeymoon",
    ],
  },
  {
    code: "nb_meet_space",
    label: "Meet & Space",
    icon: "users",
    tone: "purple",
    hotelHub: true,
    newBooking: { label: "Meet & Space", to: "/new-booking/meet-and-space" },
    registration: [{ label: "Meeting Space (per hotel)", to: "/registration/hotel" }],
    bookingList: { label: "Meet & Space", to: "/booking-details/meet-and-space-booking-list" },
    routes: [
      "/new-booking/meet-and-space",
      "/booking-details/meet-and-space-booking-list",
      "/booking-details/meet-and-space-booking/*",
      "/hotel-actions/*/meeting-space",
    ],
  },
  {
    code: "nb_gov",
    label: "Govt / Airlines",
    icon: "plane",
    tone: "blue",
    hotelHub: true,
    newBooking: { label: "Govt / Airlines", to: "/new-booking/gov-employee" },
    registration: [{ label: "Govt / Airlines Promotion (per hotel)", to: "/registration/hotel" }],
    bookingList: { label: "Govt / Airlines", to: "/booking-details/gov-employee-booking-list" },
    routes: [
      "/new-booking/gov-employee",
      "/gov-employee-room-list",
      "/gov-employee-booking-page",
      "/booking-details/gov-employee-booking-list",
      "/booking-details/gov-employee-booking/*",
      "/hotel-actions/*/gov-employee-promotion",
    ],
  },
  {
    code: "nb_ayurveda",
    label: "Ayurveda",
    icon: "leaf",
    tone: "green",
    newBooking: { label: "Ayurveda", to: "/new-booking/ayurveda" },
    registration: [{ label: "Ayurveda", to: "/registration/ayurveda" }],
    bookingList: { label: "Ayurveda", to: "/booking-details/ayurveda-booking-list" },
    routes: [
      "/new-booking/ayurveda",
      "/booking-details/ayurveda-booking-list",
      "/registration/ayurveda",
    ],
  },
  {
    code: "nb_student",
    label: "Student",
    icon: "graduation",
    tone: "purple",
    hotelHub: true,
    newBooking: { label: "Student", to: "/new-booking/student" },
    registration: [{ label: "Student Discount (per hotel)", to: "/registration/hotel" }],
    bookingList: { label: "Student", to: "/booking-details/student-booking-list" },
    routes: [
      "/new-booking/student",
      "/student-room-list",
      "/student-booking-page",
      "/booking-details/student-booking-list",
      "/booking-details/student-booking/*",
      "/hotel-actions/*/student-discount",
    ],
  },
  {
    code: "nb_senior_citizen",
    label: "Senior Citizen",
    icon: "user",
    tone: "orange",
    hotelHub: true,
    newBooking: { label: "Senior Citizen", to: "/new-booking/senior-citizen" },
    registration: [{ label: "Senior Citizen Promotion (per hotel)", to: "/registration/hotel" }],
    bookingList: { label: "Senior Citizen", to: "/booking-details/senior-citizen-booking-list" },
    routes: [
      "/new-booking/senior-citizen",
      "/senior-citizen-room-list",
      "/senior-citizen-booking-page",
      "/booking-details/senior-citizen-booking-list",
      "/booking-details/senior-citizen-booking/*",
      "/hotel-actions/*/senior-citizen",
    ],
  },
  {
    code: "nb_religious",
    label: "Religious",
    icon: "praying",
    tone: "orange",
    hotelHub: true,
    newBooking: { label: "Religious", to: "/new-booking/religious" },
    // No inventory of its own — Makkah / Madinah hotels are contracted
    // through the normal hotel registration.
    registration: [{ label: "Hotel (Makkah / Madinah)", to: "/registration/hotel" }],
    bookingList: { label: "Religious", to: "/booking-details/religious-booking-list" },
    routes: [
      "/new-booking/religious",
      "/religious-room-list",
      "/religious-booking-page",
      "/booking-details/religious-booking-list",
    ],
  },
];

/** Routes every partner may open regardless of features. */
export const PARTNER_COMMON_ROUTES = [
  "/supplierDashboard",
  "/dmcDashboard",
  "/view-profile",
  "/change-password",
  "/log-out",
  "/select-userRole",
  "/landingPage",
];

const FEATURE_BY_CODE = Object.fromEntries(PARTNER_FEATURES.map((f) => [f.code, f]));

/**
 * Per-role overrides for registration link targets. A DMC registers its own
 * hotels, so its "Hotel" registration entry opens the create form directly
 * instead of the hotel list (which, for a DMC, only ever shows its own
 * hotels anyway). Suppliers keep the list. Keyed by the catalog's `to`.
 */
const REGISTRATION_TARGET_BY_ROLE = {
  dmc: {
    "/registration/hotel": "/registration/hotel/create",
  },
};

/** The registration route a given partner role should open for a catalog link. */
export const registrationTargetFor = (role, to) =>
  REGISTRATION_TARGET_BY_ROLE[String(role || "").toLowerCase()]?.[to] || to;

export const isPartnerRole = (role) =>
  PARTNER_ROLES.includes(String(role || "").trim().toLowerCase());

export const partnerDashboardPath = (role) =>
  PARTNER_DASHBOARD_BY_ROLE[String(role || "").trim().toLowerCase()] || "/";

export const getPartnerFeature = (code) => FEATURE_BY_CODE[code] || null;

/**
 * Segment-wise prefix match. "*" matches exactly one non-empty segment; the
 * path may continue below the pattern ("/registration/package" also matches
 * "/registration/package/view/12").
 */
export function matchesRoutePattern(pattern, pathname) {
  const pat = String(pattern).split("/").filter(Boolean);
  const path = String(pathname || "").split("?")[0].split("/").filter(Boolean);
  if (path.length < pat.length) return false;
  for (let i = 0; i < pat.length; i += 1) {
    if (pat[i] === "*") {
      if (!path[i]) return false;
    } else if (pat[i] !== path[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Feature codes that would unlock this path. Empty array = the path belongs
 * to no partner feature (an admin-only area, for instance). The hotel hub
 * routes are reported under every hotel-family feature so that holding any
 * one of them is enough.
 */
export function featuresForPath(pathname) {
  const codes = [];
  for (const f of PARTNER_FEATURES) {
    const own = f.routes.some((r) => matchesRoutePattern(r, pathname));
    const hub = f.hotelHub && HOTEL_HUB_ROUTES.some((r) => matchesRoutePattern(r, pathname));
    if (own || hub) codes.push(f.code);
  }
  return codes;
}

export const isPartnerCommonRoute = (pathname) =>
  PARTNER_COMMON_ROUTES.some((r) => matchesRoutePattern(r, pathname));

/**
 * The route-guard decision: true when the path is a partner-common route or
 * is unlocked by one of the approved feature codes.
 */
export function isPathAllowedForPartner(pathname, approvedCodes) {
  if (isPartnerCommonRoute(pathname)) return true;
  const approved = new Set(approvedCodes || []);
  return featuresForPath(pathname).some((c) => approved.has(c));
}

/**
 * Sidebar / dashboard model: the approved features in catalog order, each
 * carrying the DB label when the API supplied one.
 *
 * @param approvedFeatures array of { code, label } from /api/partner/me
 */
export function resolveApprovedFeatures(approvedFeatures) {
  const byCode = new Map((approvedFeatures || []).map((f) => [f.code, f]));
  return PARTNER_FEATURES.filter((f) => byCode.has(f.code)).map((f) => ({
    ...f,
    label: byCode.get(f.code)?.label || f.label,
  }));
}
