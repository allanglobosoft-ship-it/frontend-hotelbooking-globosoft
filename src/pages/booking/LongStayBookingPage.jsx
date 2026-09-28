import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Container,
  Card,
  Form,
  Button,
  Row,
  Col,
  Spinner,
  Badge,
  Modal,
  Accordion,
  Alert,
} from "react-bootstrap";
import {
  FaHotel,
  FaCalendarAlt,
  FaUsers,
  FaUtensils,
  FaCheckCircle,
} from "react-icons/fa";
import axiosInstance from "../../components/AxiosInstance";
import { createAmendmentLink } from "../../utils/amendmentLink";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import AgentBalanceDisplay from "../../components/AgentBalanceDisplay";
import QuotationPdfCard from "../../components/quotation/QuotationPdfCard";
import { toast } from "react-hot-toast";
import { toLocalDateTime, formatDateTime } from "../../utils/dateUtils";
// Reuse the hotel-booking-page styles so the long-stay page renders
// with the same shell, summary cards, and Policies & Terms modal as
// /booking/hotel.
import "../../styles/HotelBookingPage.css";

// Online-payment gateways — mirrors HotelBookingPage so the operator gets
// the same payment picker when the agent's credit is short. CC Avenue is
// real (see the "Proceed to Pay" handler below); the rest are still the
// dummy placeholder flow.
const PAYMENT_GATEWAYS = [
  { id: "ccavenue", name: "CC Avenue", desc: "Cards, UPI, Net Banking" },
  
];

// Special-request checklist — mirrors HotelBookingPage so the long-stay
// flow offers the same options. The selected labels ride along on the
// create payload (specialRequests), are persisted server-side, and show
// on the detail view + voucher.
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

// Pretty-print the structured cancellation policy chargeType + value
// rendered on the booking page. Mirrors the dropdown labels used in
// the contract create/edit table editor.
const formatChargeType = (t) => {
  switch ((t || "").toUpperCase()) {
    case "PERCENT": return "%";
    case "AMOUNT": return "Amount (AED)";
    case "FULL_STAY": return "Full Stay";
    case "NIGHTS": return "Nights";
    default: return t || "—";
  }
};
const formatChargeValue = (p) => {
  if (p == null || p.value == null) return "—";
  const t = (p.chargeType || "").toUpperCase();
  if (t === "PERCENT") return `${p.value}%`;
  if (t === "AMOUNT") return `AED ${p.value}`;
  if (t === "NIGHTS") return `${p.value} night${p.value === 1 ? "" : "s"}`;
  return String(p.value);
};

// Render one cancellation-policy row as a natural-language line —
// matches the plain-text rendering used by /booking/hotel's policy
// modal (e.g. "10% cancelled within 30 days", "Full Stay (100) no-show").
const formatCancellationPolicyLine = (p) => {
  if (!p) return "";
  const value = formatChargeValue(p);
  const cond = (p.condition || "").trim();
  return cond ? `${value} ${cond}` : value;
};

