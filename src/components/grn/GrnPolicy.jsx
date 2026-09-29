import React from "react";
import { Badge, Button, Modal } from "react-bootstrap";
import { isDeadlinePassed } from "../../utils/rateDeadline";

/**
 * GRN (apiId 20) cancellation-policy presentation, shared by the room list,
 * the booking page and the change-notice modal so every screen shows the
 * SAME categorisation and wording.
 *
 * All values originate from the backend's GrnCancellationPolicyMapper
 * (search + recheck use the same mapper):
 *   refundCategory        FULLY_REFUNDABLE / PARTIALLY_REFUNDABLE / NON_REFUNDABLE
 *   refundStatus          "Fully refundable" / "Partially refundable" / "Non-refundable"
 *   freeCancellationUntil "11 Dec 2022, 11:59 PM IST" (null when no free window)
 *   cancelByDate          GRN cancel_by_date (IST) as sent
 *   underCancellation     GRN under_cancellation
 *   noShowFeeText         "100% of the booking amount" / "INR 5,976.00" / "1 night's charge"
 *   policyTimezone        "IST" — every GRN policy timestamp is Indian Standard Time
 *   policyText            one-line summary
 *   cancellationPolicy[]  penalty windows, each with a ready-made policyText
 *
 * Bundled rate  → ONE policy covers every room.
 * Non-bundled   → EACH room carries its own policy (render one block per room).
 */

export const GRN_API_ID = 20;

export const isGrnApiId = (apiId) => Number(apiId) === GRN_API_ID;

const truthy = (v) => v === true || v === "true" || v === "Y";

/**
 * Safety buffer, in days, applied to GRN's free-cancellation cut-off — the
 * same 1-day margin every other supplier gets via
 * SUPPLIER_DEADLINE_BUFFER_DAYS in utils/rateDeadline.js, and inhouse gets via
 * INHOUSE_DEADLINE_BUFFER_DAYS.
 *
 * GRN needs its own constant because its cut-off is not a Date: the backend
 * hands over a formatted IST string ("08 Nov 2026, 11:59 PM IST"), so the
 * shift is applied to the date portion of that string.
 */
export const GRN_DEADLINE_BUFFER_DAYS = 1;

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MONTH_IDX = MONTHS_SHORT.reduce((acc, name, i) => {
  acc[name.toLowerCase()] = i;
  return acc;
}, {});

/**
 * Shift the DATE portion of a GRN timestamp string back by `days`, leaving the
 * time and the timezone label exactly as GRN sent them:
 *
 *   "08 Nov 2026, 11:59 PM IST"  →  "07 Nov 2026, 11:59 PM IST"
 *
 * Only the date is rewritten, never the time — the cut-off is still 11:59 PM
 * IST, just a day earlier. Rebuilding the whole string from a Date would drag
 * it into the browser's timezone and silently move the hour.
 *
 * Returns the input untouched when it doesn't match the expected shape: a
 * cancellation cut-off we can't parse is far better shown verbatim than
 * guessed at.
 */
const shiftGrnDateString = (value, days) => {
  if (!value || !days) return value || null;
  const str = String(value).trim();
  const m = str.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
  if (!m) return str;
  const idx = MONTH_IDX[m[2].slice(0, 3).toLowerCase()];
  if (idx == null) return str;
  const d = new Date(Number(m[3]), idx, Number(m[1]));
  if (Number.isNaN(d.getTime())) return str;
  d.setDate(d.getDate() - days);
  // Preserve GRN's own zero-padding style rather than imposing one.
  const day =
    m[1].length === 2
      ? String(d.getDate()).padStart(2, "0")
      : String(d.getDate());
  const rest = str.slice(m[0].length); // ", 11:59 PM IST"
  return `${day} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}${rest}`;
};

