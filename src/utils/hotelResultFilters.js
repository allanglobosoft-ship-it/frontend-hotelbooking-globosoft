/**
 * The hotel search's result filters in one place, so the results list and the
 * map always show the same hotels.
 *
 * The server narrows by star rating, channel, refund policy and budget
 * (resultsQueryParams). The page then applies those checks again, plus the ones
 * only it can make (hotel name, hotel type, deals and 24-hour check-in), with
 * filterHotelResults. Both functions take the same `filters` object, built by
 * the page from its filter state:
 *
 *   nameQuery      — the Hotel Name box, matched word by word
 *   starRating     — a number, or null for all stars
 *   hotelTypes     — ticked Hotel Type values ("hotel", …)
 *   channelTypes   — ticked Channel values ("inhouse", "grn", …); admins only
 *   refundPolicy   — "refundable" | "partial" | "nonRefundable" | undefined
 *   minPrice       — AED, inclusive, or undefined for no lower limit
 *   maxPrice       — AED, inclusive, or undefined for no upper limit
 *   deals          — ticked Available Deals values ("lastMinute", …)
 *   twentyFourHour — true on the 24 Hour Check-In search
 *   sortBy         — "priceAsc" | "priceDesc" | another server sort key
 */

/**
 * The hotel's numeric id, the key of the feature-flag map. A row's own hotelId
 * wins; otherwise the digits at the end of hotelCode ("IN5" → "5") or id.
 */
export function hotelNumericId(hotel) {
  if (hotel?.hotelId != null) return String(hotel.hotelId);
  const raw = String(hotel?.hotelCode || hotel?.id || "");
  const m = raw.match(/(\d+)$/);
  return m ? m[1] : null;
}

/** The 24-hour probe's key: digits at the end of hotelCode only. */
function twentyFourHourKey(hotel) {
  const m = String(hotel?.hotelCode || "").match(/(\d+)$/);
  return m ? m[1] : null;
}

/** The deal labels the feature-flag map holds for a hotel ([] when none). */
export function featureLabelsOf(hotel, featureFlagsMap) {
  const id = hotelNumericId(hotel);
  if (!id) return [];
  const flags = featureFlagsMap?.[id];
  return Array.isArray(flags?.features) ? flags.features : [];
}

/** Available Deals value → the feature labels that satisfy it. */
const DEAL_LABELS = {
  longStay: ["Long Stay"],
  twentyFourHour: ["24 Hour Check-In"],
  lastMinute: ["Last Minute"],
  dayStay: ["Day Stay"],
  meetingSpace: ["Meeting & Space"],
  govEmployee: ["Govt Employee Discount", "Govt Employee"],
  studentDiscount: ["Student Discount"],
  seniorCitizen: ["Senior Citizen"],
};

/** Available Deals: true when the hotel matches any ticked deal. */
function matchesAnyDeal(hotel, deals, featureFlagsMap) {
  const labels = featureLabelsOf(hotel, featureFlagsMap).map((f) =>
    String(f).toLowerCase(),
  );
  return deals.some((deal) => {
    if (deal === "flashSale") return labels.length > 0;
    if (deal === "destinationSales") return hotel.hasDestinationSales === true;
    return (DEAL_LABELS[deal] || []).some((label) =>
      labels.includes(label.toLowerCase()),
    );
  });
}

/** The AED price as a number, or NaN when there is none (Number(null) is 0). */
function priceOf(hotel) {
  const p = hotel?.price;
  return p == null || p === "" ? NaN : Number(p);
}

/** Rows without a numeric price sink to the bottom in either direction. */
function sortByPrice(results, direction) {
  return [...results].sort((a, b) => {
    const pa = priceOf(a);
    const pb = priceOf(b);
    const aMissing = !Number.isFinite(pa);
    const bMissing = !Number.isFinite(pb);
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;
    return (pa - pb) * direction;
  });
}

/**
 * The hotels that pass every filter on the results page, in the order the
 * list shows them.
 *
 * lookups.featureFlagsMap — /api/hotel-feature-flags reply, keyed by numeric id
 * lookups.twentyFourHourMap — /api/24-hour-checkin/probe-bulk reply, same key
 *
 * On the 24-hour search only eligible hotels stay, at the uplifted price.
 */
