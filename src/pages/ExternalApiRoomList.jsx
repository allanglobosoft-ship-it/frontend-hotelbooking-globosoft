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
} from "react-icons/fa";
import { useLocation, useNavigate } from "react-router-dom";
import "../styles/RoomList.css";
import axiosInstance from "../components/AxiosInstance";
import toast from "react-hot-toast";
import { formatFlexibleDate } from "../utils/dateUtils";
import RoomFilters from "../components/roomlist/RoomFilters";
import useRoomFilters from "../hooks/useRoomFilters";
import { roomTypeNameForRate } from "../utils/mealPlanCategory";
import {
  GrnRefundBadge,
  GrnDeadlinePill,
  GrnPolicyBlock,
  GrnChangeNoticeModal,
  grnPolicyFromRate,
} from "../components/grn/GrnPolicy";
import {
  RateDeadlinePill,
  resolveDeadlineDate,
  isDeadlinePassed,
} from "../utils/rateDeadline";

/**
 * Renders "Valid: <from> - <to>" for a policy validity period, or null when
 * neither date is usable — same helper Inhouse RoomList uses so the modal
 * output looks identical.
 */
const renderPolicyValidity = (fromDate, toDate) => {
  const from = formatFlexibleDate(fromDate);
  const to = formatFlexibleDate(toDate);
  if (!from && !to) return null;
  return `Valid: ${from || "N/A"} - ${to || "N/A"}`;
};

/* The per-supplier Atharva / Darina / GoGlobal deadline pills that used to
   live here are gone. Every supplier except GRN now renders the shared
   RateDeadlinePill from utils/rateDeadline, which reads the same
   rate.deadlineDate those three used, falls back to the earliest
   cancellation-policy fromDate for the suppliers that send no deadline
   field at all, and prints one format in one colour. GRN keeps its own
   IST-based, colour-coded pill. */

/**
 * Strip HTML markup out of a policy string so the modal shows plain text.
 * Some suppliers (RateHawk, ATHARVA remarks, etc.) return the cancellation
 * policy with embedded <div>, <p>, <br>, <ul>/<li>, <b> etc. We convert
 * block-level closes and <br> to newlines (the modal uses white-space:
 * pre-line, so newlines render as line breaks), then drop every tag, then
 * decode the handful of HTML entities suppliers actually send. Returns "" for
 * a null / undefined input so React never renders "undefined".
 */
const stripHtmlTags = (raw) => {
  if (raw == null) return "";
  const s = String(raw)
    // Block-level breaks first, so text on either side of a </div>/<br>
    // ends up on separate lines in the modal.
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6])>/gi, "\n")
    // Bulletise <li> entries so lists remain readable after tags are gone.
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/li>/gi, "")
    // Drop every other tag (including opening <p>, <b>, <ul>, attributes …).
    .replace(/<[^>]+>/g, "")
    // Common HTML entities we actually see in supplier payloads.
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Collapse runs of blank lines and trim trailing whitespace on each line.
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s;
};

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
 * External / API-supplier room list. Presentation mirrors the Inhouse
 * RoomList; business logic (fetch endpoint, per-supplier accurate-rate
 * re-fetch for apiId 12/15, sessionStorage.bookingData ARRAY shape that
 * ApiBookingPageForHotels.jsx consumes) is preserved verbatim.
 */
