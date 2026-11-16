import { useCallback, useEffect, useRef, useState } from "react";
import axiosInstance from "../../../components/AxiosInstance";

/** Base path of the Automated City Mapping API (AutoCityMappingController). */
export const ACM_API = "/api/city-mapping/auto";

export const PROVIDER_LABEL = {
  atharva: "Atharva",
  grn: "GRN",
  goglobal: "GoGlobal",
  iwtx: "IWTX",
  x3: "X3",
  darina: "Darina",
  ratehawk: "RateHawk",
  jumeirah: "Jumeirah",
  juniper: "Juniper",
};

export const providerLabel = (p) => PROVIDER_LABEL[(p || "").toLowerCase()] || (p ? p.toUpperCase() : "—");

/** Engine status -> label + tone (tone drives the dot colour in AutomatedCityMapping.css). */
export const ENGINE_STATUS = {
  RUNNING: { label: "Running", tone: "run" },
  COMPLETED: { label: "Up to date", tone: "ok" },
  IDLE: { label: "Idle", tone: "idle" },
  PAUSED: { label: "Paused", tone: "warn" },
  PAUSED_HIGH_SYSTEM_LOAD: { label: "Paused · high load", tone: "warn" },
  ERROR: { label: "Error", tone: "bad" },
  DISABLED: { label: "Switched off", tone: "idle" },
};

export const engineMeta = (s) => ENGINE_STATUS[s] || { label: s || "Unknown", tone: "idle" };

export const RESULT_STATUS = {
  AUTO_MAPPED: { label: "Mapped automatically", tone: "ok" },
  APPROVED: { label: "Approved", tone: "ok" },
  PENDING_REVIEW: { label: "Needs verification", tone: "warn" },
  CONFLICT: { label: "Conflict", tone: "bad" },
  DUPLICATE: { label: "Duplicate", tone: "bad" },
  REJECTED: { label: "Rejected", tone: "idle" },
  REMOVED: { label: "Removed by a user", tone: "idle" },
  FAILED: { label: "Failed", tone: "bad" },
};

export const resultMeta = (s) => RESULT_STATUS[s] || { label: s || "—", tone: "idle" };

/** Review reasons, for the filter (the row itself shows the server's reasonText). */
export const REASONS = [
  ["AMBIGUOUS_SUPPLIER", "Several supplier cities share the name"],
  ["AMBIGUOUS_INHOUSE", "Several inhouse cities share the name"],
  ["SIMILAR_NAME", "Only a similar name"],
  ["SUFFIX_UNCONFIRMED", "State suffix, not confirmed"],
  ["REGION_UNCONFIRMED", "Name used in several states"],
  ["CODE_CONFLICT", "State suffix, codes disagree"],
  ["GEO_CONFLICT", "Hotel positions disagree"],
  ["ID_NAME_MISMATCH", "Stored supplier id, other name"],
  ["DUPLICATE_CLAIM", "Two cities claim one supplier city"],
  ["SUPPLIER_CITY_USED", "Supplier city used by another city"],
  ["EXISTING_DIFFERENT", "City already mapped elsewhere"],
  ["REJECTED_BY_ADMIN", "Rejected by an administrator"],
  ["UNMAPPED_BY_USER", "Removed by a user"],
];

export const AUDIT_EVENTS = [
  "AUTO_MAPPED",
  "APPROVED",
  "REJECTED",
  "REJECTED_AND_UNMAPPED",
  "REOPENED",
  "ALTERNATIVE_NAME_ADDED",
  "RUN_STARTED",
  "RUN_COMPLETED",
  "COUNTRY_FAILED",
  "COUNTRY_REQUEUED",
  "RETRY_FAILED",
  "RESCAN_REQUESTED",
  "PAUSED",
  "RESUMED",
  "APPROVE_ALL_STARTED",
  "APPROVE_ALL_FINISHED",
  "MAP_VERIFIED_STARTED",
  "MAP_VERIFIED_FINISHED",
  "REJECT_DIFFERENT_STARTED",
  "REJECT_DIFFERENT_FINISHED",
];

/** Text for SweetAlert html strings (city names come from supplier data). */
export const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const fmtNumber = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString());

export const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
};

export const fmtDuration = (seconds) => {
  if (seconds === null || seconds === undefined) return "—";
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
};

export const errorText = (err, fallback) =>
  err?.response?.data?.error || err?.response?.data?.message || (err?.code === "ECONNABORTED" ? "The request timed out." : fallback);

export function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

/**
 * Polls GET /status. 5 s while the engine is running, 15 s otherwise; a request in
 * flight is never overlapped, and polling stops on a 403 (not an administrator).
 */
export function useCityAutoMappingStatus(enabled = true) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [forbidden, setForbidden] = useState(false);
  const inFlight = useRef(false);
  const again = useRef(false);
  const self = useRef(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (inFlight.current) {
      // a poll that started before an action is running: load once more when it is done
      again.current = true;
      return;
    }
    inFlight.current = true;
    try {
      const res = await axiosInstance.get(`${ACM_API}/status`, { timeout: 20000 });
      if (!mounted.current) return;
      setStatus(res.data || null);
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      if (err?.response?.status === 403) setForbidden(true);
      setError(errorText(err, "The automated city mapping status could not be loaded."));
    } finally {
      inFlight.current = false;
      if (again.current && mounted.current) {
        again.current = false;
        setTimeout(() => self.current && self.current(), 0);
      }
    }
  }, []);
  self.current = refresh;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const running = status?.engine?.status === "RUNNING";
  useEffect(() => {
    if (!enabled || forbidden) return undefined;
    refresh();
    const id = setInterval(refresh, running ? 5000 : 15000);
    return () => clearInterval(id);
  }, [enabled, forbidden, refresh, running]);

  return { status, error, forbidden, refresh };
}

/**
 * Loads one page of a listing whenever its query changes; `reloadKey` forces a
 * reload (after an action). Returns { page, loading, error, reload }.
 */
export function usePagedList(path, params, active, reloadKey) {
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const key = JSON.stringify(params);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const clean = {};
      Object.entries(JSON.parse(key)).forEach(([k, v]) => {
        if (v !== "" && v !== null && v !== undefined) clean[k] = v;
      });
      const res = await axiosInstance.get(`${ACM_API}${path}`, { params: clean, timeout: 60000 });
      if (mine !== seq.current) return;
      setPage(res.data);
      setError(null);
    } catch (err) {
      if (mine !== seq.current) return;
      setError(errorText(err, "The list could not be loaded."));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [path, key]);

  useEffect(() => {
    if (active) load();
  }, [active, load, reloadKey]);

  return { page, loading, error, reload: load };
}
