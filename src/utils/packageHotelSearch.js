import axiosInstance from "../components/AxiosInstance";
import {
  CHANNEL_OPTIONS,
  buildApiSearchPayload,
  apiIdForApiType,
} from "./lastMinuteApiHotels";

/**
 * Hotels for the Build Your Own Package v2 flow
 * (/new-booking/make-your-own-package-v2 → .../search).
 *
 * The page used to list in-house hotels only: /api/makeYourOwnPackageV2/hotel/search
 * calls the in-house search and nothing else. This runs the supplier search the
 * normal hotel page uses instead — POST /api/hotel-search/search, then
 * GET /api/hotel-search/results/{searchId} — once per destination city. So:
 *
 *   - Which suppliers are asked is decided by the backend, exactly as on
 *     /new-booking/hotel: agent.api.mapping, the agent's API exclusions, the
 *     company allow-list and the admin on/off toggle. Nothing here names a
 *     supplier, so a supplier switched off there is not asked here either.
 *   - Every supplier applies the selected agent's markup (AgentMarkupService) to
 *     its own rates before they reach Redis. Every price here already includes
 *     it, and nothing on the frontend adds markup, so a refetch, a filter change
 *     or a re-search can never apply it twice.
 *   - A hotel sold by several suppliers (hotel_mapping) comes back as one card
 *     at its cheapest price; its room list shows every supplier's rooms.
 *
 * The in-house hotels come from the same search's in-house leg (the same
 * InhouseHotelSearchApiCaller the old endpoint called), so they are not lost.
 */

/** Hotels read per city and poll. /results pages server-side; this page filters
 *  and sorts client-side, so it asks for everything at once (as Last Minute does). */
const MAX_HOTELS_PER_CITY = 1000;

/** A search's hotels stay in Redis for 5 minutes after the last supplier wrote
 *  (ResultRepository). Older than this and the page searches again rather than
 *  reading a list that may have expired. */
export const PACKAGE_HOTEL_SEARCH_FRESH_MS = 4 * 60 * 1000;

const DEFAULT_HOTEL_IMAGE =
  "https://b2b.choosenfly.com/assets/details/profilepic/hotel/hoteldefault.jpg";

/** Same image rule the page used for its in-house hotels. */
export function ensureHotelImage(imageUrl) {
  if (!imageUrl) return DEFAULT_HOTEL_IMAGE;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  if (typeof imageUrl === "string") {
    const fileName = imageUrl.split(/[/\\]/).pop();
    if (fileName) return `https://b2b.choosenfly.com/assets/details/profilepic/hotel/${fileName}`;
  }
  return DEFAULT_HOTEL_IMAGE;
}

/** Check-out date ("YYYY-MM-DD") for a check-in date and a number of nights. */
export function packageCheckOut(checkIn, nights) {
  if (!checkIn || !nights) return "";
  const d = new Date(checkIn);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + parseInt(nights, 10));
  return d.toISOString().split("T")[0];
}

/**
 * The itinerary's destination cities, once each and in itinerary order. Each
 * keeps its own country, so a two-country trip searches each city in its country.
 *
 * @returns {Array<{cityId: string, cityLabel: string, countryId: string}>}
 */
export function packageHotelLegs({ itinerary, destination } = {}) {
  const legs = [];
  const seen = new Set();
  const add = (dest) => {
    const id = dest?.value;
    if (id === undefined || id === null || id === "") return;
    const cityId = String(id);
    if (seen.has(cityId)) return;
    seen.add(cityId);
    legs.push({
      cityId,
      cityLabel: (dest?.label || "").split(",")[0].trim(),
      countryId: dest?.countryId != null ? String(dest.countryId) : "",
    });
  };
  (Array.isArray(itinerary) ? itinerary : []).forEach((it) => add(it?.selectedDestination));
  if (legs.length === 0) add(destination);
  return legs;
}

/**
 * Start one supplier search per city.
 *
 * @returns {Promise<{startedAt: number, agentId: string|number, searches: Array<{cityId, cityLabel, searchId}>}>}
 *          A city whose search could not be started is left out (and logged), so the
 *          other cities still list their hotels. `searches` is empty when none started.
 */