const ExternalApiRoomList = () => {
  // ─────────────────────────────── state ───────────────────────────────
  const [roomData, setRoomData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [hotelStaticData, setHotelStaticData] = useState(null);
  const [searchPayload, setSearchPayload] = useState(null);
  const [loadingRate, setLoadingRate] = useState(false);
  const [showUnavailableModal, setShowUnavailableModal] = useState(false);
  // Default view for rate cards. Changed to "list" so the first render
  // after clicking "View Details / Book" shows the vertical list layout
  // (denser, easier scanning of rate details) rather than the grid tiles.
  // Operator can still toggle to grid via the icon buttons in the
  // "Available Room Categories" header. Mirrors the same default in
  // RoomList.jsx so the two room-list pages behave identically.
  const [viewMode, setViewMode] = useState("list");
  // `selectedRate` — array of rate rows used by the accurate-rate confirm
  // modal (apiId 12/15). Kept as an array because ApiBookingPageForHotels
  // reads bookingData.selectedRate via .map/.flatMap.
  const [selectedRate, setSelectedRate] = useState([]);

  // Display currency carried over from the hotel search. All rates remain
  // AED internally; this only re-formats numbers on screen.
  const [displayCurrency, setDisplayCurrency] = useState({
    code: "AED",
    factor: 1,
  });

  // Per-room-slot expansion keys so opening a category in Room 1 doesn't
  // also open it in Room 2 (multi-room searches only).
  const [activeAccordions, setActiveAccordions] = useState({});

  // One selection slot per requested room. Each entry: { roomNo,
  // selectedRate, hotelId, hotelName }. Matches the Inhouse shape so the
  // per-rate radio / bottom "Continue with Booking" flow lines up.
  const [selectedRooms, setSelectedRooms] = useState([]);

  // GRN-only bundle mode toggle (visible only for GRN multi-room searches).
  // "bundled"  = default, one rate covers all rooms (certified flow).
  // "non-bundled" = per-room rate picker; each room gets its own rateKey,
  //                 all picks must share the same group_code (tokenId).
  // Toggling clears selections so an incompatible mid-flight pick can't leak
  // into the booking payload. Non-GRN hotels ignore this state entirely.
  const [bundleMode, setBundleMode] = useState("bundled");

  // Agent credit gate. Same pattern as Inhouse — soft warning, never
  // blocks; user clicks "OK, continue" and we resume the queued booking
  // handler with skipCreditCheck=true so downstream flow is unchanged.
  // `agentBalance` stays in AED — every credit gate below compares against
  // AED-denominated totals, so the value used by the gates MUST remain the
  // raw AED number the backend already exposed on
  // `effectiveAvailableCreditLimit`. See RoomList.jsx for the same rule.
  const [agentBalance, setAgentBalance] = useState(null);
  // Display-only companions: the same figure rendered in the agent's
  // configured currency (populated from the backend's
  // effectiveAvailableCreditLimitInAgentCurrency + currencyCode).
  const [agentBalanceDisplay, setAgentBalanceDisplay] = useState(null);
  const [agentBalanceCurrency, setAgentBalanceCurrency] = useState("AED");
  const [showInsufficientCreditModal, setShowInsufficientCreditModal] =
    useState(false);
  const [pendingBookingFn, setPendingBookingFn] = useState(null);

  // Cancellation Policies & Terms modal — sourced from the search
  // response; no extra API call for external suppliers.
  //
  // Exception: ATHARVA (apiId 3). Their search response has no cancellation
  // policy — it is only produced by the HPreBooking call. When the user opens
  // the modal for an ATHARVA rate we call /api/hotel-booking/atharva/prebook,
  // display the returned policies, and cache the response keyed by rate so
  // subsequent opens are instant and the booking payload can pick up the
  // fresh TokenId / HKey / RateKey the vendor requires.
  const [showPoliciesModal, setShowPoliciesModal] = useState(false);
  const [policiesModalData, setPoliciesModalData] = useState({
    cancellationPolicies: [],
    termsAndConditions: [],
    selectedRoomLabel: "",
  });
  const [prebookLoading, setPrebookLoading] = useState(false);
  const [prebookError, setPrebookError] = useState(null);
  // GRN "price / policy changed since search" gate. Set after recheck when
  // GRN's price_changed / cp_changed (or our own search-vs-recheck diff)
  // reports a change: { items: [...], onAccept } — the Room Details modal
  // only opens after the operator accepts the NEW terms.
  const [grnChangeNotice, setGrnChangeNotice] = useState(null);
  // rateKey -> AtharvaPreBookResponseDTO (fresh tokenId/hKey/rateKey/policies)
  const [atharvaPrebookCache, setAtharvaPrebookCache] = useState({});
  // cacheKey -> { data: GrnRecheckResponseDTO, at: epochMs }.
  // Populated the first time a GRN rate is rechecked (Cancellation Policies
  // modal, View Details / Select, or Continue with Booking); a repeat within
  // the TTL is served from here so one operator interaction never fires two
  // identical supplier calls.
  //
  // The key deliberately includes the SEARCH the rate belongs to, and entries
  // expire. GRN reuses the same rate_key across search sessions, but a
  // recheck is only valid for the search_id it ran under (the server-side sid
  // TTL is 30 minutes). Keying on rate_key alone — and never expiring —
  // let a recheck from an earlier search satisfy a later one, so no call went
  // out and GRN rejected the booking with 1513 "TW Issue".
  const [grnRecheckCache, setGrnRecheckCache] = useState({});
  const GRN_RECHECK_TTL_MS = 2 * 60 * 1000;
  const grnRecheckKey = (rate) =>
    [
      roomData?.payload?.hotelCode,
      roomData?.payload?.checkInDate,
      roomData?.payload?.checkOutDate,
      rate?.rateKey,
    ].join("|");

  const location = useLocation();
  const navigate = useNavigate();

  const apiIdMapping = {
    JUMEIRAH: 10,
    IWTX: 12,
    X3: 15,
    RATEHAWK: 14,
    DARINA: 16,
    ATHARVA: 3,
    // GRN Connect. Rate-recheck path lives at /api/hotel-booking/grn/recheck
    // and is called only when the guest opens the Cancellation Policies &
    // Terms modal for a GRN rate — never on page load. apiId=20 avoids
    // colliding with the existing Juniper booking's apiId=17.
    GRN: 20,
    // GoGlobal (Yanolja Go Global). Room list availability routes to
    // GoGlobalHotelRoomSearchService (apiId=21). Its offers carry
    // HotelSearchCode as the rateKey — GoGlobal's session handle for
    // Booking Valuation / Booking Creation. No page-load recheck.
    GOGLOBAL: 21,
  };

  const activeUserRole = localStorage.getItem("currentActiveRole");

  // ─────────────────────────── helpers ────────────────────────────────

  /**
   * Fetch ATHARVA HPreBooking for a single selected rate and turn its
   * `Policies[] × CancellationPolicy[]` into the same {policyText, fromDate,
   * toDate} shape the modal already renders. On success the response is
   * cached against the rate's `rateKey` so opening the modal again is free
   * and the booking payload can pull the fresh keys back out.
   *
   * Returns the response object (success or failure) so the caller can
   * decide whether to still open the modal, which we always do — showing the
   * error inside the same modal is more discoverable than a toast.
   */
  const fetchAtharvaPrebook = async (rate) => {
    if (!rate?.rateKey || !rate?.hKey || !rate?.tokenId) {
      return {
        success: false,
        message:
          "ATHARVA prebook: search response is missing tokenId / hKey / rateKey — cannot fetch policy.",
      };
    }
    if (atharvaPrebookCache[rate.rateKey]) {
      return atharvaPrebookCache[rate.rateKey];
    }
    const { payload } = roomData || {};
    const req = {
      agentId: payload?.agentId ? String(payload.agentId) : null,
      cityId: payload?.cityId || null,
      nationalityId: payload?.nationalityId || null,
      nationality: payload?.nationality || null,
      checkInDate: payload?.checkInDate,
      checkOutDate: payload?.checkOutDate,
      hotelCode: payload?.hotelCode,
      tokenId: rate.tokenId,
      hKey: rate.hKey,
      rooms: (payload?.rooms || []).map((r, i) => ({
        roomSrNo: i + 1,
        noOfAdult: r.adults,
        noOfChild: r.children || 0,
        childAges: r.childAges || [],
        rateKey: rate.rateKey,
      })),
    };
    try {
      const resp = await axiosInstance.post(
        "/api/hotel-booking/atharva/prebook",
        req,
      );
      const data = resp?.data || {};
      if (data.success) {
        setAtharvaPrebookCache((prev) => ({ ...prev, [rate.rateKey]: data }));
      }
      return data;
    } catch (err) {
      const backendMsg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Prebook request failed";
      return { success: false, message: backendMsg };
    }
  };

  /**
   * Fetch GRN Rate Recheck for a single selected rate. Turns GRN's response
   * into the same {policyText, fromDate, value, percentOrAmount} rows the
   * modal already renders for other suppliers. On success caches the
   * response against the rate's `rateKey` so opening the modal again is
   * free and the booking payload can pull the fresh grnSearchId / rateKey /
   * groupCode back out.
   */
  const fetchGrnRecheck = async (rate) => {
    if (!rate?.rateKey) {
      return {
        success: false,
        message: "GRN recheck: rate is missing rateKey — cannot verify policy.",
      };
    }
    const cacheKey = grnRecheckKey(rate);
    const cached = grnRecheckCache[cacheKey];
    if (cached && Date.now() - cached.at < GRN_RECHECK_TTL_MS) {
      return cached.data;
    }
    const { payload } = roomData || {};
    const req = {
      hotelCode: payload?.hotelCode,
      checkInDate: payload?.checkInDate,
      checkOutDate: payload?.checkOutDate,
      nationality: payload?.nationality,
      agentId: payload?.agentId ? String(payload.agentId) : null,
      rooms: payload?.rooms || [],
      rateKey: rate.rateKey,
      groupCode: rate.tokenId || null,
      roomCode: rate.roomTypeCode || null,
    };
    try {
      const resp = await axiosInstance.post(
        "/api/hotel-booking/grn/recheck",
        req,
      );
      const data = resp?.data || {};
      if (data.success) {
        setGrnRecheckCache((prev) => ({
          ...prev,
          [cacheKey]: { data, at: Date.now() },
        }));
      }
      return data;
    } catch (err) {
      const backendMsg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Recheck request failed";
      return { success: false, message: backendMsg };
    }
  };

  /**
   * Call /api/hotel-booking/darina/prebook for a single rate (search-time
   * values are enough — hotelCode + roomTypeCode + mealPlanCode + pax +
   * dates + nationality). Returns the DarinaPreBookResponseDTO shape:
   *   { success, message, contractTokenId, rate, ratePerNight,
   *     rateWithoutMarkup, cancellationPolicies, deadlineDate,
   *     nonRefundable, roomCategory, mealPlan }
   */
  const fetchDarinaPrebook = async (rate) => {
    const payload = roomData?.payload || {};
    const hotel = roomData?.hotels?.[0] || {};
    const firstRoom = payload?.rooms?.[0] || {};
    const req = {
      agentId: payload?.agentId ? String(payload.agentId) : null,
      nationality: payload?.nationality || null,
      checkInDate: payload?.checkInDate,
      checkOutDate: payload?.checkOutDate,
      hotelCode: payload?.hotelCode || hotel?.hotelId || null,
      roomTypeCode: rate?.roomTypeCode,
      mealPlanCode: rate?.mealPlanCode,
      // BE tolerates a null occupancyId; passing it when known helps the
      // supplier pick the exact rate serial we saw at search time.
      occupancyId: rate?.occupancyId || null,
      contractTokenId: rate?.contractTokenId || null,
      adults: firstRoom.adults ?? firstRoom.noOfAdult ?? 1,
      children: firstRoom.children ?? firstRoom.noOfChild ?? 0,
      childAges: firstRoom.childAges || [],
    };
    try {
      const resp = await axiosInstance.post(
        "/api/hotel-booking/darina/prebook",
        req,
      );
      return resp?.data || { success: false, message: "Empty response" };
    } catch (err) {
      const backendMsg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Prebook request failed";
      return { success: false, message: backendMsg };
    }
  };

  /**
   * RATEHAWK prebook — mirrors fetchDarinaPrebook. Called from the
   * RoomList "View Details / Select" click for RateHawk rates (apiId=14)
   * so the same "Fetching accurate rate…" modal IWTX/X3/Darina use.
   *
   * <p>RateHawk's prebook needs only the search-time book_hash (stored on
   * rate.roomTypeCode by RatehawkHotelRoomSearchService.mapToHotelResponses).
   * The backend applies the caller's agent markup so the returned rate
   * matches the room-list card exactly.
   *
   * <p>Returns a resolved object (never throws) so the caller can branch
   * on its .success field. Response shape:
   *   { success, message, bookHash, priceChanged, rate, rateWithoutMarkup,
   *     currency, roomCategory, mealPlan, cancellationPolicies,
   *     nonRefundable, deadlineDate }
   */
  const fetchRatehawkPrebook = async (rate) => {
    const payload = roomData?.payload || {};
    const req = {
      agentId: payload?.agentId ? String(payload.agentId) : null,
      // RateHawk's book_hash lands on rate.roomTypeCode at search time.
      hash: rate?.roomTypeCode,
    };
    try {
      const resp = await axiosInstance.post(
        "/api/hotel-booking/ratehawk/prebook",
        req,
      );
      return resp?.data || { success: false, message: "Empty response" };
    } catch (err) {
      const backendMsg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Prebook request failed";
      return { success: false, message: backendMsg };
    }
  };

  /**
   * GoGlobal Booking Valuation (OperationType 9) — the spec's mandatory
   * "check for price and cancellation deadline changes as well as late
   * remarks" step between availability and booking. Called from the RoomList
   * "View Details / Select" click for GoGlobal rates (apiId=21) so the
   * operator sees the latest rate + deadline in the confirm modal before the
   * booking page. GoGlobal's HotelSearchCode rides on rate.rateKey (set by
   * GoGlobalHotelRoomSearchService).
   *
   * <p>Returns a resolved object (never throws) so the caller can branch on
   * .success. Response shape:
   *   { success, message, hotelSearchCode, arrivalDate, cancellationDeadline,
   *     remarks, priceChanged, currency, totalRate, totalRateWithoutMarkup,
   *     previousTotalRate }
   */
  const fetchGoGlobalValuation = async (rate) => {
    const payload = roomData?.payload || {};
    const req = {
      hotelSearchCode: rate?.rateKey,
      arrivalDate: payload.checkInDate,
      agentId: payload?.agentId != null ? String(payload.agentId) : null,
      currentTotalRate: rate?.totalRate ?? null,
    };
    try {
      const resp = await axiosInstance.post(
        "/api/hotel-booking/goglobal/valuation",
        req,
      );
      return resp?.data || { success: false, message: "Empty response" };
    } catch (err) {
      const backendMsg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Valuation request failed";
      return { success: false, message: backendMsg };
    }
  };

  const openPoliciesModal = async (rate, hotelDetail) => {
    const label = [rate?.roomCategory, rate?.mealPlan]
      .filter(Boolean)
      .join(" • ");
    const inlineTerms = Array.isArray(rate?.termsAndConditions)
      ? rate.termsAndConditions
      : Array.isArray(hotelDetail?.termsAndConditions)
        ? hotelDetail.termsAndConditions
        : [];
    // IWTX (and other API suppliers) don't send policy rows for
    // non-refundable rates — the list arrives empty. Without carrying the
    // flag through, the modal used to fall back to "No cancellation
    // policies available", which reads as "we don't know" instead of
    // "you can't cancel". Match the wording the booking page already uses.
    const isNonRefundable =
      String(rate?.nonRefundable).toLowerCase() === "true";

    const supplierApiId = resolveApiId(hotelDetail);
    const isAtharva = supplierApiId === apiIdMapping.ATHARVA;
    const isGrn = supplierApiId === apiIdMapping.GRN;

    // GRN: policies come from a real-time recheck call. The Room List's
    // policy rows are the search-time snapshot; recheck gives us GRN's
    // authoritative price + cancellation + inclusions before the guest
    // proceeds to booking. Opens the modal immediately with the search-time
    // policies as a fallback, then swaps them for the rechecked values.
    if (isGrn) {
      const fallbackCancellation = Array.isArray(rate?.cancellationPolicies)
        ? rate.cancellationPolicies
        : [];
      // other_inclusions from GRN's availability endpoint (search-time).
      // Rendered as its own bulleted section in the modal. Use recheck's
      // list when it comes back, falling back to search-time here so the
      // modal shows something immediately instead of waiting on recheck.
      const fallbackInclusions = Array.isArray(rate?.otherInclusions)
        ? rate.otherInclusions
        : [];
      // rate_comments from GRN's availability endpoint — { comments,
      // mealplan, pax_comments, remarks, MandatoryTax }. Any of the five
      // keys may be missing or blank; the modal renders only what's
      // populated. Availability is the only source today (the recheck DTO
      // doesn't carry them), so the same object survives into the
      // post-recheck state below.
      const fallbackRateComments =
        rate?.rateComments && typeof rate.rateComments === "object"
          ? rate.rateComments
          : null;
      setPrebookError(null);
      setPoliciesModalData({
        cancellationPolicies: fallbackCancellation,
        termsAndConditions: inlineTerms,
        selectedRoomLabel: label,
        nonRefundable: isNonRefundable,
        otherInclusions: fallbackInclusions,
        rateComments: fallbackRateComments,
        // Search-time policy summary (same mapper as recheck on the BE) —
        // shown immediately, replaced by the rechecked one below.
        isGrn: true,
        grnPolicy: grnPolicyFromRate(rate),
        grnVerified: false,
      });
      setShowPoliciesModal(true);
      setPrebookLoading(true);
      try {
        const recheck = await fetchGrnRecheck(rate);
        if (recheck?.success) {
          const rechecked = grnPolicyFromRate({
            refundCategory: recheck.refundCategory,
            refundStatus: recheck.refundStatus,
            policyText: recheck.policyText,
            freeCancellationUntil: recheck.freeCancellationUntil,
            cancelByDate: recheck.cancelByDate,
            cancellationPolicies: recheck.cancellationPolicies,
            noShowFeeText: recheck.noShowFeeText,
            underCancellation: recheck.underCancellation,
            policyTimezone: recheck.policyTimezone,
            nonRefundable: recheck.nonRefundable,
          });
          setPoliciesModalData({
            cancellationPolicies: recheck.cancellationPolicies || fallbackCancellation,
            termsAndConditions: inlineTerms,
            selectedRoomLabel: label,
            isGrn: true,
            grnPolicy: rechecked,
            grnVerified: true,
            grnChange: buildGrnChangeItem(label, rate, recheck),
            // Payable-at-Hotel from the RECHECKED rate — GRN's guaranteed
            // figure for what the property will collect at check-in. Stashed
            // separately from remark/policyText so the modal can highlight
            // it as its own line and never fold it into the booking total.
            payableAtHotelAmount: recheck.payableAtHotelAmount ?? null,
            payableAtHotelCurrency: recheck.payableAtHotelCurrency ?? null,
            payableAtHotelDescription: recheck.payableAtHotelDescription ?? null,
            nonRefundable:
              typeof recheck.nonRefundable === "boolean"
                ? recheck.nonRefundable
                : isNonRefundable,
            // Prefer the recheck's inclusions (authoritative for booking),
            // fall back to the availability list when recheck omitted it.
            otherInclusions:
              (Array.isArray(recheck.otherInclusions) && recheck.otherInclusions.length > 0)
                ? recheck.otherInclusions
                : fallbackInclusions,
            // rate_comments come from the availability response only —
            // preserve them through the recheck refresh so the modal
            // keeps showing GRN's free-text notes.
            rateComments: fallbackRateComments,
          });
        } else {
          setPrebookError(recheck?.message || "Recheck failed.");
          console.warn("GRN recheck: no policy returned:", recheck?.message);
        }
      } finally {
        setPrebookLoading(false);
      }
      return;
    }

    // Non-ATHARVA: policies come from the search response, same as before.
    if (!isAtharva) {
      const cancellation = Array.isArray(rate?.cancellationPolicies)
        ? rate.cancellationPolicies
        : Array.isArray(hotelDetail?.cancellationPolicies)
          ? hotelDetail.cancellationPolicies
          : [];
      // GoGlobal (apiId 21): also surface the CxlDeadLine at the top of the
      // modal. The GoGlobal Remark is already part of cancellation[] (the BE
      // appends it), so it renders in the policy list below the deadline.
      const isGoGlobal = supplierApiId === apiIdMapping.GOGLOBAL;
      setPrebookError(null);
      setPoliciesModalData({
        cancellationPolicies: cancellation,
        termsAndConditions: inlineTerms,
        selectedRoomLabel: label,
        nonRefundable: isNonRefundable,
        deadlineDate: isGoGlobal ? rate?.deadlineDate || null : null,
      });
      setShowPoliciesModal(true);
      return;
    }

    // ATHARVA: open the modal in a loading state, hit prebook, then fill it.
    setPrebookError(null);
    setPoliciesModalData({
      cancellationPolicies: [],
      termsAndConditions: inlineTerms,
      selectedRoomLabel: label,
      nonRefundable: isNonRefundable,
    });
    setShowPoliciesModal(true);
    setPrebookLoading(true);
    try {
      const prebook = await fetchAtharvaPrebook(rate);
      if (prebook?.success) {
        setPoliciesModalData({
          cancellationPolicies: prebook.cancellationPolicies || [],
          termsAndConditions: inlineTerms,
          selectedRoomLabel: label,
          // Aggregated Atharva Policies[].Remark from the prebook — shown as
          // a top-of-modal notice (includes "IMPORTANT NOTE …" content).
          remark: prebook.remark || null,
        });
      } else {
        // Supplier prebook returned no policy (e.g. Atharva "HPreBooking error
        // 2001: No Result Found."). Swallow the raw vendor text so the modal
        // shows only the "No cancellation policies available." / "No terms &
        // conditions available." placeholders instead of an alarming banner.
        // The vendor detail is still logged for operator triage.
        console.warn("Atharva prebook: no policy returned:", prebook?.message);
      }
    } finally {
      setPrebookLoading(false);
    }
  };

  const getMealPlanIcon = (mealPlan) => {
    switch (String(mealPlan || "").toLowerCase()) {
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

  // `deadlinePassed` is derived by the caller (isDeadlinePassed on the rate's
  // resolved deadline) and lets the badge downgrade a supplier-flagged
  // Flexible rate whose free-cancellation window has already closed —
  // otherwise the card promises green while BookingDetailedView's cancel
  // gate will refuse. Non-refundable and unknown cases are unchanged.
  const getRefundStatusBadgeInRoomList = (nonRefundable, deadlinePassed = false) => {
    const value = String(nonRefundable).toLowerCase();
    switch (value) {
      case "false":
        return deadlinePassed ? (
          <Badge
            bg="danger"
            title="The free-cancellation window has already closed for this rate."
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

  // ─── GRN recheck → mapped-rate overlay ─────────────────────────────
  // Recheck is GRN's guaranteed snapshot: price, refund category, free-
  // cancellation deadline (IST), penalty windows, no-show fee, PAN flag,
  // payable-at-hotel and the rate_key to book with. Every field is copied
  // straight off the response (not read back from grnRecheckCache, whose
  // setState has not committed in the same tick).
  const applyGrnRecheckToMapped = (mapped, recheck) => {
    if (!mapped || !recheck?.success) return mapped;
    if (recheck.totalPriceWithMarkup != null) {
      mapped.rate = recheck.totalPriceWithMarkup;
    } else if (recheck.totalPrice != null) {
      mapped.rate = recheck.totalPrice;
    }
    if (recheck.totalPrice != null) mapped.rateWithoutMarkup = recheck.totalPrice;
    if (recheck.currency) mapped.currency = recheck.currency;
    if (recheck.nonRefundable != null) mapped.nonRefundable = recheck.nonRefundable;
    if (Array.isArray(recheck.cancellationPolicies)) {
      mapped.cancellationPolicy = recheck.cancellationPolicies;
    }
    if (recheck.refundCategory) mapped.refundCategory = recheck.refundCategory;
    if (recheck.refundStatus) mapped.refundStatus = recheck.refundStatus;
    mapped.cancelByDate = recheck.cancelByDate ?? mapped.cancelByDate ?? null;
    mapped.freeCancellationUntil =
      recheck.freeCancellationUntil ?? mapped.freeCancellationUntil ?? null;
    mapped.underCancellation = recheck.underCancellation ?? mapped.underCancellation ?? null;
    mapped.noShowFeeText = recheck.noShowFeeText ?? mapped.noShowFeeText ?? null;
    mapped.policyTimezone = recheck.policyTimezone || mapped.policyTimezone || "IST";
    mapped.policyText = recheck.policyText ?? mapped.policyText ?? null;
    mapped.panRequired = recheck.panRequired === true;
    if (recheck.payableAtHotelAmount != null || recheck.payableAtHotelDescription) {
      mapped.payableAtHotelAmount = recheck.payableAtHotelAmount ?? null;
      mapped.payableAtHotelCurrency = recheck.payableAtHotelCurrency ?? null;
      mapped.payableAtHotelDescription = recheck.payableAtHotelDescription ?? null;
    }
    if (
      Array.isArray(recheck.otherInclusions) &&
      recheck.otherInclusions.length > 0
    ) {
      mapped.otherInclusions = recheck.otherInclusions;
    }
    // Docs: for a rate_type "recheck" rate, book with the rate_key from the
    // recheck response. This is the slot the booking page reads for
    // rooms[].rateKey.
    if (recheck.rateKey) mapped.atharvaRateKey = recheck.rateKey;
    if (recheck.groupCode) mapped.atharvaTokenId = recheck.groupCode;
    mapped.grnPriceChanged = recheck.priceChanged === true;
    mapped.grnPolicyChanged = recheck.policyChanged === true;
    mapped.contractLabel = mapped.contractLabel || "Verified rate (GRN)";
    return mapped;
  };

  // One change-notice entry per rechecked rate. `searchRate` is the room
  // list rate (search snapshot) — used as the "before" when the backend
  // did not carry an original (e.g. cache miss).
  const buildGrnChangeItem = (roomLabel, searchRate, recheck) => {
    if (!recheck?.success) return null;
    const priceChanged = recheck.priceChanged === true;
    const policyChanged = recheck.policyChanged === true;
    if (!priceChanged && !policyChanged) return null;
    const oldPolicy =
      recheck.originalRefundStatus || recheck.originalCancellationPolicies
        ? grnPolicyFromRate({
            refundStatus: recheck.originalRefundStatus,
            policyText: recheck.originalPolicyText,
            freeCancellationUntil: recheck.originalFreeCancellationUntil,
            cancellationPolicies: recheck.originalCancellationPolicies,
            nonRefundable: /non-refundable/i.test(recheck.originalRefundStatus || ""),
          })
        : grnPolicyFromRate(searchRate);
    return {
      roomLabel,
      priceChanged,
      policyChanged,
      oldPrice:
        recheck.originalTotalPriceWithMarkup ??
        recheck.originalTotalPrice ??
        searchRate?.totalRate ??
        null,
      newPrice: recheck.totalPriceWithMarkup ?? recheck.totalPrice ?? null,
      oldPolicy,
      newPolicy: grnPolicyFromRate({
        refundCategory: recheck.refundCategory,
        refundStatus: recheck.refundStatus,
        policyText: recheck.policyText,
        freeCancellationUntil: recheck.freeCancellationUntil,
        cancellationPolicies: recheck.cancellationPolicies,
        noShowFeeText: recheck.noShowFeeText,
        underCancellation: recheck.underCancellation,
        policyTimezone: recheck.policyTimezone,
        nonRefundable: recheck.nonRefundable,
      }),
    };
  };

  // GRN rate-card refund pill: category badge (Fully / Partially / Non-
  // refundable) instead of the generic Flexible / Non-Refundable pair.
  const renderGrnRefundBadge = (rate) => <GrnRefundBadge rate={rate} />;

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
            <span style={{ color: "#198754", fontWeight: 700 }}>Available</span>
          </small>
        );
      default:
        return <small>This room is Available</small>;
    }
  };

  const getRefundStatusBadge = (refundStatus) => {
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
    // Rates stay in AED; convert only for display using the carried-over
    // factor from the search page. bookingData / credit checks continue
    // to use raw AED so the API payload contract is unchanged.
    const converted = (Number(price) || 0) * (displayCurrency.factor || 1);
    return `${displayCurrency.code || "AED"} ${converted.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  // GRN "Payable at Hotel" pill — surfaces the guest-paid property
  // charges (price_details.hotel_charges[] with included:false) that the
  // backend now returns on GRN rates. Never part of totalRate, so it must
  // read as a SEPARATE line and never be added into the total displayed
  // above. Returns null for other suppliers and for GRN rates that carry
  // no such charge, so nothing else's layout shifts.
  //
  // Currency handling mirrors what BookingCompletedServiceImpl does on the
  // server: when GRN quoted the charge in the rate's base currency (AED)
  // we convert with the same factor the rest of the page uses; when it's
  // in some other currency (a property charging locally) we render it
  // unconverted so an AED factor never touches the wrong quote.
  const renderPayableAtHotelPill = (rate) => {
    const amount = rate?.payableAtHotelAmount;
    const label = rate?.payableAtHotelDescription;
    if (amount == null && !label) return null;
    let display = null;
    if (amount != null) {
      const chargeCurrency = (rate.payableAtHotelCurrency || "AED").toUpperCase();
      const inBase = chargeCurrency === "AED";
      display = inBase
        ? formatPrice(amount)
        : `${chargeCurrency} ${Number(amount).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`;
    }
    return (
      <div
        className="feature-item"
        title="Collected by the hotel at check-in. NOT part of the booking total shown above."
        style={{
          background: "#fff4e5",
          color: "#7a4a00",
          border: "1px solid #f0c78a",
          borderRadius: 6,
          padding: "4px 8px",
          fontSize: "0.75rem",
          fontWeight: 600,
        }}
      >
        Payable at hotel{label ? ` (${label})` : ""}
        {display ? `: ${display}` : ""}
      </div>
    );
  };

  const renderStars = (rating) =>
    Array.from({ length: rating || 0 }, (_, i) => (
      <FaStar key={i} className="text-warning" />
    ));

  // Shared filter state — same hook every other room-list page uses.
  const filters = useRoomFilters();

  // Rate → normalised shape the shared predicate understands.
  //
  // Refund: read the same value the card badge shows. For ATHARVA the search
  // response always says refundable and the truth only arrives with the
  // prebook (cached per rateKey), so without this the "Non Refundable"
  // filter never matched an Atharva rate the badge already marked as such.
  //
  // Room Type: the checkboxes are the inhouse master names ("Room with
  // BreakFast", …) while suppliers send "Bed and Breakfast", "BB",
  // "half-board", "nomeal", … — the shared predicate compares names exactly,
  // so ticking any Room Type used to hide every API rate. Map the supplier
  // meal plan onto the master name of the same board category first.
  const rateMatches = (rate) => {
    const nonRefundable =
      atharvaPrebookCache?.[rate?.rateKey]?.nonRefundable ?? rate?.nonRefundable;
    return filters.rateMatches({
      isNonRefundable:
        nonRefundable === true ||
        ["true", "y", "yes"].includes(String(nonRefundable).toLowerCase()),
      mealPlan: roomTypeNameForRate(rate, filters.roomTypeOptions),
    });
  };

  // Room-name search — matches on full name, and expands a handful of
  // common trade abbreviations so shorthand like "DLX" hits "Deluxe".
  const [roomSearch, setRoomSearch] = useState("");
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
    const tokens = q.split(/\s+/).filter(Boolean);
    return tokens.every((t) => {
      if (n.includes(t)) return true;
      const expanded = ROOM_ABBREVIATIONS[t];
      return expanded ? n.includes(expanded) : false;
    });
  };

  // ─────────────────────────── effects ────────────────────────────────
  useEffect(() => {
    const fetchRooms = async () => {
      try {
        setLoading(true);
        setError(null);

        let payload = location.state?.payload;
        let meta = location.state?.meta;
        let currencyInfo = location.state?.currency;

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
            }
          } catch (e) {
            console.error("Error parsing sessionStorage:", e);
          }
        }

        if (currencyInfo) {
          setDisplayCurrency({
            code: currencyInfo.code || "AED",
            factor:
              Number(currencyInfo.factor) > 0 ? Number(currencyInfo.factor) : 1,
          });
        }

        if (!payload) {
          setError("Missing search context. Please go back and try again.");
          setLoading(false);
          return;
        }

        // For GRN multi-room searches, ask the backend to include
        // non-bundled + partial-bundled rates alongside bundled ones in the
        // response. The rates come back tagged with a `bundleType` field so
        // the UI can toggle between "Book as one package" (bundled) and
        // "Pick per room" (non-bundled) without a second network trip.
        // Single-room and non-GRN searches are unaffected — the flag is
        // GRN-scoped on the backend and other suppliers ignore it.
        const isGrnMultiRoom =
          Number(payload?.apiId) === 20 && (payload?.rooms || []).length > 1;
        // GoGlobal (apiId 21) multi-room opt-in. When more than one room is
        // requested, ask the backend to fan out to K parallel single-room
        // HOTEL_SEARCH_REQUEST calls (spec §6) so each returned offer has
        // its own HotelSearchCode covering exactly one physical room. The
        // FE then filters offers per slot by roomSlotIndex and fires K
        // valuations (§7) + K bookings (§8) under one BasketNumber.
        // Single-room GoGlobal searches skip the flag → existing bundle
        // path runs unchanged; other suppliers ignore the flag.
        const isGoGlobalMultiRoomSearch =
          Number(payload?.apiId) === 21 && (payload?.rooms || []).length > 1;
        let searchBody = payload;
        if (isGrnMultiRoom) {
          searchBody = { ...searchBody, includeNonBundled: true };
        }
        if (isGoGlobalMultiRoomSearch) {
          searchBody = { ...searchBody, goglobalPerRoomMode: true };
        }
        const res = await axiosInstance.post("/api/hotel-rooms/search", searchBody);

        if (!res.data || res.data.success === false) {
          const message = res.data?.message || "Search failed. Please try again.";
          if (message.toLowerCase().includes("no availability found")) {
            setShowUnavailableModal(true);
          } else {
            setError(message);
          }
          setLoading(false);
          return;
        }

        const enriched = {
          ...res.data,
          hotels: (res.data.hotels || []).map((h) => ({
            ...h,
            roomCategories: (h.roomCategories || []).map((c) => ({
              ...c,
              availableRates: (c.availableRates || [])
                .slice()
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

  // Agent credit balance — same endpoint / same fallback keys as Inhouse.
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
        if (cancelled) return;
        setAgentBalance(
          res?.data?.effectiveAvailableCreditLimit ??
            res?.data?.availableCreditLimit ??
            null,
        );
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

  // Initialise one selection slot per requested room the first time (or
  // whenever the slot count changes). Preserves picks across filter /
  // view-mode toggles.
  const numRooms = (roomData?.payload?.rooms || []).length || 1;
  const isMultiRoom = numRooms > 1;

  // Amount a rate card prints as its price (multi-room: the rate's total;
  // single room: rate × rooms, falling back to the total). All suppliers
  // put the MARKED-UP figure in these two fields, so the accordion header
  // ("From …") reads the same number as the cards beneath it.
  const displayTotalOf = (rate) =>
    Number(
      isMultiRoom
        ? rate?.totalRate || 0
        : rate?.roomRateBasedOnRoomCount || rate?.totalRate || 0,
    ) || 0;

  // Nights across the searched stay — derived once at the render scope so
  // both the rate-card breakdown ("N nights × M rooms") and the Booking
  // Summary sidebar (which shows "Nights: N") stay in sync with the confirm
  // modal's own local stayNights computation. Defaults to 1 so a same-day
  // search never divides or multiplies by zero.
  const stayNights = (() => {
    try {
      const ci = roomData?.payload?.checkInDate
        ? new Date(roomData.payload.checkInDate)
        : null;
      const co = roomData?.payload?.checkOutDate
        ? new Date(roomData.payload.checkOutDate)
        : null;
      if (ci && co && !isNaN(ci) && !isNaN(co)) {
        const diff = Math.round((co - ci) / (1000 * 60 * 60 * 24));
        if (diff > 0) return diff;
      }
    } catch (e) {
      /* fall through */
    }
    return 1;
  })();

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

  const allRoomsSelected =
    selectedRooms.length > 0 &&
    selectedRooms.every((r) => r.selectedRate !== null);

  // GRN non-bundled UI is only relevant for a multi-room GRN search — the
  // toggle, per-room picker, and group_code guard are all no-ops otherwise.
  // Derived once so all downstream render code (filter chain, click handler,
  // empty-state message) reads a single truthy value.
  const isGrnMultiRoomFlow =
    Number(roomData?.payload?.apiId) === 20 && isMultiRoom;
  const isNonBundledMode = isGrnMultiRoomFlow && bundleMode === "non-bundled";

  // For the empty-state banner: does the search response actually contain
  // any non-bundled / partial-bundled rates? Some hotels have bundled-only
  // inventory even when includeNonBundled=true is set — in that case the
  // "Pick per room" mode has nothing to render and the user is stuck
  // wondering why. Precomputing this lets the toggle show a helpful
  // message instead of an empty accordion.
  const hasNonBundledRates =
    isGrnMultiRoomFlow &&
    (roomData?.hotels || []).some((h) =>
      (h?.roomCategories || []).some((c) =>
        (c?.availableRates || []).some(
          (r) => r?.bundleType === "non-bundled" || r?.bundleType === "partial-bundled",
        ),
      ),
    );

  // Handler for the mode toggle. Switching modes ALWAYS clears prior picks so
  // (a) a bundled rate can't leak into the per-room picker (or vice versa) and
  // (b) the group_code / rateKey combos stay coherent when the picker
  // re-renders with the new rate set.
  const switchBundleMode = (nextMode) => {
    if (nextMode === bundleMode) return;
    setBundleMode(nextMode);
    setSelectedRooms((prev) =>
      prev.map((r) => ({
        ...r,
        selectedRate: null,
        hotelId: null,
        hotelName: null,
      })),
    );
    setActiveAccordions({});
  };

  // ─────────────────── credit / booking handlers ──────────────────────
  const isInsufficientBalance = (requiredAmount) => {
    if (agentBalance == null) return false;
    const required = Number(requiredAmount) || 0;
    const available = Number(agentBalance) || 0;
    return required > available;
  };

  // Resolve the effective supplier apiId for the current search. External
  // responses come back with `apiType` on the hotel — map it back to the
  // numeric id that /api/hotel-booking/create and the accurate-rate
  // endpoints expect. Falls back to whatever the search payload carried.
  const resolveApiId = (hotelObj) => {
    const payloadApiId = roomData?.payload?.apiId;
    const apiType =
      hotelObj?.apiType ||
      (typeof hotelObj?.hotelName === "string"
        ? hotelObj.hotelName.split("(").pop().replace(")", "")
        : "");
    return apiIdMapping[String(apiType || "").toUpperCase()] || payloadApiId;
  };

  // Map a single rate onto the shape ApiBookingPageForHotels expects
  // (selectedRate is an ARRAY of these — .map / .flatMap on the far side).
  // Field set matches the pre-refactor direct-navigation payload exactly;
  // hotelCode is intentionally omitted here (matches prior behaviour —
  // the booking page falls back to "" via `hotelCode || ""`).
  //
  // Additive: roomTypeCode / mealPlanCode / contractTokenId — IWTX/IOL-X
  // BookHotel needs these three per room. Other suppliers ignore them.
  const mapRateForPayload = (rate, hotelObj, roomNo) => {
    // ATHARVA prebook keys: prefer the FRESH values from the cached prebook
    // response (HCreateBooking requires them) and fall back to the search
    // response values so a rate that wasn't prebooked yet still round-trips.
    // Also carry the cancellation policy the modal fetched, so the booking
    // page can compute the deadline the same way it does for other suppliers.
    const prebook = rate?.rateKey ? atharvaPrebookCache[rate.rateKey] : null;
    const prebookRoom = prebook?.rooms?.find(
      (r) => (r.roomSrNo ?? null) === roomNo,
    );
    // GRN recheck-time flag: pan_required=true means the booking page must
    // render mandatory PAN input on the primary guest form. Read from the
    // cached recheck response (populated when the operator opened the
    // Cancellation Policies modal). Falls back to false when recheck wasn't
    // run yet or the rate isn't GRN.
    const grnRecheck = rate?.rateKey
      ? grnRecheckCache[grnRecheckKey(rate)]?.data
      : null;

    return {
      roomNo,
      roomCategory: rate?.roomCategory,
      mealPlan: rate?.mealPlan,
      contractLabel: rate?.contractLabel,
      nonRefundable: rate?.nonRefundable,
      rate: rate?.totalRate,
      rateWithoutMarkup: rate?.totalRateWithoutMarkup,
      roomRateBasedOnRoomCount: rate?.roomRateBasedOnRoomCount,
      roomRateBasedOnRoomCount_WithoutMarkup:
        rate?.roomRateBasedOnRoomCount_WithoutMarkup,
      roomStatus: rate?.roomStatus,
      currency: "AED",
      hotelId: hotelObj?.hotelId,
      hotelName: hotelObj?.hotelName,
      // Prefer prebook cancellation policies over search-time ones for ATHARVA
      // (search response has none). For other suppliers the search value wins.
      cancellationPolicy:
        (prebook?.cancellationPolicies?.length && prebook.cancellationPolicies) ||
        rate?.cancellationPolicies,
      // IWTX booking payload fields — forwarded from the search response
      // so IwtxHotelBookingService can build its JSON BookHotel body.
      roomTypeCode: rate?.roomTypeCode,
      mealPlanCode: rate?.mealPlanCode,
      contractTokenId: rate?.contractTokenId,
      // ATHARVA-only carriers. Ignored by every other supplier's booking
      // service. `rateKey` prefers the prebook-refreshed value.
      atharvaRateKey: prebookRoom?.rateKey || rate?.rateKey || null,
      atharvaHKey: prebook?.hKey || rate?.hKey || null,
      atharvaTokenId: prebook?.tokenId || rate?.tokenId || null,
      // Search-time keys preserved untouched. The booking page's late
      // prebook (multi-room path) always needs to send the ORIGINAL
      // search-response values — the "atharva*" fields above may have
      // been overwritten with fresh keys from a per-rate prebook when
      // the operator opened the Cancellation Policies modal, and mixing
      // fresh + search values across rooms is what triggers Atharva's
      // "1005: Invalid RateKey" error on multi-room prebook.
      atharvaSearchRateKey: rate?.rateKey || null,
      atharvaSearchHKey: rate?.hKey || null,
      atharvaSearchTokenId: rate?.tokenId || null,
      // Flag: true when the tokens above came from a prior /atharva/prebook
      // call (operator opened the Cancellation Policies modal here). Booking
      // page uses this to decide whether it must run prebook itself before
      // submitting HCreateBooking — the search tokens alone won't work.
      atharvaPrebooked: !!prebook,
      // Operator-facing deadline (already earliest cancellation date minus
      // 2 days, computed on the backend). Booking page renders this in the
      // cancellation accordion header. Null when prebook wasn't run yet.
      atharvaDisplayDeadlineDate: prebook?.displayDeadlineDate || null,
      // ATHARVA HPreBooking-response echoes forwarded to /api/hotel-booking/create
      // so the BE can send the vendor's EXACT ExpectedAmount / WithinTimeLimit
      // / PackageRate to HCreateBooking (avoids error 3002, correct RR/KK gate,
      // triggers AirlineName/AirlinePNR for package rates). All three are the
      // supplier's own numbers — do NOT apply markup here. Null when prebook
      // wasn't run yet; the BE falls back to legacy behaviour.
      atharvaExpectedAmount:
        prebook?.amountWithoutMarkup ?? prebook?.amount ?? null,
      atharvaWithinTimeLimit:
        prebook?.withinTimeLimit ?? null,
      atharvaPackageRate:
        prebook?.packageRate ?? null,
      // GRN-only carry: whether the rechecked rate requires PAN on the
      // holder. Booking page uses this to render the PAN input card.
      // Defaults to false; other suppliers just ignore this key.
      panRequired: grnRecheck?.panRequired === true,
      // GRN-only carry: property-collected "Payable at Hotel" charges
      // (from price_details.hotel_charges[] with included:false). Prefer
      // the RECHECKED figure when available — it's GRN's guaranteed
      // amount, sometimes updated between search and recheck. Falls back
      // to the search-response value so the booking page still shows the
      // charge on flows that skipped the modal. Null for every non-GRN
      // supplier; ApiBookingPageForHotels only renders the row when at
      // least one selected rate carries a value.
      payableAtHotelAmount:
        grnRecheck?.payableAtHotelAmount ?? rate?.payableAtHotelAmount ?? null,
      payableAtHotelCurrency:
        grnRecheck?.payableAtHotelCurrency ??
        rate?.payableAtHotelCurrency ??
        null,
      payableAtHotelDescription:
        grnRecheck?.payableAtHotelDescription ??
        rate?.payableAtHotelDescription ??
        null,
      // GRN-only carry: extras used by the booking-page Hotel Policies
      // & Terms modal to mirror what the room-list Cancellation Policies
      // modal shows. Both come from the availability response and stay
      // valid through recheck, so no grnRecheck preference is needed —
      // just forward as-is. Null on non-GRN suppliers.
      otherInclusions: Array.isArray(rate?.otherInclusions)
        ? rate.otherInclusions
        : null,
      rateComments:
        rate?.rateComments && typeof rate.rateComments === "object"
          ? rate.rateComments
          : null,
      // Darina (apiId 16) free-cancellation deadline (ISO yyyy-MM-dd). BE
      // emits it on rate.deadlineDate as the "Free cancellation until X"
      // band's toDate. Carried through so the booking page's accordion
      // header can show it and the outbound payload can echo it back.
      deadlineDate: rate?.deadlineDate || null,
      // GRN cancellation-policy summary (search-time; overlaid with the
      // rechecked values by applyGrnRecheckToMapped before checkout).
      // Null on every other supplier.
      refundCategory: grnRecheck?.refundCategory ?? rate?.refundCategory ?? null,
      refundStatus: grnRecheck?.refundStatus ?? rate?.refundStatus ?? null,
      cancelByDate: grnRecheck?.cancelByDate ?? rate?.cancelByDate ?? null,
      freeCancellationUntil:
        grnRecheck?.freeCancellationUntil ?? rate?.freeCancellationUntil ?? null,
      underCancellation:
        grnRecheck?.underCancellation ?? rate?.underCancellation ?? null,
      noShowFeeText: grnRecheck?.noShowFeeText ?? rate?.noShowFeeText ?? null,
      policyTimezone: grnRecheck?.policyTimezone ?? rate?.policyTimezone ?? null,
      policyText: grnRecheck?.policyText ?? rate?.policyText ?? null,
      // Search-time rate key, so the booking page can tell bundled (all
      // rooms share one key → one common policy) from non-bundled (each
      // room has its own key → its own policy).
      rateKey: rate?.rateKey || null,
    };
  };

  const handleRateSelect = (roomIndex, rate, hotelId, hotelName) => {
    // ATHARVA (apiId=3) multi-room constraint: every rateKey sent to
    // HPreBooking must belong to the same VendorList (same HKey). The
    // search response splits identical-looking rates across multiple
    // VendorList entries under distinct HKeys, so a flat rate list can
    // easily let the operator pick incompatible rates → Atharva returns
    // "1005: Invalid RateKey" on prebook. Reject cross-vendor picks up
    // front with a clear message so the operator reselects instead of
    // discovering the mismatch on the booking page.
    const currentApiId = String(roomData?.payload?.apiId || "");
    if (currentApiId === "3" && rate?.hKey) {
      const otherSelected = selectedRooms.find(
        (r, i) => i !== roomIndex && r?.selectedRate,
      );
      const otherHKey = otherSelected?.selectedRate?.hKey;
      if (otherHKey && otherHKey !== rate.hKey) {
        toast.error(
          "Atharva multi-room bookings require every room to be selected from the SAME rate group. Please clear the other room's selection first, or pick a rate from the same vendor group.",
        );
        return;
      }
    }

    // GRN (apiId=20) bundled multi-room: one rate_key covers ALL rooms.
    // A bundled rate returns rooms[] with one entry per physical room in
    // the search request; the backend then builds a single booking_items[]
    // with the requested pax split. Mirror the selection across every room
    // so what the operator picks in ANY accordion is what actually gets
    // booked (avoids the Room-1-only bug that produced Single-Standard-for
    // -both when the operator asked for Single+Double).
    //
    // NON-BUNDLED mode (bundleMode === "non-bundled"): the user picks a
    // different rate per room, all sharing the same group_code (enforced
    // by the picker filter above + the backend guard). Fall through to the
    // generic per-slot setter below — do NOT mirror.
    if (currentApiId === "20" && selectedRooms.length > 1 && bundleMode === "bundled") {
      setSelectedRooms((prev) => {
        const currentlySelectedInClicked =
          prev[roomIndex]?.selectedRate === rate;
        if (currentlySelectedInClicked) {
          // Toggle-off: clear the rate from every room in the bundle.
          return prev.map((r) => ({
            ...r,
            selectedRate: null,
            hotelId: null,
            hotelName: null,
          }));
        }
        // Select same rate for every room in the bundle.
        return prev.map((r) => ({
          ...r,
          selectedRate: rate,
          hotelId,
          hotelName,
        }));
      });
      return;
    }

    // GRN non-bundled AUTO-LINK: a rate with numberOfRooms > 1 (partial-
    // bundled) MUST be picked for exactly that many matching rooms — GRN
    // rejects the booking with error 5126 otherwise. Instead of blocking
    // the user with a mismatch modal at Continue Booking, we auto-fill
    // the clicked slot + the next (N-1) unpicked slots whose pax matches
    // the rate's occupancy. The rate card render adds "Linked to Room X"
    // badges so the auto-fill is visible. Toggle-off / re-pick clears the
    // whole linked group atomically. Scoped strictly to GRN + non-bundled
    // multi-room + numberOfRooms > 1 so every other flow falls through
    // to the generic per-slot setter below.
    const expectedRooms = Number(rate?.numberOfRooms) || 1;
    if (
      currentApiId === "20" &&
      bundleMode === "non-bundled" &&
      selectedRooms.length > 1 &&
      expectedRooms > 1
    ) {
      // Toggle-off: clicking the same rate in an already-linked slot
      // clears the whole group.
      const alreadyLinkedInClicked =
        selectedRooms[roomIndex]?.selectedRate?.rateKey === rate?.rateKey;
      if (alreadyLinkedInClicked) {
        setSelectedRooms((prev) =>
          prev.map((r) =>
            r?.selectedRate?.rateKey === rate?.rateKey
              ? { ...r, selectedRate: null, hotelId: null, hotelName: null }
              : r,
          ),
        );
        return;
      }

      // Re-pick in a slot that's currently part of a DIFFERENT linked
      // group: clear that whole group first, then fall through to the
      // fresh link below. Keeps groups atomic.
      const currentGroupKey = selectedRooms[roomIndex]?.selectedRate?.rateKey;
      const searchRooms = roomData?.payload?.rooms || [];
      const rateAdults = Number(rate?.paxAdults);
      const rateChildren = Number(rate?.paxChildren);
      const hasPaxOnRate = !Number.isNaN(rateAdults) && rate?.paxAdults != null;

      // Find (expectedRooms - 1) additional slots that:
      //   (a) aren't the clicked slot,
      //   (b) aren't part of some OTHER group (empty, or part of the
      //       group we're about to clear above), and
      //   (c) have matching pax (skip pax check if the rate doesn't
      //       expose paxAdults/paxChildren — filter chain already gates
      //       by occupancy so any visible rate is pax-safe for its slot).
      const linkTargets = [roomIndex];
      for (
        let i = 0;
        i < selectedRooms.length && linkTargets.length < expectedRooms;
        i++
      ) {
        if (i === roomIndex) continue;
        const otherKey = selectedRooms[i]?.selectedRate?.rateKey;
        const isFree =
          !otherKey || (currentGroupKey && otherKey === currentGroupKey);
        if (!isFree) continue;
        if (hasPaxOnRate) {
          const s = searchRooms[i];
          const roomAdults = Number(s?.adults) || 0;
          const roomChildren = Number(s?.children) || 0;
          if (roomAdults !== rateAdults || roomChildren !== rateChildren) {
            continue;
          }
        }
        linkTargets.push(i);
      }

      if (linkTargets.length < expectedRooms) {
        const label =
          rate?.roomTypeDescription || rate?.roomCategory || "This rate";
        toast.error(
          `"${label}" covers ${expectedRooms} rooms — only ${linkTargets.length} matching unpicked slot(s) available. Unpick another room first, or use "Book as one package".`,
        );
        return;
      }

      setSelectedRooms((prev) =>
        prev.map((r, i) => {
          // Clear any slot that was part of the group we're replacing.
          if (currentGroupKey && r?.selectedRate?.rateKey === currentGroupKey) {
            r = { ...r, selectedRate: null, hotelId: null, hotelName: null };
          }
          if (linkTargets.includes(i)) {
            return { ...r, selectedRate: rate, hotelId, hotelName };
          }
          return r;
        }),
      );
      return;
    }

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

  /**
   * Single-room "View Details / Select" handler. Mirrors Inhouse's
   * handleBooking but produces the ARRAY-shaped bookingData that
   * ApiBookingPageForHotels reads. Preserves the apiId 12/15 accurate-rate
   * re-fetch flow.
   */
  const handleBooking = (rate, skipCreditCheck = false) => {
    const { payload, hotels } = roomData;
    const hotel = hotels?.[0];
    if (!hotel) return;

    if (
      !skipCreditCheck &&
      isInsufficientBalance(rate.roomRateBasedOnRoomCount)
    ) {
      setPendingBookingFn(() => () => handleBooking(rate, true));
      setShowInsufficientCreditModal(true);
      return;
    }

    const currentApiId = resolveApiId(hotel);

    // ─── DARINA (apiId=16) live-rate re-check per v5.1 docs. ────────────
    // Cached search response → LIVE re-check (CheckAvailabilityWithCancellation
    // _NoCache_LiveCalculation) → SubmitBooking. Reuse the same
    // "Fetching accurate rate…" spinner + "Room Details" confirm modal
    // as IWTX/X3 (apiId 12/15) — Darina hands back a FRESH <RequestID>
    // that gets stamped onto contractTokenId so SubmitBooking sends it.
    if (currentApiId === apiIdMapping.DARINA) {
      setLoadingRate(true);
      (async () => {
        try {
          const live = await fetchDarinaPrebook(rate);
          if (!live?.success) {
            setLoadingRate(false);
            alert(
              live?.message ||
                "Darina live-rate check failed. Please retry or reselect the rate.",
            );
            return;
          }
          // Build the same shape the Room Details modal reads (rate,
          // roomCategory, mealPlan, nonRefundable, contractLabel) and the
          // booking page's payload builder needs (contractTokenId,
          // deadlineDate, cancellationPolicy, rateWithoutMarkup).
          const accurateRates = [
            {
              roomNo: 1,
              hotelId: hotel.hotelId,
              hotelName: hotel.hotelName,
              hotelCode: payload.hotelCode || hotel.hotelId,
              roomCategory: live.roomCategory || rate.roomCategory,
              mealPlan: live.mealPlan || rate.mealPlan,
              // Contract label — surfaces "Live rate" so the operator
              // knows the modal isn't showing search-time cached data.
              contractLabel: rate.contractLabel || "Live rate (Darina)",
              nonRefundable:
                live.nonRefundable != null
                  ? live.nonRefundable
                  : rate.nonRefundable,
              rate: live.rate ?? rate.totalRate,
              rateWithoutMarkup:
                live.rateWithoutMarkup ?? rate.totalRateWithoutMarkup,
              currency: live.currency || "AED",
              roomTypeCode: rate.roomTypeCode,
              mealPlanCode: rate.mealPlanCode,
              // FRESH Darina <RequestID> from live-calc — MUST replace
              // the search-time contractTokenId so SubmitBooking works.
              contractTokenId: live.contractTokenId || rate.contractTokenId,
              // Live cancellation ladder + free-cancellation cut-off.
              cancellationPolicy:
                (live.cancellationPolicies?.length &&
                  live.cancellationPolicies) ||
                rate.cancellationPolicies,
              deadlineDate: live.deadlineDate ?? rate.deadlineDate,
            },
          ];
          setSelectedRate(accurateRates);
          setLoadingRate(false);
          setShowBookingModal(true);
        } catch (err) {
          console.error("Darina live-rate fetch failed:", err);
          setLoadingRate(false);
          const backendMsg =
            err?.response?.data?.message ||
            err?.response?.data?.error ||
            err?.message;
          alert(
            backendMsg
              ? `Unable to fetch live rate: ${backendMsg}`
              : "Unable to fetch live rate. Please try again.",
          );
        }
      })();
      return;
    }

// ─── RATEHAWK (apiId=14) prebook per RateHawk API contract. ────────
// Fresh book_hash (p-…), live price + cancellation ladder before
// navigating to the booking page. Reuses the same "Fetching accurate
// rate…" spinner + "Room Details" confirm modal as IWTX/X3/Darina.
if (currentApiId === apiIdMapping.RATEHAWK) {
  setLoadingRate(true);

  (async () => {
    try {
      const live = await fetchRatehawkPrebook(rate);

      if (!live?.success) {
        setLoadingRate(false);
        alert(
          live?.message ||
            "RateHawk prebook failed. Please retry or reselect the rate.",
        );
        return;
      }

      const accurateRates = [
        {
          roomNo: 1,
          hotelId: hotel.hotelId,
          hotelName: hotel.hotelName,
          hotelCode: payload.hotelCode || hotel.hotelId,
          roomCategory: live.roomCategory || rate.roomCategory,
          mealPlan: live.mealPlan || rate.mealPlan,
          contractLabel: rate.contractLabel || "Live rate (RateHawk)",
          nonRefundable:
            live.nonRefundable != null
              ? live.nonRefundable
              : rate.nonRefundable,
          rate: live.rate ?? rate.totalRate,
          rateWithoutMarkup:
            live.rateWithoutMarkup ?? rate.totalRateWithoutMarkup,
          currency: live.currency || rate.currency,

          // Keep the ORIGINAL search-time h-… hash on roomTypeCode.
          // RateHawk prebook hashes (p-…) expire quickly and, more
          // importantly, RateHawk's /hotel/prebook/ endpoint only
          // accepts h-… hashes — RatehawkHotelBookingService.createBooking
          // ALWAYS runs its own prebook step 1 to obtain a fresh p-…
          // hash right before booking/form/, per RateHawk's Recommended
          // Flow. This FE prebook call is for display only (accurate
          // rate + cancellation policies for the modal); reusing its
          // p-… hash at booking time causes "hotel_not_found" once
          // it expires (typically well within the time the operator
          // takes to fill in guest details).
          roomTypeCode: rate.roomTypeCode,
          mealPlanCode: rate.mealPlanCode,

          // Live cancellation ladder + free-cancellation cut-off.
          cancellationPolicy:
            (live.cancellationPolicies?.length &&
              live.cancellationPolicies) ||
            rate.cancellationPolicies,
          deadlineDate: live.deadlineDate ?? rate.deadlineDate,
        },
      ];

      setSelectedRate(accurateRates);
      setLoadingRate(false);
      setShowBookingModal(true);
        } catch (err) {
          console.error("RateHawk live-rate fetch failed:", err);
          setLoadingRate(false);
          const backendMsg =
            err?.response?.data?.message ||
            err?.response?.data?.error ||
            err?.message;
          alert(
            backendMsg
              ? `Unable to fetch accurate rate: ${backendMsg}`
              : "Unable to fetch accurate rate. Please try again.",
          );
        }
      })();
      return;
    }

    if (currentApiId === apiIdMapping.GOGLOBAL) {
      // GoGlobal (apiId 21): run Booking Valuation before booking so the
      // operator sees the latest price / cancellation deadline / late remarks
      // (spec §7 — "Use valuation before making bookings"). Same "Fetching
      // latest rate…" spinner + "Room Details" confirm modal as IWTX/X3/
      // Darina/RateHawk. On Continue the confirm modal stores selectedRate
      // verbatim, so the HotelSearchCode must ride on each element here.
      setLoadingRate(true);
      (async () => {
        try {
          const live = await fetchGoGlobalValuation(rate);
          if (!live?.success) {
            setLoadingRate(false);
            alert(
              live?.message ||
                "GoGlobal valuation failed. Please retry or reselect the rate.",
            );
            return;
          }
          const valuatedTotal =
            live.totalRate != null ? live.totalRate : rate.totalRate;
          const valuatedNoMarkup =
            live.totalRateWithoutMarkup != null
              ? live.totalRateWithoutMarkup
              : rate.totalRateWithoutMarkup;
          const accurateRates = [
            {
              roomNo: 1,
              hotelId: hotel.hotelId,
              hotelName: hotel.hotelName,
              hotelCode: payload.hotelCode || hotel.hotelId,
              roomCategory: rate.roomCategory,
              mealPlan: rate.mealPlan,
              contractLabel: rate.contractLabel || "Valuated rate (GoGlobal)",
              // Confirm modal renders the refund badge on === "Y".
              nonRefundable: rate.nonRefundable ? "Y" : "N",
              rate: valuatedTotal,
              rateWithoutMarkup: valuatedNoMarkup,
              roomRateBasedOnRoomCount: valuatedTotal,
              roomRateBasedOnRoomCount_WithoutMarkup: valuatedNoMarkup,
              roomStatus: "Available",
              currency: "AED",
              // GoGlobal session handle for Booking Creation (OperationType 2).
              // MUST reach the create payload — carried as hotelSearchCode and
              // read by the booking-page room map's rateKey fallback.
              hotelSearchCode: rate.rateKey,
              rateKey: rate.rateKey,
              cancellationPolicy: rate.cancellationPolicies || [],
              deadlineDate:
                live.cancellationDeadline || rate.deadlineDate || null,
              // Valuation outcome — surfaced in the confirm modal.
              goglobalPriceChanged: !!live.priceChanged,
              goglobalRemarks: live.remarks || null,
              goglobalPreviousTotalRate:
                live.previousTotalRate ?? rate.totalRate,
            },
          ];
          setSelectedRate(accurateRates);
          setLoadingRate(false);
          setShowBookingModal(true);
        } catch (err) {
          console.error("GoGlobal valuation fetch failed:", err);
          setLoadingRate(false);
          const backendMsg =
            err?.response?.data?.message ||
            err?.response?.data?.error ||
            err?.message;
          alert(
            backendMsg
              ? `Unable to fetch latest rate: ${backendMsg}`
              : "Unable to fetch latest rate. Please try again.",
          );
        }
      })();
      return;
    }

    // ─── GRN (apiId=20) single-room rate recheck. ──────────────────────
    //    GRN returns search-time rates as rate_type="recheck" and refuses to
    //    book them (error 1513 "TW Issue") until the mandatory recheck has
    //    run for THIS search_id, which is what flips the rate to "bookable".
    //
    //    The multi-room "Continue with Booking" path already does this, and
    //    so does the "Cancellation Policies & Terms" link. The single-room
    //    "View Details / Select" click did not — it fell through to the
    //    direct-navigation branch at the end of this handler, so a
    //    single-room GRN booking reached the booking page carrying an
    //    un-rechecked rate and was rejected at create time.
    //
    //    Shape matches the DARINA / RATEHAWK / GOGLOBAL branches above:
    //    verify with the supplier, show the guaranteed values in the Room
    //    Details modal, and let that modal's Continue button do the
    //    checkout to /api-booking-page-hotels.
    if (currentApiId === apiIdMapping.GRN) {
      setLoadingRate(true);
      (async () => {
        try {
          const recheck = await fetchGrnRecheck(rate);
          if (!recheck?.success) {
            setLoadingRate(false);
            alert(
              recheck?.message ||
                "This rate is no longer available. Please reselect and try again.",
            );
            return;
          }

          // Overlay GRN's rechecked values (price, refund category, IST
          // deadline, windows, no-show, PAN, payable-at-hotel, rate_key)
          // onto the mapped rate so the modal and the downstream booking
          // payload both use the guaranteed numbers rather than the
          // search-time snapshot. Values are taken straight off this
          // response — fetchGrnRecheck's setState has not committed yet in
          // this tick, so a cache lookup would still see stale data.
          const mapped = applyGrnRecheckToMapped(
            mapRateForPayload(rate, hotel, 1),
            recheck,
          );

          setSelectedRate([mapped]);
          setLoadingRate(false);

          // Price / policy changed since search → the operator must accept
          // the NEW terms before the Room Details modal opens.
          const change = buildGrnChangeItem(
            [rate?.roomCategory, rate?.mealPlan].filter(Boolean).join(" • "),
            rate,
            recheck,
          );
          if (change) {
            setGrnChangeNotice({
              items: [change],
              onAccept: () => {
                setGrnChangeNotice(null);
                setShowBookingModal(true);
              },
            });
            return;
          }
          setShowBookingModal(true);
        } catch (err) {
          console.error("GRN recheck fetch failed:", err);
          setLoadingRate(false);
          const backendMsg =
            err?.response?.data?.message ||
            err?.response?.data?.error ||
            err?.message;
          alert(
            backendMsg
              ? `Unable to verify rate: ${backendMsg}`
              : "Unable to verify rate. Please try again.",
          );
        }
      })();
      return;
    }

    if (currentApiId === 12 || currentApiId === 15) {
      // Accurate-rate re-fetch for IWTX / X3 — same request the current
      // code builds, just for a single room in this branch.
      setLoadingRate(true);
      setTimeout(async () => {
        try {
          // Child ages from the original search — the reprice endpoint (X3
          // in particular) validates that Adult+Child count matches the
          // contractTokenId that was issued for the searched pax mix.
          // Missing `child` on the payload gets rejected with "The child
          // count doesn't correspond selected contract token id".
          const searchChildAges = payload.rooms?.[0]?.childAges || [];
          const childArr = searchChildAges
            .filter((n) => Number(n) > 0)
            .map((age) => ({ age: String(age) }));

          const roomsArray = [
            {
              adult: {
                age: (
                  payload.rooms?.[0]?.adultAges?.[0] ?? 30
                ).toString(),
              },
              ...(childArr.length ? { child: childArr } : {}),
              roomTypeCode: rate.roomTypeCode,
              mealPlanCode: rate.mealPlanCode,
              contractTokenId: rate.contractTokenId || "0",
              roomConfigurationId: 1,
            },
          ];

          const priceCheckReq = {
            searchCriteria: {
              roomConfiguration: { room: roomsArray },
              startDate: payload.checkInDate,
              endDate: payload.checkOutDate,
              hotelCode: payload.hotelCode,
              nationality: payload.nationality,
              includeRateDetails: "Y",
              cancellationPolicy: "Y",
              groupByRooms: "Y",
            },
            // Send the caller-agent's id so the IWTX reprice endpoint can
            // apply the same markup IwtxResponseMapper already applied on
            // the list. Without this the modal/booking page would show
            // the raw net rate, mismatching the room-list card.
            agentId:
              payload?.agentId != null ? String(payload.agentId) : undefined,
          };

          const endpoint =
            currentApiId === 12
              ? "/api/iwtx/hotel/availability"
              : "/api/x3/hotel/availability";

          const response = await axiosInstance.post(endpoint, priceCheckReq);
          const respHotel = response.data.hotels.hotel[0];
          const rooms = respHotel.roomTypeDetails.rooms.room;
          const accurateRates = rooms
            .filter((room) => room != null)
            .map((room, i) => ({
              roomNo: i + 1,
              roomConfigurationId: room.roomConfigurationId,
              hotelId: respHotel.hotelId,
              hotelName: respHotel.hotelName,
              hotelCode: respHotel.hotelCode,
              roomCategory: room.roomType,
              mealPlan: room.mealPlan,
              contractLabel: room.contractLabel,
              nonRefundable: room.nonRefundable,
              // IWTX Rate = total for stay (matches the room-list card).
              // rateDetails.rate is per-night, which was previously used
              // here and silently under-priced the booking. Both fields
              // are marked-up server-side.
              rate: room.rate,
              rateWithoutMarkup: room.rateWithoutMarkup,
              currency: room.currCode,
              // IWTX BookHotel requires RoomTypeCode / MealPlanCode /
              // ContractTokenId per room. Prefer the accurate response's
              // values; fall back to the originally-picked rate so the
              // booking never posts nulls (which IWTX rejects with
              // "ContractTokenID not found, RoomType not found, MealPlan
              // not found").
              roomTypeCode: room.roomTypeCode ?? rate.roomTypeCode,
              mealPlanCode: room.mealPlanCode ?? rate.mealPlanCode,
              contractTokenId: room.contractTokenId ?? rate.contractTokenId,
              // Carry the search-time cancellation policies through so
              // ApiBookingPageForHotels can compute the deadlineDate
              // (2 days before the earliest fromDate). Without this the
              // deadline column on the booking list stays blank.
              cancellationPolicy: rate.cancellationPolicies || [],
            }));

          setSelectedRate(accurateRates);
          setLoadingRate(false);
          setShowBookingModal(true);
        } catch (err) {
          console.error("Accurate rate fetch failed:", err);
          setLoadingRate(false);
          // Surface backend context when available so the operator has
          // something more actionable than "please try again" — e.g. a
          // supplier config error or an upstream 502.
          const backendMsg =
            err?.response?.data?.message ||
            err?.response?.data?.error ||
            err?.message;
          alert(
            backendMsg
              ? `Unable to fetch accurate rate: ${backendMsg}`
              : "Unable to fetch accurate rate. Please try again.",
          );
        }
      }, 3000);
    } else {
      // Direct navigation path — build the 1-element array shape and open
      // the API booking page.
      try {
        const bookingData = {
          selectedRate: [mapRateForPayload(rate, hotel, 1)],
          hotelStaticData: roomData.meta,
          payload: { ...payload, apiId: currentApiId },
          // See modal Continue handler for rationale.
          displayCurrency,
        };
        sessionStorage.setItem("bookingData", JSON.stringify(bookingData));
        window.open("/api-booking-page-hotels", "_blank");
      } catch (err) {
        console.error("Error preparing booking data:", err);
        alert("Unable to proceed with booking. Please try again.");
      }
    }
  };

  /**
   * Multi-room "Continue with Booking" handler. Combines the per-room
   * picks into the ARRAY-shaped bookingData ApiBookingPageForHotels reads.
   * Preserves the apiId 12/15 accurate-rate re-fetch flow (one request,
   * N rooms).
   */
  const handleProceedBooking = (skipCreditCheck = false) => {
    if (!allRoomsSelected || !roomData) return;
    const { payload, hotels } = roomData;
    const hotel = hotels?.[0];
    if (!hotel) {
      alert("Hotel context missing. Please refresh and try again.");
      return;
    }

    // NOTE: GRN partial-bundled pick-count guard used to live here as a
    // blocking modal. handleRateSelect now auto-links partial-bundled
    // rates across the exact number of slots they cover, so a mismatch
    // is unreachable through the UI. Backend still enforces the same
    // invariant as a safety net.

    const sum = (key) =>
      selectedRooms.reduce(
        (acc, r) => acc + (Number(r.selectedRate?.[key]) || 0),
        0,
      );

    if (!skipCreditCheck && isInsufficientBalance(sum("totalRate"))) {
      setPendingBookingFn(() => () => handleProceedBooking(true));
      setShowInsufficientCreditModal(true);
      return;
    }

    const currentApiId = resolveApiId(hotel);

    // ─── GRN "Continue with Booking" recheck. Mirrors what IWTX / X3 /
    //    DARINA do on this same click: fire the supplier-mandated
    //    availability/rate-verify call, then open the same "Room Details"
    //    modal with the fresh values so the operator can review before
    //    the actual booking. Previously this recheck happened on the
    //    booking-page Confirm (inside GrnHotelBookingService.createBooking);
    //    moved here per client requirement so a stale rate never survives
    //    into the booking-page render. Backend recheck call is removed too.
    //
    //    Recheck fanout — one call per UNIQUE rate_key:
    //     • Bundled multi-room → all slots share one rate_key → 1 call.
    //     • Partial-bundled + auto-linked → linked slots share the rate_key
    //       so still 1 call per group.
    //     • Fully-independent non-bundled → N calls (one per rate).
    //    fetchGrnRecheck caches by rate_key, so any rate whose Cancellation
    //    Policies modal was already opened is a cache hit here — zero
    //    duplicate calls.
    if (currentApiId === apiIdMapping.GRN) {
      setLoadingRate(true);
      (async () => {
        try {
          const uniqueRates = [];
          const seenKeys = new Set();
          selectedRooms.forEach((r) => {
            const rk = r?.selectedRate?.rateKey;
            if (!rk || seenKeys.has(rk)) return;
            seenKeys.add(rk);
            uniqueRates.push(r.selectedRate);
          });
          if (uniqueRates.length === 0) {
            setLoadingRate(false);
            alert("No rate selected. Please pick a rate and try again.");
            return;
          }

          const results = await Promise.all(
            uniqueRates.map((r) => fetchGrnRecheck(r)),
          );
          const failed = results.find((r) => !r?.success);
          if (failed) {
            setLoadingRate(false);
            alert(
              failed.message ||
                "This rate is no longer available. Please reselect and try again.",
            );
            return;
          }

          // Map to the same shape ApiBookingPageForHotels reads. Overwrite
          // rate / nonRefundable / cancellationPolicy with the rechecked
          // values so the modal + downstream booking use guaranteed data,
          // not the (potentially stale) search-time snapshot.
          const rechkByKey = new Map();
          uniqueRates.forEach((r, i) => rechkByKey.set(r.rateKey, results[i]));
          // Each slot gets ITS OWN rechecked policy — for non-bundled rates
          // every room's policy differs; for a bundled rate all slots share
          // one rate_key and therefore one (identical) policy.
          const accurateRates = selectedRooms.map((slot, i) =>
            applyGrnRecheckToMapped(
              mapRateForPayload(slot.selectedRate, hotel, i + 1),
              rechkByKey.get(slot.selectedRate?.rateKey),
            ),
          );
          setSelectedRate(accurateRates);
          setLoadingRate(false);

          // Price / policy changed since search on any rate → the operator
          // must accept the NEW terms before the Room Details modal opens.
          const changes = [];
          const bundled = uniqueRates.length === 1;
          uniqueRates.forEach((r) => {
            const roomsUsing = selectedRooms
              .map((s, i) => (s?.selectedRate?.rateKey === r.rateKey ? i + 1 : null))
              .filter(Boolean);
            const label = bundled
              ? `All rooms — ${[r?.roomCategory, r?.mealPlan].filter(Boolean).join(" • ")}`
              : `Room ${roomsUsing.join(", ")} — ${[r?.roomCategory, r?.mealPlan].filter(Boolean).join(" • ")}`;
            const change = buildGrnChangeItem(label, r, rechkByKey.get(r.rateKey));
            if (change) changes.push(change);
          });
          if (changes.length > 0) {
            setGrnChangeNotice({
              items: changes,
              onAccept: () => {
                setGrnChangeNotice(null);
                setShowBookingModal(true);
              },
            });
            return;
          }
          setShowBookingModal(true);
        } catch (err) {
          console.error("GRN recheck fetch failed:", err);
          setLoadingRate(false);
          const backendMsg =
            err?.response?.data?.message ||
            err?.response?.data?.error ||
            err?.message;
          alert(
            backendMsg
              ? `Unable to verify rate: ${backendMsg}`
              : "Unable to verify rate. Please try again.",
          );
        }
      })();
      return;
    }

    // ─── DARINA multi-room live-rate re-check. One prebook per selected
    //    rate (Darina's live-calc op takes a single hotel + room type +
    //    meal plan per call). Fire in parallel, stitch the responses
    //    into the same "Room Details" modal IWTX/X3 use.
    if (currentApiId === apiIdMapping.DARINA) {
      const rates = selectedRooms.map((r) => r.selectedRate);
      setLoadingRate(true);
      (async () => {
        try {
          const results = await Promise.all(rates.map((r) => fetchDarinaPrebook(r)));
          const firstFail = results.find((r) => !r?.success);
          if (firstFail) {
            setLoadingRate(false);
            alert(
              firstFail.message ||
                "One of the selected rates is no longer available. Please reselect.",
            );
            return;
          }
          const accurateRates = rates.map((r, i) => {
            const live = results[i] || {};
            return {
              roomNo: i + 1,
              hotelId: hotel.hotelId,
              hotelName: hotel.hotelName,
              hotelCode: payload.hotelCode || hotel.hotelId,
              roomCategory: live.roomCategory || r.roomCategory,
              mealPlan: live.mealPlan || r.mealPlan,
              contractLabel: r.contractLabel || "Live rate (Darina)",
              nonRefundable:
                live.nonRefundable != null
                  ? live.nonRefundable
                  : r.nonRefundable,
              rate: live.rate ?? r.totalRate,
              rateWithoutMarkup:
                live.rateWithoutMarkup ?? r.totalRateWithoutMarkup,
              currency: live.currency || "AED",
              roomTypeCode: r.roomTypeCode,
              mealPlanCode: r.mealPlanCode,
              contractTokenId: live.contractTokenId || r.contractTokenId,
              cancellationPolicy:
                (live.cancellationPolicies?.length &&
                  live.cancellationPolicies) ||
                r.cancellationPolicies,
              deadlineDate: live.deadlineDate ?? r.deadlineDate,
            };
          });
          setSelectedRate(accurateRates);
          setLoadingRate(false);
          setShowBookingModal(true);
        } catch (err) {
          console.error("Darina multi-room live-rate fetch failed:", err);
          setLoadingRate(false);
          const backendMsg =
            err?.response?.data?.message ||
            err?.response?.data?.error ||
            err?.message;
          alert(
            backendMsg
              ? `Unable to fetch live rate: ${backendMsg}`
              : "Unable to fetch live rate. Please try again.",
          );
        }
      })();
      return;
    }

    // ─── RATEHAWK multi-room prebook. One prebook per selected rate
    //    (RateHawk's /hotel/prebook/ takes a single book_hash per call).
    //    Fire in parallel, stitch the responses into the same "Room
    //    Details" modal IWTX/X3/Darina use.
    if (currentApiId === apiIdMapping.RATEHAWK) {
      const rates = selectedRooms.map((r) => r.selectedRate);
      setLoadingRate(true);
      (async () => {
        try {
          const results = await Promise.all(rates.map((r) => fetchRatehawkPrebook(r)));
          const firstFail = results.find((r) => !r?.success);
          if (firstFail) {
            setLoadingRate(false);
            alert(
              firstFail.message ||
                "One of the selected rates is no longer available. Please reselect.",
            );
            return;
          }
          const accurateRates = rates.map((r, i) => {
            const live = results[i] || {};
            return {
              roomNo: i + 1,
              hotelId: hotel.hotelId,
              hotelName: hotel.hotelName,
              hotelCode: payload.hotelCode || hotel.hotelId,
              roomCategory: live.roomCategory || r.roomCategory,
              mealPlan: live.mealPlan || r.mealPlan,
              contractLabel: r.contractLabel || "Live rate (RateHawk)",
              nonRefundable:
                live.nonRefundable != null
                  ? live.nonRefundable
                  : r.nonRefundable,
              rate: live.rate ?? r.totalRate,
              rateWithoutMarkup:
                live.rateWithoutMarkup ?? r.totalRateWithoutMarkup,
              currency: live.currency || r.currency,
              // ORIGINAL search-time h-… hash — see single-room branch
              // above for rationale (BE re-prebooks at booking time).
              roomTypeCode: r.roomTypeCode,
              mealPlanCode: r.mealPlanCode,
              cancellationPolicy:
                (live.cancellationPolicies?.length &&
                  live.cancellationPolicies) ||
                r.cancellationPolicies,
              deadlineDate: live.deadlineDate ?? r.deadlineDate,
            };
          });
          setSelectedRate(accurateRates);
          setLoadingRate(false);
          setShowBookingModal(true);
        } catch (err) {
          console.error("RateHawk multi-room live-rate fetch failed:", err);
          setLoadingRate(false);
          const backendMsg =
            err?.response?.data?.message ||
            err?.response?.data?.error ||
            err?.message;
          alert(
            backendMsg
              ? `Unable to fetch accurate rate: ${backendMsg}`
              : "Unable to fetch accurate rate. Please try again.",
          );
        }
      })();
      return;
    }

    if (currentApiId === apiIdMapping.GOGLOBAL) {
      // GoGlobal multi-room per spec §7/§8: each picked offer's
      // HotelSearchCode books exactly one physical room (because our
      // per-room search fanned out to K single-room HOTEL_SEARCH_REQUEST
      // calls — see the goglobalPerRoomMode search opt-in above). §7
      // valuation accepts one HotelSearchCode at a time, so we fire K
      // valuations in parallel — one per picked rate — and show the real
      // per-room live totals in the confirm modal. §8 booking then sends
      // K BOOKING_INSERT_REQUEST calls under one BasketNumber (backend
      // dispatcher fans them out).
      if (selectedRooms.some((sr) => !sr?.selectedRate)) {
        alert("Please select a rate for each room before continuing.");
        return;
      }
      setLoadingRate(true);
      (async () => {
        try {
          const lives = await Promise.all(
            selectedRooms.map((sr) => fetchGoGlobalValuation(sr.selectedRate)),
          );
          const failed = lives.findIndex((l) => !l?.success);
          if (failed !== -1) {
            setLoadingRate(false);
            alert(
              `Room ${failed + 1} valuation failed: ${lives[failed]?.message ||
                "GoGlobal valuation failed. Please retry or reselect the rate."}`,
            );
            return;
          }
          const accurateRates = selectedRooms.map((sr, i) => {
            const r = sr.selectedRate || {};
            const live = lives[i] || {};
            const stayTotal =
              live.totalRate != null
                ? Number(live.totalRate)
                : Number(r.totalRate || 0);
            const stayTotalNoMarkup =
              live.totalRateWithoutMarkup != null
                ? Number(live.totalRateWithoutMarkup)
                : Number(r.totalRateWithoutMarkup ?? r.totalRate ?? 0);
            return {
              roomNo: i + 1,
              hotelId: hotel.hotelId,
              hotelName: hotel.hotelName,
              hotelCode: payload.hotelCode || hotel.hotelId,
              roomCategory: r.roomCategory,
              mealPlan: r.mealPlan,
              contractLabel: r.contractLabel || "Valuated rate (GoGlobal)",
              nonRefundable: r.nonRefundable ? "Y" : "N",
              rate: stayTotal,
              rateWithoutMarkup: stayTotalNoMarkup,
              roomRateBasedOnRoomCount: stayTotal,
              roomRateBasedOnRoomCount_WithoutMarkup: stayTotalNoMarkup,
              roomStatus: "Available",
              currency: "AED",
              // Each slot carries its OWN HotelSearchCode — the K bookings
              // in Phase 3 pick this up per slot. Same field name as the
              // bundle path so ApiBookingPageForHotels stays supplier-agnostic.
              hotelSearchCode: r.rateKey,
              rateKey: r.rateKey,
              roomSlotIndex: r.roomSlotIndex,
              cancellationPolicy: r.cancellationPolicies || [],
              deadlineDate: live.cancellationDeadline || r.deadlineDate || null,
              goglobalPriceChanged: !!live.priceChanged,
              goglobalRemarks: live.remarks || null,
            };
          });
          setSelectedRate(accurateRates);
          setLoadingRate(false);
          setShowBookingModal(true);
        } catch (err) {
          console.error("GoGlobal multi-room valuation fetch failed:", err);
          setLoadingRate(false);
          const backendMsg =
            err?.response?.data?.message ||
            err?.response?.data?.error ||
            err?.message;
          alert(
            backendMsg
              ? `Unable to fetch latest rate: ${backendMsg}`
              : "Unable to fetch latest rate. Please try again.",
          );
        }
      })();
      return;
    }

    if (currentApiId === 12 || currentApiId === 15) {
      setLoadingRate(true);
      setTimeout(async () => {
        try {
          // Same reason as the single-room branch above: without `child`
          // the X3 reprice rejects with "The child count doesn't
          // correspond selected contract token id" whenever the searched
          // pax mix included children.
          const buildRoomBlock = (r, i) => {
            const searchChildAges =
              payload.rooms?.[i]?.childAges ||
              payload.rooms?.[0]?.childAges ||
              [];
            const childArr = searchChildAges
              .filter((n) => Number(n) > 0)
              .map((age) => ({ age: String(age) }));
            return {
              adult: {
                age: (
                  payload.rooms?.[i]?.adultAges?.[0] ??
                  payload.rooms?.[0]?.adultAges?.[0] ??
                  30
                ).toString(),
              },
              ...(childArr.length ? { child: childArr } : {}),
              roomTypeCode: r.selectedRate?.roomTypeCode,
              mealPlanCode: r.selectedRate?.mealPlanCode,
              contractTokenId: r.selectedRate?.contractTokenId || "0",
            };
          };

          const baseSearchCriteria = {
            startDate: payload.checkInDate,
            endDate: payload.checkOutDate,
            hotelCode: payload.hotelCode,
            nationality: payload.nationality,
            includeRateDetails: "Y",
            cancellationPolicy: "Y",
            groupByRooms: "Y",
          };
          const agentIdArg =
            payload?.agentId != null ? String(payload.agentId) : undefined;

          // X3 (apiId 15) on runtime inventory — per IOL-X docs, Hotel
          // Availability "validates the rate and availability for a
          // specific rate" (singular). The vendor rejects any request
          // with more than one <Room> in <RoomConfiguration> with
          // "Not supported RoomConfigurationId". So for X3 multi-room
          // we fire ONE reprice per selected room in parallel and stitch
          // the responses back in the original order. IWTX (apiId 12)
          // and every single-room path keep the original one-shot call
          // (the IWTX vendor accepts multi-room reprice).
          let accurateRates;
          if (currentApiId === 15 && selectedRooms.length > 1) {
            const perRoomRequests = selectedRooms.map((r, i) => ({
              searchCriteria: {
                roomConfiguration: {
                  room: [{ ...buildRoomBlock(r, i), roomConfigurationId: 1 }],
                },
                ...baseSearchCriteria,
              },
              agentId: agentIdArg,
            }));

            const responses = await Promise.all(
              perRoomRequests.map((req) =>
                axiosInstance.post("/api/x3/hotel/availability", req),
              ),
            );

            // Surface the vendor's own error text on the first failing
            // room — the shared catch below only reads err.message /
            // response.data.message, but IOL-X puts the reason at
            // errorMessage.msg, so throw a synthetic error so the catch
            // shows something actionable.
            responses.forEach((resp, i) => {
              const vendorErr = resp.data?.errorMessage?.msg;
              if (vendorErr) {
                const e = new Error(`Room ${i + 1}: ${vendorErr}`);
                e.response = { data: { message: `Room ${i + 1}: ${vendorErr}` } };
                throw e;
              }
            });

            accurateRates = responses.map((resp, i) => {
              const respHotel = resp.data.hotels.hotel[0];
              const room = respHotel.roomTypeDetails.rooms.room.find(
                (rr) => rr != null,
              );
              return {
                roomNo: i + 1,
                // Each per-room reprice is a self-contained call, so the
                // vendor always echoes roomConfigurationId=1. Stamp the
                // FE-side room slot number (i + 1) instead so downstream
                // booking-payload construction still keys rooms correctly.
                roomConfigurationId: i + 1,
                hotelId: respHotel.hotelId,
                hotelName: respHotel.hotelName,
                hotelCode: respHotel.hotelCode,
                roomCategory: room.roomType,
                mealPlan: room.mealPlan,
                contractLabel: room.contractLabel,
                nonRefundable: room.nonRefundable,
                rate: room.rate,
                rateWithoutMarkup: room.rateWithoutMarkup,
                currency: room.currCode,
                roomTypeCode:
                  room.roomTypeCode ??
                  selectedRooms[i]?.selectedRate?.roomTypeCode,
                mealPlanCode:
                  room.mealPlanCode ??
                  selectedRooms[i]?.selectedRate?.mealPlanCode,
                contractTokenId:
                  room.contractTokenId ??
                  selectedRooms[i]?.selectedRate?.contractTokenId,
                cancellationPolicy:
                  selectedRooms[i]?.selectedRate?.cancellationPolicies || [],
              };
            });
          } else {
            const roomsArray = selectedRooms.map((r, i) => ({
              ...buildRoomBlock(r, i),
              roomConfigurationId: i + 1,
            }));

            const priceCheckReq = {
              searchCriteria: {
                roomConfiguration: { room: roomsArray },
                ...baseSearchCriteria,
              },
              // Send the caller-agent's id so the IWTX reprice endpoint can
              // apply the same markup IwtxResponseMapper already applied on
              // the list. Without this the modal/booking page would show
              // the raw net rate, mismatching the room-list card.
              agentId: agentIdArg,
            };

            const endpoint =
              currentApiId === 12
                ? "/api/iwtx/hotel/availability"
                : "/api/x3/hotel/availability";

            const response = await axiosInstance.post(endpoint, priceCheckReq);
            const respHotel = response.data.hotels.hotel[0];
            const rooms = respHotel.roomTypeDetails.rooms.room;
            accurateRates = rooms
              .filter((room) => room != null)
              .map((room, i) => ({
                roomNo: i + 1,
                roomConfigurationId: room.roomConfigurationId,
                hotelId: respHotel.hotelId,
                hotelName: respHotel.hotelName,
                hotelCode: respHotel.hotelCode,
                roomCategory: room.roomType,
                mealPlan: room.mealPlan,
                contractLabel: room.contractLabel,
                nonRefundable: room.nonRefundable,
                // IWTX Rate = total for stay (matches the room-list card).
                // rateDetails.rate is per-night, which was previously used
                // here and silently under-priced the booking. Both fields
                // are marked-up server-side.
                rate: room.rate,
                rateWithoutMarkup: room.rateWithoutMarkup,
                currency: room.currCode,
                // IWTX BookHotel requires these three per room. Prefer the
                // accurate response; fall back to the operator's originally
                // selected rate in each slot so we never post nulls.
                roomTypeCode:
                  room.roomTypeCode ??
                  selectedRooms[i]?.selectedRate?.roomTypeCode,
                mealPlanCode:
                  room.mealPlanCode ??
                  selectedRooms[i]?.selectedRate?.mealPlanCode,
                contractTokenId:
                  room.contractTokenId ??
                  selectedRooms[i]?.selectedRate?.contractTokenId,
                // Cancellation policies from search — needed so the
                // booking page can compute deadlineDate. Same reason as
                // single-room path.
                cancellationPolicy:
                  selectedRooms[i]?.selectedRate?.cancellationPolicies || [],
              }));
          }

          setSelectedRate(accurateRates);
          setLoadingRate(false);
          setShowBookingModal(true);
        } catch (err) {
          console.error("Accurate rate fetch failed:", err);
          setLoadingRate(false);
          // Surface backend context when available so the operator has
          // something more actionable than "please try again" — e.g. a
          // supplier config error or an upstream 502.
          const backendMsg =
            err?.response?.data?.message ||
            err?.response?.data?.error ||
            err?.message;
          alert(
            backendMsg
              ? `Unable to fetch accurate rate: ${backendMsg}`
              : "Unable to fetch accurate rate. Please try again.",
          );
        }
      }, 3000);
    } else {
      try {
        const bookingData = {
          selectedRate: selectedRooms.map((r, i) =>
            mapRateForPayload(r.selectedRate, hotel, i + 1),
          ),
          hotelStaticData: roomData.meta,
          payload: { ...payload, apiId: currentApiId },
          // See modal Continue handler for rationale.
          displayCurrency,
        };
        sessionStorage.setItem("bookingData", JSON.stringify(bookingData));
        window.open("/api-booking-page-hotels", "_blank");
      } catch (err) {
        console.error("Error preparing multi-room bookingData:", err);
        alert("Unable to proceed with booking. Please try again.");
      }
    }
  };

  // ─────────────────── loading / error / empty ────────────────────────
  if (loading) {
    return (
      <div className="min-vh-100 bg-light d-flex flex-column">
        <TopBar />
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
        <TopBar />
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
        <TopBar />
        <div className="d-flex flex-grow-1">
          <Sidebar />
          <main className="flex-grow-1 d-flex justify-content-center align-items-center p-3">
            <Alert
              variant="info"
              className="text-center"
              style={{ maxWidth: 480 }}
            >
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

  const hotel = roomData.hotels[0];
  const payload = roomData.payload || {};

  // GRN: the room-list response carries the hotel's own description from
  // GRN's /availability/{sid}?hcode= refetch (hotelDescription, HTML). The
  // header shows it instead of the generic "Please note" text. Other
  // suppliers (and GRN hotels with no description) keep the static text.
  const isGrnHotel =
    String(hotel?.apiType || "").toUpperCase() === "GRN" ||
    Number(payload?.apiId) === apiIdMapping.GRN;
  const grnHotelDescription = (() => {
    if (!isGrnHotel) return null;
    const raw = typeof hotel?.hotelDescription === "string"
      ? hotel.hotelDescription.trim()
      : "";
    if (!raw) return null;
    // Supplier HTML — drop script blocks and inline event handlers before
    // rendering; GRN's descriptions are plain <p>/<b>/<br /> markup.
    const safe = raw
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    // Show only the "Property Location" section. GRN's full description
    // (Attractions, Amenities, Business Amenities, Rooms, Dining …) runs to
    // dozens of lines and pushed the room list below the fold. The section
    // ends at its closing </p> or at the next paragraph/heading tag.
    const location = safe.match(
      /<b>\s*Property Location\s*<\/b>[\s\S]*?(?=<\/p>|<p\b|<b>|$)/i,
    );
    if (location) return `<p>${location[0]}</p>`;
    // No headed sections — fall back to the first paragraph, else as-is.
    const firstParagraph = safe.match(/<p\b[^>]*>[\s\S]*?<\/p>/i);
    return firstParagraph ? firstParagraph[0] : safe;
  })();

  return (
    <div className="min-vh-100 bg-light d-flex flex-column room-list-container">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main
          className="content-wrapper flex-grow-1"
          style={{ minWidth: 0, overflowX: "hidden" }}
        >
          <div className="container-fluid" style={{ paddingTop: "10px" }}>
            {/* Results-page heading — mirrors Inhouse. */}
            <div className="hs-page-heading">
              <h3 className="hs-page-heading-title">Accommodation</h3>
            </div>

            {/* Top toolbar: Back to Search + agent balance */}
            <div className="d-flex justify-content-between align-items-center mb-3 gap-2 flex-wrap">
              <Button
                variant="outline-primary"
                size="sm"
                onClick={() => {
                  // HotelSearch's "View Rooms" opens this page via
                  // window.open in a new tab, so navigate(-1) is a
                  // no-op here. Close the new tab (opener refocuses)
                  // and fall back to in-app navigation only when
                  // window.close is unavailable.
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

            {/* Loader modal for accurate-rate re-fetch (apiId 12/15). */}
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

            {/* Insufficient-credit soft gate — same UX as Inhouse. */}
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
                <p className="mb-0 text-muted small">
                  You can still continue — please choose{" "}
                  <strong>online payment</strong> on the booking page to
                  complete this reservation.
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

            {/* No-availability modal. */}
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

            {/* Hotel header — visually identical to Inhouse. */}
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
                          {hotel.propertyType && (
                            <Badge bg="primary">{hotel.propertyType}</Badge>
                          )}
                          {hotel.chain && (
                            <Badge bg="info">{hotel.chain}</Badge>
                          )}
                        </div>
                        <div className="hotel-details">
                          <p className="mb-1">
                            <FaMapMarkerAlt className="text-muted me-2" />
                            {hotel.hotelAddress}
                          </p>
                          {hotel.hotelPhoneNumber && (
                            <p className="mb-0">
                              <FaPhone className="text-muted me-2" />
                              {hotel.hotelPhoneNumber}
                            </p>
                          )}
                          <div className="mt-2">
                            {grnHotelDescription ? (
                              /* GRN: hotel description exactly as returned by
                                 GRN's availability refetch, in place of the
                                 generic note. */
                              <small className="text-muted">
                                <div
                                  className="someproperties grn-hotel-description"
                                  dangerouslySetInnerHTML={{
                                    __html: grnHotelDescription,
                                  }}
                                />
                              </small>
                            ) : (
                              <small className="text-muted">
                                <strong>Please note:</strong>{" "}
                                <p className="someproperties">
                                  Some properties may collect additional charges
                                  such as city tax, resort fees, or security
                                  deposits during check-in. Policies such as
                                  check-in time, child accommodation, and
                                  cancellation rules can vary by room and
                                  provider.
                                </p>
                              </small>
                            )}
                          </div>
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
                              breakdown above, so the two views never disagree. */}
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
                                    {(() => {
                                      // Build from payload.rooms[0] — `hotel.guestBreakdown`
                                      // is only populated by the DayStay flow and is
                                      // undefined here, so previously the span was blank.
                                      const r = payload.rooms?.[0];
                                      const a = r?.adults || 0;
                                      const c = r?.children || 0;
                                      const parts = [];
                                      if (a) parts.push(`${a} adult${a > 1 ? "s" : ""}`);
                                      if (c) parts.push(`${c} child${c > 1 ? "ren" : ""}`);
                                      return parts.join(", ") || hotel.guestBreakdown || "—";
                                    })()}
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
                                    if (a)
                                      parts.push(
                                        `${a} adult${a > 1 ? "s" : ""}`,
                                      );
                                    if (c)
                                      parts.push(
                                        `${c} child${c > 1 ? "ren" : ""}`,
                                      );
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

            {/* Room categories area — grid/list toggle + filter sidebar +
                per-room accordion (only in multi-room mode). */}
            <div className="room-categories-section">
              {/* GRN multi-room mode toggle. Bundled = default certified
                  flow; Non-bundled = per-room picker (all picks must share
                  the same group_code, enforced below). Hidden completely
                  for single-room or non-GRN searches. */}
              {isGrnMultiRoomFlow && (
                <div className="mb-3 p-3 rounded shadow-sm bg-white border">
                  <div className="d-flex flex-wrap align-items-center gap-3">
                    <div>
                      <div className="fw-semibold">Booking mode</div>
                      <small className="text-muted">
                        {bundleMode === "bundled"
                          ? "One package rate covers all rooms."
                          : "Pick a different rate for each room (must share the same rate group)."}
                      </small>
                    </div>
                    <div className="btn-group ms-auto" role="group" aria-label="Booking mode">
                      <Button
                        variant={
                          bundleMode === "bundled" ? "primary" : "outline-primary"
                        }
                        size="sm"
                        onClick={() => switchBundleMode("bundled")}
                      >
                        Book as one package
                      </Button>
                      <Button
                        variant={
                          bundleMode === "non-bundled" ? "primary" : "outline-primary"
                        }
                        size="sm"
                        onClick={() => switchBundleMode("non-bundled")}
                        disabled={!hasNonBundledRates}
                        title={
                          hasNonBundledRates
                            ? "Pick a different rate for each room"
                            : "This hotel doesn't have per-room rates for your search"
                        }
                      >
                        Pick per room
                      </Button>
                    </div>
                  </div>
                  {isNonBundledMode && !hasNonBundledRates && (
                    <Alert variant="warning" className="mt-3 mb-0">
                      This hotel doesn't offer non-bundled (per-room) rates
                      for your dates and occupancy. Switch back to
                      <b> Book as one package</b> to see available rates.
                    </Alert>
                  )}
                </div>
              )}

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
                      variant={
                        viewMode === "grid" ? "primary" : "outline-primary"
                      }
                      onClick={() => setViewMode("grid")}
                      className="d-flex align-items-center gap-2"
                      size="sm"
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
                  {(isMultiRoom ? selectedRooms : [null]).map(
                    (_slot, roomSlotIndex) => {
                      const slotActiveKey =
                        activeAccordions[roomSlotIndex] ?? null;
                      const setSlotActiveKey = (key) =>
                        setActiveAccordions((prev) => ({
                          ...prev,
                          [roomSlotIndex]: key,
                        }));

                      // Sort room categories ascending by their cheapest
                      // rate, and — inside each category — sort the
                      // individual rate cards the same way, so the
                      // operator always sees the most affordable option
                      // first. Same helper as the inhouse /room-list.
                      const priceOf = (r) => {
                        const v = Number(r?.rate);
                        return Number.isFinite(v)
                          ? v
                          : Number.POSITIVE_INFINITY;
                      };
                      const sortedRoomCategories = [
                        ...(hotel.roomCategories || []),
                      ]
                        .map((cat) => ({
                          ...cat,
                          availableRates: [
                            ...(cat.availableRates || []),
                          ].sort((a, b) => priceOf(a) - priceOf(b)),
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
                            const filteredRates = (
                              category.availableRates || []
                            )
                              .filter(rateMatches)
                              // GRN multi-room bundle-mode filter. When the
                              // user toggles "Book as one package" show only
                              // bundled rates (or rates that have no
                              // bundleType tag — those come from the certified
                              // bundled-only fetch and are always bundled).
                              // When they toggle "Pick per room" show only
                              // non-bundled + partial-bundled. No-op for
                              // non-GRN suppliers and single-room searches.
                              .filter((rate) => {
                                if (!isGrnMultiRoomFlow) return true;
                                const bt = rate?.bundleType;
                                if (bundleMode === "bundled") {
                                  return bt == null || bt === "bundled";
                                }
                                return bt === "non-bundled" || bt === "partial-bundled";
                              })
                              // GRN non-bundled group_code guard. Once ANY
                              // slot has picked a rate, every OTHER slot may
                              // only show rates whose tokenId (group_code)
                              // matches — GRN rejects the booking if the
                              // picked rates come from different groups. The
                              // backend has the same guard as a safety net;
                              // this UI check exists so the user sees why an
                              // incompatible rate isn't clickable, before
                              // they invest attention in picking it.
                              .filter((rate) => {
                                if (!isNonBundledMode) return true;
                                const anchor = selectedRooms.find(
                                  (r, i) => i !== roomSlotIndex && r?.selectedRate,
                                );
                                const anchorGroup = anchor?.selectedRate?.tokenId;
                                if (!anchorGroup) return true;
                                return rate?.tokenId === anchorGroup;
                              })
                              // GRN non-bundled per-room occupancy filter.
                              // Non-bundled rates are occupancy-specific — a
                              // 2A/0C rate cannot accept a child pax, and
                              // GRN 500s with a generic "Something went wrong"
                              // instead of a proper validation error. Show
                              // each rate ONLY in the room card whose
                              // adults+children match the rate's
                              // paxAdults+paxChildren. When the rate object
                              // doesn't carry those fields (bundled rates,
                              // other suppliers) the filter passes through.
                              .filter((rate) => {
                                if (!isNonBundledMode) return true;
                                if (rate?.paxAdults == null) return true;
                                const searchRoom = roomData?.payload?.rooms?.[roomSlotIndex];
                                if (!searchRoom) return true;
                                const roomAdults = Number(searchRoom.adults) || 0;
                                const roomChildren = Number(searchRoom.children) || 0;
                                const rateAdults = Number(rate.paxAdults) || 0;
                                const rateChildren = Number(rate.paxChildren) || 0;
                                return rateAdults === roomAdults && rateChildren === roomChildren;
                              })
                              // ATHARVA (apiId=3) multi-room disambiguation:
                              // the search response mixes rates for every
                              // RoomSrNo into one vendor list, so each slot
                              // must show only its own RoomSrNo rates,
                              // otherwise the operator picks incompatible
                              // rates and Atharva returns 1005: Invalid
                              // RateKey on prebook.
                              .filter((rate) => {
                                if (
                                  String(roomData?.payload?.apiId || "") !== "3" ||
                                  !isMultiRoom ||
                                  rate?.roomSrNo == null
                                ) {
                                  return true;
                                }
                                return rate.roomSrNo === roomSlotIndex + 1;
                              })
                              // GoGlobal (apiId=21) per-slot filter — REMOVED
                              // per operator request. Rates from every slot's
                              // fanout search now appear under every accordion,
                              // matching the pre-fanout bundle display. NB per
                              // spec §8, an offer's HotelSearchCode only books
                              // the pax the search was made with, so picking a
                              // rate under a slot whose pax doesn't match the
                              // rate's source-slot pax will fail at booking
                              // with a pax-mismatch — the operator picks at
                              // their own risk in this display mode.
                              // For Atharva multi-room with FixedOption=true,
                              // once an EARLIER slot has picked a rate, this
                              // slot must be restricted to rates whose
                              // atharvaIndex forms a valid pair with the
                              // earlier picks per the vendor's Options[]
                              // combinations. Options entries look like
                              // "1,28" — one index per room slot in order.
                              // atharvaFixedOption / atharvaOptions are
                              // per-VENDOR (Atharva returns multiple vendors
                              // per hotel, each with its own FixedOption +
                              // Options[]), so they're carried on the RATE
                              // itself — reading them off `hotel.*` would
                              // cross-apply one vendor's Options[] to
                              // another vendor's rate.
                              .filter((rate) => {
                                if (
                                  String(roomData?.payload?.apiId || "") !== "3" ||
                                  !isMultiRoom ||
                                  rate?.atharvaFixedOption !== true ||
                                  !Array.isArray(rate?.atharvaOptions) ||
                                  rate.atharvaOptions.length === 0 ||
                                  rate?.atharvaIndex == null
                                ) {
                                  return true;
                                }
                                // Collect indices + vendor hKeys from any
                                // earlier slot with a selection; positions
                                // without a selection become wildcards.
                                const requiredIndices = selectedRooms.map(
                                  (r) => r?.selectedRate?.atharvaIndex ?? null,
                                );
                                const earlierPickHKey = selectedRooms
                                  .slice(0, roomSlotIndex)
                                  .map((r) => r?.selectedRate?.hKey)
                                  .find((k) => k);
                                const hasEarlierPick = requiredIndices
                                  .slice(0, roomSlotIndex)
                                  .some((v) => v != null);
                                if (!hasEarlierPick) return true;
                                // Cross-vendor guard — Options[] indices
                                // are only meaningful within the picked
                                // vendor. A candidate from a different
                                // vendor could false-match by index
                                // coincidence and then trip 1005: Invalid
                                // RateKey at prebook (handleRateSelect
                                // blocks the click too, but hiding the
                                // rate up front is the cleaner UX).
                                if (
                                  earlierPickHKey &&
                                  rate.hKey &&
                                  rate.hKey !== earlierPickHKey
                                ) {
                                  return false;
                                }
                                return rate.atharvaOptions.some((opt) => {
                                  const parts = String(opt)
                                    .split(",")
                                    .map((p) => Number(p.trim()));
                                  if (parts.length <= roomSlotIndex) return false;
                                  if (parts[roomSlotIndex] !== rate.atharvaIndex)
                                    return false;
                                  return requiredIndices.every((idx, i) => {
                                    if (i === roomSlotIndex) return true;
                                    if (idx == null) return true;
                                    return parts[i] === idx;
                                  });
                                });
                              });
                            if (filteredRates.length === 0) return null;
                            if (!matchesRoomSearch(category.roomCategory))
                              return null;

                            return (
                              <Accordion.Item
                                key={eventKey}
                                eventKey={eventKey}
                                className="room-category-item"
                              >
                                <Accordion.Header
                                  as="div"
                                  className="room-category-header"
                                >
                                  <div className="d-flex justify-content-between align-items-center w-100">
                                    <div className="room-category-info">
                                      <h5 className="mb-1">
                                        {category.roomCategory}
                                      </h5>
                                    </div>

                                    <div className="d-flex align-items-center gap-3">
                                      <div className="room-category-price text-end">
                                        <div className="price-range">
                                          From{" "}
                                          {/* Cheapest card in this category, read
                                              through the same expression the cards
                                              use (marked-up total). `rate.rate` was
                                              used before, and GRN / GoGlobal fill
                                              that field with the PRE-markup price,
                                              so their headers under-quoted. */}
                                          {formatPrice(
                                            Math.min(
                                              ...filteredRates.map(displayTotalOf),
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
                                        <AccordionToggleButton
                                          eventKey={eventKey}
                                          isActive={isActive}
                                        />
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
                                      const isSelectedForThisSlot =
                                        isMultiRoom &&
                                        selectedRooms[roomSlotIndex]
                                          ?.selectedRate === rate;
                                      // Auto-link visibility: does this rate
                                      // cover >1 slot (partial-bundled), and
                                      // if it's picked here, which OTHER
                                      // slots is it currently linked to?
                                      const rateCovers =
                                        Number(rate?.numberOfRooms) || 1;
                                      const linkedSlotNumbers =
                                        isNonBundledMode && rateCovers > 1
                                          ? selectedRooms
                                              .map((r, i) =>
                                                r?.selectedRate?.rateKey ===
                                                  rate?.rateKey &&
                                                i !== roomSlotIndex
                                                  ? i + 1
                                                  : null,
                                              )
                                              .filter(Boolean)
                                          : [];
                                      return (
                                        <Col
                                          key={rateIndex}
                                          lg={viewMode === "grid" ? 6 : 12}
                                          xl={viewMode === "grid" ? 4 : 12}
                                          className={isMultiRoom ? "mb-1" : "mb-2"}
                                        >
                                          <Card
                                            className={`rate-card h-100 shadow-sm${
                                              isSelectedForThisSlot
                                                ? " rate-card-selected"
                                                : ""
                                            }`}
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
                                            {/* GRN partial-bundled indicator
                                                moved INLINE (below the rate
                                                features) — the earlier
                                                absolute-positioned corner
                                                badge collided with the
                                                refund-status pill. Rendered
                                                inside the card body a bit
                                                further down instead. */}
                                            {viewMode === "grid" ? (
                                              <Card.Body className="p-2 pb-0 d-flex flex-column gap-2">
                                                <div className="rate-header d-flex justify-content-between align-items-start">
                                                  <div>
                                                    <div className="d-flex align-items-center gap-2">
                                                      {getMealPlanIcon(
                                                        rate.mealPlan,
                                                      )}
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
                                                  {resolveApiId(hotel) ===
                                                  apiIdMapping.GRN
                                                    ? renderGrnRefundBadge(rate)
                                                    : getRefundStatusBadgeInRoomList(
                                                        // Prefer the prebook-time
                                                        // signal (derived from the
                                                        // supplier's Remark text)
                                                        // when a prebook has been
                                                        // fetched for this rate;
                                                        // fall back to the search-
                                                        // time flag before that so
                                                        // the badge still shows on
                                                        // first render.
                                                        atharvaPrebookCache?.[
                                                          rate.rateKey
                                                        ]?.nonRefundable ??
                                                          rate.nonRefundable,
                                                        isDeadlinePassed(
                                                          resolveDeadlineDate(rate),
                                                        ),
                                                      )}
                                                </div>

                                                <div className="rate-pricing text-center py-2">
                                                  <div className="current-price">
                                                    {formatPrice(
                                                      isMultiRoom
                                                        ? rate.totalRate || 0
                                                        : rate.roomRateBasedOnRoomCount ||
                                                            rate.totalRate ||
                                                            0,
                                                    )}
                                                  </div>
                                                  {/* Simplified per-operator request: drop the
                                                      "rate × rooms × nights" breakdown line
                                                      and just show "for N nights" beneath the
                                                      total price. Single-night stays keep
                                                      "per night" so nothing regresses for
                                                      short searches. */}
                                                  <div className="price-per-night small text-muted">
                                                    {/* GRN bundled rate: GRN's price covers
                                                        EVERY room in the rate (no_of_rooms=N),
                                                        so say so — otherwise the same figure
                                                        shown under Room 1 and Room 2 reads as
                                                        two separate prices. */}
                                                    {isGrnMultiRoomFlow &&
                                                    Number(rate?.numberOfRooms) > 1
                                                      ? `for ${rate.numberOfRooms} rooms · ${
                                                          stayNights > 1
                                                            ? `${stayNights} nights`
                                                            : "per night"
                                                        }`
                                                      : stayNights > 1
                                                        ? `for ${stayNights} nights`
                                                        : "per night"}
                                                  </div>
                                                </div>

                                                <div className="rate-features small">
                                                  {/* GRN partial-bundled inline badge — placed
                                                      here (below pricing, above other feature
                                                      lines) so it's clearly visible inside the
                                                      card body without collide with the refund-
                                                      status pill in the top-right corner. Hidden
                                                      once the rate is picked because the radio
                                                      label below then says "Selected for Room X
                                                      + Y" which conveys the same info. */}
                                                  {isNonBundledMode &&
                                                    rateCovers > 1 &&
                                                    !isSelectedForThisSlot && (
                                                      <div className="feature-item">
                                                        <span
                                                          style={{
                                                            backgroundColor:
                                                              "#0d6efd",
                                                            color: "#fff",
                                                            fontSize: "0.7rem",
                                                            fontWeight: 700,
                                                            padding: "2px 6px",
                                                            borderRadius: "4px",
                                                          }}
                                                        >
                                                          Covers {rateCovers}{" "}
                                                          rooms
                                                        </span>
                                                      </div>
                                                    )}
                                                  <div className="feature-item">
                                                    <FaInfoCircle className="me-2 text-muted" />
                                                    {rate.contractLabel}
                                                  </div>

                                                  {/* Free-cancellation cut-off, shown for every
                                                      supplier. GRN keeps its own colour-coded,
                                                      IST-based pill; everything else goes through
                                                      the shared red one, which falls back to the
                                                      earliest cancellation-policy fromDate for the
                                                      suppliers that send no deadline field. */}
                                                  {resolveApiId(hotel) === apiIdMapping.GRN ? (
                                                    <div className="feature-item">
                                                      <GrnDeadlinePill rate={rate} />
                                                    </div>
                                                  ) : (
                                                    <div className="feature-item">
                                                      <RateDeadlinePill
                                                        rate={rate}
                                                      />
                                                    </div>
                                                  )}
                                                  {renderPayableAtHotelPill(rate)}
                                                  <div className="feature-item">
                                                    <Button
                                                      variant="link"
                                                      size="sm"
                                                      className="p-0 text-decoration-underline"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        openPoliciesModal(
                                                          rate,
                                                          hotel,
                                                        );
                                                      }}
                                                    >
                                                      <FaShieldAlt className="me-2" />
                                                      Cancellation Policies
                                                      &amp; Terms &amp;
                                                      Conditions
                                                    </Button>
                                                  </div>
                                                </div>

                                                {isMultiRoom ? (
                                                  <>
                                                    <Form.Check
                                                      type="radio"
                                                      id={`rate-radio-grid-${roomSlotIndex}-${index}-${rateIndex}`}
                                                      name={`rate-radio-grid-room-${roomSlotIndex}`}
                                                      className="w-100 mt-1 mb-1"
                                                      label={
                                                        isSelectedForThisSlot
                                                          ? linkedSlotNumbers.length > 0
                                                            ? `Selected for Room ${roomSlotIndex + 1} + ${linkedSlotNumbers.join(", ")}`
                                                            : `Selected for Room ${roomSlotIndex + 1}`
                                                          : isNonBundledMode && rateCovers > 1
                                                            ? `Select — this rate books ${rateCovers} rooms together`
                                                            : `Select for Room ${roomSlotIndex + 1}`
                                                      }
                                                      checked={
                                                        selectedRooms[
                                                          roomSlotIndex
                                                        ]?.selectedRate === rate
                                                      }
                                                      onChange={() =>
                                                        handleRateSelect(
                                                          roomSlotIndex,
                                                          rate,
                                                          hotel.hotelId,
                                                          hotel.hotelName,
                                                        )
                                                      }
                                                      onClick={() => {
                                                        // HTML radios don't fire onChange when
                                                        // clicked while already checked, so
                                                        // catch the unselect gesture here.
                                                        // handleRateSelect toggles on same-rate
                                                        // click, so this cleanly clears the pick.
                                                        if (isSelectedForThisSlot) {
                                                          handleRateSelect(
                                                            roomSlotIndex,
                                                            rate,
                                                            hotel.hotelId,
                                                            hotel.hotelName,
                                                          );
                                                        }
                                                      }}
                                                    />
                                                    {isSelectedForThisSlot &&
                                                      linkedSlotNumbers.length >
                                                        0 && (
                                                        <div
                                                          className="small text-muted"
                                                          style={{
                                                            marginTop: "-4px",
                                                            paddingLeft: "1.5rem",
                                                          }}
                                                        >
                                                          Also applied to Room{" "}
                                                          {linkedSlotNumbers.join(
                                                            ", ",
                                                          )}{" "}
                                                          — click again to
                                                          unlink all.
                                                        </div>
                                                      )}
                                                  </>
                                                ) : (
                                                  <Button
                                                    variant="primary"
                                                    className="w-100 book-now-btn mt-1 mb-1"
                                                    onClick={() =>
                                                      handleBooking(rate)
                                                    }
                                                  >
                                                    <FaMoneyBillWave className="me-2" />
                                                    View Details / Select
                                                  </Button>
                                                )}
                                              </Card.Body>
                                            ) : (
                                              <Card.Body className={isMultiRoom ? "p-2 d-flex flex-row align-items-center gap-2 flex-wrap flex-md-nowrap" : "p-3 py-2 d-flex flex-row align-items-center gap-3 flex-wrap flex-md-nowrap"}>
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
                                                      {getMealPlanIcon(
                                                        rate.mealPlan,
                                                      )}
                                                      <span className="fw-semibold text-truncate">
                                                        {rate.mealPlan}
                                                      </span>
                                                    </div>
                                                    <div className="d-flex align-items-center gap-2 flex-shrink-0">
                                                      {resolveApiId(hotel) ===
                                                      apiIdMapping.GRN
                                                        ? renderGrnRefundBadge(rate)
                                                        : getRefundStatusBadgeInRoomList(
                                                            // Same override the grid
                                                            // view uses: prefer the
                                                            // prebook-time signal
                                                            // (derived from Atharva's
                                                            // Policies[].Remark
                                                            // "Rates are
                                                            // Non-refundable" match)
                                                            // when a prebook has been
                                                            // fetched for this rate,
                                                            // else fall back to the
                                                            // search-time flag.
                                                            atharvaPrebookCache?.[
                                                              rate.rateKey
                                                            ]?.nonRefundable ??
                                                              rate.nonRefundable,
                                                            isDeadlinePassed(
                                                              resolveDeadlineDate(rate),
                                                            ),
                                                          )}
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
                                                    className={isMultiRoom ? "rate-features small text-muted d-flex flex-column align-items-start gap-1" : "rate-features small text-muted d-flex flex-wrap gap-3"}
                                                    style={{ minWidth: 0 }}
                                                  >
                                                    {rate.contractLabel && (
                                                      <div className={`feature-item d-flex align-items-center text-truncate ${isMultiRoom ? "w-100" : ""}`}>
                                                        <FaInfoCircle className="me-2 flex-shrink-0" />
                                                        <span className="text-truncate">
                                                          {rate.contractLabel}
                                                        </span>
                                                      </div>
                                                    )}
                                                    {/* Free-cancellation cut-off for every supplier;
                                                        GRN keeps its own colour-coded IST pill. */}
                                                    {resolveApiId(hotel) === apiIdMapping.GRN ? (
                                                      <div className="feature-item">
                                                        <GrnDeadlinePill rate={rate} />
                                                      </div>
                                                    ) : (
                                                      <div className="feature-item d-flex align-items-center">
                                                        <FaInfoCircle className="me-2 flex-shrink-0" />
                                                        <RateDeadlinePill
                                                          rate={rate}
                                                        />
                                                      </div>
                                                    )}
                                                  {renderPayableAtHotelPill(rate)}
                                                    <div className="feature-item d-flex align-items-center">
                                                      <Button
                                                        variant="link"
                                                        size="sm"
                                                        className="p-0 text-decoration-underline"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          openPoliciesModal(
                                                            rate,
                                                            hotel,
                                                          );
                                                        }}
                                                      >
                                                        <FaShieldAlt className="me-2" />
                                                        Cancellation Policies
                                                        &amp; Terms &amp;
                                                        Conditions
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
                                                        : rate.roomRateBasedOnRoomCount ||
                                                            rate.totalRate ||
                                                            0,
                                                    )}
                                                  </div>
                                                  {/* See sibling in the grid view above — same
                                                      simplification: drop the multiplication
                                                      breakdown, show only "for N nights". */}
                                                  <div className="small text-muted">
                                                    {isGrnMultiRoomFlow &&
                                                    Number(rate?.numberOfRooms) > 1
                                                      ? `for ${rate.numberOfRooms} rooms · ${
                                                          stayNights > 1
                                                            ? `${stayNights} nights`
                                                            : "per night"
                                                        }`
                                                      : stayNights > 1
                                                        ? `for ${stayNights} nights`
                                                        : "per night"}
                                                  </div>
                                                </div>

                                                <div
                                                  className={
                                                    isMultiRoom
                                                      ? "flex-shrink-0 order-first ps-3"
                                                      : "flex-shrink-0"
                                                  }
                                                  style={
                                                    isMultiRoom
                                                      ? { minWidth: "170px" }
                                                      : undefined
                                                  }
                                                >
                                                  {isMultiRoom ? (
                                                    <div>
                                                      {isNonBundledMode &&
                                                        rateCovers > 1 &&
                                                        !isSelectedForThisSlot && (
                                                          <div
                                                            style={{
                                                              backgroundColor:
                                                                "#0d6efd",
                                                              color: "#fff",
                                                              fontSize: "0.7rem",
                                                              fontWeight: 700,
                                                              padding: "2px 6px",
                                                              borderRadius: "4px",
                                                              display: "inline-block",
                                                              marginBottom: "4px",
                                                            }}
                                                          >
                                                            Covers {rateCovers}{" "}
                                                            rooms
                                                          </div>
                                                        )}
                                                      <Form.Check
                                                        type="radio"
                                                        id={`rate-radio-list-${roomSlotIndex}-${index}-${rateIndex}`}
                                                        name={`rate-radio-list-room-${roomSlotIndex}`}
                                                        label={
                                                          isSelectedForThisSlot
                                                            ? linkedSlotNumbers.length > 0
                                                              ? `Selected for Room ${roomSlotIndex + 1} + ${linkedSlotNumbers.join(", ")}`
                                                              : `Selected for Room ${roomSlotIndex + 1}`
                                                            : isNonBundledMode && rateCovers > 1
                                                              ? `Select — this rate books ${rateCovers} rooms together`
                                                              : `Select for Room ${roomSlotIndex + 1}`
                                                        }
                                                        checked={
                                                          selectedRooms[
                                                            roomSlotIndex
                                                          ]?.selectedRate === rate
                                                        }
                                                        onChange={() =>
                                                          handleRateSelect(
                                                            roomSlotIndex,
                                                            rate,
                                                            hotel.hotelId,
                                                            hotel.hotelName,
                                                          )
                                                        }
                                                        onClick={() => {
                                                          // Catch the click-on-already-checked
                                                          // gesture (HTML radios don't fire
                                                          // onChange for it). Toggles the pick
                                                          // off via handleRateSelect's same-rate
                                                          // branch, so the operator can re-pick
                                                          // a different rate freely.
                                                          if (isSelectedForThisSlot) {
                                                            handleRateSelect(
                                                              roomSlotIndex,
                                                              rate,
                                                              hotel.hotelId,
                                                              hotel.hotelName,
                                                            );
                                                          }
                                                        }}
                                                        style={{
                                                          whiteSpace: "nowrap",
                                                        }}
                                                      />
                                                      {isSelectedForThisSlot &&
                                                        linkedSlotNumbers.length >
                                                          0 && (
                                                          <div
                                                            className="small text-muted"
                                                            style={{
                                                              marginTop: "2px",
                                                              paddingLeft: "1.5rem",
                                                            }}
                                                          >
                                                            Also applied to Room{" "}
                                                            {linkedSlotNumbers.join(
                                                              ", ",
                                                            )}
                                                          </div>
                                                        )}
                                                    </div>
                                                  ) : (
                                                    <Button
                                                      variant="primary"
                                                      className="book-now-btn px-3 py-2"
                                                      onClick={() =>
                                                        handleBooking(rate)
                                                      }
                                                      style={{
                                                        whiteSpace: "nowrap",
                                                      }}
                                                    >
                                                      <FaMoneyBillWave className="me-2" />
                                                      View Details
                                                    </Button>
                                                  )}
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
                          {hotel.roomCategories.every(
                            (c) =>
                              (c.availableRates || []).filter(rateMatches)
                                .length === 0,
                          ) && (
                            <Alert variant="info" className="mb-0">
                              No rates match the selected filters.
                            </Alert>
                          )}
                        </Accordion>
                      );

                      if (!isMultiRoom) {
                        return (
                          <React.Fragment key="single-room">
                            {inner}
                          </React.Fragment>
                        );
                      }

                      const slotSelection = selectedRooms[roomSlotIndex];
                      // GRN partial-bundled: figure out if this slot is
                      // filled by a rate that primarily belongs to an
                      // earlier slot (auto-linked), so the header can
                      // show "Linked to Room X" instead of the plain
                      // "picked" badge — makes the atomic group visible.
                      const linkedPrimaryIndex =
                        isNonBundledMode && slotSelection?.selectedRate?.rateKey
                          ? selectedRooms.findIndex(
                              (r) =>
                                r?.selectedRate?.rateKey ===
                                slotSelection.selectedRate.rateKey,
                            )
                          : -1;
                      const isLinkedChildSlot =
                        linkedPrimaryIndex !== -1 &&
                        linkedPrimaryIndex !== roomSlotIndex;
                      return (
                        <Accordion
                          key={`room-slot-${roomSlotIndex}`}
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
                                  isLinkedChildSlot ? (
                                    <Badge bg="info" className="ms-2">
                                      Linked to Room{" "}
                                      {linkedPrimaryIndex + 1} —{" "}
                                      {
                                        slotSelection.selectedRate
                                          .roomCategory
                                      }
                                    </Badge>
                                  ) : (
                                    <Badge bg="success" className="ms-2">
                                      {slotSelection.selectedRate.roomCategory}
                                      {" — "}
                                      {formatPrice(
                                        slotSelection.selectedRate.totalRate ||
                                          0,
                                      )}
                                    </Badge>
                                  )
                                ) : (
                                  <Badge
                                    bg="warning"
                                    text="dark"
                                    className="ms-2"
                                  >
                                    Not selected
                                  </Badge>
                                )}
                              </div>
                            </Accordion.Header>
                            <Accordion.Body>{inner}</Accordion.Body>
                          </Accordion.Item>
                        </Accordion>
                      );
                    },
                  )}

                  {/* Multi-room "Continue with Booking" progress banner —
                      identical UX to Inhouse. */}
                  {isMultiRoom &&
                    (() => {
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
          </div>
        </main>
      </div>

      {/* Accurate-rate confirm modal (apiId 12/15/16). Preserves the ARRAY
          shape ApiBookingPageForHotels reads from sessionStorage. */}
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
          {(() => {
            // Nightcount for this stay, derived from the search-time payload
            // so the modal can split per-room-per-stay (what every supplier
            // populates onto rate.rate) into a per-night and a total-for-stay
            // display. Defaults to 1 so 1-night stays continue to render the
            // same value in both cells and nothing divides by zero.
            let stayNights = 1;
            try {
              const ci = payload?.checkInDate ? new Date(payload.checkInDate) : null;
              const co = payload?.checkOutDate ? new Date(payload.checkOutDate) : null;
              if (ci && co && !isNaN(ci) && !isNaN(co)) {
                const diff = Math.round((co - ci) / (1000 * 60 * 60 * 24));
                if (diff > 0) stayNights = diff;
              }
            } catch (e) {
              /* fall through with stayNights = 1 */
            }
            // GRN bundled multi-room: every slot carries the FULL bundle price
            // under one shared rate key (the backend splits it per room on
            // persist). Count each rate key once so a 2-room bundle shows the
            // bundle price, not double. Non-bundled slots have distinct keys
            // and add up. Other suppliers: plain per-slot sum as before.
            // apiIdMapping.GRN is the NUMBER 20 — compare numerically.
            const isGrnHere =
              resolveApiId(hotel) === apiIdMapping.GRN ||
              Number(payload?.apiId) === apiIdMapping.GRN;
            const slotsPerKey = new Map();
            if (isGrnHere) {
              (selectedRate || []).forEach((r, i) => {
                const k = r?.atharvaRateKey || r?.rateKey || `row-${i}`;
                slotsPerKey.set(k, (slotsPerKey.get(k) || 0) + 1);
              });
            }
            const seenKeys = new Set();
            const grandTotal = (selectedRate || []).reduce((sum, r, i) => {
              if (isGrnHere) {
                const k = r?.atharvaRateKey || r?.rateKey || `row-${i}`;
                if (seenKeys.has(k)) return sum;
                seenKeys.add(k);
              }
              return sum + (Number(r?.rate) || 0);
            }, 0);
            return (
              <>
                {/* GoGlobal (apiId 21) valuation banner — surfaces the
                    Booking-Valuation outcome (price change / cancellation
                    deadline / late remarks) before the operator commits.
                    hotelSearchCode is a GoGlobal-only carrier, so this block
                    never renders for other suppliers. */}
                {selectedRate?.[0]?.hotelSearchCode && (
                  <div
                    className={`alert ${
                      selectedRate[0].goglobalPriceChanged
                        ? "alert-warning"
                        : "alert-success"
                    } py-2`}
                    role="alert"
                  >
                    <div className="fw-semibold mb-1">
                      {selectedRate[0].goglobalPriceChanged
                        ? "Rate re-valuated — the price has changed since search. Please review before booking."
                        : "Rate confirmed by GoGlobal — no price change since search."}
                    </div>
                    {selectedRate[0].deadlineDate && (
                      <div className="small">
                        Cancellation deadline:{" "}
                        <span className="fw-semibold">
                          {selectedRate[0].deadlineDate}
                        </span>
                      </div>
                    )}
                    {selectedRate[0].goglobalRemarks && (
                      <div
                        className="small mt-1"
                        style={{ whiteSpace: "pre-wrap" }}
                      >
                        <span className="fw-semibold">Remarks:</span>{" "}
                        {stripHtmlTags(selectedRate[0].goglobalRemarks)}
                      </div>
                    )}
                  </div>
                )}
                {selectedRate?.map((rate, index) => {
                  // Per-room stay total: rate.rate is the marked-up total for
                  // this room for the entire stay (see RatehawkHotelRoomSearchService,
                  // IwtxResponseMapper, DarinaHotelRoomSearchService — same
                  // convention across suppliers). Fall back to rate.totalRate
                  // for safety if a supplier ever populates only that.
                  // GRN bundled: rate.rate is the whole-bundle price; show
                  // this room's share so the per-room rows add up to the
                  // grand total. Non-bundled / other suppliers: unchanged.
                  const bundleShareCount = isGrnHere
                    ? slotsPerKey.get(
                        rate?.atharvaRateKey || rate?.rateKey || `row-${index}`,
                      ) || 1
                    : 1;
                  const perRoomStayTotal =
                    (Number(rate?.rate) || Number(rate?.totalRate) || 0) /
                    bundleShareCount;
                  const perNight = perRoomStayTotal / stayNights;
                  return (
                    <Row key={index} className="g-4 mb-4">
                      {/* Stock room photos and the hardcoded amenity badges
                          used to sit here. Both were the same for every hotel,
                          so the modal now shows only what the supplier
                          actually returned for this rate. */}
                      <Col md={12}>
                        <h5>Room {index + 1}</h5>
                        <h5 className="mb-2">{rate.roomCategory}</h5>
                        <p className="text-muted">{rate.roomTypeDescription}</p>
                        <div className="booking-details-modal">
                          <div className="d-flex align-items-center gap-2 mb-2">
                            <span>Meal Plan:</span>
                            <span className="fw-semibold">{rate.mealPlan}</span>
                          </div>
                          {activeUserRole === "ADMIN" && (
                            <div className="d-flex justify-content-between mb-2">
                              <span>
                                Selling Price{stayNights > 1 ? " (per night)" : ""}:
                              </span>
                              <span className="fw-semibold text-primary">
                                {formatPrice(perNight)}
                              </span>
                            </div>
                          )}
                          <div className="d-flex justify-content-between mb-2">
                            <span>
                              Total Rate{stayNights > 1 ? ` (${stayNights} nights)` : ""}:
                            </span>
                            <span className="fw-semibold text-primary">
                              {formatPrice(perRoomStayTotal)}
                            </span>
                          </div>
                          <div className="d-flex justify-content-between mb-2">
                            <span>Refund Status:</span>
                            <span>
                              {Number(roomData?.payload?.apiId) === apiIdMapping.GRN ? (
                                <GrnRefundBadge rate={rate} />
                              ) : (
                                getRefundStatusBadge(
                                  rate.nonRefundable === "Y" ||
                                    rate.nonRefundable === true ||
                                    rate.nonRefundable === "true"
                                    ? "NON REFUNDABLE"
                                    : "FLEXIBLE",
                                )
                              )}
                            </span>
                          </div>
                          {/* GRN: this room's VERIFIED cancellation policy
                              (rechecked just now). Non-bundled → each room
                              shows its own; bundled → identical on every
                              room. */}
                          {Number(roomData?.payload?.apiId) === apiIdMapping.GRN && (
                            <GrnPolicyBlock
                              rate={rate}
                              compact
                              note={
                                rate.grnPriceChanged || rate.grnPolicyChanged
                                  ? "Updated by GRN since your search — accepted."
                                  : "Verified."
                              }
                            />
                          )}
                          {/* <div className="d-flex justify-content-between">
                            <span>Contract:</span>
                            <span className="small text-muted">
                              {rate.contractLabel}
                            </span>
                          </div> */}
                        </div>
                      </Col>
                    </Row>
                  );
                })}
                {/* Grand total footer — only when the booking spans more than
                    one room. For a single room the per-room "Total Rate" row
                    above already IS the grand total, so an extra row would be
                    noise. */}
                {selectedRate && selectedRate.length > 1 && (
                  <div className="d-flex justify-content-between align-items-center pt-3 mt-2 border-top">
                    <span className="fw-semibold">
                      Grand Total ({selectedRate.length} rooms
                      {stayNights > 1 ? ` × ${stayNights} nights` : ""}):
                    </span>
                    <span className="fs-5 fw-bold text-primary">
                      {formatPrice(grandTotal)}
                    </span>
                  </div>
                )}
              </>
            );
          })()}
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
                const currentApiId = resolveApiId(hotel);
                sessionStorage.setItem(
                  "bookingData",
                  JSON.stringify({
                    selectedRate,
                    hotelStaticData: roomData.meta,
                    payload: { ...payload, apiId: currentApiId },
                    // Carry the operator's display-currency preference (code
                    // + factor) picked at search time so the booking page
                    // renders prices the same way this modal does. Without
                    // this the booking page falls back to raw AED and the
                    // "Selling Price / Total" figures on the two pages
                    // disagree for any non-AED display currency.
                    displayCurrency,
                  }),
                );
              } catch (e) {
                console.error("Error storing bookingData:", e);
              }
              window.open("/api-booking-page-hotels", "_blank");
            }}
          >
            Continue
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Cancellation Policies & Terms modal — sourced from the search
          response so no extra API call is needed for external suppliers. */}
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

          {/* GoGlobal (apiId 21) cancellation deadline — shown in red at the
              top of the modal. Only GoGlobal sets policiesModalData.deadlineDate. */}
          {policiesModalData.deadlineDate && (
            <div className="alert alert-danger py-2 mb-3" role="alert">
              <span className="fw-semibold">Cancellation deadline:</span>{" "}
              {policiesModalData.deadlineDate}
            </div>
          )}

          {/* GRN "Payable at Hotel" — set from the RECHECKED rate's
              payableAtHotelAmount / _Currency / _Description. This is the
              guaranteed figure the property will collect at check-in, so it
              belongs at the top of the modal alongside the total. Rendered
              in a separate coloured card so the operator can never confuse
              it with the booking total. Hidden when GRN reports no such
              charge (and always hidden for other suppliers, which don't
              populate these fields). */}
          {(policiesModalData.payableAtHotelAmount != null ||
            policiesModalData.payableAtHotelDescription) && (
            <div
              className="p-2 mb-3 border rounded"
              style={{ background: "#fff4e5", borderColor: "#f0c78a" }}
            >
              <div
                className="fw-semibold small mb-1"
                style={{ color: "#7a4a00" }}
              >
                Payable at Hotel
                {policiesModalData.payableAtHotelDescription
                  ? ` — ${policiesModalData.payableAtHotelDescription}`
                  : ""}
              </div>
              <div className="small" style={{ color: "#7a4a00" }}>
                {policiesModalData.payableAtHotelAmount != null ? (
                  <>
                    <strong>
                      {(
                        policiesModalData.payableAtHotelCurrency || "AED"
                      ).toUpperCase()}{" "}
                      {Number(
                        policiesModalData.payableAtHotelAmount,
                      ).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </strong>{" "}
                    is collected by the property at check-in and is <u>not</u>{" "}
                    part of the booking total.
                  </>
                ) : (
                  <>
                    The hotel will collect additional charges at check-in that
                    are not part of the booking total.
                  </>
                )}
              </div>
            </div>
          )}

          {/* ATHARVA prebook feedback. Loading + error banners live above the
              policies list so they're visible without covering the T&C section. */}
          {prebookLoading && (
            <div className="alert alert-info py-2 mb-3" role="status">
              Fetching cancellation policy from supplier…
            </div>
          )}
          {prebookError && (
            <div className="alert alert-warning py-2 mb-3" role="alert">
              {prebookError}
            </div>
          )}

          {/* Atharva Policies[].Remark aggregated by the backend. Includes
              the "IMPORTANT NOTE …" line and any non-refundable notice as
              supplied by the vendor. whiteSpace: pre-line preserves the
              newlines the backend used when joining multiple Remarks. */}
          {policiesModalData.remark && (
            <div
              className="p-2 mb-3 border rounded"
              style={{ background: "#fff8e1", borderColor: "#f59e0b" }}
            >
              <div
                className="fw-semibold small mb-1"
                style={{ color: "#92400e" }}
              >
                Supplier Notes
              </div>
              <div
                className="small text-dark"
                style={{ whiteSpace: "pre-line" }}
              >
                {/* Strip supplier HTML (<p>, <b>, <div>, <ul>, <li> …) so
                    the notice reads as plain text. Same helper the
                    cancellation-policy rows below already use. */}
                {stripHtmlTags(policiesModalData.remark)}
              </div>
            </div>
          )}

          <h6 className="text-danger mb-2">
            <FaTimesCircle className="me-2" />
            Cancellation Policies
          </h6>
          {policiesModalData.isGrn ? (
            /* GRN: category (Fully / Partially / Non-refundable), "Free
               cancellation until … IST", penalty timeline, no-show fee and
               the IST note — from GrnCancellationPolicyMapper. Search-time
               values first, swapped for the rechecked ones when recheck
               returns; a change since search is called out explicitly. */
            <div className="mb-4">
              {policiesModalData.grnChange && (
                <div className="alert alert-warning py-2 small mb-2" role="alert">
                  <strong>Updated by supplier:</strong>{" "}
                  {policiesModalData.grnChange.priceChanged &&
                  policiesModalData.grnChange.policyChanged
                    ? "the price and the cancellation policy have changed since your search."
                    : policiesModalData.grnChange.priceChanged
                      ? "the price has changed since your search."
                      : "the cancellation policy has changed since your search."}
                  {policiesModalData.grnChange.priceChanged && (
                    <>
                      {" "}
                      Price:{" "}
                      <span className="text-decoration-line-through">
                        {formatPrice(policiesModalData.grnChange.oldPrice)}
                      </span>{" "}
                      → <strong>{formatPrice(policiesModalData.grnChange.newPrice)}</strong>
                    </>
                  )}
                </div>
              )}
              <GrnPolicyBlock
                policy={policiesModalData.grnPolicy}
                note={
                  policiesModalData.grnVerified
                    ? "Verified just now — this is the policy that will apply to the booking."
                    : prebookLoading
                      ? "Search-time policy shown; verifying with GRN…"
                      : "Search-time policy shown."
                }
              />
            </div>
          ) : policiesModalData.cancellationPolicies?.length > 0 ? (
            <ul className="mb-4 ps-3">
              {policiesModalData.cancellationPolicies.map((policy, idx) => {
                const validity = renderPolicyValidity(
                  policy?.fromDate,
                  policy?.toDate,
                );
                return (
                  <li key={idx} className="mb-2">
                    <div style={{ whiteSpace: "pre-line" }}>
                      {stripHtmlTags(policy?.policyText)}
                    </div>
                    {validity && (
                      <small className="text-muted">{validity}</small>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : policiesModalData.nonRefundable ? (
            <div className="alert alert-danger py-2 px-3 mb-4 small">
              <strong>Non-refundable rate.</strong> No refund will be
              provided if this booking is cancelled. 100% cancellation
              charges apply.
            </div>
          ) : (
            <p className="text-muted mb-4">
              No cancellation policies available.
            </p>
          )}

          {/* GRN other_inclusions — the rate.other_inclusions list from
              the availability endpoint (free WiFi / breakfast add-ons /
              parking / etc). Rendered only when populated so non-GRN
              rates never show an empty section. Populated by
              openPoliciesModal's GRN branch above; falls back to the
              availability list when recheck omitted its own inclusions. */}
          {policiesModalData.otherInclusions?.length > 0 && (
            <>
              <h6 className="text-success mb-2 pt-2 border-top">
                <FaInfoCircle className="me-2" />
                Other Inclusions
              </h6>
              <ul className="mb-4 ps-3">
                {policiesModalData.otherInclusions.map((inc, idx) => {
                  const text = stripHtmlTags(
                    typeof inc === "string" ? inc : String(inc ?? ""),
                  );
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

          {/* GRN rate_comments — { comments, mealplan, pax_comments,
              remarks, MandatoryTax } from the availability endpoint. Any
              of the five may be missing or blank; only populated ones
              render. `remarks` frequently contains <br> tags — convert
              those to newlines before stripping so multi-line notes stay
              readable under whiteSpace: pre-line. Populated only by GRN;
              non-GRN suppliers never carry this object. */}
          {(() => {
            const rc = policiesModalData.rateComments;
            if (!rc || typeof rc !== "object") return null;
            const entries = [
              { key: "comments",     label: "Comments" },
              { key: "mealplan",     label: "Meal Plan" },
              { key: "pax_comments", label: "Pax Comments" },
              { key: "remarks",      label: "Remarks" },
              { key: "MandatoryTax", label: "Mandatory Tax" },
            ]
              .map(({ key, label }) => {
                const raw = rc[key];
                const rawStr =
                  typeof raw === "string"
                    ? raw
                    : raw == null
                    ? ""
                    : String(raw);
                if (!rawStr.trim()) return null;
                const withBreaks = rawStr.replace(/<br\s*\/?\s*>/gi, "\n");
                const text = stripHtmlTags(withBreaks).trim();
                if (!text) return null;
                return { key, label, text };
              })
              .filter(Boolean);
            if (entries.length === 0) return null;
            return (
              <>
                <h6 className="text-info mb-2 pt-2 border-top">
                  <FaInfoCircle className="me-2" />
                  Rate Comments
                </h6>
                <ul className="mb-4 ps-3">
                  {entries.map(({ key, label, text }) => (
                    <li
                      key={key}
                      className="mb-2"
                      style={{ whiteSpace: "pre-line" }}
                    >
                      <strong>{label}:</strong> {text}
                    </li>
                  ))}
                </ul>
              </>
            );
          })()}

          <h6 className="text-secondary mb-2 pt-2 border-top">
            <FaInfoCircle className="me-2" />
            Terms &amp; Conditions
          </h6>
          {policiesModalData.termsAndConditions?.length > 0 ? (
            <ul className="mb-0 ps-3">
              {policiesModalData.termsAndConditions.map((term, idx) => {
                const raw =
                  typeof term === "string"
                    ? term
                    : term?.description ||
                      term?.policyText ||
                      term?.text ||
                      "";
                const text = stripHtmlTags(raw);
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
              No terms &amp; conditions available.
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

      {/* GRN: price / cancellation-policy changed between search and
          recheck. The Room Details modal opens only after the operator
          accepts the NEW terms; "Go back" leaves them on the rate list. */}
      <GrnChangeNoticeModal
        show={!!grnChangeNotice}
        items={grnChangeNotice?.items || []}
        formatPrice={formatPrice}
        onAccept={() => grnChangeNotice?.onAccept?.()}
        onCancel={() => setGrnChangeNotice(null)}
      />
    </div>
  );
};

export default ExternalApiRoomList;
