import axiosInstance from "../components/AxiosInstance";

/**
 * Supplier-API hotels on the Long Stay page (/new-booking/long-stay).
 *
 * Long Stay's own search reads long-stay contracts and nothing else. This adds a
 * second, independent source: the supplier search Last Minute already uses (see
 * lastMinuteApiHotels.js, which this reuses rather than copies). Rooms and
 * booking go through the normal supplier pages (/api-room-list,
 * /api-booking-page-hotels), not the long-stay ones, so the contract pricing and
 * /api/longStayBooking/create are not involved.
 *
 * Gated by hbs.long-stay.api-hotels.enabled. While it is off, or the check fails,
 * the page behaves exactly as it did before this feature.
 */

const DEFAULT_HOTEL_IMAGE =
  "https://details/assets/details/profilepic/hotel/hoteldefault.jpg";

/**
 * Read the server-side switch. Fails closed: any error counts as off, so a
 * backend that is old or down leaves Long Stay inhouse-only.
 *
 * @returns {Promise<boolean>}
 */
export async function fetchLongStayApiHotelsEnabled() {
  try {
    const res = await axiosInstance.get("/api/long-stay-search/api-hotels-enabled");
    return res?.data?.enabled === true;
  } catch (err) {
    console.warn("Long Stay: could not read api-hotels-enabled, treating as disabled.", err);
    return false;
  }
}

/** Turns a row from searchApiHotels into the shape the Long Stay results render. */
export function toLongStayHotelRow(row) {
  const price = row.fromRate == null ? null : row.fromRate;
  return {
    id: row.hotelId, // "API-<TYPE>-<code>", so it can't clash with a contract hotel
    source: "API",
    apiType: row.apiType,
    searchId: row.searchId,
    hotelCode: row.hotelCode,
    name: row.hotelName,
    address: row.address,
    city: row.cityName,
    price,
    badge: price ? null : "Rate Unavailable",
    image: row.hotelImage || DEFAULT_HOTEL_IMAGE,
    rating: row.starRating || 0,
    hotelType: "hotel",
    channelType: String(row.apiType || "").toLowerCase(),
    contactNumber: row.contactNumber || "",
    // Refund flags the hotel search sent (null = unknown). Read only by the
    // Refund Policy filter (utils/refundPolicyFilter.js).
    hasRefundable: row.hasRefundable ?? null,
    hasPartial: row.hasPartial ?? null,
    hasNonRefundable: row.hasNonRefundable ?? null,
  };
}

/** True for rows produced by toLongStayHotelRow. */
export function isSupplierHotel(hotel) {
  return hotel?.source === "API";
}