export function filterHotelResults(results, filters = {}, lookups = {}) {
  const featureFlagsMap = lookups.featureFlagsMap || {};
  const twentyFourHourMap = lookups.twentyFourHourMap || {};
  let out = Array.isArray(results) ? results : [];

  // Hotel name: every word must appear somewhere in the name, any case, so
  // "smart hyde" finds "Smart Hyde Park Inn".
  const tokens = String(filters.nameQuery || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length > 0) {
    out = out.filter((hotel) => {
      const name = String(hotel?.name || "").toLowerCase();
      return tokens.every((t) => name.includes(t));
    });
  }

  if (filters.starRating != null && filters.starRating !== "") {
    out = out.filter(
      (hotel) => Number(hotel.rating) === Number(filters.starRating),
    );
  }

  if (filters.hotelTypes?.length > 0) {
    out = out.filter((hotel) => filters.hotelTypes.includes(hotel.hotelType));
  }

  if (filters.channelTypes?.length > 0) {
    out = out.filter((hotel) =>
      filters.channelTypes.includes(hotel.channelType),
    );
  }

  // Refund Policy is strict: only a hotel the backend confirms has a rate of
  // that kind (flag === true). Unknown (null) is hidden too. Same rule as
  // HotelSearchService.applyRefundPolicyFilter.
  if (filters.refundPolicy === "refundable") {
    out = out.filter((hotel) => hotel.hasRefundable === true);
  } else if (filters.refundPolicy === "partial") {
    out = out.filter((hotel) => hotel.hasPartial === true);
  } else if (filters.refundPolicy === "nonRefundable") {
    out = out.filter((hotel) => hotel.hasNonRefundable === true);
  }

  // Budget: the same inclusive AED bounds /results applies. A hotel without a
  // price drops out, as on the server (Number(null) would read as 0).
  const { minPrice, maxPrice } = filters;
  if (minPrice !== undefined || maxPrice !== undefined) {
    out = out.filter((hotel) => {
      const p = priceOf(hotel);
      return (
        Number.isFinite(p) &&
        (minPrice === undefined || p >= minPrice) &&
        (maxPrice === undefined || p <= maxPrice)
      );
    });
  }

  if (filters.deals?.length > 0) {
    out = out.filter((hotel) =>
      matchesAnyDeal(hotel, filters.deals, featureFlagsMap),
    );
  }

  // 24 Hour Check-In: only eligible hotels, at the uplifted price. The card
  // shows displayPrice, so the uplift is converted once with the backend's
  // factor (the same maths as RoomList).
  if (filters.twentyFourHour) {
    out = out
      .filter((hotel) => twentyFourHourMap[twentyFourHourKey(hotel)]?.eligible)
      .map((hotel) => {
        const meta = twentyFourHourMap[twentyFourHourKey(hotel)];
        const pct = Number(meta?.percentage || 0);
        const base = Number(hotel.price || 0);
        const uplifted = +(base * (1 + pct / 100)).toFixed(2);
        const factor =
          Number(hotel.displayFactor) > 0 ? Number(hotel.displayFactor) : 1;
        const displayPrice =
          pct > 0
            ? Math.round(uplifted * factor * 100 + 1e-9) / 100
            : hotel.displayPrice;
        return {
          ...hotel,
          price: uplifted,
          displayPrice,
          _twentyFourHourPercentage: pct,
        };
      });
  }

  // The server has sorted already; a stable sort keeps its order for equal
  // prices. Other sort keys keep the incoming order.
  if (filters.sortBy === "priceAsc") out = sortByPrice(out, 1);
  else if (filters.sortBy === "priceDesc") out = sortByPrice(out, -1);

  return out;
}

/**
 * Query parameters for GET /api/hotel-search/results/{searchId}: the filters
 * the server applies, plus the page wanted. `size` is what the backend reads;
 * `pageSize` rides along as the page has always sent it.
 */
export function resultsQueryParams(
  filters = {},
  { agentId, page = 0, size, pageSize, displayCurrencyCode } = {},
) {
  const sortBy = filters.sortBy || "priceAsc";
  const params = {
    agentId,
    page,
    pageSize,
    size,
    sortBy: sortBy === "priceAsc" || sortBy === "priceDesc" ? "baseRate" : sortBy,
    sortOrder:
      sortBy === "priceAsc" || sortBy === "ratingAsc" || sortBy === "nameAsc"
        ? "asc"
        : "desc",
    starRating:
      filters.starRating != null && filters.starRating !== ""
        ? filters.starRating
        : undefined,
    apiType:
      (filters.channelTypes || []).map((c) => String(c).toUpperCase()).join(",") ||
      undefined,
    refundPolicy: filters.refundPolicy,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
  };
  if (displayCurrencyCode) params.displayCurrencyCode = displayCurrencyCode;
  return params;
}

/**
 * Whether the list must load every page of the search at once. The server
 * can't match a hotel name or a deal (deal flags come from
 * /api/hotel-feature-flags), so the page filters those itself. Filtering only
 * the 10 hotels on screen would miss matches on later pages, and the list
 * would say "0 entries" while the map shows dozens.
 */
export function needsWholeResultSet({ nameQuery, deals } = {}) {
  return String(nameQuery || "").trim() !== "" || (deals?.length || 0) > 0;
}

/**
 * Comma-joined id lists of at most `size` ids each, for GET requests whose URL
 * must stay short (/api/hotel-feature-flags?ids=…). [] for none.
 */
export function idBatches(ids, size = 150) {
  const list = (Array.isArray(ids) ? ids : String(ids || "").split(","))
    .map((id) => String(id).trim())
    .filter(Boolean);
  const out = [];
  for (let i = 0; i < list.length; i += size) {
    out.push(list.slice(i, i + size).join(","));
  }
  return out;
}

/**
 * A short text that changes only when the user changes a filter. The map
 * zooms to fit the hotels again when it does, and not when more hotels arrive
 * for the same filters.
 */
export function filtersKey(filters = {}) {
  return JSON.stringify([
    String(filters.nameQuery || "").trim().toLowerCase(),
    filters.starRating ?? null,
    [...(filters.hotelTypes || [])].sort(),
    [...(filters.channelTypes || [])].sort(),
    filters.refundPolicy ?? null,
    filters.minPrice ?? null,
    filters.maxPrice ?? null,
    [...(filters.deals || [])].sort(),
    !!filters.twentyFourHour,
  ]);
}
