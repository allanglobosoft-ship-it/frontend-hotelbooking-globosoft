import axiosInstance from "../components/AxiosInstance";

/**
 * Supplier-API hotels for the Last Minute flow (/new-booking/last-minute-booking).
 *
 * Last Minute has always been inhouse-only: LastMinuteBookingPage hits
 * /api/last-minute-hotel-search/search, which reads hotel_last_minute_contract_rate
 * and nothing else. This module adds a SECOND, independent source — the same
 * supplier fan-out the normal hotel search uses — so both can be shown together.
 *
 * Deliberately self-contained: it does NOT import from HotelSearch.jsx. That
 * page owns the normal hotel flow and must not be perturbed, so the small
 * amount of post-and-poll logic is duplicated here rather than extracted and
 * shared. The cost is ~40 lines; the benefit is that this feature cannot
 * regress /new-booking/hotel.
 *
 * Everything here is gated by hbs.last-minute.api-hotels.enabled. The backend
 * enforces the same flag at booking time (see BookingFlagStamper), so this is
 * a UX gate, not the security boundary.
 */

/** Prefix that makes an API row's synthetic id impossible to confuse with a DB id. */
const API_ID_PREFIX = "API";

/**
 * Suppliers Last Minute never lists, even though the fan-out returns them:
 *   INHOUSE — the fan-out's inhouse leg carries NORMAL contract rates. Last
 *             Minute already lists its own last-minute contract rates, so these
 *             would be duplicate cards at the wrong price, and an unmapped one
 *             opens an empty room list (ExternalApiRoomList drops the inhouse
 *             block in Last Minute mode).
 *   JUNIPER — searchable, but no room-list search exists for it yet
 *             (/api/hotel-rooms/search has no apiId 17), so its hotels could
 *             not be opened. Remove it from here once that lands.
 * The backend holds the same list and drops them BEFORE its mapped-hotel dedup
 * when /results is asked with forPage=last-minute, so the request names no
 * supplier. Re-checked client-side for an older backend.
 */
const EXCLUDED_API_TYPES = ["INHOUSE", "JUNIPER"];

/**
 * Upper bound on supplier hotels fetched per poll. /results paginates
 * server-side (default size 10); Last Minute filters and sorts client-side,
 * so it asks for every hotel in one page.
 */
const MAX_API_HOTELS = 1000;

function isExcludedApiType(apiType) {
  return EXCLUDED_API_TYPES.includes(String(apiType || "").toUpperCase());
}

/**
 * Read the server-side kill switch.
 *
 * Fails CLOSED: any error is treated as "disabled", so a backend that is old,
 * down, or returning junk leaves Last Minute in its original inhouse-only
 * state rather than half-enabling a feature.
 *
 * @returns {Promise<boolean>}
 */
export async function fetchApiHotelsEnabled() {
  try {
    const res = await axiosInstance.get("/api/last-minute-hotel-search/api-hotels-enabled");
    return res?.data?.enabled === true;
  } catch (err) {
    console.warn("Last Minute: could not read api-hotels-enabled, treating as disabled.", err);
    return false;
  }
}

/**
 * Build the /api/hotel-search/search payload from the Last Minute page's own
 * search state. Mirrors the field names the fan-out expects.
 *
 * @param {object} ctx
 * @param {number|string} ctx.nationalityId
 * @param {string}        ctx.nationalityCode
 * @param {number|string} ctx.destinationCityId
 * @param {number|string} ctx.destinationCountryId
 * @param {string}        ctx.checkIn   "YYYY-MM-DD"
 * @param {string}        ctx.checkOut  "YYYY-MM-DD"
 * @param {Array}         ctx.rooms     the page's rooms[] state
 * @param {number|string} ctx.agentId
 */
export function buildApiSearchPayload(ctx) {
  const rooms = Array.isArray(ctx.rooms) && ctx.rooms.length ? ctx.rooms : [{ adults: 1, children: 0 }];

  return {
    nationalityId: ctx.nationalityId,
    nationalityCode: ctx.nationalityCode,
    destinationCityId: ctx.destinationCityId,
    destinationCountryId: ctx.destinationCountryId,
    checkIn: ctx.checkIn,
    checkOut: ctx.checkOut,
    noOfRooms: String(rooms.length),
    roomConfigurations: rooms.map((room, index) => ({
      roomNo: index + 1,
      adultCount: String(room.adults || 1),
      childCount: String(room.children || 0),
      childAges: room.childAges?.length ? room.childAges : [0],
      adultAges: room.adultAges?.length ? room.adultAges : [25],
    })),
    agentId: ctx.agentId || 1,
  };
}

