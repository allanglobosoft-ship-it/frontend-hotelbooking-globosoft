/**
 * Hotel search results as they arrive: turning a /api/hotel-search/results reply
 * into cards, reading its progress, and polling until the search has finished.
 * Kept apart from the page so each piece can be tested on its own.
 */

/**
 * How often to ask for the page again, and how long to wait for the server to
 * report the search finished. The server stops waiting for suppliers after
 * app.hotel-search.supplier-timeout-ms (220 s by default), so the ceiling only
 * matters when the server itself can no longer be reached.
 */
export const POLL_INTERVAL_MS = 2000;
export const FIRST_POLL_DELAY_MS = 1000;
export const POLL_CEILING_MS = 270000;
export const MAX_FAILED_POLLS_IN_A_ROW = 5;

const NO_IMAGE = "https://details/assets/details/profilepic/hotel/hoteldefault.jpg";

/**
 * One result card from one row of a reply. The id comes from the server's
 * cardKey, which stays the same when another supplier becomes the cheapest for a
 * mapped hotel, so the card updates in place and the hotel never shows twice.
 *
 * Agents receive no apiType, so channelType is empty for them; apiId is what
 * opens the room list.
 */
export function mapHotelRow(hotel, searchId, index, reply) {
  const key = hotel.cardKey || hotel.hotelCode;
  const factor = Number(reply?.displayCurrencyFactor);
  return {
    id: key ? `${searchId}-${key}` : `${searchId}-h${index + 1}`,
    searchId,
    hotelCode: hotel.hotelCode || null,
    name: hotel.hotelName || "Unknown Hotel",
    address: hotel.hotelAddress || "",
    city: hotel.hotelAddress
      ? hotel.hotelAddress.split(", ").pop() || "Unknown City"
      : "Unknown City",
    price: hotel.baseRate || null,
    // Backend-converted price + code in the agent's display currency (see
    // HotelSearchController.applyDisplayCurrency). The card shows these; `price`
    // (AED) stays the source of truth for sorting and booking payloads.
    displayPrice:
      hotel.displayBaseRate != null ? hotel.displayBaseRate : hotel.baseRate,
    displayCurrencyCode: hotel.displayCurrencyCode || "AED",
    displayFactor: factor > 0 ? factor : 1,
    badge: hotel.baseRate ? "Rate Available" : "Rate Unavailable",
    image: hotel.hotelImage || NO_IMAGE,
    rating: hotel.starRating || 0,
    hotelType: "hotel",
    channelType: hotel.apiType
      ? hotel.apiType.toLowerCase()
      : hotel.apiId
        ? ""
        : "inhouse",
    apiId: hotel.apiId || 0,
    // Refund Policy filter flags: true / false / null (unknown).
    hasRefundable: hotel.hasRefundable ?? null,
    hasNonRefundable: hotel.hasNonRefundable ?? null,
    hasPartial: hotel.hasPartial ?? null,
    // How many suppliers sell this hotel (mapped hotels: best price of all).
    supplierCount: hotel.supplierCount || 1,
    // Surface the backend-computed promotion flag so the "Destination Sales"
    // pill and filter work.
    hasDestinationSales: !!hotel.hasDestinationSales,
    flashSale: !!hotel.flashSale,
    latitude: hotel.latitude,
    longitude: hotel.longitude,
    contactNumber: hotel.contactNumber || "",
  };
}

/** Supplier numbers the room list routes on, for a reply without apiId. */
const ROOM_LIST_API_IDS = {
  jumeirah: 10,
  iwtx: 12,
  x3: 15,
  inhouse: 1,
  ratehawk: 14,
  darina: 16,
  atharva: 3,
  // Room list backend routes 20 to GrnHotelRoomSearchService.
  grn: 20,
  // Room list backend routes 21 to GoGlobalHotelRoomSearchService. Without it
  // the payload fell back to 0 and /api/hotel-rooms/search refused it.
  goglobal: 21,
};

/** The number that opens this card's room list, or 0 when there is none. */
export function roomListApiId(card) {
  return (
    card?.apiId ||
    ROOM_LIST_API_IDS[String(card?.channelType || "").toLowerCase()] ||
    0
  );
}

/**
 * What View Rooms stores as "roomListPayload" for the room list it opens.
 * refundPolicy is the search's Refund Policy value (see refundPolicyOfFilter),
 * so the room list opens with the same box ticked. With no box ticked the key
 * is left out and the room list opens as it always has.
 */
export function roomListHandoff({ payload, meta, currency, refundPolicy }) {
  return refundPolicy
    ? { payload, meta, currency, refundPolicy }
    : { payload, meta, currency };
}

/**
 * The number that opens a student, senior citizen or gov employee result's room
 * list. Agents' replies carry apiId and no apiType. In-house when a reply has
 * neither, as these pages have always done.
 */
export function apiIdOfResult(hotel) {
  return (
    Number(hotel?.apiId) ||
    ROOM_LIST_API_IDS[String(hotel?.apiType || "").toLowerCase()] ||
    1
  );
}

/**
 * Progress from a reply. `reply.progress` holds counts only; `suppliers` is what
 * an admin's reply says about each one. An agent's reply carries neutral labels
 * ("supplier-1"), which are left out so they can never reach the screen.
 *
 * `partial` counts suppliers that answered, but with a batch or page of their
 * answer missing even after a second try. `partialSuppliers` names them; only
 * an admin's reply carries those names.
 */
