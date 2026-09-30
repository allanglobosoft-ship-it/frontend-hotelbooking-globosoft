import React from "react";

/**
 * Free-cancellation deadline shown on every room-list rate card.
 *
 * One helper for every supplier and for inhouse, because the three pills this
 * replaces (Atharva / Darina / GoGlobal) had drifted apart — different date
 * formats, different wording, and the Atharva one wasn't even red.
 *
 * Where the date comes from, in order:
 *   1. `rate.deadlineDate` — the supplier's own field. Only Atharva
 *      ("DD-MMM-YYYY"), Darina ("yyyy-MM-dd") and GoGlobal ("dd/MMM/yyyy")
 *      populate it; see RateOptionResponse.java.
 *   2. the earliest `cancellationPolicies[].fromDate` — the first charge band
 *      starts when free cancellation ends, so that date IS the cut-off. This
 *      is the only source for Jumeirah, IWTX, X3, RateHawk and inhouse, and
 *      it is where the backend already writes RateHawk's
 *      `free_cancellation_before` (RatehawkHotelRoomSearchService.java).
 *
 * Every date resolved here is pulled one day earlier than the supplier's own
 * cut-off — see SUPPLIER_DEADLINE_BUFFER_DAYS — so a cancellation is actioned
 * with a day in hand. INHOUSE has the same treatment under
 * INHOUSE_DEADLINE_BUFFER_DAYS, and GRN under GRN_DEADLINE_BUFFER_DAYS in
 * components/grn/GrnPolicy.jsx, where it also keeps its own colour-coded,
 * IST-based pill rather than routing through this file.
 */

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MONTH_INDEX = MONTHS.reduce((acc, name, i) => {
  acc[name.toLowerCase()] = i;
  return acc;
}, {});

/**
 * Every supplier date shape this app sees, parsed explicitly.
 *
 * Deliberately not `new Date(str)` first: the engine reads "01-02-2026" as
 * 1 February in some formats and 2 January in others, and it rejects
 * "18/Nov/2026" outright. Guessing wrong on a cancellation cut-off is worse
 * than showing nothing, so each known shape is matched by pattern and the
 * engine is only a last resort.
 */
export const parseSupplierDate = (value) => {
  if (value == null) return null;
  const str = String(value).trim();
  if (!str) return null;

  // ISO `yyyy-MM-dd`, with or without a time component (Darina, policy rows).
  let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);

  // `dd-MMM-yyyy` (Atharva) and `dd/MMM/yyyy` (GoGlobal).
  m = str.match(/^(\d{1,2})[-/]([A-Za-z]{3,})[-/](\d{4})$/);
  if (m) {
    const idx = MONTH_INDEX[m[2].slice(0, 3).toLowerCase()];
    if (idx != null) return new Date(+m[3], idx, +m[1]);
  }

  // `dd-MM-yyyy` / `dd/MM/yyyy` — day-first, the convention across this app.
  m = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);

  // `dd MMM yyyy[, hh:mm AM/PM TZ]` — GRN's already-formatted
  // freeCancellationUntil, e.g. "08 Nov 2026, 11:59 PM IST". The engine
  // rejects it outright because of the trailing zone label, so match the
  // date part ourselves and ignore the rest.
  m = str.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
  if (m) {
    const idx = MONTH_INDEX[m[2].slice(0, 3).toLowerCase()];
    if (idx != null) return new Date(+m[3], idx, +m[1]);
  }

  const nat = new Date(str);
  return Number.isNaN(nat.getTime()) ? null : nat;
};

