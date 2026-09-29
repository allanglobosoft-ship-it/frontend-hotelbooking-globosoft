import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FaHotel, FaCalendarAlt, FaUsers, FaUtensils } from "react-icons/fa";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import "../../styles/HotelBookingPage.css";
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
import axiosInstance from "../../components/AxiosInstance";
import toast from "react-hot-toast";
import { toLocalDateTime, formatDateTime } from "../../utils/dateUtils";
import QuotationPdfCard from "../../components/quotation/QuotationPdfCard";

// Dummy online-payment gateways shown when an agent's credit is short.
// Each routes to /payment/<id> — a placeholder card-entry page.
const PAYMENT_GATEWAYS = [
  { id: "ccavenue", name: "CC Avenue", desc: "Cards, UPI, Net Banking" },
  
];

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

// Reverse-geocode browser coordinates to a readable address for the
// Booking History audit trail. Tries OpenStreetMap Nominatim first
// (street-level detail), then BigDataCloud (locality-level, keyless) —
// both free, CORS-enabled endpoints. Returns null when neither responds
// so the caller keeps its IP-derived fallback. Mirrors the other
// dedicated-flow booking pages.
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

/**
 * Optional `force24Hour` prop — set by the thin HotelBookingPage24Hour
 * wrapper. When true, the post-booking redirect goes to
 * /booking-details/24hr-booking-list instead of
 * /booking-details/hotel-booking-list so the dedicated 24-hour
 * Check-In flow lands on its own booking list. Defaults to false so
 * the legacy /hotel-booking-page flow is unchanged.
 *
 * Optional `religiousMode` prop — set by the thin HotelBookingPageReligious
 * wrapper. When true the post-booking redirect goes to
 * /booking-details/religious-booking-list, and the /api/hotel-booking/create
 * payload carries `isReligiousBooking: true` so the persisted row is
 * tagged and the Religious Booking List can filter it. Defaults to
 * false so the legacy /hotel-booking-page flow is unchanged.
 */
