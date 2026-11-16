/**
 * In-house (apiId 1) `sessionStorage.bookingData` builders.
 *
 * Extracted verbatim from RoomList.jsx (handleBooking / handleProceedBooking)
 * so the merged multi-supplier room list (ExternalApiRoomList.jsx) can send
 * an INHOUSE rate of a mapped hotel to the in-house booking page in exactly
 * the shape HotelBookingPage already reads. Key order and values are kept
 * identical to the original inline code, so RoomList's stored bookingData is
 * byte-for-byte unchanged.
 *
 * HotelBookingPage relies on:
 *   - selectedRate.hotelId  → the LOCAL numeric hotel id (policies, terms,
 *                              max-cancellation-nights, create payload)
 *   - payload.apiId         → 1 (forwarded to /api/hotel-booking/create)
 *   - payload.{agentId, checkInDate, checkOutDate, rooms, nationality, …}
 *   - hotelStaticData.{hotelName, address, starRating}
 *   - roomBreakdown[]       → per-room category / meal plan / rate (multi-room)
 */

// Refundability is owned by the contract rate (the Refundable / Non
// Refundable radios on the Contract Rate page persist `refundable`) and
// reaches the room list inverted as `nonRefundable`. Providers disagree on
// the encoding — inhouse sends boolean / "true", IWTX and X3 send "Y" / "N"
// — so normalise before testing. Anything unrecognised (null, undefined,
// "") is treated as refundable, i.e. the safe/no-popup case.
export const isNonRefundableRate = (nonRefundable) => {
  const value = String(nonRefundable).trim().toLowerCase();
  return value === "true" || value === "y" || value === "yes";
};

/**
 * Room slot `slotIndex`'s own amount for `key` ("totalRate" /
 * "totalRateWithoutMarkup"). On a multi-room in-house search the rate's
 * `totalRate` is the stay total for ALL requested rooms together, so using
 * it per slot charged that total once per room. The backend now also sends
 * `perRoomRates[i]` — room i on its own, agent markup applied per room —
 * and this prefers it. Falls back to the rate's own field when there is no
 * per-room entry (single-room searches, other suppliers).
 */
export const slotRateValue = (rate, slotIndex, key) => {
  const perRoom = rate?.perRoomRates?.[slotIndex];
  if (perRoom && perRoom[key] != null) return perRoom[key];
  return rate?.[key];
};

/** Sum one numeric rate field across the picked room slots (slot i = room i). */
export const sumSelectedRooms = (selectedRooms, key) =>
  selectedRooms.reduce(
    (acc, r, i) => acc + (Number(slotRateValue(r.selectedRate, i, key)) || 0),
    0,
  );

/**
 * Single-room bookingData — the shape RoomList.handleBooking stores before
 * opening the in-house booking page.
 *
 * @param rate          the picked availableRates[] entry
 * @param hotel         the in-house hotel block of the room-search response
 * @param meta          hotelStaticData carried over from the hotel search
 * @param payload       the room-search payload (apiId 1, in-house hotelCode)
 * @param currency      display currency { code, factor } (rates stay AED)
 * @param religiousMode true only for the Religious room-list wrapper
 */
export const buildInhouseSingleBookingData = ({
  rate,
  hotel,
  meta,
  payload,
  currency,
  religiousMode = false,
}) => ({
  selectedRate: {
    hotelId: hotel.hotelId,
    hotelName: hotel.hotelName,
    roomCategory: rate.roomCategory,
    mealPlan: rate.mealPlan,
    contractLabel: rate.contractLabel,
    nonRefundable: rate.nonRefundable,
    refundTerms: rate.refundTerms,
    rate: rate.totalRate,
    rateWithoutMarkup: rate.totalRateWithoutMarkup,
    currency: "AED",
    cancellationPolicy: hotel.cancellationPolicies,
    roomStatus: rate.roomStatus,
    roomRateBasedOnRoomCount: rate.roomRateBasedOnRoomCount,
    roomRateBasedOnRoomCount_WithoutMarkup: rate.roomRateBasedOnRoomCount_WithoutMarkup,
  },
  hotelStaticData: meta,
  payload: payload,
  // Display currency chosen on the search page — forwarded so the
  // booking page shows + persists the same currency. Rates stay AED.
  currency,
  // Religious-flow marker — read by HotelBookingPage's create
  // path and forwarded on the /api/hotel-booking/create payload
  // so the persisted row is tagged is_religious_booking=true.
  // Undefined for every other flow, so bookingData shape is
  // unchanged in the normal path.
  isReligiousBooking: religiousMode || undefined,
});

