import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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
} from "react-bootstrap";
import {
  FaHotel,
  FaCalendarAlt,
  FaUsers,
  FaUtensils,
  FaBed,
} from "react-icons/fa";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import AgentBalanceDisplay from "../../components/AgentBalanceDisplay";
import "../../styles/HotelBookingPage.css";
import axiosInstance from "../../components/AxiosInstance";
import toast from "react-hot-toast";
import { toLocalDateTime } from "../../utils/dateUtils";
import QuotationPdfCard from "../../components/quotation/QuotationPdfCard";

/**
 * LastMinuteBookingForm — booking creation page for the Last Minute flow.
 *
 * Layout mirrors HotelBookingPage.jsx:
 *   1. Top: Back button + Booking Summary card (hotel name + dates + guests
 *      + meal plan + total price).
 *   2. Guest Details accordion — one panel per room, with per-guest rows
 *      (salutation / first / middle / last / gender / child).
 *   3. Primary Guest Details card — full guest profile form.
 *   4. Special Requests card.
 *   5. Submit row at the bottom.
 *
 * Data source: react-router state (passed by /last-minute-room-list "Book")
 * carrying { ctx: { hotel, room, checkInDate, checkOutDate, nights } }.
 *
 * Hits POST /api/last-minute-booking/create on submit.
 */

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

const formatPrice = (price) =>
  new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED" }).format(
    price || 0
  );

// Online-payment gateways — mirrors HotelBookingPage so the operator gets
// the same payment picker when the agent's credit is short. CC Avenue is
// real (see the "Proceed to Pay" handler below); the rest are still the
// dummy placeholder flow.
const PAYMENT_GATEWAYS = [
  { id: "ccavenue", name: "CC Avenue", desc: "Cards, UPI, Net Banking" },
  ];

// Rates saved in the DB already include the admin markup (it is pre-applied
// on the contract rate form). Return the base rate as-is to avoid double-applying.
const applyMarkup = (baseRate, _markupPct) => {
  return Number(baseRate || 0);
};

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

// Effective refundability for a last-minute rate. A rate flagged refundable
// (Flexible) only stays refundable while today is on/before its free-
// cancellation deadline — checkInDate minus the largest daysBeforeArrival
// across its cancellation policies. Once that deadline passes (or the rate is
// flagged non-refundable / carries no cancellation-policy day) it is treated
// as Non-Refundable. Mirrors the deadline rule on /hotel-booking-page and the
// badge on /last-minute-room-list so both pages agree.
const isRateNonRefundable = (rate, checkInDate) => {
  if (rate?.refundable !== true) return true;
  const days = (rate?.cancellationPolicies || [])
    .map((p) => Number(p?.daysBeforeArrival))
    .filter((n) => Number.isFinite(n));
  if (days.length === 0) return false;
  const cin = new Date(checkInDate);
  if (isNaN(cin.getTime())) return false;
  const deadline = new Date(cin);
  deadline.setDate(deadline.getDate() - Math.max(...days));
  deadline.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today > deadline;
};