export function readProgress(reply) {
  const counts = reply?.progress || {};
  const total = Number(counts.total) || 0;
  const answered = Number(counts.answered) || 0;
  const failed = Number(counts.failed) || 0;
  const partial = Number(counts.partial) || 0;
  const suppliers = Object.entries(reply?.status || {})
    .filter(([name]) => !/^supplier-\d+$/.test(name))
    .map(([name, status]) => ({ name, status }));
  const partialSuppliers = Object.entries(reply?.partialSuppliers || {})
    .filter(([name]) => !/^supplier-\d+$/.test(name))
    .map(([name, reason]) => ({ name, reason }));
  return {
    total,
    answered,
    failed,
    partial,
    complete: reply?.finalStatus === "COMPLETED",
    suppliers,
    partialSuppliers,
  };
}

/** Whole percent of suppliers finished. Never above 99 until the search is complete. */
export function progressPercent(progress) {
  if (progress?.complete) return 100;
  const total = Number(progress?.total) || 0;
  if (total <= 0) return 0;
  const finished = (Number(progress.answered) || 0) + (Number(progress.failed) || 0);
  return Math.min(99, Math.round((finished / total) * 100));
}

/**
 * The line under the bar. Names suppliers only when the reply did, which the
 * server does for admins alone.
 */
export function progressMessage(progress, hotelsSoFar) {
  const total = Number(progress?.total) || 0;
  const answered = Number(progress?.answered) || 0;
  const hotels = Number(hotelsSoFar) || 0;
  const hotelsPart =
    hotels > 0 ? ` · ${hotels} ${hotels === 1 ? "hotel" : "hotels"} so far` : "";
  if (total <= 0) return `Asking suppliers${hotelsPart}`;
  return `${answered} of ${total} ${total === 1 ? "supplier" : "suppliers"} answered${hotelsPart}`;
}

/**
 * What to tell the user, once the search has finished, about suppliers that did
 * not answer and suppliers that answered only in part, or null when every
 * supplier answered in full. Names suppliers only when the reply did.
 */
export function incompleteSearchNotice(progress) {
  const failed = Number(progress?.failed) || 0;
  const partial = Number(progress?.partial) || 0;
  if (!progress?.complete || (failed <= 0 && partial <= 0)) return null;
  const parts = [];
  if (failed > 0) {
    const named = (progress.suppliers || [])
      .filter((s) => s.status === "ERROR" || s.status === "TIMEOUT")
      .map(
        (s) =>
          `${s.name.toUpperCase()} (${s.status === "TIMEOUT" ? "timed out" : "failed"})`,
      );
    parts.push(
      named.length > 0
        ? `Did not answer: ${named.join(", ")}.`
        : `${failed} ${failed === 1 ? "supplier" : "suppliers"} did not answer.`,
    );
  }
  if (partial > 0) {
    const named = (progress.partialSuppliers || []).map((s) => s.name.toUpperCase());
    parts.push(
      named.length > 0
        ? `Answered in part, some of their hotels may be missing: ${named.join(", ")}.`
        : `${partial} ${partial === 1 ? "supplier" : "suppliers"} answered in part, so some hotels may be missing.`,
    );
  }
  return `${parts.join(" ")} Showing all the hotels found.`;
}

/**
 * Asks for the current page until the server says the search has finished.
 *
 * fetchPage is called fresh on every tick, so it always asks for the page, sort
 * and filters on screen at that moment. Only one request runs at a time. A failed
 * poll is tried again: one network blip must not end a search that is going well.
 *
 * Resolves to { outcome, reply }, where outcome is one of:
 *   "completed" — the server reported the search finished
 *   "gave-up"   — too many failed polls, or the ceiling passed
 *   "cancelled" — a newer search started, or the page closed
 */
export function pollUntilFinished({
  fetchPage,
  onReply = () => {},
  isCancelled = () => false,
  intervalMs = POLL_INTERVAL_MS,
  firstDelayMs = FIRST_POLL_DELAY_MS,
  ceilingMs = POLL_CEILING_MS,
  maxFailuresInARow = MAX_FAILED_POLLS_IN_A_ROW,
  now = () => Date.now(),
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  return (async () => {
    const startedAt = now();
    let failures = 0;
    let lastReply = null;
    await wait(firstDelayMs);
    for (;;) {
      if (isCancelled()) return { outcome: "cancelled", reply: lastReply };
      try {
        const reply = await fetchPage();
        if (isCancelled()) return { outcome: "cancelled", reply: lastReply };
        failures = 0;
        lastReply = reply;
        onReply(reply);
        if (reply?.finalStatus === "COMPLETED") {
          return { outcome: "completed", reply };
        }
      } catch (err) {
        failures += 1;
        console.warn("Hotel search: poll failed; will retry.", err?.message);
        if (failures >= maxFailuresInARow) {
          return { outcome: "gave-up", reply: lastReply };
        }
      }
      if (now() - startedAt >= ceilingMs) {
        return { outcome: "gave-up", reply: lastReply };
      }
      await wait(intervalMs);
    }
  })();
}