/** Normalise a rate / slot object (search rate, recheck DTO or mapped payload row) into one policy view. */
export const grnPolicyFromRate = (rate) => {
  if (!rate) return null;
  const rows = Array.isArray(rate.cancellationPolicy)
    ? rate.cancellationPolicy
    : Array.isArray(rate.cancellationPolicies)
      ? rate.cancellationPolicies
      : [];
  const nonRefundable = truthy(rate.nonRefundable);
  let refundCategory = rate.refundCategory || null;
  if (!refundCategory) {
    refundCategory = nonRefundable ? "NON_REFUNDABLE" : rows.length ? "FULLY_REFUNDABLE" : null;
  }
  const refundStatus =
    rate.refundStatus && /refundable/i.test(rate.refundStatus)
      ? rate.refundStatus
      : grnCategoryLabel(refundCategory, nonRefundable);
  return {
    refundCategory,
    refundStatus,
    nonRefundable,
    underCancellation: truthy(rate.underCancellation),
    // Raw supplier field, never displayed — left exactly as GRN sent it.
    cancelByDate: rate.cancelByDate || null,
    // Buffered by GRN_DEADLINE_BUFFER_DAYS. Applied HERE, at the single point
    // every screen reads the policy through (pill, policy block, policy-lines
    // text), so all of them agree without each remembering to shift.
    //
    // The shifted value must NEVER be written back onto the rate: the room
    // list copies rate.freeCancellationUntil into the booking payload, and the
    // booking page calls grnPolicyFromRate on that payload again — persisting
    // the shifted string would buffer it a second time.
    freeCancellationUntil: shiftGrnDateString(
      rate.freeCancellationUntil,
      GRN_DEADLINE_BUFFER_DAYS,
    ),
    noShowFeeText: rate.noShowFeeText || null,
    policyTimezone: rate.policyTimezone || "IST",
    policyText: rate.policyText || null,
    rows,
  };
};

export const grnCategoryLabel = (category, nonRefundable) => {
  switch (category) {
    case "FULLY_REFUNDABLE":
      return "Fully refundable";
    case "PARTIALLY_REFUNDABLE":
      return "Partially refundable";
    case "NON_REFUNDABLE":
      return "Non-refundable";
    default:
      return nonRefundable ? "Non-refundable" : "Refundable";
  }
};

const categoryVariant = (category, nonRefundable) => {
  switch (category) {
    case "FULLY_REFUNDABLE":
      return "success";
    case "PARTIALLY_REFUNDABLE":
      return "warning";
    case "NON_REFUNDABLE":
      return "danger";
    default:
      return nonRefundable ? "danger" : "success";
  }
};

/**
 * True when this rate's (already-buffered) free-cancellation deadline is a day
 * in the past. Meaningful only for rates that HAD a free window in the first
 * place — a non-refundable rate never had one, so this is false for it.
 * Shared with GrnDeadlinePill and GrnPolicyBlock so all three flip together.
 */
export const isGrnDeadlinePassed = (policy) => {
  if (!policy || policy.refundCategory === "NON_REFUNDABLE") return false;
  return isDeadlinePassed(policy.freeCancellationUntil);
};

/** Small pill: Fully refundable / Partially refundable / Non-refundable. */
export const GrnRefundBadge = ({ rate, policy, className = "" }) => {
  const p = policy || grnPolicyFromRate(rate);
  if (!p) return null;
  // Deadline day is already in the past: the supplier categorised this as
  // Fully / Partially refundable at search time, but the free window is now
  // gone — the operator would otherwise see a green pill promising something
  // the cancel flow (BookingDetailedView) will already refuse.
  if (isGrnDeadlinePassed(p)) {
    return (
      <Badge
        bg="danger"
        className={className}
        title={`Free-cancellation window closed on ${p.freeCancellationUntil}. Cancellation charges now apply.`}
      >
        Non-refundable (deadline passed)
      </Badge>
    );
  }
  const variant = categoryVariant(p.refundCategory, p.nonRefundable);
  return (
    <Badge
      bg={variant}
      text={variant === "warning" ? "dark" : undefined}
      className={className}
      title={p.policyText || undefined}
    >
      {p.refundStatus}
    </Badge>
  );
};

/**
 * One-line pill under the rate card: "Free cancellation until 11 Dec 2022,
 * 11:59 PM IST" for fully refundable rates, the charge summary otherwise.
 */
