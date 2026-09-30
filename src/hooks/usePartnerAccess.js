import { useEffect, useState } from "react";
import axiosInstance from "../components/AxiosInstance";

// Single loader for GET /api/partner/me — the logged-in Supplier / DMC's
// profile plus the live approved features. The sidebar, the dashboard and
// the route guard all read from here so they can never disagree about what
// the partner is allowed to see.
//
// Caching: one in-flight/settled promise per session (module scope) plus a
// localStorage mirror so the synchronous route guard has an answer on a
// cold page load before the fetch resolves. `refreshPartnerAccess()` drops
// both, which the dashboard does on every mount so an admin's edit to the
// approved set shows up the next time the partner lands on their dashboard.

const STORAGE_KEY = "partnerAccess";

let inflight = null;
let cached = null;

// The snapshot is only valid for the login that produced it — a logout and
// re-login inside the same SPA session must never reuse another user's set.
const currentUsername = () =>
  localStorage.getItem("UserName") || sessionStorage.getItem("UserName") || "";

const isCurrent = (snap) => !!snap && snap.username === currentUsername();

function readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function writeStorage(value) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(STORAGE_KEY);
  } catch (_) {
    // storage unavailable — the in-memory cache still works
  }
}

/** Last known access snapshot (memory, then localStorage); null when unknown. */
export function getCachedPartnerAccess() {
  if (isCurrent(cached)) return cached;
  cached = null;
  const stored = readStorage();
  if (isCurrent(stored)) cached = stored;
  return cached;
}

/** Forget the cached snapshot (logout, or before a forced reload). */
export function clearPartnerAccess() {
  cached = null;
  inflight = null;
  writeStorage(null);
}

/**
 * Load (or reuse) the partner's access snapshot:
 * { profile, partnerType, approvedCodes, approvedFeatures, status }.
 */
export function loadPartnerAccess({ force = false } = {}) {
  if (!force && getCachedPartnerAccess()) return Promise.resolve(cached);
  if (!force && inflight) return inflight;
  inflight = axiosInstance
    .get("/api/partner/me")
    .then((res) => {
      const me = res?.data || {};
      const approvedFeatures = Array.isArray(me.approvedFeatures) ? me.approvedFeatures : [];
      cached = {
        username: currentUsername(),
        profile: me,
        partnerType: String(me.partnerType || "").toLowerCase(),
        status: me.status,
        approvedFeatures,
        approvedCodes: approvedFeatures.map((f) => f.code),
      };
      writeStorage(cached);
      return cached;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function refreshPartnerAccess() {
  cached = null;
  return loadPartnerAccess({ force: true });
}

/**
 * React hook: { access, loading, error, reload }. Resolves from the cache
 * immediately when one exists, otherwise fetches once.
 */
export default function usePartnerAccess({ refresh = false } = {}) {
  const [access, setAccess] = useState(() => (refresh ? null : getCachedPartnerAccess()));
  const [loading, setLoading] = useState(() => !access);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (refresh ? refreshPartnerAccess() : loadPartnerAccess())
      .then((a) => {
        if (!alive) return;
        setAccess(a);
        setError(null);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [refresh]);

  return {
    access,
    loading,
    error,
    reload: () => refreshPartnerAccess().then(setAccess),
  };
}