export default function LongStayBookingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [draft, setDraft] = useState(null);
  const [agents, setAgents] = useState([]);
  const [agentId, setAgentId] = useState("");
  const [rooms, setRooms] = useState([]);
  const [primaryGuest, setPrimaryGuest] = useState({
    salutation: "",
    firstName: "",
    middleName: "",
    lastName: "",
    email: "",
    phone: "",
    passportNo: "",
    nationality: "",
    gender: "",
  });
  // ── Lead passenger marker — { roomIdx, guestIdx } pointing at the
  //    single guest the user has flagged as Lead. Mirrors the gov /
  //    SC / Student / Hotel / LastMinute booking pages. Defaults to
  //    the first guest (room 0, guest 0) so the column always has
  //    one selection on first render. Children can't be Lead. The
  //    Lead-marked guest drives the submitted `primaryGuestName /
  //    Details` (replacing the hidden Lead Passenger card).
  const [leadIndex, setLeadIndex] = useState({ roomIdx: 0, guestIdx: 0 });

  const handleLeadSelect = (roomIdx, guestIdx) => {
    const g = rooms?.[roomIdx]?.guests?.[guestIdx];
    if (g?.isChild) return;
    setLeadIndex({ roomIdx, guestIdx });
  };

  const [remarks, setRemarks] = useState("");
  const [tourismDirham, setTourismDirham] = useState("");
  // Selected special requests — same checklist as HotelBookingPage.
  const [specialRequests, setSpecialRequests] = useState([]);
  // Optional "Booking done for" free-text. When set, the detail view + voucher
  // render it as "Contact: <value>/<agentName>". The input is ADMIN-only.
  const [bookingDoneFor, setBookingDoneFor] = useState("");
  const isAdmin =
    String(localStorage.getItem("currentActiveRole") || "").toUpperCase() ===
    "ADMIN";

  const handleSpecialRequestToggle = (request) => {
    setSpecialRequests((prev) =>
      prev.includes(request)
        ? prev.filter((item) => item !== request)
        : [...prev, request],
    );
  };

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
  // Payment mode — mirrors the selector on /hotel-booking-page. Display-only;
  // default CREDITLIMIT keeps the legacy behaviour (credit debit happens
  // regardless of the chosen mode).
  const [paymentMode, setPaymentMode] = useState("CREDITLIMIT");

  // ── Payment-gate modals (mirrors HotelBookingPage / StudentBookingPage) ──
  // When the agent's credit is short at Confirm time:
  //   • Card disabled → "Booking Cannot Be Completed" blocks the booking.
  //   • Card enabled  → "Online Payment Required" → gateway picker.
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [showGatewayModal, setShowGatewayModal] = useState(false);
  const [insufficientAmount, setInsufficientAmount] = useState(0);
  const [selectedGateway, setSelectedGateway] = useState("");
  const [showNoPaymentPathModal, setShowNoPaymentPathModal] = useState(false);
  // Per-agent "Card" payment-mode gate, toggled from AgentView. Also filters
  // the Card option out of the Payment Mode dropdown.
  const [agentCardPaymentEnabled, setAgentCardPaymentEnabled] = useState(false);
  // Agent's available credit balance — fetched upfront so the Payment
  // Mode dropdown can render the correct 3-scenario UI BEFORE Confirm.
  const [agentAvailableBalance, setAgentAvailableBalance] = useState(null);

  // ── Voucher-choice + booking-flow status (mirrors HotelBookingPage) ──
  // Refundable rate + a cancellation policy on the contract → surface the
  // "Book Now & Voucher Now" / "Book Now & Voucher Later" choice above the
  // Confirm Booking button. Non-refundable rates and rates with no policy
  // skip the choice and are treated as "voucher now" → RECONFIRMED.
  const [bookingConfirmation, setBookingConfirmation] = useState("Book & Voucher");
  const [voucherChoiceMade, setVoucherChoiceMade] = useState(false);
  const [voucherChoiceError, setVoucherChoiceError] = useState(false);
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  // Payload snapshot the payment-gateway modal uses to persist a
  // resumable create call. Built inside confirmBooking before the credit
  // check so the online-payment branch can hand it off to /payment/*.
  const [pendingPayload, setPendingPayload] = useState(null);
  // Pre-confirmation Policies & Terms modal — mirrors
  // HotelBookingPage's flow: Confirm Booking → policy modal → accept
  // → summary modal → final Confirm.
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("longStayBookingDraft");
    if (!raw) {
      toast.error("No booking draft — please search again");
      navigate("/new-booking/long-stay", { replace: true });
      return;
    }
    const parsed = JSON.parse(raw);
    setDraft(parsed);
    if (parsed.agentId) setAgentId(String(parsed.agentId));
    if (parsed.nationality) {
      setPrimaryGuest((g) => ({ ...g, nationality: parsed.nationality }));
    }

    // Initialize rooms with guests array based on search criteria
    const initialRooms = (parsed.rooms || [{ adults: 1, children: 0, childAges: [] }]).map(
      (room) => ({
        adults: room.adults || 1,
        children: room.children || 0,
        childAges: room.childAges || [],
        guests: Array.from(
          { length: (room.adults || 1) + (room.children || 0) },
          (_, i) => ({
            salutation: "",
            firstName: "",
            lastName: "",
            gender: "",
            isChild: i >= (room.adults || 1),
          })
        ),
      })
    );
    setRooms(initialRooms);

    axiosInstance
      .get("/api/agent?activeOnly=true")
      .then((res) => setAgents(res.data || []))
      .catch(() => {});
  }, [navigate]);

  // ── Agent card-payment flag — same gate as HotelBookingPage. Drives the
  //    Card option in the Payment Mode dropdown and (re-fetched at Confirm
  //    time) the no-payment-path block. Fail-safe default: card DISABLED.
  useEffect(() => {
    if (!agentId) { setAgentCardPaymentEnabled(false); return; }
    let cancelled = false;
    axiosInstance
      .get(`/api/agent/${agentId}`)
      .then((res) => { if (!cancelled) setAgentCardPaymentEnabled(!!res?.data?.cardPaymentEnabled); })
      .catch(() => { if (!cancelled) setAgentCardPaymentEnabled(false); });
    return () => { cancelled = true; };
  }, [agentId]);

  // ── Agent available credit balance — mirror HotelBookingPage so the
  //    payment-mode scenario resolves at render time (not just at Confirm).
  useEffect(() => {
    if (!agentId) { setAgentAvailableBalance(null); return; }
    let cancelled = false;
    axiosInstance
      .get(`/api/agent-credit-limit/agent/${agentId}`)
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
  }, [agentId]);

  // ── Payment-mode scenario derivation (mirrors HotelBookingPage) ────────
  // bookingSellingPrice = quote.totalAmount + tourism dirham. Kept in
  // sync with the same amount the create endpoint debits and the credit
  // pre-check uses.
  const bookingSellingPrice = useMemo(() => {
    const base = quote?.totalAmount != null ? Number(quote.totalAmount) : 0;
    const td = parseFloat(tourismDirham);
    return base + (Number.isFinite(td) ? td : 0);
  }, [quote, tourismDirham]);

  // Client-side "sufficient credit" flag — null while balance is loading
  // so the UI doesn't flash the wrong scenario on first render.
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

  // Keep the selected paymentMode in sync with the valid options. Empty
  // options (scenario 3) is a no-op — the UI blocks the Confirm button
  // and the guard in handleBook stops any Enter-key submit.
  useEffect(() => {
    if (paymentModeOptions.length === 0) return;
    if (!paymentModeOptions.some((o) => o.value === paymentMode)) {
      setPaymentMode(paymentModeOptions[0].value);
    }
  }, [paymentModeOptions, paymentMode]);

  // Post-payment resume — mirrors HotelBookingPage / StudentBookingPage.
  // DummyPaymentPage returns us here with location.state.resumeCreate =
  // true after the dummy card charge succeeds. React state (draft /
  // rooms / pendingPayload) is lost across the /payment detour, so we
  // rebuild the create call purely from the payload persisted under
  // "longStayPendingCreatePayload" just before navigating away. On
  // success we go to the Long Stay Booking List.
  //
  // Guards:
  //   • The flag is stripped from history immediately so a reload /
  //     back doesn't re-fire the create.
  //   • sessionStorage is cleared right after read so a stray landing
  //     on this URL with a stale flag can't replay an old payload.
  useEffect(() => {
    if (!location.state?.resumeCreate) return;
    const stored = sessionStorage.getItem("longStayPendingCreatePayload");
    navigate(location.pathname, { replace: true, state: {} });
    if (!stored) return;
    sessionStorage.removeItem("longStayPendingCreatePayload");
    let payload;
    try {
      payload = JSON.parse(stored);
    } catch (e) {
      console.error("Malformed persisted long-stay create payload", e);
      return;
    }
    (async () => {
      try {
        setSubmitting(true);
        const res = await axiosInstance.post(
          "/api/longStayBooking/create",
          payload,
        );
        toast.success(
          `Booking confirmed: ${res.data?.bookingCode || ""}`,
        );
        sessionStorage.removeItem("longStayBookingDraft");
        setShowConfirmModal(false);
        navigate("/booking-details/long-stay-booking-list");
      } catch (err) {
        const beMsg = err?.response?.data?.message || err?.message || null;
        console.error("Error finalising long-stay booking after payment:", err);
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
  // redirects back here. No sessionStorage payload is needed — the backend
  // already persisted it at /initiate.
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const ccavenueOrderId = searchParams.get("ccavenueOrderId");
    const ccavenueStatus = searchParams.get("ccavenueStatus");
    if (!ccavenueOrderId) return;

    // Strip the query string so a reload doesn't re-trigger this. draft is
    // lost either way (it never survives the real redirect), so the page
    // will briefly show its "no draft" fallback while this runs.
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
          `/api/payment/ccavenue/finalize-longstay/${ccavenueOrderId}`,
        );
        toast.success(`Booking confirmed: ${res.data?.bookingCode || ""}`);
        sessionStorage.removeItem("longStayBookingDraft");
        setShowConfirmModal(false);
        navigate("/booking-details/long-stay-booking-list");
      } catch (err) {
        const beMsg = err?.response?.data?.message || err?.message || null;
        console.error("Post-payment long-stay finalize failed:", err);
        toast.error(beMsg || "Booking submission failed. Please try again.");
      } finally {
        setSubmitting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  useEffect(() => {
    if (!draft) return;
    const fetchQuote = async () => {
      try {
        setQuoteError(null);
        // Send the party size so the backend can add extra-adult and
        // child charges. Each room's adults/children count maps 1:1
        // to LongStayRoomGuestsDTO on the backend, which is what
        // LongStayBookingService#countExtras reads.
        const partyRooms = (rooms || []).map((r) => ({
          adults: Number(r.adults) || 0,
          children: Number(r.children) || 0,
          childAges: r.childAges || [],
        }));
        const res = await axiosInstance.post("/api/longStayBooking/quote", {
          hotelId: draft.hotelId,
          longStayRoomId: draft.room.longStayRoomId,
          // agentId lets the backend apply this agent's configured
          // markup (PERCENT or AMOUNT) on top of the room rate —
          // mirrors the hotel booking flow.
          agentId: agentId ? Number(agentId) : draft.agentId || null,
          checkInDate: toLocalDateTime(draft.checkIn),
          checkOutDate: toLocalDateTime(draft.checkOut),
          rooms: partyRooms,
        });
        setQuote(res.data);
      } catch (err) {
        const msg = err.response?.data?.message || err.message || "Could not compute quote";
        setQuoteError(msg);
        setQuote(null);
      }
    };
    fetchQuote();
  }, [draft, rooms, agentId]);

  // ────────────────────────────────────────────────────────────────
  // Booking-flow derivation — mirrors HotelBookingPage's confirm-booking
  // flowchart. Long-stay data model doesn't carry a maxCancellationNights
  // number, so — like HotelBookingPage's "cancel until check-in" default —
  // the free-cancellation cutoff for ANY Flexible/Refundable room is the
  // check-in date itself (any earlier tiered rules still inform the operator
  // via the Policies modal). Non-refundable and On-Request rooms skip the
  // choice entirely and resolve to RECONFIRMED, exactly like the hotel flow.
  // ────────────────────────────────────────────────────────────────
  const isRefundableRate = draft?.room?.refundable === true;
  // On-Request rate: the room the operator picked had no configured
  // availability (roomStatus "On Request" from the room list). On-Request
  // takes precedence over the refundable/voucher rules — the booking is
  // created as OnRequest even when the rate is Non-Refundable (mirrors the
  // hotel flow's isOnRequestRate branch).
  const isOnRequestRate = draft?.room?.roomStatus === "On Request";
  // Deadline = the check-in day for every Flexible/Refundable room (no
  // dependency on whether the contract has cancellation-policy tiers, so the
  // Voucher Now / Voucher Later choice appears for all refundable rooms —
  // matching HotelBookingPage). Non-refundable rooms get no deadline.
  const cancellationDeadline = (() => {
    if (!isRefundableRate) return null;
    const cinRaw = draft?.checkIn;
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
  // Only shown for Refundable rates whose deadline hasn't passed.
  // Non-refundable / past-deadline / On-Request skip the choice.
  const showVoucherChoice =
    !isOnRequestRate && isRefundableRate && !!cancellationDeadline && !isOutsideDeadline;
  // Resolved status that will travel to the backend on
  // payload.bookingFlowStatus. Same rules as HotelBookingPage:
  //   • Non-refundable       → RECONFIRMED
  //   • Deadline already past → RECONFIRMED (force Voucher Now)
  //   • Within deadline       → respect the radio pick
  //       - "Book Now & Voucher later" → CONFIRMED
  //       - otherwise                  → RECONFIRMED
  const resolvedBookingFlowStatus = (() => {
    if (isOnRequestRate) return "ONREQUEST";
    if (!isRefundableRate) return "RECONFIRMED";
    if (isOutsideDeadline) return "RECONFIRMED";
    return bookingConfirmation === "Book Now & Voucher later"
      ? "CONFIRMED"
      : "RECONFIRMED";
  })();
  // Reset bookingConfirmation to the default whenever "Voucher Later" no
  // longer applies (non-refundable draft, or we've crossed the deadline).
  // Same guard as HotelBookingPage so a stale pick can't leak into the
  // create payload.
  useEffect(() => {
    if (!draft) return;
    if (!showVoucherChoice && bookingConfirmation !== "Book & Voucher") {
      setBookingConfirmation("Book & Voucher");
    }
    if (!showVoucherChoice && voucherChoiceMade) {
      setVoucherChoiceMade(false);
      setVoucherChoiceError(false);
    }
  }, [draft, bookingConfirmation, showVoucherChoice, voucherChoiceMade]);

  const handleGuestChange = (rIdx, gIdx, field, value) => {
    setRooms((prev) => {
      const updated = [...prev];
      updated[rIdx] = {
        ...updated[rIdx],
        guests: updated[rIdx].guests.map((g, i) =>
          i === gIdx ? { ...g, [field]: value } : g
        ),
      };
      return updated;
    });
    if (rIdx === 0 && gIdx === 0 && ["salutation", "firstName", "lastName", "gender"].includes(field)) {
      setPrimaryGuest((p) => ({ ...p, [field]: value }));
    }
    const key = `r${rIdx}_g${gIdx}_${field}`;
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const handlePrimaryGuestChange = (field, value) => {
    setPrimaryGuest((p) => ({ ...p, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const validate = () => {
    const e = {};
    // Lead Passenger / Primary Guest validation removed — the card
    // has been hidden. The Guest Details grid above is the single
    // source of customer details; the submit payload derives the
    // primary-guest fields from Room 1 / Guest 1 at build time.
    rooms.forEach((room, rIdx) => {
      room.guests.forEach((g, gIdx) => {
        if (!g.salutation) e[`r${rIdx}_g${gIdx}_salutation`] = "Required";
        if (!g.firstName?.trim()) e[`r${rIdx}_g${gIdx}_firstName`] = "Required";
        if (!g.lastName?.trim()) e[`r${rIdx}_g${gIdx}_lastName`] = "Required";
      });
    });
    return e;
  };

  const handleBook = () => {
    // Scenario 3 short-circuit — no viable payment path (no credit AND
    // Card disabled). Guards against a form-submit sneaking past the
    // disabled Confirm Booking button.
    if (noPaymentPathAvailable) {
      toast.error(
        "Booking cannot be completed — no payment method available for this agent.",
      );
      return;
    }
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    if (!quote || quoteError) {
      toast.error("Price quote not ready — please wait or retry");
      return;
    }
    // Voucher-choice gate — mirrors HotelBookingPage. When the Voucher
    // Now / Later choice is shown, the user must pick one explicitly
    // before we can proceed to the policies / confirm modal.
    if (showVoucherChoice && !voucherChoiceMade) {
      setVoucherChoiceError(true);
      toast.error("Please select a booking option to continue.");
      return;
    }
    // Always gate the booking summary behind the Policies & Terms modal —
    // the operator must accept T&C before the "Confirm Your Booking" summary
    // modal opens (mirrors HotelBookingPage). Proceed inside the policy modal
    // opens the summary (see its Proceed button → setShowConfirmModal). The
    // modal degrades gracefully when the contract has no policies/T&C
    // configured, showing "No … configured" placeholders.
    setPolicyAccepted(false);
    setShowPolicyModal(true);
  };

  const confirmBooking = async () => {
    try {
      setSubmitting(true);
      // Lead Passenger card is hidden — derive primary-guest fields
      // from the Lead-marked guest in the Guest Details grid
      // (defaults to Room 1 / Guest 1 if the user hasn't moved the
      // radio). Email / phone / passportNo / nationality are no
      // longer collected on the form and are sent as empty strings
      // (or null on optional fields). The backend ignores empty
      // optional values so the /api/longStayBooking/create contract
      // stays intact.
      const leadGuest =
        rooms?.[leadIndex.roomIdx]?.guests?.[leadIndex.guestIdx] || {};
      const fullName = [
        leadGuest.salutation,
        leadGuest.firstName,
        leadGuest.middleName,
        leadGuest.lastName,
      ]
        .filter(Boolean)
        .join(" ")
        .trim();
      const payload = {
        hotelId: draft.hotelId,
        longStayContractId: draft.contract.longStayContractId,
        longStayRoomId: draft.room.longStayRoomId,
        agentId: agentId ? Number(agentId) : null,
        // Optional "Booking Done By Employee" — set in LongStaySearch,
        // threaded through LongStayRoomList's draft into the create call.
        // Backend's LongStayBookingService.create resolves it via
        // EmployeeRepository and stamps the relation on the new
        // long_stay_booking row.
        employeeId: draft.employeeId || null,
        checkInDate: toLocalDateTime(draft.checkIn),
        checkOutDate: toLocalDateTime(draft.checkOut),
        primaryGuestName: fullName,
        primaryGuestEmail: "",
        primaryGuestPhone: "",
        // Nationality (country code, e.g. "AE") selected during search and
        // carried on the draft — persisted on the booking and shown on the
        // detail view + voucher.
        nationality: draft?.nationality || null,
        remarks: remarks || null,
        // Optional "Booking done for" free-text (admin-only field) → shown as
        // "Contact: <value>/<agentName>" on the detail view + voucher.
        bookingDoneFor: bookingDoneFor.trim() || null,
        // Selected special-request labels — persisted server-side and
        // surfaced on the detail view + voucher (mirrors HotelBookingPage).
        specialRequests: specialRequests,
        // Location column in the detail view's Booking History. The IP
        // Address column is stamped server-side from the create request
        // (each system's own IPv4), so it is not sent here.
        bookingLocation: clientNetwork.bookingLocation,
        // Payment mode chosen below — stored on the booking (display-only).
        paymentMode,
        // Booking-flow status + voucher choice — mirrors HotelBookingPage.
        // The backend can trust these directly instead of re-deriving from
        // (refundable, deadlineDate, bookingConfirmation).
        bookingConfirmation: bookingConfirmation || "Book & Voucher",
        bookingFlowStatus: resolvedBookingFlowStatus,
        // Availability origin captured from the room list badge so the backend
        // starts On-Request bookings as ONREQUEST and drives the credit
        // lifecycle (charged only on Reconfirm).
        roomStatus: draft?.room?.roomStatus || "Available",
        isBookandVoucher: isRefundableRate
          ? bookingConfirmation === "Book & Voucher"
          : false,
        isOutsideDeadline,
        deadlineDate: cancellationDeadline
          ? `${cancellationDeadline.getFullYear()}-${String(
              cancellationDeadline.getMonth() + 1,
            ).padStart(2, "0")}-${String(
              cancellationDeadline.getDate(),
            ).padStart(2, "0")}T00:00:00`
          : null,
        tourismDirham:
          tourismDirham !== "" && !isNaN(Number(tourismDirham))
            ? Number(tourismDirham)
            : null,
        // Display currency chosen on the search page. `displayCurrencyRate` is
        // the AED→target factor; the booking total stays AED and the backend
        // stores the code + converted amount. AED → factor 1.
        displayCurrencyCode: draft?.currency?.code || "AED",
        displayCurrencyRate:
          Number(draft?.currency?.factor) > 0 ? Number(draft.currency.factor) : 1,
        primaryGuestDetails: {
          salutation: leadGuest.salutation || "",
          firstName: (leadGuest.firstName || "").trim(),
          middleName: leadGuest.middleName?.trim() || null,
          lastName: (leadGuest.lastName || "").trim(),
          email: "",
          phone: "",
          passportNo: null,
          nationality: draft?.nationality || null,
          gender: leadGuest.gender || null,
        },
        rooms: rooms.map((room, rIdx) => ({
          adults: room.adults,
          children: room.children,
          childAges: room.childAges,
          guests: room.guests.map((g, gIdx) => ({
            salutation: g.salutation,
            firstName: g.firstName?.trim() || "",
            lastName: g.lastName?.trim() || "",
            gender: g.gender || null,
            isChild: !!g.isChild,
            childAge: g.isChild
              ? room.childAges[gIdx - room.adults] ?? null
              : null,
            // Lead flag mirrors the other dedicated-flow booking
            // pages. Backend ignores unknown fields so this stays
            // backward-compatible with /api/longStayBooking/create.
            isLead: rIdx === leadIndex.roomIdx && gIdx === leadIndex.guestIdx,
          })),
        })),
      };
      // Stash the payload so the gateway modal (below) can persist it
      // to sessionStorage before navigating to /payment/*, and the
      // resume effect can replay it after payment.
      setPendingPayload(payload);
      // ── Payment-gate pre-check (mirrors HotelBookingPage.confirmBooking) ──
      // Ask the BE whether the agent has enough credit for the payable total
      // (markup + Tourism Dirham inclusive — what the create endpoint debits).
      // When credit is short:
      //   • On Request room OR Book Now & Voucher Later → proceed with the
      //     create call (payment-gate matrix: these flows always book; the BE
      //     skips their create-time debit and settles at Reconfirm).
      //   • Everything else → close the Order Summary modal, then:
      //       – Card disabled at the agent level → no viable payment path;
      //         block with the "Booking Cannot Be Completed" modal.
      //       – Card enabled → "Online Payment Required" → gateway picker.
      // The check fails OPEN (credit endpoint error → proceed; the BE keeps
      // its own check-and-reject backstop) so the operator is never trapped.
      const requiredAmount = Number(newTotal) || 0;
      if (payload.agentId && requiredAmount > 0) {
        try {
          const [credit, agentResp] = await Promise.all([
            axiosInstance.get(
              `/api/agent-credit-limit/check-sufficient-credit?agentId=${payload.agentId}&requiredAmount=${requiredAmount}`,
            ),
            axiosInstance
              .get(`/api/agent/${payload.agentId}`)
              .catch(() => ({ data: { cardPaymentEnabled: false } })),
          ]);
          if (credit.data === false) {
            const isVoucherLater =
              bookingConfirmation === "Book Now & Voucher later";
            const bypassPaymentModal = isVoucherLater || isOnRequestRate;
            if (!bypassPaymentModal) {
              setInsufficientAmount(requiredAmount);
              setShowConfirmModal(false);
              setSubmitting(false);
              if (!agentResp?.data?.cardPaymentEnabled) {
                setShowNoPaymentPathModal(true);
                return;
              }
              setShowInsufficientModal(true);
              return;
            }
            console.log(
              isOnRequestRate
                ? "[LONG_STAY] Insufficient credit but On Request rate — proceeding with create."
                : "[LONG_STAY] Insufficient credit but Voucher Later selected — proceeding with create; credit deducted at Reconfirm.",
            );
          }
        } catch (e) {
          /* non-fatal — backend create still enforces the credit check */
        }
      }

      const res = await axiosInstance.post("/api/longStayBooking/create", payload);
      toast.success(`Booking confirmed: ${res.data.bookingCode}`);
      sessionStorage.removeItem("longStayBookingDraft");
      setShowConfirmModal(false);
      // "Add New Item" amendment flow: link to the parent hotel booking and
      // return to its detail page; otherwise keep the normal list redirect.
      // The create call above is unchanged.
      if (draft.parentBookingCode) {
        const parentId = await createAmendmentLink({
          parentBookingCode: draft.parentBookingCode,
          childType: "LONG_STAY",
          childTypeLabel: "Long Stay",
          childBookingId: res.data.longStayBookingId,
          childBookingCode: res.data.bookingCode,
          childDetailRoutePrefix: "/booking-details/long-stay-booking/",
          childReferenceNumber: res.data.referenceNumber || res.data.bookingCode,
          childStatus: res.data.confirmationStatus || res.data.status || "Confirmed",
          childHotelName: draft.hotelName,
          childCheckInDate: draft.checkIn,
          childCheckOutDate: draft.checkOut,
          childTotalRate: quote?.totalAmount,
          childGuestName: fullName,
        });
        if (parentId) {
          navigate(`/booking-details/hotel-booking/${parentId}`);
          return;
        }
      }
      navigate("/booking-details/long-stay-booking-list");
    } catch (err) {
      toast.error(`Booking failed: ${err.response?.data?.message || err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (!draft) return null;

  // Display currency carried from the search/room-list (rates are AED; this
  // converts them for display only — the create payload stays AED). AED → 1.
  const _lsCur = draft?.currency || { code: "AED", factor: 1 };
  const curCode = _lsCur.code || "AED";
  const curFactor = Number(_lsCur.factor) > 0 ? Number(_lsCur.factor) : 1;
  const formatPrice = (price) =>
    `${curCode} ${((Number(price) || 0) * curFactor).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  // Tourism Dirham parsed for live summary calculations — mirrors
  // HotelBookingPage#tourismDirhamsAmount so the two flows behave
  // identically.
  const tdAmount =
    tourismDirham !== "" && !isNaN(Number(tourismDirham))
      ? Number(tourismDirham)
      : 0;
  // quote.totalAmount is already agent-markup-inclusive (see
  // LongStayBookingService#quote). totalAmountWithoutMarkup +
  // markupAmount are the pre-markup audit values backend now ships
  // so we can render the same Selling Price → Markup → Total
  // breakdown the hotel booking page shows.
  const sellingPrice = quote?.totalAmount != null ? Number(quote.totalAmount) : 0;
  const preMarkupRate =
    quote?.totalAmountWithoutMarkup != null
      ? Number(quote.totalAmountWithoutMarkup)
      : sellingPrice;
  const markupAmount =
    quote?.markupAmount != null ? Number(quote.markupAmount) : 0;
  const markupType = quote?.markupType || null;
  const markupValue = quote?.markupValue != null ? Number(quote.markupValue) : null;
  const newTotal = sellingPrice + tdAmount;

  // ── derived totals for header chips ────────────────────────────────────
  const totalAdults = rooms.reduce((s, r) => s + (r.adults || 0), 0);
  const totalChildren = rooms.reduce((s, r) => s + (r.children || 0), 0);
  const totalGuests = totalAdults + totalChildren;

  const mealPlanLabel =
    draft.room.roomTypeName ||
    (draft.room.meal ? "Meal included" : "Room only");

  // ── Quotation PDF ─────────────────────────────────────────────────────
  // Quotes what this page shows: the Booking Summary and the customer-
  // facing Selling Price / New Total from Price Details (never the agent's
  // pre-markup rate or markup), in the display currency like formatPrice.
  // Policy lines use the same formatter as the Policies modal.
  const buildLongStayQuotationPayload = () => {
    if (!quote || quoteError) return null;
    const toDisplay = (aed) =>
      Math.round((Number(aed) || 0) * curFactor * 100) / 100;
    const stayNights = quote.totalNights;
    const describeGuests = (r) => {
      const adults = Number(r?.adults) || 0;
      const children = Number(r?.children) || 0;
      return `${adults} Adult${adults === 1 ? "" : "s"}${
        children ? `, ${children} Child${children === 1 ? "" : "ren"}` : ""
      }`;
    };
    const categoryName =
      draft.room.roomCategoryName ||
      (draft.room.hotelRoomCategoryId
        ? `Category #${draft.room.hotelRoomCategoryId}`
        : "Room");
    const billing =
      draft.contract.additionalCostType === "WEEKLY"
        ? "Weekly billing"
        : "Day-wise billing";

    const lead = rooms?.[leadIndex.roomIdx]?.guests?.[leadIndex.guestIdx];
    const leadNames = [lead?.firstName, lead?.middleName, lead?.lastName]
      .map((p) => (p ? String(p).trim() : ""))
      .filter(Boolean);
    const leadName = leadNames.length
      ? [lead?.salutation ? String(lead.salutation).trim() : "", ...leadNames]
          .filter(Boolean)
          .join(" ")
      : "";

    const priceItems = [
      {
        description: `Long Stay - ${categoryName}`,
        details: [
          mealPlanLabel,
          `${rooms.length} Room${rooms.length === 1 ? "" : "s"}`,
          stayNights != null
            ? `${stayNights} Night${Number(stayNights) === 1 ? "" : "s"}`
            : "",
          billing,
        ]
          .filter(Boolean)
          .join(", "),
        amount: toDisplay(sellingPrice),
      },
    ];
    if (tdAmount > 0) {
      priceItems.push({
        description: "Tourism Dirham",
        details: "",
        amount: toDisplay(tdAmount),
      });
    }

    return {
      bookingType: "LONG_STAY",
      agentId: Number(agentId) || null,
      currency: curCode,
      serviceName: draft.hotelName || "",
      serviceSubtitle: draft.address || "",
      customerName: leadName || null,
      details: [
        { label: "Check-in", value: formatDateTime(draft.checkIn) },
        { label: "Check-out", value: formatDateTime(draft.checkOut) },
        { label: "Nights", value: stayNights != null ? String(stayNights) : "" },
        { label: "Rooms", value: String(rooms.length) },
        {
          label: "Guests",
          value: rooms
            .map((r, i) => `Room ${i + 1}: ${describeGuests(r)}`)
            .join("\n"),
        },
        {
          label: "Room",
          value: rooms
            .map((r, i) => `Room ${i + 1}: ${r.roomCategoryName || categoryName}`)
            .join("\n"),
        },
        { label: "Meal Plan", value: mealPlanLabel },
        { label: "Billing", value: billing },
        { label: "Room Status", value: draft.room.roomStatus || "Available" },
        {
          label: "Refund Status",
          value: draft.room.refundable ? "Flexible" : "Non-Refundable",
        },
      ],
      priceItems,
      totalAmount: toDisplay(newTotal),
      cancellationPolicy: [
        ...(Array.isArray(draft.contract.cancellationPolicy)
          ? draft.contract.cancellationPolicy
              .map((p) => formatCancellationPolicyLine(p))
              .filter(Boolean)
          : []),
        ...(draft.contract.cancellationPolicyNotes
          ? [String(draft.contract.cancellationPolicyNotes)]
          : []),
      ],
      notes: Array.isArray(draft.contract.termsAndConditions)
        ? draft.contract.termsAndConditions.filter(
            (t) => typeof t === "string" && t.trim(),
          )
        : [],
    };
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column hotel-booking-container">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        {/* overflow-x: clip (not hidden) so the right-column Booking Summary's
            position: sticky keeps working — `hidden` turns <main> into a scroll
            container and breaks sticky; `clip` still hides horizontal overflow. */}
        <main className="content-wrapper py-4 flex-grow-1" style={{ minWidth: 0, overflowX: "clip" }}>
          <Container fluid="xl">
            {/* Long Stay route heading — UI only, mirrors the heading shown
                on /new-booking/long-stay once results arrive. */}
            <div className="hs-page-heading">
              <h3 className="hs-page-heading-title">Long Stay</h3>
            </div>
            <div className="d-flex justify-content-end mb-2">
              <AgentBalanceDisplay agentId={agentId} />
            </div>

            <Form
              onSubmit={(e) => {
                e.preventDefault();
                handleBook();
              }}
            >
              <Row className="g-3">
                <Col lg={8} className="hbp-left-col">
                  {/* Guest Details */}
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
                      </div>
                    </Card.Header>
                    <Card.Body className="p-0">
                      <Accordion
                        alwaysOpen
                        defaultActiveKey={rooms.map((_, i) => i.toString())}
                        className="guest-details-accordion"
                      >
                        {rooms.map((room, rIdx) => (
                          <Accordion.Item
                            key={rIdx}
                            eventKey={rIdx.toString()}
                            className="mb-3 guest-room-item"
                          >
                            <Accordion.Header className="bg-primary text-white">
                              <h6 className="mb-0 fw-bold w-100 d-flex flex-wrap align-items-center gap-2">
                                <span>
                                  Room {rIdx + 1} -{" "}
                                  {room.roomCategoryName ||
                                    draft.room.roomCategoryName ||
                                    `Category #${draft.room.hotelRoomCategoryId}`}
                                </span>
                                {mealPlanLabel && (
                                  <Badge bg="light" text="dark" className="ms-2">
                                    <FaUtensils className="me-1" />
                                    {mealPlanLabel}
                                  </Badge>
                                )}
                              </h6>
                            </Accordion.Header>
                            <Accordion.Body className="p-3">
                              {/* Column headers — mirrors the rest
                                  of the dedicated-flow booking pages
                                  so every Guest Details grid looks
                                  identical. */}
                              <Row className="fw-semibold small text-muted px-2 mb-1 d-none d-md-flex">
                                <Col md={2}>Passenger</Col>
                                <Col md={2}>Title *</Col>
                                <Col md={3}>First Name *</Col>
                                <Col md={3}>Surname *</Col>
                                <Col md={2} className="text-center">Lead</Col>
                              </Row>
                              {room.guests.map((g, gIdx) => {
                                const isLead =
                                  leadIndex.roomIdx === rIdx &&
                                  leadIndex.guestIdx === gIdx;
                                return (
                                <div key={gIdx} className="guest-row mb-2">
                                  <Row className="align-items-center g-2">
                                    <Col md={2}>
                                      <span className="fw-semibold text-muted">
                                        {g.isChild
                                          ? `Child ${
                                              gIdx - room.adults + 1
                                            } (Age: ${
                                              room.childAges[gIdx - room.adults] ??
                                              "-"
                                            })`
                                          : `Adult ${gIdx + 1}`}
                                      </span>
                                    </Col>
                                    <Col md={2}>
                                      <Form.Select
                                        value={g.salutation}
                                        onChange={(e) =>
                                          handleGuestChange(
                                            rIdx,
                                            gIdx,
                                            "salutation",
                                            e.target.value
                                          )
                                        }
                                        className="form-control-sm"
                                        isInvalid={
                                          !!errors[`r${rIdx}_g${gIdx}_salutation`]
                                        }
                                      >
                                        <option value="">SELECT</option>
                                        <option value="Mr">Mr</option>
                                        <option value="Mrs">Mrs</option>
                                        <option value="Ms">Ms</option>
                                        <option value="Master">Master</option>
                                      </Form.Select>
                                    </Col>
                                    <Col md={3}>
                                      <Form.Control
                                        type="text"
                                        placeholder="First Name"
                                        value={g.firstName}
                                        onChange={(e) =>
                                          handleGuestChange(
                                            rIdx,
                                            gIdx,
                                            "firstName",
                                            e.target.value
                                          )
                                        }
                                        className="form-control-sm"
                                        isInvalid={
                                          !!errors[`r${rIdx}_g${gIdx}_firstName`]
                                        }
                                      />
                                    </Col>
                                    <Col md={3}>
                                      <Form.Control
                                        type="text"
                                        placeholder="Surname"
                                        value={g.lastName}
                                        onChange={(e) =>
                                          handleGuestChange(
                                            rIdx,
                                            gIdx,
                                            "lastName",
                                            e.target.value
                                          )
                                        }
                                        className="form-control-sm"
                                        isInvalid={
                                          !!errors[`r${rIdx}_g${gIdx}_lastName`]
                                        }
                                      />
                                    </Col>
                                    {/* Gender column hidden by
                                        request. State `g.gender`
                                        keeps its default empty
                                        string so the payload key
                                        stays intact. */}
                                    <Col md={2} className="text-center">
                                      {/* Lead radio — only adults can
                                          be lead. Disabled+greyed for
                                          children so the row still
                                          aligns. The Lead-marked guest
                                          drives the `primaryGuestName /
                                          Details` payload. */}
                                      <Form.Check
                                        type="radio"
                                        name="ls-lead-guest"
                                        id={`ls-lead-${rIdx}-${gIdx}`}
                                        checked={isLead}
                                        disabled={g.isChild}
                                        onChange={() =>
                                          handleLeadSelect(rIdx, gIdx)
                                        }
                                        title={
                                          g.isChild
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
                        ))}
                      </Accordion>
                    </Card.Body>
                  </Card>

                  {/* Lead Passenger / Primary Guest Details card
                      hidden by request — the Guest Details grid
                      above is the single source of customer details.
                      The submit payload still carries
                      `primaryGuestName / Email / Phone` and
                      `primaryGuestDetails` (derived from Room 1 /
                      Guest 1 in confirmBooking) so the
                      /api/longStayBooking/create contract stays
                      intact. Email / phone / passport / nationality
                      aren't collected on the form any more and ride
                      along as empty strings. */}

                  {/* "Stay & Room Details" card removed — every field it
                      showed (hotel, contract, billing, room category, meal
                      plan, occupancy, check-in/out, refund policy) is already
                      surfaced in the right-hand Booking Summary + Price cards. */}

                  {/* Tourism Dirhams (AED) input hidden per request. The
                      `tourismDirham` state stays at its default ("") so the
                      create payload sends null and downstream totals are
                      unaffected. */}

                  {/* Special Requests — same checklist as HotelBookingPage.
                      Selected labels ride along on the create payload and are
                      persisted / shown on the detail view + voucher. */}
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
                        <Form.Group className="mb-0">
                          <div className="special-request-grid">
                            {SPECIAL_REQUEST_OPTIONS.map((request) => (
                              <Form.Check
                                key={request}
                                type="checkbox"
                                id={`ls-special-request-${request.replace(/[^a-zA-Z0-9]/g, "-")}`}
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

                  {/* Payment Mode — mirrors HotelBookingPage's three-scenario UI:
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
                            {draft.hotelName}
                          </div>
                          {draft.address && (
                            <div className="text-muted small mb-2">
                              {draft.address}
                            </div>
                          )}
                          <div className="d-flex flex-wrap align-items-center gap-2">
                            <span className="badge bg-secondary">
                              {draft.contract.additionalCostType === "WEEKLY"
                                ? "Weekly billing"
                                : "Day-wise billing"}
                            </span>
                            {draft.room.refundable ? (
                              <Badge bg="success">Flexible</Badge>
                            ) : (
                              <Badge bg="danger">Non-Refundable</Badge>
                            )}
                          </div>
                        </div>

                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">
                            <FaCalendarAlt className="me-2 text-primary" />
                            Check-in
                          </div>
                          <div className="hbp-summary-value">
                            {formatDateTime(draft.checkIn)}
                          </div>
                        </div>
                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">
                            <FaCalendarAlt className="me-2 text-primary" />
                            Check-out
                          </div>
                          <div className="hbp-summary-value">
                            {formatDateTime(draft.checkOut)}
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
                          <div className="hbp-summary-value">{mealPlanLabel}</div>
                        </div>
                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">
                            <FaUtensils className="me-2 text-primary" />
                            Room Status
                          </div>
                          {/* Availability of the selected room — same field
                              isOnRequestRate and the create payload's
                              roomStatus derive from (mirrors HotelBookingPage). */}
                          <div className="hbp-summary-value">
                            {draft?.room?.roomStatus || "Available"}
                          </div>
                        </div>
                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">Nights</div>
                          <div className="hbp-summary-value">
                            {quote?.totalNights ?? "—"}
                          </div>
                        </div>
                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">Contract</div>
                          <div className="hbp-summary-value">
                            {draft.contract.rateCode}
                          </div>
                        </div>
                      </Card.Body>
                    </Card>

                    <Card className="shadow-sm rounded-3 border-0 hbp-price-card">
                      <Card.Header className="bg-light py-2">
                        <h6 className="mb-0 fw-bold">Price Details</h6>
                      </Card.Header>
                      <Card.Body className="p-3">
                        {quoteError ? (
                          <div
                            className="text-danger small p-2 rounded"
                            style={{ background: "#fee2e2" }}
                          >
                            {quoteError}
                          </div>
                        ) : !quote ? (
                          <div className="text-center py-4">
                            <Spinner animation="border" size="sm" />
                            <div className="small text-muted mt-2">
                              Computing quote…
                            </div>
                          </div>
                        ) : (
                          <>
                            {quote.contractsUsed &&
                              quote.contractsUsed.length > 1 && (
                                <div
                                  className="small mb-2 p-2 rounded"
                                  style={{ background: "#eff6ff", color: "#1e40af" }}
                                >
                                  Booking spans{" "}
                                  <strong>{quote.contractsUsed.length}</strong>{" "}
                                  contract validities — billed pro-rata.
                                </div>
                              )}

                            {quote.remainder && quote.remainder.days > 0 && (
                              <div
                                className="mb-2 p-2 rounded"
                                style={{ background: "#fffbeb" }}
                              >
                                <div className="d-flex justify-content-between">
                                  <div>
                                    <div
                                      className="fw-semibold small"
                                      style={{ color: "#92400e" }}
                                    >
                                      Remainder · {quote.remainder.days} day
                                      {quote.remainder.days > 1 ? "s" : ""}
                                    </div>
                                    <div
                                      className="text-muted"
                                      style={{ fontSize: 11 }}
                                    >
                                      {quote.remainder.costType === "WEEKLY"
                                        ? "Weekly"
                                        : "Day-wise"}
                                    </div>
                                  </div>
                                  <span
                                    className="fw-bold small"
                                    style={{ color: "#92400e" }}
                                  >
                                    {formatPrice(quote.remainder.amount)}
                                  </span>
                                </div>
                              </div>
                            )}

                            <hr className="my-2" />
                            {markupAmount > 0 && (
                              <div className="hbp-summary-row">
                                <div className="hbp-summary-label">
                                  Pre-Markup Rate
                                </div>
                                <div className="hbp-summary-value">
                                  {formatPrice(preMarkupRate)}
                                </div>
                              </div>
                            )}
                            {markupAmount > 0 && (
                              <div className="hbp-summary-row">
                                <div className="hbp-summary-label">
                                  Agent Markup
                                  {markupType && markupValue != null && (
                                    <span
                                      className="text-muted ms-1"
                                      style={{ fontSize: 11 }}
                                    >
                                      (
                                      {markupType === "PERCENT"
                                        ? `${markupValue}%`
                                        : `AED ${markupValue}`}
                                      )
                                    </span>
                                  )}
                                </div>
                                <div className="hbp-summary-value">
                                  {formatPrice(markupAmount)}
                                </div>
                              </div>
                            )}
                            <div className="hbp-summary-row">
                              <div className="hbp-summary-label">Selling Price</div>
                              <div className="hbp-summary-value">
                                {formatPrice(sellingPrice)}
                              </div>
                            </div>
                            {/* Tourism Dirhams summary row hidden per request. */}
                            <hr className="my-2" />
                            <div className="hbp-summary-row fw-bold">
                              <div className="hbp-summary-label text-danger">
                                New Total
                              </div>
                              <div className="hbp-summary-value text-danger">
                                {formatPrice(newTotal)}
                              </div>
                            </div>
                          </>
                        )}
                      </Card.Body>
                    </Card>

                    {/* Quotation — under the Price Details it quotes, above
                        the booking decision and Confirm Booking; available
                        once the long-stay quote has been computed. */}
                    <QuotationPdfCard
                      buildPayload={buildLongStayQuotationPayload}
                      disabled={!quote || !!quoteError}
                    />

                    {/* Voucher-choice card — mirrors HotelBookingPage.
                        Shown for every Flexible/Refundable room whose
                        check-in date hasn't passed. Non-refundable /
                        past-deadline / On-Request flows skip it and resolve
                        to RECONFIRMED automatically. */}
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
                                id="ls-book-voucher"
                                name="lsBookingConfirmation"
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
                                id="ls-book-now-voucher-later"
                                name="lsBookingConfirmation"
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
                        onClick={handleBook}
                        disabled={
                          !quote ||
                          !!quoteError ||
                          submitting ||
                          noPaymentPathAvailable
                        }
                        title={
                          noPaymentPathAvailable
                            ? "Booking cannot be completed — no payment method available for this agent."
                            : undefined
                        }
                        className="flex-grow-1"
                      >
                        Confirm Booking
                      </Button>
                    </div>
                  </div>
                </Col>
              </Row>

              {/* ── Policies & Terms Modal (pre-confirmation gate) ─────────────── */}
              {/*
                Uses the same .policy-modal-* CSS classes as
                /booking/hotel so the long-stay modal is visually identical
                to the hotel one (plain white header, uppercase section
                titles, dividers, neutral footer with checkbox + Cancel +
                Proceed). Styling lives in styles/HotelBookingPage.css.
              */}
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
                  {/* Cancellation Policy */}
                  <section className="policy-section">
                    <h6 className="policy-section-title">Cancellation Policy</h6>
                    {(draft?.contract?.cancellationPolicy || []).length > 0 ? (
                      draft.contract.cancellationPolicy.map((p, i) => (
                        <div key={i} className="policy-item">
                          <div className="policy-text">
                            {formatCancellationPolicyLine(p)}
                          </div>
                        </div>
                      ))
                    ) : !draft?.contract?.cancellationPolicyNotes ? (
                      <div className="policy-empty">
                        No cancellation policy configured.
                      </div>
                    ) : null}
                    {draft?.contract?.cancellationPolicyNotes && (
                      <div className="policy-item">
                        <div className="policy-text">
                          {draft.contract.cancellationPolicyNotes}
                        </div>
                      </div>
                    )}
                  </section>

                  {/* Terms & Conditions */}
                  <section className="policy-section policy-section-last">
                    <h6 className="policy-section-title">Terms &amp; Conditions</h6>
                    {(draft?.contract?.termsAndConditions || []).length > 0 ? (
                      draft.contract.termsAndConditions.map((t, i) => (
                        <div key={i} className="policy-item">
                          <div className="policy-text">{t}</div>
                        </div>
                      ))
                    ) : (
                      <div className="policy-empty">
                        No terms &amp; conditions configured.
                      </div>
                    )}
                  </section>
                </Modal.Body>
                <Modal.Footer className="policy-modal-footer">
                  <Form.Check
                    type="checkbox"
                    id="ls-policy-accept"
                    className="me-auto policy-accept-check"
                    label={
                      <span>
                        I have read and accept the{" "}
                        <span className="text-primary">policies</span> and{" "}
                        <span className="text-primary">terms &amp; conditions</span>
                      </span>
                    }
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
                    disabled={!policyAccepted}
                    onClick={() => {
                      // Accept → close this modal, open the summary modal.
                      // Mirrors HotelBookingPage policy → summary chain.
                      setShowPolicyModal(false);
                      setShowConfirmModal(true);
                    }}
                  >
                    Proceed
                  </Button>
                </Modal.Footer>
              </Modal>

              {/* ── Confirmation Modal ─────────────────────────────────────────── */}
              <Modal
                show={showConfirmModal}
                onHide={() => !submitting && setShowConfirmModal(false)}
                centered
                backdrop="static"
                size="lg"
                dialogClassName="confirm-booking-modal"
              >
                {/*
                  Unified confirmation modal — structure copied from
                  HotelBookingPage so the operator sees the same shape across
                  the hotel and long-stay flows (per product spec / screenshot
                  reference). Sections (top → bottom):
                    1. Hotel name + address
                    2. Check-In / Check-Out / Rooms / Nights grid
                    3. Cancellation Policy bullet list
                    4. Selling Price card
                    5. Total Price green gradient band ("for N room(s)")
                    6. Rate Split card (Selling / Tourism Dirhams / Total in red)
                    7. Green tick — policies accepted
                    8. Grey footer note
                */}
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
                  {draft && (
                    <div className="border rounded-3 bg-white shadow-sm p-2">
                      <div className="mb-2">
                        <p className="mb-0 d-flex align-items-center flex-wrap">
                          <span className="fw-bold text-primary fs-5">
                            {draft.hotelName}
                          </span>
                          {draft.address && (
                            <span className="text-muted small ms-1">
                              , {draft.address}
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
                            <span className="text-dark">
                              {formatDateTime(draft.checkIn)}
                            </span>
                          </p>
                        </Col>
                        <Col xs={6}>
                          <p className="mb-1">
                            <strong>Check-Out:</strong>
                            <br />
                            <span className="text-dark">
                              {formatDateTime(draft.checkOut)}
                            </span>
                          </p>
                        </Col>
                        <Col xs={6}>
                          <p className="mb-1">
                            <strong>Rooms:</strong> {rooms.length}
                          </p>
                        </Col>
                        <Col xs={6}>
                          <p className="mb-1">
                            <strong>Nights:</strong> {quote?.totalNights ?? "—"}
                          </p>
                        </Col>

                        {/* Room category + room type — same "what am I
                            booking" info the hotel confirm modal shows. Uses
                            roomBreakdown for multi-room, else the single room. */}
                        {(() => {
                          const slots =
                            Array.isArray(draft.roomBreakdown) &&
                            draft.roomBreakdown.length > 0
                              ? draft.roomBreakdown.map((s) => s.room)
                              : [draft.room];
                          return slots.map((s, i) => (
                            <React.Fragment key={i}>
                              <Col xs={6}>
                                <p className="mb-1">
                                  <strong>Room Category:</strong>
                                  <br />
                                  <span className="text-dark">
                                    {slots.length > 1 ? `Room ${i + 1} - ` : ""}
                                    {s?.roomCategoryName || "—"}
                                    {s?.roomTypeName ? ` (${s.roomTypeName})` : ""}
                                  </span>
                                </p>
                              </Col>
                              <Col xs={6}>
                                <p className="mb-1">
                                  <strong>Occupancy:</strong>
                                  <br />
                                  <span className="text-dark">
                                    {s?.occupancyTypeName || "—"}
                                  </span>
                                </p>
                              </Col>
                            </React.Fragment>
                          ));
                        })()}

                        {/* Cancellation block — mirrors HotelBookingPage's
                            confirm modal. Non-refundable → compact label +
                            badge + policy text. Refundable + deadline → the
                            free-cancellation deadline with a green
                            "Refundable until this date" badge, or a red
                            "Passed" badge if already crossed. Paired with
                            a Payment Mode badge column on tablet+. */}
                        {!isRefundableRate ? (
                          <Col xs={12} md={6}>
                            <p className="mb-1 mt-2">
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
                              <p className="mb-1 mt-2">
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

                        {/* Payment Mode badge — beside the cancellation
                            block. Same layout / labelling as HotelBookingPage. */}
                        {(!isRefundableRate || cancellationDeadline) && (
                          <Col
                            xs={12}
                            md={6}
                            className="d-flex align-items-start justify-content-md-end"
                          >
                            <p className="mb-1 mt-2">
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
                          <div className="p-2 rounded bg-white border mt-2 d-flex justify-content-between align-items-center">
                            <h6 className="mb-0 text-muted">Selling Price</h6>
                            <h5 className="mb-0 text-success fw-bold">
                              {formatPrice(sellingPrice)}
                            </h5>
                          </div>

                          <div className="p-2 rounded bg-white border mt-2 d-flex justify-content-between align-items-center">
                            <h6 className="mb-0 fw-bold">Payable</h6>
                            <h5 className="mb-0 fw-bold">
                              {formatPrice(newTotal)}{" "}
                              <span className="text-muted small fw-normal">
                                for {rooms.length}{" "}
                                {rooms.length > 1 ? "rooms" : "room"}
                              </span>
                            </h5>
                          </div>
                        </Col>
                      </Row>

                      <div className="mt-2 p-2 bg-white border rounded">
                        <h6 className="fw-bold mb-1">Rate Split</h6>
                        <div className="d-flex justify-content-between">
                          <span>Selling Price</span>
                          <span>{formatPrice(sellingPrice)}</span>
                        </div>
                        <hr className="my-1" />
                        <div className="d-flex justify-content-between fw-bold">
                          <span>Total (Selling)</span>
                          <span>{formatPrice(newTotal)}</span>
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
                  )}
                </Modal.Body>
                <Modal.Footer className="bg-light border-0 d-flex justify-content-between">
                  <Button
                    variant="outline-secondary"
                    onClick={() => setShowConfirmModal(false)}
                    disabled={submitting}
                  >
                    <i className="bi bi-x-circle me-1"></i> Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={confirmBooking}
                    disabled={submitting}
                    className="px-4 fw-semibold"
                  >
                    {submitting ? (
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
                  AgentView "Allow Card payment mode" toggle is off. No
                  payment path exists, so the booking is turned away. Same
                  shape as HotelBookingPage / StudentBookingPage. */}
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
                          htmlFor={`longstay-gw-${g.id}`}
                          className={`pg-option${
                            isSelected ? " pg-option-selected" : ""
                          }`}
                        >
                          <input
                            type="radio"
                            name="longstay-payment-gateway"
                            id={`longstay-gw-${g.id}`}
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
                      // Distinct from the dummy /payment/:gateway path
                      // below — the browser fully navigates away to CC
                      // Avenue's hosted page and back, so the resume
                      // signal has to travel as a URL query param (React
                      // Router state doesn't survive a real cross-origin
                      // redirect). See the ccavenueOrderId resume effect
                      // above. flowType tells the backend to create a
                      // LONG STAY booking rather than a regular hotel one
                      // when it finalizes.
                      if (selectedGateway === "ccavenue") {
                        navigate("/payment/ccavenue-redirect", {
                          state: {
                            flowType: "LONGSTAY_CREATE",
                            bookingPayload: {
                              ...pendingPayload,
                              paymentMode: "ONLINE",
                            },
                            billingName: pendingPayload?.primaryGuestName || "",
                            amountLabel: formatPrice(insufficientAmount),
                            returnTo: location.pathname,
                          },
                        });
                        return;
                      }

                      // Dummy /payment/:gateway flow (test/local only).
                      // Persist the payload the resume flow will replay.
                      // React state is lost when the user navigates away
                      // to /payment and back, so the resume effect above
                      // rebuilds the create call purely from sessionStorage.
                      // paymentMode flipped to "ONLINE" so the Booking List
                      // labels the row correctly and the backend skips its
                      // credit debit.
                      try {
                        sessionStorage.setItem(
                          "longStayPendingCreatePayload",
                          JSON.stringify({
                            ...pendingPayload,
                            paymentMode: "ONLINE",
                          }),
                        );
                      } catch (e) {
                        console.error(
                          "Could not persist pending long-stay create payload",
                          e,
                        );
                      }
                      navigate(`/payment/${selectedGateway}`, {
                        state: {
                          amountLabel: formatPrice(insufficientAmount),
                          gatewayName: gw ? gw.name : selectedGateway,
                          // After payment, land back on this booking page
                          // with resumeCreate=true — the effect above fires
                          // the create call using the persisted payload,
                          // then navigates to the long-stay booking list on
                          // success.
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
    </div>
  );
}
