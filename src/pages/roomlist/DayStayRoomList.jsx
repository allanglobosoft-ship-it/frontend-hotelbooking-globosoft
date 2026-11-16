import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  Button,
  Row,
  Col,
  Badge,
  Spinner,
  Accordion,
  Modal,
  Alert,
  useAccordionButton,
} from "react-bootstrap";
import {
  FaArrowLeft,
  FaClock,
  FaHotel,
  FaMapMarkerAlt,
  FaPhone,
  FaCalendarAlt,
  FaUsers,
  FaBed,
  FaGlobe,
  FaStar,
  FaUtensils,
  FaCoffee,
  FaCheckCircle,
  FaShieldAlt,
  FaInfoCircle,
  FaTimesCircle,
  FaChevronDown,
  FaChevronUp,
} from "react-icons/fa";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import RoomFilters from "../../components/roomlist/RoomFilters";
import useRoomFilters from "../../hooks/useRoomFilters";
import RefundBadge from "../../components/RefundBadge";
import { REFUND_FLEXIBLE, REFUND_NON_REFUNDABLE } from "../../utils/refundLabel";
import { formatFlexibleDate } from "../../utils/dateUtils";
import "../../styles/RoomList.css";

// Format a policy validity window (Valid: from - to). Copied verbatim
// from RoomList so day-stay policies render identically.
const renderPolicyValidity = (fromDate, toDate) => {
  const from = formatFlexibleDate(fromDate);
  const to = formatFlexibleDate(toDate);
  if (!from && !to) return null;
  return `Valid: ${from || "N/A"} - ${to || "N/A"}`;
};

