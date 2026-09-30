import React, { useState, useEffect } from "react";
import { useAccordionButton } from "react-bootstrap/AccordionButton";
import {
  Card,
  Button,
  Row,
  Col,
  Badge,
  Accordion,
  Spinner,
  Alert,
  Modal,
  Form,
} from "react-bootstrap";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import {
  FaBed,
  FaUtensils,
  FaStar,
  FaMapMarkerAlt,
  FaPhone,
  FaCalendarAlt,
  FaUsers,
  FaInfoCircle,
  FaCheckCircle,
  FaTimesCircle,
  FaChevronDown,
  FaChevronUp,
  FaHotel,
  FaMoneyBillWave,
  FaShieldAlt,
  FaGlobe,
  FaExclamationTriangle,
} from "react-icons/fa";
import { useLocation, useNavigate } from "react-router-dom";
import "../styles/RoomList.css";
import axiosInstance from "../components/AxiosInstance";
import { formatFlexibleDate } from "../utils/dateUtils";
import {
  RateDeadlinePill,
  resolveInhouseDeadline,
  isDeadlinePassed,
  DEADLINE_TIME_EOD,
} from "../utils/rateDeadline";

/**
 * Builds the "Valid: <from> - <to>" label for a policy validity period.
 * Returns null when NEITHER date is usable so the caller can hide the line
 * entirely instead of rendering "Invalid Date - Invalid Date". When only one
 * side is usable we still show the range with an "N/A" placeholder.
 */
const renderPolicyValidity = (fromDate, toDate) => {
  const from = formatFlexibleDate(fromDate);
  const to = formatFlexibleDate(toDate);
  if (!from && !to) return null;
  return `Valid: ${from || "N/A"} - ${to || "N/A"}`;
};


function AccordionToggleButton({ eventKey, isActive }) {
  const decoratedOnClick = useAccordionButton(eventKey);

  return (
    <Button
      variant="outline-danger"
      size="sm"
      onClick={decoratedOnClick}
      className="d-flex align-items-center gap-1"
    >
      {isActive ? "Hide Details/Book" : "View Details/Book"}
      {isActive ? <FaChevronUp /> : <FaChevronDown />}
    </Button>
  );
}

/**
 * Optional `force24Hour` prop — set by the thin RoomList24Hour
 * wrapper. When true, the per-rate Book Now / Confirm Booking actions
 * navigate to /hotel-booking-page-24hr instead of /hotel-booking-page
 * so the dedicated 24-hour Check-In flow can render its own booking
 * page (and redirect to the 24-hour booking list after success).
 * Defaults to false so the legacy /room-list flow is unchanged.
 *
 * Optional `religiousMode` prop — set by the thin RoomListReligious
 * wrapper. When true, the same actions route to /religious-booking-page
 * so the Religious flow lands on its own booking page and, after
 * success, its own Religious Booking List. Also tags the persisted
 * bookingData with `isReligiousBooking: true` so HotelBookingPage can
 * forward that flag to the create endpoint. Defaults to false so the
 * legacy /room-list flow is unchanged.
 */