export async function startPackageHotelSearches({
  legs,
  nationalityId,
  nationalityCode,
  checkIn,
  checkOut,
  rooms,
  agentId,
}) {
  const startedAt = Date.now();
  const started = await Promise.all(
    (legs || []).map(async (leg) => {
      try {
        const payload = buildApiSearchPayload({
          nationalityId,
          nationalityCode,
          destinationCityId: Number(leg.cityId),
          destinationCountryId: leg.countryId ? Number(leg.countryId) : 0,
          checkIn,
          checkOut,
          rooms,
          agentId,
        });
        const res = await axiosInstance.post("/api/hotel-search/search", payload);
        const searchId = res?.data?.searchId || null;
        if (!searchId) {
          console.warn(`Package hotels: no searchId for city ${leg.cityId}; skipping it.`);
          return null;
        }
        return { cityId: leg.cityId, cityLabel: leg.cityLabel, searchId };
      } catch (err) {
        console.warn(`Package hotels: could not start the search for city ${leg.cityId}.`, err);
        return null;
      }
    }),
  );
  return { startedAt, agentId, searches: started.filter(Boolean) };
}

/**
 * One results card from /api/hotel-search/results as a row of the package page.
 * Returns null for a hotel that has no room list (no apiId), since its rooms can
 * be neither priced nor added to the package.
 */
export function toPackageHotelRow(hotel, search) {
  if (!hotel) return null;
  // Agent-side logins get no apiType (SupplierVisibility); apiId is always there.
  const apiType = hotel.apiType ? String(hotel.apiType).toUpperCase() : "";
  const apiId = Number(hotel.apiId) || apiIdForApiType(apiType);
  if (!apiId) return null;
  const hotelCode = hotel.hotelCode == null ? "" : String(hotel.hotelCode);
  const rate = hotel.baseRate == null ? null : Number(hotel.baseRate);
  const price = rate > 0 ? rate : null;
  // cardKey is the card's identity across polls (it does not change when another
  // supplier becomes the cheapest), so an open room list stays open.
  const key = hotel.cardKey || `${apiType || apiId}-${hotelCode}`;
  return {
    id: `${search.searchId}-${key}`,
    searchId: search.searchId,
    hotelCode: hotelCode || null,
    apiId,
    apiType: apiType || null,
    // Channel = the supplier whose price the card shows. Empty when the login
    // may not see supplier names — never guessed as "inhouse".
    channelType: apiType.toLowerCase(),
    supplierCount: hotel.supplierCount || 1,
    name: hotel.hotelName || "Unknown Hotel",
    address: hotel.hotelAddress || "",
    // The city this search was for, so the multi-city filter is exact even when
    // a supplier reports its own city code.
    cityId: search.cityId,
    city: hotel.cityName || search.cityLabel || "",
    // AED, the agent's markup included (applied by the supplier's search caller).
    price,
    badge: price ? "Rate Available" : "Rate Unavailable",
    image: ensureHotelImage(hotel.hotelImage),
    rating: hotel.starRating || 0,
    hotelType: "hotel",
  };
}

/**
 * Read every city's current results and merge them.
 *
 * @param {Array}  searches
 * @param {object} opts
 * @param {string|number} opts.agentId
 * @param {string} [opts.apiType]  comma-separated supplier codes (Channel filter);
 *                                  the backend filters BEFORE merging mapped hotels,
 *                                  so a hotel stays listed under every supplier that
 *                                  sells it, at that supplier's price
 * @param {number} [opts.size]
 * @returns {Promise<{rows: Array, total: number, completed: boolean, liveCodes: string[]}>}
 *          completed = every city's search has heard from every supplier; liveCodes =
 *          the lower-cased suppliers with at least one hotel in the search, from the
 *          backend's channelCounts (counted over the whole result set BEFORE the
 *          apiType filter, so ticking one channel never turns the others OFF). Only
 *          logins that may see suppliers get channelCounts.
 */