const HotelBookingPage = ({ force24Hour = false, religiousMode = false } = {}) => {
  const postBookingListRoute = religiousMode
    ? "/booking-details/religious-booking-list"
    : force24Hour
      ? "/booking-details/24hr-booking-list"
      : "/booking-details/hotel-booking-list";
  const navigate = useNavigate();
  const location = useLocation();

  let activeUserRole = localStorage.getItem("currentActiveRole");
  console.log("currentActiveRole::", activeUserRole);

  // "Booking Done For" is an internal/admin-facing field — shown to ADMIN
  // logins only and hidden for every other login (mirrors the isAdmin gate
  // used in BookingDetailedView). Visibility only; no flow/API change.
  const isAdmin = String(activeUserRole || "").toUpperCase() === "ADMIN";

  const [bookingData, setBookingData] = useState(null);
  const [agentAvailableBalance, setAgentAvailableBalance] = useState(null);
  // Whether the selected agent has usable credit available right now.
  // true = has available credit (availableCreditLimit > 0), false = "Cash
  // Agent" — no usable credit (available 0/null, or no credit-limit row at
  // all), null = unknown/not yet resolved or no agent. Drives the restricted
  // Payment Type list for the Non-Refundable + Cash-Agent case (Card / Cash
  // Deposit only).
  const [agentHasAvailableCredit, setAgentHasAvailableCredit] = useState(null);
  // Per-agent "Card" payment-mode gate, toggled from AgentView. When
  // false the Card option is filtered out of the payment-mode dropdown.
  const [agentCardPaymentEnabled, setAgentCardPaymentEnabled] = useState(false);
  // Hotel's max cancellation nights (MAX(noOfNights) across its live
  // cancellation policies) — fetched from the backend so the on-screen
  // deadline matches exactly what the booking-create flow stores and the
  // Booking List shows: deadline = checkInDate − maxCancellationNights.
  const [maxCancellationNights, setMaxCancellationNights] = useState(null);
  const [rooms, setRooms] = useState([]);

  // ── Lead passenger marker — { roomIdx, guestIdx } pointing at the
  //    single guest the user has flagged as Lead. Mirrors the gov /
  //    SC / Student booking pages. Defaults to the first guest
  //    (room 0, guest 0) so the radio column always has one
  //    selection on first render. Children can't be Lead. The
  //    Lead-marked guest drives the `primaryGuest` payload object —
  //    the (now hidden) "Lead Passenger" card no longer collects
  //    Salutation / First Name / Middle Name / Last Name.
  const [leadIndex, setLeadIndex] = useState({ roomIdx: 0, guestIdx: 0 });

  const handleLeadSelect = (roomIdx, guestIdx) => {
    const g = rooms?.[roomIdx]?.guests?.[guestIdx];
    if (g?.isChild) return;
    setLeadIndex({ roomIdx, guestIdx });
  };
  const [primaryGuest, setPrimaryGuest] = useState({
    salutation: "",
    firstName: "",
    middleName: "",
    lastName: "",
    email: "",
    phone: "",
    passportNo: "",
    agentLpo: "",
  });
  const [validationErrors, setValidationErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  // Payment mode — mirrors the selector on /new-booking/meet-and-space/book.
  // Default keeps the legacy behaviour (CREDITLIMIT) so existing flows that
  // don't surface the selector still work.
  const [paymentMode, setPaymentMode] = useState("CREDITLIMIT");
  const [pendingPayload, setPendingPayload] = useState(null);
  // ── Online-payment flow (shown when the agent's credit is short) ──
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [showGatewayModal, setShowGatewayModal] = useState(false);
  const [insufficientAmount, setInsufficientAmount] = useState(0);
  // Block-booking modal shown when the agent is short on credit AND the
  // AgentView "Allow Card payment mode" toggle is off — the agent has no
  // path to complete the booking and must be turned away rather than
  // pushed into the online-payment flow they can't use.
  const [showNoPaymentPathModal, setShowNoPaymentPathModal] = useState(false);
  const [selectedGateway, setSelectedGateway] = useState("");
  // True only while the post-CC-Avenue /finalize call is in flight. Drives
  // the full-screen "Booking in progress — do not close" overlay and the
  // beforeunload guard so the operator can't navigate away while the
  // backend is still creating the paid-for booking.
  const [isFinalizingPayment, setIsFinalizingPayment] = useState(false);
  const [tourismDirhams, setTourismDirhams] = useState("0");
  const [remarks, setRemarks] = useState("");
  const [specialRequests, setSpecialRequests] = useState([]);
  // Optional "Booking done for" free-text. When set, the detail view + voucher
  // render it as "Contact: <value>/<agentName>".
  const [bookingDoneFor, setBookingDoneFor] = useState("");

  // Client location snapshot for the booking-history audit trail, resolved
  // once on page load and sent on the create payload:
  //   • Location — browser geolocation (GPS/WiFi) reverse-geocoded to a
  //     precise readable address; the coarse IP-derived city is only the
  //     fallback when the permission is denied or the lookup times out.
  // The IP Address column is NOT resolved here — browsers can only see the
  // shared public/NAT IP, so the backend stamps each system's unique IPv4
  // from the create request itself. Covers both the normal Hotel flow and
  // the 24-hour variant (this component serves both routes).
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

  const [bookingConfirmation, setBookingConfirmation] =
    useState("Book & Voucher");
  // No voucher option is pre-selected: the user must explicitly pick
  // "Voucher Now" or "Voucher Later" before the booking can proceed.
  // `bookingConfirmation` keeps its "Book & Voucher" default for the
  // non-choice flows (on-request / non-refundable / past-deadline, where
  // the choice card is hidden), so this separate flag is what gates the
  // radios' checked state and the proceed validation.
  const [voucherChoiceMade, setVoucherChoiceMade] = useState(false);
  const [voucherChoiceError, setVoucherChoiceError] = useState(false);
  // Policy + T&C consent flow
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [policyData, setPolicyData] = useState(null);
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);

  // Employee selection moved to HotelSearch (optional "Booking Done By"
  // dropdown). The selected employeeId travels here on
  // bookingData.payload.employeeId and is forwarded straight into the
  // create payload — no fetch / no state needed on this page anymore.

  // Fetch the selected agent's available credit balance for display
  useEffect(() => {
    const aId = bookingData?.payload?.agentId;
    if (!aId) {
      setAgentAvailableBalance(null);
      setAgentHasAvailableCredit(null);
      return;
    }
    let cancelled = false;
    axiosInstance
      .get(`/api/agent-credit-limit/agent/${aId}`)
      .then((res) => {
        if (!cancelled) {
          // effectiveAvailableCreditLimit = regular available credit + any
          // currently-Active Temporary Credit Limit — the same combined
          // figure the backend's check-sufficient-credit / booking-create
          // flow use, so the Payment Mode selector agrees with what the
          // Confirm step will actually allow. Falls back to
          // availableCreditLimit for older cached responses.
          const combinedBalance =
            res?.data?.effectiveAvailableCreditLimit ??
            res?.data?.availableCreditLimit ??
            null;
          setAgentAvailableBalance(combinedBalance);
          // Treat the agent as a "Cash Agent" when there is no usable credit
          // available (available balance 0/null) — this covers both agents
          // with no credit facility AND credit agents who've used up their
          // balance. Only a positive available balance counts as a credit
          // agent for the Payment Type rule.
          const available = Number(combinedBalance ?? 0);
          setAgentHasAvailableCredit(
            Number.isFinite(available) && available > 0,
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAgentAvailableBalance(null);
          // 404 (no credit-limit row for the agent) → treat as a Cash Agent.
          setAgentHasAvailableCredit(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bookingData]);

  // Fetch the per-agent "Card" payment-mode gate. Falls back to false
  // when the agent id is missing or the request fails, so a network hiccup
  // never silently exposes Card.
  useEffect(() => {
    const aId = bookingData?.payload?.agentId;
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
  }, [bookingData]);

  // Fetch the hotel's max cancellation nights so the deadline is computed
  // the same way the backend stores it (and the Booking List shows it):
  //   deadline = checkInDate − maxCancellationNights.
  useEffect(() => {
    const hotelId = bookingData?.selectedRate?.hotelId;
    if (!hotelId) {
      setMaxCancellationNights(null);
      return;
    }
    let cancelled = false;
    axiosInstance
      .get(`/api/hotels/${hotelId}/max-cancellation-nights`)
      .then((res) => {
        if (!cancelled) {
          const n = Number(res?.data);
          setMaxCancellationNights(Number.isFinite(n) ? n : 0);
        }
      })
      .catch(() => {
        if (!cancelled) setMaxCancellationNights(null);
      });
    return () => {
      cancelled = true;
    };
  }, [bookingData]);

  // ────────────────────────────────────────────────────────────────
  // Booking-flow derivation (matches the confirm-booking flowchart).
  //
  // The flow has two big branches keyed off the cancellation deadline:
  //
  //   • WITHIN DEADLINE  — there is still free-cancellation time left.
  //       - Available rate                          → RECONFIRMED
  //       - On-Request rate                         → REQUESTED
  //                                                   (supplier later
  //                                                   responds with
  //                                                   RECONFIRMED or
  //                                                   SOLD OUT)
  //
  //   • OUTSIDE DEADLINE — we've crossed the free-cancellation window.
  //       - Available rate, "Book Now Voucher Now"  → RECONFIRMED
  //       - Available rate, "Book Now Voucher Later"→ CONFIRMED
  //         (auto-cancels at the deadline if the admin doesn't
  //         re-confirm it before then)
  //       - On-Request rate                         → REQUESTED
  //                                                   (supplier later
  //                                                   responds with
  //                                                   CONFIRMED or
  //                                                   SOLD OUT)
  //
  // Non-refundable rates have no free-cancellation window at all, so
  // they always behave like "voucher now" → RECONFIRMED.
  // ────────────────────────────────────────────────────────────────

  // Cancellation deadline, computed EXACTLY like the backend stores it
  // (see InhouseHotelBookingService create flow) and the Booking List
  // shows it:  deadline = checkInDate − maxCancellationNights, at midnight.
  // maxCancellationNights is fetched above from
  // /api/hotels/{hotelId}/max-cancellation-nights. Null until that resolves
  // or when no check-in date is available, so the deadline-dependent flags
  // below fall back to their safe "deadline doesn't apply" behaviour.
  const cancellationDeadline = (() => {
    if (maxCancellationNights == null) return null;
    const cinRaw = bookingData?.payload?.checkInDate;
    if (!cinRaw) return null;
    const cin = new Date(cinRaw);
    if (isNaN(cin.getTime())) return null;
    const deadline = new Date(cin);
    deadline.setDate(deadline.getDate() - maxCancellationNights);
    deadline.setHours(0, 0, 0, 0);
    return deadline;
  })();

  // True only for refundable rates whose deadline has already passed.
  // Non-refundable rates and rates without a policy row are treated as
  // "deadline doesn't apply" → false (they skip the radio prompt and
  // resolve directly to RECONFIRMED).
  const isOutsideDeadline = (() => {
    if (!cancellationDeadline) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today > cancellationDeadline;
  })();

  const isOnRequestRate =
    bookingData?.selectedRate?.roomStatus === "On Request";
  const isNonRefundableRate =
    bookingData?.selectedRate?.nonRefundable === true ||
    bookingData?.selectedRate?.nonRefundable === "true";

  // True when the booking has BOTH refundable and non-refundable rooms
  // in roomBreakdown. Drives the notice at the top of the Guest Details
  // accordion (replacing the per-room deadline dates, which would be
  // misleading when only some rooms actually qualify for that deadline).
  // Falls back to false when roomBreakdown is absent (single-room flows),
  // so nothing else changes.
  const hasMixedRefundability = useMemo(() => {
    const roomList = bookingData?.roomBreakdown;
    if (!Array.isArray(roomList) || roomList.length < 2) return false;
    const nonRefCount = roomList.filter(
      (r) => r?.nonRefundable === true || r?.nonRefundable === "true",
    ).length;
    return nonRefCount > 0 && nonRefCount < roomList.length;
  }, [bookingData]);

  // Total the agent owes for this booking (AED — matches the
  // `requiredAmount` param the backend uses for
  // /api/agent-credit-limit/check-sufficient-credit). Computed here so
  // the credit-sufficiency check that drives the Payment Mode options
  // has the amount available at render time, not just at confirm time.
  const bookingSellingPrice = useMemo(() => {
    const base =
      Number(bookingData?.selectedRate?.roomRateBasedOnRoomCount) || 0;
    const td = parseFloat(tourismDirhams) || 0;
    return base + td;
  }, [bookingData, tourismDirhams]);

  // Client-side "sufficient credit" flag — availableCreditLimit >=
  // total payable. null while the balance is still loading so the UI
  // doesn't flash the wrong scenario on first render.
  const hasSufficientCredit = useMemo(() => {
    if (agentAvailableBalance == null) return null;
    return Number(agentAvailableBalance) >= bookingSellingPrice;
  }, [agentAvailableBalance, bookingSellingPrice]);

  // No viable payment path: insufficient credit AND per-agent Card
  // payment is blocked. Drives the "Booking Cannot Be Completed"
  // banner and disables Confirm Booking.
  const noPaymentPathAvailable =
    hasSufficientCredit === false && !agentCardPaymentEnabled;

  // ── Payment Mode availability ─────────────────────────────────────────
  // Three scenarios (per client spec):
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

  // Keep the selected Payment Type valid for the currently available options.
  // When the option set changes (e.g. the restriction kicks in and removes
  // Credit Limit), auto-select the first remaining option — which also
  // satisfies "if only one valid option exists, select it by default".
  useEffect(() => {
    if (paymentModeOptions.length === 0) return;
    if (!paymentModeOptions.some((o) => o.value === paymentMode)) {
      setPaymentMode(paymentModeOptions[0].value);
    }
  }, [paymentModeOptions, paymentMode]);

  // Client rule, compared against the CURRENT date (not check-in):
  //   • today ≤ deadline (deadline still UPCOMING) → SHOW the
  //     "Voucher Now / Voucher Later" choice and let it work normally —
  //     Voucher Later (auto-cancel on the deadline) is meaningful while the
  //     deadline is in the future.
  //   • today > deadline (deadline PASSED, = isOutsideDeadline) → HIDE the
  //     choice and force "Book Now & Voucher Now" → RECONFIRMED, since
  //     Voucher Later would auto-cancel immediately.
  // Only shown for Available + refundable rates that actually have a
  // deadline. On-request and non-refundable flows never show the choice.
  const showVoucherChoice =
    !isOnRequestRate &&
    !isNonRefundableRate &&
    !!cancellationDeadline &&
    !isOutsideDeadline;

  // Resolved status that will travel to the backend on
  // payload.bookingFlowStatus. Computed once here so the UI banner and
  // the submit payload stay in lockstep.
  const resolvedBookingFlowStatus = (() => {
    if (isOnRequestRate) return "REQUESTED";
    if (isNonRefundableRate) return "RECONFIRMED";
    // Deadline already passed → force "Book Now & Voucher Now" → RECONFIRMED.
    if (isOutsideDeadline) return "RECONFIRMED";
    // Within deadline → respect the radio choice.
    return bookingConfirmation === "Book Now & Voucher later"
      ? "CONFIRMED"
      : "RECONFIRMED";
  })();

  // Reset bookingConfirmation back to "Book & Voucher" whenever the
  // "Voucher Later" choice no longer applies (non-refundable rate, or
  // we're still inside the cancellation window). Without this reset, a
  // user who picked "later" on a different rate could carry that
  // selection over and end up sending the wrong flow status downstream.
  useEffect(() => {
    if (!bookingData?.selectedRate) return;
    if (!showVoucherChoice && bookingConfirmation !== "Book & Voucher") {
      setBookingConfirmation("Book & Voucher");
    }
    // When the choice card isn't shown, there's nothing for the user to
    // pick — clear the "made a choice" flag so that if the card later
    // re-appears (e.g. they switch back to an in-deadline refundable rate)
    // no option is pre-selected.
    if (!showVoucherChoice && voucherChoiceMade) {
      setVoucherChoiceMade(false);
      setVoucherChoiceError(false);
    }
  }, [bookingData, bookingConfirmation, showVoucherChoice, voucherChoiceMade]);

  // ── Hotel Booking History snapshot ────────────────────────────────────
  // Posts the search context to /api/search-history/save the moment the
  // page loads, so the admin Report → Hotel Booking History report still
  // shows the selection even if this tab is closed before the booking is
  // created. Keyed by a UUID persisted inside the sessionStorage
  // bookingData so refreshes update the same row instead of adding one.
  // Fire-and-forget: history bookkeeping must never block booking.
  //
  // AGENT sessions only — an admin (or staff) abandoning a booking must
  // not appear on the report. The backend save endpoint enforces the same
  // rule from the JWT roles.
  const isAgentSession = () => {
    const stored = (localStorage.getItem("userRole") || "")
      .split(",")
      .map((r) => r.trim().toLowerCase());
    const role =
      localStorage.getItem("currentActiveRole")?.toLowerCase() ||
      stored[0] ||
      "";
    return role === "agent";
  };

  const saveSearchHistorySnapshot = (data, rawJson) => {
    try {
      const p = data?.payload || {};
      const toDate = (v) => {
        if (!v) return null;
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d;
      };
      const cin = toDate(p.checkInDate);
      const cout = toDate(p.checkOutDate);
      const nights =
        cin && cout
          ? Math.max(1, Math.round((cout - cin) / 86400000))
          : Number(p.nightsCount) || null;
      const roomsArr = Array.isArray(p.rooms) ? p.rooms : [];
      const adults = roomsArr.reduce(
        (acc, r) => acc + (Number(r.adults) || 0),
        0,
      );
      const children = roomsArr.reduce(
        (acc, r) => acc + (Number(r.children) || 0),
        0,
      );
      const roomsGuests = roomsArr.length
        ? `${roomsArr.length} Room${roomsArr.length > 1 ? "s" : ""} · ` +
          `${adults} Adult${adults !== 1 ? "s" : ""}` +
          (children
            ? ` · ${children} Child${children > 1 ? "ren" : ""}`
            : "")
        : null;
      axiosInstance
        .post("/api/search-history/save", {
          contextKey: data.historyContextKey,
          agentId: Number(p.agentId) || null,
          agentName: p.agentName || null,
          hotelCode: p.hotelCode || null,
          hotelName:
            data?.hotelStaticData?.hotelName ||
            data?.selectedRate?.hotelName ||
            null,
          destination: p.destinationLabel || null,
          nationality: p.nationalityLabel || p.nationality || null,
          employeeId: p.employeeId || null,
          employeeName: p.employeeName || null,
          checkIn: p.checkInDate || null,
          checkOut: p.checkOutDate || null,
          nights,
          roomsGuests,
          sellingPrice: Number(data?.selectedRate?.rate) || null,
          currency: "AED",
          bookingDataJson: rawJson || null,
        })
        .catch((err) =>
          console.warn("search-history save failed (non-fatal):", err),
        );
    } catch (err) {
      console.warn("search-history snapshot skipped:", err);
    }
  };

  // Flags the history snapshot as booked so it drops off the admin
  // "Hotel Booking History" (abandoned searches) report. Reads the key
  // from sessionStorage too because the post-payment resume path can run
  // before the bookingData state has been populated.
  const markSearchHistoryConfirmed = () => {
    try {
      const stored = sessionStorage.getItem("bookingData");
      const key =
        bookingData?.historyContextKey ||
        (stored ? JSON.parse(stored).historyContextKey : null);
      if (!key) return;
      axiosInstance
        .post(`/api/search-history/confirm/${key}`)
        .catch((err) =>
          console.warn("search-history confirm failed (non-fatal):", err),
        );
    } catch (err) {
      console.warn("search-history confirm skipped:", err);
    }
  };

  // Load bookingData once
  useEffect(() => {
    const storedData = sessionStorage.getItem("bookingData");
    if (storedData) {
      const parsedData = JSON.parse(storedData);
      // Stable per-selection key for the history row — persisted back into
      // sessionStorage so a page refresh reuses the same row instead of
      // creating a duplicate. Agent sessions only (see isAgentSession).
      if (isAgentSession()) {
        if (!parsedData.historyContextKey) {
          parsedData.historyContextKey =
            (window.crypto?.randomUUID && window.crypto.randomUUID()) ||
            `hbh-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          sessionStorage.setItem("bookingData", JSON.stringify(parsedData));
        }
        saveSearchHistorySnapshot(parsedData, JSON.stringify(parsedData));
      }
      setBookingData(parsedData);

      // Initialize rooms with guests
      const initialRooms = parsedData.payload.rooms.map((room) => ({
        ...room,
        guests: Array.from({ length: room.adults + room.children }, (_, i) => ({
          salutation: "",
          firstName: "",
          middleName: "",
          lastName: "",
          gender: "",
          isChild: i >= room.adults,
        })),
      }));
      setRooms(initialRooms);
    }
  }, []);

  // Post-payment resume. DummyPaymentPage lands us back here with
  // location.state.resumeCreate = true once the operator finishes the dummy
  // gateway flow. React state (rooms / pendingPayload) is lost across the
  // detour, so the resume rebuilds the create call from the payload we
  // persisted to sessionStorage under "hbpPendingCreatePayload" just before
  // navigating away. On success we go to the Hotel Booking List (per client
  // requirement) rather than the booking detail page, and the row will
  // surface as ReConfirmed because the backend's BookingStatusEngine puts
  // typical online-payment bookings on the RECONFIRMED engine status (the
  // list / detail views format that engine value via formatFlowStatus).
  //
  // Guards:
  //   • The flag is stripped from history immediately so a reload / back
  //     doesn't re-fire the create.
  //   • sessionStorage is cleared right after read so a stray landing on
  //     this URL with a stale flag can't replay an old payload.
  //   • The credit-check step in confirmBooking() is intentionally skipped
  //     — the operator has already paid via the gateway. Everything else
  //     mirrors the existing success path (same endpoint, same toast), plus
  //     "RECONFIRMED" in the accepted status list since that's what this
  //     path's bookings (Non-Refundable / Voucher-Now, insufficient credit)
  //     actually come back as — without it, the redirect to the Booking List
  //     below never ran even though the booking was created successfully.
  // ── CC Avenue return handling ──
  //   CC Avenue's redirect is a real browser navigation away to their domain
  //   and back (via the backend's /api/payment/ccavenue/response redirect),
  //   so — unlike the dummy-gateway flow above — React Router `state` never
  //   survives the round trip. The backend instead appends the outcome as a
  //   ?ccavenueOrderId=&ccavenueStatus= query string when it 302s the
  //   browser back to this page. The status query param is only a hint —
  //   before finalising anything we re-verify it against
  //   GET /api/payment/ccavenue/status/{orderId}, which reflects wha
  //   backend actually decrypted from CC Avenue, so a tampered/stale URL
  //   can't force a booking through.
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const ccavenueOrderId = searchParams.get("ccavenueOrderId");
    const ccavenueStatus = searchParams.get("ccavenueStatus");

    const resumeFromState = !!location.state?.resumeCreate;
    const resumeFromCCAvenue = !!ccavenueOrderId;
    if (!resumeFromState && !resumeFromCCAvenue) return;

    // Strip the resume signal from history right away so remounts / reloads
    // don't re-trigger. Do it before the async work so a fast re-render
    // can't race the effect.
    navigate(location.pathname, { replace: true, state: {} });

    const readPendingPayload = () => {
      const stored = sessionStorage.getItem("hbpPendingCreatePayload");
      sessionStorage.removeItem("hbpPendingCreatePayload");
      if (!stored) return null;
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error("Malformed persisted create payload", e);
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
          "/api/hotel-booking/create",
          payload,
        );
        const bookingResponse = response.data;
        if (
          bookingResponse &&
          bookingResponse.status &&
          (bookingResponse.status.toUpperCase() === "CONFIRMED" ||
            bookingResponse.status.toUpperCase() === "RECONFIRMED" ||
            bookingResponse.status.toUpperCase() === "NOT CONFIRMED" ||
            bookingResponse.status.toUpperCase() === "ON REQUEST") &&
          bookingResponse.bookingId != 0
        ) {
          toast.success(
            bookingResponse.message || "Booking created after payment.",
          );
          markSearchHistoryConfirmed();
          setShowConfirmModal(false);
          navigate(postBookingListRoute);
        } else {
          const beMsg = (bookingResponse && bookingResponse.message) || null;
          toast.error(beMsg || "Booking submission failed. Please try again.");
        }
      } catch (err) {
        const beMsg =
          err?.response?.data?.message || err?.response?.data?.error || null;
        console.error("Error finalising booking after payment:", err);
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
          `/api/payment/ccavenue/finalize/${ccavenueOrderId}`,
        );
        const bookingResponse = response.data;
        if (
          bookingResponse &&
          bookingResponse.status &&
          (bookingResponse.status.toUpperCase() === "CONFIRMED" ||
            bookingResponse.status.toUpperCase() === "RECONFIRMED" ||
            bookingResponse.status.toUpperCase() === "NOT CONFIRMED" ||
            bookingResponse.status.toUpperCase() === "ON REQUEST") &&
          bookingResponse.bookingId &&
          bookingResponse.bookingId != 0
        ) {
          toast.success(
            bookingResponse.message || "Booking created after payment.",
          );
          markSearchHistoryConfirmed();
          setShowConfirmModal(false);
          // Payload is no longer needed — the backend has it and has now
          // used it. Clear stale state so a later reload can't confuse
          // this flow with a fresh booking.
          sessionStorage.removeItem("hbpPendingCreatePayload");
          navigate(postBookingListRoute);
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
        console.error("Post-payment finalize failed:", err);
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
      // Dummy-gateway path (unchanged) — payment "succeeded" locally, go
      // straight to create.
      const payload = readPendingPayload();
      if (!payload) return;
      finalizeDummyCreate(payload);
      return;
    }

    // CC Avenue path — verify server-side, then let the backend finalize.
    (async () => {
      if (ccavenueStatus !== "success") {
        toast.error("Payment was not completed. Please try again.");
        sessionStorage.removeItem("hbpPendingCreatePayload");
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
          sessionStorage.removeItem("hbpPendingCreatePayload");
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
  // never fires on the normal flow. The browser only respects this if
  // the user has interacted with the page in this session (which they
  // certainly have — they just came back from paying).
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

  const handleGuestChange = (roomIndex, guestIndex, field, value) => {
    setRooms((prevRooms) => {
      const updatedRooms = [...prevRooms];
      updatedRooms[roomIndex].guests[guestIndex][field] = value;
      return updatedRooms;
    });

    // Auto-populate Primary Guest if Room 1 Adult 1
    if (roomIndex === 0 && guestIndex === 0) {
      if (["salutation", "firstName", "lastName"].includes(field)) {
        setPrimaryGuest((prev) => ({
          ...prev,
          [field]: value,
        }));

        // Clear validation error for primary guest field
        if (validationErrors[field]) {
          setValidationErrors((prev) => {
            const updated = { ...prev };
            delete updated[field];
            return updated;
          });
        }
      }
    }

    // Clear validation error when user starts typing
    const guestKey = `room_${roomIndex}_guest_${guestIndex}_${field}`;
    if (validationErrors[guestKey]) {
      setValidationErrors((prev) => {
        const updated = { ...prev };
        delete updated[guestKey];
        return updated;
      });
    }
  };

  const handlePrimaryGuestChange = (field, value) => {
    setPrimaryGuest((prev) => ({ ...prev, [field]: value }));

    // Real-time validation for email format
    if (field === "email" && value.trim() !== "") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        setValidationErrors((prev) => ({
          ...prev,
          email: "Please enter a valid email address",
        }));
        return;
      }
    }

    // Real-time validation for phone length
    if (field === "phone" && value.trim() !== "") {
      if (value.trim().length > 15) {
        setValidationErrors((prev) => ({
          ...prev,
          phone: "Phone number cannot exceed 15 digits",
        }));
        return;
      }
    }

    // Clear validation error when user starts typing
    if (validationErrors[field]) {
      setValidationErrors((prev) => {
        const updated = { ...prev };
        delete updated[field];
        return updated;
      });
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

 

  const validateForm = () => {
    const errors = {};
    let hasErrors = false;

    // Primary-guest validation removed — the Lead Passenger card
    // has been hidden. The Guest Details grid above is the single
    // source of customer details; the submit payload derives
    // `primaryGuest` from Room 1 / Guest 1 at build time. If the
    // inputs ever come back, restore the
    // `if (!primaryGuest.<field>) { ... }` blocks here.

    // Validate Guest fields in rooms
    rooms.forEach((room, roomIndex) => {
      room.guests.forEach((guest, guestIndex) => {
        const guestKey = `room_${roomIndex}_guest_${guestIndex}`;

        if (!guest.salutation || guest.salutation.trim() === "") {
          errors[`${guestKey}_salutation`] = "Salutation is required";
          hasErrors = true;
        }
        if (!guest.firstName || guest.firstName.trim() === "") {
          errors[`${guestKey}_firstName`] = "First Name is required";
          hasErrors = true;
        }
        if (!guest.lastName || guest.lastName.trim() === "") {
          errors[`${guestKey}_lastName`] = "Last Name is required";
          hasErrors = true;
        }
        // Gender validation removed — the field has been hidden
        // from the Guest Details grid per spec.
      });
    });

    return { errors, hasErrors };
  };

  // const checkIn = new Date(bookingData.payload.checkInDate);
  // const checkOut = new Date(bookingData.payload.checkOutDate);

  // // // Calculate difference in milliseconds → convert to days
  // const nights = Math.max(
  //   1,
  //   Math.round((checkOut - checkIn) / (1000 * 60 * 60 * 24))
  // );

  // Step 1 in confirm flow: validate, fetch policies + T&C, show consent modal.
  const openPolicyConsent = async () => {
    // Scenario 3 gate — no viable payment path (no credit + Card
    // disabled). Bail out before validation so a form-submit via Enter
    // key can't sneak past the disabled Confirm Booking button.
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

    // When the Voucher Now / Voucher Later choice is offered, the user must
    // pick one explicitly — nothing is pre-selected. Block until they do.
    if (showVoucherChoice && !voucherChoiceMade) {
      setVoucherChoiceError(true);
      toast.error("Please select a booking option to continue.");
      return;
    }

    const hotelId = bookingData?.selectedRate?.hotelId;
    if (!hotelId) {
      toast.error("Hotel reference missing — cannot fetch policies.");
      return;
    }

    setPolicyAccepted(false);
    setShowPolicyModal(true);
    setPoliciesLoading(true);
    try {
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
        // Accept multiple shapes:
        //  - List<{description}>   ← current backend
        //  - List of plain strings
        //  - Plain string
        //  - { termsAndConditions } / { data } / { message }
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
          tc = d?.termsAndConditions || d?.terms || d?.data || d?.message || "";
        }
        setTermsAndConditions(tc);
      } else {
        setTermsAndConditions("");
      }
    } catch (err) {
      console.error("policies/T&C fetch error", err);
    } finally {
      setPoliciesLoading(false);
    }
  };

  // Step 2: user accepted policies → build payload + show order summary modal.
  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    const { errors, hasErrors } = validateForm();

    if (hasErrors) {
      setValidationErrors(errors);
      toast.error("Please fill in all required fields correctly.");
      return;
    }

    // ✅ Clear validation errors before submission
    setValidationErrors({});

    try {
      setIsSubmitting(true);

      // ---------------------------
      // ✅ Construct booking payload
      // ---------------------------

      // Calculate nights difference between check-in and check-out
      const cinStr = toLocalDateTime(bookingData.payload.checkInDate);
      const coutStr = toLocalDateTime(bookingData.payload.checkOutDate);
      const checkIn = new Date(cinStr);
      const checkOut = new Date(coutStr);
      const nights = Math.max(
        1,
        Math.round((checkOut - checkIn) / (1000 * 60 * 60 * 24)),
      );

      const payload = {
        agentId: bookingData.payload.agentId || null,
        apiId: bookingData.payload.apiId || null,
        hotelId: selectedRate.hotelId,
        hotelName: bookingData.hotelStaticData.hotelName,
        address: bookingData.hotelStaticData.address,
        starRating: bookingData.hotelStaticData.starRating,
        checkInDate: cinStr,
        checkOutDate: coutStr,
        nights: nights,
        // employeeId is selected in HotelSearch's "Booking Done By Employee"
        // dropdown (optional). It flows here via bookingData.payload and
        // gets persisted on the new HotelBooking row.
        employeeId: bookingData?.payload?.employeeId || null,
        roomStatus: bookingData.selectedRate.roomStatus,
        cancellationPolicy:
          bookingData.selectedRate.cancellationPolicy?.map(
            (p) => p.policyText,
          ) || [],

        // deadlineDate = checkInDate − maxCancellationNights, at midnight —
        // the same value the backend stores and the Booking List shows.
        // `cancellationDeadline` (computed above from the hotel's
        // maxCancellationNights) already holds this; here we just format it
        // as a LocalDateTime string. Null when the deadline isn't available
        // yet. NOTE: the backend recomputes/overrides this on create, so it
        // is authoritative regardless — we send the matching value purely so
        // the request payload is consistent with what's stored.
        deadlineDate: cancellationDeadline
          ? `${cancellationDeadline.getFullYear()}-${String(
              cancellationDeadline.getMonth() + 1,
            ).padStart(2, "0")}-${String(
              cancellationDeadline.getDate(),
            ).padStart(2, "0")}T00:00:00`
          : null,
        // New Payload Mapping Logic (Around line 331)
        isBookandVoucher: (() => {
          if (selectedRate.roomStatus === "Available") {
            // User selects from radio buttons when available
            return bookingConfirmation === "Book & Voucher" ? true : false;
          } else {
            // For "On Request" or any other status, avoid pushing inappropriate voucher flags
            // Adjust this fallback to what's expected by the backend for "On Request"
            return false;
          }
        })(),

        // ✅ Primary guest details
        // The Lead Passenger card is hidden, so the name fields are
        // sourced from the Lead-marked guest in the Guest Details
        // grid above (defaults to Room 1 / Guest 1). Email / phone /
        // passportNo / agentLpo are no longer collected on the form
        // and are sent as empty strings. The backend ignores empty
        // optional values, so the /api/hotel-booking/create contract
        // is preserved.
        primaryGuest: (() => {
          const leadGuest =
            rooms?.[leadIndex.roomIdx]?.guests?.[leadIndex.guestIdx] || {};
          return {
            salutation: leadGuest.salutation || "",
            firstName: leadGuest.firstName || "",
            middleName: leadGuest.middleName || "",
            lastName: leadGuest.lastName || "",
            email: "",
            phone: "",
            passportNo: "",
            agentLpo: "",
            nativeCountry: bookingData.payload.nationality,
          };
        })(),

        // ✅ Room & guest breakdown
        //
        // Multi-room aware: when RoomList.jsx sent a per-room
        // `roomBreakdown` array (one entry per booked room), each room
        // here pulls its OWN roomCategory / mealPlan / rate / etc. from
        // that slot. Without `roomBreakdown` (every legacy single-room
        // flow), `slot` falls back to the combined `selectedRate` and
        // behaves exactly as before — so no other flow is affected.
        //
        // This is what unblocks multi-room booking: the backend needs
        // each room's real category (e.g. "Junior Suite") to find
        // availability — sending the combined label
        // ("Junior Suite + Junior Suite") for every room makes the
        // availability check fail with "Requested rooms are not
        // available for selected dates."
        rooms: rooms.map((room, roomIndex) => {
          const slot =
            bookingData.roomBreakdown?.[roomIndex] || bookingData.selectedRate;
          return {
            roomNo: roomIndex + 1,
            roomCategory: slot.roomCategory, // per room
            mealPlan: slot.mealPlan,
            nonRefundable:
              slot.nonRefundable === true || slot.nonRefundable === "true"
                ? true
                : false,
            currency: slot.currency || "AED",
            rate: slot.rate,
            rateWithoutMarkup: slot.rateWithoutMarkup,
            adults: room.adults,
            children: room.children,
            childAges: room.childAges || [],
            guests: room.guests.map((guest, gi) => ({
              salutation: guest.salutation,
              firstName: guest.firstName,
              middleName: guest.middleName || "",
              lastName: guest.lastName,
              gender: guest.gender,
              isChild: guest.isChild,
              // Per-guest child age (from the room's childAges list). Persisted
              // on HotelGuestDetails and shown on the detail view + voucher.
              // Null for adults.
              childAge: guest.isChild
                ? room.childAges?.[gi - room.adults] ?? null
                : null,
              // Lead flag mirrors the gov / SC / Student flows.
              // Backend ignores unknown fields, so this stays
              // backward-compatible with /api/hotel-booking/create.
              isLead:
                roomIndex === leadIndex.roomIdx && gi === leadIndex.guestIdx,
            })),
          };
        }),

        // ✅ Additional remarks
        remarks: remarks || "",
        // Location column in the detail view's Booking History. The IP
        // Address column is stamped server-side from the create request
        // (each system's own IPv4), so it is not sent here.
        bookingLocation: clientNetwork.bookingLocation,
        specialRequests: specialRequests,
        // Optional "Booking done for" free-text → persisted and shown as
        // "Contact: <value>/<agentName>" on the detail view + voucher.
        bookingDoneFor: bookingDoneFor.trim() || null,
        tourismDirhams: parseFloat(tourismDirhams) || 0,
        bookingConfirmation: bookingConfirmation || "Book & Voucher",
        // Resolved status the booking should land on, per the
        // confirm-booking flowchart. See the derivation block near the
        // top of this component for the exact rules. Backend can use
        // this directly without having to re-derive it from
        // (roomStatus, nonRefundable, deadlineDate, bookingConfirmation).
        bookingFlowStatus: resolvedBookingFlowStatus,
        isOutsideDeadline,

        // Parent booking code for Edit -> Search -> Book Again flow.
        // When set, backend generates child bookingCode like GLBIN37/1, GLBIN37/2...
        parentBookingCode: bookingData.payload.parentBookingCode || null,

        // ── 24 Hour Check-In: forward the optional flags from the search
        //    handoff payload through to the booking-create endpoint. The
        //    backend stamps these onto the HotelBooking row when present.
        //    Existing flows leave is24HourCheckin = false / times = null.
        is24HourCheckin: !!bookingData.payload.is24HourCheckin,
        checkInTime: bookingData.payload.checkInTime || null,
        checkOutTime: bookingData.payload.checkOutTime || null,
        // ── Religious flow: forward the marker set on bookingData by
        //    RoomList when religiousMode is on. Wrapper-only opt-in —
        //    every other flow sends nothing (backend defaults to false).
        isReligiousBooking: religiousMode || !!bookingData.isReligiousBooking,
        // ── Display currency ────────────────────────────────────────────
        // The currency the operator chose on the search page. `rate` is the
        // AED→target factor; the backend stores the code and computes the
        // converted amount from the AED total (display_amount). AED → 1, so
        // existing AED bookings persist the code "AED" with amount == total.
        displayCurrencyCode: displayCurrency.code,
        displayCurrencyRate: displayCurrency.factor,

        // ✅ Metadata
      };

      console.log("📦 Final booking payload:", payload);
      setPendingPayload(payload);
      setShowConfirmModal(true);
    } catch (err) {
      console.error("booking payload error", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ✅ Confirm and post API only on OK
  const confirmBooking = async () => {
    if (!pendingPayload) return;
    // Keep the Order Summary modal OPEN while the API runs so the
    // in-button "Processing..." spinner stays visible to the user.
    // We only dismiss it once the create call succeeds, just before
    // navigating to the booking list. Previously we closed the modal
    // BEFORE the await, so the loader flashed off-screen and the user
    // saw nothing happening.
    setIsSubmitting(true);

    try {
      // ✅ Step 1: Check agent credit status
      const agentId = pendingPayload.agentId;
      const requiredAmount = pendingPayload.rooms.reduce(
        (sum, r) => sum + (r.rate || 0),
        0,
      );

      console.log(
        "🔍 Checking credit for Agent:",
        agentId,
        "Amount:",
        requiredAmount,
      );

      const creditResponse = await axiosInstance.get(
        `/api/agent-credit-limit/check-sufficient-credit?agentId=${agentId}&requiredAmount=${requiredAmount}`,
      );

      if (creditResponse.data === false) {
        // ❌ Not enough credit.
        //
        //   • On Request rate (Refundable OR Non-Refundable) → ALWAYS
        //     proceeds at create, even when Card payment is disabled for
        //     the agent. The booking is created in "Not Confirmed" state
        //     pending the supplier's response (REQUESTED in the engine)
        //     and no credit is touched at create-time on the BE. The
        //     no-payment-path gate for these bookings lives on the detail
        //     page instead: Confirm (step 1) works, but RECONFIRM is
        //     blocked with "Booking Cannot Be Completed" while the agent
        //     still has no credit and no card (see BookingDetailedView).
        //
        //   • Available rate + Book Now & Voucher LATER → ALWAYS proceeds
        //     at create too, even with Card disabled. The backend
        //     (InhouseHotelBookingService Case 5 → "On Reconfirmation/
        //     Credit Card") creates the booking in Confirmed state
        //     WITHOUT touching the agent's credit — the deduction is
        //     deferred to the Reconfirm step. Like On Request, the
        //     no-payment-path gate fires on the detail page's RECONFIRM
        //     instead ("Booking Cannot Be Completed") while the agent
        //     still has no credit and no card.
        //
        //   • Everything else (Voucher NOW on Available rate, non-
        //     refundable, no voucher choice shown):
        //       – Card disabled → no viable payment path (no credit AND
        //         no card). Block the booking with the dedicated
        //         "Booking Cannot Be Completed" modal.
        //       – Card enabled → open "Online Payment Required",
        //         Pay / Cancel, and suppress the create call until
        //         payment completes.
        const isVoucherLater =
          bookingConfirmation === "Book Now & Voucher later";
        if (!isOnRequestRate && !isVoucherLater) {
          setInsufficientAmount(requiredAmount);
          setShowConfirmModal(false);
          if (!agentCardPaymentEnabled) {
            setShowNoPaymentPathModal(true);
            return;
          }
          setShowInsufficientModal(true);
          return; // stop here — handled by the online-payment popup
        }
        console.log(
          isOnRequestRate
            ? "ℹ️ Insufficient credit but On Request rate — proceeding with create; supplier response will gate downstream actions."
            : "ℹ️ Insufficient credit but Voucher Later selected — proceeding with create; credit will be deducted at Reconfirm.",
        );
      }

      // ✅ Step 2: Proceed to confirm booking
      console.log("✅ Credit check passed. Proceeding with booking...");

      // Tag this booking as paid via the agent's credit limit. If an
      // online-payment branch is added later (when credit is short),
      // that branch should send paymentMode = "ONLINE" instead so the
      // Booking List can label the row correctly.
      const response = await axiosInstance.post("/api/hotel-booking/create", {
        ...pendingPayload,
        paymentMode,
      });

      const bookingResponse = response.data;
      console.log("response:::", response);
      console.log("bookingResponse:::", bookingResponse);
      // Accept the create result when the BE flagged it created OR when
      // the status is one of the "booking exists now" labels the engine
      // can stamp. Case 5 (no-credit + Voucher Later) lands on
      // confirmationStatus="Confirmed" — already matched by the existing
      // "CONFIRMED" check; "NOT CONFIRMED" covers the engine's Not
      // Confirmed label used by other branches; "ON REQUEST" covers an
      // On-Request room's creation status (previously unmatched here, so
      // a successfully-created On-Request booking fell through to the
      // toast.error branch below and never redirected to the list).
      if (
        bookingResponse &&
        bookingResponse.status &&
        (bookingResponse.status.toUpperCase() === "CONFIRMED" ||
          bookingResponse.status.toUpperCase() === "NOT CONFIRMED" ||
          bookingResponse.status.toUpperCase() === "ON REQUEST") &&
        bookingResponse.bookingId != 0
      ) {
        toast.success(bookingResponse.message);
        markSearchHistoryConfirmed();
        // Dismiss the Order Summary modal only after success, so the
        // in-button spinner remained visible for the full call.
        setShowConfirmModal(false);
        // Dedicated 24-hour booking list when this page is rendered
        // via /hotel-booking-page-24hr; legacy hotel-booking-list
        // otherwise.
        navigate(postBookingListRoute);
      } else {
        // Surface the BE message so the operator can see WHY (e.g.
        // "Credit limit error: …", "Invalid request: …"). Falling back
        // to the generic "Please try again" when the BE returned an
        // empty body / no message.
        const beMsg = (bookingResponse && bookingResponse.message) || null;
        console.warn(
          "Booking create returned non-success status:",
          bookingResponse && bookingResponse.status,
          "message:",
          beMsg,
        );
        toast.error(beMsg || "Booking submission failed. Please try again.");
      }
    } catch (err) {
      // Network / non-2xx response. Pull the BE message out of the
      // axios error body when present so the operator can see what
      // actually failed instead of a generic "Please try again".
      const beMsg =
        err?.response?.data?.message || err?.response?.data?.error || null;
      console.error(
        "❌ Error in booking confirmation:",
        err?.response?.status,
        err?.response?.data,
        err,
      );
      toast.error(beMsg || "Booking submission failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Display currency carried over from the search/room-list (defaults to AED
  // ×1). `factor` is the AED→target multiplier. Rates stay AED internally and
  // in the booking payload — this only changes what's rendered.
  const displayCurrency =
    bookingData?.currency && typeof bookingData.currency === "object"
      ? {
          code: bookingData.currency.code || "AED",
          factor:
            Number(bookingData.currency.factor) > 0
              ? Number(bookingData.currency.factor)
              : 1,
        }
      : { code: "AED", factor: 1 };

  const formatPrice = (price) => {
    const converted = (Number(price) || 0) * displayCurrency.factor;
    return `${displayCurrency.code} ${converted.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const handleSpecialRequestToggle = (request) => {
    setSpecialRequests((prevRequests) =>
      prevRequests.includes(request)
        ? prevRequests.filter((item) => item !== request)
        : [...prevRequests, request],
    );
  };

  if (!bookingData) return <div>Loading booking data...</div>;

  const { hotelStaticData, payload, selectedRate } = bookingData;
  const tourismDirhamsAmount = parseFloat(tourismDirhams) || 0;
  const sellingPriceWithTd =
    (selectedRate?.roomRateBasedOnRoomCount || 0) + tourismDirhamsAmount;
  const totalPriceWithTd =
    (selectedRate?.roomRateBasedOnRoomCount_WithoutMarkup || 0) +
    tourismDirhamsAmount;
  console.log("bookingData:::", bookingData);

  // ── Quotation PDF ─────────────────────────────────────────────────────
  // Quotes what this page shows: hotel, stay and guests from the Booking
  // Summary, the Selling Price / New Total from Price Details (converted to
  // the display currency exactly like formatPrice) and the refund status /
  // deadline. Serves the Hotel, 24 Hour and Religious flows.
  const buildHotelQuotationPayload = () => {
    if (!selectedRate || !hotelStaticData || !payload) return null;
    const toDisplay = (aed) =>
      Math.round((Number(aed) || 0) * displayCurrency.factor * 100) / 100;
    const checkInAt = new Date(toLocalDateTime(payload.checkInDate));
    const checkOutAt = new Date(toLocalDateTime(payload.checkOutDate));
    const nights =
      isNaN(checkInAt.getTime()) || isNaN(checkOutAt.getTime())
        ? null
        : Math.max(
            1,
            Math.round((checkOutAt - checkInAt) / (1000 * 60 * 60 * 24)),
          );
    const nightsText = nights ? `${nights} Night${nights === 1 ? "" : "s"}` : "";
    const searchRooms = Array.isArray(payload.rooms) ? payload.rooms : [];
    const roomCount = searchRooms.length || 1;
    const describeGuests = (room) => {
      if (!room) return "";
      const adults = Number(room.adults) || 0;
      const children = Number(room.children) || 0;
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

    // Multi-room: one line per selected slot at its per-room rate (these sum
    // to the Selling Price). Single rate: one line at roomRateBasedOnRoomCount
    // (per-room rate x rooms searched), exactly the Selling Price row.
    const breakdown = Array.isArray(bookingData?.roomBreakdown)
      ? bookingData.roomBreakdown
      : [];
    const priceItems = breakdown.length
      ? breakdown.map((slot, i) => ({
          description: `Room ${slot.roomNo ?? i + 1} - ${
            slot.roomCategory || selectedRate.roomCategory || "Room"
          }`,
          details: [
            slot.mealPlan || selectedRate.mealPlan,
            describeGuests(searchRooms[i]),
            nightsText,
          ]
            .filter(Boolean)
            .join(", "),
          amount: toDisplay(slot.rate),
        }))
      : [
          {
            description: selectedRate.roomCategory || "Accommodation",
            details: [
              selectedRate.mealPlan,
              `${roomCount} Room${roomCount === 1 ? "" : "s"}`,
              nightsText,
            ]
              .filter(Boolean)
              .join(", "),
            amount: toDisplay(
              selectedRate.roomRateBasedOnRoomCount || selectedRate.rate,
            ),
          },
        ];
    if (tourismDirhamsAmount > 0) {
      priceItems.push({
        description: "Tourism Dirhams",
        details: "",
        amount: toDisplay(tourismDirhamsAmount),
      });
    }
    const linesTotal =
      Math.round(
        priceItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) *
          100,
      ) / 100;

    const cancellationPolicy = [];
    if (hasMixedRefundability) {
      cancellationPolicy.push(
        "This booking has both refundable and non-refundable rooms.",
      );
    } else if (isNonRefundableRate) {
      cancellationPolicy.push("Non-refundable rate.");
    } else if (cancellationDeadline) {
      cancellationPolicy.push(
        `Cancellation deadline: ${cancellationDeadline.toLocaleDateString(
          "en-GB",
          { day: "2-digit", month: "short", year: "numeric" },
        )}, 02:00 PM (UAE).`,
      );
    }

    return {
      bookingType:
        religiousMode || bookingData?.isReligiousBooking
          ? "RELIGIOUS"
          : force24Hour || payload.is24HourCheckin
            ? "HOTEL_24_HOUR"
            : "HOTEL",
      agentId: Number(payload.agentId) || null,
      currency: displayCurrency.code,
      serviceName: hotelStaticData.hotelName || selectedRate.hotelName || "",
      serviceSubtitle: hotelStaticData.address || "",
      customerName: leadName || null,
      details: [
        { label: "Check-in", value: formatDateTime(payload.checkInDate) },
        { label: "Check-out", value: formatDateTime(payload.checkOutDate) },
        { label: "Nights", value: nights ? String(nights) : "" },
        { label: "Rooms", value: String(roomCount) },
        {
          label: "Guests",
          value: searchRooms
            .map((room, i) => `Room ${i + 1}: ${describeGuests(room)}`)
            .join("\n"),
        },
        { label: "Meal Plan", value: selectedRate.mealPlan || "" },
        {
          label: "Star Rating",
          value: hotelStaticData.starRating
            ? `${hotelStaticData.starRating} Star`
            : "",
        },
        { label: "Room Status", value: selectedRate.roomStatus || "" },
        {
          label: "Refund Status",
          value:
            selectedRate.nonRefundable !== undefined
              ? isNonRefundableRate
                ? "Non-Refundable"
                : "Flexible"
              : "",
        },
      ],
      priceItems,
      // The New Total shown in Price Details; the line sum only covers a
      // rate that arrived without roomRateBasedOnRoomCount.
      totalAmount:
        sellingPriceWithTd > 0 ? toDisplay(sellingPriceWithTd) : linesTotal,
      cancellationPolicy,
    };
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column  hotel-booking-container">
      <TopBar />
      <div className="main-content">
        <Sidebar />
        <main className="content-wrapper py-4">
          <Container fluid="xl">
            {/* Results-page heading — UI only, mirrors the heading shown
                on /new-booking/hotel (or /new-booking/hotel-24hr) once
                results arrive. */}
            <div className="hs-page-heading">
              <h3 className="hs-page-heading-title d-inline-flex align-items-center gap-2">
                {force24Hour ? "24 Hours" : "Accommodation"}
                {religiousMode && (
                  <span
                    className="badge bg-warning-subtle text-warning border border-warning-subtle"
                    style={{ fontSize: "0.6em", padding: "3px 9px" }}
                    title="Religious flow — Mecca / Medina bookings"
                  >
                    Religious
                  </span>
                )}
              </h3>
            </div>
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
            {/* Guest Details Section */}
            <Form
              onSubmit={(e) => {
                e.preventDefault();
                openPolicyConsent();
              }}
            >
              <Row className="g-3">
                <Col lg={8} className="hbp-left-col">
                  {/* {Object.keys(validationErrors).length > 0 && (
                <Alert variant="danger" className="mb-3 d-flex align-items-center">
                  <strong className="me-2">✕</strong>
                  <div>
                    <Alert.Heading className="mb-0">
                      Please fix the validation errors
                    </Alert.Heading>
                  </div>
                </Alert>
              )} */}
                  <Card className="mb-2 shadow-sm border-0">
                    <Card.Header className="bg-light py-2">
                      <div className="d-flex align-items-center">
                        <Button
                          variant="outline-secondary"
                          size="sm"
                          onClick={() => navigate("/room-list")}
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
                      {/* Mixed-refundability notice — appears above the
                          per-room accordion whenever the booking has both
                          refundable and non-refundable rooms. Replaces the
                          per-row cancellation deadline text in that case
                          because a single deadline wouldn't apply across
                          all rooms. */}
                      {hasMixedRefundability && (
                        <div
                          className="mx-3 mt-3 mb-2 p-2 rounded border small"
                          style={{
                            borderColor: "#f59e0b",
                            background: "#fffbeb",
                            color: "#78350f",
                          }}
                        >
                          This booking has both refundable and non-refundable
                          rooms.
                        </div>
                      )}
                      <Accordion
                        alwaysOpen
                        defaultActiveKey={rooms.map((_, i) => i.toString())}
                        className="guest-details-accordion"
                      >
                        {rooms.map((room, roomIndex) => {
                          // Per-room category / meal plan from the
                          // multi-room breakdown when present (Room 1 gets
                          // its own roomCategory + mealPlan, Room 2 gets
                          // its own, etc.). Falls back to the aggregate
                          // selectedRate for legacy single-room flows that
                          // never populate roomBreakdown.
                          const slot =
                            bookingData?.roomBreakdown?.[roomIndex] ||
                            selectedRate;
                          const slotRoomNo = slot.roomNo ?? roomIndex + 1;
                          const slotCategory =
                            slot.roomCategory || selectedRate.roomCategory;
                          const slotMealPlan =
                            slot.mealPlan || selectedRate.mealPlan;
                          // Per-slot refundability: matches isNonRefundableRate
                          // (true | "true"). Anything else → refundable, so
                          // we surface the deadline. Refund deadline itself
                          // is hotel-wide (computed from maxCancellationNights
                          // + check-in) so all refundable slots share it.
                          const slotNonRefundable =
                            slot.nonRefundable === true ||
                            slot.nonRefundable === "true";
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
                                    Room {slotRoomNo} - {slotCategory}
                                  </span>
                                  {slotMealPlan && (
                                    <Badge
                                      bg="light"
                                      text="dark"
                                      className="ms-2"
                                    >
                                      <FaUtensils className="me-1" />
                                      {slotMealPlan}
                                    </Badge>
                                  )}
                                  {/* Per-room deadline text — hidden when
                                      the booking has a mix of refundable and
                                      non-refundable rooms; the mixed notice
                                      above the accordion replaces every
                                      row's individual deadline in that case
                                      so we don't surface a date that only
                                      applies to some rooms. */}
                                  {!hasMixedRefundability &&
                                    slotRefundDeadlineLabel && (
                                      <span
                                        className="ms-2 small fw-normal"
                                        style={{ opacity: 0.9 }}
                                      >
                                        | Deadline: {slotRefundDeadlineLabel}
                                      </span>
                                    )}
                                </h6>
                              </Accordion.Header>
                              <Accordion.Body className="p-3">
                                {/* Column headers — mirrors the
                                  gov / SC / Student booking pages so
                                  every Guest Details grid in the
                                  system looks identical. */}
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
                                  return (
                                    <div
                                      key={guestIndex}
                                      className="guest-row mb-2"
                                    >
                                      <Row className="align-items-center g-2">
                                        <Col md={2}>
                                          <span className="fw-semibold text-muted">
                                            {guest.isChild
                                              ? `Child ${
                                                  guestIndex - room.adults + 1
                                                } (Age: ${
                                                  room.childAges[
                                                    guestIndex - room.adults
                                                  ]
                                                })`
                                              : `Adult ${guestIndex + 1}`}
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
                                        {/* Gender column hidden by
                                        request — the field is no
                                        longer collected on this
                                        page. The state `guest.gender`
                                        keeps its default empty
                                        string so the payload still
                                        carries the key and the
                                        backend contract stays
                                        intact. */}
                                        <Col md={2} className="text-center">
                                          {/* Lead radio — only adults can
                                          be lead. Disabled+greyed for
                                          children so the row still
                                          aligns. The Lead-marked guest
                                          drives the `primaryGuest`
                                          object in the submitted
                                          payload, replacing the
                                          (hidden) "Lead Passenger"
                                          card above. */}
                                          <Form.Check
                                            type="radio"
                                            name="hbp-lead-guest"
                                            id={`hbp-lead-${roomIndex}-${guestIndex}`}
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

                  {/* Lead Passenger / Primary Guest card hidden by
                      request — the Guest Details grid above is the
                      single source of customer details. The submit
                      payload still carries a `primaryGuest` object:
                      `buildPayload` derives it from Room 1 / Guest 1
                      (the first adult on the form) so the
                      /api/hotel-booking/create contract stays intact.
                      The booking-confirmation radios further down on
                      the page are unrelated and unchanged. */}

                  {/* Tourism Dirhams & Special Requests (Remarks
                      input hidden by request — the state `remarks`
                      keeps its default empty string so the payload
                      still carries the key). */}
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
                      {/* <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>Tourism Dirhams (AED)</Form.Label>
                          <Form.Control
                            type="number"
                            value={tourismDirhams}
                            onChange={(e) => setTourismDirhams(e.target.value)}
                            placeholder="0"
                            min="0"
                            step="0.01"
                          />
                        </Form.Group>
                      </Col> */}
                      <Col md={12}>
                        <Form.Group className="mb-3">
                          {/* <Form.Label>Special Request</Form.Label> */}
                          <div className="special-request-grid">
                            {SPECIAL_REQUEST_OPTIONS.map((request) => (
                              <Form.Check
                                key={request}
                                type="checkbox"
                                id={`special-request-${request.replace(/[^a-zA-Z0-9]/g, "-")}`}
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
                      {/*
                        Booking-confirmation prompt — per the
                        confirm-booking flowchart:
                          • On-Request rates    → REQUESTED (auto, no
                            user choice; supplier decides later)
                          • Non-refundable      → RECONFIRMED (auto)
                          • Within deadline     → RECONFIRMED (auto)
                          • Outside deadline    → user picks Voucher
                            Now (RECONFIRMED) or Voucher Later
                            (CONFIRMED + auto-cancel on deadline)
                        showVoucherChoice captures that last case.
                      */}
                      {/* "Booking will be created as: …" banner hidden by
                          request. resolvedBookingFlowStatus is still
                          computed above and sent on the payload — only this
                          informational Alert is suppressed. */}
                      {false && (
                        <Col md={12}>
                          <Alert
                            variant={
                              resolvedBookingFlowStatus === "RECONFIRMED"
                                ? "success"
                                : resolvedBookingFlowStatus === "CONFIRMED"
                                  ? "warning"
                                  : "info"
                            }
                            className="mb-3 py-2"
                          >
                            <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                              <div className="small">
                                <strong>Booking will be created as: </strong>
                                <Badge
                                  bg={
                                    resolvedBookingFlowStatus === "RECONFIRMED"
                                      ? "success"
                                      : resolvedBookingFlowStatus ===
                                          "CONFIRMED"
                                        ? "warning"
                                        : "info"
                                  }
                                  text={
                                    resolvedBookingFlowStatus === "CONFIRMED"
                                      ? "dark"
                                      : undefined
                                  }
                                >
                                  {resolvedBookingFlowStatus}
                                </Badge>
                              </div>
                              <div className="small text-muted">
                                {isOnRequestRate
                                  ? isOutsideDeadline
                                    ? "On-Request rate (outside deadline) — supplier confirms with CONFIRMED or SOLD OUT."
                                    : "On-Request rate — supplier confirms with RECONFIRMED or SOLD OUT."
                                  : isNonRefundableRate
                                    ? "Non-refundable rate — locked in at booking."
                                    : isOutsideDeadline
                                      ? bookingConfirmation ===
                                        "Book Now & Voucher later"
                                        ? "Outside deadline — will be auto-cancelled if not re-confirmed before the deadline."
                                        : "Outside deadline — voucher issued immediately."
                                      : "Within deadline — free cancellation window still open."}
                              </div>
                            </div>
                            {/* Cancellation-deadline line hidden by request.
                              The `cancellationDeadline` / `isOutsideDeadline`
                              values are still computed above and continue to
                              drive the booking-flow status — only this
                              display row is suppressed. */}
                            {false && cancellationDeadline && (
                              <div className="small text-muted mt-1">
                                Cancellation deadline:{" "}
                                <strong>
                                  {cancellationDeadline.toLocaleDateString()}
                                </strong>
                                {isOutsideDeadline
                                  ? " (passed)"
                                  : " (upcoming)"}
                              </div>
                            )}
                          </Alert>
                        </Col>
                      )}
                      {/* "Are you sure to continue booking?" voucher choice
                          was moved to the right Booking Summary column, just
                          above the Confirm Booking button (UI position only). */}
                    </Row>
                  </Card>

                  {/* Payment Mode — sits under Special Requests on the
                      left column. Drives the paymentMode field on the
                      /api/hotel-booking/create payload.

                      Three-scenario UI:
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

                  {/* "Booking Done By Employee" was moved into the
                      HotelSearch criteria (optional). The chosen
                      employeeId now rides on bookingData.payload and is
                      sent to /api/hotel-booking/create from there. */}
                </Col>

                {/* Right sticky column — Booking Summary + Price */}
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
                            {hotelStaticData.hotelName}
                          </div>
                          <div className="text-muted small mb-2">
                            {hotelStaticData.address}
                          </div>
                          <div className="d-flex flex-wrap align-items-center gap-2">
                            <span className="badge bg-warning text-dark">
                              ⭐ {hotelStaticData.starRating} Star
                            </span>
                            {selectedRate?.nonRefundable !== undefined &&
                              getRefundStatusBadge(
                                selectedRate.nonRefundable === true ||
                                  selectedRate.nonRefundable === "true"
                                  ? "NON REFUNDABLE"
                                  : "FLEXIBLE",
                              )}
                           
                          </div>
                        </div>

                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">
                            <FaCalendarAlt className="me-2 text-primary" />
                            Check-in
                          </div>
                          <div className="hbp-summary-value">
                            {formatDateTime(payload.checkInDate)}
                          </div>
                        </div>
                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">
                            <FaCalendarAlt className="me-2 text-primary" />
                            Check-out
                          </div>
                          <div className="hbp-summary-value">
                            {formatDateTime(payload.checkOutDate)}
                          </div>
                        </div>
                        <div className="hbp-summary-row align-items-start">
                          <div className="hbp-summary-label">
                            <FaUsers className="me-2 text-primary" />
                            Guests
                          </div>
                          <div className="hbp-summary-value text-end">
                            {payload.rooms.map((room, i) => (
                              <div key={i} className="small">
                                Room {i + 1}: {room.adults} Adult
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
                            {selectedRate.mealPlan}
                          </div>
                        </div>
                         <div className="hbp-summary-row">
                          <div className="hbp-summary-label">
                            <FaUtensils className="me-2 text-primary" />
                           Room Status
                          </div>
                          <div className="hbp-summary-value">
                            {selectedRate.roomStatus}
                          </div>
                        </div>
                      </Card.Body>
                    </Card>

                    <Card className="shadow-sm rounded-3 border-0 hbp-price-card">
                      <Card.Header className="bg-light py-2">
                        <h6 className="mb-0 fw-bold">Price Details</h6>
                      </Card.Header>
                      <Card.Body className="p-3">
                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">Selling Price</div>
                          <div className="hbp-summary-value">
                            {formatPrice(
                              selectedRate?.roomRateBasedOnRoomCount || 0,
                            )}
                          </div>
                        </div>
                        {/* <div className="hbp-summary-row">
                          <div className="hbp-summary-label">
                            Tourism Dirhams
                          </div>
                          <div className="hbp-summary-value">
                            {formatPrice(tourismDirhamsAmount)}
                          </div>
                        </div> */}
                        <hr className="my-2" />
                        <div className="hbp-summary-row fw-bold">
                          <div className="hbp-summary-label text-danger">
                            New Total
                          </div>
                          <div className="hbp-summary-value text-danger">
                            {formatPrice(sellingPriceWithTd)}
                          </div>
                        </div>
                        {activeUserRole === "ADMIN" && (
                          <div className="hbp-summary-row mt-2">
                            <div className="hbp-summary-label text-muted small">
                              Total (incl. markup)
                            </div>
                            <div className="hbp-summary-value text-success fw-bold">
                              {formatPrice(totalPriceWithTd)}
                            </div>
                          </div>
                        )}
                      </Card.Body>
                    </Card>

                    {/* Quotation — under the Price Details it quotes, above
                        the booking decision and Confirm Booking. */}
                    <QuotationPdfCard buildPayload={buildHotelQuotationPayload} />

                    {/* Booking-confirmation voucher choice — shown above the
                        Confirm Booking button in the Booking Summary so the
                        user makes the Voucher Now / Voucher Later decision
                        right before confirming. */}
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
                                id="book-voucher"
                                name="bookingConfirmation"
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
                                id="book-now-voucher-later"
                                name="bookingConfirmation"
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
                        onClick={() => navigate("/room-list")}
                        className="flex-grow-1"
                      >
                        Back
                      </Button>
                      <Button
                        variant="primary"
                        type="button"
                        onClick={openPolicyConsent}
                        className="flex-grow-1"
                        disabled={noPaymentPathAvailable}
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

              {/* ✅ Policies + T&C Consent Modal (step before order summary) */}
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
                    Hotel Policies &amp; Terms
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
                      {/* Cancellation Policy — the room's refundability takes
                          precedence over the hotel-level policy. For a
                          Non-Refundable rate the hotel policy is suppressed
                          and we render a fixed "no refund" notice instead. */}
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
                              100% cancellation charges apply from the time of
                              booking.
                            </div>
                          </div>
                        ) : policyData?.policies?.cancellationPolicy?.length ? (
                          policyData.policies.cancellationPolicy.map(
                            (p, idx) => (
                              <div key={idx} className="policy-item">
                                <div className="policy-text">
                                  {p.policyText || "—"}
                                </div>
                                {(p.fromDate || p.toDate) && (
                                  <div className="policy-meta">
                                    Valid{" "}
                                    {p.fromDate
                                      ? new Date(
                                          p.fromDate,
                                        ).toLocaleDateString()
                                      : "—"}
                                    {" – "}
                                    {p.toDate
                                      ? new Date(p.toDate).toLocaleDateString()
                                      : "—"}
                                  </div>
                                )}
                              </div>
                            ),
                          )
                        ) : (
                          <div className="policy-empty">
                            No cancellation policy specified.
                          </div>
                        )}
                      </section>

                      {/* Amendment Policy */}
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

                      {/* Terms & Conditions */}
                      <section className="policy-section policy-section-last">
                        <h6 className="policy-section-title">
                          Terms &amp; Conditions
                        </h6>
                        {termsAndConditions ? (
                          <div
                            className="terms-content"
                            dangerouslySetInnerHTML={{
                              __html: termsAndConditions,
                            }}
                          />
                        ) : (
                          <div className="policy-empty">
                            No terms &amp; conditions configured for this hotel.
                          </div>
                        )}
                      </section>
                    </>
                  )}
                </Modal.Body>
                <Modal.Footer className="policy-modal-footer">
                  <Form.Check
                    type="checkbox"
                    id="policy-accept"
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

              {/* ✅ Confirmation Modal */}
              {/* Bumped to size="lg" so the order summary fits on
                  a single screen without an inner scroll. Header /
                  body paddings are also trimmed (py-2 → py-1, p-3 →
                  p-2) so all sections — hotel info, dates, policy,
                  payable, rate split — are visible at once. */}
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

                {console.log(
                  "pendingPayload::inside :order modal:::",
                  pendingPayload,
                )}
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
                              {formatDateTime(pendingPayload.checkInDate)}
                            </span>
                          </p>
                        </Col>
                        <Col xs={6}>
                          <p className="mb-1">
                            <strong>Check-Out:</strong>
                            <br />
                            <span className="text-dark">
                              {formatDateTime(pendingPayload.checkOutDate)}
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
                            <strong>Nights:</strong> {pendingPayload.nights}
                          </p>
                        </Col>

                        {/* Room category + meal plan — same WHAT-am-I-booking
                            info that the per-room Accordion.Header shows in
                            the Guest Details section. Uses roomBreakdown for
                            multi-room searches, else falls back to the
                            aggregate selectedRate. */}
                        {(() => {
                          const slots =
                            Array.isArray(bookingData?.roomBreakdown) &&
                            bookingData.roomBreakdown.length > 0
                              ? bookingData.roomBreakdown
                              : [
                                  {
                                    roomNo: 1,
                                    roomCategory: selectedRate.roomCategory,
                                    mealPlan: selectedRate.mealPlan,
                                  },
                                ];
                          return slots.map((s, i) => (
                            <React.Fragment key={i}>
                              <Col xs={6}>
                                <p className="mb-1">
                                  <strong>Room Category:</strong>
                                  <br />
                                  <span className="text-dark">
                                    {slots.length > 1
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
                          ));
                        })()}

                        {/* Lead Passenger — uses the lead guest captured into
                            primaryGuest at submit time. Only shown when there
                            is a usable name; gracefully hides on empty. */}
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

                        {/* Cancellation block — for Non-Refundable rates the
                            deadline doesn't apply at all, so we render a clear
                            "no refund" notice instead. The rate's refundability
                            takes precedence over the Hotel Cancellation Policy
                            (also overridden in the Policies modal below).
                            Payment Mode badge sits in a paired md=6 column so
                            the two read as one row (deadline left, mode right)
                            on tablet+, and stack cleanly on mobile. */}
                        {isNonRefundableRate ? (
                          <Col xs={12} md={6}>
                            <div
                              className="p-2 rounded border"
                              style={{
                                borderColor: "#dc2626",
                                background: "#fef2f2",
                              }}
                            >
                              <p
                                className="mb-1 fw-bold"
                                style={{ color: "#dc2626" }}
                              >
                                Non-refundable
                              </p>
                              <p className="mb-1 text-dark small">
                                No refund will be provided if this booking is
                                cancelled.
                              </p>
                              <p className="mb-0 text-dark small">
                                100% cancellation charges apply from the time of
                                booking.
                              </p>
                            </div>
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

                        {/* Payment Mode — small badge beside the cancellation
                            deadline / non-refundable notice. Shown for either
                            refundable branch so the user re-confirms which
                            method will be used before submitting. */}
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

                        {/* <Col xs={12}>
                          <p className="mb-1">
                            <strong>Cancellation Policy:</strong>
                          </p>
                          <ul className="mb-0 ps-3">
                            {pendingPayload.cancellationPolicy &&
                            pendingPayload.cancellationPolicy.length > 0 ? (
                              pendingPayload.cancellationPolicy.map(
                                (policy, index) => (
                                  <li key={index} className="text-dark">
                                    {policy}
                                  </li>
                                ),
                              )
                            ) : (
                              <li className="text-muted">
                                No cancellation policy available.
                              </li>
                            )}
                          </ul>
                        </Col> */}

                        <Col xs={12}>
                          {/* ✅ Show Selling Price only if ADMIN */}
                          {activeUserRole === "ADMIN" && (
                            <div className="p-2 rounded bg-white border mt-2">
                              <div className="d-flex justify-content-between align-items-center">
                                <h6 className="mb-0 text-muted">
                                  Selling Price
                                </h6>
                                <h5 className="mb-0 text-success fw-bold">
                                  {formatPrice(sellingPriceWithTd)}
                                </h5>
                              </div>
                            </div>
                          )}

                          {/* Payable row — plain border, no green
                              highlight. Single-line layout. */}
                          <div className="p-2 rounded bg-white border mt-2 d-flex justify-content-between align-items-center">
                            <h6 className="mb-0 fw-bold">Payable</h6>
                            <h5 className="mb-0 fw-bold">
                              {formatPrice(totalPriceWithTd)}{" "}
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
                          <span>
                            {formatPrice(
                              selectedRate.roomRateBasedOnRoomCount || 0,
                            )}
                          </span>
                        </div>
                        {/* <div className="d-flex justify-content-between">
                          <span>Tourism Dirhams</span>
                          <span>{formatPrice(tourismDirhamsAmount)}</span>
                        </div> */}
                        <hr className="my-1" />
                        <div className="d-flex justify-content-between fw-bold">
                          <span>Total (Selling)</span>
                          <span>{formatPrice(sellingPriceWithTd)}</span>
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
                          Hotel policies and terms &amp; conditions accepted
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
                    <i className="bi bi-x-circle me-1"></i> Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={confirmBooking}
                    disabled={isSubmitting}
                    className="px-4 fw-semibold"
                  >
                    {isSubmitting ? (
                      <>
                        <span
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                        ></span>
                        Processing...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-check-circle me-1"></i> Confirm
                      </>
                    )}
                  </Button>
                </Modal.Footer>
              </Modal>

              {/* ── Insufficient credit + card disabled → block booking ──
                  Shown when the agent has no available credit AND the
                  AgentView "Allow Card payment mode" toggle is off. There
                  is no payment path open to this agent, so the booking is
                  turned away with a courteous message. */}
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
                    administrator to enable Card payment on the agent's profile,
                    then try again.
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

              {/* ── Insufficient credit → online payment required ──
                  Replaces the old toast. Shows the payable amount with
                  Pay (green) / Cancel (red). Pay opens the gateway
                  picker. */}
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

              {/* ── Select payment gateway (dummy) ──
                  2–3 placeholder gateways as radios; Proceed deep-links
                  to /payment/<id> for the (dummy) card-entry page. */}
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
                          htmlFor={`gw-${g.id}`}
                          className={`pg-option${
                            isSelected ? " pg-option-selected" : ""
                          }`}
                        >
                          <input
                            type="radio"
                            name="payment-gateway"
                            id={`gw-${g.id}`}
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
                          {/* <span className="pg-option-text">
                            <span className="pg-option-name">{g.name}</span>
                            <span className="pg-option-desc">{g.desc}</span>
                          </span> */}
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
                      // Payload the resume flow / gateway needs.
                      // paymentMode is flipped to "ONLINE" so the Booking
                      // List can label the row correctly (mirrors the
                      // comment further up in this file — the online-
                      // payment branch sends "ONLINE").
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
                      // and /finalize replays it after payment. That way,
                      // if the browser tab dies between "money moved" and
                      // "back on our site", the booking can still be
                      // recovered from the transaction record.
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
                            bookingPayload: onlinePayload,
                          },
                        });
                        return;
                      }

                      // Dummy /payment/:gateway flow (test/local only) —
                      // it doesn't hit a real backend, so the resume
                      // needs the payload in sessionStorage.
                      try {
                        sessionStorage.setItem(
                          "hbpPendingCreatePayload",
                          JSON.stringify(onlinePayload),
                        );
                      } catch (e) {
                        console.error(
                          "Could not persist pending create payload",
                          e,
                        );
                      }

                      navigate(`/payment/${selectedGateway}`, {
                        state: {
                          amountLabel: formatPrice(insufficientAmount),
                          gatewayName: gw ? gw.name : selectedGateway,
                          // After payment, land back on this same booking
                          // page with resumeCreate=true — the effect below
                          // fires the create call using the persisted
                          // payload, then navigates to the hotel booking
                          // list on success (per client requirement).
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
          finalizeAfterCCAvenue, whether the create succeeded or errored. */}
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
};
 
export default HotelBookingPage;