export const GrnDeadlinePill = ({ rate, policy }) => {
  const p = policy || grnPolicyFromRate(rate);
  if (!p) return null;
  // Deadline in the past — override every "still free" wording. Matches the
  // red pill RateDeadlinePill shows for non-GRN suppliers so operators see
  // one consistent message across the whole page.
  if (isGrnDeadlinePassed(p)) {
    return (
      <span
        className="small fw-semibold text-danger"
        title={`Free-cancellation window closed on ${p.freeCancellationUntil} (${p.policyTimezone})`}
      >
        Free-cancellation window has passed ({p.freeCancellationUntil})
      </span>
    );
  }
  if (p.refundCategory === "FULLY_REFUNDABLE" && p.freeCancellationUntil) {
    return (
      <span
        className="small fw-semibold"
        style={{ color: "#146c43" }}
        title={`Cancel before this time (${p.policyTimezone}) to avoid charges`}
      >
        Free cancellation until {p.freeCancellationUntil}
      </span>
    );
  }
  if (p.refundCategory === "PARTIALLY_REFUNDABLE") {
    return (
      <span className="small fw-semibold" style={{ color: "#997404" }}>
        {p.policyText || "Partially refundable — cancellation charges apply now"}
      </span>
    );
  }
  if (p.refundCategory === "NON_REFUNDABLE") {
    return (
      <span className="small fw-semibold text-danger">
        Non-refundable — no free cancellation
      </span>
    );
  }
  return null;
};

/**
 * Full policy block: category, free-cancellation deadline, penalty
 * timeline, no-show fee and the IST note. `title` (e.g. "Room 2 — Deluxe")
 * is shown when rendering one block per room for non-bundled rates.
 */
export const GrnPolicyBlock = ({ rate, policy, title, note, compact = false }) => {
  const p = policy || grnPolicyFromRate(rate);
  if (!p) return null;
  // When the buffered deadline has already passed we paint the whole block
  // in the danger tone so the badge, the note and the container agree — a
  // red badge inside a green tile would just be confusing.
  const deadlinePassed = isGrnDeadlinePassed(p);
  const variant = deadlinePassed
    ? "danger"
    : categoryVariant(p.refundCategory, p.nonRefundable);
  const tone = {
    success: { bg: "#e8f5ec", border: "#b7dfc2", ink: "#146c43" },
    warning: { bg: "#fff8e1", border: "#f0d48a", ink: "#7a5a00" },
    danger: { bg: "#fdecec", border: "#f3b9b9", ink: "#a11a1a" },
  }[variant];

  return (
    <div
      className={`border rounded ${compact ? "p-2 mb-2" : "p-3 mb-3"}`}
      style={{ background: tone.bg, borderColor: tone.border }}
    >
      {title && (
        <div className="fw-semibold small text-dark mb-1">{title}</div>
      )}
      <div className="d-flex align-items-center flex-wrap gap-2 mb-1">
        <GrnRefundBadge policy={p} />
        {deadlinePassed && p.freeCancellationUntil && (
          <span className="small fw-semibold" style={{ color: tone.ink }}>
            Free-cancellation window closed on {p.freeCancellationUntil}
          </span>
        )}
        {!deadlinePassed && p.refundCategory === "FULLY_REFUNDABLE" && p.freeCancellationUntil && (
          <span className="small fw-semibold" style={{ color: tone.ink }}>
            Free cancellation until {p.freeCancellationUntil}
          </span>
        )}
        {p.underCancellation && p.refundCategory !== "NON_REFUNDABLE" && (
          <span className="small fw-semibold" style={{ color: tone.ink }}>
            Cancellation charges already apply
          </span>
        )}
      </div>
      {note && <div className="small text-muted mb-1">{note}</div>}
      {p.policyText && (
        <div className="small mb-2" style={{ color: tone.ink }}>
          {p.policyText}
        </div>
      )}

      {p.nonRefundable && p.refundCategory === "NON_REFUNDABLE" && !p.rows.length ? (
        <div className="small text-dark">
          No refund will be provided if this booking is cancelled or in case of
          no-show. 100% cancellation charges apply.
        </div>
      ) : p.rows.length > 0 ? (
        <ul className="small mb-2 ps-3">
          {p.rows.map((row, idx) => (
            <li key={idx} className="mb-1" style={{ whiteSpace: "pre-line" }}>
              {row?.policyText || "—"}
            </li>
          ))}
        </ul>
      ) : null}

      {p.noShowFeeText && (
        <div className="small text-dark">
          <strong>No-show fee:</strong> {p.noShowFeeText}. Charged if the guest
          does not arrive for check-in, and also if the booking is cancelled on
          the check-in date.
        </div>
      )}
      {(p.rows.length > 0 || p.freeCancellationUntil) && (
        <div className="small text-muted mt-1">
          All dates and times are in {p.policyTimezone}
          {p.policyTimezone === "IST" ? " (Indian Standard Time)" : ""}.
        </div>
      )}
    </div>
  );
};