/**
 * Map one HotelSearchResult from the fan-out onto the shape
 * LastMinuteBookingPage's result list renders.
 *
 * The two sources have genuinely different identity models, and squashing that
 * difference is what makes the merged list safe to render:
 *
 *   inhouse → hotelId is a real hotel table PK (number)
 *   api     → hotelCode is a supplier-specific string ("12345", "test_hotel")
 *
 * A supplier code can be purely numeric, so an API row must never be given a
 * bare number as its hotelId — downstream code (and React keys) would then be
 * unable to tell it apart from inhouse hotel 12345. Hence the "API-<type>-"
 * prefix, and hence `source` being carried explicitly rather than inferred.
 */
export function mapApiHotelToLastMinuteRow(hotel, searchId) {
  const apiType = String(hotel.apiType || "").toUpperCase();
  const hotelCode = hotel.hotelCode == null ? "" : String(hotel.hotelCode);

  return {
    // ── identity ──
    source: "API",
    apiType,
    hotelCode,
    searchId,
    // What opens the room list. Agents' replies carry this and no apiType.
    apiId: hotel.apiId || 0,
    hotelId: `${API_ID_PREFIX}-${apiType || hotel.apiId || ""}-${hotelCode}`,

    // ── display fields, matching the inhouse HotelResult shape ──
    hotelName: hotel.hotelName || "Unknown Hotel",
    address: hotel.hotelAddress || "",
    cityName: hotel.cityName || "",
    starRating: hotel.starRating || 0,
    hotelImage: hotel.hotelImage || "",
    categoryName: "",
    fromRate: hotel.baseRate == null ? null : Number(hotel.baseRate),

    // Rooms are fetched on demand by the room-list page via
    // /api/hotelroom/search — the fan-out only returns hotel-level rates.
    rooms: [],

    // No inhouse contract rate exists to compare a supplier rate against, so
    // the "% off" badge is not meaningful for these rows.
    discountPercentage: null,

    latitude: hotel.latitude,
    longitude: hotel.longitude,
    contactNumber: hotel.contactNumber || "",

    // Refund flags the hotel search sent (null = unknown). Read only by the
    // Refund Policy filter (utils/refundPolicyFilter.js).
    hasRefundable: hotel.hasRefundable ?? null,
    hasPartial: hotel.hasPartial ?? null,
    hasNonRefundable: hotel.hasNonRefundable ?? null,
  };
}

/** True for rows produced by this module. */
export function isApiHotel(hotel) {
  return hotel?.source === "API";
}

/**
 * Run the supplier fan-out and stream results back as they arrive.
 *
 * The fan-out is asynchronous: POST returns a searchId, then results
 * accumulate in Redis as each supplier replies. `onPartial` is invoked on
 * every poll tick so the page can render supplier hotels progressively
 * instead of waiting for the slowest one.
 *
 * Two phases, mirroring /new-booking/hotel:
 *   1. For timeoutMs, fetch the full list every intervalMs.
 *   2. Then, until the backend reports every supplier finished (at most
 *      lateWindowMs more), make a cheap size=1 check every lateIntervalMs and
 *      refetch the full list only when the hotel count moved or the search
 *      completed. Slow suppliers routinely finish after the first 30 s (GRN's
 *      availability calls take 30–40 s for Dubai, and X3/IWTX slow down under
 *      load), so without this phase their hotels never reached the page.
 *
 * Never throws. A supplier-side failure must not take down the inhouse
 * results that are already on screen, so errors are logged and retried until
 * the window closes.
 *
 * @param {object}   payload           from buildApiSearchPayload()
 * @param {function} onPartial         (rows, searchId) => void
 * @param {object}   opts
 * @param {number}   opts.intervalMs      phase-1 poll cadence (default 2000)
 * @param {number}   opts.timeoutMs       phase-1 length (default 30000 — the
 *                                        same window /new-booking/hotel uses)
 * @param {number}   opts.initialDelay wait before first poll (default 2000)
 * @param {number}   opts.lateIntervalMs  phase-2 check cadence (default 4000)
 * @param {number}   opts.lateWindowMs    phase-2 length (default 220000, the search deadline)
 * @param {function} opts.isCancelled     () => boolean; true stops polling
 *                                        (e.g. a newer search started)
 * @param {function} opts.onStatus        (statuses, finalStatus) => void, after
 *                                        every poll — statuses maps lower-cased
 *                                        supplier key → "IN_PROGRESS"/"COMPLETED"
 *                                        (excluded suppliers left out). Drives
 *                                        the page's progress bar.
 * @returns {Promise<{rows: Array, searchId: string|null, failed: boolean,
 *                    completed: boolean}>} completed = every supplier finished
 */