const RoomList = ({ force24Hour = false, religiousMode = false } = {}) => {
  const bookingPageRoute = religiousMode
    ? "/religious-booking-page"
    : force24Hour
      ? "/hotel-booking-page-24hr"
      : "/hotel-booking-page";
  const [roomData, setRoomData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRate, setSelectedRate] = useState(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  // Which category accordion is open, tracked PER ROOM SLOT so opening
  // a category in Room 1 doesn't also open the same category in Room 2
  // (they used to share a single string; multi-room searches now keep
  // each room's expanded category independent). Single-room mode reads
  // slot 0 and behaves exactly as before.
  const [activeAccordions, setActiveAccordions] = useState({});
  const location = useLocation();
  const navigate = useNavigate();
  const [hotelStaticData, setHotelStaticData] = useState(null);
  const [searchPayload, setSearchPayload] = useState(null);
  // Display currency carried over from the hotel search. `factor` is the
  // AED→target multiplier; all rates remain AED internally (and in every
  // booking payload) — this only changes what formatPrice renders.
  const [displayCurrency, setDisplayCurrency] = useState({ code: "AED", factor: 1 });
  const [loadingRate, setLoadingRate] = useState(false);
  const [showUnavailableModal, setShowUnavailableModal] = useState(false);
  const [policyList, setPolicyList] = useState(null);
  // Default view for rate cards on the room-list page. Changed to "list"
  // so the first render after clicking "View Details / Book" shows the
  // vertical list layout (denser, easier scanning of rate details) rather
  // than the grid tiles. Operator can still toggle to grid via the icon
  // buttons in the "Available Room Categories" header.
  const [viewMode, setViewMode] = useState("list");
  // `agentBalance` stays in AED — every credit-check comparison further
  // down (isInsufficientBalance, handleBooking) is done against AED amounts,
  // so the value used for the *gate* MUST remain the raw AED figure the
  // backend already returns on `effectiveAvailableCreditLimit`.
  const [agentBalance, setAgentBalance] = useState(null);
  // Display-only companions: the same figure rendered in the agent's
  // configured currency (populated from the backend's
  // effectiveAvailableCreditLimitInAgentCurrency + currencyCode). Purely
  // for the "Available Balance" chip; NOT read by any gating logic.
  const [agentBalanceDisplay, setAgentBalanceDisplay] = useState(null);
  const [agentBalanceCurrency, setAgentBalanceCurrency] = useState("AED");
  // Filter state
  const [refundFilter, setRefundFilter] = useState({
    refundable: false,
    nonRefundable: false,
  });
  const [roomTypeOptions, setRoomTypeOptions] = useState([]);
  const [selectedRoomTypes, setSelectedRoomTypes] = useState([]);
  // Room-category search box (above the accordion). Case-insensitive
  // substring match against the roomCategory name, with a few common
  // abbreviations (DLX → deluxe, SUT/STE → suite, STD → standard, etc.)
  // so operators can type shorthand and still hit the right room.
  const [roomSearch, setRoomSearch] = useState("");

  // Insufficient-credit warning modal. When the picked rate (single-room)
  // or the combined rate (multi-room) exceeds the agent's available
  // balance, we DON'T block the user — instead we surface a popup
  // explaining that credit is short and they'll need to pay online, and
  // on OK we resume the original booking flow. The deferred action is
  // captured in `pendingBookingFn` so the same modal can serve both the
  // single-room and multi-room paths.
  const [showInsufficientCreditModal, setShowInsufficientCreditModal] =
    useState(false);
  const [pendingBookingFn, setPendingBookingFn] = useState(null);

  // Cancellation Policies & Terms modal. Opened from a per-rate link beneath
  // the truncated cancellation preview. Cancellation policies come straight
  // from the existing room-search response (rate.cancellationPolicies, with
  // a hotel-level fallback). Terms & Conditions are NOT in the search
  // payload, so they're lazy-fetched the first time the modal is opened for
  // a given hotel from the existing `/api/hotels/{hotelId}/terms-and-conditions`
  // endpoint (same one HotelBookingPage uses) and cached per-hotel for the
  // remainder of the page lifetime.
  //
  // The booking flow is completely untouched: this modal is purely a
  // read-only viewer; no part of `handleBooking` / `handleProceedBooking` /
  // sessionStorage `bookingData` reads from these states.
  const [showPoliciesModal, setShowPoliciesModal] = useState(false);
  const [policiesModalData, setPoliciesModalData] = useState({
    cancellationPolicies: [],
    termsAndConditions: [],
    selectedRoomLabel: "",
  });
  const [termsCache, setTermsCache] = useState({}); // { [hotelId]: T&C[] }
  const [loadingTerms, setLoadingTerms] = useState(false);

  const openPoliciesModal = async (rate, hotelDetail) => {
    const cancellation = Array.isArray(rate?.cancellationPolicies)
      ? rate.cancellationPolicies
      : Array.isArray(hotelDetail?.cancellationPolicies)
        ? hotelDetail.cancellationPolicies
        : [];
    const label = [rate?.roomCategory, rate?.mealPlan]
      .filter(Boolean)
      .join(" • ");

    // Use whichever T&C source we already have so the modal opens with
    // content immediately when possible: rate-level → hotel-level → cache.
    const inlineTerms = Array.isArray(rate?.termsAndConditions)
      ? rate.termsAndConditions
      : Array.isArray(hotelDetail?.termsAndConditions)
        ? hotelDetail.termsAndConditions
        : null;

    const hotelId = hotelDetail?.hotelId;
    const cached = hotelId != null ? termsCache[hotelId] : undefined;

    setPoliciesModalData({
      cancellationPolicies: cancellation,
      termsAndConditions: inlineTerms || cached || [],
      selectedRoomLabel: label,
    });
    setShowPoliciesModal(true);

    // Only fetch when we don't already have terms from a richer source.
    // Backend path variable is `Long hotelId`; skip non-numeric IDs (external
    // APIs use opaque codes) to avoid a noisy 400.
    if (inlineTerms || cached !== undefined) return;
    if (hotelId == null || !/^\d+$/.test(String(hotelId))) {
      setPoliciesModalData((prev) => ({ ...prev, termsAndConditions: [] }));
      return;
    }

    setLoadingTerms(true);
    try {
      const res = await axiosInstance.get(
        `/api/hotels/${hotelId}/terms-and-conditions`,
      );
      const terms = Array.isArray(res?.data) ? res.data : [];
      setTermsCache((prev) => ({ ...prev, [hotelId]: terms }));
      setPoliciesModalData((prev) => ({ ...prev, termsAndConditions: terms }));
    } catch (err) {
      console.error("T&C fetch failed:", err);
      // Cache empty so we don't retry on every re-open of the modal.
      setTermsCache((prev) => ({ ...prev, [hotelId]: [] }));
      setPoliciesModalData((prev) => ({ ...prev, termsAndConditions: [] }));
    } finally {
      setLoadingTerms(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────
  // Multi-room selection (per-room slots).
  //
  // Single-room searches (numRooms === 1) keep using the legacy
  // `selectedRate` flow — the "Book Now" buttons render exactly as before,
  // open the existing modal, and navigate to /hotel-booking-page with the
  // single-room bookingData shape the downstream booking page (and backend)
  // already understand.
  //
  // Multi-room searches (numRooms > 1) instead show a per-room Accordion
  // wrapper. Each room slot has its own copy of the categories list with
  // radios in place of "Book Now"; once every slot has a selection, the
  // user clicks "Continue with Booking" which COMBINES the picks into the
  // same legacy single-`selectedRate` shape (summed totals + concatenated
  // room/meal labels), so neither HotelBookingPage nor the backend has to
  // change. The per-room detail also rides along as `roomBreakdown` (an
  // additive field downstream code currently ignores).
  // ──────────────────────────────────────────────────────────────────────
  const [selectedRooms, setSelectedRooms] = useState([]);

  let activeUserRole = localStorage.getItem("currentActiveRole");
  // console.log("currentActiveRole::", activeUserRole);

  // Trigger API call on page load with state passed from HotelSearch
  useEffect(() => {
    const fetchRooms = async () => {
      try {
        setLoading(true);
        setError(null);

        let payload = location.state?.payload;
        let meta = location.state?.meta;
        let currencyInfo = location.state?.currency;

        // Fallback to sessionStorage if location.state is null (e.g., via window.open)
        if (!payload) {
          try {
            const stored = sessionStorage.getItem("roomListPayload");
            if (stored) {
              const parsed = JSON.parse(stored);
              payload = parsed.payload;
              meta = parsed.meta;
              currencyInfo = parsed.currency || currencyInfo;
              setHotelStaticData(meta);
              setSearchPayload(payload);
              // console.log("Retrieved payload from sessionStorage:", payload);
              // console.log("Retrieved meta from sessionStorage:", meta);
            }
          } catch (e) {
            console.error("Error parsing sessionStorage:", e);
          }
        }

        // Apply the display currency chosen on the search page (defaults to
        // AED ×1 when absent). Rates themselves stay AED — see formatPrice.
        if (currencyInfo) {
          setDisplayCurrency({
            code: currencyInfo.code || "AED",
            factor: Number(currencyInfo.factor) > 0 ? Number(currencyInfo.factor) : 1,
          });
        }

        // console.log("payload::", payload);
        if (!payload) {
          setError("Missing search context. Please go back and try again.");
          setLoading(false);
          return;
        }

        const res = await axiosInstance.post(
          "/api/hotel-rooms/search",
          payload,
        );

        // console.log("room search res::", res);

        // Check for no availability or failed search
        if (!res.data || res.data.success === false) {
          const message =
            res.data?.message || "Search failed. Please try again.";
          // console.log("API error message:", message);

          if (message.toLowerCase().includes("no availability found")) {
            // console.log("Triggering no availability modal");
            setShowUnavailableModal(true);
          } else {
            setError(message);
          }
          setLoading(false);
          return;
        }

        // ── 24 Hour Check-In rate uplift ────────────────────────────────
        // When the search came in with is24HourCheckin=true, apply the
        // configured percentage on every per-rate amount. We multiply the
        // public-facing fields the FE / booking flow consume:
        //   totalRate, rate, roomRateBasedOnRoomCount, recommendedRetailPrice
        // (the *_WithoutMarkup mirrors are left untouched so accounting can
        // still reconstruct the base.) When the flag is false / absent, the
        // helper is a no-op and the original rates flow through unchanged.
        const upliftPct =
          payload?.is24HourCheckin === true
            ? Number(payload?.twentyFourHourPercentage || 0)
            : 0;
        const uplift = (n) =>
          n == null ? n : +(Number(n) * (1 + upliftPct / 100)).toFixed(2);
        const applyMarkupToRate = (r) =>
          upliftPct > 0
            ? {
                ...r,
                totalRate: uplift(r.totalRate),
                rate: uplift(r.rate),
                roomRateBasedOnRoomCount: uplift(r.roomRateBasedOnRoomCount),
                recommendedRetailPrice: uplift(r.recommendedRetailPrice),
                _twentyFourHourMarkupApplied: upliftPct, // diagnostic flag
              }
            : r;

        const enriched = {
          ...res.data,
          hotels: (res.data.hotels || []).map((h) => ({
            ...h,
            // Sort availableRates within each category by totalRate asc.
            // Uplift first (so sort uses the marked-up rate) then sort.
            roomCategories: (h.roomCategories || []).map((c) => ({
              ...c,
              availableRates: (c.availableRates || [])
                .slice()
                .map(applyMarkupToRate)
                .sort((a, b) => (a.totalRate || 0) - (b.totalRate || 0)),
            })),
          })),
          meta: meta || {},
          payload,
        };

        setRoomData(enriched);
      } catch (err) {
        console.error("Room search failed:", err);
        setError("Search failed. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchRooms();
  }, [location.state]);

  // Whether the picked amount exceeds the agent's available balance.
  // When true, callers raise the InsufficientCreditModal instead of
  // blocking — the user can still continue to the booking page and pay
  // online. Returns false (skip gate) when agentBalance is not loaded
  // or not applicable (e.g. non-agent role) — the server-side check at
  // confirm-booking time remains the authoritative gate.
  const isInsufficientBalance = (requiredAmount) => {
    if (agentBalance == null) return false;
    const required = Number(requiredAmount) || 0;
    const available = Number(agentBalance) || 0;
    return required > available;
  };

  // Refundability is owned by the contract rate (the Refundable / Non
  // Refundable radios on the Contract Rate page persist `refundable`) and
  // reaches the room list inverted as `nonRefundable`. Providers disagree on
  // the encoding — inhouse sends boolean / "true", IWTX and X3 send "Y" / "N"
  // — so normalise before testing. Anything unrecognised (null, undefined,
  // "") is treated as refundable, i.e. the safe/no-popup case.
  const isNonRefundableRate = (nonRefundable) => {
    const value = String(nonRefundable).trim().toLowerCase();
    return value === "true" || value === "y" || value === "yes";
  };

  const handleBooking = async (rate, skipCreditCheck = false) => {
    const { payload, hotels } = roomData;
    const hotelsdetail = hotels[0];

    // Single-room credit gate. `roomRateBasedOnRoomCount` is the total for
    // the whole search (per-room rate × numberOfRooms) so it's already the
    // full payable amount for this booking. The gate is limited to
    // NON-REFUNDABLE rates — a refundable booking can still be cancelled, so
    // it goes straight through without the popup. When the balance is short
    // on a non-refundable rate we raise a modal — and once the user clicks
    // OK, we re-enter this function with skipCreditCheck=true so the rest of
    // the flow runs unchanged (booking page can then handle online payment).
    if (
      !skipCreditCheck &&
      isNonRefundableRate(rate.nonRefundable) &&
      isInsufficientBalance(rate.roomRateBasedOnRoomCount)
    ) {
      setPendingBookingFn(() => () => handleBooking(rate, true));
      setShowInsufficientCreditModal(true);
      return;
    }

    console.log("hotelsdetail::", hotelsdetail);
    // console.log("rate::", rate);

    // For API IDs 12 and 15, fetch accurate rates
    if (payload.apiId === 12 || payload.apiId === 15) {
      setLoadingRate(true);

      setTimeout(async () => {
        try {
          // Build dynamic request body
          let priceCheckReq = {
            searchCriteria: {
              roomConfiguration: {
                room: {
                  adult: {
                    age: payload.rooms[0].adultAges[0].toString(),
                  },
                  roomTypeCode: rate.roomTypeCode,
                  mealPlanCode: rate.mealPlanCode,
                  contractTokenId: rate.contractTokenId || "0",
                  roomConfigurationId: payload.rooms.length,
                },
              },
              startDate: payload.checkInDate,
              endDate: payload.checkOutDate,
              hotelCode: payload.hotelCode,
              nationality: payload.nationality,
              includeRateDetails: "Y",
              cancellationPolicy: "Y",
              groupByRooms: "Y",
            },
          };

          // console.log("priceCheckReq ::", priceCheckReq);

          // Choose endpoint dynamically
          let endpoint = "";
          switch (payload.apiId) {
            case 12:
              endpoint = "/api/iwtx/hotel/availability";
              break;
            case 15:
              endpoint = "/api/x3/hotel/availability";
              break;
          }

          const response = await axiosInstance.post(endpoint, priceCheckReq);
          const hotel = response.data.hotels.hotel[0];
          const rooms = hotel.roomTypeDetails.rooms.room;
          // console.log("Accurate room details::", rooms);

          // Map all rooms to a structured object
          const accurateRates = rooms
            .filter((room) => room != null)
            .map((room) => ({
              hotelId: hotel.hotelId,
              hotelName: hotel.hotelName,
              roomCategory: room.roomType,
              mealPlan: room.mealPlan,
              contractLabel: room.contractLabel,
              nonRefundable: room.nonRefundable,
              rate: room.rateDetails.rate,
              currency: room.currCode,
            }));

          console.log("accurateRate:", accurateRates);
          setSelectedRate(accurateRates[0]);
          setLoadingRate(false);
          setShowBookingModal(true);
        } catch (err) {
          console.error("Accurate rate fetch failed:", err);
          setLoadingRate(false);
          alert("Unable to fetch accurate rate. Please try again.");
        }
      }, 3000);
    } else {
      // For all other API IDs (including 1), redirect directly to booking page
      try {
        // Create booking data from the current rate
        const bookingData = {
          selectedRate: {
            hotelId: hotelsdetail.hotelId,
            hotelName: hotelsdetail.hotelName,
            roomCategory: rate.roomCategory,
            mealPlan: rate.mealPlan,
            contractLabel: rate.contractLabel,
            nonRefundable: rate.nonRefundable,
            rate: rate.totalRate,
            rateWithoutMarkup: rate.totalRateWithoutMarkup,
            currency: "AED",
            cancellationPolicy: hotelsdetail.cancellationPolicies,
            roomStatus: rate.roomStatus,
            roomRateBasedOnRoomCount: rate.roomRateBasedOnRoomCount,
            roomRateBasedOnRoomCount_WithoutMarkup: rate.roomRateBasedOnRoomCount_WithoutMarkup,
          },
          hotelStaticData: roomData.meta,
          payload: payload,
          // Display currency chosen on the search page — forwarded so the
          // booking page shows + persists the same currency. Rates stay AED.
          currency: displayCurrency,
          // Religious-flow marker — read by HotelBookingPage's create
          // path and forwarded on the /api/hotel-booking/create payload
          // so the persisted row is tagged is_religious_booking=true.
          // Undefined for every other flow, so bookingData shape is
          // unchanged in the normal path.
          isReligiousBooking: religiousMode || undefined,
        };

        // console.log("Booking data for direct redirect:", bookingData);

        // Store booking data in sessionStorage
        sessionStorage.setItem("bookingData", JSON.stringify(bookingData));

        // Redirect to booking page

        window.open(bookingPageRoute, "_blank");
      } catch (err) {
        console.error("Error preparing booking data:", err);
        alert("Unable to proceed with booking. Please try again.");
      }
    }
  };

  // ──────────────────────────────────────────────────────────────────────
  // Multi-room helpers. See note above near `selectedRooms`.
  // ──────────────────────────────────────────────────────────────────────
  const numRooms = (roomData?.payload?.rooms || []).length || 1;
  const isMultiRoom = numRooms > 1;
  const allRoomsSelected =
    selectedRooms.length > 0 &&
    selectedRooms.every((r) => r.selectedRate !== null);

  /** Initialise one selection slot per room as soon as the API result
   *  arrives. We re-init only when the slot count changes so the user's
   *  picks survive filter changes / view-mode toggles. */
  useEffect(() => {
    setSelectedRooms((prev) => {
      if (prev.length === numRooms) return prev;
      return Array.from({ length: numRooms }, (_, i) => ({
        roomNo: i + 1,
        selectedRate: null,
        hotelId: null,
        hotelName: null,
      }));
    });
  }, [numRooms]);

  /** Toggle the rate for one room slot. Clicking an already-selected rate
   *  clears that slot (matches the ExternalApi UX). */
  const handleRateSelect = (roomIndex, rate, hotelId, hotelName) => {
    setSelectedRooms((prev) =>
      prev.map((r, i) => {
        if (i !== roomIndex) return r;
        if (r.selectedRate === rate) {
          return { ...r, selectedRate: null, hotelId: null, hotelName: null };
        }
        return { ...r, selectedRate: rate, hotelId, hotelName };
      }),
    );
  };

  /** Combine the per-room picks into the single-`selectedRate` shape the
   *  existing HotelBookingPage expects, then navigate. Adds an additive
   *  `roomBreakdown` array; downstream code ignores unknown fields, so
   *  nothing else needs to change to support multi-room.
   *
   *  For apiId 12 / 15 we don't enter this path — those flows live behind
   *  the legacy single-room `handleBooking` and aren't in scope for this
   *  change. The "Continue with Booking" CTA is only shown in the
   *  multi-room branch, which is currently used by inhouse (apiId 1)
   *  searches. */
  const handleProceedBooking = (skipCreditCheck = false) => {
    if (!allRoomsSelected || !roomData) return;
    try {
      const { payload, hotels, meta } = roomData;
      const hotelsdetail = hotels?.[0];
      if (!hotelsdetail) {
        alert("Hotel context missing. Please refresh and try again.");
        return;
      }
      const primary = selectedRooms[0].selectedRate;
      const sum = (key) =>
        selectedRooms.reduce(
          (acc, r) => acc + (Number(r.selectedRate?.[key]) || 0),
          0,
        );

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

      // Multi-room credit gate. Each slot is ONE room, so sum(totalRate)
      // across slots is the full payable amount — matches what we send
      // as `combinedSelectedRate.rate` below. As in the single-room flow the
      // gate only applies when the booking is non-refundable; here that means
      // ANY selected room being non-refundable makes the whole booking
      // non-refundable, which is the same rule `overallNonRefundable` uses.
      // On insufficient credit we raise the same popup the single-room flow
      // uses; OK re-enters this function with skipCreditCheck=true.
      if (
        !skipCreditCheck &&
        anyRoomNonRefundable &&
        isInsufficientBalance(sum("totalRate"))
      ) {
        setPendingBookingFn(() => () => handleProceedBooking(true));
        setShowInsufficientCreditModal(true);
        return;
      }

      const combinedSelectedRate = {
        hotelId: hotelsdetail.hotelId,
        hotelName: hotelsdetail.hotelName,
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
        cancellationPolicy: hotelsdetail.cancellationPolicies,
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

      const bookingData = {
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
          rate: r.selectedRate?.totalRate,
          rateWithoutMarkup: r.selectedRate?.totalRateWithoutMarkup,
          roomRateBasedOnRoomCount: r.selectedRate?.roomRateBasedOnRoomCount,
          roomRateBasedOnRoomCount_WithoutMarkup:
            r.selectedRate?.roomRateBasedOnRoomCount_WithoutMarkup,
          roomStatus: r.selectedRate?.roomStatus,
        })),
        hotelStaticData: meta,
        payload,
        // Display currency chosen on the search page (see single-room path).
        currency: displayCurrency,
        // Religious-flow marker (see single-room path). Undefined outside
        // the religious flow keeps this payload shape unchanged.
        isReligiousBooking: religiousMode || undefined,
      };

      sessionStorage.setItem("bookingData", JSON.stringify(bookingData));
      window.open(bookingPageRoute, "_blank");
    } catch (err) {
      console.error("Error preparing multi-room bookingData:", err);
      alert("Unable to proceed with booking. Please try again.");
    }
  };

  const getMealPlanIcon = (mealPlan) => {
    switch (mealPlan.toLowerCase()) {
      case "room only":
        return <FaBed className="text-muted" />;
      case "breakfast":
        return <FaUtensils className="text-warning" />;
      case "full board":
        return <FaUtensils className="text-success" />;
      default:
        return <FaUtensils className="text-primary" />;
    }
  };

  // `deadlinePassed` (derived from isDeadlinePassed(inhouseDeadline) at the
  // call site) downgrades a supplier-flagged Flexible rate whose free-
  // cancellation window has already closed — otherwise the room list keeps
  // promising green while the cancel gate on the saved booking already
  // refuses.
  const getRefundStatusBadgeInRoomList = (nonRefundable, deadlinePassed = false) => {
    const value = String(nonRefundable).toLowerCase();
    switch (value) {
      case "false":
        return deadlinePassed ? (
          <Badge
            bg="danger"
            title="The free-cancellation window has already closed for this stay."
          >
            Deadline passed
          </Badge>
        ) : (
          <Badge bg="success">Flexible</Badge>
        );
      case "true":
        return <Badge bg="danger">Non-Refundable</Badge>;
      default:
        return <Badge bg="secondary">{String(nonRefundable)}</Badge>;
    }
  };

  const getRoomStatusBadge = (roomStatus) => {
    switch (roomStatus) {
      case "On Request":
        return (
          <small>
            This room can be booked{" "}
            <Badge bg="warning" text="dark" className="px-2 py-1 ms-1 fw-bold border border-warning shadow-sm">
              On Request
            </Badge>
          </small>
        );
      case "Available":
        return (
          // <small>
          //   {" "}
           
          //   <span className="bg-success text-white px-3 py-0 rounded">
          //     Available{" "}
          //   </span>
          // </small>
          <small>
  <span style={{ color: "#198754", fontWeight: "700" }}>
    Available
  </span>
</small>
        );
      default:
        return (
          <small>
            {" "}
            This room is Available{" "}

          </small>
        );
    }
  };

  const getRefundStatusBadge = (refundStatus) => {
    // console.log("SELECTED refundStatus:::", refundStatus);
    switch (refundStatus) {
      case "FLEXIBLE":
        return <Badge bg="success">Flexible</Badge>;
      case "NON REFUNDABLE":
        return <Badge bg="danger">Non-Refundable</Badge>;
      default:
        return <Badge bg="secondary">{refundStatus}</Badge>;
    }
  };

  const formatPrice = (price) => {
    // Rates are stored in AED; convert to the chosen display currency using
    // the carried-over factor (AED → factor 1). Display only — the raw AED
    // values still drive bookingData and the credit checks. We prefix the
    // code manually (not Intl currency style) since master currency codes are
    // not guaranteed to be valid ISO 4217 symbols.
    const converted = (Number(price) || 0) * (displayCurrency.factor || 1);
    return `${displayCurrency.code || "AED"} ${converted.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const renderStars = (rating) => {
    return Array.from({ length: rating }, (_, i) => (
      <FaStar key={i} className="text-warning" />
    ));
  };

  // Fetch the agent's available credit balance once roomData/payload is loaded
  useEffect(() => {
    const aId = roomData?.payload?.agentId;
    if (!aId) {
      setAgentBalance(null);
      setAgentBalanceDisplay(null);
      setAgentBalanceCurrency("AED");
      return;
    }
    let cancelled = false;
    axiosInstance
      .get(`/api/agent-credit-limit/agent/${aId}`)
      .then((res) => {
        // effectiveAvailableCreditLimit = regular available credit + any
        // currently-Active Temporary Credit Limit (same combined figure the
        // backend's check-sufficient-credit / booking-create flow use).
        // Falls back to availableCreditLimit for older cached responses.
        if (cancelled) return;
        setAgentBalance(
          res?.data?.effectiveAvailableCreditLimit ??
            res?.data?.availableCreditLimit ??
            null,
        );
        // Agent-currency display value + code from the same backend fields
        // this fix added on AgentCreditLimitResponseDTO. When the backend is
        // older (fields missing) both `??` chains land on the AED number
        // and the chip renders identically to before this fix.
        setAgentBalanceDisplay(
          res?.data?.effectiveAvailableCreditLimitInAgentCurrency ??
            res?.data?.availableCreditLimitInAgentCurrency ??
            res?.data?.effectiveAvailableCreditLimit ??
            res?.data?.availableCreditLimit ??
            null,
        );
        setAgentBalanceCurrency(res?.data?.currencyCode || "AED");
      })
      .catch(() => {
        if (!cancelled) {
          setAgentBalance(null);
          setAgentBalanceDisplay(null);
          setAgentBalanceCurrency("AED");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [roomData]);

  // Max cancellation nights for this hotel — MAX(noOfNights) across the
  // cancellation-policy rows configured at /hotel-actions/{id}/hotel-policy.
  // Fetched here for the same reason HotelBookingPage fetches it: the
  // free-cancellation deadline is checkInDate − maxCancellationNights, which
  // is exactly what the backend stores on the booking, so the room list, the
  // booking page, the Booking List and the voucher all show one date.
  const [maxCancellationNights, setMaxCancellationNights] = useState(null);

  useEffect(() => {
    const hotelId = roomData?.hotels?.[0]?.hotelId;
    if (!hotelId || roomData?.payload?.apiId !== 1) {
      setMaxCancellationNights(null);
      return undefined;
    }
    let cancelled = false;
    axiosInstance
      .get(`/api/hotels/${hotelId}/max-cancellation-nights`)
      .then((res) => {
        if (cancelled) return;
        const n = Number(res?.data);
        setMaxCancellationNights(Number.isFinite(n) ? n : 0);
      })
      .catch(() => {
        // No policy configured / call failed — leave null so the pill falls
        // back to "Non-refundable" rather than inventing a date.
        if (!cancelled) setMaxCancellationNights(null);
      });
    return () => {
      cancelled = true;
    };
  }, [roomData]);

  // One deadline for every rate on the page: it is a property of the hotel's
  // cancellation policy and the stay dates, not of the individual rate.
  const inhouseDeadline = resolveInhouseDeadline(
    roomData?.payload?.checkInDate,
    maxCancellationNights,
  );

  // Second useEffect to fetch policy details when roomData is available
  useEffect(() => {
    const fetchInhousePolicyDetails = async () => {
      if (!roomData || !roomData.hotels || roomData.hotels.length === 0) {
        return;
      }

      // Only call the API if apiId is equal to 1
      if (roomData.payload?.apiId !== 1) {
        return;
      }

      try {
        const hotelsdetail = roomData.hotels[0];
        const response = await axiosInstance.get(
          `/api/hotels/${hotelsdetail.hotelId}/policies`,
        );
        console.log("response for policy list:", response.data);
        setPolicyList(response.data);
      } catch (error) {
        // console.log("error for policy list :", error);
      }
    };

    fetchInhousePolicyDetails();
  }, [roomData]);

  // Fetch room types for the filter sidebar
  useEffect(() => {
    let cancelled = false;
    axiosInstance
      .get("/api/roomType?page=0&limit=10")
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res?.data?.content)
          ? res.data.content
          : [];
        setRoomTypeOptions(list);
      })
      .catch(() => {
        if (!cancelled) setRoomTypeOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleRoomType = (name) => {
    setSelectedRoomTypes((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  };

  const matchesFilters = (rate) => {
    const isNonRefundable =
      String(rate.nonRefundable).toLowerCase() === "true";
    if (refundFilter.refundable && refundFilter.nonRefundable) {
      // both checked → no narrowing on refundability
    } else if (refundFilter.refundable && isNonRefundable) {
      return false;
    } else if (refundFilter.nonRefundable && !isNonRefundable) {
      return false;
    }
    if (selectedRoomTypes.length > 0) {
      const mp = String(rate.mealPlan || "").toLowerCase();
      const hit = selectedRoomTypes.some(
        (name) => name && mp === String(name).toLowerCase(),
      );
      if (!hit) return false;
    }
    return true;
  };

  // Room-name search — matches on full name, and expands a handful of
  // common trade abbreviations so shorthand like "DLX" hits "Deluxe".
  const ROOM_ABBREVIATIONS = {
    dlx: "deluxe",
    dlux: "deluxe",
    del: "deluxe",
    sut: "suite",
    ste: "suite",
    std: "standard",
    stnd: "standard",
    sup: "superior",
    supr: "superior",
    exe: "executive",
    exec: "executive",
    pre: "premium",
    prem: "premium",
    pres: "presidential",
    jr: "junior",
    apt: "apartment",
    twn: "twin",
    kng: "king",
    qn: "queen",
    fmy: "family",
  };
  const matchesRoomSearch = (name) => {
    const q = String(roomSearch || "").trim().toLowerCase();
    if (!q) return true;
    const n = String(name || "").toLowerCase();
    if (n.includes(q)) return true;
    // token-by-token: each token can be a substring OR an abbreviation.
    const tokens = q.split(/\s+/).filter(Boolean);
    return tokens.every((t) => {
      if (n.includes(t)) return true;
      const expanded = ROOM_ABBREVIATIONS[t];
      return expanded ? n.includes(expanded) : false;
    });
  };

  if (loading) {
    return (
     <div className="min-vh-100 bg-light d-flex flex-column">
  {/* TopBar ALWAYS on top */}
  <TopBar />

  {/* Sidebar + Content */}
  <div className="d-flex flex-grow-1">
    <Sidebar />

    <main className="flex-grow-1 d-flex justify-content-center align-items-center">
      <div className="text-center results-loader">
        <div className="loader-ring">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </div>

        <h4 className="text-primary fw-bold mt-3 mb-1">
          Fetching Best Room Options...
        </h4>

        <p className="text-muted small mb-0">
          Comparing rates across providers
        </p>
      </div>
    </main>
  </div>
</div>
    );
  }

  if (error) {
    return (
     <div className="min-vh-100 bg-light d-flex flex-column">
  {/* TopBar always full width */}
  <TopBar />

  {/* Sidebar + content */}
  <div className="d-flex flex-grow-1">
    <Sidebar />

    <main className="flex-grow-1 d-flex justify-content-center align-items-center p-3">
      <div className="w-100" style={{ maxWidth: 480 }}>
        <Alert variant="danger" className="mb-3">
          <Alert.Heading>Error</Alert.Heading>
          <p className="mb-0">{error}</p>
        </Alert>

        <Button
          variant="primary"
          onClick={() => navigate("/new-booking/hotel")}
        >
          Back to Search
        </Button>
      </div>
    </main>
  </div>
</div>
    );
  }

  if (!roomData || !roomData.hotels || roomData.hotels.length === 0) {
    return (
      <div className="min-vh-100 bg-light d-flex flex-column">
  {/* TopBar – always full width */}
  <TopBar />

  {/* Sidebar + Content */}
  <div className="d-flex flex-grow-1">
    <Sidebar />

    <main className="flex-grow-1 d-flex justify-content-center align-items-center p-3">
      <Alert variant="info" className="text-center" style={{ maxWidth: 480 }}>
        <Alert.Heading>No Rooms Available</Alert.Heading>
        <p>No room data found for this hotel.</p>

        <Button
          variant="primary"
          onClick={() => navigate("/new-booking/hotel")}
        >
          Back to Search
        </Button>
      </Alert>
    </main>
  </div>
</div>
    );
  }

  // console.log("roomdata ::::::::::::::::::", roomData);
  const hotel = roomData.hotels[0];
  const payload = roomData.payload || {};

  // Stay length (nights) derived from the search-time payload so the
  // rate cards can label the total as "for N nights" instead of "per
  // night" for multi-night stays. Defaults to 1 so single-night stays
  // continue to say "per night" exactly as before.
  const stayNights = (() => {
    try {
      const ci = payload?.checkInDate ? new Date(payload.checkInDate) : null;
      const co = payload?.checkOutDate ? new Date(payload.checkOutDate) : null;
      if (ci && co && !isNaN(ci) && !isNaN(co)) {
        const diff = Math.round((co - ci) / (1000 * 60 * 60 * 24));
        if (diff > 0) return diff;
      }
    } catch (e) {
      /* fall through */
    }
    return 1;
  })();
  // console.log("selectedRate before bookingmodal:::", selectedRate);

  // Drives whether the static check-in/check-out row in the Hotel
  // Information card gets a top divider — it renders AFTER the policy
  // sections there, so it only needs the divider when at least one
  // policy section is actually shown above it.
  const hasHotelInfoPolicy =
    payload?.apiId === 1 &&
    ((policyList?.policies?.cancellationPolicy?.length ?? 0) > 0 ||
      (policyList?.policies?.amendmentPolicy?.length ?? 0) > 0 ||
      (policyList?.policies?.childPolicy?.length ?? 0) > 0);

  return (
    <div className= "min-vh-100 bg-light d-flex flex-column room-list-container">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main
          className="content-wrapper flex-grow-1"
          style={{ minWidth: 0, overflowX: "hidden" }}
        >
          <div className="container-fluid" style={{ paddingTop: "10px" }}>
            {/* Results-page heading — UI only, mirrors the heading shown
                on /new-booking/hotel (or /new-booking/hotel-24hr) once
                results arrive. */}
            <div className="hs-page-heading">
              <h3 className="hs-page-heading-title">
                {force24Hour ? "24 Hours" : "Accommodation"}
              </h3>
            </div>
            {/* Top toolbar: Back to Search + agent balance */}
            <div className="d-flex justify-content-between align-items-center mb-3 gap-2 flex-wrap">
              <Button
                variant="outline-primary"
                size="sm"
                onClick={() => {
                  // HotelSearch's "View Rooms" opens this page via
                  // window.open in a new tab, so this tab's own
                  // history is empty and navigate(-1) is a no-op.
                  // Prefer window.close() (the opener refocuses to
                  // the search tab it already has); fall back to
                  // in-app navigation for the direct-URL / refresh
                  // cases where window.close is blocked.
                  try {
                    if (window.opener && !window.opener.closed) {
                      try {
                        window.opener.focus();
                      } catch (_) {
                        /* cross-origin — best effort only */
                      }
                      window.close();
                      return;
                    }
                  } catch (_) {
                    /* ignore and fall through */
                  }
                  if (window.history.length > 1) navigate(-1);
                  else navigate("/new-booking/hotel");
                }}
                className="back-to-search-btn"
              >
                ← Back to Search
              </Button>
              {agentBalance != null && (
                <span
                  className="fw-bold"
                  style={{ color: "#dc3545", fontSize: "0.95rem" }}
                >
                  Available Balance: {Number(agentBalanceDisplay ?? agentBalance).toFixed(2)} {agentBalanceCurrency || "AED"}
                </span>
              )}
            </div>
            {/* Loader Modal */}
            <Modal
              show={loadingRate}
              centered
              backdrop="static"
              keyboard={false}
            >
              <Modal.Body className="text-center p-4">
                <Spinner animation="border" variant="primary" />
                <p className="mt-3 mb-0 fw-bold text-primary">
                  Fetching accurate rate...
                </p>
              </Modal.Body>
            </Modal>
            {/* Insufficient Credit Modal — informational gate. Does NOT
                block the booking; the user clicks OK and we resume the
                original handleBooking / handleProceedBooking path with
                skipCreditCheck=true, so they land on the booking page
                where they can complete payment online. */}
            <Modal
              show={showInsufficientCreditModal}
              onHide={() => {
                setShowInsufficientCreditModal(false);
                setPendingBookingFn(null);
              }}
              centered
              backdrop="static"
              keyboard={false}
            >
              <Modal.Header closeButton>
                <Modal.Title>Insufficient Credit Limit</Modal.Title>
              </Modal.Header>
              <Modal.Body>
                <p className="mb-2">
                  Your available credit limit is not enough to cover this
                  booking.
                </p>
                <p className="mb-3 text-muted small">
                  You can still continue — please choose{" "}
                  <strong>online payment</strong> on the booking page to
                  complete this reservation.
                </p>
                {/* Non-refundable warning — sits directly above the action
                    buttons so the agent sees it before confirming. */}
                <Alert
                  variant="warning"
                  className="mb-0 py-2 px-3 d-flex align-items-start gap-2"
                >
                  <FaExclamationTriangle className="mt-1 flex-shrink-0" />
                  <span className="small">
                    <strong>Please note:</strong> this is a non-refundable
                    booking — once confirmed, it cannot be cancelled or
                    refunded.
                  </span>
                </Alert>
              </Modal.Body>
              <Modal.Footer>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowInsufficientCreditModal(false);
                    setPendingBookingFn(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    const fn = pendingBookingFn;
                    setShowInsufficientCreditModal(false);
                    setPendingBookingFn(null);
                    if (typeof fn === "function") fn();
                  }}
                >
                  OK, continue
                </Button>
              </Modal.Footer>
            </Modal>
            {/* No Availability Modal */}
            <Modal
              show={showUnavailableModal}
              onHide={() => {
                setShowUnavailableModal(false);
                navigate("/new-booking/hotel");
              }}
              centered
              backdrop="static"
              keyboard={false}
            >
              <Modal.Header closeButton>
                <Modal.Title>No Rooms Available</Modal.Title>
              </Modal.Header>
              <Modal.Body>
                <p className="mb-0">
                  Rooms not available for the selected dates.
                </p>
              </Modal.Body>
              <Modal.Footer>
                <Button
                  variant="primary"
                  onClick={() => {
                    setShowUnavailableModal(false);
                    navigate("/new-booking/hotel");
                  }}
                >
                  Back to Search
                </Button>
              </Modal.Footer>
            </Modal>
            {/* Hotel Header */}
            <Card className="hotel-header-card mb-4">
              <Card.Body className="p-4">
                <Row>
                  <Col md={8}>
                    <div className="d-flex align-items-start gap-3">
                      <div className="hotel-icon">
                        <FaHotel size={40} className="text-primary" />
                      </div>
                      <div className="hotel-info">
                        <h2 className="hotel-name mb-2">{hotel.hotelName}</h2>
                        <div className="d-flex align-items-center gap-3 mb-2">
                          <div className="star-rating">
                            {renderStars(hotel.starRating)}
                          </div>
                          <Badge bg="primary">{hotel.propertyType}</Badge>
                          <Badge bg="info">{hotel.chain}</Badge>
                        </div>
                        <div className="hotel-details">
                          <p className="mb-1">
                            <FaMapMarkerAlt className="text-muted me-2" />
                            {hotel.hotelAddress}
                          </p>
                          <p className="mb-0">
                            <FaPhone className="text-muted me-2" />
                            {hotel.hotelPhoneNumber}
                          </p>
                          <div className="mt-2">
                            <small className="text-muted">
                              <strong>Please note:</strong>{" "}
                              <p className="someproperties">
                                {" "}
                                Some properties may collect additional charges
                                such as city tax, resort fees, or security
                                deposits during check-in. Policies such as
                                check-in time, child accommodation, and
                                cancellation rules can vary by room and
                                provider.
                              </p>
                            </small>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Col>
                  {console.log("hotel::", hotel)}
                  <Col md={4}>
                    <Card className="booking-summary">
                      <Card.Body className="p-3">
                        <h6 className="mb-3">Booking Summary</h6>
                        <div className="booking-details">
                          <div className="d-flex justify-content-between mb-2">
                            <span>
                              <FaCalendarAlt className="text-muted me-2" />
                              Check-in:
                            </span>
                            <span className="fw-semibold">
                              {payload.checkInDate || hotel.checkInDate}
                            </span>
                          </div>
                          <div className="d-flex justify-content-between mb-2">
                            <span>
                              <FaCalendarAlt className="text-muted me-2" />
                              Check-out:
                            </span>
                            <span className="fw-semibold">
                              {payload.checkOutDate || hotel.checkOutDate}
                            </span>
                          </div>
                          {/* Nights count — derived from check-in / check-out
                              so it always matches whatever dates the operator
                              searched. Same stayNights used by the rate-card
                              "for N nights" label above, so the two views
                              never disagree. Mirrors the same row in
                              ExternalApiRoomList.jsx's Booking Summary. */}
                          <div className="d-flex justify-content-between mb-2">
                            <span>
                              <FaCalendarAlt className="text-muted me-2" />
                              Nights:
                            </span>
                            <span className="fw-semibold">
                              {stayNights} {stayNights === 1 ? "night" : "nights"}
                            </span>
                          </div>
                          <div className="mb-2">
                            <div className="d-flex justify-content-between">
                              <span>
                                <FaUsers className="text-muted me-2" />
                                Guests:
                              </span>
                              {Array.isArray(payload.rooms) &&
                                payload.rooms.length <= 1 && (
                                  <span className="fw-semibold">
                                    {hotel.guestBreakdown}
                                  </span>
                                )}
                            </div>
                            {Array.isArray(payload.rooms) &&
                              payload.rooms.length > 1 && (
                                <div className="mt-1 ps-4 guest-breakdown-list">
                                  {payload.rooms.map((r, i) => {
                                    const a = r.adults || 0;
                                    const c = r.children || 0;
                                    const parts = [];
                                    if (a) parts.push(`${a} adult${a > 1 ? "s" : ""}`);
                                    if (c) parts.push(`${c} child${c > 1 ? "ren" : ""}`);
                                    return (
                                      <div
                                        key={i}
                                        className="d-flex justify-content-between small"
                                      >
                                        <span className="text-muted">
                                          Room {i + 1}:
                                        </span>
                                        <span className="fw-semibold">
                                          {parts.join(", ") || "—"}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                          </div>
                          <div className="d-flex justify-content-between">
                            <span>
                              <FaBed className="text-muted me-2" />
                              Rooms:
                            </span>
                            <span className="fw-semibold">
                              {hotel.numberOfRooms}
                            </span>
                          </div>
                          <div className="d-flex justify-content-between">
                            <span>
                              <FaGlobe className="text-muted me-2" />
                              Nationality:
                            </span>
                            <span className="fw-semibold">
                              {hotel.nationality}
                            </span>
                          </div>
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>
              </Card.Body>
            </Card>

            {/* Room Categories Accordion */}
            <div className="room-categories-section">
              <div className="d-flex justify-content-between align-items-center mb-4 gap-2 flex-wrap">
                <h4 className="mb-0">Available Room Categories</h4>
                <div className="d-flex align-items-center gap-2 flex-wrap ms-auto">
                  <Form.Control
                    type="search"
                    size="sm"
                    placeholder="Search room (e.g. DLX, SUT)"
                    value={roomSearch}
                    onChange={(e) => setRoomSearch(e.target.value)}
                    style={{ width: 220 }}
                    aria-label="Search room categories"
                  />
                <div className="btn-group shadow-sm gap-1" role="group">
                  <Button
                    variant={viewMode === "grid" ? "primary" : "outline-primary"}
                    onClick={() => setViewMode("grid")}
                    className="d-flex align-items-center gap-2"
                    size="sm"
                  >
                    <span className="fs-5" style={{ lineHeight: 1 }}>⊞</span>
                  </Button>
                  <Button
                    variant={viewMode === "list" ? "primary" : "outline-primary"}
                    onClick={() => setViewMode("list")}
                    className="d-flex align-items-center gap-2"
                    size="sm"
                  >
                    <span className="fs-5" style={{ lineHeight: 1 }}>☰</span>
                  </Button>
                </div>
                </div>
              </div>

              <Row className="g-3">
                <Col lg={3} md={4}>
                  <Card className="room-filters-card">
                    <Card.Body className="p-3">
                      <h6 className="filter-title mb-3">Filters</h6>

                      <div className="filter-group mb-3">
                        <div className="filter-group-label">Refund Policy</div>
                        <Form.Check
                          type="checkbox"
                          id="filter-refundable"
                          label="Refundable"
                          checked={refundFilter.refundable}
                          onChange={(e) =>
                            setRefundFilter((p) => ({
                              ...p,
                              refundable: e.target.checked,
                            }))
                          }
                        />
                        <Form.Check
                          type="checkbox"
                          id="filter-nonrefundable"
                          label="Non Refundable"
                          checked={refundFilter.nonRefundable}
                          onChange={(e) =>
                            setRefundFilter((p) => ({
                              ...p,
                              nonRefundable: e.target.checked,
                            }))
                          }
                        />
                      </div>

                      <div className="filter-group">
                        <div className="filter-group-label">Room Type</div>
                        {roomTypeOptions.length === 0 ? (
                          <div className="text-muted small">No options</div>
                        ) : (
                          roomTypeOptions.map((rt) => (
                            <Form.Check
                              key={rt.roomtypeId ?? rt.code ?? rt.name}
                              type="checkbox"
                              id={`filter-rt-${rt.roomtypeId ?? rt.code ?? rt.name}`}
                              label={rt.name}
                              checked={selectedRoomTypes.includes(rt.name)}
                              onChange={() => toggleRoomType(rt.name)}
                            />
                          ))
                        )}
                      </div>

                      {(refundFilter.refundable ||
                        refundFilter.nonRefundable ||
                        selectedRoomTypes.length > 0) && (
                        <Button
                          variant="link"
                          size="sm"
                          className="p-0 mt-2"
                          onClick={() => {
                            setRefundFilter({
                              refundable: false,
                              nonRefundable: false,
                            });
                            setSelectedRoomTypes([]);
                          }}
                        >
                          Clear filters
                        </Button>
                      )}
                    </Card.Body>
                  </Card>
                </Col>

                <Col lg={9} md={8}>
              {/* Per-room Accordion wrapper.
                  Single-room mode (numRooms === 1): renders the existing
                  rate Accordion once, unwrapped — identical to legacy
                  behavior, zero regression.
                  Multi-room mode (numRooms > 1): renders the same inner
                  Accordion once PER ROOM SLOT, each wrapped in its own
                  "Room N" Accordion with the slot's current selection
                  shown in the header. Mirrors the ExternalApi pattern. */}
              {(isMultiRoom ? selectedRooms : [null]).map((_slot, roomSlotIndex) => {
                // Per-slot expanded-category key. Read from the map so
                // Room 1 and Room 2 keep independent expansion state.
                const slotActiveKey = activeAccordions[roomSlotIndex] ?? null;
                const setSlotActiveKey = (key) =>
                  setActiveAccordions((prev) => ({
                    ...prev,
                    [roomSlotIndex]: key,
                  }));
                // Sort room categories ascending by their cheapest rate,
                // and — inside each category — sort the individual rate
                // cards the same way, so the operator always sees the
                // most affordable option first. Falls back gracefully
                // when a category has no rates.
                const priceOf = (r) => {
                  const v = Number(r?.rate);
                  return Number.isFinite(v) ? v : Number.POSITIVE_INFINITY;
                };
                const sortedRoomCategories = [
                  ...(hotel.roomCategories || []),
                ]
                  .map((cat) => ({
                    ...cat,
                    availableRates: [...(cat.availableRates || [])].sort(
                      (a, b) => priceOf(a) - priceOf(b),
                    ),
                  }))
                  .sort((a, b) => {
                    const minA = a.availableRates.length
                      ? priceOf(a.availableRates[0])
                      : Number.POSITIVE_INFINITY;
                    const minB = b.availableRates.length
                      ? priceOf(b.availableRates[0])
                      : Number.POSITIVE_INFINITY;
                    return minA - minB;
                  });
                const inner = (
              <Accordion
                activeKey={slotActiveKey}
                onSelect={(key) => setSlotActiveKey(key)}
              >
                {sortedRoomCategories.map((category, index) => {
                  const eventKey = index.toString();
                  const isActive = slotActiveKey === eventKey;
                  const filteredRates = (category.availableRates || []).filter(
                    matchesFilters,
                  );
                  if (filteredRates.length === 0) return null;
                  if (!matchesRoomSearch(category.roomCategory)) return null;

                  return (
                    <Accordion.Item
                      key={eventKey}
                      eventKey={eventKey}
                      className="room-category-item"
                    >
                      {/* ✅ Header is NOT clickable */}
                      <Accordion.Header
                        as="div"
                        className="room-category-header"
                      >
                        <div className="d-flex justify-content-between align-items-center w-100">
                          <div className="room-category-info">
                            <h5 className="mb-1">{category.roomCategory}</h5>
                          </div>

                          <div className="d-flex align-items-center gap-3">
                            <div className="room-category-price text-end">
                              <div className="price-range">
                                From{" "}
                                {formatPrice(
                                  Math.min(
                                    ...filteredRates.map(
                                      (rate) => rate.rate,
                                    ),
                                  ),
                                )}
                              </div>
                              <div className="rates-count small text-muted">
                                {filteredRates.length} rate
                                {filteredRates.length !== 1
                                  ? "s"
                                  : ""}{" "}
                                available
                              </div>
                            </div>

                            <div className="d-flex flex-column align-items-end gap-1">
                              {/* ✅ Button toggle */}
                              <AccordionToggleButton
                                eventKey={eventKey}
                                isActive={isActive}
                              />
                              {payload?.apiId === 1 &&
                                policyList?.policies?.cancellationPolicy
                                  ?.length > 0 && (
                                  <a
                                    href="#hotel-information-section"
                                    className="small"
                                    onClick={(e) => {
                                      // Stop propagation — this link sits
                                      // inside the Accordion.Header, which
                                      // react-bootstrap always wraps in a
                                      // toggle <button>; without this the
                                      // click also expands/collapses the
                                      // accordion body.
                                      e.preventDefault();
                                      e.stopPropagation();
                                      document
                                        .getElementById(
                                          "hotel-information-section",
                                        )
                                        ?.scrollIntoView({
                                          behavior: "smooth",
                                          block: "start",
                                        });
                                    }}
                                  >
                                    Cancellation Policy
                                  </a>
                                )}
                            </div>
                          </div>
                        </div>
                      </Accordion.Header>

                      <Accordion.Body
                        className="room-rates-section"
                        style={isMultiRoom ? { padding: "0.5rem" } : undefined}
                      >
                        <Row className={isMultiRoom ? "g-2" : ""}>
                          {filteredRates.map((rate, rateIndex) => {
                            // Highlight ONLY the card chosen for THIS room
                            // slot. Other slots' picks must not change the
                            // appearance of cards in this slot's list.
                            const isSelectedForThisSlot = isMultiRoom &&
                              selectedRooms[roomSlotIndex]?.selectedRate === rate;
                            return (
                            <Col key={rateIndex} lg={viewMode === "grid" ? 6 : 12} xl={viewMode === "grid" ? 4 : 12} className={isMultiRoom ? "mb-1" : "mb-2"}>
                              <Card
                                className={`rate-card h-100 shadow-sm${isSelectedForThisSlot ? " rate-card-selected" : ""}`}
                                style={
                                  isSelectedForThisSlot
                                    ? {
                                        borderColor: "#198754",
                                        borderWidth: "2px",
                                        backgroundColor: "#e8f5ec",
                                        position: "relative",
                                      }
                                    : undefined
                                }
                              >
                                {isSelectedForThisSlot && (
                                  <span
                                    style={{
                                      position: "absolute",
                                      top: "6px",
                                      right: "6px",
                                      backgroundColor: "#198754",
                                      color: "#fff",
                                      fontSize: "0.7rem",
                                      fontWeight: 700,
                                      padding: "2px 6px",
                                      borderRadius: "4px",
                                      zIndex: 1,
                                    }}
                                  >
                                    ✓ Selected
                                  </span>
                                )}
                                {viewMode === "grid" ? (
                                  <Card.Body className="p-2 pb-0 d-flex flex-column gap-2">
                                    {/* Header */}
                                    <div className="rate-header d-flex justify-content-between align-items-start">
                                      <div>
                                        <div className="d-flex align-items-center gap-2">
                                          {getMealPlanIcon(rate.mealPlan)}
                                          <span className="fw-semibold small">
                                            {rate.mealPlan}
                                          </span>
                                        </div>

                                        <div className="mt-1">
                                          {getRoomStatusBadge(rate.roomStatus)}
                                        </div>
                                      </div>

                                      {getRefundStatusBadgeInRoomList(
                                        rate.nonRefundable,
                                        isDeadlinePassed(inhouseDeadline),
                                      )}
                                    </div>

                                    {/* Pricing
                                        Single-room: big price = rate
                                        × numberOfRooms, with "rate × N rooms"
                                        subtitle (legacy display).
                                        Multi-room: each slot is ONE room,
                                        so the big price is the per-room
                                        rate (`totalRate`) and the
                                        "× N rooms" subtitle is dropped —
                                        otherwise every slot would show
                                        the bulk price, which is wrong. */}
                                    <div className="rate-pricing text-center py-2">
                                      <div className="current-price">
                                        {formatPrice(
                                          isMultiRoom
                                            ? rate.totalRate || 0
                                            : rate.roomRateBasedOnRoomCount,
                                        )}
                                      </div>

                                      {/* {rate.recommendedRetailPrice >
                                        rate.totalRate && (
                                        <div className="original-price text-decoration-line-through">
                                          {formatPrice(
                                            rate.recommendedRetailPrice,
                                          )}
                                        </div>
                                      )} */}

                                      {/* Simplified per-operator request: drop the
                                          "rate × N rooms" breakdown line and show
                                          just "for N nights" beneath the total price
                                          (or "per night" for single-night stays). */}
                                      <div className="price-per-night small text-muted">
                                        {stayNights > 1
                                          ? `for ${stayNights} nights`
                                          : "per night"}
                                      </div>
                                    </div>

                                    {/* Features */}
                                    <div className="rate-features small">
                                      <div className="feature-item">
                                        <FaInfoCircle className="me-2 text-muted" />
                                        {rate.contractLabel}
                                      </div>

                                      {/* Same deadline the booking page shows:
                                          checkIn − the hotel's max cancellation
                                          nights, at 2 PM UAE. */}
                                      <div className="feature-item">
                                        <RateDeadlinePill
                                          rate={rate}
                                          deadline={inhouseDeadline}
                                          timeLabel={DEADLINE_TIME_EOD}
                                        />
                                      </div>

                                      <div className="feature-item">
                                        <Button
                                          variant="link"
                                          size="sm"
                                          className="p-0 text-decoration-underline"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openPoliciesModal(rate, hotel);
                                          }}
                                        >
                                          <FaShieldAlt className="me-2" />
                                          Cancellation Policies &amp; Terms &amp; Conditions
                                        </Button>
                                      </div>
                                    </div>

                                    {/* CTA — in single-room mode behaves
                                        exactly as before (opens the
                                        booking modal). In multi-room mode
                                        becomes a per-room radio toggle
                                        bound to the active room slot;
                                        see `selectedRooms`. */}
                                    {isMultiRoom ? (
                                      <Form.Check
                                        type="radio"
                                        id={`rate-radio-grid-${roomSlotIndex}-${index}-${rateIndex}`}
                                        name={`rate-radio-grid-room-${roomSlotIndex}`}
                                        className="w-100 mt-1 mb-1"
                                        label={
                                          selectedRooms[roomSlotIndex]
                                            ?.selectedRate === rate
                                            ? `Selected for Room ${roomSlotIndex + 1}`
                                            : `Select for Room ${roomSlotIndex + 1}`
                                        }
                                        checked={
                                          selectedRooms[roomSlotIndex]
                                            ?.selectedRate === rate
                                        }
                                        // Controlled radio: onChange is a
                                        // no-op so React does not warn, and
                                        // onClick drives the state update.
                                        // onClick fires on every click
                                        // (including clicks that would
                                        // otherwise silently re-check an
                                        // already-selected radio without
                                        // firing onChange), so the user can
                                        // switch between rates or clear the
                                        // selection reliably. stopPropagation
                                        // shields the click from the parent
                                        // Accordion, which would otherwise
                                        // collapse the category on click.
                                        onChange={() => {}}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRateSelect(
                                            roomSlotIndex,
                                            rate,
                                            hotel.hotelId,
                                            hotel.hotelName,
                                          );
                                        }}
                                      />
                                    ) : (
                                      <Button
                                        variant="primary"
                                        className="w-100 book-now-btn mt-1 mb-1"
                                        onClick={() => handleBooking(rate)}
                                      >
                                        <FaMoneyBillWave className="me-2" />
                                        View Details / Select
                                      </Button>
                                    )}
                                  </Card.Body>
                                ) : (
                                  <Card.Body className={isMultiRoom ? "p-2 d-flex flex-row align-items-center gap-2 flex-wrap flex-md-nowrap" : "p-3 py-2 d-flex flex-row align-items-center gap-3 flex-wrap flex-md-nowrap"}>
                                    {isMultiRoom && (
                                      <div
                                        className="flex-shrink-0 order-first ps-3"
                                        style={{ minWidth: "170px" }}
                                      >
                                        <Form.Check
                                          type="radio"
                                          id={`rate-radio-list-${roomSlotIndex}-${index}-${rateIndex}`}
                                          name={`rate-radio-list-room-${roomSlotIndex}`}
                                          label={
                                            selectedRooms[roomSlotIndex]
                                              ?.selectedRate === rate
                                              ? `Selected for Room ${roomSlotIndex + 1}`
                                              : `Select for Room ${roomSlotIndex + 1}`
                                          }
                                          checked={
                                            selectedRooms[roomSlotIndex]
                                              ?.selectedRate === rate
                                          }
                                          // See the grid-mode radio above for
                                          // the rationale. onClick fires on
                                          // every click so the user can
                                          // switch between rates or clear
                                          // the selection; stopPropagation
                                          // shields the click from the
                                          // Accordion parent.
                                          onChange={() => {}}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRateSelect(
                                              roomSlotIndex,
                                              rate,
                                              hotel.hotelId,
                                              hotel.hotelName,
                                            );
                                          }}
                                          style={{ whiteSpace: "nowrap" }}
                                        />
                                      </div>
                                    )}
                                    <div
                                      className="d-flex flex-column flex-grow-1"
                                      style={{ minWidth: 0 }}
                                    >
                                      <div className={`d-flex align-items-center flex-wrap gap-2 ${isMultiRoom ? "mb-1" : "mb-2"}`}>
                                        <div
                                          className="d-flex align-items-center gap-2 flex-shrink-0"
                                          style={{
                                            whiteSpace: "nowrap",
                                            minWidth: "200px",
                                          }}
                                        >
                                          {getMealPlanIcon(rate.mealPlan)}
                                          <span className="fw-semibold text-truncate">
                                            {rate.mealPlan}
                                          </span>
                                        </div>
                                        <div className="d-flex align-items-center gap-2 flex-shrink-0">
                                          {getRefundStatusBadgeInRoomList(
                                            rate.nonRefundable,
                                            isDeadlinePassed(inhouseDeadline),
                                          )}
                                          {rate.roomStatus === "On Request" ? (
                                            <Badge
                                              bg="warning"
                                              text="dark"
                                              className="px-2 py-1 fw-bold border border-warning"
                                            >
                                              On Request
                                            </Badge>
                                          ) : (
                                            <Badge bg="success">Available</Badge>
                                          )}
                                        </div>
                                      </div>
                                      <div
                                        className={isMultiRoom ? "rate-features small text-muted d-flex flex-column align-items-start gap-1" : "rate-features small text-muted d-flex flex-wrap gap-3"}
                                        style={{ minWidth: 0 }}
                                      >
                                        <div className={`feature-item d-flex align-items-center text-truncate ${isMultiRoom ? "w-100" : ""}`}>
                                          <FaInfoCircle className="me-2 flex-shrink-0" />
                                          <span className="text-truncate">
                                            {rate.contractLabel}
                                          </span>
                                        </div>
                                        <div className="feature-item d-flex align-items-center">
                                          <FaInfoCircle className="me-2 flex-shrink-0" />
                                          <RateDeadlinePill
                                            rate={rate}
                                            deadline={inhouseDeadline}
                                            timeLabel={DEADLINE_TIME_EOD}
                                          />
                                        </div>
                                        <div className="feature-item d-flex align-items-center">
                                          <Button
                                            variant="link"
                                            size="sm"
                                            className="p-0 text-decoration-underline"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              openPoliciesModal(rate, hotel);
                                            }}
                                          >
                                            <FaShieldAlt className="me-2" />
                                            Cancellation Policies &amp; Terms &amp; Conditions
                                          </Button>
                                        </div>
                                      </div>
                                    </div>

                                    <div
                                      className={`text-end px-3 flex-shrink-0 ${isMultiRoom ? "border-start" : "border-start border-end"}`}
                                      style={{ minWidth: "150px" }}
                                    >
                                      <div className="fs-5 fw-bold text-primary">
                                        {formatPrice(
                                          isMultiRoom
                                            ? rate.totalRate || 0
                                            : rate.roomRateBasedOnRoomCount,
                                        )}
                                      </div>
                                      {/* See sibling in the grid view above — same
                                          simplification: drop the breakdown, show only
                                          "for N nights" (or "per night" for K=1). */}
                                      <div className="small text-muted">
                                        {stayNights > 1
                                          ? `for ${stayNights} nights`
                                          : "per night"}
                                      </div>
                                    </div>

                                    {!isMultiRoom && (
                                      <div className="flex-shrink-0">
                                        <Button
                                          variant="primary"
                                          className="book-now-btn px-3 py-2"
                                          onClick={() => handleBooking(rate)}
                                          style={{ whiteSpace: "nowrap" }}
                                        >
                                          <FaMoneyBillWave className="me-2" />
                                          View Details
                                        </Button>
                                      </div>
                                    )}
                                  </Card.Body>
                                )}
                              </Card>
                            </Col>
                            );
                          })}
                        </Row>
                      </Accordion.Body>
                    </Accordion.Item>
                  );
                })}
                {hotel.roomCategories.every(
                  (c) =>
                    (c.availableRates || []).filter(matchesFilters).length ===
                    0,
                ) && (
                  <Alert variant="info" className="mb-0">
                    No rates match the selected filters.
                  </Alert>
                )}
              </Accordion>
                );
                // Single-room mode: render the inner Accordion directly,
                // unchanged from the legacy layout.
                if (!isMultiRoom) {
                  return (
                    <React.Fragment key="single-room">{inner}</React.Fragment>
                  );
                }
                // Multi-room mode: wrap each room slot in its own
                // "Room N" Accordion item with the current selection
                // shown as a badge in the header.
                const slotSelection = selectedRooms[roomSlotIndex];
                return (
                  <Accordion
                    key={`room-slot-${roomSlotIndex}`}
                    // No defaultActiveKey — all room accordions start
                    // collapsed. Each room slot is rendered in its OWN
                    // <Accordion>, so opening / closing one has no effect
                    // on any other; the operator toggles each room's
                    // header independently.
                    className="mb-3 room-slot-accordion"
                  >
                    <Accordion.Item eventKey={`room-slot-${roomSlotIndex}`}>
                      <Accordion.Header>
                        <div className="d-flex w-100 justify-content-between align-items-center pe-3">
                          <span className="fw-semibold">
                            <FaBed className="me-2 text-primary" />
                            Room {roomSlotIndex + 1}
                          </span>
                          {slotSelection?.selectedRate ? (
                            <Badge bg="success" className="ms-2">
                              {slotSelection.selectedRate.roomCategory}
                              {" — "}
                              {formatPrice(
                                // Per-room rate (not the bulk
                                // numberOfRooms-multiplied figure) so
                                // the slot badge matches the per-room
                                // price shown on the rate card.
                                slotSelection.selectedRate.totalRate || 0,
                              )}
                            </Badge>
                          ) : (
                            <Badge bg="warning" text="dark" className="ms-2">
                              Not selected
                            </Badge>
                          )}
                        </div>
                      </Accordion.Header>
                      <Accordion.Body>{inner}</Accordion.Body>
                    </Accordion.Item>
                  </Accordion>
                );
              })}

              {/* Multi-room "Continue with Booking" CTA. Only shown when
                  the search asked for more than one room. Disabled until
                  every room slot has a rate selection. On click,
                  combines all picks into the single-`selectedRate` shape
                  the existing HotelBookingPage already understands. */}
              {isMultiRoom && (() => {
                // Highlighted status banner for multi-room progress.
                // Colour + icon flip from amber (in progress) to green
                // (all rooms picked) so operators can read booking state
                // at a glance. Logic is unchanged — same disable rule and
                // handleProceedBooking() onClick as before.
                const selectedCount = selectedRooms.filter(
                  (r) => r.selectedRate,
                ).length;
                const pct =
                  numRooms > 0
                    ? Math.round((selectedCount / numRooms) * 100)
                    : 0;
                const done = allRoomsSelected;
                const accent = done ? "#198754" : "#fd7e14";
                return (
                  <div
                    className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mt-3 p-3 rounded-3 shadow-sm"
                    style={{
                      borderLeft: `6px solid ${accent}`,
                      border: `1px solid ${done ? "#a7d7b8" : "#fed7aa"}`,
                      backgroundColor: done ? "#e8f5ec" : "#fff7ed",
                    }}
                  >
                    <div className="d-flex align-items-center gap-3">
                      <div
                        className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
                        style={{
                          width: 46,
                          height: 46,
                          backgroundColor: accent,
                          color: "#fff",
                          fontSize: "1.3rem",
                        }}
                      >
                        {done ? <FaCheckCircle /> : <FaInfoCircle />}
                      </div>
                      <div>
                        <div
                          className="fw-bold"
                          style={{
                            fontSize: "1.05rem",
                            color: done ? "#14653a" : "#9a3412",
                          }}
                        >
                          {done
                            ? `All ${numRooms} room${numRooms === 1 ? "" : "s"} selected`
                            : `Select rates for your ${numRooms} rooms`}
                        </div>
                        <div className="small text-muted mb-2">
                          {done
                            ? "You're ready to continue with your booking."
                            : `Pick a rate for each room to continue — ${selectedCount} of ${numRooms} selected.`}
                        </div>
                        <div
                          className="progress"
                          style={{
                            height: 6,
                            width: 240,
                            maxWidth: "100%",
                            backgroundColor: "#e9ecef",
                          }}
                        >
                          <div
                            className="progress-bar"
                            role="progressbar"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: accent,
                              transition: "width .3s ease",
                            }}
                            aria-valuenow={selectedCount}
                            aria-valuemin={0}
                            aria-valuemax={numRooms}
                          />
                        </div>
                      </div>
                    </div>
                    <Button
                      variant={done ? "success" : "primary"}
                      size="lg"
                      disabled={!allRoomsSelected}
                      onClick={() => handleProceedBooking()}
                      className="flex-shrink-0"
                    >
                      <FaMoneyBillWave className="me-2" />
                      Continue with Booking
                    </Button>
                  </div>
                );
              })()}
                </Col>
              </Row>
            </div>

            {/* Hotel Information Section — leads with every hotel-level
                policy returned by GET /api/hotels/{id}/policies (policyList:
                cancellationPolicy, amendmentPolicy, childPolicy), then the
                static check-in/check-out details below. This is the scroll
                target of the "Cancellation Policy" link under each room
                category's View Details/Book button above. Additional Policy
                and per-rate Terms & Conditions still live exclusively in the
                per-rate "Cancellation Policies & Terms & Conditions" modal,
                unchanged. */}
            <div className="mt-4" id="hotel-information-section">
              <Card
                className="mb-4 shadow-sm"
                style={{ overflow: "hidden", border: "1px solid #e5e9f0" }}
              >
                <Card.Header
                  className="d-flex align-items-center gap-3 py-3"
                  style={{
                    background: "#f4f7fc",
                    color: "#2b3648",
                    border: "none",
                    borderBottom: "1px solid #e5e9f0",
                  }}
                >
                  <div
                    className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
                    style={{
                      width: 40,
                      height: 40,
                      backgroundColor: "#e3ecfb",
                      color: "#3b6fd6",
                      fontSize: "1.15rem",
                    }}
                  >
                    <FaHotel />
                  </div>
                  <div>
                    <div
                      className="fw-bold"
                      style={{ fontSize: "1.1rem", lineHeight: 1.2 }}
                    >
                      Hotel Information
                    </div>
                    <div className="small text-muted">
                      General check-in &amp; stay details
                    </div>
                  </div>
                </Card.Header>
                <Card.Body className="p-4">
                  {payload?.apiId === 1 &&
                    policyList?.policies?.cancellationPolicy?.length > 0 && (
                      <div className="mb-3">
                        <h6 className="text-danger mb-3">
                          <FaTimesCircle className="me-2" />
                          Cancellation Policy
                        </h6>
                        <ul className="mb-0 ps-3">
                          {policyList.policies.cancellationPolicy.map(
                            (policy, idx) => {
                              const validity = renderPolicyValidity(
                                policy?.fromDate,
                                policy?.toDate,
                              );
                              return (
                                <li key={idx} className="mb-2">
                                  <div style={{ whiteSpace: "pre-line" }}>
                                    {policy?.policyText || ""}
                                  </div>
                                  {validity && (
                                    <small className="text-muted">
                                      {validity}
                                    </small>
                                  )}
                                </li>
                              );
                            },
                          )}
                        </ul>
                      </div>
                    )}

                  {payload?.apiId === 1 &&
                    policyList?.policies?.amendmentPolicy?.length > 0 && (
                      <div className="mb-3 pt-3 border-top">
                        <h6 className="text-warning mb-3">
                          <FaInfoCircle className="me-2" />
                          Amendment Policy
                        </h6>
                        <ul className="mb-0 ps-3">
                          {policyList.policies.amendmentPolicy.map(
                            (policy, idx) => {
                              const validity = renderPolicyValidity(
                                policy?.fromDate,
                                policy?.toDate,
                              );
                              return (
                                <li key={idx} className="mb-2">
                                  <div style={{ whiteSpace: "pre-line" }}>
                                    {policy?.policyText || ""}
                                  </div>
                                  {validity && (
                                    <small className="text-muted">
                                      {validity}
                                    </small>
                                  )}
                                </li>
                              );
                            },
                          )}
                        </ul>
                      </div>
                    )}

                  {payload?.apiId === 1 &&
                    policyList?.policies?.childPolicy?.length > 0 && (
                      <div className="mt-4 pt-3 border-top">
                        <h6 className="text-primary mb-3">
                          <FaUsers className="me-2" />
                          Child Policy
                        </h6>
                        <ul className="mb-0 ps-3">
                          {policyList.policies.childPolicy.map(
                            (policy, idx) => {
                              const validity = renderPolicyValidity(
                                policy?.fromDate,
                                policy?.toDate,
                              );
                              return (
                                <li key={idx} className="mb-2">
                                  <div style={{ whiteSpace: "pre-line" }}>
                                    {policy?.policyText || ""}
                                  </div>
                                  {validity && (
                                    <small className="text-muted">
                                      {validity}
                                    </small>
                                  )}
                                </li>
                              );
                            },
                          )}
                        </ul>
                      </div>
                    )}

                  <Row
                    className={`g-3${hasHotelInfoPolicy ? " mt-1 pt-3 border-top" : ""}`}
                  >
                    <Col md={6}>
                      <div className="d-flex justify-content-between border-bottom pb-2 mb-2">
                        <span className="text-muted">Check-in</span>
                        <span className="fw-semibold">After 14:00</span>
                      </div>
                      <div className="d-flex justify-content-between border-bottom pb-2 mb-2">
                        <span className="text-muted">Check-out</span>
                        <span className="fw-semibold">Before 12:00</span>
                      </div>
                    </Col>
                    <Col md={6}>
                      <div className="d-flex justify-content-between border-bottom pb-2 mb-2">
                        <span className="text-muted">Deposit</span>
                        <span className="fw-semibold">May be required</span>
                      </div>
                      <div className="d-flex justify-content-between border-bottom pb-2 mb-2">
                        <span className="text-muted">Additional Bed</span>
                        <span className="fw-semibold">
                          Subject to availability
                        </span>
                      </div>
                    </Col>
                  </Row>
                </Card.Body>
              </Card>
            </div>
          </div>
        </main>
      </div>

      {/* Booking Modal */}
      <Modal
        show={showBookingModal}
        onHide={() => setShowBookingModal(false)}
        size="xl"
        aria-labelledby="room-detail-modal"
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title id="room-detail-modal">Room Details</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedRate && (
            <Row className="g-4">
              {/* Stock room photos and the hardcoded amenity badges used to sit
                  here. Both were identical for every hotel, so the modal now
                  shows only what the search actually returned for this rate. */}
              <Col md={12}>
                <h5 className="mb-2">{selectedRate.roomCategory}</h5>
                <p className="text-muted">{selectedRate.roomTypeDescription}</p>
                <div className="booking-details-modal">
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <span>Meal Plan:</span>
                    <span className="fw-semibold">{selectedRate.mealPlan}</span>
                  </div>
                  {activeUserRole === "ADMIN" && (
                    <div className="d-flex justify-content-between mb-2">
                      <span>Selling Price:</span>
                      <span className="fw-semibold text-primary">
                        {formatPrice(selectedRate.rate)}
                      </span>
                    </div>
                  )}
                  <div className="d-flex justify-content-between mb-2">
                    <span>Total Rate:</span>
                    <span className="fw-semibold text-primary">
                      {formatPrice(selectedRate.rate)}
                    </span>
                  </div>
                  <div className="d-flex justify-content-between mb-2">
                    <span>Refund Status:</span>
                    <span>
                      {getRefundStatusBadge(
                        selectedRate.nonRefundable === "Y"
                          ? "NON REFUNDABLE"
                          : "FLEXIBLE",
                      )}
                    </span>
                  </div>
                  <div className="d-flex justify-content-between">
                    <span>Contract:</span>
                    <span className="small text-muted">
                      {selectedRate.contractLabel}
                    </span>
                  </div>
                </div>
              </Col>
            </Row>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowBookingModal(false)}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            className="btn-confirm-booking"
            size="sm"
            onClick={() => {
              try {
                sessionStorage.setItem(
                  "bookingData",
                  JSON.stringify({
                    selectedRate,
                    hotelStaticData,
                    payload,
                    // Religious flow marker — same reasoning as the other
                    // bookingData writes above.
                    isReligiousBooking: religiousMode || undefined,
                  }),
                );
              } catch (e) {
                console.error("Error storing bookingData:", e);
              }
              window.open(bookingPageRoute, "_blank");
            }}
          >
            Confirm Booking
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Cancellation Policies & Terms & Conditions Modal — surfaces ALL
          policies/terms attached to the picked rate (the rate card only
          shows the first one as a preview). Sourced from the existing
          search response (rate.cancellationPolicies / rate.termsAndConditions
          with a hotel-level fallback) — no extra API call. Each section
          falls back to an empty-state line when its list is empty. */}
      <Modal
        show={showPoliciesModal}
        onHide={() => setShowPoliciesModal(false)}
        size="lg"
        centered
        scrollable
        aria-labelledby="policies-terms-modal"
      >
        <Modal.Header closeButton>
          <Modal.Title id="policies-terms-modal">
            Cancellation Policies &amp; Terms &amp; Conditions
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ maxHeight: "70vh", overflowY: "auto" }}>
          {policiesModalData.selectedRoomLabel && (
            <div className="text-muted small mb-3">
              {policiesModalData.selectedRoomLabel}
            </div>
          )}

          <h6 className="text-danger mb-2">
            <FaTimesCircle className="me-2" />
            Cancellation Policies
          </h6>
          {policiesModalData.cancellationPolicies?.length > 0 ? (
            <ul className="mb-4 ps-3">
              {policiesModalData.cancellationPolicies.map((policy, idx) => {
                const validity = renderPolicyValidity(
                  policy?.fromDate,
                  policy?.toDate,
                );
                return (
                  <li key={idx} className="mb-2">
                    <div style={{ whiteSpace: "pre-line" }}>
                      {policy?.policyText || ""}
                    </div>
                    {validity && (
                      <small className="text-muted">{validity}</small>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted mb-4">No cancellation policies available.</p>
          )}

          {/* Amendment / Child / Additional policy sections — only shown
              when the inhouse policyList carries them (apiId === 1). These
              used to live on the page as a separate "Booking Policies"
              card and have been folded into this modal so the data isn't
              duplicated outside the modal. */}
          {payload?.apiId === 1 && policyList?.policies?.amendmentPolicy?.length > 0 && (
            <>
              <h6 className="text-warning mb-2 pt-2 border-top">
                <FaInfoCircle className="me-2" />
                Amendment Policies
              </h6>
              <ul className="mb-4 ps-3">
                {policyList.policies.amendmentPolicy.map((policy, idx) => {
                  const validity = renderPolicyValidity(
                    policy?.fromDate,
                    policy?.toDate,
                  );
                  return (
                    <li key={idx} className="mb-2">
                      <div style={{ whiteSpace: "pre-line" }}>
                        {policy?.policyText || ""}
                      </div>
                      {validity && (
                        <small className="text-muted">{validity}</small>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {payload?.apiId === 1 && policyList?.policies?.childPolicy?.length > 0 && (
            <>
              <h6 className="text-primary mb-2 pt-2 border-top">
                <FaUsers className="me-2" />
                Child Policy
              </h6>
              <ul className="mb-4 ps-3">
                {policyList.policies.childPolicy.map((policy, idx) => (
                  <li key={idx} className="mb-2" style={{ whiteSpace: "pre-line" }}>
                    {policy?.policyText || ""}
                  </li>
                ))}
              </ul>
            </>
          )}

          {payload?.apiId === 1 && policyList?.policies?.additionalPolicy && (() => {
            const ap = policyList.policies.additionalPolicy;
            const formatFee = (amt, type) => {
              if (amt === null || amt === undefined || Number(amt) === 0) return null;
              const suffix = String(type || "").toUpperCase() === "PERCENT" ? "%" : "";
              return `${amt}${suffix}`;
            };
            const noShow = formatFee(ap.noShowFee, ap.noShowFeeType);
            const earlyDep = formatFee(ap.earlyDepartureFee, ap.earlyDepartureFeeType);
            const nonRef = formatFee(ap.nonRefundableFee, ap.nonRefundableFeeType);
            if (!noShow && !earlyDep && !nonRef) return null;
            return (
              <>
                <h6 className="text-info mb-2 pt-2 border-top">
                  <FaInfoCircle className="me-2" />
                  Additional Policy
                </h6>
                <ul className="mb-4 ps-3">
                  {noShow && (
                    <li className="mb-2">
                      <strong>No-Show Fee:</strong> {noShow}
                    </li>
                  )}
                  {earlyDep && (
                    <li className="mb-2">
                      <strong>Early Departure Fee:</strong> {earlyDep}
                    </li>
                  )}
                  {nonRef && (
                    <li className="mb-2">
                      <strong>Non-Refundable Fee:</strong> {nonRef}
                    </li>
                  )}
                </ul>
              </>
            );
          })()}

          <h6 className="text-secondary mb-2 pt-2 border-top">
            <FaInfoCircle className="me-2" />
            Terms &amp; Conditions
          </h6>
          {loadingTerms ? (
            <div className="d-flex align-items-center text-muted mb-0">
              <Spinner animation="border" size="sm" className="me-2" />
              Loading terms &amp; conditions…
            </div>
          ) : policiesModalData.termsAndConditions?.length > 0 ? (
            <ul className="mb-0 ps-3">
              {policiesModalData.termsAndConditions.map((term, idx) => {
                const text =
                  typeof term === "string"
                    ? term
                    : term?.description ||
                      term?.policyText ||
                      term?.text ||
                      "";
                if (!text) return null;
                return (
                  <li key={idx} className="mb-2" style={{ whiteSpace: "pre-line" }}>
                    {text}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted mb-0">No terms &amp; conditions available.</p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowPoliciesModal(false)}
          >
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default RoomList;
