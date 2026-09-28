import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  FaHotel,
  FaCalendarAlt,
  FaUsers,
  FaUtensils,
  FaClock,
  FaCheckCircle,
} from "react-icons/fa";
import Sidebar from "../../../components/Sidebar";
import TopBar from "../../../components/TopBar";
import "../../../styles/HotelBookingPage.css";
import {
  Container,
  Row,
  Col,
  Card,
  Form,
  Button,
  Accordion,
  Badge,
  Alert,
  Modal,
  Spinner,
} from "react-bootstrap";
import axiosInstance from "../../../components/AxiosInstance";
import toast from "react-hot-toast";
import { formatDateTime } from "../../../utils/dateUtils";
import { createAmendmentLink } from "../../../utils/amendmentLink";
import QuotationPdfCard from "../../../components/quotation/QuotationPdfCard";

// Mirrors HotelBookingPage — the sole online-payment gateway surfaced when
// the agent's available credit falls short of the booking amount. CCAvenue
// routes to /payment/ccavenue-redirect which POSTs the encrypted request to
// CCAvenue's hosted billing page.
const PAYMENT_GATEWAYS = [
  { id: "ccavenue", name: "CC Avenue", desc: "Cards, UPI, Net Banking" },
];

// Reverse-geocode browser coordinates to a readable address for the
// Booking History audit trail. Tries OpenStreetMap Nominatim first
// (street-level detail), then BigDataCloud (locality-level, keyless) —
// both free, CORS-enabled endpoints. Returns null when neither responds
// so the caller keeps its IP-derived fallback. Mirrors
// SeniorCitizenBookingPage / StudentBookingPage / GovEmployeeBookingPage.
async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1`,
      { headers: { Accept: "application/json" } }
    );
    if (res.ok) {
      const a = (await res.json())?.address || {};
      const parts = [
        a.road,
        a.neighbourhood || a.suburb,
        a.village || a.town || a.city || a.municipality,
        a.state,
        a.postcode,
        a.country,
      ].filter(Boolean);
      const line = parts.filter((p, i) => parts.indexOf(p) === i).join(", ");
      if (line) return line.slice(0, 255); // DB column is VARCHAR(255)
    }
  } catch {
    // fall through to BigDataCloud
  }
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
    );
    if (res.ok) {
      const d = await res.json();
      const parts = [d.locality, d.city, d.principalSubdivision, d.countryName].filter(Boolean);
      const line = parts.filter((p, i) => parts.indexOf(p) === i).join(", ");
      if (line) return line.slice(0, 255);
    }
  } catch {
    // give up — caller keeps the IP-based fallback
  }
  return null;
}

// Same list HotelBookingPage renders — day-stay uses the identical vocabulary
// so the FE / BE / reporting stack sees a consistent set of request tags.
const SPECIAL_REQUEST_OPTIONS = [
  "Early Check-In",
  "Non-Smoking Rooms",
  "High Floor",
  "VIP Client",
  "Late Check-In",
  "Inter-connecting rooms",
  "Low Floor",
  "Room with Bathtub",
  "Late check-Out",
  "Honeymooners / Anniversary",
  "Smoking Room",
];

/**
 * DayStayBookingPage — mirrors HotelBookingPage structure and data display
 * 1:1 for the day-stay flow.
 *
 * Reads dayStayBookingPayload from sessionStorage (written by
 * DayStayRoomList.proceedToBooking), renders the same three left-column
 * cards (Guest Details / Special Requests / Payment Mode), the same right
 * sticky column (Booking Summary + Price Details), the same Policy Consent
 * modal (with Cancellation / Amendment / Child / T&C sections), the same
 * Order Summary confirmation modal, and the same Insufficient-Credit +
 * Payment-Gateway modals. Posts to /api/day-stay-booking/save and lands
 * on /booking-details/day-stay-booking-list on success. Day-stay is a
 * same-day booking so there is no cancellation-deadline calc, no
 * voucher-now / voucher-later choice, and no nights count.
 */
export default function DayStayBookingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeUserRole = localStorage.getItem("currentActiveRole");

  // ── Source of truth ───────────────────────────────────────────────
  // `payload` is the flattened DayStay handoff object written by
  // DayStayRoomList.proceedToBooking. It carries the hotel header
  // (name/address/starRating), the picked rate row, the search context
  // (dates, guests, nationality), and the derived amounts.
  const [payload, setPayload] = useState(null);
  const [rooms, setRooms] = useState([]);

  // Lead passenger marker — mirrors HotelBookingPage exactly.
  const [leadIndex, setLeadIndex] = useState({ roomIdx: 0, guestIdx: 0 });
  const handleLeadSelect = (roomIdx, guestIdx) => {
    const g = rooms?.[roomIdx]?.guests?.[guestIdx];
    if (g?.isChild) return;
    setLeadIndex({ roomIdx, guestIdx });
  };

  // Primary guest state kept for compatibility with the create payload
  // shape; the visible Lead Passenger card is hidden in HotelBookingPage
  // too, and the submit derives from the Lead-marked guest at build time.
  const [primaryGuest, setPrimaryGuest] = useState({
    salutation: "",
    firstName: "",
    middleName: "",
    lastName: "",
    email: "",
    phone: "",
    passportNo: "",
    agentLpo: "",
    nativeCountry: "",
  });

  const [validationErrors, setValidationErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Agent credit — same UI + logic as HotelBookingPage.
  const [agentAvailableBalance, setAgentAvailableBalance] = useState(null);
  const [agentHasAvailableCredit, setAgentHasAvailableCredit] = useState(null);

  // Payment / confirmation state — mirrors HotelBookingPage.
  const [paymentMode, setPaymentMode] = useState("CREDITLIMIT");
  const [pendingPayload, setPendingPayload] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [showGatewayModal, setShowGatewayModal] = useState(false);
  const [insufficientAmount, setInsufficientAmount] = useState(0);
  const [selectedGateway, setSelectedGateway] = useState("");
  // Non-dismissable overlay shown between "CC Avenue payment succeeded"
  // and "booking created server-side". Mirrors HotelBookingPage — pairs
  // with the beforeunload guard so the operator physically cannot close
  // the tab or click anything else while the create is in flight.
  const [isFinalizingPayment, setIsFinalizingPayment] = useState(false);
  // Block-booking modal shown when the agent is short on credit AND the
  // AgentView "Allow Card payment mode" toggle is off — no payment path
  // exists, so the booking is turned away instead of being pushed into
  // the online-payment flow. Mirrors HotelBookingPage.
  const [showNoPaymentPathModal, setShowNoPaymentPathModal] = useState(false);
  // Per-agent "Card" payment-mode gate, toggled from AgentView. Decides
  // between the Online-Payment and Booking-Cannot-Be-Completed modals
  // when credit is short.
  const [agentCardPaymentEnabled, setAgentCardPaymentEnabled] = useState(false);

  const [remarks, setRemarks] = useState("");
  const [specialRequests, setSpecialRequests] = useState([]);
  // Optional "Booking done for" free-text. When set, the detail view + voucher
  // render it as "Contact: <value>/<agentName>". The input is ADMIN-only.
  const [bookingDoneFor, setBookingDoneFor] = useState("");
  const isAdmin =
    String(activeUserRole || "").toUpperCase() === "ADMIN";

  // Client location snapshot for the booking-history audit trail, resolved
  // once on page load and sent on the save payload:
  //   • Location — browser geolocation (GPS/WiFi) reverse-geocoded to a
  //     precise readable address; the coarse IP-derived city is only the
  //     fallback when the permission is denied or the lookup times out.
  // The IP Address column is NOT resolved here — browsers can only see the
  // shared public/NAT IP, so the backend stamps each system's unique IPv4
  // from the save request itself. Mirrors SeniorCitizenBookingPage /
  // StudentBookingPage / GovEmployeeBookingPage.
  const [clientNetwork, setClientNetwork] = useState({
    bookingLocation: null,
  });
  useEffect(() => {
    let cancelled = false;

    fetch("https://ipapi.co/json/")
      .then((res) => (res.ok ? res.json() : null))
      .then((info) => {
        if (cancelled || !info) return;
        setClientNetwork((prev) => ({
          // Never clobber a precise geolocation result that already landed.
          bookingLocation:
            prev.bookingLocation ||
            [info.city, info.region, info.country_name].filter(Boolean).join(", ") ||
            null,
        }));
      })
      .catch(() => {});

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
          const precise = await reverseGeocode(coords.latitude, coords.longitude);
          if (!cancelled && precise) {
            setClientNetwork({ bookingLocation: precise });
          }
        },
        () => {}, // denied / unavailable — keep the IP-derived fallback
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
      );
    }

    return () => { cancelled = true; };
  }, []);
  const [bookingConfirmation, setBookingConfirmation] = useState(
    "Book & Voucher",
  );

  // Policy consent modal — day-stay adds the contract's own
  // cancellation + T&C lists (from payload) AND lazily fetches the
  // hotel-level Amendment/Child policies + hotel-wide T&C so the modal
  // reads exactly like HotelBookingPage's version.
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [policyData, setPolicyData] = useState(null);
  const [hotelTermsAndConditions, setHotelTermsAndConditions] = useState("");
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);

  const [savedBooking, setSavedBooking] = useState(null);

  // Hotel's max cancellation nights (MAX(noOfNights) across its live
  // cancellation policies) — same GET as HotelBookingPage. Drives the
  // deadline shown in each room's Accordion.Header AND the Voucher-Now
  // / Voucher-Later choice card in the right column.
  const [maxCancellationNights, setMaxCancellationNights] = useState(null);
  // Voucher-choice tracking — mirrors HotelBookingPage. Nothing is
  // pre-selected: the user must explicitly pick Voucher Now or Voucher
  // Later when the choice card is visible.
  const [voucherChoiceMade, setVoucherChoiceMade] = useState(false);
  const [voucherChoiceError, setVoucherChoiceError] = useState(false);

  // ── Booking-flow derivation ────────────────────────────────────────
  const isOnRequestRate = payload?.rateRow?.roomStatus === "On Request";
  // /api/day-stay-contract/rooms-search sends `nonRefundable` on the rate
  // row (RateOptionResponse). Fall back to `!refundable` for the
  // client-side transform path in DayStayRoomList.
  const isNonRefundableRate =
    payload?.rateRow?.nonRefundable === true ||
    (payload?.rateRow?.nonRefundable === undefined &&
      payload?.rateRow?.refundable === false);
  // Cancellation deadline computed EXACTLY like the backend stores it:
  //   deadline = checkInDate − maxCancellationNights, at midnight.
  // Null until maxCancellationNights resolves or when there's no check-in
  // date to key off. The deadline-dependent flags below fall back to
  // safe "no deadline applies" behaviour while this is null.
  const cancellationDeadline = useMemo(() => {
    if (maxCancellationNights == null) return null;
    const cinRaw = payload?.checkInDate;
    if (!cinRaw) return null;
    const cin = new Date(cinRaw);
    if (isNaN(cin.getTime())) return null;
    const d = new Date(cin);
    d.setDate(d.getDate() - maxCancellationNights);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [maxCancellationNights, payload]);
  const isOutsideDeadline = useMemo(() => {
    if (!cancellationDeadline) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today > cancellationDeadline;
  }, [cancellationDeadline]);

  // ── Payment-mode scenario derivation (mirrors HotelBookingPage) ────────
  // bookingSellingPrice = the AED total the agent owes for this booking
  // (same amount /api/day-stay-booking/save debits and the credit
  // pre-check uses).
  const bookingSellingPrice = useMemo(() => {
    return (rooms || []).reduce(
      (s, r) => s + Number(r?.rate || 0),
      0,
    );
  }, [rooms]);

  // Client-side "sufficient credit" flag — null while balance is loading
  // so the UI doesn't flash the wrong scenario on first render.
  const hasSufficientCredit = useMemo(() => {
    if (agentAvailableBalance == null) return null;
    return Number(agentAvailableBalance) >= bookingSellingPrice;
  }, [agentAvailableBalance, bookingSellingPrice]);

  // Scenario 3 — insufficient credit AND per-agent Card payment disabled.
  const noPaymentPathAvailable =
    hasSufficientCredit === false && !agentCardPaymentEnabled;

  // ── Payment Mode availability — three scenarios (mirrors HotelBookingPage):
  //   1. Sufficient credit                    → Credit Limit only (Card hidden)
  //   2. Insufficient credit + Card enabled   → Card only (+ note below)
  //   3. Insufficient credit + Card disabled  → no options; booking blocked
  // While the credit balance is still loading (hasSufficientCredit == null),
  // fall back to Credit Limit so nothing flashes empty.
  const paymentModeOptions = useMemo(() => {
    if (hasSufficientCredit === true) {
      return [{ value: "CREDITLIMIT", label: "Credit Limit" }];
    }
    if (hasSufficientCredit === false && agentCardPaymentEnabled) {
      return [{ value: "CARD", label: "Card" }];
    }
    if (hasSufficientCredit === false && !agentCardPaymentEnabled) {
      return [];
    }
    return [{ value: "CREDITLIMIT", label: "Credit Limit" }];
  }, [hasSufficientCredit, agentCardPaymentEnabled]);

  // Keep the selected Payment Mode valid — auto-select the first
  // remaining option when the current selection drops out. Empty
  // options (scenario 3) is a no-op.
  useEffect(() => {
    if (paymentModeOptions.length === 0) return;
    if (!paymentModeOptions.some((o) => o.value === paymentMode)) {
      setPaymentMode(paymentModeOptions[0].value);
    }
  }, [paymentModeOptions, paymentMode]);

  // Post-payment resume — mirrors HotelBookingPage. Two entry paths land
  // here after the "Select Payment Gateway" modal:
  //
  //   • Dummy gateway (local /payment/:gateway page): returns with
  //     location.state.resumeCreate = true. React state (rooms /
  //     pendingPayload) is lost across the /payment detour, so we
  //     rebuild the create call purely from the payload persisted
  //     under "dayStayPendingCreatePayload" just before navigating
  //     away. Kept for parity with HotelBookingPage — no gateway
  //     currently routes through it because CCAvenue is the only
  //     PAYMENT_GATEWAYS entry.
  //   • CC Avenue: a real cross-domain browser navigation, so React
  //     Router state never survives it. The backend appends
  //     ?ccavenueOrderId=&ccavenueStatus= to this URL when it 302s the
  //     browser back. The status query param is only a hint — before
  //     finalising anything we re-verify it against
  //     GET /api/payment/ccavenue/status/{orderId} (backend-decrypted),
  //     then POST /api/payment/ccavenue/finalize-daystay/{orderId}
  //     which idempotently replays the payload the backend persisted
  //     at /initiate time. sessionStorage isn't the source of truth
  //     for this path — the backend already has the payload.
  //
  // On success both paths land on the Day Stay Booking LIST — same
  // landing as the direct-credit-limit confirmBooking() success path,
  // so the operator can always find the row there.
  //
  // Guards:
  //   • Both signals (resumeCreate + ccavenueOrderId) are stripped
  //     from history immediately so a reload / back doesn't re-fire.
  //   • sessionStorage is cleared right after read (dummy) / on
  //     success (CCAvenue) so a stray landing on this URL with a
  //     stale flag can't replay an old payload.
  //   • The credit-check step in confirmBooking() is skipped here —
  //     the operator has already paid via the gateway.
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const ccavenueOrderId = searchParams.get("ccavenueOrderId");
    const ccavenueStatus = searchParams.get("ccavenueStatus");

    const resumeFromState = !!location.state?.resumeCreate;
    const resumeFromCCAvenue = !!ccavenueOrderId;
    if (!resumeFromState && !resumeFromCCAvenue) return;

    // Strip the resume signal from history right away so remounts /
    // reloads don't re-trigger. Do it before the async work so a fast
    // re-render can't race the effect.
    navigate(location.pathname, { replace: true, state: {} });

    const readPendingPayload = () => {
      const stored = sessionStorage.getItem("dayStayPendingCreatePayload");
      sessionStorage.removeItem("dayStayPendingCreatePayload");
      if (!stored) return null;
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error("Malformed persisted day-stay create payload", e);
        return null;
      }
    };

    // Dummy-gateway (local /payment/:gateway) path only. Real CC Avenue
    // uses finalizeAfterCCAvenue below, which asks the backend to create
    // the booking from the payload it persisted at /initiate time —
    // sessionStorage isn't the source of truth there.
    const finalizeDummyCreate = async (payload) => {
      try {
        setIsSubmitting(true);
        const response = await axiosInstance.post(
          "/api/day-stay-booking/save",
          payload,
        );
        const bookingResponse = response.data;
        const responseId = Number(bookingResponse?.id);
        const succeeded =
          bookingResponse &&
          bookingResponse.bookingCode &&
          Number.isFinite(responseId) &&
          responseId > 0;
        if (succeeded) {
          setSavedBooking(bookingResponse);
          setShowConfirmModal(false);
          sessionStorage.removeItem("dayStayBookingPayload");
          toast.success(
            bookingResponse.message ||
              `Booking ${bookingResponse.bookingCode} created after payment.`,
          );
          navigate("/booking-details/day-stay-booking-list");
        } else {
          const beMsg =
            (bookingResponse && bookingResponse.message) || null;
          toast.error(beMsg || "Booking submission failed. Please try again.");
        }
      } catch (err) {
        const beMsg =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          null;
        console.error("Error finalising day-stay booking after payment:", err);
        toast.error(beMsg || "Booking submission failed. Please try again.");
      } finally {
        setIsSubmitting(false);
      }
    };

    // Real CC Avenue path — the backend owns the payload and the create
    // call. We just ask it to finalize. Idempotent: a second call for the
    // same orderId returns the already-created booking, so a StrictMode
    // double-fire or an operator refresh cannot double-book.
    const finalizeAfterCCAvenue = async () => {
      try {
        setIsFinalizingPayment(true);
        setIsSubmitting(true);
        const response = await axiosInstance.post(
          `/api/payment/ccavenue/finalize-daystay/${ccavenueOrderId}`,
        );
        const bookingResponse = response.data;
        const responseId = Number(bookingResponse?.id);
        const succeeded =
          bookingResponse &&
          bookingResponse.bookingCode &&
          Number.isFinite(responseId) &&
          responseId > 0;
        if (succeeded) {
          setSavedBooking(bookingResponse);
          setShowConfirmModal(false);
          // Payload is no longer needed — the backend has it and has now
          // used it. Clear stale state so a later reload can't confuse
          // this flow with a fresh booking.
          sessionStorage.removeItem("dayStayBookingPayload");
          sessionStorage.removeItem("dayStayPendingCreatePayload");
          toast.success(
            bookingResponse.message ||
              `Booking ${bookingResponse.bookingCode} created after payment.`,
          );
          navigate("/booking-details/day-stay-booking-list");
        } else {
          const beMsg = (bookingResponse && bookingResponse.message) || null;
          toast.error(
            beMsg ||
              "Payment succeeded but booking could not be created. Please contact support with your payment reference.",
          );
        }
      } catch (err) {
        const beMsg =
          err?.response?.data?.message || err?.response?.data?.error || null;
        console.error("Post-payment day-stay finalize failed:", err);
        toast.error(
          beMsg ||
            "Payment succeeded but booking could not be created. Please contact support with your payment reference.",
        );
      } finally {
        setIsSubmitting(false);
        setIsFinalizingPayment(false);
      }
    };

    if (resumeFromState) {
      // Dummy-gateway path — payment "succeeded" locally, go straight to
      // create using the persisted payload.
      const payload = readPendingPayload();
      if (!payload) return;
      finalizeDummyCreate(payload);
      return;
    }

    // CC Avenue path — verify server-side, then let the backend finalize.
    (async () => {
      if (ccavenueStatus !== "success") {
        toast.error("Payment was not completed. Please try again.");
        sessionStorage.removeItem("dayStayPendingCreatePayload");
        return;
      }
      try {
        const statusResponse = await axiosInstance.get(
          `/api/payment/ccavenue/status/${ccavenueOrderId}`,
        );
        if (statusResponse.data?.status !== "SUCCESS") {
          toast.error(
            statusResponse.data?.statusMessage ||
              "Payment was not successful. Please try again.",
          );
          sessionStorage.removeItem("dayStayPendingCreatePayload");
          return;
        }
      } catch (err) {
        console.error("Could not verify CC Avenue payment status:", err);
        toast.error(
          "Could not verify payment status. Please contact support if you were charged.",
        );
        return;
      }
      // Payment is confirmed — ask the backend to create the booking from
      // the payload it stored at /initiate. Safe to retry (idempotent), so
      // sessionStorage is intentionally NOT cleared until success below.
      finalizeAfterCCAvenue();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.resumeCreate, location.search]);

  // Warn on close / navigate-away while the paid-for booking is still
  // being created server-side. Only attached during that window so it
  // never fires on the normal flow. Mirrors HotelBookingPage.
  useEffect(() => {
    if (!isFinalizingPayment) return;
    const beforeUnload = (e) => {
      e.preventDefault();
      // Legacy browsers require the returnValue; modern ones just need
      // preventDefault. The actual message shown is browser-defined.
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [isFinalizingPayment]);

  // Voucher choice visibility — mirrors HotelBookingPage exactly:
  //   • today ≤ deadline  → offer the choice (Voucher Later means the
  //     booking auto-cancels on the deadline if it's not re-confirmed).
  //   • today > deadline  → hide (Voucher Later would auto-cancel now).
  // On-request and non-refundable flows never show the choice.
  const showVoucherChoice =
    !isOnRequestRate &&
    !isNonRefundableRate &&
    !!cancellationDeadline &&
    !isOutsideDeadline;

  // Resolved status the booking should land on — same flowchart as
  // HotelBookingPage's `resolvedBookingFlowStatus`.
  const resolvedBookingFlowStatus = (() => {
    if (isOnRequestRate) return "REQUESTED";
    if (isNonRefundableRate) return "RECONFIRMED";
    // Deadline already passed → force "Book Now Voucher Now" → RECONFIRMED.
    if (isOutsideDeadline) return "RECONFIRMED";
    return bookingConfirmation === "Book Now & Voucher later"
      ? "CONFIRMED"
      : "RECONFIRMED";
  })();

  // Reset bookingConfirmation whenever the choice no longer applies.
  useEffect(() => {
    if (!payload) return;
    if (!showVoucherChoice && bookingConfirmation !== "Book & Voucher") {
      setBookingConfirmation("Book & Voucher");
    }
    if (!showVoucherChoice && voucherChoiceMade) {
      setVoucherChoiceMade(false);
      setVoucherChoiceError(false);
    }
  }, [payload, bookingConfirmation, showVoucherChoice, voucherChoiceMade]);

  // Refund status badge — same as HotelBookingPage.
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

  // ── Data load — sessionStorage.dayStayBookingPayload ───────────────
  useEffect(() => {
    const raw = sessionStorage.getItem("dayStayBookingPayload");
    if (!raw) return;
    try {
      const p = JSON.parse(raw);
      setPayload(p);

      // Pre-seed the primary-guest nativeCountry from the nationality
      // chosen on the search page (kept for downstream compatibility;
      // the visible Primary Guest card is hidden).
      if (p.nationality || p.nationalityLabel) {
        setPrimaryGuest((prev) => ({
          ...prev,
          nativeCountry: p.nationalityLabel || p.nationality || "",
        }));
      }

      // Build the per-room guest array. Day-stay uses ONE rate row for
      // every booked room (contract-configured), so all rooms carry the
      // same category + meal plan + rate. Adults / children are split as
      // evenly as possible with any remainder loaded onto the last room.
      const adultsTotal = Number(p.adults || 1);
      const childrenTotal = Number(p.children || 0);
      const noOfRooms = Math.max(1, Number(p.rooms || 1));
      const perRoomAdults = Math.max(1, Math.floor(adultsTotal / noOfRooms));
      const perRoomChildren = Math.floor(childrenTotal / noOfRooms);
      const ages = Array.isArray(p.childAges) ? p.childAges : [];
      let agePtr = 0;

      // Rate + labels — day-stay stores the picked rate on p.rateRow.
      const rateRow = p.rateRow || {};
      const roomCategoryLabel =
        rateRow.roomCategoryName ||
        rateRow.roomCategory ||
        p.roomCategory ||
        "Day Stay Room";
      const mealPlanLabel =
        rateRow.mealPlan || rateRow.roomTypeName || "Room Only";
      const nonRefundable = rateRow.refundable === false;
      const perRoomRate = Number(
        p.dayStayRate ??
          p.perRoomRate ??
          rateRow.rate ??
          rateRow.totalRate ??
          0,
      );

      const initRooms = [];
      for (let i = 0; i < noOfRooms; i++) {
        const aRoom =
          i === noOfRooms - 1
            ? adultsTotal - perRoomAdults * (noOfRooms - 1)
            : perRoomAdults;
        const cRoom =
          i === noOfRooms - 1
            ? childrenTotal - perRoomChildren * (noOfRooms - 1)
            : perRoomChildren;
        const guests = [];
        for (let g = 0; g < aRoom; g++) {
          guests.push({
            salutation: "",
            firstName: "",
            middleName: "",
            lastName: "",
            gender: "",
            isChild: false,
          });
        }
        for (let g = 0; g < cRoom; g++) {
          guests.push({
            salutation: "",
            firstName: "",
            middleName: "",
            lastName: "",
            gender: "",
            isChild: true,
            age: ages[agePtr] != null ? ages[agePtr] : null,
          });
          agePtr++;
        }
        initRooms.push({
          roomNo: i + 1,
          roomCategory: roomCategoryLabel,
          mealPlan: mealPlanLabel,
          nonRefundable,
          currency: "AED",
          rate: perRoomRate,
          rateWithoutMarkup: perRoomRate,
          adults: aRoom,
          children: cRoom,
          childAges: ages.slice(0, cRoom),
          guests,
        });
      }
      setRooms(initRooms);
    } catch (err) {
      console.error("Failed to parse dayStayBookingPayload", err);
    }
  }, []);

  // ── Max cancellation nights — same endpoint HotelBookingPage uses.
  // Deadline = checkInDate − maxCancellationNights (see the memo above),
  // matching what the backend stores and what the Booking List shows.
  useEffect(() => {
    const hotelId = payload?.hotelId;
    if (!hotelId) {
      setMaxCancellationNights(null);
      return;
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
        if (!cancelled) setMaxCancellationNights(null);
      });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  // ── Agent credit fetch — same endpoint + gating as HotelBookingPage.
  useEffect(() => {
    const aId = payload?.agentId;
    if (!aId) {
      setAgentAvailableBalance(null);
      setAgentHasAvailableCredit(null);
      return;
    }
    let cancelled = false;
    axiosInstance
      .get(`/api/agent-credit-limit/agent/${aId}`)
      .then((res) => {
        if (cancelled) return;
        setAgentAvailableBalance(res?.data?.availableCreditLimit ?? null);
        const available = Number(res?.data?.availableCreditLimit ?? 0);
        setAgentHasAvailableCredit(
          Number.isFinite(available) && available > 0,
        );
      })
      .catch(() => {
        if (cancelled) return;
        setAgentAvailableBalance(null);
        // 404 (no credit-limit row) → treat as Cash Agent.
        setAgentHasAvailableCredit(false);
      });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  // ── Agent card-payment flag — same gate as HotelBookingPage. Drives
  //    the no-payment-path block when credit is short (see
  //    confirmBooking). Fail-safe default: card DISABLED.
  useEffect(() => {
    const aId = payload?.agentId;
    if (!aId) {
      setAgentCardPaymentEnabled(false);
      return;
    }
    let cancelled = false;
    axiosInstance
      .get(`/api/agent/${aId}`)
      .then((res) => {
        if (!cancelled) {
          setAgentCardPaymentEnabled(!!res?.data?.cardPaymentEnabled);
        }
      })
      .catch(() => {
        if (!cancelled) setAgentCardPaymentEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  // ── Handlers ───────────────────────────────────────────────────────
  const handleGuestChange = (roomIndex, guestIndex, field, value) => {
    setRooms((prev) => {
      const next = [...prev];
      next[roomIndex] = {
        ...next[roomIndex],
        guests: next[roomIndex].guests.map((g, i) =>
          i === guestIndex ? { ...g, [field]: value } : g,
        ),
      };
      return next;
    });
    // Auto-populate primary guest from Room 1 / Guest 1 name fields —
    // mirrors HotelBookingPage so the derived Lead Passenger stays in
    // sync when the user types.
    if (
      roomIndex === 0 &&
      guestIndex === 0 &&
      ["salutation", "firstName", "lastName"].includes(field)
    ) {
      setPrimaryGuest((p) => ({ ...p, [field]: value }));
    }
    const guestKey = `room_${roomIndex}_guest_${guestIndex}_${field}`;
    setValidationErrors((errs) => {
      const n = { ...errs };
      delete n[guestKey];
      delete n[field];
      return n;
    });
  };

  const handleSpecialRequestToggle = (request) => {
    setSpecialRequests((prev) =>
      prev.includes(request)
        ? prev.filter((x) => x !== request)
        : [...prev, request],
    );
  };

  // ── Validation ─────────────────────────────────────────────────────
  const validateForm = () => {
    const errors = {};
    let hasErrors = false;
    rooms.forEach((room, roomIndex) => {
      room.guests.forEach((guest, guestIndex) => {
        const key = `room_${roomIndex}_guest_${guestIndex}`;
        if (!guest.salutation || guest.salutation.trim() === "") {
          errors[`${key}_salutation`] = "Salutation is required";
          hasErrors = true;
        }
        if (!guest.firstName || guest.firstName.trim() === "") {
          errors[`${key}_firstName`] = "First Name is required";
          hasErrors = true;
        }
        if (!guest.lastName || guest.lastName.trim() === "") {
          errors[`${key}_lastName`] = "Last Name is required";
          hasErrors = true;
        }
      });
    });
    return { errors, hasErrors };
  };

  // Step 1: validate → fetch policies + T&C → show consent modal.
  // Day-stay adds the CONTRACT's cancellation + T&C alongside the
  // hotel-level Amendment / Child / T&C — same structural layout as
  // HotelBookingPage, just enriched with the contract's inline lists.
  const openPolicyConsent = async () => {
    // Scenario 3 guard — no viable payment path (no credit AND Card
    // disabled). Bail out before validation so a form-submit via
    // Enter key can't sneak past the disabled Confirm Booking button.
    if (noPaymentPathAvailable) {
      toast.error(
        "Booking cannot be completed — no payment method available for this agent.",
      );
      return;
    }
    const { errors, hasErrors } = validateForm();
    if (hasErrors) {
      setValidationErrors(errors);
      toast.error("Please fill in all required fields correctly.");
      return;
    }
    setValidationErrors({});

    // When the Voucher Now / Voucher Later card is offered, the user
    // must explicitly pick one — nothing is pre-selected. Mirrors
    // HotelBookingPage's openPolicyConsent gate.
    if (showVoucherChoice && !voucherChoiceMade) {
      setVoucherChoiceError(true);
      toast.error("Please select a booking option to continue.");
      return;
    }

    const hotelId = payload?.hotelId;
    setPolicyAccepted(false);
    setShowPolicyModal(true);
    setPoliciesLoading(true);
    try {
      // Backend path variable is Long — skip non-numeric ids gracefully.
      const canFetch = hotelId != null && /^\d+$/.test(String(hotelId));
      if (!canFetch) {
        setPolicyData(null);
        setHotelTermsAndConditions("");
        return;
      }
      const [policiesRes, termsRes] = await Promise.allSettled([
        axiosInstance.get(`/api/hotels/${hotelId}/policies`),
        axiosInstance.get(`/api/hotels/${hotelId}/terms-and-conditions`),
      ]);
      if (policiesRes.status === "fulfilled") {
        setPolicyData(policiesRes.value?.data || null);
      } else {
        setPolicyData(null);
      }
      if (termsRes.status === "fulfilled") {
        const d = termsRes.value?.data;
        // Same shape-flex logic as HotelBookingPage.
        let tc = "";
        if (Array.isArray(d)) {
          tc = d
            .map((row) =>
              typeof row === "string" ? row : row?.description || "",
            )
            .filter(Boolean)
            .join("\n\n");
        } else if (typeof d === "string") {
          tc = d;
        } else {
          tc =
            d?.termsAndConditions ||
            d?.terms ||
            d?.data ||
            d?.message ||
            "";
        }
        setHotelTermsAndConditions(tc);
      } else {
        setHotelTermsAndConditions("");
      }
    } catch (err) {
      console.error("policies/T&C fetch error", err);
    } finally {
      setPoliciesLoading(false);
    }
  };

  // Step 2: user accepted policies → build payload + show order summary.
  const handleSubmit = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const { errors, hasErrors } = validateForm();
    if (hasErrors) {
      setValidationErrors(errors);
      toast.error("Please fill in all required fields correctly.");
      return;
    }
    setValidationErrors({});
    try {
      setIsSubmitting(true);

      const rateRow = payload?.rateRow || {};
      const perRoomFinal = rooms[0]?.rate ?? 0;
      const totalAmount = rooms.reduce((s, r) => s + Number(r.rate || 0), 0);
      const totalAdults = rooms.reduce((s, r) => s + Number(r.adults || 0), 0);
      const totalChildren = rooms.reduce(
        (s, r) => s + Number(r.children || 0),
        0,
      );

      // Same primaryGuest derivation as HotelBookingPage — driven by
      // the Lead-marked guest so the visible card can stay hidden.
      const leadGuest =
        rooms?.[leadIndex.roomIdx]?.guests?.[leadIndex.guestIdx] || {};
      const primaryGuestPayload = {
        salutation: leadGuest.salutation || "",
        firstName: leadGuest.firstName || "",
        middleName: leadGuest.middleName || "",
        lastName: leadGuest.lastName || "",
        email: "",
        phone: "",
        passportNo: "",
        agentLpo: "",
        nativeCountry: payload?.nationalityLabel || payload?.nationality || "",
      };

      const built = {
        // Core identifiers — /api/day-stay-booking/save contract.
        hotelId: payload.hotelId,
        hotelName: payload.hotelName,
        address: payload.hotelAddress || "",
        starRating: payload.starRating || null,
        agentId: Number(payload.agentId) || null,
        // "Booking Done By Employee" — picked on DayStaySearch.
        employeeId: payload.employeeId || null,
        // Day-stay is inhouse-only for now.
        apiId: null,
        contractId: payload.contractId,
        // Day-stay is same-day; check-out is on the same date.
        checkInDate: payload.checkInDate,
        checkOutDate: payload.checkInDate,
        checkInTime: payload.checkInTime,
        checkOutTime: payload.checkOutTime,
        // "Nights" on a day-stay is always 1 — mirrored on the payload so
        // downstream reporting has a stable value.
        nights: 1,
        nationality: payload.nationalityLabel || payload.nationality || null,
        nationalityCode: payload.nationality || null,
        childAges: payload.childAges || [],

        // Room status + refund status — copied to the payload so the
        // BE / reporting can key off them the same way HotelBookingPage
        // does (see confirm-booking flowchart).
        roomStatus: rateRow.roomStatus || "Available",
        cancellationPolicy: Array.isArray(payload.cancellationPolicies)
          ? payload.cancellationPolicies
          : [],
        termsAndConditions: Array.isArray(payload.termsAndConditions)
          ? payload.termsAndConditions
          : [],

        // deadlineDate — same shape as HotelBookingPage
        //   deadlineDate = checkInDate − maxCancellationNights, midnight,
        // formatted as a LocalDateTime string. Backend re-derives the
        // authoritative value on create; we send the matching computed
        // value so the payload is consistent with what's stored.
        deadlineDate: cancellationDeadline
          ? `${cancellationDeadline.getFullYear()}-${String(
              cancellationDeadline.getMonth() + 1,
            ).padStart(2, "0")}-${String(
              cancellationDeadline.getDate(),
            ).padStart(2, "0")}T00:00:00`
          : null,
        // Voucher decision — mirrors HotelBookingPage's flowchart.
        // Available rates: user's radio choice ("Voucher Now" → true,
        // "Voucher Later" → false). Anything else (on-request /
        // non-refundable) resolves to false so the backend doesn't
        // stamp a premature voucher flag.
        isBookandVoucher: (() => {
          if (rateRow.roomStatus === "Available") {
            return bookingConfirmation === "Book & Voucher";
          }
          return false;
        })(),

        // Status the backend should persist on the booking row. Backend
        // defaults to "CONFIRMED" when omitted; we send an explicit
        // value derived from resolvedBookingFlowStatus so on-request
        // day-stay bookings land as "NOT CONFIRMED" the way the engine
        // expects. Voucher-Later refundable bookings stay "CONFIRMED"
        // — they get re-confirmed / auto-cancelled by the deadline
        // process (same semantics as HotelBookingPage's Case 5).
        status:
          resolvedBookingFlowStatus === "REQUESTED"
            ? "NOT CONFIRMED"
            : "CONFIRMED",

        totalAdults,
        totalChildren,
        noOfRooms: rooms.length,
        totalAmount,

        // Lead / Primary guest — derived from Lead-marked guest.
        primaryGuest: primaryGuestPayload,

        // Rooms with per-guest details + isLead flag.
        rooms: rooms.map((room, roomIndex) => ({
          roomNo: room.roomNo ?? roomIndex + 1,
          roomCategory: room.roomCategory,
          mealPlan: room.mealPlan,
          nonRefundable: room.nonRefundable === true,
          currency: room.currency || "AED",
          rate: room.rate,
          rateWithoutMarkup: room.rateWithoutMarkup,
          adults: room.adults,
          children: room.children,
          childAges: room.childAges || [],
          guests: (room.guests || []).map((guest, gi) => ({
            salutation: guest.salutation,
            firstName: guest.firstName,
            middleName: guest.middleName || "",
            lastName: guest.lastName,
            gender: guest.gender || "",
            isChild: guest.isChild,
            // Per-guest child age (from the room's childAges list). Persisted
            // and shown on the detail view + voucher. Null for adults.
            childAge: guest.isChild
              ? room.childAges?.[gi - room.adults] ?? null
              : null,
            isLead:
              roomIndex === leadIndex.roomIdx && gi === leadIndex.guestIdx,
          })),
        })),

        remarks: remarks || "",
        // Optional "Booking done for" free-text (admin-only field) → shown as
        // "Contact: <value>/<agentName>" on the detail view + voucher.
        bookingDoneFor: bookingDoneFor.trim() || null,
        specialRequests,
        // Location column in the detail view's Booking History. The IP
        // Address column is stamped server-side from the save request
        // (each system's own IPv4), so it is not sent here.
        bookingLocation: clientNetwork.bookingLocation,
        // Tourism dirhams isn't collected on day-stay yet but the field
        // is on the shape for parity with HotelBookingPage's payload.
        tourismDirhams: 0,

        bookingConfirmation: bookingConfirmation || "Book & Voucher",
        bookingFlowStatus: resolvedBookingFlowStatus,
        isOutsideDeadline,

        // Policy / T&C acceptance flags — the modal above the confirm
        // step gates these to true.
        policyAccepted: true,
        acceptedTermsAndConditions: true,
        acceptedCancellationPolicies: true,

        // Amendment link handoff (Edit → Search → Book Again for a
        // parent hotel booking). Preserved from the current impl.
        parentBookingCode: payload.parentBookingCode || null,

        // Currency parity with HotelBookingPage. Day-stay only supports
        // AED today; the fields are populated so future work can flip
        // them to the operator-selected display currency.
        displayCurrencyCode: "AED",
        displayCurrencyRate: 1,
      };

      setPendingPayload(built);
      setShowConfirmModal(true);
    } catch (err) {
      console.error("day-stay booking payload error", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirm + post — mirrors HotelBookingPage.confirmBooking including
  // the insufficient-credit branch that opens the online-payment modal.
  const confirmBooking = async () => {
    if (!pendingPayload) return;
    setIsSubmitting(true);
    try {
      // Credit check — same endpoint as HotelBookingPage.
      const agentId = pendingPayload.agentId;
      const requiredAmount = Number(pendingPayload.totalAmount || 0);

      if (agentId) {
        try {
          const creditResponse = await axiosInstance.get(
            `/api/agent-credit-limit/check-sufficient-credit?agentId=${agentId}&requiredAmount=${requiredAmount}`,
          );
          if (creditResponse.data === false) {
            // Bypass rules — same three sub-paths HotelBookingPage
            // observes so the online-payment popup only appears when
            // the booking really needs an online payment upfront:
            //
            //   • Book Now & Voucher LATER → let the create call proceed.
            //     Backend keeps the booking Confirmed WITHOUT touching
            //     the agent's credit; the deduction is deferred to the
            //     Reconfirm step.
            //   • On Request rate → booking is created "Not Confirmed"
            //     pending the supplier's response. No credit is touched
            //     at create-time on the BE, so gating creation on an
            //     online payment would block a valid request flow.
            //   • Everything else → surface the same insufficient-credit
            //     modal HotelBookingPage uses.
            const isVoucherLater =
              bookingConfirmation === "Book Now & Voucher later";
            const bypassPaymentModal = isVoucherLater || isOnRequestRate;
            if (!bypassPaymentModal) {
              setInsufficientAmount(requiredAmount);
              setShowConfirmModal(false);
              // Card disabled at the agent level → there's no viable
              // payment path (no credit AND no card). Block the booking
              // with the dedicated "Booking Cannot Be Completed" modal
              // instead of the online-payment popup the agent can't use.
              // Mirrors HotelBookingPage's create-flow gate.
              if (!agentCardPaymentEnabled) {
                setShowNoPaymentPathModal(true);
                return;
              }
              setShowInsufficientModal(true);
              return;
            }
            console.log(
              isOnRequestRate
                ? "[DAYSTAY] Insufficient credit but On Request rate — proceeding with create."
                : "[DAYSTAY] Insufficient credit but Voucher Later selected — proceeding with create; credit deducted at Reconfirm.",
            );
          }
        } catch (err) {
          // Credit endpoint failure shouldn't gate the booking — just
          // log and continue (same as HotelBookingPage's fall-through).
          console.warn("credit check failed", err);
        }
      }

      const response = await axiosInstance.post(
        "/api/day-stay-booking/save",
        { ...pendingPayload, paymentMode },
      );

      const bookingResponse = response.data;
      // Success check — mirrors HotelBookingPage but keyed on the
      // fields the day-stay endpoint returns (bookingCode + id +
      // status). Backend defaults status to "CONFIRMED" and stamps
      // "NOT CONFIRMED" for the on-request flow, so we accept either.
      const responseStatus =
        bookingResponse?.status ||
        bookingResponse?.confirmationStatus ||
        "";
      const responseId = Number(bookingResponse?.id);
      const statusUpper =
        typeof responseStatus === "string"
          ? responseStatus.toUpperCase()
          : "";
      const succeeded =
        bookingResponse &&
        bookingResponse.bookingCode &&
        (statusUpper === "CONFIRMED" ||
          statusUpper === "NOT CONFIRMED" ||
          statusUpper === "REQUESTED" ||
          statusUpper === "") &&
        Number.isFinite(responseId) &&
        responseId > 0;
      if (succeeded) {
        setSavedBooking(bookingResponse);
        setShowConfirmModal(false);
        sessionStorage.removeItem("dayStayBookingPayload");
        toast.success(
          bookingResponse.message || "Day Stay booking confirmed",
        );
        // Amendment / "Add New Item" flow — link back to the parent
        // hotel booking and land on its detail page. Preserved from the
        // current impl.
        if (payload?.parentBookingCode) {
          const parentId = await createAmendmentLink({
            parentBookingCode: payload.parentBookingCode,
            childType: "DAY_STAY",
            childTypeLabel: "Day Stay",
            childBookingId: bookingResponse.id,
            childBookingCode: bookingResponse.bookingCode,
            childDetailRoutePrefix: "/booking-details/day-stay-booking/",
            childReferenceNumber:
              bookingResponse.referenceNumber || bookingResponse.bookingCode,
            childStatus:
              bookingResponse.confirmationStatus ||
              bookingResponse.status ||
              "Confirmed",
            childHotelName: payload.hotelName,
            childCheckInDate: payload.checkInDate,
            childCheckOutDate: payload.checkInDate,
            childTotalRate: pendingPayload.totalAmount,
            childGuestName: `${pendingPayload.primaryGuest?.firstName || ""} ${
              pendingPayload.primaryGuest?.lastName || ""
            }`.trim(),
          });
          if (parentId) {
            navigate(`/booking-details/hotel-booking/${parentId}`);
            return;
          }
        }
        setTimeout(
          () => navigate("/booking-details/day-stay-booking-list"),
          800,
        );
      } else {
        const beMsg = (bookingResponse && bookingResponse.message) || null;
        toast.error(beMsg || "Booking submission failed. Please try again.");
      }
    } catch (err) {
      const beMsg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        null;
      console.error("day-stay booking submission error", err);
      toast.error(beMsg || "Booking submission failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Day-stay is AED-only today; the pattern matches HotelBookingPage so
  // switching to an operator-chosen display currency later only means
  // wiring `payload.currency` into these two vars.
  const displayCurrency = { code: "AED", factor: 1 };
  const formatPrice = (price) => {
    const converted = (Number(price) || 0) * displayCurrency.factor;
    return `${displayCurrency.code} ${converted.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  // Header + booking-summary "Check-in" line renders the actual date
  // AND the check-in window time — mirrors formatDateTime's "date +
  // time" shape used by HotelBookingPage.
  const formatCheckin = (dateStr, timeStr) => {
    if (!dateStr) return "—";
    const t = timeStr ? timeStr : "00:00";
    return formatDateTime(`${dateStr}T${t}`);
  };

  // ── Early returns ──────────────────────────────────────────────────
  if (!payload && !savedBooking) {
    return (
      <div className="min-vh-100 bg-light d-flex flex-column hotel-booking-container">
        <TopBar />
        <div className="d-flex flex-grow-1">
          <Sidebar />
          <main
            className="content-wrapper py-4 flex-grow-1"
            style={{ minWidth: 0, overflowX: "hidden" }}
          >
            <Container fluid="xl">
              <Card className="shadow-sm border-0">
                <Card.Body className="text-center text-muted py-5">
                  <h5>No booking in progress</h5>
                  <Button
                    className="mt-2"
                    onClick={() => navigate("/new-booking/day-stay")}
                  >
                    Go to Day Stay Search
                  </Button>
                </Card.Body>
              </Card>
            </Container>
          </main>
        </div>
      </div>
    );
  }

  if (savedBooking) {
    return (
      <div className="min-vh-100 bg-light d-flex flex-column hotel-booking-container">
        <TopBar />
        <div className="d-flex flex-grow-1">
          <Sidebar />
          <main
            className="content-wrapper py-4 flex-grow-1"
            style={{ minWidth: 0, overflowX: "hidden" }}
          >
            <Container fluid="xl">
              <Card className="shadow-sm border-0">
                <Card.Body className="text-center py-5">
                  <FaCheckCircle size={48} className="text-success mb-3" />
                  <h4>Day Stay Booking Confirmed</h4>
                  <p className="text-muted mb-2">
                    Reference: <strong>{savedBooking.bookingCode}</strong>
                  </p>
                  <Button
                    onClick={() =>
                      navigate("/booking-details/day-stay-booking-list")
                    }
                  >
                    Go to Booking List
                  </Button>
                </Card.Body>
              </Card>
            </Container>
          </main>
        </div>
      </div>
    );
  }

  const rateRow = payload?.rateRow || {};
  const perRoomRate = rooms[0]?.rate ?? 0;
  const totalPayable = rooms.reduce((s, r) => s + Number(r.rate || 0), 0);
  const windowStart = (rateRow.checkInStartTime || payload.checkInTime || "")
    .toString()
    .slice(0, 5);
  const windowEnd = (rateRow.checkInEndTime || payload.checkOutTime || "")
    .toString()
    .slice(0, 5);

  // ── Quotation PDF ─────────────────────────────────────────────────────
  // Quotes what this page shows: the Booking Summary (date, check-in window,
  // guests, meal plan) and Price Details (one line per room at its rate,
  // New Total). Cancellation wording mirrors the Policies modal.
  const buildDayStayQuotationPayload = () => {
    if (!payload || !rooms.length) return null;
    const toDisplay = (aed) =>
      Math.round((Number(aed) || 0) * displayCurrency.factor * 100) / 100;
    const describeGuests = (r) => {
      const adults = Number(r?.adults) || 0;
      const children = Number(r?.children) || 0;
      return `${adults} Adult${adults === 1 ? "" : "s"}${
        children ? `, ${children} Child${children === 1 ? "" : "ren"}` : ""
      }`;
    };

    const lead = rooms?.[leadIndex.roomIdx]?.guests?.[leadIndex.guestIdx];
    const leadNames = [lead?.firstName, lead?.middleName, lead?.lastName]
      .map((p) => (p ? String(p).trim() : ""))
      .filter(Boolean);
    const leadName = leadNames.length
      ? [lead?.salutation ? String(lead.salutation).trim() : "", ...leadNames]
          .filter(Boolean)
          .join(" ")
      : "";

    const cancellationPolicy = [];
    if (isNonRefundableRate) {
      cancellationPolicy.push(
        "Non-refundable - no refund will be provided if this booking is cancelled.",
        "100% cancellation charges apply from the time of booking.",
      );
    } else {
      if (cancellationDeadline) {
        cancellationPolicy.push(
          `Cancellation deadline: ${cancellationDeadline.toLocaleDateString(
            "en-GB",
            { day: "2-digit", month: "short", year: "numeric" },
          )}, 02:00 PM (UAE).`,
        );
      }
      (Array.isArray(payload.cancellationPolicies)
        ? payload.cancellationPolicies
        : []
      )
        .map((item) =>
          typeof item === "string" ? item : item?.policyText || "",
        )
        .filter((text) => text && String(text).trim())
        .forEach((text) => cancellationPolicy.push(String(text)));
    }

    return {
      bookingType: "DAY_STAY",
      agentId: Number(payload.agentId) || null,
      currency: displayCurrency.code,
      serviceName: payload.hotelName || "",
      serviceSubtitle: payload.hotelAddress || "",
      customerName: leadName || null,
      details: [
        {
          label: "Check-in",
          value: formatCheckin(payload.checkInDate, payload.checkInTime),
        },
        {
          label: "Check-out",
          value: formatCheckin(payload.checkInDate, payload.checkOutTime),
        },
        {
          label: "Check-in Window",
          value: windowStart && windowEnd ? `${windowStart} - ${windowEnd}` : "",
        },
        { label: "Rooms", value: String(rooms.length) },
        {
          label: "Guests",
          value: rooms
            .map((r) => `Room ${r.roomNo}: ${describeGuests(r)}`)
            .join("\n"),
        },
        { label: "Meal Plan", value: rooms[0]?.mealPlan || "Room Only" },
        {
          label: "Star Rating",
          value: payload.starRating ? `${payload.starRating} Star` : "",
        },
        {
          label: "Room Status",
          value:
            payload?.rateRow?.roomStatus || rooms[0]?.roomStatus || "Available",
        },
        {
          label: "Refund Status",
          value: isNonRefundableRate ? "Non-Refundable" : "Flexible",
        },
      ],
      priceItems: rooms.map((r) => ({
        description: `Room ${r.roomNo} - ${r.roomCategory || "Room"}`,
        details: [r.mealPlan, describeGuests(r), "Day stay"]
          .filter(Boolean)
          .join(", "),
        amount: toDisplay(r.rate),
      })),
      totalAmount: toDisplay(totalPayable),
      cancellationPolicy,
      notes: (Array.isArray(payload.termsAndConditions)
        ? payload.termsAndConditions
        : []
      )
        .map((item) =>
          typeof item === "string" ? item : item?.description || item?.text || "",
        )
        .filter((text) => text && String(text).trim())
        .map((text) => String(text)),
    };
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column hotel-booking-container">
      <TopBar />
      <div className="main-content">
        <Sidebar />
        <main className="content-wrapper py-4">
          <Container fluid="xl">
            {/* Day Stay route heading — UI only, mirrors the heading shown
                on /new-booking/day-stay once results arrive. */}
            <div className="hs-page-heading">
              <h3 className="hs-page-heading-title">Day Stay</h3>
            </div>
            {/* Agent Available Balance — top-right red strip. Same as
                HotelBookingPage. */}
            {agentAvailableBalance != null && (
              <div className="d-flex justify-content-end mb-2">
                <span
                  className="fw-bold"
                  style={{ color: "#dc3545", fontSize: "0.95rem" }}
                >
                  Available Balance: {Number(agentAvailableBalance).toFixed(2)}
                </span>
              </div>
            )}

            <Form
              onSubmit={(e) => {
                e.preventDefault();
                openPolicyConsent();
              }}
            >
              <Row className="g-3">
                <Col lg={8} className="hbp-left-col">
                  {/* ─── Guest Details ─── */}
                  <Card className="mb-2 shadow-sm border-0">
                    <Card.Header className="bg-light py-2">
                      <div className="d-flex align-items-center">
                        <Button
                          variant="outline-secondary"
                          size="sm"
                          onClick={() => navigate(-1)}
                          className="me-3"
                        >
                          ← Back
                        </Button>
                        <h6 className="mb-0 fw-bold text-dark">
                          Guest Details
                        </h6>
                      </div>
                    </Card.Header>
                    <Card.Body className="p-0">
                      <Accordion
                        alwaysOpen
                        defaultActiveKey={rooms.map((_, i) => i.toString())}
                        className="guest-details-accordion"
                      >
                       
                        {rooms.map((room, roomIndex) => {
                          // Per-slot refund deadline label — mirrors
                          // HotelBookingPage's slotRefundDeadlineLabel.
                          // Only visible for refundable rates when the
                          // deadline is computed; formatted as
                          // "DD MMM YYYY" (en-GB).
                          const slotNonRefundable = room.nonRefundable === true;
                          const slotRefundDeadlineLabel =
                            !slotNonRefundable && cancellationDeadline
                              ? `${cancellationDeadline.toLocaleDateString(
                                  "en-GB",
                                  {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  },
                                )}, 02:00 PM (UAE)`
                              : null;
                          return (
                          <Accordion.Item
                            key={roomIndex}
                            eventKey={roomIndex.toString()}
                            className="mb-3 guest-room-item"
                          >
                            <Accordion.Header className="bg-primary text-white">
                              <h6 className="mb-0 fw-bold w-100 d-flex flex-wrap align-items-center gap-2">
                                <span>
                                  Room {room.roomNo} - {room.roomCategory}
                                </span>
                                {room.mealPlan && (
                                  <Badge
                                    bg="light"
                                    text="dark"
                                    className="ms-2"
                                  >
                                    <FaUtensils className="me-1" />
                                    {room.mealPlan}
                                  </Badge>
                                )}
                                {windowStart && windowEnd && (
                                  <span
                                    className="ms-2 small fw-normal"
                                    style={{ opacity: 0.9 }}
                                  >
                                    | Window: {windowStart} – {windowEnd}
                                  </span>
                                )}
                                {slotRefundDeadlineLabel && (
                                  <span
                                    className="ms-2 small fw-normal"
                                    style={{ opacity: 0.9 }}
                                  >
                                    | Deadline: {slotRefundDeadlineLabel}
                                    {isOutsideDeadline && (
                                      <Badge
                                        bg="danger"
                                        className="ms-2"
                                        style={{ fontSize: "0.65rem" }}
                                      >
                                        Passed
                                      </Badge>
                                    )}
                                  </span>
                                )}
                              </h6>
                            </Accordion.Header>
                            <Accordion.Body className="p-3">
                              <Row className="fw-semibold small text-muted px-2 mb-1 d-none d-md-flex">
                                <Col md={2}>Passenger</Col>
                                <Col md={2}>Title *</Col>
                                <Col md={3}>First Name *</Col>
                                <Col md={3}>Surname *</Col>
                                <Col md={2} className="text-center">
                                  Lead
                                </Col>
                              </Row>
                              {room.guests.map((guest, guestIndex) => {
                                const isLead =
                                  leadIndex.roomIdx === roomIndex &&
                                  leadIndex.guestIdx === guestIndex;
                                const passengerLabel = guest.isChild
                                  ? `Child ${
                                      guestIndex - room.adults + 1
                                    }${
                                      room.childAges?.[
                                        guestIndex - room.adults
                                      ] != null
                                        ? ` (Age: ${
                                            room.childAges[
                                              guestIndex - room.adults
                                            ]
                                          })`
                                        : ""
                                    }`
                                  : `Adult ${guestIndex + 1}`;
                                return (
                                  <div
                                    key={guestIndex}
                                    className="guest-row mb-2"
                                  >
                                    <Row className="align-items-center g-2">
                                      <Col md={2}>
                                        <span className="fw-semibold text-muted">
                                          {passengerLabel}
                                        </span>
                                      </Col>
                                      <Col md={2}>
                                        <Form.Select
                                          value={guest.salutation}
                                          onChange={(e) =>
                                            handleGuestChange(
                                              roomIndex,
                                              guestIndex,
                                              "salutation",
                                              e.target.value,
                                            )
                                          }
                                          className="form-control-sm"
                                          isInvalid={
                                            !!validationErrors[
                                              `room_${roomIndex}_guest_${guestIndex}_salutation`
                                            ]
                                          }
                                        >
                                          <option value="">SELECT</option>
                                          <option value="Mr">Mr</option>
                                          <option value="Mrs">Mrs</option>
                                          <option value="Ms">Miss</option>
                                          <option value="Ms">Ms</option>
                                          <option value="Dr">Master</option>
                                          <option value="Dr">Dr</option>
                                        </Form.Select>
                                        {validationErrors[
                                          `room_${roomIndex}_guest_${guestIndex}_salutation`
                                        ] && (
                                          <Form.Control.Feedback type="invalid">
                                            {
                                              validationErrors[
                                                `room_${roomIndex}_guest_${guestIndex}_salutation`
                                              ]
                                            }
                                          </Form.Control.Feedback>
                                        )}
                                      </Col>
                                      <Col md={3}>
                                        <Form.Control
                                          type="text"
                                          placeholder="First Name"
                                          value={guest.firstName}
                                          onChange={(e) =>
                                            handleGuestChange(
                                              roomIndex,
                                              guestIndex,
                                              "firstName",
                                              e.target.value,
                                            )
                                          }
                                          className="form-control-sm"
                                          isInvalid={
                                            !!validationErrors[
                                              `room_${roomIndex}_guest_${guestIndex}_firstName`
                                            ]
                                          }
                                        />
                                        {validationErrors[
                                          `room_${roomIndex}_guest_${guestIndex}_firstName`
                                        ] && (
                                          <Form.Control.Feedback type="invalid">
                                            {
                                              validationErrors[
                                                `room_${roomIndex}_guest_${guestIndex}_firstName`
                                              ]
                                            }
                                          </Form.Control.Feedback>
                                        )}
                                      </Col>
                                      <Col md={3}>
                                        <Form.Control
                                          type="text"
                                          placeholder="Surname"
                                          value={guest.lastName}
                                          onChange={(e) =>
                                            handleGuestChange(
                                              roomIndex,
                                              guestIndex,
                                              "lastName",
                                              e.target.value,
                                            )
                                          }
                                          className="form-control-sm"
                                          isInvalid={
                                            !!validationErrors[
                                              `room_${roomIndex}_guest_${guestIndex}_lastName`
                                            ]
                                          }
                                        />
                                        {validationErrors[
                                          `room_${roomIndex}_guest_${guestIndex}_lastName`
                                        ] && (
                                          <Form.Control.Feedback type="invalid">
                                            {
                                              validationErrors[
                                                `room_${roomIndex}_guest_${guestIndex}_lastName`
                                              ]
                                            }
                                          </Form.Control.Feedback>
                                        )}
                                      </Col>
                                      <Col
                                        md={2}
                                        className="text-center"
                                      >
                                        <Form.Check
                                          type="radio"
                                          name="ds-lead-guest"
                                          id={`ds-lead-${roomIndex}-${guestIndex}`}
                                          checked={isLead}
                                          disabled={guest.isChild}
                                          onChange={() =>
                                            handleLeadSelect(
                                              roomIndex,
                                              guestIndex,
                                            )
                                          }
                                          title={
                                            guest.isChild
                                              ? "Children cannot be the lead"
                                              : "Mark as Lead passenger"
                                          }
                                        />
                                      </Col>
                                    </Row>
                                  </div>
                                );
                              })}
                            </Accordion.Body>
                          </Accordion.Item>
                          );
                        })}
                      </Accordion>
                    </Card.Body>
                  </Card>

                  {/* ─── Special Requests ─── */}
                  <Card className="p-4 mb-2 shadow-sm border-0">
                    <h5 className="mb-3 fw-bold">Special Requests</h5>
                    <Row className="g-3">
                      {/* Booking Done For — optional free-text, ADMIN logins
                          only (hidden for all other logins). Persisted and
                          shown as "Contact: <value>/<agentName>" on the detail
                          view + voucher. */}
                      {isAdmin && (
                        <Col md={12}>
                          <Form.Group className="mb-2">
                            <Form.Label className="fw-semibold">
                              Booking Done For{" "}
                              <span className="text-muted small">(optional)</span>
                            </Form.Label>
                            <Form.Control
                              type="text"
                              value={bookingDoneFor}
                              onChange={(e) => setBookingDoneFor(e.target.value)}
                              placeholder="Name of the person this booking is done for"
                            />
                          </Form.Group>
                        </Col>
                      )}
                      <Col md={12}>
                        <Form.Group className="mb-3">
                          <div className="special-request-grid">
                            {SPECIAL_REQUEST_OPTIONS.map((request) => (
                              <Form.Check
                                key={request}
                                type="checkbox"
                                id={`special-request-${request.replace(
                                  /[^a-zA-Z0-9]/g,
                                  "-",
                                )}`}
                                label={request}
                                checked={specialRequests.includes(request)}
                                onChange={() =>
                                  handleSpecialRequestToggle(request)
                                }
                                className="mb-2 special-request-check"
                              />
                            ))}
                          </div>
                        </Form.Group>
                      </Col>
                    </Row>
                  </Card>

                  {/* ─── Payment Mode ─── Three-scenario UI (mirrors HotelBookingPage):
                        1. Sufficient credit           → Credit Limit only
                        2. No credit + Card enabled    → Card only + note
                        3. No credit + Card disabled   → hard block banner */}
                  <Card className="p-4 mb-2 shadow-sm border-0">
                    <h5 className="mb-3 fw-bold">Payment Mode</h5>
                    {paymentModeOptions.length > 0 ? (
                      <>
                        <Row className="g-3">
                          <Col md={6}>
                            <Form.Group>
                              <Form.Label className="fw-semibold mb-1">
                                Mode
                              </Form.Label>
                              <Form.Select
                                value={paymentMode}
                                onChange={(e) => setPaymentMode(e.target.value)}
                              >
                                {paymentModeOptions.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </Form.Select>
                            </Form.Group>
                          </Col>
                        </Row>
                        {hasSufficientCredit === false &&
                          agentCardPaymentEnabled && (
                            <div className="text-danger small mt-2 fw-semibold">
                              Insufficient credit. Pay with credit card before
                              time limit and reconfirm.
                            </div>
                          )}
                      </>
                    ) : (
                      <Alert variant="danger" className="mb-0">
                        You do not have sufficient credit limit, and online
                        card payment is not enabled for your account.
                        Therefore, this booking cannot be completed. Please
                        contact your account manager or administrator to
                        enable a payment method.
                      </Alert>
                    )}
                  </Card>
                </Col>

                {/* ─── Right sticky column — Booking Summary + Price ─── */}
                <Col lg={4} className="hbp-right-col">
                  <div className="hbp-sticky-summary">
                    <Card className="shadow-sm rounded-3 mb-3 booking-summary-card border-0 overflow-hidden">
                      <Card.Header className="bg-primary text-white py-2 rounded-top">
                        <h6 className="mb-0 d-flex align-items-center">
                          <FaHotel className="me-2" /> Booking Summary
                        </h6>
                      </Card.Header>
                      <Card.Body className="p-3">
                        <div className="mb-3">
                          <div className="fw-bold text-primary mb-1">
                            {payload.hotelName}
                          </div>
                          {payload.hotelAddress && (
                            <div className="text-muted small mb-2">
                              {payload.hotelAddress}
                            </div>
                          )}
                          <div className="d-flex flex-wrap align-items-center gap-2">
                            {payload.starRating ? (
                              <span className="badge bg-warning text-dark">
                                ⭐ {payload.starRating} Star
                              </span>
                            ) : null}
                            <Badge bg="info">Day Stay</Badge>
                            {getRefundStatusBadge(
                              isNonRefundableRate
                                ? "NON REFUNDABLE"
                                : "FLEXIBLE",
                            )}
                            {isOnRequestRate && (
                              <Badge bg="warning" text="dark">
                                On Request
                              </Badge>
                            )}
                            {windowStart && windowEnd && (
                              <Badge bg="light" text="dark" className="border">
                                <FaClock className="me-1" />
                                {windowStart} – {windowEnd}
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">
                            <FaCalendarAlt className="me-2 text-primary" />
                            Check-in
                          </div>
                          <div className="hbp-summary-value">
                            {formatCheckin(
                              payload.checkInDate,
                              payload.checkInTime,
                            )}
                          </div>
                        </div>
                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">
                            <FaCalendarAlt className="me-2 text-primary" />
                            Check-out
                          </div>
                          <div className="hbp-summary-value">
                            {formatCheckin(
                              payload.checkInDate,
                              payload.checkOutTime,
                            )}
                          </div>
                        </div>
                        <div className="hbp-summary-row align-items-start">
                          <div className="hbp-summary-label">
                            <FaUsers className="me-2 text-primary" />
                            Guests
                          </div>
                          <div className="hbp-summary-value text-end">
                            {rooms.map((room, i) => (
                              <div key={i} className="small">
                                Room {room.roomNo}: {room.adults} Adult
                                {room.adults > 1 ? "s" : ""}
                                {room.children
                                  ? `, ${room.children} Child${
                                      room.children > 1 ? "ren" : ""
                                    }`
                                  : ""}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">
                            <FaUtensils className="me-2 text-primary" />
                            Meal Plan
                          </div>
                          <div className="hbp-summary-value">
                            {rooms[0]?.mealPlan || "Room Only"}
                          </div>
                        </div>
                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">
                            <FaUtensils className="me-2 text-primary" />
                           Room Status
                          </div>
                          {/* Availability of the selected rate. The guest-rooms
                              state doesn't carry roomStatus — the rate row on
                              the search handoff payload is the source of truth
                              (same field isOnRequestRate derives from). */}
                          <div className="hbp-summary-value">
                            {payload?.rateRow?.roomStatus ||
                              rooms[0]?.roomStatus ||
                              "Available"}
                          </div>
                        </div>
                      </Card.Body>
                    </Card>

                    <Card className="shadow-sm rounded-3 border-0 hbp-price-card">
                      <Card.Header className="bg-light py-2">
                        <h6 className="mb-0 fw-bold">Price Details</h6>
                      </Card.Header>
                      <Card.Body className="p-3">
                        {rooms.map((r, i) => (
                          <div className="hbp-summary-row" key={i}>
                            <div className="hbp-summary-label">
                              Room {r.roomNo}
                            </div>
                            <div className="hbp-summary-value">
                              {formatPrice(r.rate || 0)}
                            </div>
                          </div>
                        ))}
                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">Selling Price</div>
                          <div className="hbp-summary-value">
                            {formatPrice(totalPayable)}
                          </div>
                        </div>
                        <hr className="my-2" />
                        <div className="hbp-summary-row fw-bold">
                          <div className="hbp-summary-label text-danger">
                            New Total
                          </div>
                          <div className="hbp-summary-value text-danger">
                            {formatPrice(totalPayable)}
                          </div>
                        </div>
                        {activeUserRole === "ADMIN" && (
                          <div className="hbp-summary-row mt-2">
                            <div className="hbp-summary-label text-muted small">
                              Total (incl. markup)
                            </div>
                            <div className="hbp-summary-value text-success fw-bold">
                              {formatPrice(totalPayable)}
                            </div>
                          </div>
                        )}
                      </Card.Body>
                    </Card>

                    {/* Quotation — under the Price Details it quotes, above
                        the booking decision and Confirm Booking. */}
                    <QuotationPdfCard buildPayload={buildDayStayQuotationPayload} />

                    {/* Voucher choice card — same UX + copy as
                        HotelBookingPage. Only visible for a refundable
                        rate whose deadline is upcoming; hidden for
                        on-request, non-refundable, or past-deadline
                        flows (which resolve automatically). */}
                    {showVoucherChoice && (
                      <Card className="shadow-sm rounded-3 border-0 mt-3">
                        <Card.Body className="p-3">
                          <Form.Group className="mb-0">
                            <Form.Label className="mb-2 fw-semibold">
                              Are you sure you want to continue with the booking?
                            </Form.Label>
                            <div className="d-flex flex-column gap-2 mt-1">
                              <Form.Check
                                type="radio"
                                id="ds-book-voucher"
                                name="dsBookingConfirmation"
                                label="Book and Pay Now"
                                value="Book & Voucher"
                                checked={
                                  voucherChoiceMade &&
                                  bookingConfirmation === "Book & Voucher"
                                }
                                onChange={(e) => {
                                  setBookingConfirmation(e.target.value);
                                  setVoucherChoiceMade(true);
                                  setVoucherChoiceError(false);
                                }}
                                className="mb-0"
                              />
                              <Form.Check
                                type="radio"
                                id="ds-book-now-voucher-later"
                                name="dsBookingConfirmation"
                                label="Hold Room and Pay Later"
                                value="Book Now & Voucher later"
                                checked={
                                  voucherChoiceMade &&
                                  bookingConfirmation ===
                                    "Book Now & Voucher later"
                                }
                                onChange={(e) => {
                                  setBookingConfirmation(e.target.value);
                                  setVoucherChoiceMade(true);
                                  setVoucherChoiceError(false);
                                }}
                              />
                            </div>
                            {voucherChoiceError && (
                              <div className="text-danger small mt-2">
                                Please select a booking option to continue.
                              </div>
                            )}
                          </Form.Group>
                        </Card.Body>
                      </Card>
                    )}

                    <div className="hbp-action-bar mt-3 d-flex gap-2">
                      <Button
                        variant="outline-secondary"
                        onClick={() => navigate(-1)}
                        className="flex-grow-1"
                      >
                        Back
                      </Button>
                      <Button
                        variant="primary"
                        type="button"
                        onClick={openPolicyConsent}
                        className="flex-grow-1"
                        disabled={isSubmitting || noPaymentPathAvailable}
                        title={
                          noPaymentPathAvailable
                            ? "Booking cannot be completed — no payment method available for this agent."
                            : undefined
                        }
                      >
                        Confirm Booking
                      </Button>
                    </div>
                  </div>
                </Col>
              </Row>

              {/* ─── Policy Consent Modal — mirrors HotelBookingPage ─── */}
              <Modal
                show={showPolicyModal}
                onHide={() => setShowPolicyModal(false)}
                centered
                backdrop="static"
                size="lg"
                scrollable
                dialogClassName="policy-modal"
              >
                <Modal.Header closeButton className="policy-modal-header">
                  <Modal.Title className="policy-modal-title">
                    Day Stay Policies &amp; Terms
                  </Modal.Title>
                </Modal.Header>
                <Modal.Body className="policy-modal-body">
                  {policiesLoading ? (
                    <div className="text-center py-4">
                      <div className="spinner-border spinner-border-sm text-secondary" />
                      <div className="mt-2 text-muted small">
                        Loading policies &amp; terms…
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Cancellation Policy — non-refundable takes
                          precedence over the contract list, same as
                          HotelBookingPage's "hotel rate refundability
                          overrides hotel-level policy" rule. */}
                      <section className="policy-section">
                        <h6 className="policy-section-title">
                          Cancellation Policy
                        </h6>
                        {isNonRefundableRate ? (
                          <div className="policy-item">
                            <div
                              className="policy-text fw-bold"
                              style={{ color: "#dc2626" }}
                            >
                              Non-refundable
                            </div>
                            <div className="policy-text">
                              No refund will be provided if this booking is
                              cancelled.
                            </div>
                            <div className="policy-text">
                              100% cancellation charges apply from the time
                              of booking.
                            </div>
                          </div>
                        ) : payload?.cancellationPolicies?.length ? (
                          payload.cancellationPolicies.map((item, idx) => (
                            <div
                              key={`day-stay-cancel-${idx}`}
                              className="policy-item"
                            >
                              <div className="policy-text">
                                {typeof item === "string"
                                  ? item
                                  : item?.policyText || "—"}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="policy-empty">
                            No cancellation policy specified.
                          </div>
                        )}
                      </section>

                      {/* Amendment Policy — hotel-level, lazily fetched. */}
                      <section className="policy-section">
                        <h6 className="policy-section-title">
                          Amendment Policy
                        </h6>
                        {policyData?.policies?.amendmentPolicy?.length ? (
                          policyData.policies.amendmentPolicy.map((p, idx) => (
                            <div key={idx} className="policy-item">
                              <div className="policy-text">
                                {p.policyText || "—"}
                              </div>
                              {(p.fromDate || p.toDate) && (
                                <div className="policy-meta">
                                  Valid{" "}
                                  {p.fromDate
                                    ? new Date(p.fromDate).toLocaleDateString()
                                    : "—"}
                                  {" – "}
                                  {p.toDate
                                    ? new Date(p.toDate).toLocaleDateString()
                                    : "—"}
                                </div>
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="policy-empty">
                            No amendment policy specified.
                          </div>
                        )}
                      </section>

                      {/* Child Policy */}
                      <section className="policy-section">
                        <h6 className="policy-section-title">Child Policy</h6>
                        {policyData?.policies?.childPolicy?.length &&
                        policyData.policies.childPolicy.some(
                          (p) => p.policyText,
                        ) ? (
                          policyData.policies.childPolicy.map((p, idx) => (
                            <div key={idx} className="policy-item">
                              <div className="policy-text">
                                {p.policyText || "—"}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="policy-empty">
                            No child policy specified.
                          </div>
                        )}
                      </section>

                      {/* Terms & Conditions — merge day-stay contract's
                          list with the hotel-wide T&C string when both
                          are present. */}
                      <section className="policy-section policy-section-last">
                        <h6 className="policy-section-title">
                          Terms &amp; Conditions
                        </h6>
                        {payload?.termsAndConditions?.length ? (
                          payload.termsAndConditions.map((item, idx) => (
                            <div
                              key={`day-stay-term-${idx}`}
                              className="policy-item"
                            >
                              <div className="policy-text">
                                {typeof item === "string"
                                  ? item
                                  : item?.description ||
                                    item?.text ||
                                    "—"}
                              </div>
                            </div>
                          ))
                        ) : hotelTermsAndConditions ? (
                          <div
                            className="terms-content"
                            dangerouslySetInnerHTML={{
                              __html: hotelTermsAndConditions,
                            }}
                          />
                        ) : (
                          <div className="policy-empty">
                            No terms &amp; conditions configured for this
                            hotel.
                          </div>
                        )}
                      </section>
                    </>
                  )}
                </Modal.Body>
                <Modal.Footer className="policy-modal-footer">
                  <Form.Check
                    type="checkbox"
                    id="ds-policy-accept"
                    className="me-auto policy-accept-check"
                    label="I have read and accept the policies and terms & conditions"
                    checked={policyAccepted}
                    onChange={(e) => setPolicyAccepted(e.target.checked)}
                  />
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={() => setShowPolicyModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!policyAccepted || policiesLoading}
                    onClick={() => {
                      setShowPolicyModal(false);
                      handleSubmit();
                    }}
                  >
                    Proceed
                  </Button>
                </Modal.Footer>
              </Modal>

              {/* ─── Order Summary Modal ─── */}
              <Modal
                show={showConfirmModal}
                onHide={() => setShowConfirmModal(false)}
                centered
                backdrop="static"
                dialogClassName="confirm-booking-modal"
              >
                <Modal.Header
                  closeButton
                  className="bg-primary text-white py-2"
                  style={{ borderBottom: "none" }}
                >
                  <Modal.Title className="fw-semibold d-flex align-items-center">
                    <FaHotel className="me-2" /> Confirm Your Booking
                  </Modal.Title>
                </Modal.Header>
                <Modal.Body className="px-3 py-2 bg-light">
                  {pendingPayload && (
                    <div className="border rounded-3 bg-white shadow-sm p-2">
                      <div className="mb-2">
                        <p className="mb-0 d-flex align-items-center flex-wrap">
                          <span className="fw-bold text-primary fs-5">
                            {pendingPayload.hotelName}
                          </span>
                          {pendingPayload.address && (
                            <span className="text-muted small ms-1">
                              , {pendingPayload.address}
                            </span>
                          )}
                        </p>
                      </div>
                      <hr className="my-2" />

                      <Row className="gy-1">
                        <Col xs={6}>
                          <p className="mb-1">
                            <strong>Check-In:</strong>
                            <br />
                            <span className="text-dark">
                              {formatCheckin(
                                pendingPayload.checkInDate,
                                pendingPayload.checkInTime,
                              )}
                            </span>
                          </p>
                        </Col>
                        <Col xs={6}>
                          <p className="mb-1">
                            <strong>Check-Out:</strong>
                            <br />
                            <span className="text-dark">
                              {formatCheckin(
                                pendingPayload.checkInDate,
                                pendingPayload.checkOutTime,
                              )}
                            </span>
                          </p>
                        </Col>
                        <Col xs={6}>
                          <p className="mb-1">
                            <strong>Rooms:</strong>{" "}
                            {pendingPayload.rooms.length}
                          </p>
                        </Col>
                        <Col xs={6}>
                          <p className="mb-1">
                            <strong>Type:</strong> Day Stay (same day)
                          </p>
                        </Col>

                        {/* Room category + meal plan per room. */}
                        {pendingPayload.rooms.map((s, i) => (
                          <React.Fragment key={i}>
                            <Col xs={6}>
                              <p className="mb-1">
                                <strong>Room Category:</strong>
                                <br />
                                <span className="text-dark">
                                  {pendingPayload.rooms.length > 1
                                    ? `Room ${s.roomNo ?? i + 1} - `
                                    : ""}
                                  {s.roomCategory || "—"}
                                </span>
                              </p>
                            </Col>
                            <Col xs={6}>
                              <p className="mb-1">
                                <strong>Meal Plan:</strong>
                                <br />
                                <span className="text-dark">
                                  {s.mealPlan || "—"}
                                </span>
                              </p>
                            </Col>
                          </React.Fragment>
                        ))}

                        {/* Lead Passenger — derived from the Lead-marked
                            guest at build time. */}
                        {(() => {
                          const lp = pendingPayload?.primaryGuest;
                          if (!lp) return null;
                          const fullName = [
                            lp.salutation,
                            lp.firstName,
                            lp.middleName,
                            lp.lastName,
                          ]
                            .filter((p) => p && String(p).trim() !== "")
                            .join(" ");
                          if (!fullName) return null;
                          return (
                            <Col xs={12}>
                              <p className="mb-1">
                                <strong>Lead Passenger:</strong>
                                <br />
                                <span className="text-dark">{fullName}</span>
                              </p>
                            </Col>
                          );
                        })()}

                        {/* Cancellation block — non-refundable → compact
                            label + badge + policy text. Refundable +
                            deadline → deadline + refundable badge. Paired
                            with a Payment Mode badge column below so the
                            two read as one row (mirrors HotelBookingPage). */}
                        {isNonRefundableRate ? (
                          <Col xs={12} md={6}>
                            <p className="mb-1">
                              <strong>Cancellation Policy:</strong>
                              <br />
                              <span
                                className="badge bg-danger"
                                style={{ fontSize: "0.7rem" }}
                              >
                                Non-refundable
                              </span>
                            </p>
                            <p
                              className="mb-0 text-muted"
                              style={{ fontSize: "0.75rem", lineHeight: 1.35 }}
                            >
                              No refund will be provided if this booking is
                              cancelled. 100% cancellation charges apply from
                              the time of booking.
                            </p>
                          </Col>
                        ) : (
                          cancellationDeadline && (
                            <Col xs={12} md={6}>
                              <p className="mb-1">
                                <strong>Cancellation Deadline:</strong>
                                <br />
                                <span className="text-dark">
                                  {cancellationDeadline.toLocaleDateString(
                                    "en-GB",
                                    {
                                      day: "2-digit",
                                      month: "short",
                                      year: "numeric",
                                    },
                                  )}
                                  , 02:00 PM (UAE)
                                </span>
                                {isOutsideDeadline ? (
                                  <span
                                    className="badge bg-danger ms-2"
                                    style={{ fontSize: "0.7rem" }}
                                  >
                                    Passed
                                  </span>
                                ) : (
                                  <span
                                    className="badge bg-success ms-2"
                                    style={{ fontSize: "0.7rem" }}
                                  >
                                    Refundable until this date
                                  </span>
                                )}
                              </p>
                            </Col>
                          )
                        )}

                        {/* Payment Mode — badge beside the cancellation block. */}
                        {(isNonRefundableRate || cancellationDeadline) && (
                          <Col
                            xs={12}
                            md={6}
                            className="d-flex align-items-start justify-content-md-end"
                          >
                            <p className="mb-1">
                              <strong>Payment Mode:</strong>
                              <br />
                              <span
                                className="badge bg-success"
                                style={{ fontSize: "0.75rem" }}
                              >
                                {paymentMode === "CREDITLIMIT"
                                  ? "Credit Limit"
                                  : paymentMode === "CARD"
                                    ? "Online Payment"
                                    : paymentMode === "CASH"
                                      ? "Cash"
                                      : paymentMode || "—"}
                              </span>
                            </p>
                          </Col>
                        )}

                        <Col xs={12}>
                          {activeUserRole === "ADMIN" && (
                            <div className="p-2 rounded bg-white border mt-2">
                              <div className="d-flex justify-content-between align-items-center">
                                <h6 className="mb-0 text-muted">
                                  Selling Price
                                </h6>
                                <h5 className="mb-0 text-success fw-bold">
                                  {formatPrice(pendingPayload.totalAmount)}
                                </h5>
                              </div>
                            </div>
                          )}
                          <div className="p-2 rounded bg-white border mt-2 d-flex justify-content-between align-items-center">
                            <h6 className="mb-0 fw-bold">Payable</h6>
                            <h5 className="mb-0 fw-bold">
                              {formatPrice(pendingPayload.totalAmount)}{" "}
                              <span className="text-muted small fw-normal">
                                for {pendingPayload.rooms.length}{" "}
                                {pendingPayload.rooms.length > 1
                                  ? "rooms"
                                  : "room"}
                              </span>
                            </h5>
                          </div>
                        </Col>
                      </Row>

                      <div className="mt-1 p-2 bg-white border rounded">
                        <h6 className="fw-bold mb-1">Rate Split</h6>
                        <div className="d-flex justify-content-between">
                          <span>Selling Price</span>
                          <span>{formatPrice(pendingPayload.totalAmount)}</span>
                        </div>
                        <hr className="my-1" />
                        <div className="d-flex justify-content-between fw-bold">
                          <span>Total (Selling)</span>
                          <span>{formatPrice(pendingPayload.totalAmount)}</span>
                        </div>
                      </div>

                      <div className="mt-1 p-2 bg-white border rounded d-flex align-items-center">
                        <span
                          className="me-2 d-inline-flex align-items-center justify-content-center"
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: "50%",
                            background: "#16a34a",
                            color: "#fff",
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            lineHeight: 1,
                          }}
                          aria-hidden="true"
                        >
                          ✓
                        </span>
                        <span className="small text-dark">
                          Day-stay policies and terms &amp; conditions accepted
                        </span>
                      </div>

                      <div className="mt-1 text-center">
                        <p className="text-muted small mb-0">
                          Please review the booking details carefully before
                          confirming.
                        </p>
                      </div>
                    </div>
                  )}
                </Modal.Body>
                <Modal.Footer className="bg-light border-0 d-flex justify-content-between">
                  <Button
                    variant="outline-secondary"
                    onClick={() => setShowConfirmModal(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={confirmBooking}
                    disabled={isSubmitting}
                    className="px-4 fw-semibold"
                  >
                    {isSubmitting ? (
                      <>
                        <Spinner
                          animation="border"
                          size="sm"
                          className="me-2"
                          role="status"
                        />
                        Processing...
                      </>
                    ) : (
                      <>
                        <FaCheckCircle className="me-1" /> Confirm
                      </>
                    )}
                  </Button>
                </Modal.Footer>
              </Modal>

              {/* ─── Insufficient credit + card disabled → block booking ───
                  Shown when the agent has no available credit AND the
                  AgentView "Allow Card payment mode" toggle is off. There
                  is no payment path open to this agent, so the booking is
                  turned away with a courteous message. Same shape as
                  HotelBookingPage's block modal. */}
              <Modal
                show={showNoPaymentPathModal}
                onHide={() => setShowNoPaymentPathModal(false)}
                centered
              >
                <Modal.Header closeButton>
                  <Modal.Title>Booking Cannot Be Completed</Modal.Title>
                </Modal.Header>
                <Modal.Body className="text-center py-4">
                  <p className="mb-2 text-dark">
                    Sorry — this booking can't be completed because the agent
                    has no available credit and{" "}
                    <strong>Card payment is not enabled</strong> for this
                    account.
                  </p>
                  <p className="mb-0 text-muted small">
                    Please top up the agent's credit limit, or ask an
                    administrator to enable Card payment on the agent's
                    profile, then try again.
                  </p>
                  <div className="mt-3">
                    <div className="text-muted small">Payable amount</div>
                    <div className="fs-4 fw-bold text-dark">
                      {formatPrice(insufficientAmount)}
                    </div>
                  </div>
                </Modal.Body>
                <Modal.Footer className="justify-content-center border-0">
                  <Button
                    variant="secondary"
                    onClick={() => setShowNoPaymentPathModal(false)}
                  >
                    OK
                  </Button>
                </Modal.Footer>
              </Modal>

              {/* ─── Insufficient Credit → online payment required ─── */}
              <Modal
                show={showInsufficientModal}
                onHide={() => setShowInsufficientModal(false)}
                centered
              >
                <Modal.Header closeButton>
                  <Modal.Title>Online Payment Required</Modal.Title>
                </Modal.Header>
                <Modal.Body className="text-center py-4">
                  <p className="mb-2 text-muted">
                    The agent's available credit is insufficient for this
                    booking. You need to proceed with{" "}
                    <strong>online payment</strong>.
                  </p>
                  <div className="mt-3">
                    <div className="text-muted small">Payable amount</div>
                    <div className="fs-4 fw-bold text-dark">
                      {formatPrice(insufficientAmount)}
                    </div>
                  </div>
                </Modal.Body>
                <Modal.Footer className="justify-content-center border-0">
                  <Button
                    variant="danger"
                    onClick={() => setShowInsufficientModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="success"
                    onClick={() => {
                      setShowInsufficientModal(false);
                      setSelectedGateway("");
                      setShowGatewayModal(true);
                    }}
                  >
                    Pay
                  </Button>
                </Modal.Footer>
              </Modal>

              {/* ─── Select payment gateway ───
                  CCAvenue is the only real gateway wired up — mirrors
                  HotelBookingPage. The card renders the CC Avenue logo
                  from /public/ccavanue.png. */}
              <Modal
                show={showGatewayModal}
                onHide={() => setShowGatewayModal(false)}
                centered
              >
                <Modal.Header closeButton>
                  <Modal.Title>Select Payment Gateway</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                  <p className="text-muted small mb-3">
                    Choose a gateway to enter your card details.
                  </p>
                  <div className="pg-option-list">
                    {PAYMENT_GATEWAYS.map((g) => {
                      const isSelected = selectedGateway === g.id;
                      return (
                        <label
                          key={g.id}
                          htmlFor={`ds-gw-${g.id}`}
                          className={`pg-option${
                            isSelected ? " pg-option-selected" : ""
                          }`}
                        >
                          <input
                            type="radio"
                            name="ds-payment-gateway"
                            id={`ds-gw-${g.id}`}
                            className="pg-option-input"
                            checked={isSelected}
                            onChange={() => setSelectedGateway(g.id)}
                          />
                          <span className="pg-option-radio" aria-hidden="true" />
                          {g.id === "ccavenue" && (
                            <img
                              src={`${process.env.PUBLIC_URL}/ccavanue.png`}
                              alt="CC Avenue"
                              className="pg-option-logo"
                            />
                          )}
                        </label>
                      );
                    })}
                  </div>
                </Modal.Body>
                <Modal.Footer className="border-0">
                  <Button
                    variant="secondary"
                    onClick={() => setShowGatewayModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="success"
                    disabled={!selectedGateway}
                    onClick={() => {
                      const gw = PAYMENT_GATEWAYS.find(
                        (x) => x.id === selectedGateway,
                      );
                      setShowGatewayModal(false);
                      // paymentMode is flipped to "ONLINE" so the Booking
                      // List can label the row correctly (mirrors the
                      // hotel-booking online-payment branch).
                      const onlinePayload = {
                        ...pendingPayload,
                        paymentMode: "ONLINE",
                      };

                      // ── CC Avenue: real billing-page redirect ──
                      // Distinct from the dummy /payment/:gateway flow below
                      // — the browser fully navigates away to CC Avenue's
                      // hosted page and back, so the resume signal has to
                      // travel as a URL query param (React Router state
                      // doesn't survive a real cross-origin redirect). See
                      // the ccavenueOrderId branch in the resume effect
                      // above.
                      //
                      // For CC Avenue we DON'T rely on sessionStorage to
                      // reach the create call — the backend's /initiate
                      // stores the payload alongside the transaction row
                      // and /finalize-daystay replays it after payment.
                      // flowType tells the shared CCAvenueCheckoutPage to
                      // ask the backend for the DAYSTAY_CREATE arm.
                      if (selectedGateway === "ccavenue") {
                        const guest = onlinePayload?.primaryGuest;
                        const billingName = guest
                          ? [guest.firstName, guest.lastName]
                              .filter(Boolean)
                              .join(" ")
                          : "";
                        navigate("/payment/ccavenue-redirect", {
                          state: {
                            amountLabel: formatPrice(insufficientAmount),
                            billingName,
                            returnTo: location.pathname,
                            flowType: "DAYSTAY_CREATE",
                            bookingPayload: onlinePayload,
                          },
                        });
                        return;
                      }

                      // Dummy /payment/:gateway flow (test/local only) —
                      // it doesn't hit a real backend, so the resume needs
                      // the payload in sessionStorage. Kept for parity
                      // with HotelBookingPage; no gateway currently routes
                      // through it because CCAvenue is the only entry in
                      // PAYMENT_GATEWAYS.
                      try {
                        sessionStorage.setItem(
                          "dayStayPendingCreatePayload",
                          JSON.stringify(onlinePayload),
                        );
                      } catch (e) {
                        console.error(
                          "Could not persist pending day-stay create payload",
                          e,
                        );
                      }
                      navigate(`/payment/${selectedGateway}`, {
                        state: {
                          amountLabel: formatPrice(insufficientAmount),
                          gatewayName: gw ? gw.name : selectedGateway,
                          returnTo: location.pathname,
                          returnState: { resumeCreate: true },
                        },
                      });
                    }}
                  >
                    Proceed to Pay
                  </Button>
                </Modal.Footer>
              </Modal>
            </Form>
          </Container>
        </main>
      </div>

      {/* ── Post-payment finalize overlay ──
          Visible only while the backend is creating the paid-for booking
          after a successful CC Avenue return. Backdrop is fully opaque
          and non-dismissable so the operator physically cannot click on
          anything else, and the beforeunload effect above adds the
          browser's own confirm dialog if they try to close the tab or
          refresh. Cleared automatically in the finally block of
          finalizeAfterCCAvenue, whether the create succeeded or errored.
          Mirrors HotelBookingPage. */}
      {isFinalizingPayment && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-live="assertive"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 20000,
            background: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: "2rem 1.75rem",
              maxWidth: 440,
              width: "100%",
              textAlign: "center",
              boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
            }}
          >
            <Spinner
              animation="border"
              variant="success"
              role="status"
              style={{ width: 48, height: 48, marginBottom: 16 }}
            />
            <h5 className="fw-bold mb-2" style={{ color: "#0f172a" }}>
              Payment successful — creating your booking
            </h5>
            <p className="text-muted mb-3" style={{ fontSize: 14 }}>
              Please <strong>do not close this window, refresh the page, or
              press the back button</strong> until you see the confirmation.
            </p>
            <div
              className="small"
              style={{
                color: "#b45309",
                background: "#fef3c7",
                border: "1px solid #fde68a",
                borderRadius: 8,
                padding: "8px 12px",
              }}
            >
              This usually takes just a few seconds.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
