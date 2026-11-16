/**
 * Agents must never see which API supplier (ATHARVA, GRN, RateHawk, …) a
 * hotel / rate / activity comes from. These helpers are display-only: the
 * underlying data (hotelName, apiType) is left untouched so supplier routing
 * and booking payloads keep working exactly as before.
 */

// Mirrors the backend hotelmapping Supplier enum. For logins that may see
// supplier names, the unified room search (/api/hotel-rooms/search) appends
// " (<SUPPLIER>)" to hotelName for hotels mapped across several suppliers.
const SUPPLIER_SUFFIX_RE =
  /\s*\((RATEHAWK|IWTX|ATHARVA|JUMEIRAH|DARINA|INHOUSE|X3|GRN|GOGLOBAL)\)\s*$/i;

// Main agents, sub-agents and sub-users are all agent-side logins. A sub-account
// holds AGENT and its own role and can pick either one after login. The backend
// (SupplierVisibility) hides supplier names from all of them.
const AGENT_SIDE_ROLES = ["AGENT", "AGENT_MAIN", "SUB_AGENT", "SUB_USER"];

/**
 * Whether this login may not see supplier names. Prefers the multi-role
 * currentActiveRole, and falls back to userRole for single-role logins.
 */
export function isAgentLogin() {
  try {
    const activeRole = (sessionStorage.getItem("currentActiveRole") || "")
      .trim()
      .toUpperCase();
    if (activeRole) return AGENT_SIDE_ROLES.includes(activeRole);
    const storedRoles = (sessionStorage.getItem("userRole") || "")
      .split(",")
      .map((role) => role.trim().toUpperCase());
    return (
      storedRoles.some((role) => AGENT_SIDE_ROLES.includes(role)) &&
      !storedRoles.some((role) => role.includes("ADMIN"))
    );
  } catch {
    return false;
  }
}

/**
 * Hotel name with the " (<SUPPLIER>)" suffix removed for EVERY login. Used
 * where the name stands for the hotel itself rather than one supplier's
 * block of it (e.g. the room-list header of a hotel mapped across several
 * suppliers, whose rooms are merged into one list).
 */
export function stripSupplierSuffix(name) {
  if (typeof name !== "string") return name;
  return name.replace(SUPPLIER_SUFFIX_RE, "");
}

const SUPPLIER_NAME_RE =
  /\b(atharva|darina|go\s?global|grn\w*|iol-?x|iwtx|i'?way|jumeirah|juniper|rate\s?hawk|x3)\b/gi;

/**
 * Text for the screen. A supplier's own error, or a label or message written for
 * staff, can name the supplier, so for agent-side logins the name reads "Supplier".
 * Not for hotel names: "Jumeirah" is also part of real hotels' names.
 */
export function withoutSupplierName(text) {
  if (typeof text !== "string" || !isAgentLogin()) return text;
  return text.replace(SUPPLIER_NAME_RE, "Supplier");
}

/**
 * For screen text written for staff that names a supplier, where "Supplier" in
 * its place would read badly. Agent-side logins get the second wording.
 */
export function supplierText(staffText, agentText) {
  return isAgentLogin() ? agentText : staffText;
}

/**
 * On a booked outside transfer the transporter is the supplier's own provider
 * name, so agent-side logins don't get one. In-house transporters stay.
 */
export function hidesTransporter(booking) {
  return Boolean(booking?.external) && isAgentLogin();
}

/** Hotel name for display — supplier suffix removed for agent logins. */
export function displayHotelName(name) {
  if (typeof name !== "string" || !isAgentLogin()) return name;
  return stripSupplierSuffix(name);
}

const SUPPLIER_NAMES = {
  ATHARVA: "Atharva",
  DARINA: "Darina",
  GOGLOBAL: "GoGlobal",
  GRN: "GRN",
  INHOUSE: "In-house",
  IWTX: "IWTX",
  JUMEIRAH: "Jumeirah",
  JUNIPER: "Juniper",
  RATEHAWK: "RateHawk",
  X3: "X3",
};

const SUPPLIER_BY_API_ID = {
  1: "INHOUSE",
  3: "ATHARVA",
  10: "JUMEIRAH",
  12: "IWTX",
  14: "RATEHAWK",
  15: "X3",
  16: "DARINA",
  17: "JUNIPER",
  20: "GRN",
  21: "GOGLOBAL",
};

/** True for ADMIN and SUPER_ADMIN logins. Display only: the backend enforces access itself. */
export function isAdminLogin() {
  try {
    const active = (sessionStorage.getItem("currentActiveRole") || "").trim().toLowerCase();
    const first = (sessionStorage.getItem("userRole") || "").split(",")[0].trim().toLowerCase();
    const role = active || first;
    return role === "admin" || role === "super_admin";
  } catch {
    return false;
  }
}

export function supplierDisplayName(code) {
  const key = String(code || "").trim().toUpperCase();
  return SUPPLIER_NAMES[key] || key;
}

/** Supplier code of a room response block, falling back to the numeric supplier id. */
export function supplierCodeForBlock(block, fallbackApiId) {
  const type = String(block?.apiType || "").trim().toUpperCase();
  if (type) return type;
  return SUPPLIER_BY_API_ID[Number(block?.apiId)] || SUPPLIER_BY_API_ID[Number(fallbackApiId)] || "";
}