/**
 * Decide whether a set of selected rates is ONE bundled rate (all rooms
 * share the same rate key → one common policy) or non-bundled (each room
 * has its own key → its own policy).
 */
export const grnIsBundledSelection = (rates) => {
  const keys = new Set(
    (rates || [])
      .map((r) => r?.atharvaRateKey || r?.rateKey || null)
      .filter(Boolean),
  );
  return keys.size <= 1;
};

/**
 * Modal shown after recheck when GRN reports that the price and/or the
 * cancellation policy changed since the search. The operator must accept
 * the NEW terms before the booking page opens. `items` is one entry per
 * distinct rate: { roomLabel, priceChanged, policyChanged, oldPrice,
 * newPrice, oldPolicy, newPolicy }.
 */
export const GrnChangeNoticeModal = ({ show, items, onAccept, onCancel, formatPrice }) => {
  const fmt = (v) =>
    typeof formatPrice === "function"
      ? formatPrice(v)
      : v == null
        ? "—"
        : Number(v).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
  const list = Array.isArray(items) ? items : [];
  return (
    <Modal show={show} onHide={onCancel} centered backdrop="static" size="lg" scrollable>
      <Modal.Header closeButton>
        <Modal.Title>Rate updated by supplier</Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ maxHeight: "70vh", overflowY: "auto" }}>
        <div className="alert alert-warning py-2 small mb-3" role="alert">
          GRN re-verified this rate and reports a change since your search. Please
          review the updated terms below. The booking will use the <strong>new</strong>{" "}
          price and policy.
        </div>
        {list.map((it, idx) => (
          <div key={idx} className="border rounded p-3 mb-3">
            {it.roomLabel && (
              <div className="fw-semibold mb-2">{it.roomLabel}</div>
            )}
            {it.priceChanged && (
              <div className="mb-2 small">
                <div className="fw-semibold text-danger">
                  Price changed from {fmt(it.oldPrice)} to {fmt(it.newPrice)}
                </div>
                <div>
                  <span className="text-decoration-line-through text-muted me-2">
                    {fmt(it.oldPrice)}
                  </span>
                  <strong className="text-danger">{fmt(it.newPrice)}</strong>
                </div>
              </div>
            )}
            {it.policyChanged && (
              <div className="small">
                <div className="fw-semibold text-danger mb-1">
                  Cancellation policy changed
                  {it.oldPolicy?.refundStatus && it.newPolicy?.refundStatus
                    ? ` (${it.oldPolicy.refundStatus} → ${it.newPolicy.refundStatus})`
                    : ""}
                </div>
                {it.oldPolicy && (
                  <div className="mb-2">
                    <div className="text-muted small">Previously shown</div>
                    <GrnPolicyBlock policy={it.oldPolicy} compact />
                  </div>
                )}
                <div className="text-muted small">Now</div>
                <GrnPolicyBlock policy={it.newPolicy} compact />
              </div>
            )}
            {!it.priceChanged && it.policyChanged === false && (
              <div className="small text-muted">No change for this room.</div>
            )}
          </div>
        ))}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onCancel}>
          Go back to rates
        </Button>
        <Button variant="primary" onClick={onAccept}>
          Accept new terms &amp; continue
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