export async function fetchPackageHotels(searches, { agentId, apiType, size = MAX_HOTELS_PER_CITY } = {}) {
  const replies = await Promise.all(
    (searches || []).map(async (search) => {
      try {
        const res = await axiosInstance.get(`/api/hotel-search/results/${search.searchId}`, {
          params: {
            agentId,
            page: 0,
            size,
            sortBy: "baseRate",
            sortOrder: "asc",
            apiType: apiType || undefined,
          },
        });
        return { search, data: res?.data || null };
      } catch (err) {
        console.warn(`Package hotels: results for city ${search.cityId} failed; will retry.`, err);
        return { search, data: null };
      }
    }),
  );

  const rows = [];
  const liveCodes = new Set();
  let total = 0;
  let completed = replies.length > 0;
  replies.forEach(({ search, data }) => {
    if (!data) {
      completed = false;
      return;
    }
    total += Number(data.totalResults) || 0;
    if (data.finalStatus !== "COMPLETED") completed = false;
    if (data.channelCounts && typeof data.channelCounts === "object") {
      Object.entries(data.channelCounts).forEach(([code, n]) => {
        if (Number(n) > 0) liveCodes.add(String(code).toLowerCase());
      });
    }
    (Array.isArray(data.result) ? data.result : []).forEach((hotel) => {
      const row = toPackageHotelRow(hotel, search);
      if (row) rows.push(row);
    });
  });
  return { rows, total, completed, liveCodes: Array.from(liveCodes) };
}

/**
 * Rows of the Channel filter, exactly as /new-booking/hotel builds them: the
 * same channel list (CHANNEL_OPTIONS — same order and labels), narrowed to the
 * suppliers super_admin has registered for the caller's company (the rows of
 * /admin/api-access) via /api/hotel-search/my-allowed-suppliers. An
 * unrestricted caller (no company, no allow-list) or any error lists every
 * channel, the same fail-open rule the hotel page and the backend use. Each row
 * is then badged LIVE/OFF by whether that supplier has hotels in the results.
 *
 * @returns {Promise<Array<{value: string, label: string}>>}
 */
export async function fetchChannelFilterRows() {
  return channelRowsFor(await fetchRegisteredSuppliers());
}

/** The hotel Channel rows for a registered-supplier set (null = unrestricted). */
export function channelRowsFor(registered) {
  if (!registered) return CHANNEL_OPTIONS;
  return CHANNEL_OPTIONS.filter((o) => registered.has(o.value));
}

/**
 * Supplier codes super_admin has registered for the caller's company (the rows
 * of /admin/api-access), lower-cased, from /api/hotel-search/my-allowed-suppliers
 * — the call /new-booking/hotel and /new-booking/cab both use. null means
 * unrestricted (no company or no allow-list) or the call failed: list every
 * channel, the same fail-open rule those pages and the backend apply.
 *
 * @returns {Promise<Set<string>|null>}
 */
export async function fetchRegisteredSuppliers() {
  try {
    const res = await axiosInstance.get("/api/hotel-search/my-allowed-suppliers");
    if (res?.data?.unrestricted !== false) return null;
    return new Set(
      (Array.isArray(res?.data?.registered) ? res.data.registered : []).map((c) =>
        String(c || "").toLowerCase(),
      ),
    );
  } catch (err) {
    console.warn("Package: could not read the registered channels; listing all.", err);
    return null;
  }
}

/**
 * The price a room rate is added to the package at, and the same figure before
 * markup. Same rule as the supplier room list (ExternalApiRoomList.displayTotalOf):
 * a one-room search uses the rate × rooms total, a multi-room search the rate's
 * total. Every supplier fills both, with and without the agent's markup.
 */
export function packageRateTotals(rate, roomCount) {
  const multiRoom = Number(roomCount) > 1;
  const selling = Number(
    multiRoom
      ? rate?.totalRate || 0
      : rate?.roomRateBasedOnRoomCount || rate?.totalRate || 0,
  ) || 0;
  const withoutMarkup = Number(
    multiRoom
      ? rate?.totalRateWithoutMarkup
      : rate?.roomRateBasedOnRoomCount_WithoutMarkup || rate?.totalRateWithoutMarkup,
  );
  return {
    selling,
    withoutMarkup: Number.isFinite(withoutMarkup) && withoutMarkup > 0 ? withoutMarkup : selling,
  };
}
