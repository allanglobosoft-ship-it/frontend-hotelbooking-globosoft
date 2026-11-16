import axiosInstance from "../components/AxiosInstance";

/**
 * Supplier-API hotels on the Day Stay page (/new-booking/day-stay), built the
 * same way as Long Stay's (longStayApiHotels.js).
 *
 * Day Stay's own search reads day-stay contracts and nothing else. This adds a
 * second, independent source: the supplier search Last Minute and Long Stay
 * already use (lastMinuteApiHotels.js, reused rather than copied). Rooms and
 * booking go through the normal supplier pages (/api-room-list,
 * /api-booking-page-hotels), not the day-stay ones, so the day-stay contract
 * pricing and /api/day-stay-booking/save are not involved.
 *
 * Suppliers sell no day-use rates, so a supplier hotel here is searched and
 * booked as a one-night stay from the check-in date, at the supplier's own rate.
 *
 * Gated by hbs.day-stay.api-hotels.enabled. While it is off, or the check fails,
 * the page behaves exactly as it did before this feature.
 */

const DEFAULT_HOTEL_IMAGE =
  "https://details/assets/details/profilepic/hotel/hoteldefault.jpg";

/**
 * Read the server-side switch. Fails closed: any error counts as off, so a
 * backend that is old or down leaves Day Stay inhouse-only.
 *
 * @returns {Promise<boolean>}
 */
export async function fetchDayStayApiHotelsEnabled() {
  try {
    const res = await axiosInstance.get("/api/day-stay-search/api-hotels-enabled");
    return res?.data?.enabled === true;
  } catch (err) {
    console.warn("Day Stay: could not read api-hotels-enabled, treating as disabled.", err);
    return false;
  }
}

/**
 * The supplier check-out date for a Day Stay check-in: the next day
 * ("YYYY-MM-DD" in and out). Worked out on the calendar date itself, so the
 * browser's time zone can't shift it. Empty for an empty or unreadable date.
 */
export function dayStayCheckOutDate(checkInDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(checkInDate || ""));
  if (!m) return "";
  const next = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1));
  return next.toISOString().slice(0, 10);
}

/**
 * Turns a row from searchApiHotels into the shape the Day Stay results read
 * (the same field names as a day-stay contract row, so the page's filters work
 * on both). `source: "API"` marks it as a supplier hotel.
 */
export function toDayStayHotelRow(row) {
  const fromRate = row.fromRate == null ? null : Number(row.fromRate);
  return {
    source: "API",
    apiType: row.apiType,
    searchId: row.searchId,
    hotelCode: row.hotelCode,
    // "API-<TYPE>-<code>", so it can't clash with a contract hotel's id.
    hotelId: row.hotelId,
    // The card's React key and "already opened" marker.
    contractId: row.hotelId,
    hotelName: row.hotelName,
    hotelAddress: row.address || row.cityName || "",
    city: row.cityName || "",
    hotelImage: row.hotelImage || DEFAULT_HOTEL_IMAGE,
    starRating: row.starRating || 0,
    // The supplier's rate for the one night, for the rooms and guests searched.
    fromRate: Number.isFinite(fromRate) && fromRate > 0 ? fromRate : null,
    hotelType: "hotel",
    channelType: String(row.apiType || "").toLowerCase(),
    contactNumber: row.contactNumber || "",
    hasRefundable: row.hasRefundable ?? null,
    hasPartial: row.hasPartial ?? null,
    hasNonRefundable: row.hasNonRefundable ?? null,
  };
}

/** True for rows produced by toDayStayHotelRow. */
export function isSupplierDayStayHotel(hotel) {
  return hotel?.source === "API";
}