/** One display format for every supplier: "18 Nov 2026". */
export const formatDeadlineDay = (value) => {
  const d = parseSupplierDate(value);
  if (!d || Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

/**
 * Suppliers disagree on how they say "no": true / "true" / "Y" / "yes" / 1.
 * Mirrors isNonRefundableRate in RoomList.jsx.
 */
export const isNonRefundable = (value) => {
  const v = String(value).trim().toLowerCase();
  return v === "true" || v === "y" || v === "yes" || v === "1";
};

/**
 * The cut-off for a rate, as a `Date`, or null when there isn't one.
 * `fallbackPolicies` covers suppliers that hang the policy list off the hotel
 * rather than the rate.
 */
/**
 * True when a supplier date carries no meaningful time — either no time part
 * at all, or exactly midnight.
 *
 * The time is read from the position after the date, NOT by searching for
 * "00:00" anywhere: "2026-11-08T21:00:00Z" contains "00:00" inside its
 * seconds and would otherwise be misread as midnight.
 */
const isMidnightOrDateOnly = (value) => {
  const m = String(value || "").match(/[T\s](\d{1,2}):(\d{2})/);
  if (!m) return true; // date-only
  return Number(m[1]) === 0 && Number(m[2]) === 0;
};

/**
 * Safety buffer, in days, pulled off an API supplier's stated cut-off.
 *
 * Same intent as the inhouse buffer: cancel with a day in hand rather than on
 * the last possible date, leaving margin for timezone differences, a
 * late-in-the-day request and the supplier's own processing.
 *
 * Applies to every API supplier — Atharva, Darina, GoGlobal, Jumeirah, IWTX,
 * X3, RateHawk — on /api-room-list and /api-booking-page-hotels, and to the
 * deadlineDate those bookings persist.
 *
 * GRN is buffered by the same one day, but through its own constant
 * GRN_DEADLINE_BUFFER_DAYS in components/grn/GrnPolicy.jsx: its cut-off
 * arrives as a formatted IST string rather than a Date, so the shift is
 * applied to that string's date portion. Keep the two values equal.
 *
 * INHOUSE has its own INHOUSE_DEADLINE_BUFFER_DAYS below. Three constants
 * rather than one because inhouse policy, supplier policy and GRN's
 * string-shaped cut-off are separate concerns that could each change alone.
 */
export const SUPPLIER_DEADLINE_BUFFER_DAYS = 1;

/** Pull a resolved supplier cut-off earlier by the buffer, at local midnight. */
const applySupplierBuffer = (date) => {
  if (!date) return date;
  const buffered = new Date(date);
  buffered.setDate(buffered.getDate() - SUPPLIER_DEADLINE_BUFFER_DAYS);
  return buffered;
};

/**
 * Same as resolveDeadlineDate but also reports WHICH field the answer came
 * from and its raw value. The pill puts this in its tooltip: when two screens
 * disagree, hovering each one says immediately whether they read different
 * fields or the same field with different data, instead of it being guesswork.
 */
export const resolveDeadlineInfo = (rate, fallbackPolicies) => {
  if (!rate) return null;

  // 1. GRN states the end of the free window outright — the most direct
  //    answer any supplier gives, so it wins.
  //
  //    GRN normally renders through its own IST-aware pill in
  //    components/grn/GrnPolicy.jsx (which applies GRN_DEADLINE_BUFFER_DAYS to
  //    the string form), so this branch is a fallback for any caller that
  //    hands a GRN rate to the shared pill. Buffered to the same day so the
  //    two can never disagree.
  const grn = parseSupplierDate(rate.freeCancellationUntil);
  if (grn) {
    return {
      date: applySupplierBuffer(grn),
      source: `freeCancellationUntil − ${SUPPLIER_DEADLINE_BUFFER_DAYS} day buffer`,
      raw: rate.freeCancellationUntil,
    };
  }

  // 2. Atharva / Darina / GoGlobal `deadlineDate`. Darina's is the free (0%)
  //    band's toDate — see extractFreeCancellationDeadline in
  //    DarinaHotelRoomSearchService — i.e. already the LAST FREE DAY.
  const own = parseSupplierDate(rate.deadlineDate);
  if (own) {
    return {
      date: applySupplierBuffer(own),
      source: `deadlineDate − ${SUPPLIER_DEADLINE_BUFFER_DAYS} day buffer`,
      raw: rate.deadlineDate,
    };
  }

  // 3. Cancellation-policy rows. `cancellationPolicy` (singular) is the key
  //    mapRateForPayload hands to the booking page; `cancellationPolicies` is
  //    what the room list carries. Accept both so one rate resolves the same
  //    on either screen.
  //
  //    `fallbackPolicies` is a last resort and callers should normally NOT
  //    pass it: the room list used to hand in the HOTEL-level policy list,
  //    which the booking page has no access to, so the two screens resolved
  //    from different data for any rate without its own rows.
  const policies = Array.isArray(rate.cancellationPolicies)
    ? rate.cancellationPolicies
    : Array.isArray(rate.cancellationPolicy)
      ? rate.cancellationPolicy
      : Array.isArray(fallbackPolicies)
        ? fallbackPolicies
        : [];

  let earliest = null;
  let earliestRaw = null;
  policies.forEach((p) => {
    const d = parseSupplierDate(p?.fromDate);
    if (d && (!earliest || d < earliest)) {
      earliest = d;
      earliestRaw = p?.fromDate;
    }
  });
  if (!earliest) return null;

  // A band that starts at 00:00 on day D means charges begin the instant D
  // starts — so the last moment you can cancel free is the END of D−1, which
  // is what this pill's "11:59 PM" label states. Without this the card
  // promises a free day that the supplier already charges for: the room list
  // read 9 Nov where the booking page (using Darina's own free-band toDate)
  // read 8 Nov, for one and the same policy.
  //
  // When the band start carries a real time (RateHawk writes
  // free_cancellation_before straight into fromDate) that instant IS the
  // cut-off, so it is left alone.
  if (isMidnightOrDateOnly(earliestRaw)) {
    const adjusted = new Date(earliest);
    adjusted.setDate(adjusted.getDate() - 1);
    return {
      date: applySupplierBuffer(adjusted),
      source: `policy fromDate − 1 day − ${SUPPLIER_DEADLINE_BUFFER_DAYS} day buffer`,
      raw: earliestRaw,
    };
  }
  return {
    date: applySupplierBuffer(earliest),
    source: `policy fromDate − ${SUPPLIER_DEADLINE_BUFFER_DAYS} day buffer`,
    raw: earliestRaw,
  };
};

export const resolveDeadlineDate = (rate, fallbackPolicies) =>
  resolveDeadlineInfo(rate, fallbackPolicies)?.date || null;

/**
 * True when the given free-cancellation cut-off is a day in the past.
 *
 * Compared at DAY granularity in the browser's local timezone: today at 00:00
 * against the deadline's 00:00. So a deadline whose day IS today is still
 * considered valid — the label ("11:59 PM (UAE)" / "11:59 PM IST") promises
 * the whole of that day. Only from the next calendar day does this return
 * true, which is what flips the room-list card, the booking-page banner and
 * the confirm modal from "flexible" to "deadline passed".
 *
 * Accepts anything parseSupplierDate does (Date, ISO string, "dd-MMM-yyyy",
 * "dd/MMM/yyyy", "dd-MM-yyyy", GRN's "dd MMM yyyy, hh:mm AM/PM IST"), so the
 * inhouse Date, the API-supplier resolved Date and GRN's raw string all pass
 * through the same helper. Returns false when nothing parseable is given
 * (missing deadline never gates a booking on its own).
 */
export const isDeadlinePassed = (value) => {
  const d = value instanceof Date ? value : parseSupplierDate(value);
  if (!d || Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dead = new Date(d);
  dead.setHours(0, 0, 0, 0);
  return today > dead;
};

/**
 * Static cut-off times. Suppliers send a date with no time, so the hour is
 * stamped on rather than derived.
 *
 * 02:00 PM is the house convention — every booking page and booking-detail
 * view already prints it, so anything that has to agree with a booking page
 * must use it too. 11:59 PM is the room-list convention for API suppliers.
 */
export const DEADLINE_TIME_2PM = "02:00 PM (UAE)";
export const DEADLINE_TIME_EOD = "11:59 PM (UAE)";

/**
 * Safety buffer, in days, applied to the INHOUSE deadline only.
 *
 * The hotel's policy says when the hotel starts charging; this pulls our
 * cut-off one day earlier so the booking is cancelled with a day in hand
 * rather than on the last possible date. Without it, a cancellation actioned
 * on the deadline date itself leaves no margin for timezone differences,
 * a late-in-the-day request, or the hotel's own processing.
 *
 * Applies ONLY to inhouse. Supplier rates (GRN / Atharva / Darina / GoGlobal
 * / RateHawk …) keep their supplier-stated date untouched — we cannot move a
 * cut-off the supplier will enforce on their own schedule.
 *
 * MUST stay in step with INHOUSE_DEADLINE_BUFFER_DAYS in
 * InhouseHotelBookingService.java, which applies the same subtraction when it
 * stores deadline_date on the booking. If these two disagree, the room list
 * and booking page promise one date while the saved booking (and therefore
 * the Booking List, voucher and auto-cancel job) uses another.
 */
export const INHOUSE_DEADLINE_BUFFER_DAYS = 1;

/**
 * Inhouse (apiId 1) free-cancellation deadline:
 * `checkInDate − maxNights − INHOUSE_DEADLINE_BUFFER_DAYS`, at local midnight.
 *
 * maxNights is `MAX(noOfNights)` across the hotel's live cancellation-policy
 * rows — the ones edited at /hotel-actions/{hotelId}/hotel-policy. So a hotel
 * whose policy reads "100% fee if cancelled less than 2 days prior to arrival"
 * with a 17 Sep check-in resolves to 15 Sep by policy, and 14 Sep once the
 * buffer is applied.
 *
 * The backend applies the identical rule when storing the booking
 * (InhouseHotelBookingService), and HotelBookingPage calls THIS function
 * rather than repeating the arithmetic, so room list, booking page, Booking
 * List and voucher all show one date.
 *
 * Deliberately NOT the earliest cancellation-policy fromDate: those are
 * derived display rows, and for inhouse they do not reproduce this value.
 */
export const resolveInhouseDeadline = (checkInDate, maxCancellationNights) => {
  if (maxCancellationNights == null) return null;
  const cin = parseSupplierDate(checkInDate);
  if (!cin) return null;
  const deadline = new Date(cin);
  deadline.setDate(
    deadline.getDate()
      - Number(maxCancellationNights || 0)
      - INHOUSE_DEADLINE_BUFFER_DAYS,
  );
  deadline.setHours(0, 0, 0, 0);
  return deadline;
};

/**
 * Red deadline line for a room-list rate card.
 *
 * Pass `deadline` to render an already-resolved cut-off (inhouse does this,
 * because its deadline comes from the hotel's policy rather than the rate);
 * otherwise it is resolved from the rate as described above.
 *
 * Renders "Non-refundable — no free cancellation" when the rate is
 * non-refundable OR carries no usable date — an empty slot would otherwise
 * read as "we don't know".
 */
export const RateDeadlinePill = ({
  rate,
  fallbackPolicies,
  deadline: deadlineOverride,
  timeLabel = DEADLINE_TIME_EOD,
}) => {
  const info = isNonRefundable(rate?.nonRefundable)
    ? null
    : deadlineOverride
      ? { date: deadlineOverride, source: "hotel policy", raw: "" }
      : resolveDeadlineInfo(rate, fallbackPolicies);

  if (!info?.date) {
    return (
      <span className="text-danger fw-semibold" title="This rate cannot be cancelled free of charge">
        Non-refundable — no free cancellation
      </span>
    );
  }

  const { date, source, raw } = info;
  const label = `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;

  // Deadline day is already in the past: what the supplier called "flexible"
  // no longer buys the operator a free cancellation. Show the same red styling
  // as the no-free-cancellation case, but a distinct message so the operator
  // sees WHY (time, not the supplier's own rate choice) and the tooltip still
  // carries the original date + source for triage.
  if (isDeadlinePassed(date)) {
    return (
      <span
        className="text-danger fw-semibold"
        title={`Free-cancellation window closed on ${label}, ${timeLabel} — read from ${source}${raw ? `: ${raw}` : ""}`}
      >
        Free-cancellation window has passed ({label})
      </span>
    );
  }

  return (
    <span
      className="text-danger fw-semibold"
      title={`Cancel before this date/time to avoid charges — read from ${source}${raw ? `: ${raw}` : ""}`}
    >
      Deadline Date: {label}, {timeLabel}
    </span>
  );
};

export default RateDeadlinePill;