export async function searchApiHotels(payload, onPartial, opts = {}) {
  const {
    intervalMs = 2000,
    timeoutMs = 30000,
    initialDelay = 2000,
    lateIntervalMs = 4000,
    lateWindowMs = 220000,
    isCancelled = () => false,
    onStatus = null,
  } = opts;

  let searchId = null;
  const byId = new Map();

  const snapshot = () => Array.from(byId.values());
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  try {
    const startRes = await axiosInstance.post("/api/hotel-search/search", payload);
    searchId = startRes?.data?.searchId || null;
    if (!searchId) {
      console.warn("Last Minute: fan-out returned no searchId; skipping API hotels.");
      return { rows: [], searchId: null, failed: true, completed: false };
    }

    // `size`, not `pageSize` — /results only reads `size` (default 10), so the
    // old key silently capped Last Minute at the 10 cheapest supplier hotels.
    const params = {
      agentId: payload.agentId,
      page: 0,
      size: MAX_API_HOTELS,
      forPage: "last-minute",
    };
    const startedAt = Date.now();

    const absorb = (data) => {
      const list = Array.isArray(data?.result) ? data.result : [];
      // Each poll returns the FULL current list, so it replaces the previous
      // one. Merging instead would keep stale rows: as more suppliers reply,
      // a mapped hotel's cheapest offer can move to another supplier, which
      // changes its synthetic id and would leave the old card behind.
      byId.clear();
      list.forEach((hotel) => {
        if (isExcludedApiType(hotel.apiType)) return; // older backend fallback
        const row = mapApiHotelToLastMinuteRow(hotel, searchId);
        byId.set(row.hotelId, row);
      });
      if (Number(data?.totalResults) > list.length) {
        console.warn(
          `Last Minute: showing ${list.length} of ${data.totalResults} supplier hotels (MAX_API_HOTELS cap).`,
        );
      }
      if (onPartial) onPartial(snapshot(), searchId);
    };

    const fetchResults = (size) =>
      axiosInstance.get(`/api/hotel-search/results/${searchId}`, {
        params: { ...params, size },
      });

    // Per-supplier progress (the response's `status` map) for the page's
    // progress bar. Excluded suppliers are left out — their hotels never
    // reach the page, so they should not count towards its progress.
    const reportStatus = (data) => {
      if (!onStatus || !data?.status || isCancelled()) return;
      const statuses = {};
      Object.entries(data.status).forEach(([api, status]) => {
        if (!isExcludedApiType(api)) statuses[String(api).toLowerCase()] = status;
      });
      onStatus(statuses, data.finalStatus);
    };

    let completed = false;
    let lastTotal = null;

    // ── Phase 1: full list every intervalMs ──
    await sleep(initialDelay);
    while (!isCancelled()) {
        try {
        const res = await fetchResults(MAX_API_HOTELS);
        if (isCancelled()) break;
        absorb(res.data);
        reportStatus(res.data);
        lastTotal = Number(res.data?.totalResults) || 0;
        if (res.data?.finalStatus === "COMPLETED") {
          completed = true;
          break;
        }
      } catch (err) {
        console.warn("Last Minute: API hotel poll failed; will retry.", err);
      }
      if (Date.now() - startedAt >= timeoutMs) break;
      await sleep(intervalMs);
    }

    // ── Phase 2: late suppliers ──
    const lateStartedAt = Date.now();
    while (!completed && !isCancelled() && Date.now() - lateStartedAt < lateWindowMs) {
      await sleep(lateIntervalMs);
      if (isCancelled()) break;
      try {
        const check = await fetchResults(1);
        const done = check.data?.finalStatus === "COMPLETED";
        const total = Number(check.data?.totalResults) || 0;
        if (done || total !== lastTotal) {
          const res = await fetchResults(MAX_API_HOTELS);
          if (isCancelled()) break;
          absorb(res.data);
          lastTotal = Number(res.data?.totalResults) || 0;
        }
        // Reported after the refetch, so the bar only reaches 100% once the
        // final hotels are already on the page.
        reportStatus(check.data);
        completed = done;
      } catch (err) {
        console.warn("Last Minute: late supplier check failed; will retry.", err);
      }
    }
    if (!completed && !isCancelled()) {
      console.warn("Last Minute: some suppliers never finished; showing what arrived.");
    }

    return { rows: snapshot(), searchId, failed: false, completed };
  } catch (err) {
    console.warn("Last Minute: API hotel search failed; inhouse results are unaffected.", err);
    return { rows: snapshot(), searchId, failed: true, completed: false };
  }
}

