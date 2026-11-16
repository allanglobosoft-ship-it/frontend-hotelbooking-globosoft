// Browser position for the Super Admin → Activity Logs page.
//
// The backend records WHERE each business action (login, search, booking,
// cancellation, payment, admin change) was done. AxiosInstance.jsx adds the
// latest fix from here to every request as the X-Client-Location header
// ("lat,lng,accuracyMeters"); UserActivityRecorder.java turns it into an
// address. When the user blocks the browser's location prompt, or there is no
// fresh fix, no header is sent and the backend falls back to the city of the
// IP address.
//
// The browser asks the user once per site (the answer is remembered by the
// browser). Geolocation only works on HTTPS (or localhost); on plain HTTP this
// module does nothing.

export const CLIENT_LOCATION_HEADER = "X-Client-Location";

const STORAGE_KEY = "clientGeoFix";
// A fix older than this is not sent — the user may have moved since.
const MAX_FIX_AGE_MS = 10 * 60 * 1000;
// Re-read the position this often while the tab is open.
const REFRESH_INTERVAL_MS = 3 * 60 * 1000;
const POSITION_OPTIONS = { enableHighAccuracy: true, maximumAge: 60 * 1000, timeout: 30 * 1000 };

let latestFix = null;
let started = false;
let denied = false;
let timer = null;

function readStoredFix() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const fix = raw ? JSON.parse(raw) : null;
    return fix && Number.isFinite(fix.lat) && Number.isFinite(fix.lng) && Number.isFinite(fix.at) ? fix : null;
  } catch {
    return null;
  }
}

function storeFix(fix) {
  try {
    if (fix) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fix));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage blocked — the in-memory fix still works for this page load
  }
}

function onPosition(pos) {
  const { latitude, longitude, accuracy } = pos.coords || {};
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  latestFix = { lat: latitude, lng: longitude, acc: Number.isFinite(accuracy) ? accuracy : null, at: Date.now() };
  storeFix(latestFix);
}

function onPositionError(err) {
  // 1 = PERMISSION_DENIED: stop asking; the backend uses the IP location.
  // 2 / 3 (unavailable / timeout): keep the last fix and try again later.
  if (err && err.code === 1) {
    denied = true;
    latestFix = null;
    storeFix(null);
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }
}

function refresh() {
  if (denied || document.visibilityState === "hidden") return;
  try {
    navigator.geolocation.getCurrentPosition(onPosition, onPositionError, POSITION_OPTIONS);
  } catch {
    // geolocation unavailable in this browser
  }
}

/** Starts reading the browser position (once per page load). Safe to call anywhere. */
export function startGeoTracking() {
  if (started) return;
  started = true;
  if (typeof window === "undefined" || !window.isSecureContext || !navigator.geolocation) return;

  latestFix = readStoredFix();
  refresh();
  timer = setInterval(refresh, REFRESH_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && (!latestFix || Date.now() - latestFix.at > REFRESH_INTERVAL_MS)) {
      refresh();
    }
  });
}

/** "lat,lng,accuracy" for the X-Client-Location header, or null when there is no fresh fix. */
export function getClientLocationHeader() {
  const fix = latestFix;
  if (!fix || Date.now() - fix.at > MAX_FIX_AGE_MS) return null;
  const acc = fix.acc == null ? "" : `,${Math.round(fix.acc)}`;
  return `${fix.lat.toFixed(6)},${fix.lng.toFixed(6)}${acc}`;
}
