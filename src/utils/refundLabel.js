/**
 * The three labels every hotel rate and booking shows, in one place. The backend
 * decides the label (RefundRule.java) and sends it as `rate.refundTerms`:
 *   { label, labelText, cutoff, chargeNowPercent, bands }
 * This file turns that into words, colours and filter checks. It holds no rule of
 * its own, except a plain fallback for a rate that arrives without the field.
 */

export const REFUND_FLEXIBLE = "FLEXIBLE";
export const REFUND_PARTIAL = "PARTIAL";
export const REFUND_NON_REFUNDABLE = "NON_REFUNDABLE";

const LABEL_TEXT = {
  [REFUND_FLEXIBLE]: "Flexible",
  [REFUND_PARTIAL]: "Flexible - Partial",
  [REFUND_NON_REFUNDABLE]: "Non Refundable",
};

const LABEL_BADGE = {
  [REFUND_FLEXIBLE]: "success",
  [REFUND_PARTIAL]: "warning",
  [REFUND_NON_REFUNDABLE]: "danger",
};

/** True for every way the system spells "non-refundable" on a rate flag. */
const isFlaggedNonRefundable = (value) => {
  const v = String(value).trim().toLowerCase();
  return v === "true" || v === "y" || v === "yes" || v === "1";
};

/** The label code of a rate, room or booking-page slot. */
export const labelOfRate = (rate) => {
  const code = rate?.refundTerms?.label;
  if (code && LABEL_TEXT[code]) return code;
  return isFlaggedNonRefundable(rate?.nonRefundable)
    ? REFUND_NON_REFUNDABLE
    : REFUND_FLEXIBLE;
};

/**
 * The label code of a stored status. "Flexi" and Last Minute's "Refundable" read
 * as Flexible, anything with "non" as Non Refundable. Null when nothing is stored.
 */
export const labelOfStatus = (status) => {
  if (status == null || String(status).trim() === "") return null;
  return String(status).toLowerCase().includes("non")
    ? REFUND_NON_REFUNDABLE
    : REFUND_FLEXIBLE;
};

export const refundLabelText = (code) => LABEL_TEXT[code] || "";

export const refundLabelBadge = (code) => LABEL_BADGE[code] || "secondary";

/** The words for a stored status, or the status itself if it isn't one of ours. */
export const statusText = (status) => {
  const code = labelOfStatus(status);
  return code ? LABEL_TEXT[code] : status ?? "";
};

/** The worst label among rooms: a booking is as refundable as its worst room. */
export const worstLabel = (codes) => {
  const list = (codes || []).filter(Boolean);
  if (list.includes(REFUND_NON_REFUNDABLE)) return REFUND_NON_REFUNDABLE;
  if (list.includes(REFUND_PARTIAL)) return REFUND_PARTIAL;
  return list.length > 0 ? REFUND_FLEXIBLE : null;
};

/**
 * Refund filter check. `filter` has `refundable` (the Flexible box), `partial`
 * and `nonRefundable`. No box ticked lets everything through.
 */
export const refundFilterMatches = (filter, code) => {
  if (!filter?.refundable && !filter?.partial && !filter?.nonRefundable) {
    return true;
  }
  return (
    (filter.refundable === true && code === REFUND_FLEXIBLE) ||
    (filter.partial === true && code === REFUND_PARTIAL) ||
    (filter.nonRefundable === true && code === REFUND_NON_REFUNDABLE)
  );
};

/**
 * The hotel search's Refund Policy value: "refundable" (the Flexible box),
 * "partial" or "nonRefundable", the same values /api/hotel-search/results
 * takes. Undefined when no box is ticked. View Rooms hands this value to the
 * room list, so both pages read the boxes through these two functions.
 */
export const refundPolicyOfFilter = (filter) =>
  filter?.refundable
    ? "refundable"
    : filter?.partial
      ? "partial"
      : filter?.nonRefundable
        ? "nonRefundable"
        : undefined;

/**
 * The boxes to tick for a Refund Policy value, case-insensitive like the
 * backend. Null for no value or one it doesn't know, so the room list keeps
 * its own default.
 */
export const refundFilterOfPolicy = (policy) => {
  const value = String(policy ?? "").trim().toLowerCase();
  if (value === "refundable") {
    return { refundable: true, partial: false, nonRefundable: false };
  }
  if (value === "partial") {
    return { refundable: false, partial: true, nonRefundable: false };
  }
  if (value === "nonrefundable") {
    return { refundable: false, partial: false, nonRefundable: true };
  }
  return null;
};

/**
 * The terms after an IWTX or X3 price check. The check returns only a flag, so
 * the search's terms stand unless the flag now says non-refundable.
 */
export const repricedTerms = (flag, terms) =>
  isFlaggedNonRefundable(flag)
    ? {
        label: REFUND_NON_REFUNDABLE,
        labelText: LABEL_TEXT[REFUND_NON_REFUNDABLE],
        cutoff: null,
        chargeNowPercent: 100,
        bands: [],
      }
    : terms;

/** "Cancelling now costs 50% of the booking", or "" when there is nothing to say. */
export const chargeNowText = (rate) => {
  const percent = Number(rate?.refundTerms?.chargeNowPercent);
  if (!Number.isFinite(percent) || percent <= 0 || percent >= 100) return "";
  const shown = Number.isInteger(percent) ? percent : percent.toFixed(2);
  return `Cancelling now costs ${shown}% of the booking`;
};

/**
 * Today's date in the UAE, as a local Date at midnight, so it compares with
 * deadline dates the same way wherever the browser is. The deadline date shown
 * is free until 11:59 PM UAE that day.
 */
export const uaeToday = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = parts.split("-").map(Number);
  return new Date(y, m - 1, d);
};
