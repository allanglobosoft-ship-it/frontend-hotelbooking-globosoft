import React, { useEffect, useRef, useState } from "react";
import axiosInstance from "./AxiosInstance";

/**
 * RegionalClock
 * ─────────────
 * Live date+time chip pinned to the top of every dashboard. The clock
 * is rendered in the timezone of the country the logged-in user is
 * registered in (Agent / Hotel → server-side `countryCode` on
 * /api/personalProfile/{userName}; Admin / Staff / others → browser
 * timezone fallback). Ticks once per second.
 *
 *   <RegionalClock />                    // default chip
 *   <RegionalClock variant="compact" />  // small inline pill
 *   <RegionalClock countryCode="AE" serverTimeUrl="/api/dashboard/uae-time" />
 *                                        // server-synced (Admin Dashboard)
 *
 * Resolution order:
 *   1. countryCode override passed as prop (rare — overrides everything).
 *   2. Cached profile in localStorage under "regionalClockProfile"
 *      (so subsequent dashboards don't re-fetch the profile).
 *   3. GET /api/personalProfile/{userName} — `countryCode` field.
 *   4. Browser-local timezone (Intl.DateTimeFormat().resolvedOptions()).
 *
 * Server-synced mode (`serverTimeUrl`): the time comes from the backend
 * rather than the device clock, so a wrong PC clock can't skew it. The
 * endpoint returns `epochMillis` + zone metadata; we measure the request
 * round trip and keep the (server − device) offset, then tick locally with
 * that offset applied. Re-synced every 5 min and whenever the tab becomes
 * visible again (background tabs throttle timers; laptops sleep). The
 * profile lookup is skipped in this mode, and `countryCode` only serves as
 * the timezone fallback if the endpoint is unreachable.
 */

// ISO-3166 alpha-2 → IANA timezone. We pick a single representative
// zone per country (the one most travel-booking ops use). Multi-zone
// countries (US, RU, etc.) get a primary; if your business needs
// finer per-state granularity, extend this map or expose timezone
// directly on the profile.
const COUNTRY_TZ = {
  AE: "Asia/Dubai",
  SA: "Asia/Riyadh",
  QA: "Asia/Qatar",
  KW: "Asia/Kuwait",
  BH: "Asia/Bahrain",
  OM: "Asia/Muscat",
  IN: "Asia/Kolkata",
  PK: "Asia/Karachi",
  BD: "Asia/Dhaka",
  LK: "Asia/Colombo",
  NP: "Asia/Kathmandu",
  US: "America/New_York",
  CA: "America/Toronto",
  GB: "Europe/London",
  IE: "Europe/Dublin",
  DE: "Europe/Berlin",
  FR: "Europe/Paris",
  IT: "Europe/Rome",
  ES: "Europe/Madrid",
  PT: "Europe/Lisbon",
  NL: "Europe/Amsterdam",
  BE: "Europe/Brussels",
  CH: "Europe/Zurich",
  AT: "Europe/Vienna",
  RU: "Europe/Moscow",
  TR: "Europe/Istanbul",
  EG: "Africa/Cairo",
  ZA: "Africa/Johannesburg",
  NG: "Africa/Lagos",
  KE: "Africa/Nairobi",
  CN: "Asia/Shanghai",
  HK: "Asia/Hong_Kong",
  TW: "Asia/Taipei",
  JP: "Asia/Tokyo",
  KR: "Asia/Seoul",
  SG: "Asia/Singapore",
  MY: "Asia/Kuala_Lumpur",
  TH: "Asia/Bangkok",
  VN: "Asia/Ho_Chi_Minh",
  ID: "Asia/Jakarta",
  PH: "Asia/Manila",
  AU: "Australia/Sydney",
  NZ: "Pacific/Auckland",
  BR: "America/Sao_Paulo",
  AR: "America/Argentina/Buenos_Aires",
  MX: "America/Mexico_City",
};

