/**
 * Small presentation helpers shared by the Automated Mapping popup pieces.
 * Status codes mirror the backend enum
 * hotelmapping.automap.engine.AutoMappingStatus.
 */

export const STATUS_META = {
  RUNNING: {
    label: "Running",
    tone: "success",
    icon: "fas fa-sync fa-spin",
    headline: "Automated mapping is currently running.",
  },
  PAUSED_HIGH_SYSTEM_LOAD: {
    label: "Paused — High System Load",
    tone: "warning",
    icon: "fas fa-pause-circle",
    headline: "Automated mapping is paused.",
  },
  COMPLETED: {
    label: "Completed",
    tone: "success",
    icon: "fas fa-check-circle",
    headline: "Automated mapping completed successfully.",
  },
  IDLE: {
    label: "Idle",
    tone: "secondary",
    icon: "fas fa-moon",
    headline: "Automated mapping is idle.",
  },
  ERROR: {
    label: "Error",
    tone: "danger",
    icon: "fas fa-exclamation-triangle",
    headline: "Automated mapping encountered an error.",
  },
  DISABLED: {
    label: "Disabled",
    tone: "secondary",
    icon: "fas fa-power-off",
    headline: "Automated mapping is disabled.",
  },
};

export function statusMeta(code) {
  return (
    STATUS_META[code] || {
      label: code || "Unknown",
      tone: "secondary",
      icon: "fas fa-question-circle",
      headline: "Automated mapping status is unknown.",
    }
  );
}

export function fmtDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function fmtTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleTimeString();
}

export function fmtNumber(n) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString();
}

export function fmtPercent(n, digits = 0) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return `${Number(n).toFixed(digits)}%`;
}

export function fmtDistance(meters) {
  if (meters === null || meters === undefined) return "—";
  const m = Number(meters);
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

/** Bootstrap tone for a confidence badge. */
export function confidenceTone(confidence) {
  const c = Number(confidence);
  if (c >= 100) return "success";
  if (c >= 95) return "primary";
  if (c >= 90) return "info";
  if (c >= 80) return "warning";
  return "secondary";
}

export const REASON_LABELS = {
  NAME_DIFFERS: "Name differs",
  TOO_FAR: "Coordinates too far apart",
  FAR_APART: "Different location",
  NO_COORDINATES: "Coordinates missing",
  CITY_UNCONFIRMED: "City not confirmed",
  COUNTRY_MISMATCH: "Country differs",
  AMBIGUOUS: "Ambiguous (tie at 100%)",
  SINGLE_SUPPLIER: "100% — single supplier",
  CONFLICT: "Already mapped elsewhere",
  SAME_CONTACT_EXACT: "Exact: same phone, email or website",
  SAME_CONTACT: "Same phone, email or website, please check",
};

export function reasonLabel(code) {
  return REASON_LABELS[code] || code || "—";
}

export function methodLabel(method) {
  return method === "AUTOMATED" ? "Automated" : "Manual";
}

/** Escapes a value for the small HTML blocks shown in SweetAlert confirmations. */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
