/**
 * LongStayBookingDetailView.jsx
 *
 * Full-page detail view for a single Long Stay booking. Visual + behavioural
 * parity with BookingDetailedView (hotel) so an operator gets the same
 * action set / layout / modals on either booking type.
 *
 * Backend endpoints (long-stay scoped) — unchanged:
 *   - Detail               : GET    /api/longStayBooking/{id}
 *   - PDF (proforma/final) : GET    /api/longStayBooking/{id}/pdf?type=...
 *   - Cancel               : POST   /api/longStayBooking/{id}/cancel
 *   - Reconfirm / Confirmation No.
 *                          : PATCH  /api/longStayBooking/{id}/confirmation-status
 *   - Agent Reference      : GET/POST /api/longStayBooking/{id}/agent-reference
 *   - Remark               : POST   /api/longStayBooking/{id}/remark
 *   - Resend mail          : POST   /api/longStayBooking/{id}/resend-mail
 *   - Notes                : GET/POST /api/longStayBooking/{id}/notes
 *   - Amendment links      : GET    /api/booking-amendment-link/parent/{code}
 *
 * Long-stay has no "On Request" flow, so the Reconfirm modal never shows
 * Reject (Reject is hotel-side On-Request-Pending only).
 */
import React, { useEffect, useState, useCallback } from "react";
import {
  Container,
  Row,
  Col,
  Table,
  Spinner,
  Modal,
  Button,
  Form,
} from "react-bootstrap";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { FaExclamationCircle } from "react-icons/fa";
import {
  FaHistory, FaMapMarkerAlt, FaNetworkWired, FaCalendarAlt, FaClock,
  FaUserAlt, FaPlusCircle, FaCheckCircle, FaSyncAlt, FaTimesCircle,
} from "react-icons/fa";
import axiosInstance from "../../components/AxiosInstance";
import { formatDateTime } from "../../utils/dateUtils";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import { toast } from "react-hot-toast";

// Reverse-geocode browser coordinates to a readable address for the
// Booking History audit trail. Tries OpenStreetMap Nominatim first
// (street-level detail), then BigDataCloud (locality-level, keyless) —
// both free, CORS-enabled endpoints. Returns null when neither responds
// so the caller keeps its IP-derived fallback. Mirrors the hotel
// BookingDetailedView + the long-stay booking page.
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

// ── Visual tokens copied from the Hotel Booking detail view ────────
// Dummy online-payment gateways — mirrors HotelBookingPage /
// BookingDetailedView so the operator gets the same payment picker
// whether the deduction is settled at create or at reconfirm time.
const PAYMENT_GATEWAYS = [
  { id: "razorpay", name: "Razorpay", desc: "Cards, UPI, Net Banking" },
  { id: "stripe", name: "Stripe", desc: "International cards" },
  { id: "payu", name: "PayU", desc: "Cards & wallets" },
];

const BUTTON_STYLE = {
  backgroundColor: "#c0392b",
  color: "#fff",
  border: "none",
  borderRadius: "3px",
  padding: "6px 14px",
  fontSize: "0.78rem",
  fontWeight: "600",
  cursor: "pointer",
  letterSpacing: "0.4px",
  whiteSpace: "nowrap",
};

const BTN_TEAL = { ...BUTTON_STYLE, backgroundColor: "#0d9488" }; // Reconfirm
const BTN_DANGER = { ...BUTTON_STYLE, backgroundColor: "#dc2626" }; // Cancel
const BTN_PRIMARY = { ...BUTTON_STYLE, backgroundColor: "#2563eb" }; // Add New Item
const BTN_SKY = { ...BUTTON_STYLE, backgroundColor: "#3ba2e8" }; // Add Agent Reference
const BTN_INDIGO = { ...BUTTON_STYLE, backgroundColor: "#6366f1" }; // Confirmation No.
const BTN_INFO = { ...BUTTON_STYLE, backgroundColor: "#0891b2" }; // Voucher / Invoice
const BTN_ORANGE = { ...BUTTON_STYLE, backgroundColor: "#f0922b" }; // Resend Mail
const BTN_ACCENT = { ...BUTTON_STYLE, backgroundColor: "#7c3aed" }; // Booking Remark
const BTN_NEUTRAL = { ...BUTTON_STYLE, backgroundColor: "#64748b" }; // View / Back / Notes
const BTN_HISTORY = { ...BUTTON_STYLE, backgroundColor: "#334155" }; // Booking History

// Per-action badge styling for the Booking History modal — colour + icon
// keyed by the exact label pushed onto `bookingHistory`. Unrecognised
// actions (shouldn't happen, but keeps the table from breaking) fall back
// to a neutral slate badge. Mirrors the other dedicated-flow detail views.
const HISTORY_ACTION_META = {
  "Booking Created": { bg: "#e6f4ea", fg: "#1e7e34", icon: FaPlusCircle },
  "Booking Confirmed": { bg: "#e7f1ff", fg: "#1d4ed8", icon: FaCheckCircle },
  "Booking Reconfirmed": { bg: "#e0f2f1", fg: "#0d9488", icon: FaSyncAlt },
  "Booking Cancelled": { bg: "#fdecea", fg: "#c0392b", icon: FaTimesCircle },
};
const HISTORY_ACTION_FALLBACK = { bg: "#f1f5f9", fg: "#475569", icon: FaHistory };

// Same booking-type catalogue as the hotel view's ADD NEW ITEM modal so an
// operator can attach cross-type sub-bookings under a long-stay parent too.
// Each child is created via its OWN existing create flow with
// ?parentBookingCode set, then surfaced via /api/booking-amendment-link.
const ADD_NEW_ITEM_TYPES = [
  { key: "HOTEL", label: "Hotel Booking", route: "/new-booking/hotel" },
  { key: "HOTEL_24HR", label: "24 Hour Check-In", route: "/new-booking/hotel-24hr" },
  { key: "LONG_STAY", label: "Long Stay Booking", route: "/new-booking/long-stay" },
  { key: "DAY_STAY", label: "Day Stay Check-In", route: "/new-booking/day-stay" },
  { key: "GOV_EMPLOYEE", label: "Government Employee", route: "/new-booking/gov-employee" },
  { key: "STUDENT", label: "Student Booking", route: "/new-booking/student" },
  { key: "SENIOR_CITIZEN", label: "Senior Citizen Booking", route: "/new-booking/senior-citizen" },
];

const SECTION_HEADER = {
  backgroundColor: "#f0f0f0",
  padding: "7px 12px",
  fontWeight: "600",
  fontSize: "0.9rem",
  borderBottom: "1px solid #ddd",
  display: "flex",
  alignItems: "center",
  gap: "6px",
};

const INFO_LABEL = {
  fontWeight: "600",
  color: "#555",
  fontSize: "0.82rem",
  minWidth: "160px",
  display: "inline-block",
};

const INFO_VALUE = {
  color: "#222",
  fontSize: "0.82rem",
};

const card = {
  border: "1px solid #ddd",
  borderRadius: "4px",
  marginBottom: "14px",
  overflow: "hidden",
  backgroundColor: "#fff",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
};

// Per-part coloured status pill — copied from the hotel view.
const StatusBadge = ({ status }) => {
  const colorFor = (part) => {
    const p = (part || "").trim().toUpperCase();
    if (p.startsWith("CONFIRMED") || p.startsWith("RECONFIRMED")) return "#16a34a";
    if (p.startsWith("CANCELLED")) return "#dc2626";
    if (p.startsWith("REJECTED")) return "#dc2626";
    if (p === "ON REQUEST" || p.startsWith("ONREQUEST")) return "#e67e22";
    return "#888";
  };
  const parts = String(status || "-").split("/");
  return (
    <span style={{ fontWeight: "700", fontSize: "0.85rem" }}>
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ color: "#888" }}>/</span>}
          <span style={{ color: colorFor(part) }}>{part}</span>
        </React.Fragment>
      ))}
    </span>
  );
};

function InfoRow({ label, value }) {
  return (
    <div
      style={{ marginBottom: "6px", display: "flex", alignItems: "flex-start" }}
    >
      <span style={INFO_LABEL}>{label}</span>
      <span style={{ ...INFO_VALUE, marginLeft: "8px" }}>
        {value !== undefined && value !== null && value !== "" ? value : "-"}
      </span>
    </div>
  );
}

// Date/time helpers used by the History modal columns.
const parseLocal = (str) => {
  if (!str) return null;
  const normalized = String(str).includes("T") ? str : `${str}T00:00:00`;
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
};
const formatDateOnly = (dateStr) => {
  const d = parseLocal(dateStr);
  if (!d) return "-";
  const day = String(d.getDate()).padStart(2, "0");
  return `${day} ${d.toLocaleString("default", { month: "short" })} ${d.getFullYear()}`;
};
const formatTimeOnly = (dateStr) => {
  const d = parseLocal(dateStr);
  if (!d) return "-";
  const hrs = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const sec = String(d.getSeconds()).padStart(2, "0");
  return `${hrs}:${min}:${sec}`;
};

