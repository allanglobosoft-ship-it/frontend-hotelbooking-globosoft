// Per-tab authentication/session storage.
//
// WHY sessionStorage instead of localStorage:
// localStorage is shared by every tab of the same origin, so logging into a
// second tab (e.g. as Agent) silently overwrote the authToken/userRole/
// currentActiveRole/userId that a first tab (e.g. Admin) was relying on —
// the next render or API call in the first tab picked up the second tab's
// identity. sessionStorage is scoped to the single tab/window that created
// it (a new tab opened via window.open/ctrl-click/middle-click on a link
// DOES inherit a clone of the opener's sessionStorage per the HTML spec —
// which is exactly the pattern this app already uses for search → booking
// hand-offs in a new tab, e.g. RoomList.jsx / PackageBooking.jsx — but a
// tab opened by typing/pasting a URL with no opener starts empty and must
// log in on its own). Refreshing a tab preserves its own sessionStorage.
//
// This module is the ONLY place that should read/write the identity keys
// below. Centralised here so login/logout/role-switch can't drift out of
// sync the way the previous four separate "clear these keys" blocks did
// (TopBar, Profile, Logout, SessionExpired all hand-maintained their own
// copy of the key list).
//
// NOT handled here (intentionally still in localStorage — these are not
// "who is logged in" state, and are meant to persist/share across tabs):
//   - sidebarCollapsed, rememberedUsername (UI convenience)
//   - makeYourOwnPackageAgentId, partnerAccess, regionalClockProfile
//     (already sessionStorage-first with a self-correcting / harmless
//     localStorage fallback — see usePartnerAccess.js's isCurrent() guard)

// A random, non-secret id for THIS tab only. Used to scope the backend's
// refresh-token cookie per tab (see AxiosInstance.jsx + AuthController.java)
// so that a silent 401 refresh in one tab can never pick up a different
// tab's rotated refresh cookie. sessionStorage-backed so it is stable across
// reloads of this tab but never shared with another tab.
const TAB_SESSION_KEY = "tabSessionId";
export const TAB_SESSION_HEADER = "X-Tab-Session";

export function getTabSessionId() {
  try {
    let id = sessionStorage.getItem(TAB_SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID().replace(/-/g, "")
          : `t${Date.now()}${Math.floor(Math.random() * 1e9)}`;
      sessionStorage.setItem(TAB_SESSION_KEY, id);
    }
    return id;
  } catch (_) {
    // Storage unavailable (private mode / quota) — a fresh id every call
    // just means this tab never gets a stable cookie scope; refresh still
    // falls back to the legacy unscoped cookie on the backend.
    return "";
  }
}

const KEYS = {
  authToken: "authToken",
  userRole: "userRole",
  userName: "UserName",
  currentActiveRole: "currentActiveRole",
  userId: "userId",
  adSessionId: "adSessionId",
};

const read = (key) => {
  try {
    return sessionStorage.getItem(key);
  } catch (_) {
    return null;
  }
};

const write = (key, value) => {
  try {
    if (value === null || value === undefined) {
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, String(value));
    }
  } catch (_) {
    /* storage unavailable — nothing to persist */
  }
};

export const getAuthToken = () => read(KEYS.authToken);
export const setAuthToken = (token) => write(KEYS.authToken, token);
export const getUserRole = () => read(KEYS.userRole) || "";
export const getUserName = () => read(KEYS.userName) || "";
export const getCurrentActiveRole = () => read(KEYS.currentActiveRole) || "";
export const getUserId = () => read(KEYS.userId);
export const getAdSessionId = () => read(KEYS.adSessionId);

export const setUserId = (id) => write(KEYS.userId, id);

// Restaurant-extranet sign-in (pages/restaurant-extranet/RestaurantExtranetLogin.jsx)
// keeps its own token under separate keys so it never replaces the admin /
// agent authToken. Like authToken it lives in THIS tab's sessionStorage —
// never localStorage, which every script and every tab of the origin can
// read and which outlives the browser session.
export const RESTAURANT_EXTRANET_KEYS = {
  token: "restaurantExtranetToken",
  restaurantId: "restaurantExtranetRestaurantId",
  restaurantName: "restaurantExtranetRestaurantName",
  email: "restaurantExtranetEmail",
};

export const getRestaurantExtranetToken = () => read(RESTAURANT_EXTRANET_KEYS.token);
export const getRestaurantExtranetEmail = () => read(RESTAURANT_EXTRANET_KEYS.email);

export function setRestaurantExtranetSession({ token, restaurantId, restaurantName, email }) {
  write(RESTAURANT_EXTRANET_KEYS.token, token);
  if (restaurantId !== null && restaurantId !== undefined) {
    write(RESTAURANT_EXTRANET_KEYS.restaurantId, String(restaurantId));
  }
  if (restaurantName) write(RESTAURANT_EXTRANET_KEYS.restaurantName, restaurantName);
  if (email) write(RESTAURANT_EXTRANET_KEYS.email, email);
}

/**
 * Removes restaurant-extranet values that older builds left in localStorage.
 * Called once at start-up (index.js); a stale token there is dropped rather
 * than moved, so it can no longer be read by other tabs or scripts.
 */
export function purgeLegacyRestaurantExtranetStorage() {
  try {
    Object.values(RESTAURANT_EXTRANET_KEYS).forEach((k) => localStorage.removeItem(k));
  } catch (_) {
    /* storage unavailable — nothing to purge */
  }
}
export const setCurrentActiveRole = (role) => write(KEYS.currentActiveRole, role);

/**
 * Persist a freshly-issued login (or post-OTP/TOTP verification) for THIS
 * tab only, and mint a new per-login adSessionId (ad-view dedupe — a new
 * login should be able to see ads again). Mirrors what Login.jsx's
 * completeLogin used to do directly against localStorage.
 */
export function setAuthSession({ token, roles, username }) {
  write(KEYS.authToken, token);
  write(KEYS.userRole, Array.isArray(roles) ? roles.join(",") : roles);
  write(KEYS.userName, username);

  const newAdSessionId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `s-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  write(KEYS.adSessionId, newAdSessionId);
}

/**
 * Clears this tab's authentication state only. Does not touch any other
 * tab's sessionStorage (there is no cross-tab API for that, which is the
 * point — logging out of one tab must never invalidate another tab's
 * independent client-side session).
 */
export function clearAuthSession() {
  write(KEYS.authToken, null);
  write(KEYS.userRole, null);
  write(KEYS.userName, null);
  write(KEYS.currentActiveRole, null);
  write(KEYS.userId, null);
  write(KEYS.adSessionId, null);
  // Supplier / DMC approved-feature snapshot (hooks/usePartnerAccess.js) and
  // the RegionalClock country cache are keyed/guarded by username already,
  // but drop them too so a subsequent login in this tab never has a stale
  // value to fall back on even for an instant.
  try {
    localStorage.removeItem("partnerAccess");
    localStorage.removeItem("regionalClockProfile");
    localStorage.removeItem("makeYourOwnPackageAgentId");
  } catch (_) {
    /* ignore */
  }
  try {
    sessionStorage.removeItem("makeYourOwnPackageAgentId");
  } catch (_) {
    /* ignore */
  }
}