/**
 * Multi-room bookingData — combines the per-room picks into the legacy
 * single-`selectedRate` shape HotelBookingPage expects (summed totals +
 * concatenated room/meal labels) plus the per-room `roomBreakdown`.
 * Callers guarantee every slot has a selectedRate.
 */
export const buildInhouseMultiBookingData = ({
  selectedRooms,
  hotel,
  meta,
  payload,
  currency,
  religiousMode = false,
}) => {
  const primary = selectedRooms[0].selectedRate;
  const sum = (key) => sumSelectedRooms(selectedRooms, key);

  // Overall booking type must consider EVERY selected room, not just
  // the first — priority: On Request > Non-Refundable > Flexible.
  const anyRoomOnRequest = selectedRooms.some(
    (r) => r.selectedRate?.roomStatus === "On Request",
  );
  const anyRoomNonRefundable = selectedRooms.some((r) =>
    isNonRefundableRate(r.selectedRate?.nonRefundable),
  );
  // When no room is On Request, fall back to the primary room's own
  // status string rather than a hardcoded value — preserves prior
  // behavior exactly for the single-room case and avoids assuming
  // "Available" is the only other possible status value.
  const overallRoomStatus = anyRoomOnRequest
    ? "On Request"
    : primary.roomStatus;
  const overallNonRefundable = anyRoomNonRefundable;

  const combinedSelectedRate = {
    hotelId: hotel.hotelId,
    hotelName: hotel.hotelName,
    // Concatenated labels so the booking summary shows e.g.
    // "Deluxe + Suite" / "Breakfast + Half Board" without needing
    // any per-room rendering on the booking page.
    roomCategory: selectedRooms
      .map((r) => r.selectedRate?.roomCategory)
      .filter(Boolean)
      .join(" + "),
    mealPlan: selectedRooms
      .map((r) => r.selectedRate?.mealPlan)
      .filter(Boolean)
      .join(" + "),
    contractLabel: primary.contractLabel,
    nonRefundable: overallNonRefundable,
    rate: sum("totalRate"),
    rateWithoutMarkup: sum("totalRateWithoutMarkup"),
    currency: "AED",
    cancellationPolicy: hotel.cancellationPolicies,
    roomStatus: overallRoomStatus,
    // IMPORTANT: each rate's `roomRateBasedOnRoomCount` is already
    // (totalRate × numberOfRooms) for the WHOLE search (e.g. 214 × 2
    // = 428 when the user searched for 2 rooms). Summing that across
    // 2 selected slots would give 856 — 2× the real total. The
    // correct multi-room booking total is sum(totalRate) — one
    // per-room rate per slot, summed across slots. Single-room
    // searches keep the original semantics because numberOfRooms = 1
    // there, so totalRate === roomRateBasedOnRoomCount.
    roomRateBasedOnRoomCount: sum("totalRate"),
    roomRateBasedOnRoomCount_WithoutMarkup: sum("totalRateWithoutMarkup"),
  };

  return {
    selectedRate: combinedSelectedRate,
    // Additive — HotelBookingPage doesn't read this today, but it's
    // here for any future per-room display work that wants the
    // detail without re-deriving it.
    roomBreakdown: selectedRooms.map((r, i) => ({
      roomNo: i + 1,
      roomCategory: r.selectedRate?.roomCategory,
      mealPlan: r.selectedRate?.mealPlan,
      contractLabel: r.selectedRate?.contractLabel,
      nonRefundable: r.selectedRate?.nonRefundable,
      refundTerms: r.selectedRate?.refundTerms,
      // This room's own price (HotelBookingPage posts it as rooms[i].rate).
      rate: slotRateValue(r.selectedRate, i, "totalRate"),
      rateWithoutMarkup: slotRateValue(r.selectedRate, i, "totalRateWithoutMarkup"),
      roomRateBasedOnRoomCount: r.selectedRate?.roomRateBasedOnRoomCount,
      roomRateBasedOnRoomCount_WithoutMarkup:
        r.selectedRate?.roomRateBasedOnRoomCount_WithoutMarkup,
      roomStatus: r.selectedRate?.roomStatus,
    })),
    hotelStaticData: meta,
    payload,
    // Display currency chosen on the search page (see single-room path).
    currency,
    // Religious-flow marker (see single-room path). Undefined outside
    // the religious flow keeps this payload shape unchanged.
    isReligiousBooking: religiousMode || undefined,
  };
};