/**
 * Supplier apiType → numeric apiId, matching the same table the normal
 * hotel search uses in HotelSearch.jsx (~line 3038). Kept in sync manually
 * because HotelSearch.jsx is the canonical reference for that mapping and
 * touching it is out of scope for this feature — see the "self-contained"
 * note at the top of this file.
 *
 * If a new supplier is added, that supplier's apiId belongs in HotelSearch.jsx
 * FIRST; this map is a mirror.
 */
const API_TYPE_TO_API_ID = {
  JUMEIRAH: 10,
  IWTX: 12,
  X3: 15,
  INHOUSE: 1,
  RATEHAWK: 14,
  DARINA: 16,
  ATHARVA: 3,
  GRN: 20,
  GOGLOBAL: 21,
};

/**
 * Resolve the numeric apiId for a Last Minute API hotel row.
 * Returns 0 when the supplier is unknown — same sentinel HotelSearch.jsx
 * uses, so downstream code (ApiBookingPageForHotels, hotelroom search) sees
 * the exact behaviour it would for a normal-hotel-search row.
 */
export function apiIdForApiType(apiType) {
  if (!apiType) return 0;
  return API_TYPE_TO_API_ID[String(apiType).toUpperCase()] || 0;
}

/**
 * Rows for the Last Minute Channel filter, with the same order and labels as
 * the Channel filter on /new-booking/hotel. Values are the lower-cased
 * apiType the page filters rows by ("inhouse" = the page's own last-minute
 * contract rates). Suppliers in EXCLUDED_API_TYPES are left out — their
 * hotels never reach this page. Also the row list of the Build Your Own
 * Package Channel filter (utils/packageHotelSearch.js).
 */
export const CHANNEL_OPTIONS = [
  { value: "inhouse", label: "Inhouse" },
  { value: "iwtx", label: "Iwtx" },
  { value: "x3", label: "x3" },
  { value: "atharva", label: "Atharva" },
  { value: "jumeirah", label: "Jumeirah" },
  { value: "ratehawk", label: "Ratehawk" },
  { value: "darina", label: "Darina" },
  { value: "grn", label: "GRN" },
  { value: "goglobal", label: "GoGlobal" },
];

/**
 * The channels the caller's company has ENABLED on /admin/api-access, as
 * Channel-filter rows. Reads the same /api/hotel-search/my-allowed-suppliers
 * endpoint the normal hotel search uses, and lists its `codes` — granted by
 * super_admin AND switched on by the admin — so an API switched off there
 * (INHOUSE included) is not offered here at all. The page badges each row
 * LIVE/OFF from the results.
 *
 * Fails open: an unconfigured company, or any error, lists every channel —
 * the same "empty allow-list = no restriction" rule the backend applies.
 *
 * @returns {Promise<Array<{value: string, label: string}>>}
 */
export async function fetchChannelOptions() {
  try {
    const res = await axiosInstance.get("/api/hotel-search/my-allowed-suppliers");
    if (res?.data?.unrestricted !== false) return CHANNEL_OPTIONS;
    const enabled = new Set(
      (Array.isArray(res?.data?.codes) ? res.data.codes : []).map((c) =>
        String(c || "").toLowerCase(),
      ),
    );
    return CHANNEL_OPTIONS.filter((o) => enabled.has(o.value));
  } catch (err) {
    console.warn("Last Minute: could not read enabled channels; listing all.", err);
    return CHANNEL_OPTIONS;
  }
}