// Accordion toggle button — matches RoomList.AccordionToggleButton
// line-for-line. Sits in the room-category header and toggles the
// body open/closed. `isActive` is passed in from the parent so the
// label + chevron reflect the current open state.
function AccordionToggleButton({ eventKey, isActive }) {
  const decoratedOnClick = useAccordionButton(eventKey);
  return (
    <Button
      variant="outline-primary"
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
 * DayStayRoomList — mirrors the structure of /room-list (RoomList.jsx).
 *
 *  - Hotel header card with title, stars, address, "Back to Search" button.
 *  - Booking Summary card (date, check-in / check-out time, hotel window).
 *  - Room Categories accordion: rate rows grouped by category, each row has
 *    meal-plan icon, refundable / non-refundable badge, day-stay rate, Book
 *    button.
 *
 * Reads dayStayRoomListPayload from sessionStorage and continues to the
 * booking page on Book.
 */
export default function DayStayRoomList() {
  const navigate = useNavigate();
  const [payload, setPayload] = useState(null);
  // Primary contract — the one the user clicked on (for window cap calc).
  const [contract, setContract] = useState(null);
  // All contracts for the same hotel that matched the search — kept
  // separately from the search-response data so the T&C modal + window
  // helpers can read contract-level fields.
  const [contracts, setContracts] = useState([]);
  // Backend's /rooms-search response. Same shape as
  // /api/hotel-rooms/search so hotels[0].roomCategories/availableRates
  // renders identically to RoomList.
  const [searchRoomData, setSearchRoomData] = useState(null);
  const [loading, setLoading] = useState(true);
  // Which category is open per-contract. Keyed by contract.id (falls
  // back to the visible index when the id is missing) so opening a
  // category in one window doesn't collapse the picks in another. Each
  // contract defaults to key "0" — the first category expanded — which
  // matches RoomList's initial open state.
  // Hotel-level room-categories accordion state — mirrors RoomList's
  // single `activeAccordion` (the entire hotel has ONE open category
  // at a time, not one per contract window).
  const [activeAccordion, setActiveAccordion] = useState("0");
  // selectedRow is still tracked because the insufficient-credit
  // deferred re-entry falls back to it when no explicit row is passed.
  const [selectedRow, setSelectedRow] = useState(null);
  const [agentBalance, setAgentBalance] = useState(null);
  // Grid / list view toggle — same pattern as RoomList.jsx
  const [viewMode, setViewMode] = useState("list");

  // Display currency + AED→display conversion factor. Rates stay AED
  // everywhere in the payload; formatPrice is display-only. Carried
  // over from the search page via sessionStorage; defaults to AED ×1
  // when absent.
  const [displayCurrency, setDisplayCurrency] = useState({ code: "AED", factor: 1 });

  // Insufficient Credit gate — soft modal (does NOT block the booking;
  // clicking OK re-runs the deferred proceedToBooking with
  // skipCreditCheck=true so the user lands on the booking page and can
  // pay online). Mirrors RoomList's pendingBookingFn pattern.
  const [showInsufficientCreditModal, setShowInsufficientCreditModal] = useState(false);
  const [pendingBookingFn, setPendingBookingFn] = useState(null);

  // Cancellation Policies & Terms modal — lazy-loads T&C per hotelId
  // through /api/hotels/{hotelId}/terms-and-conditions with a per-hotel
  // in-memory cache so reopening is instant.
  const [showPoliciesModal, setShowPoliciesModal] = useState(false);
  const [policiesModalData, setPoliciesModalData] = useState({
    dayStayCancellation: [],
    dayStayTerms: [],
    hotelTerms: [],
    selectedRoomLabel: "",
  });
  const [termsCache, setTermsCache] = useState({});
  const [loadingTerms, setLoadingTerms] = useState(false);

  // Inhouse-only Amendment / Child / Additional policy list surfaced in
  // the Cancellation Policies modal (apiId === 1). Falls back to null
  // for non-inhouse contracts.
  const [policyList, setPolicyList] = useState(null);

  // Shared Room-Type + Refund-Policy filters (same UX as /room-list).
  // /api/day-stay-contract/rooms-search returns rate rows carrying
  // `nonRefundable` (boolean) — the standard RateOptionResponse field
  // set from the contract's is_refundable flag (see
  // DayStayContractServiceImpl.searchRooms). Fall back to `!refundable`
  // for the client-side transform path used before the search endpoint
  // populated hotels.
  const filters = useRoomFilters();
  const rateVisible = (r) =>
    filters.rateMatches({
      isNonRefundable:
        r.nonRefundable === true ||
        (r.nonRefundable === undefined && r.refundable === false),
      mealPlan: r.mealPlan,
    });

  useEffect(() => {
    const raw = sessionStorage.getItem("dayStayRoomListPayload");
    if (!raw) {
      setLoading(false);
      return;
    }
    try {
      const p = JSON.parse(raw);
      setPayload(p);
      // Apply the display currency chosen on the search page (defaults
      // to AED ×1 when absent). Rates themselves stay AED — see
      // formatPrice.
      if (p.currency) {
        setDisplayCurrency({
          code: p.currency.code || "AED",
          factor:
            Number(p.currency.factor) > 0 ? Number(p.currency.factor) : 1,
        });
      }
      // Call the DayStay counterpart to /api/hotel-rooms/search — the
      // backend returns the same response shape RoomList consumes:
      //   { success, hotels:[HotelResponse{roomCategories:[…]}],
      //     meta, payload, contracts }
      // Fetching a single endpoint gives us the ready-made `hotels`
      // structure instead of transforming per-contract payloads on the
      // client.
      const ids =
        (p.allContractIds && p.allContractIds.length > 0
          ? p.allContractIds
          : p.contractId
          ? [p.contractId]
          : []);
      if (ids.length === 0) {
        setLoading(false);
        return;
      }
      axiosInstance
        .post("/api/day-stay-contract/rooms-search", {
          hotelId: p.hotelId,
          hotelName: p.hotelName,
          hotelAddress: p.hotelAddress,
          starRating: p.starRating,
          contractIds: ids,
          adults: p.adults,
          children: p.children,
          rooms: p.rooms,
          checkInDate: p.checkInDate,
          basePctRate: p.basePctRate,
          nationality: p.nationalityLabel || p.nationality,
        })
        .then((res) => {
          const data = res?.data || {};
          // Store the raw response so downstream code can iterate
          // roomData.hotels[0].roomCategories the same way RoomList
          // reads hotels[0].roomCategories.
          setSearchRoomData(data);
          // Contract objects are echoed back for the T&C modal /
          // window-cap helper (day-stay-specific fields the search
          // response doesn't otherwise carry).
          const echoed = Array.isArray(data.contracts) ? data.contracts : [];
          setContracts(echoed);
          setContract(
            echoed.find((c) => c?.id === p.contractId) || echoed[0] || null,
          );
        })
        .catch(() => {
          setSearchRoomData(null);
          setContracts([]);
          setContract(null);
        })
        .finally(() => setLoading(false));
    } catch {
      setLoading(false);
    }
  }, []);

  // Agent balance (in red) — same as RoomList.
  useEffect(() => {
    if (!payload?.agentId) {
      setAgentBalance(null);
      return;
    }
    let cancelled = false;
    axiosInstance
      .get(`/api/agent-credit-limit/agent/${payload.agentId}`)
      .then((res) => {
        if (!cancelled)
          setAgentBalance(res?.data?.availableCreditLimit ?? null);
      })
      .catch(() => {
        if (!cancelled) setAgentBalance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  // Hotel-level policies (amendment / child / additional) come from
  // /api/hotels/{hotelId}/policies. Cached here per-hotel; the fetch is
  // kicked off by openPoliciesModal on first open so the network call
  // is guaranteed to fire on the click.
  const [policiesCache, setPoliciesCache] = useState({});

  const adjustedCheckOut = useMemo(() => {
    if (!payload || !contract) return payload?.checkOutTime || "";
    if (!payload.checkOutTime) return contract.checkInEndTime;
    return payload.checkOutTime > contract.checkInEndTime
      ? contract.checkInEndTime
      : payload.checkOutTime;
  }, [payload, contract]);

  // ── /api/hotel-rooms/search response-shape adapter ────────────────────
  // The DayStay pipeline calls /api/day-stay-contract/{id}, which
  // returns a contract-centric payload. RoomList consumes a
  // hotel-centric shape:
  //   { hotels: [{ hotelId, hotelName, roomCategories: [
  //       { roomCategory, baseRoomType, availableRates: [rate...] }
  //     ] }], meta, payload }
  // This memo flattens every contract's room rows into that shape so
  // downstream code reads exactly the fields RoomList reads —
  // `rate.totalRate`, `rate.roomRateBasedOnRoomCount`, `rate.mealPlan`,
  // `rate.roomCategory`, `rate.contractLabel`, `rate.nonRefundable`,
  // `rate.roomStatus`, etc. Backend day-stay-specific fields
  // (availabilityType, hasOccupancy, hasAvailability, contract policies)
  // are carried through unchanged for the modal + gate logic.
  const roomData = useMemo(() => {
    // Prefer the backend response — that is the /api/hotel-rooms/search
    // canonical shape and requires no client transform. Fall through to
    // the derived transform (below) only when the endpoint hasn't
    // populated the standard structure yet.
    if (
      searchRoomData &&
      Array.isArray(searchRoomData.hotels) &&
      searchRoomData.hotels.length > 0
    ) {
      return searchRoomData;
    }
    if (!payload || contracts.length === 0) return null;

    const adultsN = Number(payload.adults || 1);
    const childrenN = Number(payload.children || 0);
    const numberOfRooms = Number(payload.rooms) || 1;
    const pct = Number(payload.basePctRate || 0);

    // Flatten every contract's rate rows into one array of "availableRate"
    // objects in RoomList's canonical shape.
    const allRates = [];
    contracts.forEach((c) => {
      const winStart = (c.checkInStartTime || "").slice(0, 5);
      const winEnd = (c.checkInEndTime || "").slice(0, 5);
      const contractLabel =
        winStart && winEnd
          ? `Window: ${winStart} – ${winEnd}`
          : c.rateCode || "";
      const rows = c.roomRates || c.rooms || [];
      rows.forEach((r) => {
        // Skip placeholder rows with no economic value.
        const base = Number(r.rate ?? r.dayStayRate ?? 0);
        const aRate = Number(r.adultRate || 0);
        const cRate = Number(r.childRate || 0);
        if (base <= 0 && aRate <= 0 && cRate <= 0) return;
        // Occupancy gate — matches the earlier client filter behaviour.
        if (r.hasOccupancy === false) return;

        // Day-stay pricing: base + extra-adult × adultRate + children ×
        // childRate, then × (1 + markup%).
        const extras = Math.max(0, adultsN - 1) * aRate + childrenN * cRate;
        const totalRate = +((base + extras) * (1 + pct / 100)).toFixed(2);
        const roomRateBasedOnRoomCount = +(totalRate * numberOfRooms).toFixed(2);

        allRates.push({
          // RoomList canonical fields
          contractLabel,
          mealPlan: r.mealPlan || r.mealType || "Room Only",
          roomCategory: r.roomCategoryName || "Day Stay Rooms",
          // Day-stay callers (proceedToBooking, confirm modal) also read
          // roomCategoryName — keep it populated so both shapes work
          // whether the rate came from the client transform or the
          // /api/day-stay-contract/rooms-search response.
          roomCategoryName: r.roomCategoryName || "Day Stay Rooms",
          baseRoomType: r.roomTypeName || "Standard Room",
          nonRefundable: !r.refundable,
          roomStatus: r.hasAvailability === false ? "On Request" : "Available",
          totalRate,
          rate: totalRate,
          roomRateBasedOnRoomCount,
          numberOfRooms,
          // Day-stay carry-through (booking payload, availability chip,
          // cancellation modal)
          adultRate: r.adultRate,
          childRate: r.childRate,
          refundable: r.refundable,
          occupancyTypeName: r.occupancyTypeName,
          roomTypeName: r.roomTypeName,
          availabilityType: r.availabilityType,
          noOfRoomsAvailable: r.noOfRoomsAvailable,
          hasOccupancy: r.hasOccupancy,
          hasAvailability: r.hasAvailability,
          contractId: c.id,
          checkInStartTime: c.checkInStartTime,
          checkInEndTime: c.checkInEndTime,
          cancellationPolicies: Array.isArray(c.cancellationPolicies)
            ? c.cancellationPolicies.filter(Boolean)
            : [],
          termsAndConditions: Array.isArray(c.termsAndConditions)
            ? c.termsAndConditions.filter(Boolean)
            : [],
          // Legacy day-stay reads (used by computeFinalRate/booking payload)
          key: r.id || `${c.id}-${r.hotelRoomCategoryId}-${r.occupancyTypeId}`,
          dayStayRate: base,
        });
      });
    });

    // Group flat rates by roomCategory → RoomList's roomCategories array.
    const byCat = new Map();
    allRates.forEach((r) => {
      if (!byCat.has(r.roomCategory)) byCat.set(r.roomCategory, []);
      byCat.get(r.roomCategory).push(r);
    });
    const roomCategories = Array.from(byCat.entries()).map(([name, rates]) => ({
      roomCategory: name,
      baseRoomType: rates[0]?.baseRoomType || "",
      // Sort ascending by finalized per-room rate (RoomList uses totalRate).
      availableRates: rates
        .slice()
        .sort((a, b) => (a.totalRate || 0) - (b.totalRate || 0)),
    }));

    const primary = contract || contracts[0] || null;

    return {
      success: true,
      hotels: [
        {
          hotelId: payload.hotelId,
          hotelName: payload.hotelName,
          hotelAddress: payload.hotelAddress,
          starRating: primary?.starRating || 0,
          propertyType: "Day Stay",
          checkInDate: payload.checkInDate,
          // Day stays are single-day; check-out is on the same date.
          checkOutDate: payload.checkInDate,
          checkInStartTime: primary?.checkInStartTime,
          checkInEndTime: primary?.checkInEndTime,
          numberOfRooms,
          guestBreakdown: `${adultsN} Adult${adultsN > 1 ? "s" : ""}${
            childrenN ? `, ${childrenN} Child${childrenN > 1 ? "ren" : ""}` : ""
          }`,
          nationality: payload.nationality || "",
          roomCategories,
        },
      ],
      meta: {},
      payload,
    };
  }, [searchRoomData, contracts, contract, payload]);

  const renderStars = (count) =>
    Array.from({ length: Math.max(0, Number(count) || 0) }).map((_, i) => (
      <FaStar key={i} className="text-warning" />
    ));

  // Compute final per-room rate using the row's adult/child rates + the
  // contract-level markup percentage. First adult is included in the base,
  // each extra adult and each child adds on. Returns null when base is 0.
  const computeFinalRate = (row) => {
    const base = Number(row.dayStayRate || 0);
    if (!base) return null;
    const adultsN = Number(payload?.adults || 1);
    const childrenN = Number(payload?.children || 0);
    const extras =
      Math.max(0, adultsN - 1) * Number(row.adultRate || 0) +
      childrenN * Number(row.childRate || 0);
    const pct = Number(payload?.basePctRate || 0);
    return +((base + extras) * (1 + pct / 100)).toFixed(2);
  };
  const computeRoomsTotal = (row) => {
    const r = computeFinalRate(row);
    if (r == null) return null;
    return +(r * (Number(payload?.rooms) || 1)).toFixed(2);
  };

  // Prefer the canonical RoomList-shape fields when the rate came
  // through the /api/day-stay-contract/rooms-search response (already
  // priced by the backend), and fall back to the day-stay client
  // formula for rates built by the local adapter. Both branches must
  // yield the same display so the JSX doesn't have to care which path
  // populated `roomData.hotels[0].roomCategories`.
  const displayPerRoomRate = (row) => {
    const canonical = Number(row?.rate ?? row?.totalRate ?? 0);
    if (canonical > 0) return canonical;
    return computeFinalRate(row) ?? 0;
  };
  const displayTotal = (row) => {
    const canonical = Number(row?.roomRateBasedOnRoomCount ?? 0);
    if (canonical > 0) return canonical;
    return computeRoomsTotal(row) ?? 0;
  };

  const getMealPlanIcon = (mp = "") => {
    const m = (mp || "").toLowerCase();
    if (m.includes("breakfast")) return <FaCoffee className="text-primary me-1" />;
    if (m.includes("all inclusive")) return <FaUtensils className="text-success me-1" />;
    if (m.includes("full board")) return <FaUtensils className="text-warning me-1" />;
    if (m.includes("half board")) return <FaUtensils className="text-info me-1" />;
    return <FaBed className="text-muted me-1" />;
  };

  // On-Request vs Available badge — copied from RoomList so day-stay
  // rate rows carry the same signal (rates that came back with
  // roomStatus === "On Request" need supplier approval before they can
  // be confirmed).
  const getRoomStatusBadge = (roomStatus) => {
    switch (roomStatus) {
      case "On Request":
        return (
          <small>
            This room can be booked{" "}
            <Badge
              bg="warning"
              text="dark"
              className="px-2 py-1 ms-1 fw-bold border border-warning shadow-sm"
            >
              On Request
            </Badge>
          </small>
        );
      case "Available":
        return (
          <small>
            <span style={{ color: "#198754", fontWeight: "700" }}>
              Available
            </span>
          </small>
        );
      default:
        return <small>This room is Available </small>;
    }
  };

  // Prefix the display currency code manually — master currency codes
  // aren't guaranteed to be valid ISO 4217, so Intl currency style
  // isn't safe. Rates arrive in AED; the factor scales them here.
  const formatPrice = (price) => {
    const converted = (Number(price) || 0) * (displayCurrency.factor || 1);
    return `${displayCurrency.code || "AED"} ${converted.toLocaleString(
      undefined,
      { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    )}`;
  };

  // Credit-gate check — soft: returns false when the balance hasn't
  // loaded, so operators without a live credit context still get
  // through. Server-side check at confirm-booking time is the
  // authoritative gate. Mirrors RoomList's isInsufficientBalance.
  const isInsufficientBalance = (requiredAmount) => {
    if (agentBalance == null) return false;
    const required = Number(requiredAmount) || 0;
    const available = Number(agentBalance) || 0;
    return required > available;
  };

  // Open the Cancellation Policies & Terms modal. Every relevant
  // endpoint is dispatched here so the network activity is visibly tied
  // to the user click:
  //   1) /api/hotels/{hotelId}/policies         — Amendment / Child / Additional
  //   2) /api/hotels/{hotelId}/terms-and-conditions — hotel-wide T&C
  // Both responses are cached per-hotelId so re-opens are instant.
  //
  // The modal also carries the DAY-STAY-specific policies that come
  // embedded in /api/day-stay-contract/{id} (rate.cancellationPolicies
  // and rate.termsAndConditions are List<String>). Those render in
  // dedicated "Day Stay Cancellation Policies" and "Day Stay Terms &
  // Conditions" sections so they're clearly distinguishable from the
  // hotel-wide items.
  // `openModal` defaults to true so every existing call site (which all
  // want the modal to pop up) is unaffected. The new accordion-header
  // "Cancellation Policy" link passes false — it wants the same data
  // loaded into policiesModalData/policyList (so Hotel Information can
  // render it) without popping the modal open.
  const openPoliciesModal = async (rate, openModal = true) => {
    const label = [rate?.roomCategoryName, rate?.mealPlan]
      .filter(Boolean)
      .join(" • ");

    // Contract-level (day-stay specific). The DTO ships these as
    // List<String>; the modal handles both string and object shapes.
    const dayStayCancellation = Array.isArray(rate?.cancellationPolicies)
      ? rate.cancellationPolicies
      : [];
    const dayStayTerms = Array.isArray(rate?.termsAndConditions)
      ? rate.termsAndConditions
      : [];

    const hotelId = payload?.hotelId;
    const cachedTerms = hotelId != null ? termsCache[hotelId] : undefined;
    const cachedPolicies = hotelId != null ? policiesCache[hotelId] : undefined;

    // Seed the modal immediately with what we already have.
    setPoliciesModalData({
      dayStayCancellation,
      dayStayTerms,
      hotelTerms: cachedTerms || [],
      selectedRoomLabel: label,
    });
    if (cachedPolicies !== undefined) setPolicyList(cachedPolicies);
    else setPolicyList(null);
    if (openModal) setShowPoliciesModal(true);

    // Bail out of network work when the hotel id is missing / opaque —
    // day-stay contracts have a numeric id, but be defensive.
    const canFetch =
      hotelId != null && /^\d+$/.test(String(hotelId));

    // ─── Hotel policies (Amendment / Child / Additional) ───────────
    if (canFetch && cachedPolicies === undefined) {
      try {
        const res = await axiosInstance.get(
          `/api/hotels/${hotelId}/policies`,
        );
        const data = res?.data || null;
        setPoliciesCache((prev) => ({ ...prev, [hotelId]: data }));
        setPolicyList(data);
      } catch (err) {
        console.error("Hotel policies fetch failed:", err);
        setPoliciesCache((prev) => ({ ...prev, [hotelId]: null }));
        setPolicyList(null);
      }
    }

    // ─── Hotel-wide Terms & Conditions ────────────────────────────
    if (!canFetch) {
      setPoliciesModalData((prev) => ({ ...prev, hotelTerms: [] }));
      return;
    }
    if (cachedTerms !== undefined) return; // already served from cache
    setLoadingTerms(true);
    try {
      const res = await axiosInstance.get(
        `/api/hotels/${hotelId}/terms-and-conditions`,
      );
      const terms = Array.isArray(res?.data) ? res.data : [];
      setTermsCache((prev) => ({ ...prev, [hotelId]: terms }));
      setPoliciesModalData((prev) => ({ ...prev, hotelTerms: terms }));
    } catch (err) {
      console.error("T&C fetch failed:", err);
      setTermsCache((prev) => ({ ...prev, [hotelId]: [] }));
      setPoliciesModalData((prev) => ({ ...prev, hotelTerms: [] }));
    } finally {
      setLoadingTerms(false);
    }
  };

  // Book-Now entry point. The intermediate "Confirm Rate" summary modal
  // was removed per client spec — clicking Book on a rate goes straight
  // to the booking page. We still stash the row on state so the
  // insufficient-credit deferred re-entry path (which re-fires
  // proceedToBooking(true) from a captured closure) has something to
  // point at, but the row is also passed through explicitly to
  // proceedToBooking so we don't race the async setState.
  const openBookConfirm = (row) => {
    setSelectedRow(row);
    proceedToBooking(false, row);
  };

  const proceedToBooking = (skipCreditCheck = false, rowArg = null) => {
    const row = rowArg || selectedRow;
    if (!row || !payload) return;
    // Prefer canonical rate fields (populated by both the client
    // adapter and the backend /rooms-search response) so the booking
    // page receives a real price regardless of which shape the rate
    // came from. computeRoomsTotal/computeFinalRate still act as the
    // fallback for adapter-built rates that only carry `dayStayRate`.
    const totalAmount = displayTotal(row);
    const perRoomFinal = displayPerRoomRate(row);

    // Credit gate — soft. Raise the informational modal and defer the
    // actual navigation until the user clicks OK, at which point we
    // re-enter with skipCreditCheck=true and complete the flow (the
    // booking page then handles online payment).
    if (!skipCreditCheck && isInsufficientBalance(totalAmount)) {
      setPendingBookingFn(() => () => proceedToBooking(true, row));
      setShowInsufficientCreditModal(true);
      return;
    }
    const bookingPayload = {
      ...payload,
      contractId: row.contractId || payload.contractId,
      // Keep contract window times; adjustedCheckOut already caps to window end.
      checkOutTime: adjustedCheckOut,
      // The rate row can come from EITHER shape: the day-stay client
      // transform (which emits both `roomCategoryName` AND `roomCategory`)
      // OR the backend /api/day-stay-contract/rooms-search response
      // (RoomList canonical: `roomCategory` + `baseRoomType`, no
      // *Name mirrors). Read whichever is populated so the booking
      // payload is stable regardless of source.
      roomCategory:
        row.roomCategoryName || row.roomCategory || "",
      roomType:
        row.roomTypeName || row.baseRoomType || "",
      occupancyTypeName: row.occupancyTypeName,
      mealPlan: row.mealPlan,
      rateRow: row,
      dayStayRate: perRoomFinal,
      perRoomRate: perRoomFinal,
      totalAmount,
      termsAndConditions: row.termsAndConditions || [],
      cancellationPolicies: row.cancellationPolicies || [],
    };
    sessionStorage.setItem(
      "dayStayBookingPayload",
      JSON.stringify(bookingPayload)
    );
    navigate("/day-stay-booking-page");
  };

  if (loading) {
    return (
      <div className="min-vh-100 bg-light d-flex flex-column">
        <TopBar />
        <div className="d-flex flex-grow-1">
          <Sidebar />
          <main className="flex-grow-1 p-4 text-center">
            <Spinner animation="border" />
          </main>
        </div>
      </div>
    );
  }

  if (!payload || !contract) {
    return (
      <div className="min-vh-100 bg-light d-flex flex-column">
        <TopBar />
        <div className="d-flex flex-grow-1">
          <Sidebar />
          <main className="flex-grow-1 p-4">
            <Card className="shadow-sm">
              <Card.Body className="text-center text-muted py-5">
                <h5>Day Stay information missing</h5>
                <p>Please go back to Day Stay search and try again.</p>
                <Button onClick={() => navigate("/new-booking/day-stay")}>
                  Back to Search
                </Button>
              </Card.Body>
            </Card>
          </main>
        </div>
      </div>
    );
  }

  const totalGuests =
    Number(payload.adults || 0) + Number(payload.children || 0);

  return (
    <div className="min-vh-100 bg-light d-flex flex-column room-list-container">
      {/* Inline style — slim accordion header padding for day-stay sections. */}
      <style>{`
        .day-stay-cat-header .accordion-button {
          padding: 0.55rem 1rem !important;
          background: #fafbfd;
          font-size: 0.95rem;
        }
        .day-stay-cat-header .accordion-button:not(.collapsed) {
          background: #eef3ff;
          color: #0d6efd;
        }
        /* Inset the accordion body so it renders slightly narrower than
           the header — visual affordance that the body is a child of
           the header row. */
        .room-category-item .room-rates-section {
          margin: 0 14px 12px;
          padding: 0.75rem 1rem;
          background: #ffffff;
          border-radius: 0 0 8px 8px;
        }
      `}</style>
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="content-wrapper flex-grow-1" style={{ minWidth: 0, overflowX: "hidden" }}>
          <div className="container-fluid" style={{ paddingTop: "10px" }}>
            {/* Day Stay route heading — UI only, mirrors the heading shown
                on /new-booking/day-stay once results arrive. */}
            <div className="hs-page-heading">
              <h3 className="hs-page-heading-title">Day Stay</h3>
            </div>
            {/* Agent available balance — top-right red indicator */}
            {agentBalance != null && (
              <div
                className="d-flex justify-content-end mb-2"
                style={{ fontSize: "0.95rem" }}
              >
                <span className="fw-bold" style={{ color: "#dc3545" }}>
                  Available Balance: {Number(agentBalance).toFixed(2)}
                </span>
              </div>
            )}

            {/* Hotel Header Card — mirrors RoomList.jsx */}
            <Card className="hotel-header-card mb-4">
              <Card.Body className="p-4">
                <Row>
                  <Col md={8}>
                    <div className="d-flex align-items-start gap-3">
                      <div className="hotel-icon">
                        <FaHotel size={40} className="text-primary" />
                      </div>
                      <div className="hotel-info">
                        <h2 className="hotel-name mb-2">
                          {payload.hotelName}
                        </h2>
                        <div className="d-flex align-items-center gap-3 mb-2">
                          <Badge bg="primary">Day Stay</Badge>
                          <Badge bg="info">
                            {(contract.checkInStartTime || "").slice(0, 5)} –{" "}
                            {(contract.checkInEndTime || "").slice(0, 5)}
                          </Badge>
                        </div>
                        <div className="hotel-details">
                          <p className="mb-1">
                            <FaMapMarkerAlt className="text-muted me-2" />
                            {payload.hotelAddress || "—"}
                          </p>
                          <div className="mt-2">
                            <small className="text-muted">
                              <strong>Please note:</strong>{" "}
                              <p className="someproperties">
                                Day-stay check-outs are auto-capped to the
                                hotel's window end. Day-stay rates do not
                                include overnight stays or breakfast unless
                                otherwise indicated on the rate row.
                              </p>
                            </small>
                          </div>
                        </div>
                        <div className="mt-3">
                          <Button
                            variant="outline-primary"
                            size="sm"
                            onClick={() => navigate("/new-booking/day-stay")}
                          >
                            <FaArrowLeft className="me-1" /> Back to Search
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Col>
                  <Col md={4}>
                    <Card className="booking-summary">
                      <Card.Body className="p-3">
                        <h6 className="mb-3">Booking Summary</h6>
                        <div className="booking-details">
                          <div className="d-flex justify-content-between mb-2">
                            <span>
                              <FaCalendarAlt className="text-muted me-2" />
                              Date:
                            </span>
                            <span className="fw-semibold">
                              {payload.checkInDate}
                            </span>
                          </div>
                          <div className="d-flex justify-content-between mb-2">
                            <span>
                              <FaClock className="text-muted me-2" />
                              Check-in:
                            </span>
                            <span className="fw-semibold">
                              {payload.checkInTime}
                            </span>
                          </div>
                          <div className="d-flex justify-content-between mb-2">
                            <span>
                              <FaClock className="text-muted me-2" />
                              Check-out:
                            </span>
                            <span className="fw-semibold">
                              {adjustedCheckOut}
                              {payload.checkOutTime !== adjustedCheckOut && (
                                <Badge
                                  bg="warning"
                                  text="dark"
                                  className="ms-2"
                                  style={{ fontSize: "0.65rem" }}
                                >
                                  Capped
                                </Badge>
                              )}
                            </span>
                          </div>
                          <div className="d-flex justify-content-between mb-2">
                            <span>
                              <FaUsers className="text-muted me-2" />
                              Guests:
                            </span>
                            <span className="fw-semibold">
                              {payload.adults || 0} Adult
                              {payload.adults > 1 ? "s" : ""}
                              {payload.children
                                ? `, ${payload.children} Child${
                                    payload.children > 1 ? "ren" : ""
                                  }`
                                : ""}
                            </span>
                          </div>
                          {Array.isArray(payload.childAges) &&
                            payload.childAges.length > 0 && (
                              <div className="d-flex justify-content-between mb-2 small text-muted">
                                <span>Child Ages:</span>
                                <span>
                                  {payload.childAges
                                    .map((a) => `${a}y`)
                                    .join(", ")}
                                </span>
                              </div>
                            )}
                          <div className="d-flex justify-content-between mb-2">
                            <span>
                              <FaBed className="text-muted me-2" />
                              Rooms:
                            </span>
                            <span className="fw-semibold">
                              {payload.rooms || 1}
                            </span>
                          </div>
                          <div className="d-flex justify-content-between">
                            <span>
                              <FaGlobe className="text-muted me-2" />
                              Nationality:
                            </span>
                            <span className="fw-semibold">
                              {payload.nationality || "—"}
                            </span>
                          </div>
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>
              </Card.Body>
            </Card>

            {/* Room Categories Accordion — mirrors RoomList.jsx.
                One Accordion per contract: each contract has its own daily
                check-in window so we render them as separate sections. */}
            <div className="room-categories-section">
              <div className="d-flex justify-content-between align-items-center mb-4">
                <h4 className="mb-0">Available Day Stay Rates</h4>
                <div className="d-flex align-items-center gap-2">
                  <Badge bg="secondary">
                    {contracts.length} Window{contracts.length > 1 ? "s" : ""}
                  </Badge>
                  <div className="btn-group shadow-sm gap-1" role="group">
                    <Button
                      variant={
                        viewMode === "grid" ? "primary" : "outline-primary"
                      }
                      onClick={() => setViewMode("grid")}
                      className="d-flex align-items-center gap-2"
                      size="sm"
                      title="Grid view"
                    >
                      <span className="fs-5" style={{ lineHeight: 1 }}>
                        ⊞
                      </span>
                    </Button>
                    <Button
                      variant={
                        viewMode === "list" ? "primary" : "outline-primary"
                      }
                      onClick={() => setViewMode("list")}
                      className="d-flex align-items-center gap-2"
                      size="sm"
                      title="List view"
                    >
                      <span className="fs-5" style={{ lineHeight: 1 }}>
                        ☰
                      </span>
                    </Button>
                  </div>
                </div>
              </div>

              <Row className="g-3">
                <Col lg={3} md={4}>
                  <RoomFilters filters={filters} />
                </Col>
                <Col lg={9} md={8}>
              {/* Hotel-level room categories — mirrors RoomList.jsx's
                  `hotel.roomCategories.map(...)` pattern. Every rate for
                  the hotel is grouped under its canonical category in
                  a single Accordion (NOT split per contract window),
                  so all rooms for a hotel show together — matching the
                  RoomList behaviour where a hotel with 3 room categories
                  renders all 3 side-by-side. Each rate still carries
                  its window info via `rate.contractLabel` and gets a
                  per-rate window chip inside the card. */}
              {(() => {
                const hotel = roomData?.hotels?.[0];
                const categories = hotel?.roomCategories || [];
                const filteredCategories = categories
                  .map((category) => ({
                    ...category,
                    availableRates: (category.availableRates || []).filter(
                      rateVisible,
                    ),
                  }))
                  .filter(
                    (category) => (category.availableRates || []).length > 0,
                  );
                if (filteredCategories.length === 0) {
                  return (
                    <Alert variant="info" className="mb-0">
                      No rates match the selected filters, please check other filters.
                    </Alert>
                  );
                }
                return (
                  <Accordion
                    activeKey={activeAccordion}
                    onSelect={(key) => setActiveAccordion(key)}
                  >
                    {filteredCategories.map((category, index) => {
                      const eventKey = index.toString();
                      const isActive = activeAccordion === eventKey;
                      const filteredRates = category.availableRates || [];
                      // Cheapest visible rate for the header "From" price —
                      // mirrors RoomList's `Math.min(...rate.rate)` pattern.
                      // displayPerRoomRate prefers canonical fields but
                      // falls back to computeFinalRate for adapter-built
                      // rates that only carry `dayStayRate`.
                      const cheapestRate = filteredRates.reduce((min, r) => {
                        const v = displayPerRoomRate(r);
                        if (!v || v <= 0) return min;
                        return min == null || v < min ? v : min;
                      }, null);
                      return (
                        <Accordion.Item
                          key={eventKey}
                          eventKey={eventKey}
                          className="room-category-item"
                        >
                          {/* Header is NOT clickable — mirrors RoomList's
                              "header ≠ toggle" pattern. The right-side
                              AccordionToggleButton is the only affordance
                              that opens the body, exactly like RoomList. */}
                          <Accordion.Header
                            as="div"
                            className="room-category-header"
                          >
                            <div className="d-flex justify-content-between align-items-center w-100">
                              <div className="room-category-info">
                                <h5 className="mb-1">
                                  {category.roomCategory ||
                                    category.name ||
                                    "Day Stay Rooms"}
                                </h5>
                                <p className="mb-0 text-muted small">
                                  {category.baseRoomType ||
                                    filteredRates[0]?.roomTypeName ||
                                    filteredRates[0]?.baseRoomType ||
                                    ""}
                                </p>
                              </div>
                              <div className="d-flex align-items-center gap-3">
                                <div className="room-category-price text-end">
                                  <div className="price-range">
                                    From{" "}
                                    {cheapestRate != null
                                      ? formatPrice(cheapestRate)
                                      : "—"}
                                  </div>
                                  <div className="rates-count small text-muted">
                                    {filteredRates.length} rate
                                    {filteredRates.length !== 1 ? "s" : ""}{" "}
                                    available
                                  </div>
                                </div>
                                <div className="d-flex flex-column align-items-end gap-1">
                                  <AccordionToggleButton
                                    eventKey={eventKey}
                                    isActive={isActive}
                                  />
                                  {filteredRates.length > 0 && (
                                    <a
                                      href="#hotel-information-section"
                                      className="small"
                                      onClick={(e) => {
                                        // Stop propagation — this link sits
                                        // inside the Accordion.Header, which
                                        // react-bootstrap always wraps in a
                                        // toggle <button>; without this the
                                        // click also expands/collapses the
                                        // accordion body. Mirrors RoomList.jsx.
                                        e.preventDefault();
                                        e.stopPropagation();
                                        // Load the same data the per-rate
                                        // modal reads (day-stay cancellation
                                        // / terms + inhouse amendment/child/
                                        // additional policies) using this
                                        // category's cheapest/first rate as
                                        // the representative rate, without
                                        // opening the modal.
                                        openPoliciesModal(
                                          filteredRates[0],
                                          false,
                                        );
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
                          {/* Body arrangement mirrors RoomList exactly —
                              same Row of rate-cards for both viewModes.
                              Grid → 2 per row on lg, 3 per row on xl.
                              List → single column of horizontal cards. */}
                          <Accordion.Body className="room-rates-section">
                            <Row>
                              {filteredRates.map((rate, rateIndex) => {
                                const finalRate = displayPerRoomRate(rate);
                                const total = displayTotal(rate);
                                const roomStatusLabel =
                                  rate.roomStatus || "Available";
                                const roomStatusColor =
                                  roomStatusLabel === "On Request"
                                    ? "#e67e22"
                                    : roomStatusLabel === "Available"
                                      ? "#198754"
                                      : "#6c757d";
                                const roomStatusNode = (
                                  <span
                                    style={{
                                      color: roomStatusColor,
                                      fontWeight: 700,
                                    }}
                                  >
                                    {roomStatusLabel}
                                  </span>
                                );
                                // Per-rate check-in window chip — the
                                // rate carries its origin contract's
                                // window via `contractLabel` /
                                // `checkInStartTime` / `checkInEndTime`
                                // so each card shows which window it
                                // came from, even though all rates for
                                // the hotel are now in one accordion.
                                const winStart = (
                                  rate.checkInStartTime || ""
                                ).slice(0, 5);
                                const winEnd = (
                                  rate.checkInEndTime || ""
                                ).slice(0, 5);
                                const windowLabel =
                                  winStart && winEnd
                                    ? `Window: ${winStart} – ${winEnd}`
                                    : rate.contractLabel || "";
                                return (
                                  <Col
                                    key={rate.key || rateIndex}
                                    lg={viewMode === "grid" ? 6 : 12}
                                    xl={viewMode === "grid" ? 4 : 12}
                                    className="mb-2"
                                  >
                                    <Card className="rate-card h-100 shadow-sm">
                                      {viewMode === "grid" ? (
                                        <Card.Body className="p-2 pb-0 d-flex flex-column gap-2">
                                          <div className="rate-header d-flex justify-content-between align-items-start">
                                            <div>
                                              <div className="d-flex align-items-center gap-2">
                                                {getMealPlanIcon(rate.mealPlan)}
                                                <span className="fw-semibold small">
                                                  {rate.mealPlan}
                                                </span>
                                              </div>
                                              <div className="mt-1">
                                                {getRoomStatusBadge(
                                                  rate.roomStatus,
                                                )}
                                              </div>
                                            </div>
                                            <RefundBadge
                                              label={
                                                rate.nonRefundable === true ||
                                            (rate.nonRefundable === undefined &&
                                                  rate.refundable === false)
                                                  ? REFUND_NON_REFUNDABLE
                                                  : REFUND_FLEXIBLE
                                              }
                                            />
                                          </div>

                                          <div className="rate-pricing text-center py-2">
                                            <div className="current-price">
                                              {total > 0
                                                ? formatPrice(total)
                                                : "—"}
                                            </div>
                                            {finalRate > 0 && (
                                              <div className="indivial-price-per-room-noofroom">
                                                <div className="text-muted small">
                                                  {formatPrice(finalRate)} ×{" "}
                                                  {payload.rooms || 1} room
                                                  {(payload.rooms || 1) > 1
                                                    ? "s"
                                                    : ""}
                                                </div>
                                              </div>
                                            )}
                                            <div className="price-per-night small text-muted">
                                              per stay
                                            </div>
                                          </div>

                                          <div className="rate-features small">
                                            {windowLabel && (
                                              <div className="feature-item">
                                                <FaClock className="me-2 text-muted" />
                                                {windowLabel}
                                              </div>
                                            )}
                                            <div className="feature-item">
                                              <FaInfoCircle className="me-2 text-muted" />
                                              Availability: {roomStatusNode}
                                            </div>
                                            <div className="feature-item">
                                              <FaBed className="me-2 text-muted" />
                                              {rate.roomTypeName ||
                                                rate.baseRoomType}
                                            </div>
                                            <div className="feature-item">
                                              <Button
                                                variant="link"
                                                size="sm"
                                                className="p-0 text-decoration-underline"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  openPoliciesModal(rate);
                                                }}
                                              >
                                                <FaShieldAlt className="me-2" />
                                                Cancellation Policies &amp;
                                                Terms &amp; Conditions
                                              </Button>
                                            </div>
                                          </div>

                                          <Button
                                            variant="primary"
                                            className="w-100 book-now-btn mt-1 mb-1"
                                            onClick={() =>
                                              openBookConfirm(rate)
                                            }
                                          >
                                            <FaCheckCircle className="me-2" />
                                            View Details / Select
                                          </Button>
                                        </Card.Body>
                                      ) : (
                                        <Card.Body className="p-3 py-2 d-flex flex-row align-items-center gap-3 flex-wrap flex-md-nowrap">
                                          <div
                                            className="d-flex flex-column flex-grow-1"
                                            style={{ minWidth: 0 }}
                                          >
                                            <div className="d-flex align-items-center flex-wrap gap-2 mb-2">
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
                                                <RefundBadge
                                                  label={
                                                    rate.nonRefundable === true ||
                                                (rate.nonRefundable ===
                                                  undefined &&
                                                      rate.refundable === false)
                                                      ? REFUND_NON_REFUNDABLE
                                                      : REFUND_FLEXIBLE
                                                  }
                                                />
                                                {rate.roomStatus ===
                                                "On Request" ? (
                                                  <Badge
                                                    bg="warning"
                                                    text="dark"
                                                    className="px-2 py-1 fw-bold border border-warning"
                                                  >
                                                    On Request
                                                  </Badge>
                                                ) : (
                                                  <Badge bg="success">
                                                    Available
                                                  </Badge>
                                                )}
                                              </div>
                                            </div>
                                            <div
                                              className="rate-features small text-muted d-flex flex-wrap gap-3"
                                              style={{ minWidth: 0 }}
                                            >
                                              {windowLabel && (
                                                <div className="feature-item d-flex align-items-center text-truncate">
                                                  <FaClock className="me-2 flex-shrink-0" />
                                                  <span className="text-truncate">
                                                    {windowLabel}
                                                  </span>
                                                </div>
                                              )}
                                              <div className="feature-item d-flex align-items-center text-truncate">
                                                <FaInfoCircle className="me-2 flex-shrink-0" />
                                                <span className="text-truncate">
                                                  Availability:{" "}
                                                  {roomStatusNode}
                                                </span>
                                              </div>
                                              <div className="feature-item d-flex align-items-center text-truncate">
                                                <FaBed className="me-2 flex-shrink-0" />
                                                <span className="text-truncate">
                                                  {rate.roomTypeName ||
                                                    rate.baseRoomType}
                                                </span>
                                              </div>
                                              <div className="feature-item d-flex align-items-center">
                                                <Button
                                                  variant="link"
                                                  size="sm"
                                                  className="p-0 text-decoration-underline"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    openPoliciesModal(rate);
                                                  }}
                                                >
                                                  <FaShieldAlt className="me-2" />
                                                  Cancellation Policies &amp;
                                                  Terms &amp; Conditions
                                                </Button>
                                              </div>
                                            </div>
                                          </div>
                                          <div
                                            className="text-end px-3 border-start border-end flex-shrink-0"
                                            style={{ minWidth: "150px" }}
                                          >
                                            <div className="fs-5 fw-bold text-primary">
                                              {total > 0
                                                ? formatPrice(total)
                                                : "—"}
                                            </div>
                                            {finalRate > 0 && (
                                              <div className="text-muted small">
                                                {formatPrice(finalRate)} ×{" "}
                                                {payload.rooms || 1} room
                                                {(payload.rooms || 1) > 1
                                                  ? "s"
                                                  : ""}
                                              </div>
                                            )}
                                            <div className="small text-muted">
                                              per stay
                                            </div>
                                          </div>
                                          <div className="flex-shrink-0">
                                            <Button
                                              variant="primary"
                                              className="book-now-btn px-3 py-2"
                                              onClick={() =>
                                                openBookConfirm(rate)
                                              }
                                              style={{ whiteSpace: "nowrap" }}
                                            >
                                              <FaCheckCircle className="me-2" />
                                              View Details
                                            </Button>
                                          </div>
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
                  </Accordion>
                );
              })()}

            {/* ── Hotel Information / General check-in & stay details ──
                Leads with the same Cancellation / Amendment / Child /
                Additional / Terms & Conditions content as the per-rate
                "Cancellation Policies & Terms" modal (loaded via the same
                openPoliciesModal(rate, false) call, so no duplicate data
                source), followed by the static stay-window facts. This is
                the scroll target of the "Cancellation Policy" link under
                each room category's toggle button above. */}
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
                  {policiesModalData.selectedRoomLabel ? (
                    <div className="mb-3">
                      <div className="text-muted small mb-3">
                        {policiesModalData.selectedRoomLabel}
                      </div>

                      <h6 className="text-danger mb-2">
                        <FaTimesCircle className="me-2" />
                        Day Stay Cancellation Policies
                      </h6>
                      {policiesModalData.dayStayCancellation?.length > 0 ? (
                        <ul className="mb-3 ps-3">
                          {policiesModalData.dayStayCancellation.map(
                            (policy, idx) => {
                              const text =
                                typeof policy === "string"
                                  ? policy
                                  : policy?.policyText ||
                                    policy?.description ||
                                    policy?.text ||
                                    "";
                              const validity =
                                typeof policy === "object"
                                  ? renderPolicyValidity(
                                      policy?.fromDate,
                                      policy?.toDate,
                                    )
                                  : null;
                              if (!text && !validity) return null;
                              return (
                                <li key={idx} className="mb-2">
                                  <div style={{ whiteSpace: "pre-line" }}>
                                    {text}
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
                      ) : (
                        <p className="text-muted mb-3">
                          No day-stay cancellation policies available for
                          this rate.
                        </p>
                      )}

                      {policiesModalData.dayStayTerms?.length > 0 && (
                        <>
                          <h6 className="text-secondary mb-2 pt-2 border-top">
                            <FaInfoCircle className="me-2" />
                            Day Stay Terms &amp; Conditions
                          </h6>
                          <ul className="mb-3 ps-3">
                            {policiesModalData.dayStayTerms.map(
                              (term, idx) => {
                                const text =
                                  typeof term === "string"
                                    ? term
                                    : term?.description ||
                                      term?.policyText ||
                                      term?.text ||
                                      "";
                                if (!text) return null;
                                return (
                                  <li
                                    key={idx}
                                    className="mb-2"
                                    style={{ whiteSpace: "pre-line" }}
                                  >
                                    {text}
                                  </li>
                                );
                              },
                            )}
                          </ul>
                        </>
                      )}

                      {policyList?.policies?.amendmentPolicy?.length > 0 && (
                        <>
                          <h6 className="text-warning mb-2 pt-2 border-top">
                            <FaInfoCircle className="me-2" />
                            Amendment Policies
                          </h6>
                          <ul className="mb-3 ps-3">
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
                        </>
                      )}

                      {policyList?.policies?.childPolicy?.length > 0 && (
                        <>
                          <h6 className="text-primary mb-2 pt-2 border-top">
                            <FaUsers className="me-2" />
                            Child Policy
                          </h6>
                          <ul className="mb-3 ps-3">
                            {policyList.policies.childPolicy.map(
                              (policy, idx) => (
                                <li
                                  key={idx}
                                  className="mb-2"
                                  style={{ whiteSpace: "pre-line" }}
                                >
                                  {policy?.policyText || ""}
                                </li>
                              ),
                            )}
                          </ul>
                        </>
                      )}

                      {policyList?.policies?.additionalPolicy &&
                        (() => {
                          const ap = policyList.policies.additionalPolicy;
                          const formatFee = (amt, type) => {
                            if (
                              amt === null ||
                              amt === undefined ||
                              Number(amt) === 0
                            )
                              return null;
                            const suffix =
                              String(type || "").toUpperCase() === "PERCENT"
                                ? "%"
                                : "";
                            return `${amt}${suffix}`;
                          };
                          const noShow = formatFee(
                            ap.noShowFee,
                            ap.noShowFeeType,
                          );
                          const earlyDep = formatFee(
                            ap.earlyDepartureFee,
                            ap.earlyDepartureFeeType,
                          );
                          const nonRef = formatFee(
                            ap.nonRefundableFee,
                            ap.nonRefundableFeeType,
                          );
                          if (!noShow && !earlyDep && !nonRef) return null;
                          return (
                            <>
                              <h6 className="text-info mb-2 pt-2 border-top">
                                <FaInfoCircle className="me-2" />
                                Additional Policy
                              </h6>
                              <ul className="mb-3 ps-3">
                                {noShow && (
                                  <li className="mb-2">
                                    <strong>No-Show Fee:</strong> {noShow}
                                  </li>
                                )}
                                {earlyDep && (
                                  <li className="mb-2">
                                    <strong>Early Departure Fee:</strong>{" "}
                                    {earlyDep}
                                  </li>
                                )}
                                {nonRef && (
                                  <li className="mb-2">
                                    <strong>Non-Refundable Fee:</strong>{" "}
                                    {nonRef}
                                  </li>
                                )}
                              </ul>
                            </>
                          );
                        })()}

                      <h6 className="text-secondary mb-2 pt-2 border-top">
                        <FaInfoCircle className="me-2" />
                        Hotel Terms &amp; Conditions
                      </h6>
                      {loadingTerms ? (
                        <div className="d-flex align-items-center text-muted mb-0">
                          <Spinner
                            animation="border"
                            size="sm"
                            className="me-2"
                          />
                          Loading terms &amp; conditions…
                        </div>
                      ) : policiesModalData.hotelTerms?.length > 0 ? (
                        <ul className="mb-0 ps-3">
                          {policiesModalData.hotelTerms.map((term, idx) => {
                            const text =
                              typeof term === "string"
                                ? term
                                : term?.description ||
                                  term?.policyText ||
                                  term?.text ||
                                  "";
                            if (!text) return null;
                            return (
                              <li
                                key={idx}
                                className="mb-2"
                                style={{ whiteSpace: "pre-line" }}
                              >
                                {text}
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="text-muted mb-0">
                          No hotel terms &amp; conditions configured.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="mb-3 text-muted small">
                      Click "Cancellation Policy" on a room category above
                      to view its cancellation policy &amp; terms here.
                    </div>
                  )}

                  <Row className="g-3 mt-1 pt-3 border-top">
                    <Col md={6}>
                      <div className="d-flex justify-content-between border-bottom pb-2 mb-2">
                        <span className="text-muted">Check-in Window</span>
                        <span className="fw-semibold">
                          {contract?.checkInStartTime
                            ? String(contract.checkInStartTime).slice(0, 5)
                            : "—"}{" "}
                          –{" "}
                          {contract?.checkInEndTime
                            ? String(contract.checkInEndTime).slice(0, 5)
                            : "—"}
                        </span>
                      </div>
                      <div className="d-flex justify-content-between border-bottom pb-2 mb-2">
                        <span className="text-muted">Check-out</span>
                        <span className="fw-semibold">
                          By {adjustedCheckOut || "—"} (window cap)
                        </span>
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
                </Col>
              </Row>
            </div>
          </div>
        </main>
      </div>

      {/* Confirm-Rate summary modal removed per client spec — Book
          takes the operator straight to the booking page. */}

      {/* Insufficient Credit Modal — informational gate. Does NOT block
          the booking; clicking OK re-runs the deferred proceedToBooking
          with skipCreditCheck=true so the user lands on the booking page
          and can complete payment online. Mirrors RoomList verbatim. */}
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
            Your available credit limit is not enough to cover this booking.
          </p>
          <p className="mb-0 text-muted small">
            You can still continue — please choose{" "}
            <strong>online payment</strong> on the booking page to complete
            this reservation.
          </p>
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

      {/* Cancellation Policies & Terms Modal — rich modal mirroring
          RoomList's. Sections: Cancellation Policies (from rate row),
          Amendment / Child / Additional (inhouse policyList, apiId=1),
          and Terms & Conditions (lazy-fetched + cached per hotelId). */}
      <Modal
        show={showPoliciesModal}
        onHide={() => setShowPoliciesModal(false)}
        size="lg"
        centered
        scrollable
        aria-labelledby="daystay-policies-terms-modal"
      >
        <Modal.Header closeButton>
          <Modal.Title id="daystay-policies-terms-modal">
            Cancellation Policies &amp; Terms &amp; Conditions
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ maxHeight: "70vh", overflowY: "auto" }}>
          {policiesModalData.selectedRoomLabel && (
            <div className="text-muted small mb-3">
              {policiesModalData.selectedRoomLabel}
            </div>
          )}

          {/* Day-stay-specific cancellation policies come embedded in
              the contract response (/api/day-stay-contract/{id}) as
              List<String> — render as-is; when the row happens to be an
              object we still pull the text out. */}
          <h6 className="text-danger mb-2">
            <FaTimesCircle className="me-2" />
            Day Stay Cancellation Policies
          </h6>
          {policiesModalData.dayStayCancellation?.length > 0 ? (
            <ul className="mb-4 ps-3">
              {policiesModalData.dayStayCancellation.map((policy, idx) => {
                const text =
                  typeof policy === "string"
                    ? policy
                    : policy?.policyText ||
                      policy?.description ||
                      policy?.text ||
                      "";
                const validity =
                  typeof policy === "object"
                    ? renderPolicyValidity(policy?.fromDate, policy?.toDate)
                    : null;
                if (!text && !validity) return null;
                return (
                  <li key={idx} className="mb-2">
                    <div style={{ whiteSpace: "pre-line" }}>{text}</div>
                    {validity && (
                      <small className="text-muted">{validity}</small>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted mb-4">
              No day-stay cancellation policies available for this rate.
            </p>
          )}

          {/* Day-stay-specific terms & conditions from the same contract
              response. Rendered separately from the hotel-wide T&C so
              the operator can distinguish contract vs hotel obligations. */}
          {policiesModalData.dayStayTerms?.length > 0 && (
            <>
              <h6 className="text-secondary mb-2 pt-2 border-top">
                <FaInfoCircle className="me-2" />
                Day Stay Terms &amp; Conditions
              </h6>
              <ul className="mb-4 ps-3">
                {policiesModalData.dayStayTerms.map((term, idx) => {
                  const text =
                    typeof term === "string"
                      ? term
                      : term?.description ||
                        term?.policyText ||
                        term?.text ||
                        "";
                  if (!text) return null;
                  return (
                    <li
                      key={idx}
                      className="mb-2"
                      style={{ whiteSpace: "pre-line" }}
                    >
                      {text}
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {policyList?.policies?.amendmentPolicy?.length > 0 && (
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

          {policyList?.policies?.childPolicy?.length > 0 && (
            <>
              <h6 className="text-primary mb-2 pt-2 border-top">
                <FaUsers className="me-2" />
                Child Policy
              </h6>
              <ul className="mb-4 ps-3">
                {policyList.policies.childPolicy.map((policy, idx) => (
                  <li
                    key={idx}
                    className="mb-2"
                    style={{ whiteSpace: "pre-line" }}
                  >
                    {policy?.policyText || ""}
                  </li>
                ))}
              </ul>
            </>
          )}

          {policyList?.policies?.additionalPolicy && (() => {
            const ap = policyList.policies.additionalPolicy;
            const formatFee = (amt, type) => {
              if (amt === null || amt === undefined || Number(amt) === 0) return null;
              const suffix =
                String(type || "").toUpperCase() === "PERCENT" ? "%" : "";
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
            Hotel Terms &amp; Conditions
          </h6>
          {loadingTerms ? (
            <div className="d-flex align-items-center text-muted mb-0">
              <Spinner animation="border" size="sm" className="me-2" />
              Loading terms &amp; conditions…
            </div>
          ) : policiesModalData.hotelTerms?.length > 0 ? (
            <ul className="mb-0 ps-3">
              {policiesModalData.hotelTerms.map((term, idx) => {
                const text =
                  typeof term === "string"
                    ? term
                    : term?.description || term?.policyText || term?.text || "";
                if (!text) return null;
                return (
                  <li
                    key={idx}
                    className="mb-2"
                    style={{ whiteSpace: "pre-line" }}
                  >
                    {text}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted mb-0">
              No hotel terms &amp; conditions available.
            </p>
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
}