export default function LongStayBookingDetailView() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  // Agent-role gate (UI visibility only).
  const activeRole = String(localStorage.getItem("currentActiveRole") || "")
    .trim()
    .toUpperCase();
  const storedRoles = String(
    localStorage.getItem("userRole") || "",
  ).toUpperCase();
  const isAgentRole = activeRole
    ? activeRole === "AGENT"
    : storedRoles.includes("AGENT") && !storedRoles.includes("ADMIN");
  const isAdmin = activeRole === "ADMIN";
  const isSuperAdmin = activeRole === "SUPER_ADMIN";
  // Confirming an On-Request booking (step 1 of the two-step flow — moves
  // the row from tentative to "On Request/Confirmed") is a supplier-facing
  // action agents must not perform on their own. Admin / super-admin keep
  // full control. Reconfirming a NON-On-Request booking (or step 2 of the
  // On Request flow after admin already confirmed step 1) is unaffected
  // — agents still see the RECONFIRM button. Mirrors the identical gate
  // on BookingDetailedView.
  const canConfirmOnRequest = isAdmin || isSuperAdmin;
  const location = useLocation();
  const rowStub = location.state?.booking || null;
  const bookingId = rowStub?.longStayBookingId || routeId;

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(true);

  // Operator location snapshot for the Booking History audit trail. Resolved
  // once on mount and sent on the confirmation-status PATCH / cancel POST so
  // the BE can stamp confirmed_location / reconfirmed_location /
  // cancelled_location the same way the Create flow stamps booking_location.
  // The IP is NOT resolved here — browsers only see the shared public/NAT IP;
  // LongStayBookingController fills it in from the HTTP request itself. Same
  // two-step resolution as LongStayBookingPage.jsx: coarse IP-derived city
  // first, precise geolocation second (only if it lands and permission is
  // granted).
  const [operatorLocation, setOperatorLocation] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch("https://ipapi.co/json/")
      .then((res) => (res.ok ? res.json() : null))
      .then((info) => {
        if (cancelled || !info) return;
        setOperatorLocation((prev) =>
          // Never clobber a precise geolocation result that already landed.
          prev ||
          [info.city, info.region, info.country_name].filter(Boolean).join(", ") ||
          null
        );
      })
      .catch(() => {});
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
          const precise = await reverseGeocode(coords.latitude, coords.longitude);
          if (!cancelled && precise) setOperatorLocation(precise);
        },
        () => {}, // denied / unavailable — keep the IP-derived fallback
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
      );
    }
    return () => { cancelled = true; };
  }, []);

  // ── Action-button modal / handler state (ported from BookingDetailedView) ──
  // Cancel
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellingBooking, setCancellingBooking] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");

  // Reconfirm — long stay has no On Request flow, so no Reject branch.
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmingBooking, setConfirmingBooking] = useState(false);

  // ── Online Payment Required (Reconfirm credit pre-check) ──────────
  // Mirrors BookingDetailedView: when the operator reconfirms a
  // deferred-credit (Voucher-Later / On-Request) booking and the agent
  // STILL has no credit, we surface the Online Payment Required modal →
  // gateway picker → dummy payment page, which navigates back here with
  // location.state.resumeReconfirm = true and the reconfirm completes.
  // When the agent's Card payment is disabled too, the dedicated
  // "Booking Cannot Be Completed" modal blocks the action instead.
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [showGatewayModal, setShowGatewayModal] = useState(false);
  const [insufficientAmount, setInsufficientAmount] = useState(0);
  const [selectedGateway, setSelectedGateway] = useState("");
  const [showNoPaymentPathModal, setShowNoPaymentPathModal] = useState(false);

  // Reject (On-Request bookings only)
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectRemarks, setRejectRemarks] = useState("");
  const [rejectingBooking, setRejectingBooking] = useState(false);

  // Agent Reference
  const [showConfirmStatusModal, setShowConfirmStatusModal] = useState(false);
  const [confirmAgentLpo, setConfirmAgentLpo] = useState("");
  const [confirmAgentLpoError, setConfirmAgentLpoError] = useState("");
  const [updatingConfirmationStatus, setUpdatingConfirmationStatus] =
    useState(false);

  // Confirmation Number
  const [showConfirmationNoModal, setShowConfirmationNoModal] = useState(false);
  const [confirmationNoInput, setConfirmationNoInput] = useState("");
  const [confirmationNoError, setConfirmationNoError] = useState("");
  const [savingConfirmationNo, setSavingConfirmationNo] = useState(false);

  // Booking Remark
  const [showRemarkModal, setShowRemarkModal] = useState(false);
  const [remarkInput, setRemarkInput] = useState("");
  const [savingRemark, setSavingRemark] = useState(false);

  // Notes
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [bookingNotes, setBookingNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);

  // Resend Mail to Agent — clicking the button opens a preview modal that
  // shows the Voucher PDF in an iframe and lets the admin confirm / edit
  // the agent's email before the /resend-mail POST fires.
  const [resendingMail, setResendingMail] = useState(false);
  const [showResendMailModal, setShowResendMailModal] = useState(false);
  const [resendMailPdfUrl, setResendMailPdfUrl] = useState("");
  const [resendMailEmail, setResendMailEmail] = useState("");
  const [resendMailEmailError, setResendMailEmailError] = useState("");
  const [resendMailPreparing, setResendMailPreparing] = useState(false);

  // PDF generation feedback + in-page preview (iframe modal).
  const [generatingPdfType, setGeneratingPdfType] = useState(null);
  const [pdfPreview, setPdfPreview] = useState(null);

  // Booking History modal (read-only timeline).
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // ADD NEW ITEM (cross-type amendment) — picker + linked children list.
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [selectedAddItemType, setSelectedAddItemType] = useState(
    ADD_NEW_ITEM_TYPES[0].key,
  );
  const [amendmentLinks, setAmendmentLinks] = useState([]);

  const fetchDetail = async () => {
    if (!bookingId) {
      toast.error("Booking id missing");
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    try {
      const res = await axiosInstance.get(
        `/api/longStayBooking/${bookingId}`
      );
      setDetail(res.data);
    } catch {
      toast.error("Failed to load booking details");
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  // Cross-type amendment children, keyed off this long-stay's bookingCode as
  // the parent. Read-only; failures leave the list empty so nothing else on
  // the page is affected.
  const amendmentParentCode = detail?.bookingCode;
  useEffect(() => {
    let alive = true;
    if (!amendmentParentCode) {
      setAmendmentLinks([]);
      return undefined;
    }
    axiosInstance
      .get(
        `/api/booking-amendment-link/parent/${encodeURIComponent(
          amendmentParentCode,
        )}`,
      )
      .then((res) => {
        if (!alive) return;
        setAmendmentLinks(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => alive && setAmendmentLinks([]));
    return () => { alive = false; };
  }, [amendmentParentCode]);

  // ── Status helpers (mirror BookingDetailedView) ────────────────────
  // confirmationStatus drives the explicit lifecycle ("ReConfirmed" /
  // "Rejected"), but a freshly created long-stay booking leaves it null and
  // only sets bookingStatus = "CONFIRMED". So derive an effective status that
  // falls back to bookingStatus — otherwise the Confirmed state would be
  // treated as "no status" and Agent Reference / Confirmation No. would stay
  // locked even though the booking is already Confirmed.
  const rawConfStatus = String(detail?.confirmationStatus || "").trim();
  const normalizedConf = rawConfStatus.replace(/\s+/g, "").toUpperCase();
  const isCancelled =
    detail?.bookingStatus === "CANCELLED" ||
    detail?.cancelStatus === true ||
    normalizedConf === "CANCELLED";
  const isReconfirmed =
    detail?.reconfirmation === true || normalizedConf === "RECONFIRMED";
  const isRejected = normalizedConf === "REJECTED";

  // Availability origin captured at booking time. On-Request bookings carry a
  // distinct lifecycle: OnRequest → Confirmed → Reconfirmed (or → Rejected).
  const isOnRequestOrigin =
    String(detail?.roomStatus || "").replace(/\s+/g, "").toUpperCase() ===
    "ONREQUEST";
  const isOnRequestConfirmed = detail?.onRequestConfirmed === true;
  // On-Request booking still awaiting the first Confirm action.
  const isOnRequestPending =
    isOnRequestOrigin &&
    !isOnRequestConfirmed &&
    !isReconfirmed &&
    !isRejected &&
    !isCancelled;

  // Compound progression label — mirrors the backend buildProgressionLabel so
  // the live view reads the same as the persisted cancelledFromStatus. Split on
  // "/" by StatusBadge, e.g. "OnRequest/Confirmed/Reconfirmed".
  const buildLiveStatus = () => {
    if (isOnRequestOrigin) {
      if (isRejected) return "OnRequest/Rejected";
      const parts = ["OnRequest"];
      if (isOnRequestConfirmed || isReconfirmed) parts.push("Confirmed");
      if (isReconfirmed) parts.push("Reconfirmed");
      return parts.join("/");
    }
    if (isRejected) return "Rejected";
    // Directly-created Reconfirmed bookings show just "Reconfirmed"; a Confirmed
    // booking later reconfirmed shows the "Confirmed/Reconfirmed" path.
    if (String(detail?.bookingStatus || "").toUpperCase() === "RECONFIRMED")
      return "Reconfirmed";
    return isReconfirmed ? "Confirmed/Reconfirmed" : "Confirmed";
  };

  const showsFinalDocs = isReconfirmed || normalizedConf === "COMPLETED";
  // Confirmed-or-better unlocks Agent Reference / Confirmation No. — but NOT
  // while an On-Request booking is still pending its first Confirm, and never
  // once Rejected.
  const isConfirmedOrLater =
    !isOnRequestPending &&
    !isRejected &&
    (isReconfirmed ||
      isOnRequestConfirmed ||
      (!isOnRequestOrigin &&
        String(detail?.bookingStatus || "").toUpperCase() !== "ONREQUEST") ||
      normalizedConf === "COMPLETED");

  // Pre-cancellation doc / reference gating — read the persisted
  // cancelledFromStatus when present, else the live flags.
  const priorStatus = String(detail?.cancelledFromStatus || "")
    .replace(/\s+/g, "")
    .toUpperCase();
  const cancelledShowsFinalDocs =
    priorStatus.includes("RECONFIRMED") ||
    priorStatus.includes("COMPLETED") ||
    isReconfirmed;
  const cancelledFromConfirmedOrLater =
    priorStatus.includes("CONFIRMED") ||
    priorStatus.includes("RECONFIRMED") ||
    priorStatus.includes("COMPLETED") ||
    isConfirmedOrLater;

  // Mirrors the docs-vs-proforma rule used across the app for the resend-mail
  // preview: a still-tentative long-stay booking (On Request pending / just
  // Confirmed) resends the Proforma Voucher; once ReConfirmed / Completed —
  // or Cancelled — it resends the real Voucher. Kept as derived values so the
  // modal title, loading copy, iframe title, and the /pdf?type= request all
  // stay in sync automatically.
  const resendUsesFinalDoc =
    isCancelled || isReconfirmed || normalizedConf === "COMPLETED";
  const resendDocLabel = resendUsesFinalDoc
    ? "Voucher"
    : "Long Stay Booking Proforma Voucher";
  const resendDocType = resendUsesFinalDoc ? "VOUCHER" : "PROFORMA_VOUCHER";

  // Status label fed to the badge. When cancelled, surface the prior progression
  // so e.g. a confirmed booking shows "Confirmed/Cancelled" and an on-request
  // one shows "OnRequest/Confirmed/Reconfirmed/Cancelled". cancelledFromStatus
  // is persisted by the cancel flow; older rows fall back to the live builder.
  const displayStatus = isCancelled
    ? detail?.cancelledFromStatus
      ? `${detail.cancelledFromStatus}/Cancelled`
      : `${buildLiveStatus()}/Cancelled`
    : buildLiveStatus();

  // Cancel button gate: cancellation isn't allowed once the stay has started.
  const isPastCheckIn = (() => {
    const raw = detail?.checkInDate;
    if (!raw) return false;
    const checkIn = new Date(
      String(raw).includes("T") ? raw : `${raw}T00:00:00`,
    );
    if (isNaN(checkIn.getTime())) return false;
    return new Date().getTime() > checkIn.getTime();
  })();

  // ── Cancel ─────────────────────────────────────────────────────────
  const openCancelModal = () => {
    setCancellationReason("");
    setShowCancelModal(true);
  };

  const cancelBooking = async () => {
    if (!bookingId) return;
    // Cancellation reason is mandatory — same as the hotel / last-minute
    // detail view: the modal marks the field with an asterisk + invalid
    // state and disables "Yes, Cancel" while it is empty. Belt-and-braces
    // guard here so a stray submit can't sneak past.
    const reason = cancellationReason.trim();
    if (!reason) {
      toast.error("Please enter a cancellation reason.");
      return;
    }
    try {
      setCancellingBooking(true);
      // Booking History audit — BE stamps bookingLocation onto
      // cancelled_location. May be null if the operator denied geolocation and
      // the IP-derived fallback also failed; the BE treats null as "no capture"
      // and the "Booking Cancelled" history row renders "-".
      const params = { reason, bookingLocation: operatorLocation };
      await axiosInstance.post(
        `/api/longStayBooking/${bookingId}/cancel`,
        null,
        { params }
      );
      setShowCancelModal(false);
      setCancellationReason("");
      toast.success("Booking cancelled");
      await fetchDetail();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to cancel booking.");
    } finally {
      setCancellingBooking(false);
    }
  };

  // ── Confirm / Reconfirm ─────────────────────────────────────────────
  // One endpoint drives both steps: for an On-Request booking still pending,
  // the backend advances OnRequest → Confirmed; otherwise it Reconfirms.
  // The button that calls this is already role-gated (see
  // canConfirmOnRequest); this second check is defence-in-depth so a
  // future caller / devtools-forged click can't sneak past the same rule.
  // Backend authorisation still owns the real enforcement.
  const openConfirmModal = () => {
    if (isOnRequestPending && !canConfirmOnRequest) {
      toast.error(
        "Only admin or super-admin can confirm an On Request booking.",
      );
      return;
    }
    setShowConfirmModal(true);
  };

  // Actual confirm/reconfirm API call. Split out (mirrors BookingDetailedView)
  // so the same call can be made from (a) the Reconfirm modal's Confirm
  // button when credit is fine, and (b) the post-payment resume effect
  // after the operator pays through the gateway picker. The same PATCH
  // drives BOTH On-Request steps — the BE lands step 1 on
  // "OnRequest/Confirmed" and step 2 (and every other booking) on
  // ReConfirmed, and returns the step-appropriate message.
  const runReconfirm = async () => {
    if (!bookingId) return;
    try {
      setConfirmingBooking(true);
      await axiosInstance.patch(
        `/api/longStayBooking/${bookingId}/confirmation-status`,
        {
          confirmStatus: true,
          // Booking History audit — BE stamps this onto confirmed_location /
          // reconfirmed_location depending on which step this call lands.
          // May be null if the operator denied geolocation and the IP-derived
          // fallback also failed; the history row then shows "-".
          bookingLocation: operatorLocation,
        }
      );
      setShowConfirmModal(false);
      toast.success(
        isOnRequestPending
          ? "Booking confirmed successfully!"
          : "Booking reconfirmed successfully!"
      );
      await fetchDetail();
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Failed to update booking. Please try again."
      );
    } finally {
      setConfirmingBooking(false);
    }
  };

  // Reconfirm modal's Confirm/Reconfirm button handler — same payment-gate
  // pre-check as the hotel detail page (BookingDetailedView.confirmBooking).
  //
  // STEP-1 CONFIRM of an On Request booking is NEVER gated — it only moves
  // the booking to "OnRequest/Confirmed" (no credit settles yet), so it goes
  // straight to the BE step-1 branch. Long-stay On Request bookings carry
  // creditDeferred=TRUE, so without this explicit guard the pre-check below
  // would fire the payment gate at CONFIRM instead of at RECONFIRM.
  //
  // The pre-check then runs ONLY for:
  //   • Deferred-credit bookings (creditDeferred === true — On Request /
  //     Voucher-Later creates whose debit the BE deferred to RECONFIRM).
  //   • On Request bookings at the RECONFIRM step (isOnRequestPending false).
  // Every other booking (credit already settled at create) calls
  // runReconfirm directly.
  //
  // Insufficient credit → close the Reconfirm modal, then:
  //   • Card disabled  → "Booking Cannot Be Completed" (blocked).
  //   • Card enabled   → "Online Payment Required" → gateway picker →
  //     back here with state.resumeReconfirm=true → runReconfirm.
  // Missing agentId/amount or a credit-check API error fail OPEN to the
  // legacy direct reconfirm so the operator is never trapped.
  const confirmBooking = async () => {
    if (isOnRequestPending) {
      await runReconfirm();
      return;
    }
    const isDeferredCreditBooking = detail?.creditDeferred === true;
    const isOnRequestReconfirmStep = isOnRequestOrigin && !isOnRequestPending;
    if (!isDeferredCreditBooking && !isOnRequestReconfirmStep) {
      await runReconfirm();
      return;
    }
    const agentIdNum = detail?.agentId
      ? Number(String(detail.agentId).trim())
      : null;
    const amount = Number(detail?.totalAmount) || 0;
    if (!agentIdNum || amount <= 0) {
      await runReconfirm();
      return;
    }
    try {
      setConfirmingBooking(true);
      const [credit, agentResp] = await Promise.all([
        axiosInstance.get(
          `/api/agent-credit-limit/check-sufficient-credit?agentId=${agentIdNum}&requiredAmount=${amount}`,
        ),
        axiosInstance
          .get(`/api/agent/${agentIdNum}`)
          .catch(() => ({ data: { cardPaymentEnabled: false } })),
      ]);
      const cardEnabled = !!agentResp?.data?.cardPaymentEnabled;
      if (credit.data === false) {
        setInsufficientAmount(amount);
        setShowConfirmModal(false);
        if (!cardEnabled) {
          setShowNoPaymentPathModal(true);
          return;
        }
        setShowInsufficientModal(true);
        return;
      }
      await runReconfirm();
    } catch (e) {
      console.error("Error checking credit before reconfirm:", e);
      await runReconfirm();
    } finally {
      setConfirmingBooking(false);
    }
  };

  // Post-payment resume — the gateway page navigates back here with
  // state.resumeReconfirm = true once the operator finishes the dummy
  // card-entry flow. Strip the flag from history (so a reload doesn't
  // re-trigger), then fire runReconfirm to complete the reconfirmation.
  useEffect(() => {
    if (!location.state?.resumeReconfirm) return;
    if (!detail) return;
    navigate(location.pathname, { replace: true, state: {} });
    runReconfirm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.resumeReconfirm, detail]);

  // ── Reject (On-Request bookings only) ───────────────────────────────
  const openRejectModal = () => {
    setRejectRemarks("");
    setShowConfirmModal(false);
    setShowRejectModal(true);
  };

  const rejectBooking = async () => {
    if (!bookingId) return;
    try {
      setRejectingBooking(true);
      await axiosInstance.patch(
        `/api/longStayBooking/${bookingId}/confirmation-status`,
        {
          action: "REJECT",
          rejectedBy: localStorage.getItem("UserName") || "",
          rejectionRemarks: rejectRemarks.trim() || null,
        }
      );
      setShowRejectModal(false);
      setRejectRemarks("");
      toast.success("Booking rejected");
      await fetchDetail();
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to reject booking.");
    } finally {
      setRejectingBooking(false);
    }
  };

  // ── Agent Reference (prefill via GET, save via POST) ───────────────
  const openConfirmStatusModal = async () => {
    setConfirmAgentLpo("");
    setConfirmAgentLpoError("");
    setShowConfirmStatusModal(true);
    try {
      const res = await axiosInstance.get(
        `/api/longStayBooking/${bookingId}/agent-reference`
      );
      const saved = res?.data?.agentLpo;
      if (saved) setConfirmAgentLpo(saved);
    } catch (err) {
      console.warn("Could not prefill agent reference:", err?.message);
    }
  };

  const updateConfirmationStatus = async () => {
    const lpoTrimmed = (confirmAgentLpo || "").trim();
    if (!lpoTrimmed) {
      setConfirmAgentLpoError("Agent Reference is required");
      return;
    }
    setConfirmAgentLpoError("");
    try {
      setUpdatingConfirmationStatus(true);
      await axiosInstance.post(
        `/api/longStayBooking/${bookingId}/agent-reference`,
        { agentLpo: lpoTrimmed }
      );
      setShowConfirmStatusModal(false);
      toast.success("Agent Reference updated successfully");
      await fetchDetail();
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Failed to update Agent Reference. Please try again."
      );
    } finally {
      setUpdatingConfirmationStatus(false);
    }
  };

  // ── Confirmation Number ────────────────────────────────────────────
  const openConfirmationNoModal = async () => {
    setConfirmationNoInput("");
    setConfirmationNoError("");
    setShowConfirmationNoModal(true);
    try {
      const res = await axiosInstance.get(
        `/api/longStayBooking/${bookingId}/agent-reference`
      );
      const saved = res?.data?.confirmationNumber;
      if (saved) setConfirmationNoInput(saved);
    } catch (err) {
      console.warn("Could not prefill confirmation number:", err?.message);
    }
  };

  const saveConfirmationNo = async () => {
    const value = (confirmationNoInput || "").trim();
    if (!value) {
      setConfirmationNoError("Confirmation Number is required");
      return;
    }
    setConfirmationNoError("");
    try {
      setSavingConfirmationNo(true);
      await axiosInstance.patch(
        `/api/longStayBooking/${bookingId}/confirmation-status`,
        { action: "CONFIRMATION_NO", confirmationNumber: value }
      );
      setShowConfirmationNoModal(false);
      toast.success("Confirmation number saved successfully!");
      await fetchDetail();
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Failed to save confirmation number. Please try again."
      );
    } finally {
      setSavingConfirmationNo(false);
    }
  };

  // ── Notes ─────────────────────────────────────────────────────────
  const fetchNotes = useCallback(() => {
    if (!bookingId) return undefined;
    setNotesLoading(true);
    return axiosInstance
      .get(`/api/longStayBooking/${bookingId}/notes`)
      .then((res) => {
        setBookingNotes(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => setBookingNotes([]))
      .finally(() => setNotesLoading(false));
  }, [bookingId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const openNotesModal = () => {
    setNoteInput("");
    setShowNotesModal(true);
  };

  const saveNote = async () => {
    const text = (noteInput || "").trim();
    if (!text) {
      toast.error("Note cannot be empty");
      return;
    }
    try {
      setSavingNote(true);
      const createdBy =
        localStorage.getItem("UserName") ||
        sessionStorage.getItem("UserName") ||
        "unknown";
      const res = await axiosInstance.post(
        `/api/longStayBooking/${bookingId}/notes`,
        { note: text, createdBy },
      );
      if (res.data && res.data.success !== false) {
        toast.success("Note saved");
        setShowNotesModal(false);
        setNoteInput("");
        await fetchNotes();
      } else {
        toast.error(res.data?.message || "Failed to save note");
      }
    } catch (e) {
      toast.error(e.response?.data?.message || "Failed to save note");
    } finally {
      setSavingNote(false);
    }
  };

  // ── Booking Remark ─────────────────────────────────────────────────
  const openRemarkModal = () => {
    setRemarkInput(detail?.remarks || "");
    setShowRemarkModal(true);
  };

  const saveRemark = async () => {
    const text = (remarkInput || "").trim();
    if (!text) {
      toast.error("Remark cannot be empty");
      return;
    }
    try {
      setSavingRemark(true);
      await axiosInstance.post(`/api/longStayBooking/${bookingId}/remark`, {
        remarks: text,
      });
      setShowRemarkModal(false);
      toast.success("Remark saved successfully");
      await fetchDetail();
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Failed to save remark. Please try again."
      );
    } finally {
      setSavingRemark(false);
    }
  };

  // ── Resend Mail to Agent ───────────────────────────────────────────
  /**
   * Open the RESEND MAIL preview modal. Two parallel calls hydrate the
   * modal so the admin sees exactly what's about to go out:
   *   1) /pdf?type=VOUCHER — the same PDF the mail will attach,
   *      rendered inside an <iframe>.
   *   2) /api/agent/{agentId} — pulls the agent's personal email so the
   *      recipient field starts pre-filled and editable.
   * Errors on either lookup surface as an inline modal warning but do
   * not block the admin from typing an address manually.
   */
  const openResendMailModal = async () => {
    setResendMailPdfUrl("");
    setResendMailEmail("");
    setResendMailEmailError("");
    setShowResendMailModal(true);
    setResendMailPreparing(true);
    try {
      const agentId = detail?.agentId
        ? Number(String(detail.agentId).trim())
        : null;
      const [docRes, agentRes] = await Promise.all([
        axiosInstance
          .get(`/api/longStayBooking/${bookingId}/pdf`, {
            params: { type: resendDocType },
          })
          .catch(() => null),
        agentId
          ? axiosInstance.get(`/api/agent/${agentId}`).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (
        docRes?.data?.status === "SUCCESS" &&
        docRes.data.pdfUrl
      ) {
        setResendMailPdfUrl(docRes.data.pdfUrl);
      }
      const a = agentRes?.data || {};
      const email =
        a.personalEmail ||
        a.financeManagerEmail ||
        a.gmEmail ||
        "";
      setResendMailEmail(email);
    } finally {
      setResendMailPreparing(false);
    }
  };

  const submitResendMail = async () => {
    const email = (resendMailEmail || "").trim();
    if (!email) {
      setResendMailEmailError("Recipient email is required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setResendMailEmailError("Enter a valid email address");
      return;
    }
    setResendMailEmailError("");
    try {
      setResendingMail(true);
      await axiosInstance.post(
        `/api/longStayBooking/${bookingId}/resend-mail`,
        null,
        { params: { email } },
      );
      toast.success("Mail resent to agent successfully!");
      setShowResendMailModal(false);
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Failed to resend mail to agent. Please try again."
      );
    } finally {
      setResendingMail(false);
    }
  };

  // ── PDF preview ────────────────────────────────────────────────────
  const handleDownloadPdf = async (type, label) => {
    if (!bookingId) return;
    try {
      setGeneratingPdfType(type);
      const res = await axiosInstance.get(
        `/api/longStayBooking/${bookingId}/pdf`,
        { params: { type: type.toUpperCase() } }
      );
      if (res.data && res.data.status === "SUCCESS" && res.data.pdfUrl) {
        setPdfPreview({
          url: res.data.pdfUrl,
          label: label || type,
          type: type.toUpperCase(),
        });
      } else {
        toast.error(
          res.data?.message || `Failed to generate ${label || type}.`
        );
      }
    } catch (error) {
      toast.error(
        error.response?.data?.message || `Error generating ${label || type}.`
      );
    } finally {
      setGeneratingPdfType(null);
    }
  };

  // Booking lifecycle events for the History modal. Each row is gated on its
  // backend timestamp being present and shows the per-action "Performed By"
  // the backend now records (createdBy / confirmedBy / reconfirmedBy /
  // cancelledBy). Created falls back to the employee/creator label; sorted
  // chronologically — mirrors the hotel detail view.
  // Prefer the entity's own createdBy (BaseEntity @CreatedBy, auto-
  // populated at insert time) so the History modal's "Booking Created"
  // row shows the operator's username on flows where confirmedBy is
  // null at create (On-Request bookings — Confirmed is stamped later).
  // Falls back to confirmedBy (Available bookings that got confirmed at
  // create) and then employeeName (older rows) before the "-" bail-out.
  const creatorLabel =
    detail?.createdBy || detail?.confirmedBy || detail?.employeeName || "-";
  const bookingHistory = (() => {
    if (!detail) return [];
    const events = [];
    // Each event carries the resulting booking status right after that
    // action ran — surfaced in the new "Status" column so the History
    // modal reads as a lifecycle timeline (Confirmed → ReConfirmed →
    // Cancelled) instead of a bare action log. Mirrors the identical
    // treatment on BookingDetailedView so both flows read consistently.
    const createdRowStatus = isOnRequestOrigin ? "On Request" : "Confirmed";
    if (detail.bookingDateTime) {
      events.push({
        action: "Booking Created",
        status: createdRowStatus,
        at: detail.bookingDateTime,
        by: creatorLabel,
        // Captured at create time only — later lifecycle rows show "-".
        location: detail.bookingLocation,
        ip: detail.ipAddress,
      });
    }
    if (detail.confirmedDate) {
      events.push({
        action: "Booking Confirmed",
        // For an On Request row the "Confirmed" action is the step-1
        // supplier acknowledgement, so the status label reads
        // "On Request/Confirmed" to preserve the on-request origin.
        status: isOnRequestOrigin ? "On Request/Confirmed" : "Confirmed",
        at: detail.confirmedDate,
        by: detail.confirmedBy || "-",
        // Per-action audit. Bookings confirmed at create time copy the create
        // pair; a later Confirm stamps the operator's own location/IP. Legacy
        // rows have both null and render "-".
        location: detail.confirmedLocation,
        ip: detail.confirmedIp,
      });
    }
    if (detail.reconfirmedDate) {
      events.push({
        action: "Booking Reconfirmed",
        status: isOnRequestOrigin
          ? "On Request/Confirmed/Reconfirmed"
          : "ReConfirmed",
        at: detail.reconfirmedDate,
        by: detail.reconfirmedBy || "-",
        location: detail.reconfirmedLocation,
        ip: detail.reconfirmedIp,
      });
    }
    if (detail.cancelledAt) {
      events.push({
        action: "Booking Cancelled",
        status: "Cancelled",
        at: detail.cancelledAt,
        by: detail.cancelledBy || "-",
        location: detail.cancelledLocation,
        ip: detail.cancelledIp,
      });
    }
    return events.sort((a, b) => {
      const da = parseLocal(a.at)?.getTime() ?? 0;
      const db = parseLocal(b.at)?.getTime() ?? 0;
      return da - db;
    });
  })();

  // Currency formatting helper used by the Cancel-modal warning + summary.
  const currencyLabel = (amountAed) => {
    if (amountAed == null) return "-";
    if (
      detail?.displayCurrencyCode &&
      detail.displayCurrencyCode !== "AED" &&
      Number(detail.displayAmount) > 0
    ) {
      return `${detail.displayCurrencyCode} ${Number(detail.displayAmount).toFixed(2)}`;
    }
    return `AED ${Number(amountAed).toFixed(2)}`;
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4" style={{ overflow: "auto" }}>
          <Container fluid style={{ maxWidth: "1100px" }}>
            {/* Back button — header layout matches the hotel view. */}
            <div className="mb-3">
              <button
                style={BTN_NEUTRAL}
                onClick={() => navigate(-1)}
              >
                ← Back
              </button>
              <span
                style={{
                  marginLeft: "12px",
                  fontWeight: "700",
                  fontSize: "1.1rem",
                  color: "#333",
                }}
              >
                Booking Details
              </span>
            </div>

            {detailLoading ? (
              <div className="text-center py-5">
                <Spinner animation="border" style={{ color: "#c0392b" }} />
                <p className="mt-3 text-muted">Loading booking details...</p>
              </div>
            ) : !detail ? (
              <div className="text-center py-5 text-muted">
                Booking not found.
              </div>
            ) : (
              <>
                {/* ── Booking Info ──────────────────────────────────── */}
                <div style={card}>
                  <div style={SECTION_HEADER}>Booking Information</div>
                  <div style={{ padding: "12px 16px" }}>
                    <Row>
                      <Col md={6}>
                        <InfoRow
                          label="Booking Code"
                          value={detail.bookingCode}
                        />
                        <InfoRow label="Hotel Name" value={detail.hotelName} />
                        <InfoRow
                          label="Check-In"
                          value={formatDateTime(detail.checkInDate)}
                        />
                        <InfoRow
                          label="Check-Out"
                          value={formatDateTime(detail.checkOutDate)}
                        />
                        <InfoRow
                          label="No. of Nights"
                          value={
                            detail.totalNights
                              ? `${detail.totalNights} Night${detail.totalNights !== 1 ? "s" : ""}`
                              : "-"
                          }
                        />
                        {detail.bookingDateTime && (
                          <InfoRow
                            label="Booking Date"
                            value={formatDateTime(detail.bookingDateTime)}
                          />
                        )}
                      </Col>
                      <Col md={6}>
                        <InfoRow label="Agent" value={detail.agentName} />
                        {detail.employeeName && (
                          <InfoRow
                            label="Booked By Employee"
                            value={detail.employeeName}
                          />
                        )}
                        {/* Contact — "Booking done for" value entered on the
                            booking page, shown as "<value>/<agentName>". Only
                            rendered when a value was entered. */}
                        {detail.bookingDoneFor && (
                          <InfoRow
                            label="Contact"
                            value={
                              detail.agentName
                                ? `${detail.bookingDoneFor}/${detail.agentName}`
                                : detail.bookingDoneFor
                            }
                          />
                        )}
                        <InfoRow
                          label="Agent Reference"
                          value={detail.agentLpo}
                        />
                        <InfoRow
                          label="Confirmation No."
                          value={detail.confirmationNumber}
                        />
                        <InfoRow
                          label="Cancel Status"
                          value={detail.cancelStatus ? "Cancelled" : "Active"}
                        />
                        <InfoRow
                          label="Status"
                          value={<StatusBadge status={displayStatus} />}
                        />
                      </Col>
                    </Row>
                  </div>
                </div>

                {/* ── Room & Rate Plan ──────────────────────────────── */}
                <div style={card}>
                  <div style={SECTION_HEADER}>Room &amp; Rate Plan</div>
                  <div style={{ padding: "12px 16px" }}>
                    <Row>
                      <Col md={6}>
                        <InfoRow
                          label="Room Category"
                          value={detail.roomCategoryName}
                        />
                        <InfoRow
                          label="Room Type"
                          value={detail.roomTypeName}
                        />
                        <InfoRow
                          label="Occupancy"
                          value={detail.occupancyTypeName}
                        />
                      </Col>
                      <Col md={6}>
                        <InfoRow
                          label="Meal Plan"
                          value={detail.mealPlanName}
                        />
                        <InfoRow
                          label="Contract Rate Code"
                          value={detail.contractRateCode}
                        />
                        <InfoRow
                          label="Refundable"
                          value={
                            detail.refundable
                              ? "Flexible"
                              : "Non-Refundable"
                          }
                        />
                      </Col>
                    </Row>
                  </div>
                </div>

                {/* ── Pricing ──────────────────────────────────────── */}
                <div style={card}>
                  <div style={SECTION_HEADER}>Pricing</div>
                  <div style={{ padding: "12px 16px" }}>
                    <Row>
                      <Col md={6}>
                        <InfoRow
                          label="Monthly Rate"
                          value={detail.monthlyRate}
                        />
                        <InfoRow
                          label="Additional Rate"
                          value={detail.additionalRate}
                        />
                      </Col>
                      <Col md={6}>
                        <InfoRow
                          label="Cost Type"
                          value={detail.additionalCostType}
                        />
                        <InfoRow
                          label="Total Amount"
                          value={currencyLabel(detail.totalAmount)}
                        />
                      </Col>
                    </Row>
                  </div>
                </div>

                {/* ── Primary Guest ─────────────────────────────────── */}
                <div style={card}>
                  <div style={SECTION_HEADER}>Primary Guest</div>
                  <div style={{ padding: "12px 16px" }}>
                    {detail.primaryGuestDetails ? (
                      <Row>
                        <Col md={6}>
                          <InfoRow
                            label="Name"
                            value={[
                              detail.primaryGuestDetails.salutation,
                              detail.primaryGuestDetails.firstName,
                              detail.primaryGuestDetails.middleName,
                              detail.primaryGuestDetails.lastName,
                            ]
                              .filter(Boolean)
                              .join(" ")
                              .trim() || "-"}
                          />
                        </Col>
                        <Col md={6}>
                          <InfoRow
                            label="Nationality"
                            value={detail.primaryGuestDetails.nationality}
                          />
                        </Col>
                      </Row>
                    ) : (
                      <Row>
                        <Col md={6}>
                          <InfoRow
                            label="Name"
                            value={detail.primaryGuestName}
                          />
                        </Col>
                        <Col md={6}>
                          <InfoRow
                            label="Nationality"
                            value={detail.nationality}
                          />
                        </Col>
                      </Row>
                    )}
                  </div>
                </div>

                {/* ── Passengers ────────────────────────────────────── */}
                {detail.rooms && detail.rooms.length > 0 && (
                  <div style={card}>
                    <div style={SECTION_HEADER}>Passengers</div>
                    <div style={{ padding: "12px 16px" }}>
                      {detail.rooms.map((room, idx) => (
                        <div key={idx} className="mb-3">
                          <strong>
                            Room {idx + 1} — {room.adults || 0} Adult
                            {(room.adults || 0) > 1 ? "s" : ""}
                            {(room.children || 0) > 0
                              ? `, ${room.children} Child${
                                  room.children > 1 ? "ren" : ""
                                }`
                              : ""}
                          </strong>
                          <Table size="sm" bordered className="mt-2 mb-0">
                            <thead className="table-light">
                              <tr>
                                <th>#</th>
                                <th>Salutation</th>
                                <th>First Name</th>
                                <th>Last Name</th>
                                <th>Type</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(room.guests || []).map((g, gi) => (
                                <tr key={gi}>
                                  <td>{gi + 1}</td>
                                  <td>{g.salutation || "-"}</td>
                                  <td>{g.firstName || "-"}</td>
                                  <td>{g.lastName || "-"}</td>
                                  <td>
                                    {g.isChild
                                      ? `Child${
                                          g.childAge != null
                                            ? ` (${g.childAge}y)`
                                            : ""
                                        }`
                                      : "Adult"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </Table>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Related Sub-Bookings of OTHER types (amendment links) ──
                    Hotel / 24Hr / Day Stay / Gov / Student / Senior Citizen
                    children attached to this long-stay parent via
                    /api/booking-amendment-link. */}
                {amendmentLinks && amendmentLinks.length > 0 && (
                  <div style={card}>
                    <div style={SECTION_HEADER}>
                      Related Sub-Bookings — Other Types ({amendmentLinks.length})
                    </div>
                    <div style={{ padding: "10px 16px" }}>
                      {amendmentLinks.map((lnk) => (
                        <div
                          key={lnk.id}
                          style={{
                            borderTop: "1px solid #eee",
                            padding: "10px 0",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: "6px",
                            }}
                          >
                            <span
                              style={{
                                color: "#c0392b",
                                fontWeight: "700",
                                fontSize: "0.9rem",
                              }}
                            >
                              {lnk.childBookingCode || "-"}
                              <span
                                style={{
                                  marginLeft: "8px",
                                  color: "#888",
                                  fontWeight: "500",
                                  fontSize: "0.8rem",
                                }}
                              >
                                ({lnk.childTypeLabel || lnk.childType})
                              </span>
                            </span>
                            {lnk.childDetailRoutePrefix && lnk.childBookingId != null && (
                              <button
                                style={BTN_NEUTRAL}
                                onClick={() =>
                                  navigate(
                                    `${lnk.childDetailRoutePrefix}${lnk.childBookingId}`,
                                  )
                                }
                              >
                                View
                              </button>
                            )}
                          </div>
                          <Row>
                            <Col md={6}>
                              <InfoRow
                                label="Booking Type"
                                value={lnk.childTypeLabel || lnk.childType}
                              />
                              <InfoRow
                                label="Reference No."
                                value={lnk.childReferenceNumber}
                              />
                              <InfoRow label="Hotel" value={lnk.childHotelName} />
                            </Col>
                            <Col md={6}>
                              <InfoRow
                                label="Check-In"
                                value={lnk.childCheckInDate}
                              />
                              <InfoRow
                                label="Check-Out"
                                value={lnk.childCheckOutDate}
                              />
                              <InfoRow
                                label="Total Rate"
                                value={
                                  lnk.childTotalRate != null
                                    ? Number(lnk.childTotalRate).toFixed(2)
                                    : "-"
                                }
                              />
                              <InfoRow
                                label="Status"
                                value={<StatusBadge status={lnk.childStatus} />}
                              />
                            </Col>
                          </Row>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Remarks ───────────────────────────────────────── */}
                <div style={card}>
                  <div style={SECTION_HEADER}>
                    Remarks{" "}
                    <span style={{ fontSize: "1rem", color: "#555" }}>⊟</span>
                  </div>
                  <div
                    style={{
                      padding: "10px 16px",
                      fontSize: "0.83rem",
                      color: "#333",
                    }}
                  >
                    {detail.remarks ? (
                      <p style={{ marginBottom: 0 }}>{detail.remarks}</p>
                    ) : (
                      <span className="text-muted">No remarks.</span>
                    )}
                  </div>
                </div>

                {/* ── Special Requests ──────────────────────────────── */}
                <div style={card}>
                  <div style={SECTION_HEADER}>
                    Special Requests{" "}
                    <span style={{ fontSize: "1rem", color: "#555" }}>⊟</span>
                  </div>
                  <div
                    style={{
                      padding: "10px 16px",
                      fontSize: "0.83rem",
                      color: "#333",
                    }}
                  >
                    {Array.isArray(detail.specialRequests) &&
                    detail.specialRequests.length > 0 ? (
                      <div className="d-flex flex-wrap gap-2">
                        {detail.specialRequests.map((sr, i) => (
                          <span
                            key={i}
                            className="badge rounded-pill"
                            style={{
                              background: "#EEF2FF",
                              color: "#3730A3",
                              fontWeight: 600,
                              fontSize: "0.75rem",
                              padding: "6px 12px",
                            }}
                          >
                            {sr}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted">No special requests.</span>
                    )}
                  </div>
                </div>

                {/* ── Related Notes ─────────────────────────────────── */}
                <div style={card}>
                  <div style={SECTION_HEADER}>
                    Notes{" "}
                    {bookingNotes.length > 0 && (
                      <span
                        style={{
                          fontSize: "0.7rem",
                          fontWeight: 600,
                          color: "#EC0B43",
                          background: "#FDE7ED",
                          borderRadius: "99px",
                          padding: "2px 9px",
                          marginLeft: 6,
                          letterSpacing: ".02em",
                        }}
                      >
                        {bookingNotes.length}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      padding: "10px 16px",
                      fontSize: "0.83rem",
                      color: "#333",
                    }}
                  >
                    {notesLoading ? (
                      <span className="text-muted">Loading notes…</span>
                    ) : bookingNotes.length === 0 ? (
                      <span className="text-muted">No notes yet.</span>
                    ) : (
                      bookingNotes.map((n) => (
                        <div
                          key={n.id}
                          style={{
                            borderLeft: "3px solid #EC0B43",
                            background: "#FAFAF8",
                            padding: "10px 12px",
                            marginBottom: 8,
                            borderRadius: 4,
                          }}
                        >
                          <div
                            style={{
                              fontSize: "0.72rem",
                              color: "#777",
                              marginBottom: 4,
                              letterSpacing: ".01em",
                            }}
                          >
                            {n.createdBy ? `${n.createdBy} • ` : ""}
                            {n.createdDate ? formatDateTime(n.createdDate) : ""}
                          </div>
                          <div
                            style={{
                              fontSize: "0.85rem",
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {n.note}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* ── Action Buttons ──────────────────────────────────
                    Cancelled and live bookings render different rows, same as
                    the hotel detail view. Cancelled keeps the doc / agent-ref /
                    confirmation-no. / resend / remark / notes / history set,
                    but drops Add New Item / Cancel / Reconfirm. */}
                {isCancelled && (
                  <div
                    style={{
                      marginBottom: "10px",
                      display: "flex",
                      gap: "8px",
                      flexWrap: "wrap",
                    }}
                  >
                    {cancelledShowsFinalDocs ? (
                      <button
                        style={BTN_INFO}
                        disabled={generatingPdfType === "INVOICE"}
                        onClick={() =>
                          handleDownloadPdf("INVOICE", "Invoice")
                        }
                      >
                        {generatingPdfType === "INVOICE"
                          ? "GENERATING..."
                          : "INVOICE"}
                      </button>
                    ) : (
                      <>
                        <button
                          style={BTN_INFO}
                          disabled={generatingPdfType === "PROFORMA_VOUCHER"}
                          onClick={() =>
                            handleDownloadPdf(
                              "PROFORMA_VOUCHER",
                              "Proforma Voucher",
                            )
                          }
                        >
                          {generatingPdfType === "PROFORMA_VOUCHER"
                            ? "GENERATING..."
                            : "PROFORMA VOUCHER"}
                        </button>
                        <button
                          style={BTN_INFO}
                          disabled={generatingPdfType === "PROFORMA_INVOICE"}
                          onClick={() =>
                            handleDownloadPdf(
                              "PROFORMA_INVOICE",
                              "Proforma Invoice",
                            )
                          }
                        >
                          {generatingPdfType === "PROFORMA_INVOICE"
                            ? "GENERATING..."
                            : "PROFORMA INVOICE"}
                        </button>
                      </>
                    )}

                    <button
                      style={BTN_SKY}
                      onClick={() => {
                        if (!cancelledFromConfirmedOrLater) {
                          toast.error(
                            "Agent Reference can only be added once the booking is Confirmed or ReConfirmed.",
                          );
                          return;
                        }
                        openConfirmStatusModal();
                      }}
                    >
                      ADD AGENT REFERENCE
                    </button>

                    {!isAgentRole && (
                      <button
                        style={BTN_INDIGO}
                        onClick={() => {
                          if (!cancelledFromConfirmedOrLater) {
                            toast.error(
                              "Confirmation Number can only be added once the booking is Confirmed or ReConfirmed.",
                            );
                            return;
                          }
                          openConfirmationNoModal();
                        }}
                      >
                        CONFIRMATION NO.
                      </button>
                    )}

                    <button
                      style={BTN_ORANGE}
                      onClick={openResendMailModal}
                      disabled={resendingMail || resendMailPreparing}
                    >
                      {resendingMail
                        ? "SENDING..."
                        : resendMailPreparing
                        ? "LOADING..."
                        : "RESEND MAIL TO AGENT"}
                    </button>

                    {!isAgentRole && (
                      <button style={BTN_ACCENT} onClick={openRemarkModal}>
                        BOOKING REMARK
                      </button>
                    )}

                    {!isAgentRole && (
                      <button
                        style={BTN_NEUTRAL}
                        onClick={openNotesModal}
                      >
                        NOTES
                      </button>
                    )}

                    <button
                      style={BTN_HISTORY}
                      onClick={() => setShowHistoryModal(true)}
                    >
                      HISTORY
                    </button>
                  </div>
                )}
                {!isCancelled && (
                  <div
                    style={{
                      marginBottom: "10px",
                      display: "flex",
                      gap: "8px",
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      style={BTN_PRIMARY}
                      onClick={() => {
                        setSelectedAddItemType(ADD_NEW_ITEM_TYPES[0].key);
                        setShowAddItemModal(true);
                      }}
                    >
                      ADD NEW ITEM
                    </button>

                    <button
                      style={{
                        ...BTN_DANGER,
                        opacity: isPastCheckIn ? 0.55 : 1,
                        cursor: isPastCheckIn ? "not-allowed" : "pointer",
                      }}
                      onClick={openCancelModal}
                      disabled={isPastCheckIn}
                      title={
                        isPastCheckIn
                          ? "This booking cannot be cancelled because the check-in date has already passed."
                          : undefined
                      }
                    >
                      CANCEL
                    </button>

                    {/* Single Confirm/Reconfirm button. On-Request bookings show
                        CONFIRM (the Reject action lives inside its modal); once
                        Confirmed they Reconfirm like any other booking. Agents
                        never see the CONFIRM step for an On Request booking —
                        only admin / super-admin do; see canConfirmOnRequest
                        above. RECONFIRM remains visible to agents unchanged. */}
                    {!isRejected &&
                      (isOnRequestPending || !showsFinalDocs) &&
                      !(isOnRequestPending && !canConfirmOnRequest) && (
                        <button style={BTN_TEAL} onClick={openConfirmModal}>
                          {isOnRequestPending ? "CONFIRM" : "RECONFIRM"}
                        </button>
                      )}

                    {!showsFinalDocs ? (
                      <>
                        <button
                          style={BTN_INFO}
                          disabled={generatingPdfType === "PROFORMA_VOUCHER"}
                          onClick={() =>
                            handleDownloadPdf(
                              "PROFORMA_VOUCHER",
                              "Proforma Voucher",
                            )
                          }
                        >
                          {generatingPdfType === "PROFORMA_VOUCHER"
                            ? "GENERATING..."
                            : "PROFORMA VOUCHER"}
                        </button>
                        <button
                          style={BTN_INFO}
                          disabled={generatingPdfType === "PROFORMA_INVOICE"}
                          onClick={() =>
                            handleDownloadPdf(
                              "PROFORMA_INVOICE",
                              "Proforma Invoice",
                            )
                          }
                        >
                          {generatingPdfType === "PROFORMA_INVOICE"
                            ? "GENERATING..."
                            : "PROFORMA INVOICE"}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          style={BTN_INFO}
                          disabled={generatingPdfType === "VOUCHER"}
                          onClick={() => handleDownloadPdf("VOUCHER", "Voucher")}
                        >
                          {generatingPdfType === "VOUCHER"
                            ? "GENERATING..."
                            : "VOUCHER"}
                        </button>
                        <button
                          style={BTN_INFO}
                          disabled={generatingPdfType === "INVOICE"}
                          onClick={() => handleDownloadPdf("INVOICE", "Invoice")}
                        >
                          {generatingPdfType === "INVOICE"
                            ? "GENERATING..."
                            : "INVOICE"}
                        </button>
                      </>
                    )}

                    <button
                      style={BTN_SKY}
                      onClick={() => {
                        if (!isConfirmedOrLater) {
                          toast.error(
                            "Agent Reference can only be added once the booking is Confirmed or ReConfirmed.",
                          );
                          return;
                        }
                        openConfirmStatusModal();
                      }}
                    >
                      ADD AGENT REFERENCE
                    </button>

                    {!isAgentRole && (
                      <button
                        style={BTN_INDIGO}
                        onClick={() => {
                          if (!isConfirmedOrLater) {
                            toast.error(
                              "Confirmation Number can only be added once the booking is Confirmed or ReConfirmed.",
                            );
                            return;
                          }
                          openConfirmationNoModal();
                        }}
                      >
                        CONFIRMATION NO.
                      </button>
                    )}

                    <button
                      style={BTN_ORANGE}
                      onClick={openResendMailModal}
                      disabled={resendingMail || resendMailPreparing}
                    >
                      {resendingMail
                        ? "SENDING..."
                        : resendMailPreparing
                        ? "LOADING..."
                        : "RESEND MAIL TO AGENT"}
                    </button>

                    {!isAgentRole && (
                      <button style={BTN_ACCENT} onClick={openRemarkModal}>
                        BOOKING REMARK
                      </button>
                    )}

                    {!isAgentRole && (
                      <button
                        style={BTN_NEUTRAL}
                        onClick={openNotesModal}
                      >
                        NOTES
                      </button>
                    )}

                    <button
                      style={BTN_HISTORY}
                      onClick={() => setShowHistoryModal(true)}
                    >
                      HISTORY
                    </button>
                  </div>
                )}

                {/* ── Booking Date footer ───────────────────────────── */}
                <div
                  style={{
                    textAlign: "right",
                    fontSize: "0.8rem",
                    color: "#555",
                    paddingBottom: "8px",
                  }}
                >
                  Booking Date : {formatDateTime(detail.bookingDateTime)}
                </div>

                {/* ── Add New Item (Amendment) booking-type picker ──────── */}
                <Modal
                  show={showAddItemModal}
                  onHide={() => setShowAddItemModal(false)}
                  centered
                >
                  <Modal.Header closeButton>
                    <Modal.Title style={{ fontSize: "1.05rem" }}>
                      Add New Item
                    </Modal.Title>
                  </Modal.Header>
                  <Modal.Body>
                    <div style={{ marginBottom: "10px", color: "#555" }}>
                      Select a booking type to add as a sub-booking of{" "}
                      <strong>{detail?.bookingCode}</strong>.
                    </div>
                    <Form>
                      {ADD_NEW_ITEM_TYPES.map((t) => (
                        <Form.Check
                          key={t.key}
                          type="radio"
                          name="addNewItemType"
                          id={`add-item-${t.key}`}
                          label={t.label}
                          value={t.key}
                          checked={selectedAddItemType === t.key}
                          onChange={() => setSelectedAddItemType(t.key)}
                          style={{ marginBottom: "6px" }}
                        />
                      ))}
                    </Form>
                  </Modal.Body>
                  <Modal.Footer>
                    <Button
                      variant="secondary"
                      onClick={() => setShowAddItemModal(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => {
                        const chosen = ADD_NEW_ITEM_TYPES.find(
                          (t) => t.key === selectedAddItemType,
                        );
                        if (!chosen) return;
                        const parent = detail?.bookingCode;
                        if (!parent) return;
                        setShowAddItemModal(false);
                        navigate(
                          `${chosen.route}?parentBookingCode=${encodeURIComponent(
                            parent,
                          )}`,
                        );
                      }}
                    >
                      Continue
                    </Button>
                  </Modal.Footer>
                </Modal>

                {/* ── Booking History Modal ─────────────────────────── */}
                <Modal
                  show={showHistoryModal}
                  onHide={() => setShowHistoryModal(false)}
                  centered
                  size="xl"
                  scrollable
                  contentClassName="hbs-history-modal-content"
                >
                  <Modal.Header closeButton>
                    <Modal.Title
                      style={{ fontSize: "1.05rem", display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <FaHistory size={16} />
                      <span>
                        Booking History
                        {detail?.bookingCode && (
                          <span style={{ opacity: 0.85, fontWeight: 500 }}>
                            {` — ${detail.bookingCode}`}
                          </span>
                        )}
                      </span>
                    </Modal.Title>
                  </Modal.Header>
                  <Modal.Body style={{ backgroundColor: "#f8fafc", padding: "1.25rem 1.5rem" }}>
                    {bookingHistory.length === 0 ? (
                      <div className="text-muted text-center py-4">
                        <FaHistory size={26} style={{ opacity: 0.25, marginBottom: 8 }} />
                        <div>No history available for this booking.</div>
                      </div>
                    ) : (
                      <div
                        style={{
                          borderRadius: 10,
                          border: "1px solid #e2e8f0",
                          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06)",
                          backgroundColor: "#fff",
                        }}
                      >
                        {/* tableLayout "fixed" + percentage widths: the columns
                            always share the modal's width, so the popup never
                            needs a horizontal scrollbar — long values wrap
                            inside their cell. */}
                        <table
                          style={{
                            width: "100%",
                            tableLayout: "fixed",
                            borderCollapse: "collapse",
                            fontSize: "0.82rem",
                            marginBottom: 0,
                          }}
                        >
                          <thead>
                            <tr style={{ backgroundColor: "#f1f5f9" }}>
                              {[
                                { label: "S/N", width: "5%" },
                                { label: "Action", width: "15%" },
                                { label: "Status", width: "12%" },
                                { label: "Performed By", icon: FaUserAlt, width: "11%" },
                                { label: "Location", icon: FaMapMarkerAlt, width: "24%" },
                                { label: "IP Address", icon: FaNetworkWired, width: "13%" },
                                { label: "Date", icon: FaCalendarAlt, width: "11%" },
                                { label: "Time", icon: FaClock, width: "9%" },
                              ].map((col) => (
                                <th
                                  key={col.label}
                                  style={{
                                    width: col.width,
                                    padding: "10px 14px",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.03em",
                                    fontSize: "0.72rem",
                                    fontWeight: 700,
                                    color: "#475569",
                                    borderBottom: "1px solid #e2e8f0",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {col.icon ? (
                                    <span
                                      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                                    >
                                      <col.icon size={11} style={{ opacity: 0.7 }} />
                                      {col.label}
                                    </span>
                                  ) : (
                                    col.label
                                  )}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {bookingHistory.map((ev, idx) => {
                              const meta =
                                HISTORY_ACTION_META[ev.action] || HISTORY_ACTION_FALLBACK;
                              const ActionIcon = meta.icon;
                              return (
                                <tr
                                  key={`${ev.action}-${idx}`}
                                  style={{ backgroundColor: idx % 2 === 1 ? "#f8fafc" : "#fff" }}
                                >
                                  <td
                                    style={{
                                      padding: "10px 14px",
                                      borderBottom: "1px solid #eef2f6",
                                      color: "#64748b",
                                    }}
                                  >
                                    {idx + 1}
                                  </td>
                                  <td style={{ padding: "10px 14px", borderBottom: "1px solid #eef2f6" }}>
                                    <span
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 6,
                                        padding: "3px 10px",
                                        borderRadius: 999,
                                        backgroundColor: meta.bg,
                                        color: meta.fg,
                                        fontWeight: 600,
                                        fontSize: "0.76rem",
                                      }}
                                    >
                                      <ActionIcon size={10} style={{ flexShrink: 0 }} />
                                      {ev.action}
                                    </span>
                                  </td>
                                  {/* Status column — the resulting booking
                                      state right after this action. Colour-
                                      coded so a timeline glance conveys the
                                      progression: green for confirmed /
                                      reconfirmed / on-request-confirmed,
                                      amber for the original on-request
                                      state, red for cancelled, slate for
                                      anything unrecognised. Mirrors the
                                      identical treatment on
                                      BookingDetailedView. */}
                                  <td
                                    style={{
                                      padding: "10px 14px",
                                      borderBottom: "1px solid #eef2f6",
                                    }}
                                  >
                                    {(() => {
                                      const raw = String(ev.status || "").trim();
                                      if (!raw) return <span style={{ color: "#94a3b8" }}>-</span>;
                                      const lower = raw.toLowerCase();
                                      const color = lower.includes("cancel")
                                        ? "#dc2626"
                                        : lower === "on request"
                                          ? "#d97706"
                                          : "#16a34a";
                                      return (
                                        <span
                                          style={{
                                            color,
                                            fontWeight: 600,
                                            fontSize: "0.78rem",
                                            whiteSpace: "normal",
                                            wordBreak: "break-word",
                                          }}
                                        >
                                          {raw}
                                        </span>
                                      );
                                    })()}
                                  </td>
                                  <td style={{ padding: "10px 14px", borderBottom: "1px solid #eef2f6" }}>
                                    {ev.by || "-"}
                                  </td>
                                  <td
                                    style={{
                                      padding: "10px 14px",
                                      borderBottom: "1px solid #eef2f6",
                                      wordBreak: "break-word",
                                    }}
                                  >
                                    {ev.location ? (
                                      <span
                                        style={{ display: "inline-flex", alignItems: "flex-start", gap: 6 }}
                                      >
                                        <FaMapMarkerAlt
                                          size={11}
                                          style={{ color: "#c0392b", marginTop: 2, flexShrink: 0 }}
                                        />
                                        <span>{ev.location}</span>
                                      </span>
                                    ) : (
                                      "-"
                                    )}
                                  </td>
                                  <td style={{ padding: "10px 14px", borderBottom: "1px solid #eef2f6" }}>
                                    {ev.ip ? (
                                      <span
                                        style={{
                                          fontFamily: "'Consolas', 'Courier New', monospace",
                                          backgroundColor: "#f1f5f9",
                                          color: "#334155",
                                          padding: "2px 8px",
                                          borderRadius: 4,
                                          fontSize: "0.76rem",
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        {ev.ip}
                                      </span>
                                    ) : (
                                      "-"
                                    )}
                                  </td>
                                  <td style={{ padding: "10px 14px", borderBottom: "1px solid #eef2f6" }}>
                                    {formatDateOnly(ev.at)}
                                  </td>
                                  <td style={{ padding: "10px 14px", borderBottom: "1px solid #eef2f6" }}>
                                    {formatTimeOnly(ev.at)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Modal.Body>
                  <Modal.Footer style={{ backgroundColor: "#fff" }}>
                    <Button
                      variant="secondary"
                      onClick={() => setShowHistoryModal(false)}
                      style={{
                        borderRadius: 6,
                        padding: "6px 20px",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                      }}
                    >
                      Close
                    </Button>
                  </Modal.Footer>
                </Modal>

                {/* ── Cancel Booking Modal ──────────────────────────── */}
                <Modal
                  show={showCancelModal}
                  onHide={() => {
                    if (!cancellingBooking) {
                      setShowCancelModal(false);
                      setCancellationReason("");
                    }
                  }}
                  centered
                  backdrop="static"
                  keyboard={false}
                >
                  <Modal.Header
                    closeButton={!cancellingBooking}
                    style={{
                      backgroundColor: "#fff",
                      borderBottom: "2px solid #e9ecef",
                    }}
                  >
                    <Modal.Title className="fw-bold d-flex align-items-center">
                      <FaExclamationCircle className="me-2 text-danger" />
                      <span>Cancel Booking</span>
                    </Modal.Title>
                  </Modal.Header>
                  <Modal.Body style={{ padding: "1.5rem" }}>
                    <div className="text-center">
                      <p className="fs-5 mb-3">
                        Are you sure you want to cancel this booking?
                      </p>
                      {(detail.bookingCode || detail.hotelName) && (
                        <div className="text-muted small mb-3">
                          {detail.bookingCode && (
                            <div>
                              <strong>Booking Code:</strong>{" "}
                              {detail.bookingCode}
                            </div>
                          )}
                          {detail.hotelName && (
                            <div>
                              <strong>Hotel:</strong> {detail.hotelName}
                            </div>
                          )}
                        </div>
                      )}
                      {detail.totalAmount != null && (
                        <div
                          className="mb-3"
                          style={{
                            border: "1px solid #ffe69c",
                            backgroundColor: "#fff3cd",
                            color: "#664d03",
                            borderRadius: "4px",
                            padding: "10px 12px",
                            fontSize: "0.9rem",
                          }}
                        >
                          <FaExclamationCircle className="me-2 text-warning" />
                          Total value of this booking is{" "}
                          <strong>{currencyLabel(detail.totalAmount)}</strong>.
                          <div className="fw-semibold mt-1">
                            Do you still want to cancel it?
                          </div>
                        </div>
                      )}
                      <Form.Group controlId="cancellationReason" className="text-start">
                        <Form.Label className="fw-semibold">
                          Cancellation Reason{" "}
                          <span className="text-danger">*</span>
                        </Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={3}
                          placeholder="Add a reason for cancellation"
                          value={cancellationReason}
                          onChange={(e) =>
                            setCancellationReason(e.target.value)
                          }
                          disabled={cancellingBooking}
                          isInvalid={!cancellationReason.trim()}
                          required
                        />
                        <Form.Control.Feedback type="invalid">
                          Cancellation reason is required.
                        </Form.Control.Feedback>
                      </Form.Group>
                    </div>
                  </Modal.Body>
                  <Modal.Footer
                    style={{
                      backgroundColor: "#f8f9fa",
                      borderTop: "1px solid #dee2e6",
                    }}
                  >
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setShowCancelModal(false);
                        setCancellationReason("");
                      }}
                      disabled={cancellingBooking}
                    >
                      No
                    </Button>
                    <Button
                      variant="danger"
                      onClick={cancelBooking}
                      disabled={cancellingBooking || !cancellationReason.trim()}
                    >
                      {cancellingBooking ? (
                        <>
                          <Spinner
                            animation="border"
                            size="sm"
                            className="me-2"
                          />
                          Cancelling...
                        </>
                      ) : (
                        "Yes, Cancel"
                      )}
                    </Button>
                  </Modal.Footer>
                </Modal>

                {/* ── Confirm / Reconfirm Booking Modal ───────────────
                    Same modal drives both steps: an On-Request booking still
                    pending confirms first (OnRequest → Confirmed); everything
                    else reconfirms. Wording follows isOnRequestPending. */}
                <Modal
                  show={showConfirmModal}
                  onHide={() => {
                    if (!confirmingBooking) setShowConfirmModal(false);
                  }}
                  centered
                  backdrop="static"
                  keyboard={false}
                >
                  <Modal.Header
                    closeButton={!confirmingBooking}
                    style={{
                      backgroundColor: "#fff",
                      borderBottom: "2px solid #e9ecef",
                    }}
                  >
                    <Modal.Title className="fw-bold d-flex align-items-center">
                      <FaExclamationCircle className="me-2 text-warning" />
                      <span>
                        {isOnRequestPending ? "Confirm Booking" : "Reconfirm Booking"}
                      </span>
                    </Modal.Title>
                  </Modal.Header>
                  <Modal.Body style={{ padding: "1.5rem" }}>
                    <div className="text-center">
                      <p className="fs-5 mb-3">
                        {isOnRequestPending
                          ? "Are you sure you want to confirm this On-Request booking?"
                          : "Are you sure you want to reconfirm the booking?"}
                      </p>
                      {(detail.bookingCode || detail.hotelName) && (
                        <div className="text-muted small mb-3">
                          {detail.bookingCode && (
                            <div>
                              <strong>Booking Code:</strong>{" "}
                              {detail.bookingCode}
                            </div>
                          )}
                          {detail.hotelName && (
                            <div>
                              <strong>Hotel:</strong> {detail.hotelName}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </Modal.Body>
                  <Modal.Footer
                    style={{
                      backgroundColor: "#f8f9fa",
                      borderTop: "1px solid #dee2e6",
                    }}
                  >
                    {/* Reject action shown only in the Confirm Booking
                        (on-request) flow. The Reconfirm flow hides it. */}
                    {isOnRequestPending && (
                      <Button
                        variant="outline-danger"
                        onClick={openRejectModal}
                        disabled={confirmingBooking}
                      >
                        Reject
                      </Button>
                    )}
                    <Button
                      variant="success"
                      onClick={confirmBooking}
                      disabled={confirmingBooking}
                    >
                      {confirmingBooking ? (
                        <>
                          <Spinner
                            animation="border"
                            size="sm"
                            className="me-2"
                          />
                          {isOnRequestPending ? "Confirming..." : "Reconfirming..."}
                        </>
                      ) : isOnRequestPending ? (
                        "Confirm"
                      ) : (
                        "Reconfirm"
                      )}
                    </Button>
                  </Modal.Footer>
                </Modal>

                {/* ── Booking Cannot Be Completed (Reconfirm) ──
                    Deferred-credit / On-Request Reconfirm + agent has no
                    credit AND Card payment is disabled → the operator has no
                    path to complete this action. Blocks the reconfirm with a
                    courteous message. Same shape as the hotel detail page's
                    block modal. */}
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
                      Sorry — this booking can't be completed because the
                      agent has no available credit and{" "}
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
                        AED {Number(insufficientAmount).toFixed(2)}
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

                {/* ── Online Payment Required (Reconfirm) ──
                    Surfaced when the operator reconfirms a deferred-credit /
                    On-Request booking and the agent still has no credit but
                    CAN pay by card. Same shape as the hotel detail page. */}
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
                      The agent's available credit is insufficient to
                      reconfirm this booking. You need to proceed with{" "}
                      <strong>online payment</strong>.
                    </p>
                    <div className="mt-3">
                      <div className="text-muted small">Payable amount</div>
                      <div className="fs-4 fw-bold text-dark">
                        AED {Number(insufficientAmount).toFixed(2)}
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

                {/* ── Select Payment Gateway ──
                    Identical to the hotel detail picker; on Proceed we hand
                    off to /payment/<gateway> and stamp returnTo so the gateway
                    page can send the operator back with resumeReconfirm. */}
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
                    {PAYMENT_GATEWAYS.map((g) => (
                      <Form.Check
                        key={g.id}
                        type="radio"
                        name="longstay-reconfirm-payment-gateway"
                        id={`longstay-reconfirm-gw-${g.id}`}
                        className="mb-2"
                        checked={selectedGateway === g.id}
                        onChange={() => setSelectedGateway(g.id)}
                        label={
                          <span>
                            <span className="fw-semibold">{g.name}</span>
                            <span className="text-muted small ms-2">
                              {g.desc}
                            </span>
                          </span>
                        }
                      />
                    ))}
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
                        navigate(`/payment/${selectedGateway}`, {
                          state: {
                            amountLabel: `AED ${Number(insufficientAmount).toFixed(2)}`,
                            gatewayName: gw ? gw.name : selectedGateway,
                            returnTo: location.pathname,
                            returnState: { resumeReconfirm: true },
                          },
                        });
                      }}
                    >
                      Proceed to Pay
                    </Button>
                  </Modal.Footer>
                </Modal>

                {/* ── Reject Booking Modal (On-Request bookings) ─────── */}
                <Modal
                  show={showRejectModal}
                  onHide={() => {
                    if (!rejectingBooking) setShowRejectModal(false);
                  }}
                  centered
                  backdrop="static"
                  keyboard={false}
                >
                  <Modal.Header
                    closeButton={!rejectingBooking}
                    style={{
                      backgroundColor: "#fff",
                      borderBottom: "2px solid #e9ecef",
                    }}
                  >
                    <Modal.Title className="fw-bold d-flex align-items-center">
                      <FaExclamationCircle className="me-2 text-danger" />
                      <span>Reject Booking</span>
                    </Modal.Title>
                  </Modal.Header>
                  <Modal.Body style={{ padding: "1.5rem" }}>
                    <p className="fs-6 mb-3">
                      Are you sure you want to reject this On-Request booking?
                      {(detail.bookingCode || detail.hotelName) && (
                        <span className="d-block text-muted small mt-2">
                          {detail.bookingCode && (
                            <span className="d-block">
                              <strong>Booking Code:</strong> {detail.bookingCode}
                            </span>
                          )}
                          {detail.hotelName && (
                            <span className="d-block">
                              <strong>Hotel:</strong> {detail.hotelName}
                            </span>
                          )}
                        </span>
                      )}
                    </p>
                    <Form.Group>
                      <Form.Label className="fw-semibold small">
                        Rejection remarks (optional)
                      </Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={3}
                        value={rejectRemarks}
                        onChange={(e) => setRejectRemarks(e.target.value)}
                        placeholder="Reason for rejection"
                        disabled={rejectingBooking}
                      />
                    </Form.Group>
                  </Modal.Body>
                  <Modal.Footer
                    style={{
                      backgroundColor: "#f8f9fa",
                      borderTop: "1px solid #dee2e6",
                    }}
                  >
                    <Button
                      variant="secondary"
                      onClick={() => setShowRejectModal(false)}
                      disabled={rejectingBooking}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      onClick={rejectBooking}
                      disabled={rejectingBooking}
                    >
                      {rejectingBooking ? (
                        <>
                          <Spinner
                            animation="border"
                            size="sm"
                            className="me-2"
                          />
                          Rejecting...
                        </>
                      ) : (
                        "Reject"
                      )}
                    </Button>
                  </Modal.Footer>
                </Modal>

                {/* ── Agent Reference Modal ─────────────────────────── */}
                <Modal
                  show={showConfirmStatusModal}
                  onHide={() => {
                    if (!updatingConfirmationStatus) {
                      setShowConfirmStatusModal(false);
                      setConfirmAgentLpo("");
                      setConfirmAgentLpoError("");
                    }
                  }}
                  centered
                  backdrop="static"
                  keyboard={false}
                  size="md"
                >
                  <Modal.Header
                    closeButton={!updatingConfirmationStatus}
                    style={{
                      backgroundColor: "#fff",
                      borderBottom: "2px solid #e9ecef",
                    }}
                  >
                    <Modal.Title className="fw-bold d-flex align-items-center">
                      <FaExclamationCircle className="me-2 text-warning" />
                      <span>Update Agent Reference</span>
                    </Modal.Title>
                  </Modal.Header>
                  <Modal.Body style={{ padding: "1.5rem" }}>
                    <div className="text-center">
                      <p className="fs-6 mb-3">
                        Are you sure you want to update the agent reference?
                      </p>
                      {(detail.bookingCode || detail.hotelName) && (
                        <div className="text-muted small mb-3">
                          {detail.bookingCode && (
                            <div>
                              <strong>Booking Code:</strong>{" "}
                              {detail.bookingCode}
                            </div>
                          )}
                          {detail.hotelName && (
                            <div>
                              <strong>Hotel:</strong> {detail.hotelName}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <Form.Group
                      controlId="confirmAgentLpoInput"
                      className="text-start"
                    >
                      <Form.Label className="fw-semibold mb-1">
                        Agent Reference <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="Enter Agent Reference"
                        value={confirmAgentLpo}
                        onChange={(e) => {
                          setConfirmAgentLpo(e.target.value);
                          if (confirmAgentLpoError && e.target.value.trim()) {
                            setConfirmAgentLpoError("");
                          }
                        }}
                        isInvalid={!!confirmAgentLpoError}
                        disabled={!!updatingConfirmationStatus}
                      />
                      <Form.Control.Feedback type="invalid">
                        {confirmAgentLpoError}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Modal.Body>
                  <Modal.Footer
                    style={{
                      backgroundColor: "#f8f9fa",
                      borderTop: "1px solid #dee2e6",
                    }}
                  >
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setShowConfirmStatusModal(false);
                        setConfirmAgentLpo("");
                        setConfirmAgentLpoError("");
                      }}
                      disabled={updatingConfirmationStatus}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      onClick={updateConfirmationStatus}
                      disabled={updatingConfirmationStatus}
                    >
                      {updatingConfirmationStatus ? (
                        <>
                          <Spinner
                            animation="border"
                            size="sm"
                            className="me-2"
                          />
                          Confirming...
                        </>
                      ) : (
                        "OK"
                      )}
                    </Button>
                  </Modal.Footer>
                </Modal>

                {/* ── Confirmation Number Modal ─────────────────────── */}
                <Modal
                  show={showConfirmationNoModal}
                  onHide={() => {
                    if (!savingConfirmationNo) {
                      setShowConfirmationNoModal(false);
                      setConfirmationNoError("");
                    }
                  }}
                  centered
                  backdrop="static"
                  keyboard={false}
                  size="md"
                >
                  <Modal.Header
                    closeButton={!savingConfirmationNo}
                    style={{
                      backgroundColor: "#fff",
                      borderBottom: "2px solid #e9ecef",
                    }}
                  >
                    <Modal.Title className="fw-bold">
                      Confirmation Number
                    </Modal.Title>
                  </Modal.Header>
                  <Modal.Body style={{ padding: "1.5rem" }}>
                    {(detail.bookingCode || detail.hotelName) && (
                      <div className="text-muted small mb-3">
                        {detail.bookingCode && (
                          <div>
                            <strong>Booking Code:</strong>{" "}
                            {detail.bookingCode}
                          </div>
                        )}
                        {detail.hotelName && (
                          <div>
                            <strong>Hotel:</strong> {detail.hotelName}
                          </div>
                        )}
                      </div>
                    )}
                    <Form.Group controlId="confirmationNoInput">
                      <Form.Label className="fw-semibold mb-1">
                        Confirmation Number{" "}
                        <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="Enter Hotel Confirmation Number"
                        value={confirmationNoInput}
                        onChange={(e) => {
                          setConfirmationNoInput(e.target.value);
                          if (confirmationNoError && e.target.value.trim()) {
                            setConfirmationNoError("");
                          }
                        }}
                        isInvalid={!!confirmationNoError}
                        disabled={savingConfirmationNo}
                      />
                      <Form.Control.Feedback type="invalid">
                        {confirmationNoError}
                      </Form.Control.Feedback>
                    </Form.Group>
                  </Modal.Body>
                  <Modal.Footer
                    style={{
                      backgroundColor: "#f8f9fa",
                      borderTop: "1px solid #dee2e6",
                    }}
                  >
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setShowConfirmationNoModal(false);
                        setConfirmationNoError("");
                      }}
                      disabled={savingConfirmationNo}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      onClick={saveConfirmationNo}
                      disabled={savingConfirmationNo}
                    >
                      {savingConfirmationNo ? (
                        <>
                          <Spinner
                            animation="border"
                            size="sm"
                            className="me-2"
                          />
                          Saving...
                        </>
                      ) : (
                        "Save"
                      )}
                    </Button>
                  </Modal.Footer>
                </Modal>

                {/* ── Booking Remark Modal ──────────────────────────── */}
                <Modal
                  show={showRemarkModal}
                  onHide={() => {
                    if (!savingRemark) setShowRemarkModal(false);
                  }}
                  centered
                  backdrop="static"
                  keyboard={false}
                  size="md"
                >
                  <Modal.Header
                    closeButton={!savingRemark}
                    style={{
                      backgroundColor: "#fff",
                      borderBottom: "2px solid #e9ecef",
                    }}
                  >
                    <Modal.Title className="fw-bold">
                      Booking Remark
                    </Modal.Title>
                  </Modal.Header>
                  <Modal.Body style={{ padding: "1.5rem" }}>
                    <Form.Group controlId="bookingRemarkInput">
                      <Form.Label className="fw-semibold mb-1">
                        Remark
                      </Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={4}
                        placeholder="Enter remark for this booking"
                        value={remarkInput}
                        onChange={(e) => setRemarkInput(e.target.value)}
                        disabled={savingRemark}
                      />
                    </Form.Group>
                  </Modal.Body>
                  <Modal.Footer
                    style={{
                      backgroundColor: "#f8f9fa",
                      borderTop: "1px solid #dee2e6",
                    }}
                  >
                    <Button
                      variant="secondary"
                      onClick={() => setShowRemarkModal(false)}
                      disabled={savingRemark}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      onClick={saveRemark}
                      disabled={savingRemark}
                    >
                      {savingRemark ? (
                        <>
                          <Spinner
                            animation="border"
                            size="sm"
                            className="me-2"
                          />
                          Saving...
                        </>
                      ) : (
                        "Save"
                      )}
                    </Button>
                  </Modal.Footer>
                </Modal>

                {/* ── Notes Modal ───────────────────────────────────── */}
                <Modal
                  show={showNotesModal}
                  onHide={() => {
                    if (!savingNote) setShowNotesModal(false);
                  }}
                  centered
                  backdrop="static"
                  keyboard={false}
                >
                  <Modal.Header closeButton={!savingNote}>
                    <Modal.Title style={{ fontSize: "1rem" }}>
                      Add Note
                    </Modal.Title>
                  </Modal.Header>
                  <Modal.Body>
                    <Form.Group>
                      <Form.Label className="fw-semibold">Note</Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={5}
                        placeholder="Type your note here. You can enter long paragraphs."
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        disabled={savingNote}
                        style={{ resize: "vertical" }}
                      />
                    </Form.Group>
                  </Modal.Body>
                  <Modal.Footer>
                    <Button
                      variant="outline-secondary"
                      onClick={() => setShowNotesModal(false)}
                      disabled={savingNote}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      onClick={saveNote}
                      disabled={savingNote}
                    >
                      {savingNote ? (
                        <>
                          <Spinner
                            animation="border"
                            size="sm"
                            className="me-2"
                          />
                          Saving...
                        </>
                      ) : (
                        "OK"
                      )}
                    </Button>
                  </Modal.Footer>
                </Modal>
              </>
            )}

          </Container>
        </main>
      </div>

      {/* ── PDF Preview Modal ─────────────────────────────────────── */}
      <Modal
        show={!!pdfPreview}
        onHide={() => setPdfPreview(null)}
        size="xl"
        centered
        backdrop="static"
        keyboard
      >
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: "1rem", fontWeight: 700 }}>
            {pdfPreview?.label || "Document"}
            {detail?.bookingCode ? ` — ${detail.bookingCode}` : ""}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ padding: 0, height: "80vh" }}>
          {pdfPreview?.url ? (
            <iframe
              key={pdfPreview.url}
              src={pdfPreview.url}
              title={pdfPreview.label || "PDF preview"}
              style={{
                width: "100%",
                height: "100%",
                border: "none",
                display: "block",
              }}
            />
          ) : (
            <div className="text-center text-muted py-5">No PDF loaded.</div>
          )}
        </Modal.Body>
        <Modal.Footer>
          {pdfPreview?.url && (
            <>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() =>
                  window.open(pdfPreview.url, "_blank", "noopener,noreferrer")
                }
              >
                Open in new tab
              </Button>
              <Button
                variant="outline-primary"
                size="sm"
                as="a"
                href={pdfPreview.url}
                download={`LongStayBooking_${bookingId}_${
                  pdfPreview.type || "document"
                }.pdf`}
              >
                Download
              </Button>
            </>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPdfPreview(null)}
          >
            Close
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Resend Mail to Agent — preview + send ────────────────────────
          Opens on the RESEND MAIL TO AGENT button click. Shows the Voucher
          PDF the mail will attach inside an <iframe>, and an editable email
          field pre-populated with the agent's on-file address. The Send
          button POSTs /api/longStayBooking/:id/resend-mail?email=…
          and toasts success/failure. */}
      <Modal
        show={showResendMailModal}
        onHide={() => (resendingMail ? null : setShowResendMailModal(false))}
        size="xl"
        centered
        backdrop="static"
        keyboard={!resendingMail}
      >
        <Modal.Header closeButton={!resendingMail}>
          <Modal.Title style={{ fontSize: "1rem", fontWeight: 700 }}>
            Resend {resendDocLabel} to Agent
            {detail?.bookingCode ? ` — ${detail.bookingCode}` : ""}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ padding: 0, height: "80vh" }}>
          {resendMailPreparing ? (
            <div className="d-flex align-items-center justify-content-center h-100">
              <Spinner animation="border" variant="primary" />
              <span className="ms-2 text-muted">
                Preparing {resendDocLabel.toLowerCase()} attachment…
              </span>
            </div>
          ) : resendMailPdfUrl ? (
            <iframe
              key={resendMailPdfUrl}
              src={resendMailPdfUrl}
              title={`${resendDocLabel} preview`}
              style={{
                width: "100%",
                height: "100%",
                border: "none",
                display: "block",
              }}
            />
          ) : (
            <div className="d-flex align-items-center justify-content-center h-100 text-muted small px-4 text-center">
              Voucher preview unavailable. You can still send the mail — the
              backend will regenerate the attachment on dispatch.
            </div>
          )}
        </Modal.Body>
        <Modal.Footer className="d-flex align-items-center gap-2 flex-wrap">
          <Form.Group
            className="flex-grow-1 me-2"
            style={{ minWidth: 260, maxWidth: 420 }}
          >
            <Form.Label
              className="fw-semibold mb-1"
              style={{ fontSize: "0.8rem" }}
            >
              Agent Email <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              type="email"
              size="sm"
              placeholder="name@example.com"
              value={resendMailEmail}
              onChange={(e) => {
                setResendMailEmail(e.target.value);
                if (resendMailEmailError) setResendMailEmailError("");
              }}
              isInvalid={!!resendMailEmailError}
              disabled={resendingMail || resendMailPreparing}
            />
            <Form.Control.Feedback type="invalid">
              {resendMailEmailError}
            </Form.Control.Feedback>
          </Form.Group>
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => setShowResendMailModal(false)}
            disabled={resendingMail}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={submitResendMail}
            disabled={resendingMail || resendMailPreparing}
          >
            {resendingMail ? (
              <>
                <Spinner size="sm" className="me-2" />
                Sending…
              </>
            ) : (
              "Send"
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