const BROWSER_TZ = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
})();

const PROFILE_CACHE_KEY = "regionalClockProfile";

// Server-synced mode timings. A sample whose round trip exceeds
// SERVER_MAX_RTT_MS (e.g. one delayed by a token refresh) is too imprecise
// to replace a good offset we already hold, so it is dropped and retried.
const SERVER_RESYNC_MS = 5 * 60 * 1000;
const SERVER_RETRY_MS = 30 * 1000;
const SERVER_MAX_RTT_MS = 5000;

const readCachedProfile = () => {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const writeCachedProfile = (data) => {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(data));
  } catch {
    /* localStorage disabled / quota — silently ignore */
  }
};

// ISO-3166 alpha-2 → English country name ("AE" → "United Arab Emirates")
// from the browser's built-in CLDR data; falls back to the raw code on
// engines without Intl.DisplayNames.
const countryNameFromCode = (countryCode) => {
  if (!countryCode) return "";
  const code = String(countryCode).trim().toUpperCase();
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
};

const resolveTimezone = (countryCode) => {
  if (!countryCode) return BROWSER_TZ;
  const code = String(countryCode).trim().toUpperCase();
  return COUNTRY_TZ[code] || BROWSER_TZ;
};

const formatDateTime = (now, timezone) => {
  try {
    const dateFmt = new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: timezone,
    });
    const timeFmt = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: timezone,
    });
    return { date: dateFmt.format(now), time: timeFmt.format(now) };
  } catch {
    return { date: now.toDateString(), time: now.toTimeString().slice(0, 8) };
  }
};