export default function LastMinuteBookingForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = location;
  const ctx = state?.ctx;

  // Display currency carried from the search/room-list (rates are AED; this
  // converts them for display only). Shadows the module-level formatPrice so
  // every amount renders in the chosen currency (AED → factor 1).
  const _lmCur = ctx?.currency || { code: "AED", factor: 1 };
  const curCode = _lmCur.code || "AED";
  const curFactor = Number(_lmCur.factor) > 0 ? Number(_lmCur.factor) : 1;
  const formatPrice = (price) =>
    `${curCode} ${((Number(price) || 0) * curFactor).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const [primaryGuest, setPrimaryGuest] = useState({
    salutation: "Mr",
    firstName: "",
    middleName: "",
    lastName: "",
    email: "",
    phone: "",
    passportNo: "",
    customerNationality:
      state?.ctx?.nationalityCode || state?.ctx?.nationalityName || "",
    agentLpo: "",
  });

  // ── Lead passenger marker — { roomIdx, guestIdx } pointing at the
  //    single guest the user has flagged as Lead. Mirrors
  //    /hotel-booking-page / /senior-citizen-booking-page /
  //    /gov-employee-booking-page / /student-booking-page. Defaults
  //    to the first guest (room 0, guest 0) so the column always has
  //    one selection on first render. Children can't be Lead. The
  //    Lead-marked guest drives the submitted `customer` object
  //    (replacing the hidden Primary Guest Details card).
  const [leadIndex, setLeadIndex] = useState({ roomIdx: 0, guestIdx: 0 });

  const handleLeadSelect = (roomIdx, guestIdx) => {
    const g = rooms?.[roomIdx]?.guests?.[guestIdx];
    if (g?.isChild) return;
    setLeadIndex({ roomIdx, guestIdx });
  };

  // Each "room" is a single room in this booking. The Last Minute search
  // returns one rate per room slot, so we default to a 1-room booking and
  // let the user add more rooms (each room duplicates the chosen rate).
  const [rooms, setRooms] = useState(() => {
    const sr = state?.ctx?.searchRooms;
    if (Array.isArray(sr) && sr.length > 0) {
      return sr.map((r) => {
        const adults = r.adults || 1;
        const children = r.children || 0;
        const childAges = r.childAges || [];
        const guests = [];
        for (let i = 0; i < adults; i++) guests.push(defaultGuest(false));
        for (let i = 0; i < children; i++) {
          const g = defaultGuest(true);
          g.childAge = childAges[i] ?? 5;
          guests.push(g);
        }
        return { adults, children, childAges: [...childAges], guests };
      });
    }
    return [{ adults: 1, children: 0, childAges: [], guests: [defaultGuest(false)] }];
  });

  const [remarks, setRemarks] = useState("");
  const [specialRequests, setSpecialRequests] = useState([]);
  // Optional "Booking done for" free-text. When set, the detail view + voucher
  // render it as "Contact: <value>/<agentName>". The input is ADMIN-only.
  const [bookingDoneFor, setBookingDoneFor] = useState("");
  const isAdmin =
    String(localStorage.getItem("currentActiveRole") || "").toUpperCase() ===
    "ADMIN";

  // Client location snapshot for the booking-history audit trail, resolved
  // once on page load and sent on the create payload:
  //   • Location — browser geolocation (GPS/WiFi) reverse-geocoded to a
  //     precise readable address; the coarse IP-derived city is only the
  //     fallback when the permission is denied or the lookup times out.
  // The IP Address column is NOT resolved here — browsers can only see the
  // shared public/NAT IP, so the backend stamps each system's unique IPv4
  // from the create request itself. Mirrors the other dedicated-flow
  // booking pages.
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
  // Payment Mode — defaults to Credit Limit; rides on the create payload
  // (same field as HotelBookingPage / StudentBookingPage). Only Credit
  // Limit / Cash / Card are exposed per business decision.
  const [paymentMode, setPaymentMode] = useState("CREDITLIMIT");
  const [bookingConfirmation, setBookingConfirmation] = useState("Book & Voucher");
  const [tourismDirham, setTourismDirham] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Per-field validation errors. Keys follow the same naming convention as
  // HotelBookingPage: `room_{i}_guest_{j}_{field}` for guests, `primary_{field}`
  // for primary-guest fields.
  const [validationErrors, setValidationErrors] = useState({});

  // Order Summary modal — shown after validation passes; the actual backend
  // submit only fires on Confirm inside the modal.
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  // ── Payment-gate modals (mirrors HotelBookingPage / DayStayBookingPage) ──
  // When the agent's credit is short at Confirm time:
  //   • Card disabled → "Booking Cannot Be Completed" blocks the booking.
  //   • Card enabled  → "Online Payment Required" → gateway picker.
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [showGatewayModal, setShowGatewayModal] = useState(false);
  const [insufficientAmount, setInsufficientAmount] = useState(0);
  const [selectedGateway, setSelectedGateway] = useState("");
  const [showNoPaymentPathModal, setShowNoPaymentPathModal] = useState(false);
  // Payload snapshot the payment-gateway modal uses to persist a resumable
  // create call. Built inside handleConfirmFromModal before the credit
  // check so the online-payment branch can hand it off to /payment/*.
  const [pendingPayload, setPendingPayload] = useState(null);
  // Per-agent "Card" payment-mode gate, toggled from AgentView. Filters the
  // Card option out of the Payment Mode dropdown (mirrors HotelBookingPage).
  // The Confirm-time pre-check re-fetches this flag authoritatively.
  const [agentCardPaymentEnabled, setAgentCardPaymentEnabled] = useState(false);
  // Agent's currently available credit balance (AED). Fetched upfront so
  // the Payment Mode dropdown can render the correct three-scenario UI
  // BEFORE the user hits Confirm (Scenario 1 → Credit Limit only,
  // Scenario 2 → Card only + note, Scenario 3 → hard block).
  const [agentAvailableBalance, setAgentAvailableBalance] = useState(null);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedCancellations, setAcceptedCancellations] = useState(false);
  const [hotelTerms, setHotelTerms] = useState([]);
  const [hotelCancellationPolicies, setHotelCancellationPolicies] = useState([]);
  const [lastMinutePolicyGroups, setLastMinutePolicyGroups] = useState({
    amendmentPolicies: [],
    noShowPolicies: [],
    paymentPolicies: [],
  });

  const formatLastMinuteRule = (row, label) => {
    if (!row) return "";
    const amount = row.amount ?? row.value ?? "";
    const amountType = row.amountType || row.percentOrAmount || "PERCENT";
    const days = row.daysBeforeArrival ?? row.daysBefore ?? row.noOfNights ?? "";
    const feeText =
      amount !== ""
        ? `${amount} ${amountType === "PERCENT" ? "%" : "Amount"}`
        : "";
    const dayText = days !== "" ? `less than ${days} days before arrival` : "";
    return [label, feeText, dayText].filter(Boolean).join(" ");
  };

  // ── Per-room rate resolution ───────────────────────────────────────────
  // When LastMinuteRoomList sent a multi-room pick, `ctx.roomBreakdown`
  // is a list of { roomNo, rate } where `rate` is the full
  // last-minute-rate object for that slot. Without breakdown (every
  // legacy single-room flow), every room falls back to `ctx.room` —
  // identical to the previous behavior.
  const getRoomRate = (idx) =>
    (ctx?.roomBreakdown && ctx.roomBreakdown[idx]?.rate) || ctx?.room || {};

  // ── Total price — sum across rooms using EACH room's own rate ──
  const nights = Number(ctx?.nights || 1);
  const totalRoomCount = rooms.length;
  const { totalPrice, extraAdults, totalChildren } = useMemo(() => {
    let extra = 0;
    let kids = 0;
    let total = 0;
    rooms.forEach((r, idx) => {
      const a = Number(r.adults) || 1;
      const c = Number(r.children) || 0;
      const xa = Math.max(0, a - 2);
      extra += xa;
      kids += c;
      const rate = getRoomRate(idx);
      const mk = rate?.markup || 0;
      const perNightI = applyMarkup(rate?.lastMinuteRate || 0, mk);
      const adultRateI = applyMarkup(rate?.adultRate || 0, mk);
      const childRateI = applyMarkup(rate?.childRate || 0, mk);
      total += perNightI * nights;
      total += xa * adultRateI * nights;
      total += c * childRateI * nights;
    });
    return {
      totalPrice: total,
      extraAdults: extra,
      totalChildren: kids,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nights, totalRoomCount, rooms, ctx?.room, ctx?.roomBreakdown]);

  // ── Backward-compat "primary" rate (used by the booking-summary card
  //    and a few other display sites that aren't yet per-room aware). ──
  const markupPct = ctx?.room?.markup || 0;
  const perNight = applyMarkup(ctx?.room?.lastMinuteRate || 0, markupPct);
  const adultRate = applyMarkup(ctx?.room?.adultRate || 0, markupPct);
  const childRate = applyMarkup(ctx?.room?.childRate || 0, markupPct);

  // ── Booking-confirmation flow (mirrors HotelBookingPage) ──────────────
  // Non-refundable  → auto "Book Now & Voucher Now"  (status RECONFIRMED)
  // On-Request      → auto "Book Now & Voucher Later" (status CONFIRMED)
  // Refundable+Avail→ show the two radios; user picks.
  // Deadline-aware: a Flexible rate whose free-cancellation deadline has
  // already passed is effectively non-refundable, so the voucher choice is
  // hidden and the booking goes straight to "Book Now & Voucher Now".
  const isNonRefundableRoom = isRateNonRefundable(ctx?.room, ctx?.checkInDate);
  const isOnRequestRoom =
    String(ctx?.room?.roomStatus || "").replace(/\s+/g, "").toLowerCase() ===
    "onrequest";
  const showVoucherChoice = !isNonRefundableRoom && !isOnRequestRoom;
  // Cancellation deadline for the confirm-modal display badge — end of
  // the check-in day (matches how the other flows format their deadline).
  // Powers the "Refundable until this date" / "Passed" badge on refundable
  // last-minute rates. Non-refundable rooms show the red notice instead.
  const cancellationDeadline = (() => {
    const cinRaw = ctx?.checkInDate;
    if (!cinRaw) return null;
    const cin = new Date(cinRaw);
    if (isNaN(cin.getTime())) return null;
    const deadline = new Date(cin);
    deadline.setHours(0, 0, 0, 0);
    return deadline;
  })();
  const isOutsideDeadline = (() => {
    if (!cancellationDeadline) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today > cancellationDeadline;
  })();
  // The voucher-choice flag sent to the backend: forced for the auto cases,
  // otherwise driven by the selected radio.
  const isBookAndVoucherNow = isNonRefundableRoom
    ? true
    : isOnRequestRoom
      ? false
      : bookingConfirmation === "Book & Voucher";

  // ── Payment-mode scenario derivation (mirrors HotelBookingPage) ────────
  // bookingSellingPrice is the AED total the agent owes for this booking
  // (per-room rates + tourism dirham) — same amount the create endpoint
  // debits and the credit pre-check uses.
  const bookingSellingPrice = useMemo(() => {
    const base = Number(totalPrice) || 0;
    const td = parseFloat(tourismDirham);
    return base + (Number.isFinite(td) ? td : 0);
  }, [totalPrice, tourismDirham]);

  // Client-side "sufficient credit" flag — null while agentAvailableBalance
  // is still loading so the UI doesn't flash the wrong scenario.
  const hasSufficientCredit = useMemo(() => {
    if (agentAvailableBalance == null) return null;
    return Number(agentAvailableBalance) >= bookingSellingPrice;
  }, [agentAvailableBalance, bookingSellingPrice]);

  // Scenario 3 — insufficient credit AND per-agent Card payment disabled.
  const noPaymentPathAvailable =
    hasSufficientCredit === false && !agentCardPaymentEnabled;

  // Three-scenario Payment Mode options:
  //   1. Sufficient credit                  → Credit Limit only
  //   2. Insufficient credit + Card enabled → Card only + note
  //   3. Insufficient credit + Card disabled → no options; booking blocked
  // Loading (hasSufficientCredit == null) falls back to Credit Limit so
  // nothing flashes empty.
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

  // Keep the selected paymentMode in sync with the options that are
  // actually valid — auto-select the first remaining option when the
  // current selection drops out. Empty options (scenario 3) = no-op.
  useEffect(() => {
    if (paymentModeOptions.length === 0) return;
    if (!paymentModeOptions.some((o) => o.value === paymentMode)) {
      setPaymentMode(paymentModeOptions[0].value);
    }
  }, [paymentModeOptions, paymentMode]);

  // Post-payment resume — mirrors HotelBookingPage / StudentBookingPage.
  // DummyPaymentPage returns us here with location.state.resumeCreate =
  // true after the dummy card charge succeeds. React state (rooms /
  // pendingPayload) is lost across the /payment detour, so we rebuild
  // the create call purely from the payload persisted under
  // "lastMinutePendingCreatePayload" just before navigating away. On
  // success we go to the Last Minute Booking List.
  //
  // Guards:
  //   • The flag is stripped from history immediately (but ctx is
  //     preserved) so a reload / back doesn't re-fire the create.
  //   • sessionStorage is cleared right after read so a stray landing
  //     on this URL with a stale flag can't replay an old payload.
  useEffect(() => {
    if (!location.state?.resumeCreate) return;
    const stored = sessionStorage.getItem("lastMinutePendingCreatePayload");
    // Strip only the resume flag; keep ctx so the page still renders
    // (avoids the "Missing rate context" fallback while the POST runs).
    navigate(location.pathname, {
      replace: true,
      state: { ctx: location.state?.ctx },
    });
    if (!stored) return;
    sessionStorage.removeItem("lastMinutePendingCreatePayload");
    let payload;
    try {
      payload = JSON.parse(stored);
    } catch (e) {
      console.error("Malformed persisted last-minute create payload", e);
      return;
    }
    (async () => {
      try {
        setSubmitting(true);
        const res = await axiosInstance.post(
          "/api/last-minute-booking/create",
          payload,
        );
        if (res.data?.success) {
          toast.success(
            res.data.message ||
              `Booking ${res.data.bookingCode || ""} created after payment.`,
          );
          setShowSummaryModal(false);
          navigate("/booking-details/last-minute-booking-list");
        } else {
          toast.error(
            res.data?.message || "Booking submission failed. Please try again.",
          );
        }
      } catch (err) {
        const beMsg =
          err?.response?.data?.message || err?.response?.data?.error || null;
        console.error("Error finalising last-minute booking after payment:", err);
        toast.error(beMsg || "Booking submission failed. Please try again.");
      } finally {
        setSubmitting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.resumeCreate]);

  // CC Avenue post-payment resume — mirrors HotelBookingPage.jsx. CC
  // Avenue's redirect is a real cross-domain browser navigation, so React
  // Router `state` (resumeCreate above) never survives it; the backend
  // instead appends ?ccavenueOrderId=&ccavenueStatus= to the URL when it
  // redirects back here. Unlike the dummy-gateway path, no sessionStorage
  // payload is needed — the backend already persisted it at /initiate.
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const ccavenueOrderId = searchParams.get("ccavenueOrderId");
    const ccavenueStatus = searchParams.get("ccavenueStatus");
    if (!ccavenueOrderId) return;

    // Strip the query string so a reload doesn't re-trigger this. ctx is
    // lost either way (it never survives the real redirect), so the page
    // will briefly show the "No room selected" fallback while this runs.
    navigate(location.pathname, { replace: true, state: {} });

    (async () => {
      if (ccavenueStatus !== "success") {
        toast.error("Payment was not completed. Please try again.");
        return;
      }
      try {
        setSubmitting(true);
        const statusResponse = await axiosInstance.get(
          `/api/payment/ccavenue/status/${ccavenueOrderId}`,
        );
        if (statusResponse.data?.status !== "SUCCESS") {
          toast.error(
            statusResponse.data?.statusMessage ||
              "Payment was not successful. Please try again.",
          );
          return;
        }
        const res = await axiosInstance.post(
          `/api/payment/ccavenue/finalize-lastminute/${ccavenueOrderId}`,
        );
        if (res.data?.success) {
          toast.success(
            res.data.message ||
              `Booking ${res.data.bookingCode || ""} created after payment.`,
          );
          setShowSummaryModal(false);
          navigate("/booking-details/last-minute-booking-list");
        } else {
          toast.error(
            res.data?.message || "Booking submission failed. Please try again.",
          );
        }
      } catch (err) {
        const beMsg =
          err?.response?.data?.message || err?.response?.data?.error || null;
        console.error("Post-payment last-minute finalize failed:", err);
        toast.error(beMsg || "Booking submission failed. Please try again.");
      } finally {
        setSubmitting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // Resync rooms[].guests array when adults/children counts change.
  useEffect(() => {
    setRooms((prev) =>
      prev.map((r) => {
        const totalGuests = (r.adults || 0) + (r.children || 0);
        const guests = [...(r.guests || [])];
        while (guests.length < totalGuests) {
          guests.push(defaultGuest(guests.length >= r.adults));
        }
        return { ...r, guests: guests.slice(0, totalGuests) };
      })
    );
  }, []); // run once after mount

  // ── Agent card-payment flag — same gate as HotelBookingPage. Drives
  //    the Card option in the Payment Mode dropdown. Fail-safe default:
  //    card DISABLED.
  useEffect(() => {
    const aId = ctx?.agentId;
    if (!aId) { setAgentCardPaymentEnabled(false); return; }
    let cancelled = false;
    axiosInstance
      .get(`/api/agent/${aId}`)
      .then((res) => { if (!cancelled) setAgentCardPaymentEnabled(!!res?.data?.cardPaymentEnabled); })
      .catch(() => { if (!cancelled) setAgentCardPaymentEnabled(false); });
    return () => { cancelled = true; };
  }, [ctx?.agentId]);

  // ── Agent available credit balance — mirror HotelBookingPage so we can
  //    resolve the payment-mode scenario at render time (not just at
  //    Confirm). null = still loading / not applicable.
  useEffect(() => {
    const aId = ctx?.agentId;
    if (!aId) { setAgentAvailableBalance(null); return; }
    let cancelled = false;
    axiosInstance
      .get(`/api/agent-credit-limit/agent/${aId}`)
      .then((res) => {
        if (!cancelled) {
          setAgentAvailableBalance(res?.data?.availableCreditLimit ?? null);
        }
      })
      .catch(() => {
        // 404 (no credit-limit row) → treat as zero available.
        if (!cancelled) setAgentAvailableBalance(0);
      });
    return () => { cancelled = true; };
  }, [ctx?.agentId]);

  function defaultGuest(isChild) {
    return {
      salutation: "",
      firstName: "",
      middleName: "",
      lastName: "",
      gender: "",
      isChild,
    };
  }

  // ── Field handlers ──
  const setRoomCount = (count) => {
    const n = Math.max(1, Math.min(10, count));
    setRooms((prev) => {
      const out = [...prev];
      while (out.length < n) {
        out.push({ adults: 1, children: 0, childAges: [], guests: [defaultGuest(false)] });
      }
      return out.slice(0, n);
    });
  };

  const setRoomField = (idx, field, value) =>
    setRooms((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        const updated = { ...r, [field]: Number(value) };
        if (field === "adults" || field === "children") {
          const totalGuests = (updated.adults || 0) + (updated.children || 0);
          const guests = [...(r.guests || [])];
          while (guests.length < totalGuests) {
            guests.push(defaultGuest(guests.length >= updated.adults));
          }
          updated.guests = guests.slice(0, totalGuests);
        }
        return updated;
      })
    );

  const setGuestField = (roomIdx, guestIdx, field, value) =>
    setRooms((prev) =>
      prev.map((r, i) => {
        if (i !== roomIdx) return r;
        const guests = r.guests.map((g, gi) =>
          gi === guestIdx ? { ...g, [field]: value } : g
        );
        return { ...r, guests };
      })
    );

  const togglePrimaryFromFirstGuest = (field, value) => {
    if (rooms[0]?.guests[0]) {
      // Mirror Room1 Adult1's salutation/firstName/lastName into primary guest.
      if (["salutation", "firstName", "lastName"].includes(field)) {
        setPrimaryGuest((p) => ({ ...p, [field]: value }));
      }
    }
  };

  // ── Validation ──
  // Walks all guests in all rooms + primary-guest fields and builds an error
  // map keyed by `room_{i}_guest_{j}_{field}` / `primary_{field}`.
  const validateAll = () => {
    const errs = {};

    // Per-room, per-guest mandatory fields: salutation, firstName, lastName, gender.
    rooms.forEach((r, ri) => {
      (r.guests || []).forEach((g, gi) => {
        if (!g.salutation || !g.salutation.trim())
          errs[`room_${ri}_guest_${gi}_salutation`] = "Required";
        if (!g.firstName || !g.firstName.trim())
          errs[`room_${ri}_guest_${gi}_firstName`] = "Required";
        if (!g.lastName || !g.lastName.trim())
          errs[`room_${ri}_guest_${gi}_lastName`] = "Required";
        // Gender validation removed — the field has been hidden
        // from the Guest Details grid per spec.
        // Child-age validation removed — the age is captured at search
        // time and shown inline in the Passenger label (no editable field),
        // mirroring HotelBookingPage. `g.childAge` still rides the payload.
      });
    });

    // Primary-guest validation removed — the Primary Guest Details
    // card has been hidden. The Guest Details grid above is the
    // single source of customer details; the submit payload derives
    // `customer` from the Lead-marked guest at build time.

    return errs;
  };

  // ── Confirm flow ──
  // Step 1 — click "Confirm Booking" on the form: validate, then OPEN the
  // Order Summary modal (no backend call yet).
  const handleConfirmClick = async (e) => {
    e?.preventDefault?.();
    setError(null);
    // Scenario 3 short-circuit — no viable payment path (no credit AND
    // Card disabled). Blocks a form-submit (Enter key) from bypassing the
    // disabled Confirm Booking button.
    if (noPaymentPathAvailable) {
      toast.error(
        "Booking cannot be completed — no payment method available for this agent.",
      );
      return;
    }
    if (!ctx?.room?.lastMinuteRateId) {
      setError("Missing rate context. Go back and pick a room again.");
      return;
    }
    const errs = validateAll();
    setValidationErrors(errs);
    if (Object.keys(errs).length > 0) {
      const first = Object.values(errs)[0];
      toast.error(first === "Required"
        ? "Please fill all mandatory fields."
        : first);
      return;
    }
    setAcceptedTerms(false);
    setAcceptedCancellations(false);
    setShowPolicyModal(true);
    setPolicyLoading(false);

    const roomPolicies = ctx?.room || {};
    const terms = Array.isArray(roomPolicies.termsAndConditions)
      ? roomPolicies.termsAndConditions.filter(Boolean)
      : [];
    const payments = Array.isArray(roomPolicies.paymentPolicies)
      ? roomPolicies.paymentPolicies.filter(Boolean)
      : [];
    const cancellations = Array.isArray(roomPolicies.cancellationPolicies)
      ? roomPolicies.cancellationPolicies
          .map((item) => formatLastMinuteRule(item, "Cancellation fee of"))
          .filter(Boolean)
      : [];
    const amendments = Array.isArray(roomPolicies.amendmentPolicies)
      ? roomPolicies.amendmentPolicies
          .map((item) => formatLastMinuteRule(item, "Amendment fee of"))
          .filter(Boolean)
      : [];
    const noShows = Array.isArray(roomPolicies.noShowPolicies)
      ? roomPolicies.noShowPolicies
          .map((item) => formatLastMinuteRule(item, "No-show fee of"))
          .filter(Boolean)
      : [];

    setHotelTerms(terms);
    setHotelCancellationPolicies(cancellations);
    setLastMinutePolicyGroups({
      amendmentPolicies: amendments,
      noShowPolicies: noShows,
      paymentPolicies: payments,
    });
  };

  // Step 2 — click "Confirm" inside the Order Summary modal: actually POST
  // and on success redirect to the new last-minute booking list page.
  const handleConfirmFromModal = async () => {
    setError(null);

    if (!acceptedTerms || !acceptedCancellations) {
      toast.error("Please accept Terms & Conditions and Cancellation Policies to continue booking.");
      return;
    }

    const agentId =
      (ctx?.agentId && String(ctx.agentId)) ||
      localStorage.getItem("userId") ||
      localStorage.getItem("agentId") ||
      "0";
    const createdByRole =
      localStorage.getItem("currentActiveRole") || "agent";

    // Primary Guest Details card is hidden — derive customer from
    // the Lead-marked guest in the Guest Details grid above. Email
    // / phone / passportNo / agentLpo are no longer collected on
    // the form and are sent as empty strings. Nationality still
    // comes from the search context. Backend ignores empty optional
    // values, so the /api/last-minute-booking/create contract is
    // preserved.
    const leadGuest =
      rooms?.[leadIndex.roomIdx]?.guests?.[leadIndex.guestIdx] || {};
    const customerWithNationality = {
      salutation: leadGuest.salutation || "",
      firstName: leadGuest.firstName || "",
      middleName: leadGuest.middleName || "",
      lastName: leadGuest.lastName || "",
      email: "",
      phone: "",
      passportNo: "",
      agentLpo: "",
      customerNationality:
        ctx?.nationalityCode ||
        ctx?.nationalityName ||
        "",
    };

    // Build the create payload up-front so both the direct-post path AND
    // the online-payment gateway path can use it (the gateway modal
    // persists it to sessionStorage and the resume effect replays it
    // after payment).
    const payload = {
      lastMinuteRateId: ctx.room.lastMinuteRateId,
      checkInDate: toLocalDateTime(ctx.checkInDate),
      checkOutDate: toLocalDateTime(ctx.checkOutDate),
      agentId,
      // Optional "Booking Done By Employee" — picked in
      // LastMinuteBookingPage, threaded through LastMinuteRoomList.
      // Backend's LastMinuteBookingServiceImpl resolves it via
      // EmployeeRepository and stamps the relation on the HotelBooking row.
      employeeId: ctx?.employeeId || null,
      nationalityId: ctx?.nationalityId ?? null,
      createdByRole,
      tourismDirham:
        tourismDirham !== "" && !isNaN(Number(tourismDirham))
          ? Number(tourismDirham)
          : null,
      acceptedTermsAndConditions: !!acceptedTerms,
      acceptedCancellationPolicies: !!acceptedCancellations,
      termsAndConditions: [...hotelTerms, ...lastMinutePolicyGroups.paymentPolicies],
      cancellationPolicies: [
        ...hotelCancellationPolicies,
        ...lastMinutePolicyGroups.amendmentPolicies,
        ...lastMinutePolicyGroups.noShowPolicies,
      ],
      customer: customerWithNationality,
      rooms: rooms.map((r, idx) => {
        const rr = getRoomRate(idx);
        return {
          // Per-room rateId — backend reads this when set, otherwise
          // falls back to the top-level `lastMinuteRateId`. Lets each
          // booked room carry its OWN rate (multi-room with different
          // picks per slot).
          lastMinuteRateId: rr?.lastMinuteRateId || null,
          adults: Number(r.adults) || 1,
          children: Number(r.children) || 0,
          guests: (r.guests || []).map((g, gi) => ({
            salutation: g.salutation,
            firstName: g.firstName,
            lastName: g.lastName,
            gender: g.gender,
            isChild: g.isChild,
            childAge: g.isChild ? Number(g.childAge) || 5 : null,
            // Lead flag mirrors the gov / SC / Student / Hotel
            // booking pages. Backend ignores unknown fields so this
            // stays backward-compatible with /api/last-minute-booking/create.
            isLead: idx === leadIndex.roomIdx && gi === leadIndex.guestIdx,
          })),
        };
      }),
      remarks:
        [remarks, specialRequests.length ? `Requests: ${specialRequests.join(", ")}` : null]
          .filter(Boolean)
          .join("\n") || null,
      // Optional "Booking done for" free-text (admin-only field) → shown as
      // "Contact: <value>/<agentName>" on the detail view + voucher.
      bookingDoneFor: bookingDoneFor.trim() || null,
      // Location column in the detail view's Booking History. The IP
      // Address column is stamped server-side from the create request
      // (each system's own IPv4), so it is not sent here.
      bookingLocation: clientNetwork.bookingLocation,
      // Display currency chosen on the search page. `displayCurrencyRate` is
      // the AED→target factor; the booking total stays AED and the backend
      // stores the code + converted amount. AED → factor 1.
      displayCurrencyCode: ctx?.currency?.code || "AED",
      displayCurrencyRate:
        Number(ctx?.currency?.factor) > 0 ? Number(ctx.currency.factor) : 1,
      // Booking-confirmation flow inputs (mirrors HotelBookingPage). The
      // backend derives the BookingStatus (RECONFIRMED / CONFIRMED) from these
      // + the rate's refundable flag.
      isBookandVoucher: isBookAndVoucherNow,
      roomStatus: ctx?.room?.roomStatus || null,
      // Payment mode chosen on this page — same field name as the other
      // booking flows send. Backend accepts the same enum values.
      paymentMode,
    };
    // Stash the payload so the gateway modal (below) can persist it to
    // sessionStorage before navigating to /payment/*, and the resume
    // effect can replay it after payment.
    setPendingPayload(payload);

    // ── Payment-gate pre-check (mirrors HotelBookingPage.confirmBooking) ──
    // Ask the BE whether the agent has enough credit for the payable total
    // (Tourism-Dirham inclusive — same amount the create endpoint debits).
    // When credit is short:
    //   • On Request room OR Book Now & Voucher Later → proceed with the
    //     create call (payment-gate matrix: these flows always book).
    //   • Everything else → close the Order Summary modal, then:
    //       – Card disabled at the agent level → no viable payment path;
    //         block with the "Booking Cannot Be Completed" modal.
    //       – Card enabled → "Online Payment Required" → gateway picker.
    // The check itself fails OPEN (credit endpoint error → proceed) so the
    // operator is never trapped by a flaky pre-check — same as the other
    // booking pages.
    try {
      const agentIdNum = Number(String(agentId).trim());
      const requiredAmount = Number(payableTotal) || 0;
      if (Number.isFinite(agentIdNum) && agentIdNum > 0 && requiredAmount > 0) {
        const [credit, agentResp] = await Promise.all([
          axiosInstance.get(
            `/api/agent-credit-limit/check-sufficient-credit?agentId=${agentIdNum}&requiredAmount=${requiredAmount}`,
          ),
          axiosInstance
            .get(`/api/agent/${agentIdNum}`)
            .catch(() => ({ data: { cardPaymentEnabled: false } })),
        ]);
        if (credit.data === false) {
          const isVoucherLater =
            bookingConfirmation === "Book Now & Voucher later";
          const bypassPaymentModal = isVoucherLater || isOnRequestRoom;
          if (!bypassPaymentModal) {
            setInsufficientAmount(requiredAmount);
            setShowSummaryModal(false);
            if (!agentResp?.data?.cardPaymentEnabled) {
              setShowNoPaymentPathModal(true);
              return;
            }
            setShowInsufficientModal(true);
            return;
          }
          console.log(
            isOnRequestRoom
              ? "[LASTMINUTE] Insufficient credit but On Request rate — proceeding with create."
              : "[LASTMINUTE] Insufficient credit but Voucher Later selected — proceeding with create.",
          );
        }
      }
    } catch (err) {
      console.warn("credit check failed", err);
    }

    try {
      setSubmitting(true);
      const res = await axiosInstance.post(
        "/api/last-minute-booking/create",
        payload
      );
      if (res.data?.success) {
        toast.success("Last Minute booking created");
        setShowSummaryModal(false);
        navigate("/booking-details/last-minute-booking-list");
      } else {
        const msg = res.data?.message || "Booking failed";
        setError(msg);
        toast.error(msg);
      }
    } catch (err) {
      const msg = err?.response?.data?.message || "Booking failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Fallback when context is missing ──
  if (!ctx) {
    return (
      <Layout>
        <Container fluid="xl">
          <Card className="shadow-sm border-0">
            <Card.Body className="text-center py-5">
              <p>No room selected.</p>
              <Button
                variant="primary"
                onClick={() => navigate("/new-booking/last-minute-booking")}
              >
                Back to Search
              </Button>
            </Card.Body>
          </Card>
        </Container>
      </Layout>
    );
  }

  const hotel = ctx.hotel || {};
  const room = ctx.room || {};

  const payableTotal =
    Number(totalPrice || 0) +
    (tourismDirham !== "" && !isNaN(Number(tourismDirham))
      ? Number(tourismDirham)
      : 0);

  // ── Quotation PDF ─────────────────────────────────────────────────────
  // Quotes what this page shows: the Booking Summary and the Price Details
  // total, with one price line per room computed exactly like totalPrice
  // (the lines add up to the Selling Price), all in the display currency
  // like formatPrice. Policy lines use the same wording as the policy modal.
  const buildLastMinuteQuotationPayload = () => {
    const toDisplay = (aed) =>
      Math.round((Number(aed) || 0) * curFactor * 100) / 100;
    const nightsText = `${nights} Night${nights !== 1 ? "s" : ""}`;
    const describeGuests = (r) => {
      const adults = Number(r?.adults) || 0;
      const children = Number(r?.children) || 0;
      return `${adults} Adult${adults !== 1 ? "s" : ""}${
        children ? `, ${children} Child${children !== 1 ? "ren" : ""}` : ""
      }`;
    };
    const roomLabel = (rr) => {
      const cat =
        rr.roomCategoryName ||
        (rr.roomCategoryId ? `Category #${rr.roomCategoryId}` : "");
      return `${cat || "Room"}${rr.roomTypeName ? ` (${rr.roomTypeName})` : ""}`;
    };

    const priceItems = rooms.map((r, idx) => {
      const a = Number(r.adults) || 1;
      const c = Number(r.children) || 0;
      const xa = Math.max(0, a - 2);
      const rate = getRoomRate(idx);
      const mk = rate?.markup || 0;
      const perNightI = applyMarkup(rate?.lastMinuteRate || 0, mk);
      const adultRateI = applyMarkup(rate?.adultRate || 0, mk);
      const childRateI = applyMarkup(rate?.childRate || 0, mk);
      const roomTotal =
        perNightI * nights + xa * adultRateI * nights + c * childRateI * nights;
      return {
        description: `Room ${idx + 1} - ${roomLabel(rate)}`,
        details: [rate.mealPlanName, describeGuests(r), nightsText]
          .filter(Boolean)
          .join(", "),
        amount: toDisplay(roomTotal),
      };
    });
    const tdAmount = payableTotal - Number(totalPrice || 0);
    if (tdAmount > 0) {
      priceItems.push({
        description: "Tourism Dirham",
        details: "",
        amount: toDisplay(tdAmount),
      });
    }

    const lead = rooms?.[leadIndex.roomIdx]?.guests?.[leadIndex.guestIdx];
    const leadNames = [lead?.firstName, lead?.middleName, lead?.lastName]
      .map((p) => (p ? String(p).trim() : ""))
      .filter(Boolean);
    const leadName = leadNames.length
      ? [lead?.salutation ? String(lead.salutation).trim() : "", ...leadNames]
          .filter(Boolean)
          .join(" ")
      : "";

    const ruleLines = (list, label) =>
      Array.isArray(list)
        ? list.map((item) => formatLastMinuteRule(item, label)).filter(Boolean)
        : [];
    const textLines = (list) =>
      Array.isArray(list)
        ? list.filter((t) => typeof t === "string" && t.trim())
        : [];

    return {
      bookingType: "LAST_MINUTE",
      agentId: Number(ctx.agentId) || null,
      currency: curCode,
      serviceName: hotel.hotelName || "",
      serviceSubtitle: hotel.address || "",
      customerName: leadName || null,
      details: [
        { label: "Check-in", value: ctx.checkInDate || "" },
        { label: "Check-out", value: ctx.checkOutDate || "" },
        { label: "Nights", value: String(nights) },
        { label: "Rooms", value: String(totalRoomCount) },
        {
          label: "Guests",
          value: rooms
            .map((r, i) => `Room ${i + 1}: ${describeGuests(r)}`)
            .join("\n"),
        },
        {
          label: "Room",
          value: rooms
            .map((r, i) => `Room ${i + 1}: ${roomLabel(getRoomRate(i))}`)
            .join("\n"),
        },
        {
          label: "Meal Plan",
          value: rooms
            .map((r, i) => getRoomRate(i).mealPlanName || "")
            .filter(Boolean)
            .join("\n"),
        },
        {
          label: "Star Rating",
          value: hotel.starRating != null ? `${hotel.starRating} Star` : "",
        },
        { label: "Room Status", value: room.roomStatus || "Available" },
        {
          label: "Refund Status",
          value: isNonRefundableRoom ? "Non-Refundable" : "Flexible",
        },
      ],
      priceItems,
      totalAmount: toDisplay(payableTotal),
      cancellationPolicy: [
        ...(isNonRefundableRoom ? ["Non-refundable rate."] : []),
        ...ruleLines(room.cancellationPolicies, "Cancellation fee of"),
        ...ruleLines(room.noShowPolicies, "No-show fee of"),
      ],
      notes: [
        ...ruleLines(room.amendmentPolicies, "Amendment fee of"),
        ...textLines(room.paymentPolicies),
        ...textLines(room.termsAndConditions),
      ],
    };
  };

  return (
    <Layout>
      <Container fluid="xl">
        {/* Last Minute route heading — UI only, mirrors the heading shown
            on /new-booking/last-minute-booking once results arrive. */}
        <div className="hs-page-heading">
          <h3 className="hs-page-heading-title">Last Minute</h3>
        </div>
        <div className="d-flex justify-content-end mb-2">
          <AgentBalanceDisplay agentId={ctx?.agentId} />
        </div>

        {error && (
          <Alert variant="danger" className="py-2 mb-3">
            {error}
          </Alert>
        )}

        {/* ── Form ── */}
        <Form onSubmit={handleConfirmClick} noValidate>
          <Row className="g-3">
            <Col lg={8} className="hbp-left-col">
              {/* ── Guest Details accordion ── */}
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
                    <h6 className="mb-0 fw-bold text-dark">Guest Details</h6>
                    <Badge bg="warning" text="dark" className="ms-2">
                      LAST MINUTE
                    </Badge>
                  </div>
                </Card.Header>
                <Card.Body className="p-0">
                  <Accordion
                    alwaysOpen
                    defaultActiveKey={rooms.map((_, i) => String(i))}
                    className="guest-details-accordion"
                  >
                    {rooms.map((r, roomIdx) => (
                      <Accordion.Item
                        key={roomIdx}
                        eventKey={String(roomIdx)}
                        className="mb-3 guest-room-item"
                      >
                        <Accordion.Header className="bg-primary text-white">
                          <h6 className="mb-0 fw-bold w-100 d-flex flex-wrap align-items-center gap-2">
                            {(() => {
                              // Per-room rate when LastMinuteRoomList sent
                              // a roomBreakdown; otherwise the legacy
                              // single-room `room` object.
                              const rr = getRoomRate(roomIdx);
                              return (
                                <>
                                  <span>
                                    Room {roomIdx + 1} -{" "}
                                    {rr.roomCategoryName ||
                                      `Category #${rr.roomCategoryId}`}{" "}
                                    ({rr.roomTypeName || `Type #${rr.roomTypeId}`}){" "}
                                    ({r.adults} Adult{r.adults !== 1 ? "s" : ""},{" "}
                                    {r.children} Child{r.children !== 1 ? "ren" : ""})
                                  </span>
                                  {(rr.mealPlanName || rr.mealPlanId) && (
                                    <Badge bg="light" text="dark" className="ms-2">
                                      <FaUtensils className="me-1" />
                                      {rr.mealPlanName || `#${rr.mealPlanId || ""}`}
                                    </Badge>
                                  )}
                                </>
                              );
                            })()}
                          </h6>
                        </Accordion.Header>
                        <Accordion.Body className="p-3">
                          {/* Column headers — mirrors the other
                              dedicated-flow booking pages so every
                              Guest Details grid looks identical. */}
                          <Row className="fw-semibold small text-muted px-2 mb-1 d-none d-md-flex">
                            <Col md={2}>Passenger</Col>
                            <Col md={2}>Title *</Col>
                            <Col md={3}>First Name *</Col>
                            <Col md={3}>Surname *</Col>
                            <Col md={2} className="text-center">Lead</Col>
                          </Row>
                          {r.guests.map((g, gIdx) => {
                            const isLead =
                              leadIndex.roomIdx === roomIdx &&
                              leadIndex.guestIdx === gIdx;
                            return (
                            <div key={gIdx} className="guest-row mb-2">
                              <Row className="align-items-center g-2">
                                <Col md={2}>
                                  <span className="fw-semibold text-muted small">
                                    {g.isChild
                                      ? `Child ${gIdx - r.adults + 1} (Age: ${
                                          g.childAge ?? "-"
                                        })`
                                      : `Adult ${gIdx + 1}`}
                                  </span>
                                </Col>
                                <Col md={2}>
                                  <Form.Select
                                    size="sm"
                                    value={g.salutation}
                                    isInvalid={!!validationErrors[`room_${roomIdx}_guest_${gIdx}_salutation`]}
                                    onChange={(e) => {
                                      setGuestField(roomIdx, gIdx, "salutation", e.target.value);
                                      if (roomIdx === 0 && gIdx === 0)
                                        togglePrimaryFromFirstGuest("salutation", e.target.value);
                                    }}
                                  >
                                    <option value="">SELECT</option>
                                    <option value="Mr">Mr</option>
                                    <option value="Mrs">Mrs</option>
                                    <option value="Ms">Ms</option>
                                    <option value="Master">Master</option>
                                  </Form.Select>
                                  <Form.Control.Feedback type="invalid">
                                    {validationErrors[`room_${roomIdx}_guest_${gIdx}_salutation`]}
                                  </Form.Control.Feedback>
                                </Col>
                                <Col md={3}>
                                  <Form.Control
                                    size="sm"
                                    placeholder="First Name"
                                    value={g.firstName}
                                    isInvalid={!!validationErrors[`room_${roomIdx}_guest_${gIdx}_firstName`]}
                                    onChange={(e) => {
                                      setGuestField(roomIdx, gIdx, "firstName", e.target.value);
                                      if (roomIdx === 0 && gIdx === 0)
                                        togglePrimaryFromFirstGuest("firstName", e.target.value);
                                    }}
                                  />
                                  <Form.Control.Feedback type="invalid">
                                    {validationErrors[`room_${roomIdx}_guest_${gIdx}_firstName`]}
                                  </Form.Control.Feedback>
                                </Col>
                                <Col md={3}>
                                  <Form.Control
                                    size="sm"
                                    placeholder="Surname"
                                    value={g.lastName}
                                    isInvalid={!!validationErrors[`room_${roomIdx}_guest_${gIdx}_lastName`]}
                                    onChange={(e) => {
                                      setGuestField(roomIdx, gIdx, "lastName", e.target.value);
                                      if (roomIdx === 0 && gIdx === 0)
                                        togglePrimaryFromFirstGuest("lastName", e.target.value);
                                    }}
                                  />
                                  <Form.Control.Feedback type="invalid">
                                    {validationErrors[`room_${roomIdx}_guest_${gIdx}_lastName`]}
                                  </Form.Control.Feedback>
                                </Col>
                                {/* Gender column hidden by request
                                    — the field is no longer
                                    collected on this page. State
                                    `g.gender` keeps its default
                                    empty string so the payload still
                                    carries the key. */}
                                <Col md={2} className="text-center">
                                  {/* Lead radio — only adults can be
                                      lead. Disabled+greyed for
                                      children so the row still
                                      aligns. The Lead-marked guest
                                      drives the `customer` payload. */}
                                  <Form.Check
                                    type="radio"
                                    name="lm-lead-guest"
                                    id={`lm-lead-${roomIdx}-${gIdx}`}
                                    checked={isLead}
                                    disabled={g.isChild}
                                    onChange={() => handleLeadSelect(roomIdx, gIdx)}
                                    title={
                                      g.isChild
                                        ? "Children cannot be the lead"
                                        : "Mark as Lead passenger"
                                    }
                                  />
                                </Col>
                              </Row>
                              {/* Child age is captured at search time and shown
                                  inline in the Passenger label above (e.g.
                                  "Child 1 (Age: 5)") — no separate input here,
                                  mirroring HotelBookingPage. `g.childAge` still
                                  rides on the create payload. */}
                            </div>
                            );
                          })}
                        </Accordion.Body>
                      </Accordion.Item>
                    ))}
                  </Accordion>
                </Card.Body>
              </Card>

              {/* Primary Guest Details card hidden by request —
                  the Guest Details grid above is the single source
                  of customer details. The submit payload still
                  carries a `customer` object: it's derived from the
                  Lead-marked passenger when the booking is
                  submitted, replacing the previous required name +
                  email + phone form. */}

              {/* ── Special Requests ── */}
              <Card className="p-4 mb-2 shadow-sm border-0">
                <h5 className="mb-3 fw-bold">Special Requests</h5>
                <Row className="g-3">
                  {/* Booking Done For — optional free-text, ADMIN logins only
                      (hidden for all other logins). Persisted and shown as
                      "Contact: <value>/<agentName>" on the detail view +
                      voucher. */}
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
                  {/* Tourism Dirhams (AED) input hidden per request. The
                      `tourismDirham` state stays at its default ("") so the
                      create payload sends null and downstream totals are
                      unaffected. */}
                  <Col md={12}>
                    <Form.Group>
                      <Form.Label>Special Request</Form.Label>
                      <div className="special-request-grid">
                        {SPECIAL_REQUEST_OPTIONS.map((opt) => (
                          <Form.Check
                            key={opt}
                            type="checkbox"
                            id={`lm-sr-${opt.replace(/[^a-zA-Z0-9]/g, "-")}`}
                            label={opt}
                            checked={specialRequests.includes(opt)}
                            onChange={(e) => {
                              if (e.target.checked)
                                setSpecialRequests([...specialRequests, opt]);
                              else
                                setSpecialRequests(
                                  specialRequests.filter((x) => x !== opt)
                                );
                            }}
                            className="special-request-check"
                          />
                        ))}
                      </div>
                    </Form.Group>
                  </Col>
                </Row>
              </Card>

              {/* ── Payment Mode ──
                  Mirrors HotelBookingPage's three-scenario UI:
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
                          <Form.Label className="fw-semibold mb-1">Mode</Form.Label>
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
                    You do not have sufficient credit limit, and online card
                    payment is not enabled for your account. Therefore, this
                    booking cannot be completed. Please contact your account
                    manager or administrator to enable a payment method.
                  </Alert>
                )}
              </Card>
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
                        {hotel.hotelName}
                      </div>
                      {hotel.address && (
                        <div className="text-muted small mb-2">
                          {hotel.address}
                        </div>
                      )}
                      <div className="d-flex flex-wrap align-items-center gap-2">
                        {hotel.starRating != null && (
                          <Badge bg="warning" text="dark">
                            ⭐ {hotel.starRating} Star
                          </Badge>
                        )}
                        {isNonRefundableRoom ? (
                          <Badge bg="danger">Non-Refundable</Badge>
                        ) : (
                          <Badge bg="success">Flexible</Badge>
                        )}
                        {room.rateCode && (
                          <Badge bg="secondary">{room.rateCode}</Badge>
                        )}
                      </div>
                    </div>

                    <div className="hbp-summary-row">
                      <div className="hbp-summary-label">
                        <FaCalendarAlt className="me-2 text-primary" />
                        Check-in
                      </div>
                      <div className="hbp-summary-value">{ctx.checkInDate}</div>
                    </div>
                    <div className="hbp-summary-row">
                      <div className="hbp-summary-label">
                        <FaCalendarAlt className="me-2 text-primary" />
                        Check-out
                      </div>
                      <div className="hbp-summary-value">{ctx.checkOutDate}</div>
                    </div>
                    <div className="hbp-summary-row align-items-start">
                      <div className="hbp-summary-label">
                        <FaUsers className="me-2 text-primary" />
                        Guests
                      </div>
                      <div className="hbp-summary-value text-end">
                        {rooms.map((r, i) => (
                          <div key={i} className="small">
                            Room {i + 1}: {r.adults} Adult
                            {r.adults !== 1 ? "s" : ""}
                            {r.children
                              ? `, ${r.children} Child${
                                  r.children !== 1 ? "ren" : ""
                                }`
                              : ""}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="hbp-summary-row align-items-start">
                      <div className="hbp-summary-label">
                        <FaBed className="me-2 text-primary" />
                        Room
                      </div>
                      <div className="hbp-summary-value text-end">
                        {rooms.map((r, i) => {
                          const rr = getRoomRate(i);
                          const cat =
                            rr.roomCategoryName ||
                            (rr.roomCategoryId ? `Category #${rr.roomCategoryId}` : "");
                          const type = rr.roomTypeName || "";
                          return (
                            <div key={i} className="small">
                              Room {i + 1}: {cat || "—"}
                              {type ? ` (${type})` : ""}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="hbp-summary-row align-items-start">
                      <div className="hbp-summary-label">
                        <FaUtensils className="me-2 text-primary" />
                        Meal Plan
                      </div>
                      <div className="hbp-summary-value text-end">
                        {rooms.map((r, i) => {
                          const rr = getRoomRate(i);
                          return (
                            <div key={i} className="small">
                              {rr.mealPlanName || `#${rr.mealPlanId || ""}`}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="hbp-summary-row">
                      <div className="hbp-summary-label">
                        <FaUtensils className="me-2 text-primary" />
                        Room Status
                      </div>
                      {/* Availability of the selected room — same field
                          isOnRequestRoom and the create payload's roomStatus
                          derive from (mirrors HotelBookingPage). */}
                      <div className="hbp-summary-value">
                        {ctx?.room?.roomStatus || "Available"}
                      </div>
                    </div>
                    <div className="hbp-summary-row">
                      <div className="hbp-summary-label">Nights</div>
                      <div className="hbp-summary-value">{nights}</div>
                    </div>
                  </Card.Body>
                </Card>

                <Card className="shadow-sm rounded-3 border-0 hbp-price-card">
                  <Card.Header className="bg-light py-2">
                    <h6 className="mb-0 fw-bold">Price Details</h6>
                  </Card.Header>
                  <Card.Body className="p-3">
                    <div className="hbp-summary-row">
                      <div className="hbp-summary-label">
                        Selling Price ({nights} night{nights !== 1 ? "s" : ""} ×{" "}
                        {totalRoomCount} room{totalRoomCount !== 1 ? "s" : ""})
                      </div>
                      <div className="hbp-summary-value">
                        {formatPrice(totalPrice)}
                      </div>
                    </div>
                    {/* Tourism Dirhams summary row hidden per request. */}
                    <hr className="my-2" />
                    <div className="hbp-summary-row fw-bold">
                      <div className="hbp-summary-label text-danger">
                        Total Payable
                      </div>
                      <div className="hbp-summary-value text-danger">
                        {formatPrice(payableTotal)}
                      </div>
                    </div>
                  </Card.Body>
                </Card>

                {/* Quotation — under the Price Details it quotes, above the
                    booking decision and Confirm Booking (a type="button", so
                    it never submits this form). */}
                <QuotationPdfCard buildPayload={buildLastMinuteQuotationPayload} />

                {/* Booking-confirmation choice — only for refundable rates
                    whose free-cancellation deadline hasn't passed. When the
                    rate is effectively non-refundable the prompt is skipped
                    entirely and the booking goes straight to
                    "Book Now & Voucher Now" (isBookAndVoucherNow === true). */}
                {showVoucherChoice && (
                  <Card className="shadow-sm rounded-3 border-0 mt-3">
                    <Card.Body className="p-3">
                      <Form.Group>
                        <Form.Label className="fw-semibold">
                          Are you sure you want to continue with the booking?
                        </Form.Label>
                        <div className="d-flex flex-column gap-2 mt-1">
                          <Form.Check
                            type="radio"
                            id="lm-book-voucher-now"
                            name="lmBookingConfirmation"
                            label="Book and Pay Now"
                            value="Book & Voucher"
                            checked={bookingConfirmation === "Book & Voucher"}
                            onChange={(e) => setBookingConfirmation(e.target.value)}
                          />
                          <Form.Check
                            type="radio"
                            id="lm-book-voucher-later"
                            name="lmBookingConfirmation"
                            label="Hold Room and Pay Later"
                            value="Book Now & Voucher later"
                            checked={bookingConfirmation === "Book Now & Voucher later"}
                            onChange={(e) => setBookingConfirmation(e.target.value)}
                          />
                        </div>
                      </Form.Group>
                    </Card.Body>
                  </Card>
                )}

                <div className="hbp-action-bar mt-3 d-flex gap-2">
                  <Button
                    type="button"
                    variant="outline-secondary"
                    onClick={() => navigate(-1)}
                    className="flex-grow-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={submitting || noPaymentPathAvailable}
                    title={
                      noPaymentPathAvailable
                        ? "Booking cannot be completed — no payment method available for this agent."
                        : undefined
                    }
                    className="flex-grow-1"
                  >
                    {submitting ? "Booking…" : "Confirm Booking"}
                  </Button>
                </div>
              </div>
            </Col>
          </Row>
        </Form>

        {/* Hotel policy acceptance modal */}
        <Modal
          show={showPolicyModal}
          onHide={() => !policyLoading && setShowPolicyModal(false)}
          size="lg"
          centered
          backdrop="static"
          dialogClassName="policy-modal"
        >
          <Modal.Header closeButton={!policyLoading} className="policy-modal-header">
            <Modal.Title className="policy-modal-title">Last Minute Policies &amp; Terms</Modal.Title>
          </Modal.Header>
          <Modal.Body className="policy-modal-body" style={{ maxHeight: "65vh", overflowY: "auto" }}>
            {policyLoading ? (
              <div className="text-center py-4 text-muted">Loading policies...</div>
            ) : (
              <>
                <section className="policy-section">
                  <h6 className="policy-section-title">Terms &amp; Conditions</h6>
                  {hotelTerms.length > 0 ? (
                    hotelTerms.map((item, idx) => (
                      <div key={`lm-term-${idx}`} className="policy-item">
                        <div className="policy-text">{item}</div>
                      </div>
                    ))
                  ) : (
                    <div className="policy-empty">No terms &amp; conditions configured for this Last Minute rate.</div>
                  )}
                </section>

                <section className="policy-section">
                  <h6 className="policy-section-title">Cancellation Policy</h6>
                  {hotelCancellationPolicies.length > 0 ? (
                    hotelCancellationPolicies.map((item, idx) => (
                      <div key={`lm-cancel-${idx}`} className="policy-item">
                        <div className="policy-text">{item}</div>
                      </div>
                    ))
                  ) : (
                    <div className="policy-empty">No cancellation policy configured for this Last Minute rate.</div>
                  )}
                </section>

                <section className="policy-section">
                  <h6 className="policy-section-title">Amendment Policy</h6>
                  {lastMinutePolicyGroups.amendmentPolicies.length > 0 ? (
                    lastMinutePolicyGroups.amendmentPolicies.map((item, idx) => (
                      <div key={`lm-amend-${idx}`} className="policy-item">
                        <div className="policy-text">{item}</div>
                      </div>
                    ))
                  ) : (
                    <div className="policy-empty">No amendment policy configured for this Last Minute rate.</div>
                  )}
                </section>

                <section className="policy-section">
                  <h6 className="policy-section-title">No-show Policy</h6>
                  {lastMinutePolicyGroups.noShowPolicies.length > 0 ? (
                    lastMinutePolicyGroups.noShowPolicies.map((item, idx) => (
                      <div key={`lm-noshow-${idx}`} className="policy-item">
                        <div className="policy-text">{item}</div>
                      </div>
                    ))
                  ) : (
                    <div className="policy-empty">No no-show policy configured for this Last Minute rate.</div>
                  )}
                </section>

                <section className="policy-section policy-section-last">
                  <h6 className="policy-section-title">Payment Policy</h6>
                  {lastMinutePolicyGroups.paymentPolicies.length > 0 ? (
                    lastMinutePolicyGroups.paymentPolicies.map((item, idx) => (
                      <div key={`lm-payment-${idx}`} className="policy-item">
                        <div className="policy-text">{item}</div>
                      </div>
                    ))
                  ) : (
                    <div className="policy-empty">No payment policy configured for this Last Minute rate.</div>
                  )}
                </section>
              </>
            )}
          </Modal.Body>
          <Modal.Footer className="policy-modal-footer">
            <Form.Check
              type="checkbox"
              id="last-minute-policy-acceptance"
              className="me-auto policy-accept-check"
              checked={acceptedTerms && acceptedCancellations}
              onChange={(e) => {
                setAcceptedTerms(e.target.checked);
                setAcceptedCancellations(e.target.checked);
              }}
              label="I have read and accept the policies and terms & conditions"
            />
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => setShowPolicyModal(false)}
              disabled={policyLoading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={policyLoading || !acceptedTerms || !acceptedCancellations}
              onClick={() => {
                if (!acceptedTerms || !acceptedCancellations) {
                  toast.error("Please accept Terms & Conditions and Cancellation Policies to continue booking.");
                  return;
                }
                setShowPolicyModal(false);
                setShowSummaryModal(true);
              }}
            >
              Proceed
            </Button>
          </Modal.Footer>
        </Modal>

        {/* Order Summary Modal */}
        <Modal
          show={showSummaryModal}
          onHide={() => !submitting && setShowSummaryModal(false)}
          centered
          backdrop="static"
          size="lg"
          dialogClassName="confirm-booking-modal"
        >
          <Modal.Header
            closeButton={!submitting}
            className="bg-primary text-white py-2"
            style={{ borderBottom: "none" }}
          >
            <Modal.Title className="fw-semibold d-flex align-items-center">
              <FaHotel className="me-2" /> Confirm Your Booking
            </Modal.Title>
          </Modal.Header>

          <Modal.Body className="px-3 py-2 bg-light">
            <div className="border rounded-3 bg-white shadow-sm p-2">
              <div className="mb-2">
                <p className="mb-0 d-flex align-items-center flex-wrap">
                  <span className="fw-bold text-primary fs-5">
                    {hotel.hotelName}
                  </span>
                  {hotel.address && (
                    <span className="text-muted small ms-1">
                      , {hotel.address}
                    </span>
                  )}
                </p>
              </div>

              <hr className="my-2" />

              <Row className="gy-2">
                <Col xs={6}>
                  <p className="mb-1">
                    <strong>Check-In:</strong>
                    <br />
                    <span className="text-dark">{ctx.checkInDate}</span>
                  </p>
                </Col>
                <Col xs={6}>
                  <p className="mb-1">
                    <strong>Check-Out:</strong>
                    <br />
                    <span className="text-dark">{ctx.checkOutDate}</span>
                  </p>
                </Col>
                <Col xs={6}>
                  <p className="mb-1">
                    <strong>Rooms:</strong> {totalRoomCount}
                  </p>
                </Col>
                <Col xs={6}>
                  <p className="mb-1">
                    <strong>Nights:</strong> {nights}
                  </p>
                </Col>

                {/* Room category + meal plan per booked room — same
                    "what am I booking" info the hotel confirm modal shows. */}
                {rooms.map((r, i) => {
                  const rr = getRoomRate(i);
                  const cat =
                    rr.roomCategoryName ||
                    (rr.roomCategoryId ? `Category #${rr.roomCategoryId}` : "—");
                  const type = rr.roomTypeName ? ` (${rr.roomTypeName})` : "";
                  const meal =
                    rr.mealPlanName || (rr.mealPlanId ? `#${rr.mealPlanId}` : "—");
                  return (
                    <React.Fragment key={i}>
                      <Col xs={6}>
                        <p className="mb-1">
                          <strong>Room Category:</strong>
                          <br />
                          <span className="text-dark">
                            {rooms.length > 1 ? `Room ${i + 1} - ` : ""}
                            {cat}
                            {type}
                          </span>
                        </p>
                      </Col>
                      <Col xs={6}>
                        <p className="mb-1">
                          <strong>Meal Plan:</strong>
                          <br />
                          <span className="text-dark">{meal}</span>
                        </p>
                      </Col>
                    </React.Fragment>
                  );
                })}

                <Col xs={12}>
                  {/* Primary guest summary now reads the Lead-marked
                      passenger straight off the rooms array — the
                      Primary Guest Details card was hidden. */}
                  {(() => {
                    const leadGuest =
                      rooms?.[leadIndex.roomIdx]?.guests?.[leadIndex.guestIdx]
                      || {};
                    return (
                      <p className="mb-1">
                        <strong>Primary Guest:</strong>{" "}
                        {[
                          leadGuest.salutation,
                          leadGuest.firstName,
                          leadGuest.middleName,
                          leadGuest.lastName,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      </p>
                    );
                  })()}
                </Col>
                {specialRequests.length > 0 && (
                  <Col xs={12}>
                    <p className="mb-1">
                      <strong>Special Requests:</strong>
                    </p>
                    <p className="mb-0 text-muted small">
                      {specialRequests.join(", ")}
                    </p>
                  </Col>
                )}

                {/* Cancellation block — mirrors HotelBookingPage's confirm
                    modal placement (after Lead Passenger, before Selling
                    Price / Rate Split). Non-refundable → clear "no refund"
                    notice. Refundable + deadline → the free-cancellation
                    deadline with a green "Refundable until this date"
                    badge, or a red "Passed" badge if already crossed.
                    Last-minute rates are typically non-refundable so the
                    red box is the common path. Paired with a Payment Mode
                    badge column on tablet+ so the two read as one row. */}
                {isNonRefundableRoom ? (
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
                      cancelled. 100% cancellation charges apply from the
                      time of booking.
                    </p>
                  </Col>
                ) : (
                  cancellationDeadline && (
                    <Col xs={12} md={6}>
                      <p className="mb-1">
                        <strong>Cancellation Deadline:</strong>
                        <br />
                        <span className="text-dark">
                          {cancellationDeadline.toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
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
                    block. Same layout/labelling as HotelBookingPage. */}
                {(isNonRefundableRoom || cancellationDeadline) && (
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
                  {/* Selling Price + Payable rows — mirrors the hotel
                      confirm modal layout. */}
                  <div className="p-2 rounded bg-white border mt-2 d-flex justify-content-between align-items-center">
                    <h6 className="mb-0 text-muted">Selling Price</h6>
                    <h5 className="mb-0 text-success fw-bold">
                      {formatPrice(totalPrice)}
                    </h5>
                  </div>
                  <div className="p-2 rounded bg-white border mt-2 d-flex justify-content-between align-items-center">
                    <h6 className="mb-0 fw-bold">Payable</h6>
                    <h5 className="mb-0 fw-bold">
                      {formatPrice(payableTotal)}{" "}
                      <span className="text-muted small fw-normal">
                        for {totalRoomCount}{" "}
                        {totalRoomCount > 1 ? "rooms" : "room"}
                      </span>
                    </h5>
                  </div>
                </Col>
              </Row>

              <div className="mt-2 p-2 bg-white border rounded">
                <h6 className="fw-bold mb-1">Rate Split</h6>
                <div className="d-flex justify-content-between">
                  <span>Selling Price</span>
                  <span>{formatPrice(totalPrice)}</span>
                </div>
                <hr className="my-1" />
                <div className="d-flex justify-content-between fw-bold">
                  <span>Total (Selling)</span>
                  <span>{formatPrice(payableTotal)}</span>
                </div>
              </div>

              <div className="mt-2 p-2 bg-white border rounded d-flex align-items-center">
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

              <div className="mt-2 text-center">
                <p className="text-muted small mb-0">
                  Please review the booking details carefully before
                  confirming.
                </p>
              </div>
            </div>

            {error && (
              <Alert variant="danger" className="mt-3 mb-0">
                {error}
              </Alert>
            )}
          </Modal.Body>

          <Modal.Footer className="bg-light border-0 d-flex justify-content-between">
            <Button
              variant="outline-secondary"
              onClick={() => setShowSummaryModal(false)}
              disabled={submitting}
            >
              <i className="bi bi-x-circle me-1"></i> Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmFromModal}
              disabled={submitting}
              className="px-4 fw-semibold"
            >
              {submitting ? (
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

        {/* ─── Insufficient credit + card disabled → block booking ───
            Shown when the agent has no available credit AND the AgentView
            "Allow Card payment mode" toggle is off. No payment path exists,
            so the booking is turned away. Same shape as HotelBookingPage /
            DayStayBookingPage. */}
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
              Sorry — this booking can't be completed because the agent has
              no available credit and{" "}
              <strong>Card payment is not enabled</strong> for this account.
            </p>
            <p className="mb-0 text-muted small">
              Please top up the agent's credit limit, or ask an administrator
              to enable Card payment on the agent's profile, then try again.
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
              The agent's available credit is insufficient for this booking.
              You need to proceed with <strong>online payment</strong>.
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

        {/* ─── Select Payment Gateway ─── */}
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
                    htmlFor={`lm-gw-${g.id}`}
                    className={`pg-option${
                      isSelected ? " pg-option-selected" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="lm-payment-gateway"
                      id={`lm-gw-${g.id}`}
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
                    <span className="pg-option-text">
                      <span className="pg-option-name">{g.name}</span>
                      <span className="pg-option-desc">{g.desc}</span>
                    </span>
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

                // ── CC Avenue: real billing-page redirect ──
                // Distinct from the dummy /payment/:gateway path below —
                // the browser fully navigates away to CC Avenue's hosted
                // page and back, so the resume signal has to travel as a
                // URL query param (React Router state doesn't survive a
                // real cross-origin redirect). See the ccavenueOrderId
                // resume effect above. flowType tells the backend to
                // create a LAST MINUTE booking rather than a regular hotel
                // one when it finalizes.
                if (selectedGateway === "ccavenue") {
                  const billingName = [
                    primaryGuest.salutation,
                    primaryGuest.firstName,
                    primaryGuest.lastName,
                  ]
                    .filter(Boolean)
                    .join(" ");
                  navigate("/payment/ccavenue-redirect", {
                    state: {
                      flowType: "LASTMINUTE_CREATE",
                      bookingPayload: {
                        ...pendingPayload,
                        paymentMode: "ONLINE",
                      },
                      billingName,
                      amountLabel: formatPrice(insufficientAmount),
                      returnTo: location.pathname,
                    },
                  });
                  return;
                }

                // Dummy /payment/:gateway flow (test/local only). Persist
                // the payload the resume flow will replay. React state
                // (rooms / pendingPayload / ...) is lost when the user
                // navigates away to /payment and back, so the resume
                // effect above rebuilds the create call purely from
                // sessionStorage. paymentMode is flipped to "ONLINE" so
                // the Booking List labels the row correctly and the
                // backend skips its credit check + debit.
                try {
                  sessionStorage.setItem(
                    "lastMinutePendingCreatePayload",
                    JSON.stringify({
                      ...pendingPayload,
                      paymentMode: "ONLINE",
                    }),
                  );
                } catch (e) {
                  console.error(
                    "Could not persist pending last-minute create payload",
                    e,
                  );
                }
                navigate(`/payment/${selectedGateway}`, {
                  state: {
                    amountLabel: formatPrice(insufficientAmount),
                    gatewayName: gw ? gw.name : selectedGateway,
                    // After payment, land back on this same booking form
                    // with resumeCreate=true — the effect above fires the
                    // create call using the persisted payload, then
                    // navigates to the last-minute booking list on success.
                    returnTo: location.pathname,
                    returnState: { resumeCreate: true, ctx },
                  },
                });
              }}
            >
              Proceed to Pay
            </Button>
          </Modal.Footer>
        </Modal>
      </Container>
    </Layout>
  );
}

function Layout({ children }) {
  return (
    <div className="min-vh-100 bg-light d-flex flex-column hotel-booking-container">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="content-wrapper py-4 flex-grow-1" style={{ minWidth: 0, overflowX: "hidden" }}>{children}</main>
      </div>
    </div>
  );
}
