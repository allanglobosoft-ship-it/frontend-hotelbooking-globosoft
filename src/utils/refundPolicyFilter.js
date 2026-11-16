/**
 * Refund Policy sidebar filter for the Long Stay, Last Minute and Day Stay
 * results pages — the same three boxes and the same strict rule as
 * /new-booking/hotel (utils/hotelResultFilters.js): with a box ticked, only a
 * hotel known to have a rate of that kind stays; a hotel whose refund terms are
 * unknown is hidden too.
 *
 * Those three searches return no refund info, and their search code is left
 * exactly as it is. Instead each hotel's labels are read the way its own room
 * list reads them, so a hotel kept by the filter shows that label on its rooms:
 *   Long Stay   — /api/longStayContract?hotelId=…  (LongStayRoomList: longStayLabel)
 *   Last Minute — the rooms the search already sent (LastMinuteRoomList: isRateNonRefundable)
 *   Day Stay    — /api/day-stay-contract/rooms-search (DayStayRoomList: rate.nonRefundable)
 * Supplier hotels use the flags /api/hotel-search sent for them.
 *
 * The rules below are copies of the room-list rules named above. If a room
 * list's rule changes, change the copy here too.
 */
import axiosInstance from "../components/AxiosInstance";
import {
  REFUND_FLEXIBLE,
  REFUND_PARTIAL,
  REFUND_NON_REFUNDABLE,
  uaeToday,
} from "./refundLabel";

/** No box ticked. */
export const NO_REFUND_POLICY = {
  refundable: false,
  partial: false,
  nonRefundable: false,
};

/** True while any Refund Policy box is ticked. */
export const isRefundPolicyActive = (policy) =>
  !!(policy?.refundable || policy?.partial || policy?.nonRefundable);

/**
 * { hasRefundable, hasPartial, hasNonRefundable } from every label a hotel's
 * room list would show. Every rate was read, so a label not seen is false.
 * Null when there is no rate at all (unknown).
 */
export const refundFlagsOfLabels = (labels) => {
  const list = (labels || []).filter(Boolean);
  if (list.length === 0) return null;
  return {
    hasRefundable: list.includes(REFUND_FLEXIBLE),
    hasPartial: list.includes(REFUND_PARTIAL),
    hasNonRefundable: list.includes(REFUND_NON_REFUNDABLE),
  };
};

/** The flags a supplier row carries from /api/hotel-search. Null = unknown. */
export const supplierRefundFlags = (row) => {
  if (
    row?.hasRefundable == null &&
    row?.hasPartial == null &&
    row?.hasNonRefundable == null
  ) {
    return null;
  }
  return {
    hasRefundable: row.hasRefundable ?? null,
    hasPartial: row.hasPartial ?? null,
    hasNonRefundable: row.hasNonRefundable ?? null,
  };
};

/**
 * Strict match, as on /new-booking/hotel: true only when the flag for the
 * ticked box is true. No box ticked lets every hotel through.
 */
export const refundPolicyMatches = (policy, flags) => {
  if (!isRefundPolicyActive(policy)) return true;
  if (!flags) return false;
  if (policy.refundable) return flags.hasRefundable === true;
  if (policy.partial) return flags.hasPartial === true;
  return flags.hasNonRefundable === true;
};

// ── Long Stay ────────────────────────────────────────────────────────────

/** Copy of LongStayRoomList's longStayLabel. */
const longStayRoomLabel = (refundable, contract) => {
  if (!refundable) return REFUND_NON_REFUNDABLE;
  const charged = (contract?.cancellationPolicy || []).some(
    (row) => Number(row?.value) > 0,
  );
  return charged ? REFUND_PARTIAL : REFUND_FLEXIBLE;
};

/**
 * Flags from a hotel's long-stay contracts: the live contracts covering the
 * whole stay (the same contracts LongStayRoomList lists), every room of each.
 */
export const longStayRefundFlags = (contracts, checkInDate, checkOutDate) => {
  const cIn = new Date(checkInDate);
  const cOut = new Date(checkOutDate);
  const valid = (contracts || []).filter(
    (c) =>
      c?.isLive &&
      new Date(c.validityFrom) <= cIn &&
      new Date(c.validityTo) >= cOut,
  );
  return refundFlagsOfLabels(
    valid.flatMap((c) =>
      (c.rooms || []).map((r) => longStayRoomLabel(r?.refundable, c)),
    ),
  );
};

/** The same contract read LongStayRoomList makes for the hotel. */
export const fetchLongStayRefundFlags = async (
  hotelId,
  checkInDate,
  checkOutDate,
) => {
  const res = await axiosInstance.get(
    `/api/longStayContract?hotelId=${hotelId}&page=0&size=50`,
  );
  return longStayRefundFlags(res?.data?.content, checkInDate, checkOutDate);
};

// ── Last Minute ──────────────────────────────────────────────────────────

/** Copy of LastMinuteRoomList's isRateNonRefundable. */
const isLastMinuteRateNonRefundable = (rate, checkInDate) => {
  if (rate?.refundable !== true) return true;
  const days = (rate?.cancellationPolicies || [])
    .map((p) => Number(p?.daysBeforeArrival))
    .filter((n) => Number.isFinite(n));
  if (days.length === 0) return false;
  const cin = new Date(checkInDate);
  if (isNaN(cin.getTime())) return false;
  const deadline = new Date(cin);
  deadline.setDate(deadline.getDate() - Math.max(...days));
  deadline.setHours(0, 0, 0, 0);
  return uaeToday() > deadline;
};

/** Flags from the rooms a Last Minute search returned for an inhouse hotel. */
export const lastMinuteRefundFlags = (hotel, checkInDate) =>
  refundFlagsOfLabels(
    (hotel?.rooms || []).map((room) =>
      isLastMinuteRateNonRefundable(room, checkInDate)
        ? REFUND_NON_REFUNDABLE
        : REFUND_FLEXIBLE,
    ),
  );

// ── Day Stay ─────────────────────────────────────────────────────────────

/** Flags from a /api/day-stay-contract/rooms-search reply, read as DayStayRoomList does. */
export const dayStayRefundFlags = (data) => {
  const labels = [];
  (data?.hotels || []).forEach((h) =>
    (h?.roomCategories || []).forEach((cat) =>
      (cat?.availableRates || []).forEach((r) =>
        labels.push(
          r?.nonRefundable === true ||
            (r?.nonRefundable === undefined && r?.refundable === false)
            ? REFUND_NON_REFUNDABLE
            : REFUND_FLEXIBLE,
        ),
      ),
    ),
  );
  return refundFlagsOfLabels(labels);
};

/** The same room search DayStayRoomList makes for the hotel (same body). */
export const fetchDayStayRefundFlags = async (body) => {
  const res = await axiosInstance.post(
    "/api/day-stay-contract/rooms-search",
    body,
  );
  return dayStayRefundFlags(res?.data);
};