const RegionalClock = ({
  variant = "default",
  countryCode: override,
  serverTimeUrl,
} = {}) => {
  const [profile, setProfile] = useState(() => readCachedProfile());
  const [now, setNow] = useState(() => new Date());
  // Server-synced mode only: zone metadata from the endpoint, and whether
  // we have a usable offset yet ("pending" → "synced" | "failed").
  const [serverZone, setServerZone] = useState(null);
  const [syncStatus, setSyncStatus] = useState(serverTimeUrl ? "pending" : "off");
  // (server − device) clock offset in ms; stays 0 outside server-synced mode.
  const offsetRef = useRef(0);

  // 1) Resolve the user's profile (just for countryCode + countryName).
  //    Skip the round-trip if we've cached it from an earlier dashboard.
  useEffect(() => {
    if (override || serverTimeUrl) return; // explicit override / server zone wins
    if (profile && profile.countryCode) return; // cached — done
    let alive = true;
    const userName =
      localStorage.getItem("UserName") || sessionStorage.getItem("UserName");
    if (!userName) return;
    axiosInstance
      .get(`/api/personalProfile/${userName}`)
      .then((res) => {
        if (!alive) return;
        const data = res?.data || {};
        const next = {
          countryCode: data.countryCode || "",
          countryName: data.countryName || "",
        };
        setProfile(next);
        writeCachedProfile(next);
      })
      .catch(() => {
        // 404 / network — just fall back to browser TZ.
      });
    return () => {
      alive = false;
    };
  }, [override, serverTimeUrl, profile]);

  // 2) Server-synced mode: fetch the server's clock, derive the offset
  //    assuming symmetric latency (the server stamped its time halfway
  //    through the round trip), and keep it fresh.
  useEffect(() => {
    if (!serverTimeUrl) return undefined;
    let alive = true;
    let inFlight = false;
    let hasOffset = false;
    let timer;

    const sync = async () => {
      if (inFlight) return;
      inFlight = true;
      clearTimeout(timer);
      let accepted = false;
      try {
        const sentAt = performance.now();
        const res = await axiosInstance.get(serverTimeUrl);
        const rtt = performance.now() - sentAt;
        const data = res?.data || {};
        const serverMs = Number(data.epochMillis);
        if (
          alive &&
          Number.isFinite(serverMs) &&
          data.timezone &&
          (!hasOffset || rtt <= SERVER_MAX_RTT_MS)
        ) {
          offsetRef.current = Math.round(serverMs + rtt / 2 - Date.now());
          hasOffset = true;
          accepted = true;
          setServerZone({
            timezone: data.timezone,
            countryName: data.countryName || "",
            zoneAbbreviation: data.zoneAbbreviation || "",
            utcOffset: data.utcOffset || "",
          });
          setNow(new Date(Date.now() + offsetRef.current));
        }
      } catch {
        // Network / 5xx — keep the last good offset (or the device clock).
      } finally {
        inFlight = false;
      }
      if (!alive) return;
      setSyncStatus(hasOffset ? "synced" : "failed");
      timer = setTimeout(sync, accepted ? SERVER_RESYNC_MS : SERVER_RETRY_MS);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") sync();
    };

    sync();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [serverTimeUrl]);

  // 3) Tick on each whole-second boundary (self-correcting, unlike a
  //    drifting setInterval), applying the server offset when there is one.
  useEffect(() => {
    let timer;
    const tick = () => {
      const current = Date.now() + offsetRef.current;
      setNow(new Date(current));
      timer = setTimeout(tick, 1000 - (current % 1000));
    };
    tick();
    return () => clearTimeout(timer);
  }, []);

  // Server-synced mode never uses the (per-browser, cached) user profile.
  const localProfile = serverTimeUrl ? null : profile;
  const effectiveCode = override || localProfile?.countryCode || "";
  const timezone = serverZone?.timezone || resolveTimezone(effectiveCode);
  const isSyncing = syncStatus === "pending";
  const { date, time } = isSyncing
    ? { date: "Syncing…", time: "--:--:--" }
    : formatDateTime(now, timezone);
  // An explicit countryCode override is shown by its full country name,
  // so the label is right even before / without a server response.
  const regionLabel =
    serverZone?.countryName ||
    countryNameFromCode(override) ||
    (isSyncing
      ? "—"
      : localProfile?.countryName ||
        effectiveCode ||
        timezone.replace("_", " ").split("/").pop());
  const zoneDetail = [
    serverZone?.zoneAbbreviation,
    serverZone?.utcOffset && `UTC${serverZone.utcOffset}`,
  ]
    .filter(Boolean)
    .join(", ");
  const title = serverZone
    ? `${regionLabel} · ${timezone}${zoneDetail ? ` (${zoneDetail})` : ""} · synced with server`
    : syncStatus === "failed"
    ? `${regionLabel} (${timezone}) · server time unavailable, showing device clock`
    : `${regionLabel} (${timezone})`;

  if (variant === "compact") {
    return (
      <span
        className="regional-clock regional-clock-compact d-inline-flex align-items-center gap-2 px-2 py-1 rounded border bg-white small"
        title={title}
      >
        <i className="fa-regular fa-clock text-primary" />
        <span className="fw-semibold">{time}</span>
        <span className="text-muted">{date}</span>
      </span>
    );
  }

  return (
    <div
      className="regional-clock d-inline-flex align-items-center gap-3 px-3 py-2 rounded-3 border bg-white shadow-sm"
      title={title}
    >
      <div
        className="d-flex align-items-center justify-content-center rounded-circle bg-primary-subtle text-primary"
        style={{ width: 36, height: 36 }}
      >
        <i className="fa-regular fa-clock" />
      </div>
      <div className="d-flex flex-column">
        <span className="fw-bold lh-1" style={{ fontSize: "1.05rem" }}>
          {time}
        </span>
        <span className="text-muted small lh-1 mt-1">{date}</span>
      </div>
      <div className="vr" />
      <div className="d-flex flex-column">
        <span className="text-uppercase text-muted" style={{ fontSize: "0.7rem", letterSpacing: 0.5 }}>
          Region
        </span>
        <span className="fw-semibold small">{regionLabel}</span>
      </div>
    </div>
  );
};

export default RegionalClock;
