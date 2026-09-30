import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  Container,
  Row,
  Col,
  Spinner,
  Table,
  Modal,
  Button,
  Form,
} from "react-bootstrap";
import { FaExclamationCircle } from "react-icons/fa";
import {
  FaHistory, FaMapMarkerAlt, FaNetworkWired, FaCalendarAlt, FaClock,
  FaUserAlt, FaPlusCircle, FaCheckCircle, FaSyncAlt, FaTimesCircle,
} from "react-icons/fa";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import toast from "react-hot-toast";
// Reuses the "Select Payment Gateway" card-style radio styles (.pg-option*)
// defined for HotelBookingPage.jsx's CC Avenue picker, so this page's
// reconfirm-flow picker matches it exactly.
import "../../styles/HotelBookingPage.css";

// Reverse-geocode browser coordinates to a readable address for the
// Booking History audit trail. Tries OpenStreetMap Nominatim first
// (street-level detail), then BigDataCloud (locality-level, keyless).
// Returns null when neither responds so the caller keeps its IP-derived
// fallback. Mirrors the same helper in HotelBookingPage.jsx.
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

// Purpose-based colour variants for the action buttons. They reuse the exact
// BUTTON_STYLE shape (size / padding / radius / white text) so the design
// system stays consistent — only the background colour changes, purely to
// improve visual distinction. No behaviour, handler, or guard is affected.
//   success → Confirm / Reconfirm      danger    → Cancel
//   primary → Add / Edit / Update      info      → Voucher / Invoice docs
//   neutral → View / Back / Resend     accent    → Notes / Remarks
const BTN_SUCCESS = { ...BUTTON_STYLE, backgroundColor: "#16a34a" }; // Confirm
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

// Booking types offered by "ADD NEW ITEM" (amendment / sub-booking). Each is
// launched through its OWN existing create flow with ?parentBookingCode set —
// no create logic is changed. Hotel & 24 Hour use the existing hotel
// parent-child mechanism (they surface via booking.subBookings); the rest are
// linked + displayed through the additive /api/booking-amendment-link feature.
// Scope: room-stay family (Honeymoon & Ayurveda excluded — no detail page).
// Substrings the BE writes on bookings whose credit deduction was
// DEFERRED to Reconfirm. Three matrix cases set them at create:
//   • Case 3: voucherGenerated = "On Reconfirmation"          (has credit + Voucher Later)
//   • Case 5: voucherGenerated = "On Reconfirmation/ Credit Card" (no credit + Voucher Later)
//   • Case 6: voucherGenerated = "Yes/On Credit Card"         (no credit + Voucher Now)
//
// Cases 1/2 use voucherGenerated="Yes" — credit was already deducted at
// create, so they MUST NOT match here (we'd double-charge). The two
// substrings below collectively identify the three deferred cases
// without hitting Cases 1/2.
const DEFERRED_CREDIT_VOUCHER_TOKENS = ["On Reconfirmation", "Credit Card"];

const voucherIndicatesDeferredCredit = (vg) => {
  if (!vg) return false;
  const s = String(vg);
  return DEFERRED_CREDIT_VOUCHER_TOKENS.some((t) => s.includes(t));
};

// Resolve a human-readable Payment Mode label from whatever shape the
// backend sends. Mirrors HotelBookingList.getPaymentModeLabel so the
// detail view and the list agree on wording for every persisted value
// ("CREDITLIMIT" / "ONLINE" / "CASH" / "CARD" + legacy aliases). Boolean
// fallbacks kept for rows that pre-date the paymentMode string column.
/**
 * Refund status to show for the booking as a whole.
 *
 * `booking.refundStatus` is a single value the create flow sets to
 * "Non-Refundable" as soon as ANY room is (GrnHotelBookingService). On a GRN
 * NON-BUNDLED booking each room carries its own cancellation policy, so that
 * one label described the whole booking as non-refundable when only one room
 * was — the refundable rooms looked unrefundable.
 *
 * When the rooms carry their own policies (GRN only today) they are the truth:
 * show the shared status if they agree, and say "Mixed" if they do not, so the
 * per-room cards below are read rather than the summary.
 */
const getRefundStatusLabel = (booking) => {
  const rooms = Array.isArray(booking?.rooms) ? booking.rooms : [];
  const perRoom = rooms
    .map((r) => r?.refundStatus || r?.refundCategory)
    .filter((v) => v != null && String(v).trim() !== "");
  if (perRoom.length === 0) return booking?.refundStatus || "-";
  const distinct = [...new Set(perRoom.map((v) => String(v).trim()))];
  if (distinct.length === 1) return distinct[0];
  return `Mixed — ${distinct.join(" / ")} (see per-room policy)`;
};

const getPaymentModeLabel = (booking) => {
  const raw =
    booking?.paymentMode ||
    booking?.payment_mode ||
    booking?.paymentType ||
    "";
  const norm = String(raw).trim().toUpperCase();
  if (
    norm === "CREDIT" ||
    norm === "CREDIT_LIMIT" ||
    norm === "CREDIT LIMIT" ||
    norm === "CREDITLIMIT"
  ) {
    return "Credit Limit Payment";
  }
  if (norm === "ONLINE" || norm === "ONLINE_PAYMENT" || norm === "ONLINE PAYMENT") {
    return "Online Payment";
  }
  if (norm) return raw;
  if (booking?.creditLimitPayment === true) return "Credit Limit Payment";
  if (booking?.paidOnline === true || booking?.onlinePayment === true) {
    return "Online Payment";
  }
  return "-";
};

// Online-payment gateways — mirrors HotelBookingPage so an operator gets the
// same payment picker whether the deduction is settled at create or at
// reconfirm time. CC Avenue is real (see the "Proceed to Pay" handler below);
// the rest are still the dummy placeholder flow.
const PAYMENT_GATEWAYS = [
  { id: "ccavenue", name: "CC Avenue", desc: "Cards, UPI, Net Banking" },
 ];

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

const parseLocal = (str) => {
  if (!str) return null;
  const normalized = str.includes("T") ? str : `${str}T00:00:00`;
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
};

const formatDate = (dateStr) => {
  const d = parseLocal(dateStr);
  if (!d) return "-";
  const day = String(d.getDate()).padStart(2, "0");
  const mon = String(d.getMonth() + 1).padStart(2, "0");
  return `${day} ${d.toLocaleString("default", { month: "short" })} ${d.getFullYear()}`;
};

const formatDateTime = (dateStr) => {
  const d = parseLocal(dateStr);
  if (!d) return "-";
  const hrs = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const sec = String(d.getSeconds()).padStart(2, "0");
  return `${formatDate(dateStr)} ${hrs}:${min}:${sec}`;
};

// Time-only formatter (HH:MM:SS) for the History modal, which shows Date and
// Time in separate columns. Returns "-" when the value is missing/unparseable.
const formatTimeOnly = (dateStr) => {
  const d = parseLocal(dateStr);
  if (!d) return "-";
  const hrs = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const sec = String(d.getSeconds()).padStart(2, "0");
  return `${hrs}:${min}:${sec}`;
};

const StatusBadge = ({ status }) => {
  // Each part of the status is coloured on its own. For a combined label
  // like "Confirmed/Cancelled" the "Confirmed" word shows green and the
  // "Cancelled" word shows red — so only the cancelled portion is red.
  // Confirmed / ReConfirmed → green, Cancelled → red, On Request → orange.
  const colorFor = (part) => {
    const p = (part || "").trim().toUpperCase();
    if (p.startsWith("CONFIRMED") || p.startsWith("RECONFIRMED")) return "#16a34a";
    if (p.startsWith("CANCELLED")) return "#dc2626";
    if (p === "ON REQUEST") return "#e67e22";
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

export default function BookingDetailedView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  /* Related notes (added via the dedicated /notes page).
     Shown read-only on this detail view so reviewers can see them
     without leaving. Note shape: { noteId, noteText, createdBy, createdAt } */
  const [bookingNotes, setBookingNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);

  // Role gate for admin-only actions (currently: "Send Email" on the
  // PDF preview modal). Matches the convention used on HotelBookingPage.
  const activeUserRole = localStorage.getItem("currentActiveRole");
  const isAdmin = String(activeUserRole || "").toUpperCase() === "ADMIN";
  const isSuperAdmin =
    String(activeUserRole || "").toUpperCase() === "SUPER_ADMIN";
  // Confirming an On-Request booking (step 1 of the two-step On Request
  // flow — moves the row from tentative to "On Request/Confirmed") is a
  // supplier-facing action agents must not perform on their own. Admin /
  // super-admin retain full control. Reconfirming a NON-On-Request booking
  // (or step 2 of the On Request flow after admin already confirmed step 1)
  // is unaffected — those keep the existing agent-visible RECONFIRM button.
  const canConfirmOnRequest = isAdmin || isSuperAdmin;

  // Agent-role gate (UI visibility only). Some actions — Booking Remark,
  // Notes, Confirmation No. — are internal/admin-facing and are hidden from
  // Agent logins. currentActiveRole isn't set for single-role logins, so fall
  // back to userRole (same convention as HotelSearch.jsx isAgentRole). This
  // changes visibility only; no API/flow/permission behaviour is affected.
  const activeRole = String(activeUserRole || "").trim().toUpperCase();
  const storedRoles = String(
    localStorage.getItem("userRole") || "",
  ).toUpperCase();
  const isAgentRole = activeRole
    ? activeRole === "AGENT"
    : storedRoles.includes("AGENT") && !storedRoles.includes("ADMIN");

  // ── Action-button modal / handler state (ported from HotelBookingList) ──
  // Cancel
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellingBooking, setCancellingBooking] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  // Ticked by the operator when cancelling past the free-cancellation
  // deadline; sent to the backend, which refuses that cancel without it.
  const [acceptCancellationCharges, setAcceptCancellationCharges] =
    useState(false);

  // Reconfirm (Confirm / Reject popup)
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmingBooking, setConfirmingBooking] = useState(false);

  // Reject (follow-up modal from Reconfirm → Reject)
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectedBy, setRejectedBy] = useState("");
  const [rejectedByError, setRejectedByError] = useState("");
  const [rejectionRemarks, setRejectionRemarks] = useState("");
  const [rejectingBooking, setRejectingBooking] = useState(false);

  // Update Book Status (PATCH confirmation-status with Agent LPO)
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

  // Notes — viewed and added in a modal on this page (replaces the separate
  // /notes navigation). Uses the existing GET/POST endpoints unchanged.
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Booking History — read-only modal listing the lifecycle events that have
  // actually occurred (Created / Confirmed / Reconfirmed / Cancelled). Derived
  // entirely from the booking detail already loaded; no extra API call.
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Resend Mail to Agent — clicking the button opens a preview modal that
  // shows the Voucher PDF in an iframe and lets the admin confirm / edit
  // the agent's email before the /resend-mail POST fires.
  const [resendingMail, setResendingMail] = useState(false);
  const [showResendMailModal, setShowResendMailModal] = useState(false);
  const [resendMailPdfUrl, setResendMailPdfUrl] = useState("");
  const [resendMailEmail, setResendMailEmail] = useState("");
  const [resendMailEmailError, setResendMailEmailError] = useState("");
  const [resendMailPreparing, setResendMailPreparing] = useState(false);

  // Send Document Email — generic modal used by Voucher / Invoice
  // / Proforma buttons to email the document to a custom address.
  const [showSendEmailModal, setShowSendEmailModal] = useState(false);
  const [sendEmailDocType, setSendEmailDocType] = useState(null); // VOUCHER | PROFORMA_VOUCHER | INVOICE | PROFORMA_INVOICE
  const [sendEmailDocLabel, setSendEmailDocLabel] = useState("");
  const [sendEmailRecipient, setSendEmailRecipient] = useState("");
  const [sendEmailNote, setSendEmailNote] = useState("");
  const [sendEmailError, setSendEmailError] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  // PDF generation feedback
  const [generatingPdfType, setGeneratingPdfType] = useState(null);
  // In-page PDF preview state. When non-null, the modal at the bottom of
  // the page renders the PDF in an iframe instead of triggering a
  // download. Shape: { url: string, label: string, type: string }.
  const [pdfPreview, setPdfPreview] = useState(null);

  // ── Online Payment Required (deferred-credit Reconfirm) ──────────
  // When a booking was created via the "no-credit + Voucher Later" path
  // (BE Case 5, voucherGenerated = "On Reconfirmation/ Credit Card") and
  // the agent STILL has no credit at Reconfirm time, we surface the same
  // Online Payment Required modal + gateway picker that the create flow
  // uses on HotelBookingPage. After payment the user is sent back here
  // with location.state.resumeReconfirm = true and the reconfirm
  // completes automatically. Scope: hotel detail Reconfirm only — no
  // other action / booking type touched.
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [insufficientAmount, setInsufficientAmount] = useState(0);
  const [showGatewayModal, setShowGatewayModal] = useState(false);
  const [selectedGateway, setSelectedGateway] = useState("");
  // Per-agent "Card" payment-mode gate (mirrors the AgentView checkbox).
  // Fetched on mount so the deferred-credit Reconfirm flow can block
  // agents who have neither credit nor card enabled — see confirmBooking.
  const [agentCardPaymentEnabled, setAgentCardPaymentEnabled] = useState(false);
  // Block-reconfirm modal shown when the deferred-credit Reconfirm hits
  // insufficient credit AND the agent has Card payment disabled — same
  // "no viable payment path" idea as HotelBookingPage's create flow.
  const [showNoPaymentPathModal, setShowNoPaymentPathModal] = useState(false);

  // Operator location snapshot for the Booking History audit trail. Resolved
  // once on mount and sent on the reconfirm-status PATCH body so the BE can
  // stamp confirmed_location / reconfirmed_location the same way the Create
  // flow stamps booking_location. The IP is NOT resolved here — browsers only
  // see the shared public/NAT IP; BookingConfirmationController fills it in
  // from the HTTP request itself. Same two-step resolution as
  // HotelBookingPage.jsx: coarse IP-derived city first, precise geolocation
  // second (only if it lands and permission is granted).
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

  // ── Add New Item (amendment) selection modal + cross-type sub-bookings ──
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [selectedAddItemType, setSelectedAddItemType] = useState(
    ADD_NEW_ITEM_TYPES[0].key,
  );
  // Cross-type children recorded via /api/booking-amendment-link (Long Stay,
  // Day Stay, Gov Employee, Student, Senior Citizen). Hotel/24hr children
  // still come through booking.subBookings and are unaffected.
  const [amendmentLinks, setAmendmentLinks] = useState([]);

  const fetchBooking = useCallback(() => {
    if (!id) return;
    setLoading(true);
    return axiosInstance
      .get(`/api/hotel-booking/${id}`)
      .then((res) => {
        if (res.data?.success) {
          setBooking(res.data);
        } else {
          toast.error(res.data?.message || "Failed to load booking details");
        }
      })
      .catch(() => toast.error("Error loading booking details"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchBooking();
  }, [fetchBooking]);

  /* Fetch related notes. Endpoint shape:
       { notes: [{ noteId, noteText, createdBy, createdAt }] }
     Wrapped in a callable so the NOTES modal's save handler can refresh the
     list inline. Silently sets an empty list on failure so the rest of the
     page is unaffected if the notes endpoint is unavailable. */
  const fetchBookingNotes = useCallback(() => {
    if (!id) return undefined;
    setNotesLoading(true);
    return axiosInstance
      .get(`/api/hotel-booking/${id}/notes`)
      .then((res) => {
        if (res.data && res.data.success !== false) {
          setBookingNotes(Array.isArray(res.data.notes) ? res.data.notes : []);
        } else {
          setBookingNotes([]);
        }
      })
      .catch(() => setBookingNotes([]))
      .finally(() => setNotesLoading(false));
  }, [id]);

  useEffect(() => {
    fetchBookingNotes();
  }, [fetchBookingNotes]);

  /* Cross-type amendment children (Long Stay / Day Stay / Gov / Student /
     Senior), keyed off the PRIMARY booking code — same value ADD NEW ITEM
     uses as the parent. Read-only; failures leave the list empty so nothing
     else on the page is affected. Hotel/24hr children are NOT fetched here;
     they continue to render from booking.subBookings. */
  const amendmentParentCode = booking?.parentBookingCode || booking?.bookingCode;
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

  // ── Status helpers ─────────────────────────────────────────────────
  const normalizedStatus = String(booking?.confirmationStatus || "")
    .replace(/\s+/g, "")
    .toUpperCase();
  // A non-On-Request booking that was already "Confirmed" before this
  // reconfirm gets the compound BE label "Confirmed / ReConfirmed" (see
  // BookingConfirmationServiceImpl) instead of a bare "ReConfirmed" — so an
  // exact-equality check here misses it and leaves the RECONFIRM button
  // showing forever after a legitimate reconfirm. "RECONFIRMED" never
  // appears as a substring of any other status (CONFIRMED/CANCELLED/
  // REJECTED/COMPLETED), so .includes is a safe, unambiguous test.
  const isReconfirmed = normalizedStatus.includes("RECONFIRMED");
  const isCancelled = normalizedStatus === "CANCELLED";
  // When cancelled, surface the status the booking held just before
  // cancellation (e.g. "ReConfirmed/Cancelled" / "Confirmed/Cancelled") so the
  // prior state isn't lost. Falls back to a plain "Cancelled" for rows
  // cancelled before this was captured (cancelledFromStatus null).
  // "On Request" bookings are stamped CONFIRMED by the status engine so they
  // can follow the reconfirm → ReConfirmed flow, but they must DISPLAY their
  // "On Request" origin rather than the engine's internal status. This is a
  // display-only override keyed off roomStatus — the underlying
  // confirmationStatus / bookingStatus that drive the confirm & voucher flows
  // are left untouched. For an On Request booking we surface:
  //   • still tentative (CONFIRMED)  → "On Request"
  //   • reconfirmed   (RECONFIRMED)  → "On Request/Reconfirmed"
  //   • cancelled     (CANCELLED)    → "On Request/Cancelled"
  // Non-On-Request bookings are unaffected and keep their existing labels.
  const isOnRequestRoom = /^on\s*request$/i.test(
    String(booking?.roomStatus || "").trim(),
  );
  // On Request two-step flow (backend-driven). An On Request booking moves
  // through THREE display steps:
  //   1. created        → engine CONFIRMED, onRequestConfirmed=false → "On Request"
  //   2. after Confirm   → engine CONFIRMED, onRequestConfirmed=true  → "On Request/Confirmed"
  //   3. after Reconfirm → engine RECONFIRMED                        → "On Request/Confirmed/Reconfirmed"
  // The onRequestConfirmed flag (additive, On Request only) is what
  // distinguishes step 1 from step 2 — both sit on engine CONFIRMED. It
  // persists through cancellation so the cancelled label can preserve history.
  const isOnRequestConfirmedStep =
    isOnRequestRoom && Boolean(booking?.onRequestConfirmed);
  const cancelledPrior = String(booking?.cancelledFromStatus || "")
    .replace(/\s+/g, "")
    .toUpperCase();
  const displayStatus = isCancelled
    ? isOnRequestRoom
      ? cancelledPrior === "RECONFIRMED"
        ? "On Request/Confirmed/Reconfirmed/Cancelled"
        : booking?.onRequestConfirmed
        ? "On Request/Confirmed/Cancelled"
        : "On Request/Cancelled"
      : booking?.cancelledFromStatus
      ? `${booking.cancelledFromStatus}/Cancelled`
      : booking?.confirmationStatus
    : isOnRequestRoom && normalizedStatus === "RECONFIRMED"
    ? "On Request/Confirmed/Reconfirmed"
    : isOnRequestRoom && normalizedStatus === "CONFIRMED"
    ? isOnRequestConfirmedStep
      ? "On Request/Confirmed"
      : "On Request"
    : // On Request bookings that were rejected via the Reject button —
      // surface the origin in the compound label ("On Request/Rejected")
      // instead of a bare "Rejected", mirroring the "Confirmed/Reconfirmed"
      // pattern used for the confirm flow. Display-only — the backend's
      // Reject flow (confirmationStatus="Rejected", engine sync, HotelCustomer
      // reject metadata) is untouched.
      isOnRequestRoom && normalizedStatus === "REJECTED"
    ? "On Request/Rejected"
    : booking?.confirmationStatus;
  // Agent Reference and Confirmation Number can only be SAVED once the
  // booking is confirmed-or-better; before that the booking is still
  // tentative and these fields don't apply yet.
  const isConfirmedOrLater =
    normalizedStatus === "CONFIRMED" ||
    normalizedStatus.includes("RECONFIRMED") ||
    normalizedStatus === "COMPLETED";
  // A booking still in the pending "On Request" display state is NOT a real
  // confirmation yet — the status engine only stamps it CONFIRMED so it can
  // travel the reconfirm flow (see displayStatus above). Agent Reference and
  // Confirmation No. must stay locked while it sits in this state; they become
  // available again once it is actually reconfirmed (RECONFIRMED) or for any
  // genuinely Confirmed/ReConfirmed booking. Display-only gate — no API/flow
  // change.
  // "Pending" = the INITIAL On Request step only (before the first Confirm).
  // This is the state that shows the CONFIRM button, hides Proforma docs, and
  // locks Agent Reference / Confirmation No. Once Confirmed (onRequestConfirmed
  // true) the booking behaves like a normal Confirmed booking: RECONFIRM button,
  // Proforma available, fields unlocked.
  const isOnRequestPending =
    isOnRequestRoom &&
    normalizedStatus === "CONFIRMED" &&
    !booking?.onRequestConfirmed;
  // Final Voucher / Invoice vs their Proforma equivalents, per the
  // client's confirm-booking flowchart:
  //   • CONFIRMED  → still tentative ("if not reconfirmed, auto-cancel on
  //                  deadline") → show RECONFIRM + Proforma Voucher /
  //                  Proforma Invoice.
  //   • RECONFIRMED→ finalised → show the real Voucher / Invoice (no
  //                  Reconfirm). COMPLETED keeps final docs too.
  // Cancelled bookings keep the final-doc buttons via the isCancelled branch.
  const showsFinalDocs = isReconfirmed || normalizedStatus === "COMPLETED";
  // For a CANCELLED booking the live status is just "CANCELLED", so the
  // doc variant (final Voucher/Invoice vs Proforma) and whether Agent
  // Reference / Confirmation No. can be added are governed by the status the
  // booking held BEFORE cancellation (cancelledFromStatus). These mirror
  // showsFinalDocs / isConfirmedOrLater but read that pre-cancellation status.
  const priorStatus = String(booking?.cancelledFromStatus || "")
    .replace(/\s+/g, "")
    .toUpperCase();
  const cancelledShowsFinalDocs =
    priorStatus === "RECONFIRMED" || priorStatus === "COMPLETED";
  const cancelledFromConfirmedOrLater =
    priorStatus === "CONFIRMED" ||
    priorStatus === "RECONFIRMED" ||
    priorStatus === "COMPLETED";

  // Mirrors the backend rule at HotelBookingController.resendMailToAgent:
  //   useFinalVoucher = reconfirmed || completed || cancelled
  // so the preview PDF the modal fetches (via /pdf?type=…) and the copy the
  // modal shows are always the exact document that will actually be emailed.
  // A CONFIRMED (still-tentative) booking resends the Proforma Voucher; once
  // it has been ReConfirmed / Completed — or is Cancelled — it resends the
  // real Voucher.
  const resendUsesFinalDoc =
    isCancelled || isReconfirmed || normalizedStatus === "COMPLETED";
  const resendDocLabel = resendUsesFinalDoc
    ? "Voucher"
    : "Hotel Booking Proforma Voucher";
  const resendDocType = resendUsesFinalDoc ? "VOUCHER" : "PROFORMA_VOUCHER";
  // const isCancellationAllowed =
  //   String(booking?.refundStatus || "").toLowerCase() !== "non-refundable";

  // Cancel button gate: cancellation isn't allowed once the stay has started.
  // Compares the CURRENT date/time against the booking's Check-In Date. Falls
  // back to false (allow cancel) if the date is missing/unparseable so the
  // button keeps working as before for legacy/in-flight data.
  const isPastCheckIn = (() => {
    const raw = booking?.checkInDate;
    if (!raw) return false;
    const checkIn = new Date(
      String(raw).includes("T") ? raw : `${raw}T00:00:00`,
    );
    if (isNaN(checkIn.getTime())) return false;
    return new Date().getTime() > checkIn.getTime();
  })();

  // ── Action handlers (ported from HotelBookingList.jsx) ─────────────
  // Cancel
  const openCancelModal = () => {
    setCancellationReason("");
    setAcceptCancellationCharges(false);
    setShowCancelModal(true);
  };

  /**
   * True when this booking is past its free-cancellation deadline — the case
   * the backend used to refuse outright. Mirrors the backend's own test
   * (BookingCancellationServiceImpl): API bookings only, and never for a
   * non-refundable rate, whose deadline is stamped in the past at create time
   * and so is meaningless.
   */
  const isPastCancellationDeadline = (() => {
    if (!booking?.deadlineDate) return false;
    if (booking.apiBooking === false) return false;
    if (String(booking.refundStatus || "").toLowerCase() === "non-refundable") {
      return false;
    }
    const deadline = new Date(booking.deadlineDate);
    if (Number.isNaN(deadline.getTime())) return false;
    return new Date() > deadline;
  })();

  const cancelBooking = async () => {
    // Cancellation reason is now mandatory — the modal marks the field
    // with an asterisk + invalid state, and the "Yes, Cancel" button is
    // disabled when empty. Belt-and-braces guard here so a stray submit
    // (Enter key, programmatic call) can't sneak past.
    const reason = cancellationReason.trim();
    if (!reason) {
      toast.error("Please enter a cancellation reason.");
      return;
    }
    try {
      setCancellingBooking(true);
      // Booking History audit — BE stamps this onto cancelled_location.
      // May be null if the operator denied geolocation and the IP-derived
      // fallback also failed; the BE treats null as "no capture" and the
      // "Booking Cancelled" history row renders "-".
      const params = { reason, bookingLocation: operatorLocation };
      // Only sent when it actually applies, so nothing changes for a booking
      // still inside its free-cancellation window.
      if (isPastCancellationDeadline) {
        params.acceptCancellationCharges = acceptCancellationCharges;
      }
      const response = await axiosInstance.delete(
        `/api/hotel-booking/${id}/cancel`,
        { params },
      );
      if (
        response.data &&
        response.data.success &&
        response.data.confirmationStatus === "Cancelled"
      ) {
        setShowCancelModal(false);
        setCancellationReason("");
        setAcceptCancellationCharges(false);
        // Atharva certification bug #3 (Case 3): once a booking has been
        // created AND cancelled, the ORIGINAL search's session artefacts
        // (tokenId / hKey / per-room rateKey) are stale — pricing and
        // availability may have changed and the vendor expects a fresh
        // search first. Clearing the cached booking + room-list payloads
        // here ensures that a "back to booking flow" attempt cannot
        // re-fire HPreBooking / HCreateBooking against the just-consumed
        // artefacts. Belt-and-braces: the backend also blocks the reuse
        // via its consumed-token guard, so this just gives the operator
        // a clean UX instead of a "please repeat the search" error.
        try {
          sessionStorage.removeItem("bookingData");
          sessionStorage.removeItem("roomListPayload");
        } catch (_) {
          /* sessionStorage may be blocked; not fatal. */
        }
        toast.success(response.data.message || "Booking cancelled");
        await fetchBooking();
      } else {
        toast.error(response.data?.message || "Failed to cancel booking.");
      }
    } catch (error) {
      console.error("Error cancelling booking:", error);
      toast.error(error.response?.data?.message || "Failed to cancel booking.");
    } finally {
      setCancellingBooking(false);
    }
  };

  // Reconfirm — also the entry point for the On Request first-step
  // "Confirm Booking". The button that calls this is already role-gated
  // (see canConfirmOnRequest); this second check is defence-in-depth so a
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

  // Does the booking carry a "deferred credit" marker on voucherGenerated
  // (Cases 3, 5, or 6 — see DEFERRED_CREDIT_VOUCHER_TOKENS above)? Only
  // these need the Reconfirm-time deduction + Online Payment pre-check.
  // Cases 1/2 (voucher = "Yes") were already deducted at create, so this
  // returns false for them and the pre-check is skipped.
  const isDeferredCreditBooking = voucherIndicatesDeferredCredit(
    booking?.voucherGenerated,
  );

  // Shared by runReconfirm() (below) and the CC Avenue post-payment resume
  // effect (further down) — both PATCH /confirmation-status and POST
  // /finalize-reconfirm return the same { message, success,
  // confirmationStatus } shape, so the success/failure handling only needs
  // to live once.
  const handleReconfirmResponse = async (data) => {
    if (data && data.success === true) {
      setShowConfirmModal(false);
      toast.success(data.message || "Booking reconfirmed successfully!");
      await fetchBooking();
    } else {
      toast.error(data?.message || "Failed to reconfirm booking.");
    }
  };

  // Actual reconfirm API call. Split out so the same call can be made
  // from (a) the Reconfirm modal's Confirm button when credit is fine,
  // and (b) the post-payment resume effect (after the operator pays
  // through the gateway picker).
  const runReconfirm = async () => {
    try {
      setConfirmingBooking(true);
      // RECONFIRM calls the same backend mutation that the existing
      // "Confirm Booking Status" flow uses on the list page —
      // PATCH /api/booking-confirmation/{id}/confirmation-status with
      // { confirmStatus: true }. The backend's
      // BookingConfirmationServiceImpl.updateConfirmationStatus sets
      // confirmationStatus = "ReConfirmed" and reconfirmation = true.
      // For deferred-credit bookings the BE also deducts the credit at
      // this point (we've already gated it behind the FE pre-check below).
      const response = await axiosInstance.patch(
        `/api/booking-confirmation/${id}/confirmation-status`,
        {
          action: "CONFIRM",
          confirmStatus: true,
          // Booking History audit — BE stamps this onto confirmed_location /
          // reconfirmed_location. May be null if the operator denied
          // geolocation and the IP-derived fallback also failed; the BE
          // treats null as "no capture" and the history row shows "-".
          bookingLocation: operatorLocation,
        },
      );
      await handleReconfirmResponse(response.data);
    } catch (error) {
      console.error("Error reconfirming booking:", error);
      toast.error(
        error.response?.data?.message ||
          "Failed to reconfirm booking. Please try again.",
      );
    } finally {
      setConfirmingBooking(false);
    }
  };

  // Reconfirm modal's "Reconfirm" button handler.
  //
  // The credit + card pre-check runs for TWO kinds of booking:
  //
  //   • Deferred-credit bookings (Cases 3/5/6 markers on voucherGenerated):
  //     ask the BE whether the agent has enough credit RIGHT NOW. If not,
  //     swap the Reconfirm modal out for the Online Payment Required modal
  //     — the operator pays through the gateway picker, returns here via
  //     location.state.resumeReconfirm = true, and the resume effect fires
  //     runReconfirm to actually complete the reconfirmation.
  //
  //   • On Request bookings — RECONFIRM step ONLY: the create matrix
  //     returns early for them (voucherGenerated never stamped), so they
  //     carry no deferred marker — but they also never had credit settled
  //     at create. Per spec these bookings are always allowed to be
  //     CREATED (HotelBookingPage lets them through even with no credit
  //     and no card) and their step-1 Confirm (isOnRequestPending, the
  //     supplier-response step) must also go through untouched. The
  //     no-payment-path gate applies only when the operator tries to
  //     RECONFIRM: no available credit AND Card disabled → the
  //     "Booking Cannot Be Completed" modal blocks the action.
  //
  // Every other booking (Cases 1/2 — credit already deducted at create,
  // non-refundable, etc.) skips the pre-check entirely and hits
  // runReconfirm directly — preserves the existing flow unchanged.
  const confirmBooking = async () => {
    // On Request step 2 (Reconfirm) — step 1 (Confirm, isOnRequestPending)
    // is deliberately NOT gated.
    const isOnRequestReconfirmStep = isOnRequestRoom && !isOnRequestPending;
    if (!isDeferredCreditBooking && !isOnRequestReconfirmStep) {
      await runReconfirm();
      return;
    }
    const agentIdNum = booking?.agentId
      ? Number(String(booking.agentId).trim())
      : null;
    const amount = Number(booking?.totalRate) || 0;
    if (!agentIdNum || amount <= 0) {
      // Missing data — fall back to the direct reconfirm; BE will log
      // a warn and proceed without deduction (same as the legacy path).
      await runReconfirm();
      return;
    }
    try {
      setConfirmingBooking(true);
      // Fetch the agent's card-payment flag alongside the credit check so
      // an insufficient-credit result can be routed straight to the block
      // modal when Card payment isn't enabled for this agent.
      const [credit, agentResp] = await Promise.all([
        axiosInstance.get(
          `/api/agent-credit-limit/check-sufficient-credit?agentId=${agentIdNum}&requiredAmount=${amount}`,
        ),
        axiosInstance
          .get(`/api/agent/${agentIdNum}`)
          .catch(() => ({ data: { cardPaymentEnabled: false } })),
      ]);
      const cardEnabled = !!agentResp?.data?.cardPaymentEnabled;
      setAgentCardPaymentEnabled(cardEnabled);
      if (credit.data === false) {
        // Insufficient credit. Applies to BOTH deferred-credit bookings
        // AND On Request bookings (Reconfirm step only — step-1 Confirm
        // never reaches this pre-check). Close the Reconfirm modal so
        // the follow-up modal owns the screen, and stamp the amount so
        // the block message / gateway page has it to display or charge.
        setInsufficientAmount(amount);
        setShowConfirmModal(false);
        // Card disabled at the agent level → no viable payment path,
        // block the action with the dedicated "Booking Cannot Be
        // Completed" modal instead of pushing the operator into an
        // online-payment flow they can't complete.
        if (!cardEnabled) {
          setShowNoPaymentPathModal(true);
          return;
        }
        // Card enabled → route into the Online Payment Required flow.
        // The operator pays through the gateway picker and returns with
        // resumeReconfirm=true, which fires runReconfirm to finish the
        // action. For deferred-credit bookings the BE settles the
        // deferred deduction on that reconfirm; for pure On Request
        // bookings (no deferred marker) the BE settle hook is a no-op —
        // the gateway payment itself is what covers the booking.
        setShowInsufficientModal(true);
        return;
      }
      // Sufficient — proceed with the actual reconfirm. The BE will
      // deduct the deferred credit as part of this same call.
      await runReconfirm();
    } catch (err) {
      console.error("Error checking credit before reconfirm:", err);
      // Fail open: if the credit-check call itself errors, fall through
      // to the existing reconfirm path so we don't trap the user.
      await runReconfirm();
    } finally {
      setConfirmingBooking(false);
    }
  };

  // Post-payment resume. The gateway page (/payment/:id) navigates back
  // here with state.resumeReconfirm = true once the operator finishes
  // the dummy card-entry flow. We strip the flag from history (so a
  // reload doesn't re-trigger), then fire runReconfirm to complete the
  // reconfirmation. The credit-deduction at the BE will succeed because
  // the gateway page (in production) would have topped up the agent's
  // available credit before navigating back.
  useEffect(() => {
    if (!location.state?.resumeReconfirm) return;
    if (!booking) return;
    // Clear the flag so it doesn't fire again on remount.
    navigate(location.pathname, { replace: true, state: {} });
    runReconfirm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.resumeReconfirm, booking]);

  // CC Avenue post-payment resume — mirrors HotelBookingPage.jsx. CC
  // Avenue's redirect is a real cross-domain browser navigation, so React
  // Router `state` (resumeReconfirm above) never survives it; the backend
  // instead appends ?ccavenueOrderId=&ccavenueStatus= to the URL when it
  // redirects back here (see CCAvenuePaymentServiceImpl.buildRedirect).
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const ccavenueOrderId = searchParams.get("ccavenueOrderId");
    const ccavenueStatus = searchParams.get("ccavenueStatus");
    if (!ccavenueOrderId) return;
    if (!booking) return;

    // Strip the query string so a reload doesn't re-trigger this.
    navigate(location.pathname, { replace: true, state: {} });

    (async () => {
      if (ccavenueStatus !== "success") {
        toast.error("Payment was not completed. Please try again.");
        return;
      }
      try {
        setConfirmingBooking(true);
        // Re-verify server-side before finalizing — never trust the
        // redirect's own query string alone.
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
        const response = await axiosInstance.post(
          `/api/payment/ccavenue/finalize-reconfirm/${ccavenueOrderId}`,
        );
        await handleReconfirmResponse(response.data);
      } catch (err) {
        console.error("Post-payment reconfirm finalize failed:", err);
        toast.error(
          err?.response?.data?.message ||
            "Payment succeeded but the booking could not be reconfirmed. Please contact support with your payment reference.",
        );
      } finally {
        setConfirmingBooking(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, booking]);

  // Reject flow: Reconfirm popup → "Reject" → opens this modal
  const openRejectModal = () => {
    setShowConfirmModal(false);
    setRejectedBy("");
    setRejectedByError("");
    setRejectionRemarks("");
    setShowRejectModal(true);
  };

  const rejectBooking = async () => {
    const rb = (rejectedBy || "").trim();
    if (!rb) {
      setRejectedByError("Rejected By is required");
      return;
    }
    setRejectedByError("");
    try {
      setRejectingBooking(true);
      const response = await axiosInstance.patch(
        `/api/booking-confirmation/${id}/confirmation-status`,
        {
          action: "REJECT",
          rejectedBy: rb,
          rejectionRemarks: (rejectionRemarks || "").trim() || null,
        },
      );
      if (response.data && response.data.success === true) {
        setShowRejectModal(false);
        toast.success(response.data.message || "Booking rejected.");
        await fetchBooking();
      } else {
        toast.error(response.data?.message || "Failed to reject booking.");
      }
    } catch (error) {
      console.error("Error rejecting booking:", error);
      toast.error(
        error.response?.data?.message ||
          "Failed to reject booking. Please try again.",
      );
    } finally {
      setRejectingBooking(false);
    }
  };

  // Agent Reference modal — uses dedicated endpoint POST
  // /api/booking-customer/{id}/agent-reference. On open, fetches the
  // currently saved value so the user can see and edit it.
  const openConfirmStatusModal = async () => {
    setConfirmAgentLpo("");
    setConfirmAgentLpoError("");
    setShowConfirmStatusModal(true);
    try {
      const res = await axiosInstance.get(
        `/api/booking-customer/${id}/agent-reference`,
      );
      const saved = res?.data?.agentLpo;
      if (saved) setConfirmAgentLpo(saved);
    } catch (err) {
      // Non-fatal: modal still opens; user can type a new value.
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
      const response = await axiosInstance.post(
        `/api/booking-customer/${id}/agent-reference`,
        { agentLpo: lpoTrimmed },
      );
      if (response.data && response.data.success) {
        setShowConfirmStatusModal(false);
        toast.success(
          response.data.message || "Agent Reference updated successfully",
        );
        await fetchBooking();
      } else {
        toast.error(
          response.data?.message || "Failed to update Agent Reference.",
        );
      }
    } catch (error) {
      console.error("Error updating Agent Reference:", error);
      toast.error(
        error.response?.data?.message ||
          "Failed to update Agent Reference. Please try again.",
      );
    } finally {
      setUpdatingConfirmationStatus(false);
    }
  };

  // Confirmation Number (reuses the same PATCH endpoint with a confirmationNumber field)
  const openConfirmationNoModal = async () => {
    setConfirmationNoInput("");
    setConfirmationNoError("");
    setShowConfirmationNoModal(true);
    // Pre-fill with the value already saved against this booking. The
    // backend booking-detail response carries the latest confirmationNumber
    // (also exposed via /api/booking-customer/{id}/agent-reference), so we
    // hit that endpoint to stay consistent with the Agent Reference flow.
    try {
      const res = await axiosInstance.get(
        `/api/booking-customer/${id}/agent-reference`,
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
      const response = await axiosInstance.patch(
        `/api/booking-confirmation/${id}/confirmation-status`,
        { action: "CONFIRMATION_NO", confirmationNumber: value },
      );
      if (response.data && response.data.success) {
        setShowConfirmationNoModal(false);
        toast.success(
          response.data.message || "Confirmation number saved successfully!",
        );
        await fetchBooking();
      } else {
        toast.error(
          response.data?.message || "Failed to save confirmation number.",
        );
      }
    } catch (error) {
      console.error("Error saving confirmation number:", error);
      toast.error(
        error.response?.data?.message ||
          "Failed to save confirmation number. Please try again.",
      );
    } finally {
      setSavingConfirmationNo(false);
    }
  };

  // Notes — open the add-note modal (existing notes are already listed in the
  // "Notes" card above; saving here refreshes that list inline).
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
      // Same endpoint + payload shape the standalone /notes page uses; nothing
      // about how notes are stored/retrieved is changed.
      const createdBy =
        localStorage.getItem("UserName") ||
        sessionStorage.getItem("UserName") ||
        "unknown";
      const res = await axiosInstance.post(
        `/api/hotel-booking/${id}/notes`,
        { noteText: text, createdBy },
      );
      if (res.data?.success) {
        toast.success(res.data?.message || "Note saved");
        setShowNotesModal(false);
        setNoteInput("");
        await fetchBookingNotes();
      } else {
        toast.error(res.data?.message || "Failed to save note");
      }
    } catch (e) {
      toast.error(e.response?.data?.message || "Failed to save note");
    } finally {
      setSavingNote(false);
    }
  };

  // Booking Remark (persisted as a booking note)
  const openRemarkModal = () => {
    setRemarkInput(booking?.remarks || "");
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
      // Save to HotelBooking.remarks (what the detail page's Remarks
      // section reads, and what the voucher template renders). The
      // separate /notes endpoint persists ad-hoc Related Notes which
      // are different from the Booking Remark.
      const response = await axiosInstance.post(
        `/api/hotel-booking/${id}/remark`,
        { remarks: text },
      );
      if (response.data && response.data.success !== false) {
        setShowRemarkModal(false);
        toast.success(response.data?.message || "Remark saved successfully");
        await fetchBooking();
      } else {
        toast.error(response.data?.message || "Failed to save remark.");
      }
    } catch (error) {
      console.error("Error saving remark:", error);
      toast.error(
        error.response?.data?.message ||
          "Failed to save remark. Please try again.",
      );
    } finally {
      setSavingRemark(false);
    }
  };

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
      const agentId = booking?.agentId
        ? Number(String(booking.agentId).trim())
        : null;
      const [docRes, agentRes] = await Promise.all([
        axiosInstance
          .get(`/api/bookings/${id}/pdf`, {
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
      const response = await axiosInstance.post(
        `/api/hotel-booking/${id}/resend-mail`,
        null,
        { params: { email } },
      );
      if (response.data && response.data.success !== false) {
        toast.success(
          response.data?.message || "Mail resent to agent successfully!",
        );
        setShowResendMailModal(false);
      } else {
        toast.error(response.data?.message || "Failed to resend mail.");
      }
    } catch (error) {
      console.error("Error resending mail to agent:", error);
      toast.error(
        error.response?.data?.message ||
          "Failed to resend mail to agent. Please try again.",
      );
    } finally {
      setResendingMail(false);
    }
  };

  // Send Document Email handlers
  const openSendEmailModal = (docType, label) => {
    setSendEmailDocType(docType);
    setSendEmailDocLabel(label);
    setSendEmailRecipient("");
    setSendEmailNote("");
    setSendEmailError("");
    setShowSendEmailModal(true);
  };

  const sendDocumentEmail = async () => {
    const email = (sendEmailRecipient || "").trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      setSendEmailError("Email is required");
      return;
    }
    if (!emailRegex.test(email)) {
      setSendEmailError("Enter a valid email address");
      return;
    }
    setSendEmailError("");
    try {
      setSendingEmail(true);
      const response = await axiosInstance.post(
        `/api/booking-document-email/${id}`,
        {
          email,
          docType: sendEmailDocType,
          note: (sendEmailNote || "").trim() || null,
        },
      );
      if (response.data && response.data.success === true) {
        toast.success(
          response.data.message || `${sendEmailDocLabel} sent to ${email}`,
        );
        setShowSendEmailModal(false);
      } else {
        toast.error(response.data?.message || "Failed to send document.");
      }
    } catch (error) {
      console.error("Error sending document email:", error);
      toast.error(
        error.response?.data?.message ||
          "Failed to send document. Please try again.",
      );
    } finally {
      setSendingEmail(false);
    }
  };

  // PDF preview — shared gateway. Used for Proforma Voucher / Proforma
  // Invoice / Voucher / Invoice. `type` matches the backend enum.
  // Per spec the PDF must render INSIDE this page (iframe modal) — not
  // as a download and not in a new tab. We pop a Bootstrap Modal with
  // a full-height <iframe src={pdfUrl}>, and offer an explicit
  // "Open in new tab" / "Download" affordance inside the modal for
  // users who still need it.
  const handleDownloadPdf = async (type, label) => {
    try {
      setGeneratingPdfType(type);
      const response = await axiosInstance.get(`/api/bookings/${id}/pdf`, {
        params: { type: type.toUpperCase() },
      });
      if (
        response.data &&
        response.data.status === "SUCCESS" &&
        response.data.pdfUrl
      ) {
        setPdfPreview({
          url: response.data.pdfUrl,
          label: label || type,
          type: type.toUpperCase(),
        });
      } else {
        toast.error(
          response.data?.message || `Failed to generate ${label || type}.`,
        );
      }
    } catch (error) {
      console.error(`Error generating ${type} PDF:`, error);
      toast.error(
        error.response?.data?.message || `Error generating ${label || type}.`,
      );
    } finally {
      setGeneratingPdfType(null);
    }
  };

  const totalRooms = booking?.rooms?.length ?? 0;
  const totalAdults =
    booking?.rooms?.reduce((s, r) => s + (r.adults || 0), 0) ?? 0;
  const totalChildren =
    booking?.rooms?.reduce((s, r) => s + (r.children || 0), 0) ?? 0;
  const totalGuests = totalAdults + totalChildren;
  // Display currency the booking was confirmed in. The backend returns the
  // code + converted total (displayAmount = totalRate × factor); derive the
  // factor and convert every AED figure. AED / older bookings → factor 1.
  const _dispCode = booking?.displayCurrencyCode;
  const _aedTotal = Number(booking?.totalRate) || 0;
  const _dispAmt = Number(booking?.displayAmount);
  const isConvertedCurrency =
    !!_dispCode &&
    _dispCode !== "AED" &&
    Number.isFinite(_dispAmt) &&
    _dispAmt > 0 &&
    _aedTotal > 0;
  const currencyCode = isConvertedCurrency ? _dispCode : "AED";
  const currencyFactor = isConvertedCurrency ? _dispAmt / _aedTotal : 1;
  const toDisplayAmount = (aed) => (Number(aed) || 0) * currencyFactor;

  // Booking lifecycle events for the History modal. Only events that have
  // actually occurred are included — each row is gated on its timestamp being
  // present, so e.g. a booking that was never reconfirmed/cancelled simply
  // omits those rows. "Performed By" reads the per-action username the backend
  // now records (createdBy / confirmedBy / reconfirmedBy / cancelledBy).
  // Historical rows created before that capture have those fields null, so they
  // fall back to "-" (Created additionally falls back to the creator label).
  // Sorted chronologically.
  const creatorLabel =
    booking?.createdBy ||
    booking?.employeeName ||
    booking?.agentName ||
    booking?.createdByRole ||
    booking?.source ||
    "-";
  const bookingHistory = (() => {
    if (!booking) return [];
    const events = [];
    // "Book & Voucher" reconfirms and vouchers inside the create call
    // itself, so the backend stamps confirmedDate and reconfirmedDate at
    // the very same instant. There was never a separate operator confirm
    // step to report: emitting both rows would show a phantom "Booking
    // Confirmed" for a booking that went straight to ReConfirmed.
    // "Book & Voucher Later" is reconfirmed later by an operator, so its
    // two timestamps differ — it is untouched by this and keeps the full
    // Created → Confirmed → Reconfirmed timeline.
    const confirmedTs = parseLocal(booking.confirmedDate)?.getTime();
    const reconfirmedTs = parseLocal(booking.reconfirmedDate)?.getTime();
    const bornReconfirmed =
      confirmedTs != null && reconfirmedTs != null && confirmedTs === reconfirmedTs;
    // Each event carries the resulting booking status right after that
    // action ran — surfaced in the new "Status" column so the History
    // modal reads as a lifecycle timeline (Confirmed → ReConfirmed →
    // Cancelled) instead of a bare action log. "On Request" bookings keep
    // their prefix so the created row shows "On Request" (not the generic
    // engine "Confirmed" the backend actually stamps in that case).
    const createdRowStatus = isOnRequestRoom
      ? "On Request"
      : bornReconfirmed
        ? "ReConfirmed"
        : "Confirmed";
    if (booking.bookingDate) {
      events.push({
        action: "Booking Created",
        status: createdRowStatus,
        at: booking.bookingDate,
        by: creatorLabel,
        // Captured at create time only — later lifecycle rows show "-".
        location: booking.bookingLocation,
        ip: booking.ipAddress,
      });
    }
    // Skipped for a born-reconfirmed booking (see bornReconfirmed above) —
    // its confirm and reconfirm are the same event, reported once below as
    // "Booking Reconfirmed".
    if (booking.confirmedDate && !bornReconfirmed) {
      events.push({
        action: "Booking Confirmed",
        // For an On Request row the "Confirmed" action is the step-1
        // supplier acknowledgement, so the status label reads
        // "On Request/Confirmed" to preserve the on-request origin.
        status: isOnRequestRoom ? "On Request/Confirmed" : "Confirmed",
        at: booking.confirmedDate,
        by: booking.confirmedBy || "-",
        // Per-action audit captured on the CONFIRM PATCH. Legacy rows
        // confirmed before this was captured have both null and render "-".
        location: booking.confirmedLocation,
        ip: booking.confirmedIp,
      });
    }
    if (booking.reconfirmedDate) {
      events.push({
        action: "Booking Reconfirmed",
        status: isOnRequestRoom
          ? "On Request/Confirmed/Reconfirmed"
          : "ReConfirmed",
        at: booking.reconfirmedDate,
        // A born-reconfirmed booking ("Book & Voucher") was reconfirmed
        // inside the create call itself, so this row IS the creation event:
        // operator, location and IP are by definition the ones captured at
        // create time. The backend now stamps the reconfirmed_* audit
        // columns on that path, but rows written before it did have them
        // null — inherit the create-time values so the two rows always
        // agree instead of rendering "-".
        // "Book & Voucher Later" is a genuine later operator action, so it
        // keeps its own reconfirm audit and falls back to "-" as before.
        by: booking.reconfirmedBy || (bornReconfirmed ? creatorLabel : "-"),
        location:
          booking.reconfirmedLocation ||
          (bornReconfirmed ? booking.bookingLocation : undefined),
        ip:
          booking.reconfirmedIp ||
          (bornReconfirmed ? booking.ipAddress : undefined),
      });
    }
    if (booking.cancelledAt) {
      events.push({
        action: "Booking Cancelled",
        status: "Cancelled",
        at: booking.cancelledAt,
        by: booking.cancelledBy || "-",
        // Per-action audit captured on the DELETE. Legacy rows cancelled
        // before this was captured have both null and render "-".
        location: booking.cancelledLocation,
        ip: booking.cancelledIp,
      });
    }
    return events.sort((a, b) => {
      const da = parseLocal(a.at)?.getTime() ?? 0;
      const db = parseLocal(b.at)?.getTime() ?? 0;
      return da - db;
    });
  })();

  const card = {
    border: "1px solid #ddd",
    borderRadius: "4px",
    marginBottom: "14px",
    overflow: "hidden",
    backgroundColor: "#fff",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4" style={{ overflow: "auto" }}>
          <Container fluid style={{ maxWidth: "1100px" }}>
            {/* Back button */}
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

            {loading ? (
              <div className="text-center py-5">
                <Spinner animation="border" style={{ color: "#c0392b" }} />
                <p className="mt-3 text-muted">Loading booking details...</p>
              </div>
            ) : !booking ? (
              <div className="text-center py-5 text-muted">
                Booking not found.
              </div>
            ) : (
              <>
                {/* ── 24-Hour Check-In highlight banner ────────────────
                     Surfaced above Booking Information so the operator
                     spots the special-flow status at a glance, with the
                     chosen times when present. Hidden entirely when the
                     booking is a normal stay. */}
                {booking.is24HourCheckin && (
                  <div
                    style={{
                      backgroundColor: "#fff8e1",
                      border: "1px solid #f5c518",
                      borderLeft: "6px solid #f5c518",
                      borderRadius: 4,
                      padding: "8px 12px",
                      marginBottom: 10,
                      fontSize: "0.85rem",
                      color: "#5b4500",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span
                      style={{
                        backgroundColor: "#f5c518",
                        color: "#000",
                        fontWeight: 700,
                        fontSize: "0.7rem",
                        padding: "2px 8px",
                        borderRadius: 3,
                        letterSpacing: 0.5,
                      }}
                    >
                      24-HOUR CHECK-IN
                    </span>
                    <span>
                      This booking was made via the 24-hour check-in flow.
                      {booking.checkInTime && (
                        <>
                          {" "}
                          Check-In: <strong>{booking.checkInTime}</strong>
                        </>
                      )}
                      {booking.checkOutTime && (
                        <>
                          {" "}
                          · Check-Out: <strong>{booking.checkOutTime}</strong>
                        </>
                      )}
                    </span>
                  </div>
                )}

                {/* ── Booking Info ─────────────────────────────────────── */}
                <div style={card}>
                  <div style={SECTION_HEADER}>
                    Booking Information
                    {booking.is24HourCheckin && (
                      <span
                        style={{
                          marginLeft: 8,
                          backgroundColor: "#f5c518",
                          color: "#000",
                          fontWeight: 700,
                          fontSize: "0.65rem",
                          padding: "2px 6px",
                          borderRadius: 3,
                        }}
                      >
                        24H
                      </span>
                    )}
                  </div>
                  <div style={{ padding: "12px 16px" }}>
                    <Row>
                      <Col md={6}>
                        <InfoRow
                          label="Booking Code"
                          value={booking.bookingCode}
                        />
                        <InfoRow label="Hotel Name" value={booking.hotelName} />
                        <InfoRow label="City" value={booking.city} />
                        <InfoRow label="Hotel Address" value={booking.address} />
                        <InfoRow label="Tel No" value={booking.telNo} />
                        <InfoRow
                          label="Star Rating"
                          value={
                            booking.starRating
                              ? `${booking.starRating} Star`
                              : "-"
                          }
                        />
                        <InfoRow
                          label="Check-In"
                          value={formatDateTime(booking.checkInDate)}
                        />
                        <InfoRow
                          label="Check-Out"
                          value={formatDateTime(booking.checkOutDate)}
                        />
                        <InfoRow
                          label="No. of Nights"
                          value={
                            booking.nights ? `${booking.nights} Nights` : "-"
                          }
                        />
                        {/* Booking timeline (part 1) — Booking Date and Confirmed
                            Date live on the LEFT column to balance the column
                            heights and keep them close to the stay-date block
                            above. Reconfirmed / Invoiced / Cancelled appear on
                            the right column directly under Status. Each row is
                            still gated on its backend value being present. */}
                        {booking.bookingDate && (
                          <InfoRow
                            label="Booking Date"
                            value={formatDateTime(booking.bookingDate)}
                          />
                        )}
                        {booking.confirmedDate && (
                          <InfoRow
                            label="Confirmed Date"
                            value={formatDateTime(booking.confirmedDate)}
                          />
                        )}
                      </Col>
                      <Col md={6}>
                        <InfoRow label="Agent" value={booking.agentName} />
                        {/* Supplier — which external API fulfilled this
                            booking (INHOUSE / IWTX / GRN / X3 / GOGLOBAL /
                            RATEHAWK / ATHARVA / DARINA / JUMEIRAH / JUNIPER).
                            ADMIN-only so agents never see it — mirrors the
                            "agent must never know the supplier" whitelabel
                            invariant applied on the All Bookings list. Non-
                            hotel-supplier rows fall back to "Inhouse" so the
                            cell never renders blank. */}
                        {(isAdmin || isSuperAdmin) && (
                          <InfoRow
                            label="Supplier"
                            value={booking.apiId || "Inhouse"}
                          />
                        )}
                        {/* Contact — "Booking done for" value entered on the
                            booking page, shown as "<value>/<agentName>". Only
                            rendered when a value was entered. */}
                        {booking.bookingDoneFor && (
                          <InfoRow
                            label="Contact"
                            value={
                              booking.agentName
                                ? `${booking.bookingDoneFor}/${booking.agentName}`
                                : booking.bookingDoneFor
                            }
                          />
                        )}
                        {/* <InfoRow label="Source" value={booking.source} />
                        <InfoRow label="Created By" value={booking.createdByRole} /> */}
                        {/* "Booking Done By Employee" picked in
                            HotelSearch — only rendered when an employee
                            was actually selected so unrelated bookings
                            don't show a stray dash row. */}
                        {booking.employeeName && (
                          <InfoRow
                            label="Booked By Employee"
                            value={booking.employeeName}
                          />
                        )}
                        {/* Supplier Ref. row hidden by request (showed a
                            meaningless "0" for inhouse bookings). */}
                        {/* Agent Reference + Confirmation No. — added via the
                            "ADD AGENT REFERENCE" / "CONFIRMATION NO." buttons.
                            Surface the saved values here so they're visible
                            once entered (blank shows "-"). */}
                        <InfoRow
                          label="Agent Reference"
                          value={booking.customer?.agentLpo}
                        />
                        <InfoRow
                          label="Confirmation No."
                          value={
                            booking.confirmationNumber ||
                            booking.customer?.confirmationNumber
                          }
                        />
                        <InfoRow
                          label="Deadline Date"
                          value={
                            booking.deadlineDate ? (
                              <span style={{ color: "#dc2626", fontWeight: 600 }}>
                                {`${booking.deadlineDate.slice(0, 10)} 02:00 PM (UAE)`}
                              </span>
                            ) : (
                              "-"
                            )
                          }
                        />
                        <InfoRow
                          label="Refund Status"
                          value={getRefundStatusLabel(booking)}
                        />
                        {/* Payment Mode — same source of truth the Booking
                            List uses (booking.paymentMode). Label helper is
                            shared (see getPaymentModeLabel at the top of
                            this file) so the wording — "Credit Limit
                            Payment" / "Online Payment" / raw fallback —
                            matches the list column exactly. Legacy rows
                            without paymentMode render as "-". */}
                        <InfoRow
                          label="Payment Mode"
                          value={getPaymentModeLabel(booking)}
                        />
                        <InfoRow
                          label="Voucher"
                          value={
                            // Display-only tidy: surface
                            // "On Reconfirmation/ Credit Card" as just
                            // "On Reconfirmation" — operators don't need
                            // the "/ Credit Card" trailer in the info
                            // card. The persisted value stays unchanged
                            // because both the FE deferred-credit
                            // pre-check and the BE Reconfirm-time
                            // deduction rely on it as a marker.
                            booking.voucherGenerated ===
                            "On Reconfirmation/ Credit Card"
                              ? "On Reconfirmation"
                              : booking.voucherGenerated
                          }
                        />
                        <InfoRow
                          label="Status"
                          value={<StatusBadge status={displayStatus} />}
                        />
                        {/* Booking timeline (part 2) — Reconfirmed / Invoiced /
                            Cancelled hang under Status here. Reconfirmed Date
                            and Invoiced Date intentionally read from the same
                            persisted column per spec. Each row is gated on its
                            backend value being present. */}
                        {booking.reconfirmedDate && (
                          <InfoRow
                            label="Reconfirmed Date"
                            value={formatDateTime(booking.reconfirmedDate)}
                          />
                        )}
                        {booking.reconfirmedDate && (
                          <InfoRow
                            label="Invoiced Date"
                            value={formatDateTime(booking.reconfirmedDate)}
                          />
                        )}
                        {booking.cancelledAt && (
                          <InfoRow
                            label="Cancelled Date"
                            value={formatDateTime(booking.cancelledAt)}
                          />
                        )}
                      </Col>
                    </Row>
                  </div>
                </div>

                {/* ── Guest / Customer Info ─────────────────────────── */}
                {booking.customer && (
                  <div style={card}>
                    <div style={SECTION_HEADER}>Guest Information</div>
                    <div style={{ padding: "12px 16px" }}>
                      <Row>
                        <Col md={6}>
                          <InfoRow
                            label="Guest Name"
                            value={
                              [
                                booking.customer.salutation,
                                booking.customer.firstName,
                                booking.customer.middleName,
                                booking.customer.lastName,
                              ]
                                .filter(Boolean)
                                .join(" ") || "-"
                            }
                          />
                          {/* <InfoRow label="Email" value={booking.customer.email} />
                          <InfoRow label="Phone" value={booking.customer.phone} /> */}
                        </Col>
                        <Col md={6}>
                          {/* <InfoRow label="Passport No." value={booking.customer.passportNo} /> */}
                          <InfoRow
                            label="Nationality"
                            value={booking.customer.customerNationality}
                          />
                          {/* <InfoRow label="Agent LPO" value={booking.customer.agentLpo} /> */}
                        </Col>
                      </Row>
                    </div>
                  </div>
                )}

                {/* ── Rooms Details ─────────────────────────────────── */}
                <div style={card}>
                  <div style={SECTION_HEADER}>Rooms Details</div>
                  <div style={{ padding: "10px 16px 4px" }}>
                    <span
                      style={{
                        color: "#c0392b",
                        fontWeight: "600",
                        fontSize: "0.85rem",
                        marginRight: "20px",
                      }}
                    >
                      No of Rooms - {totalRooms} Room
                      {totalRooms !== 1 ? "s" : ""}
                    </span>
                    <span
                      style={{
                        color: "#c0392b",
                        fontWeight: "600",
                        fontSize: "0.85rem",
                      }}
                    >
                      No of Guests - {totalAdults} Adult
                      {totalAdults !== 1 ? "s" : ""}
                      {totalChildren > 0
                        ? `, ${totalChildren} Child${totalChildren !== 1 ? "ren" : ""}`
                        : ""}
                    </span>
                  </div>

                  {(booking.rooms || []).map((room, idx) => (
                    <div
                      key={room.roomBookingId || idx}
                      style={{ padding: "8px 16px 12px" }}
                    >
                      <div
                        style={{
                          color: "#c0392b",
                          fontWeight: "700",
                          fontSize: "0.88rem",
                          marginBottom: "6px",
                        }}
                      >
                        Room {room.roomNo ?? idx + 1} -{" "}
                        <StatusBadge status={displayStatus} />
                      </div>
                      {/* GRN per-room cancellation policy saved at booking
                          time (bundled → same on every room; non-bundled →
                          each room differs). Hidden when the room carries
                          none (all other suppliers / flows). */}
                      {(room.refundStatus ||
                        (Array.isArray(room.cancellationPolicyLines) &&
                          room.cancellationPolicyLines.length > 0)) && (
                        <div
                          style={{
                            fontSize: "0.8rem",
                            border: "1px solid #eee",
                            borderRadius: 6,
                            padding: "6px 10px",
                            marginBottom: 6,
                            background:
                              room.refundCategory === "NON_REFUNDABLE"
                                ? "#fdecec"
                                : room.refundCategory === "PARTIALLY_REFUNDABLE"
                                  ? "#fff8e1"
                                  : "#e8f5ec",
                          }}
                        >
                          <div style={{ fontWeight: 600, marginBottom: 2 }}>
                            Cancellation policy: {room.refundStatus || "—"}
                            {room.freeCancellationUntil
                              ? ` · Free cancellation until ${room.freeCancellationUntil}`
                              : ""}
                          </div>
                          {(room.cancellationPolicyLines || []).map((line, li) => (
                            <div key={li} style={{ whiteSpace: "pre-line" }}>
                              • {line}
                            </div>
                          ))}
                          {room.noShowFeeText &&
                            !(room.cancellationPolicyLines || []).some((l) =>
                              /no-show/i.test(l),
                            ) && <div>• No-show fee: {room.noShowFeeText}.</div>}
                        </div>
                      )}
                      {/* Per-room Rate cell already shows the room's
                          billable rate. Per spec the Tourism Dirham
                          captured on the booking now flows into Rate and
                          Total Rate so the operator sees the FULL amount
                          the customer pays. TD is shared across the
                          booking, so we distribute it evenly across
                          rooms (rounded to 2 dp) for the per-row Rate
                          column — the totals row below still uses the
                          single, untouched booking-level TD value. */}
                      {(() => {
                        const roomCount = Array.isArray(booking.rooms)
                          ? booking.rooms.length
                          : 1;
                        const td = Number(booking.tourismDirham) || 0;
                        const tdShare = roomCount > 0 ? td / roomCount : 0;
                        const baseRate = Number(room.rate) || 0;
                        const rateWithTd = baseRate + tdShare;
                        return (
                          <Table
                            bordered
                            size="sm"
                            style={{ fontSize: "0.82rem", marginBottom: "6px" }}
                          >
                            <thead style={{ backgroundColor: "#f8f8f8" }}>
                              <tr>
                                <th>Room Category</th>
                                <th>Meal Type</th>
                                <th>Supplier Ref.</th>
                                <th>Adults</th>
                                <th>Children</th>
                                <th>Rate</th>
                                <th>Currency</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td>{room.roomCategory || "-"}</td>
                                <td>{room.mealPlan || "-"}</td>
                                <td>{booking.supplierReference || "-"}</td>
                                <td>{room.adults ?? "-"}</td>
                                <td>{room.children ?? "0"}</td>
                                <td>
                                  {room.rate != null
                                    ? toDisplayAmount(rateWithTd).toFixed(2)
                                    : "-"}
                                  {td > 0 && room.rate != null && (
                                    <div
                                      style={{
                                        fontSize: "0.68rem",
                                        color: "#888",
                                        fontWeight: 500,
                                        marginTop: 2,
                                      }}
                                    >
                                      ({toDisplayAmount(baseRate).toFixed(2)} +
                                      TD {toDisplayAmount(tdShare).toFixed(2)})
                                    </div>
                                  )}
                                </td>
                                <td>{currencyCode}</td>
                              </tr>
                            </tbody>
                          </Table>
                        );
                      })()}

                      {/* Room guests */}
                      {room.guests && room.guests.length > 0 && (
                        <div style={{ marginTop: "4px", marginBottom: "8px" }}>
                          <div
                            style={{
                              fontSize: "0.78rem",
                              fontWeight: "600",
                              color: "#555",
                              marginBottom: "4px",
                            }}
                          >
                            Room Guests:
                          </div>
                          <Table
                            bordered
                            size="sm"
                            style={{ fontSize: "0.78rem" }}
                          >
                            <thead style={{ backgroundColor: "#f8f8f8" }}>
                              <tr>
                                <th>#</th>
                                <th>Name</th>
                                <th>Type</th>
                              </tr>
                            </thead>
                            <tbody>
                              {room.guests.map((g, gi) => (
                                <tr key={g.guestId || gi}>
                                  <td>{gi + 1}</td>
                                  <td>
                                    {[g.salutation, g.firstName, g.lastName]
                                      .filter(Boolean)
                                      .join(" ") || "-"}
                                  </td>
                                  <td>
                                    {g.isChild
                                      ? `Child (Age: ${g.childAge ?? "-"})`
                                      : "Adult"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </Table>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Summary row */}
                  <div
                    style={{
                      padding: "8px 16px",
                      borderTop: "1px solid #eee",
                      fontSize: "0.85rem",
                      display: "flex",
                      gap: "24px",
                      color: "#333",
                    }}
                  >
                    {/* Total Rate now includes Tourism Dirham so the
                        amount shown here matches what's billed. The
                        original (pre-TD) total is retained as a small
                        hint underneath whenever TD > 0. */}
                    {(() => {
                      const baseTotal = Number(booking.totalRate) || 0;
                      const td = Number(booking.tourismDirham) || 0;
                      const grand = baseTotal + td;
                      // Supplier-native line — shown only when the supplier
                      // confirmed the booking in a currency other than what
                      // we're rendering (e.g. X3 confirms in USD, we show
                      // AED). Kept as a small aside so the primary AED total
                      // stays the visual anchor.
                      const nativeCurr = booking.supplierNativeCurrency;
                      const nativeAmt = Number(booking.supplierNativeAmount);
                      const showNative =
                        !!nativeCurr &&
                        nativeCurr !== currencyCode &&
                        Number.isFinite(nativeAmt) &&
                        nativeAmt > 0;
                      return (
                        <span>
                          <span style={{ fontWeight: "600" }}>
                            Total Rate:{" "}
                          </span>
                          {booking.totalRate != null
                            ? `${currencyCode} ${toDisplayAmount(grand).toFixed(2)}`
                            : "-"}
                          {td > 0 && booking.totalRate != null && (
                            <span
                              style={{
                                marginLeft: 6,
                                fontSize: "0.72rem",
                                color: "#888",
                              }}
                            >
                              ({currencyCode}{" "}
                              {toDisplayAmount(baseTotal).toFixed(2)} + TD{" "}
                              {toDisplayAmount(td).toFixed(2)})
                            </span>
                          )}
                          {showNative && (
                            <span
                              style={{
                                marginLeft: 8,
                                fontSize: "0.72rem",
                                color: "#888",
                              }}
                              title="Supplier's native confirmation currency"
                            >
                              (supplier: {nativeCurr}{" "}
                              {nativeAmt.toFixed(2)})
                            </span>
                          )}
                        </span>
                      );
                    })()}
                    <span>
                      <span style={{ fontWeight: "600" }}>Refund Type: </span>
                      {getRefundStatusLabel(booking)}
                    </span>
                    {/* Payable at Hotel — persisted from GRN's
                        price_details.hotel_charges[] with included:false at
                        booking time. Sits OUTSIDE Total Rate above because
                        the hotel bills it directly. Hidden when the booking
                        carries no such charge (every non-GRN supplier +
                        GRN rates reporting none), so other bookings render
                        unchanged. Currency handling mirrors the server-side
                        rule in BookingCompletedServiceImpl: when the stored
                        currency matches the booking currency, apply the
                        same display-currency factor; otherwise render the
                        supplier's own currency unconverted. */}
                    {(booking.payableAtHotelAmount != null ||
                      booking.payableAtHotelDescription) &&
                      (() => {
                        const stored = (
                          booking.payableAtHotelCurrency || "AED"
                        ).toUpperCase();
                        const inBase = stored === "AED";
                        const displayCode = inBase ? currencyCode : stored;
                        const displayAmt =
                          booking.payableAtHotelAmount != null
                            ? inBase
                              ? toDisplayAmount(booking.payableAtHotelAmount)
                              : Number(booking.payableAtHotelAmount)
                            : null;
                        return (
                          <span
                            title="Collected by the hotel at check-in. NOT part of the Total Rate above."
                            style={{
                              background: "#fff4e5",
                              color: "#7a4a00",
                              border: "1px solid #f0c78a",
                              borderRadius: 6,
                              padding: "3px 8px",
                              fontSize: "0.85rem",
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>
                              Payable at Hotel
                              {booking.payableAtHotelDescription
                                ? ` (${booking.payableAtHotelDescription})`
                                : ""}
                              :{" "}
                            </span>
                            {displayAmt != null
                              ? `${displayCode} ${displayAmt.toFixed(2)}`
                              : "see details"}
                            <span
                              style={{
                                marginLeft: 6,
                                fontSize: "0.7rem",
                                opacity: 0.85,
                              }}
                            >
                              (not included in the total above)
                            </span>
                          </span>
                        );
                      })()}
                  </div>
                </div>

                {/* ── Sub-Bookings (created via Edit) ────────────────── */}
                {booking.subBookings && booking.subBookings.length > 0 && (
                  <div style={card}>
                    <div style={SECTION_HEADER}>
                      Related Sub-Bookings ({booking.subBookings.length})
                    </div>
                    <div style={{ padding: "10px 16px" }}>
                      {booking.subBookings.map((sub) => {
                        const subRooms = sub.rooms?.length ?? 0;
                        const subAdults =
                          sub.rooms?.reduce((s, r) => s + (r.adults || 0), 0) ??
                          0;
                        const subChildren =
                          sub.rooms?.reduce(
                            (s, r) => s + (r.children || 0),
                            0,
                          ) ?? 0;
                        return (
                          <div
                            key={sub.bookingId}
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
                                {sub.bookingCode || "-"}
                                {sub.childBookingIndex != null && (
                                  <span
                                    style={{
                                      marginLeft: "8px",
                                      color: "#888",
                                      fontWeight: "500",
                                      fontSize: "0.8rem",
                                    }}
                                  >
                                    (Edit #{sub.childBookingIndex})
                                  </span>
                                )}
                              </span>
                              <button
                                style={BTN_NEUTRAL}
                                onClick={() =>
                                  navigate(
                                    `/booking-details/hotel-booking/${sub.bookingId}`,
                                  )
                                }
                              >
                                View
                              </button>
                            </div>
                            <Row>
                              <Col md={6}>
                                <InfoRow
                                  label="Reference No."
                                  value={sub.referenceNumber}
                                />
                                <InfoRow label="Hotel" value={sub.hotelName} />
                                <InfoRow
                                  label="Check-In"
                                  value={formatDateTime(sub.checkInDate)}
                                />
                                <InfoRow
                                  label="Check-Out"
                                  value={formatDateTime(sub.checkOutDate)}
                                />
                              </Col>
                              <Col md={6}>
                                <InfoRow
                                  label="Rooms / Guests"
                                  value={`${subRooms} Room${
                                    subRooms !== 1 ? "s" : ""
                                  }, ${subAdults} Adult${
                                    subAdults !== 1 ? "s" : ""
                                  }${
                                    subChildren > 0
                                      ? `, ${subChildren} Child${
                                          subChildren !== 1 ? "ren" : ""
                                        }`
                                      : ""
                                  }`}
                                />
                                <InfoRow
                                  label="Total Rate"
                                  value={
                                    sub.totalRate != null
                                      ? Number(sub.totalRate).toFixed(2)
                                      : "-"
                                  }
                                />
                                <InfoRow
                                  label="Status"
                                  value={
                                    <StatusBadge
                                      status={
                                        String(sub.confirmationStatus || "")
                                          .toUpperCase() === "CANCELLED" &&
                                        sub.cancelledFromStatus
                                          ? `${sub.cancelledFromStatus}/Cancelled`
                                          : sub.confirmationStatus
                                      }
                                    />
                                  }
                                />
                                <InfoRow
                                  label="Booking Date"
                                  value={formatDateTime(sub.bookingDate)}
                                />
                              </Col>
                            </Row>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Related Sub-Bookings of OTHER types (amendment links) ──
                    Long Stay / Day Stay / Gov Employee / Student / Senior
                    Citizen children, recorded via /api/booking-amendment-link.
                    Each row is clickable to its own (live) detail page. */}
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

                {/* ── Cancellation Policy ───────────────────────────── */}
                <div style={card}>
                  <div style={SECTION_HEADER}>
                    Cancellation Policy{" "}
                    <span style={{ fontSize: "1rem", color: "#555" }}>⊟</span>
                  </div>
                  <div
                    style={{
                      padding: "10px 16px",
                      fontSize: "0.83rem",
                      color: "#333",
                    }}
                  >
                    {booking.cancellationPolicies &&
                    booking.cancellationPolicies.length > 0 ? (
                      booking.cancellationPolicies.map((p, i) => (
                        <p key={i} style={{ marginBottom: "4px" }}>
                          {p}
                        </p>
                      ))
                    ) : (
                      <span className="text-muted">
                        No cancellation policy available.
                      </span>
                    )}
                  </div>
                </div>

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
                    {booking.remarks ? (
                      <p style={{ marginBottom: 0 }}>{booking.remarks}</p>
                    ) : (
                      <span className="text-muted">No remarks.</span>
                    )}
                  </div>
                </div>

                {/* ── Special Requests ──────────────────────────────── */}
                <div style={card}>
                  <div style={SECTION_HEADER}>
                    Special Request{" "}
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "18px",
                        height: "18px",
                        borderRadius: "50%",
                        border: "1.5px solid #555",
                        fontSize: "0.75rem",
                        fontWeight: "700",
                        color: "#555",
                      }}
                    >
                      +
                    </span>
                  </div>
                  <div
                    style={{
                      padding: "10px 16px",
                      fontSize: "0.83rem",
                      color: "#333",
                    }}
                  >
                    {booking.specialRequests &&
                    booking.specialRequests.length > 0 ? (
                      <ul style={{ marginBottom: 0, paddingLeft: "18px" }}>
                        {booking.specialRequests.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-muted">No special requests.</span>
                    )}
                  </div>
                </div>

                {/* ── Related Notes ─────────────────────────────────────
                    Read-only list of notes added via the dedicated /notes
                    page. Lets reviewers see all the context without leaving
                    the detail view. Adding new notes still happens on the
                    /notes page via the existing "Notes" action button. */}
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
                          key={n.noteId}
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
                            {n.createdAt ? formatDateTime(n.createdAt) : ""}
                          </div>
                          <div
                            style={{
                              fontSize: "0.85rem",
                              whiteSpace: "pre-wrap",
                              color: "#222",
                            }}
                          >
                            {n.noteText}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* ── Action Buttons ──────────────────────────────────
                    All booking-level actions live here. Buttons reflow on
                    smaller screens via flex-wrap. The PROFORMA vs FINAL
                    pair flips off `isReconfirmed` so the operator only
                    sees the relevant pair for the current booking
                    lifecycle stage.
                    Whole row hidden when the booking is already
                    cancelled — no action makes sense on a CANCELLED
                    record (ADD NEW ITEM / NOTES / etc. all assume a
                    live booking). Per-button !isCancelled checks below
                    are now redundant but left in place for safety in
                    case this wrapper is ever removed. */}
                {isCancelled && (
                  <div
                    style={{
                      marginBottom: "10px",
                      display: "flex",
                      gap: "8px",
                      flexWrap: "wrap",
                    }}
                  >
                    {/* Voucher / Invoice — final docs if the booking was
                        ReConfirmed/Completed before cancellation, otherwise the
                        Proforma equivalents (mirrors the live-booking logic but
                        keyed off the pre-cancellation status). The final
                        Voucher button is intentionally hidden once the booking
                        is Cancelled — only the Invoice remains. */}
                    {cancelledShowsFinalDocs ? (
                      <>
                        <button
                          style={BTN_INFO}
                          disabled={generatingPdfType === "COMPLETED"}
                          onClick={() =>
                            handleDownloadPdf("COMPLETED", "Invoice")
                          }
                        >
                          {generatingPdfType === "COMPLETED"
                            ? "GENERATING..."
                            : "INVOICE"}
                        </button>
                      </>
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

                    {/* {!isCancelled && isCancellationAllowed && ( */}
                    {!isCancelled && (
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
                            ? "Cancellation is not allowed after the check-in date."
                            : undefined
                        }
                      >
                        CANCEL
                      </button>
                    )}

                    {!showsFinalDocs &&
                      !isCancelled &&
                      !(isOnRequestPending && !canConfirmOnRequest) && (
                        <button
                          style={isOnRequestPending ? BTN_SUCCESS : BTN_TEAL}
                          onClick={openConfirmModal}
                        >
                          {/* An "On Request" booking hasn't been confirmed
                              yet, so the first action is CONFIRM (not
                              RECONFIRM). It reuses the exact same
                              confirmation flow/modal. Agents don't get to
                              see this action for On Request bookings —
                              only admin / super-admin do; see
                              canConfirmOnRequest above. */}
                          {isOnRequestPending ? "CONFIRM" : "RECONFIRM"}
                        </button>
                      )}

                    {/* Proforma Voucher / Invoice are not available while the
                        booking is still "On Request" (not yet confirmed). They
                        return for every other pre-final state, unchanged. */}
                    {!showsFinalDocs && !isCancelled && !isOnRequestPending && (
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

                    {showsFinalDocs && !isCancelled && (
                      <>
                        <button
                          style={BTN_INFO}
                          disabled={generatingPdfType === "VOUCHER"}
                          onClick={() =>
                            handleDownloadPdf("VOUCHER", "Voucher")
                          }
                        >
                          {generatingPdfType === "VOUCHER"
                            ? "GENERATING..."
                            : "VOUCHER"}
                        </button>
                        <button
                          style={BTN_INFO}
                          disabled={generatingPdfType === "COMPLETED"}
                          onClick={() =>
                            handleDownloadPdf("COMPLETED", "Invoice")
                          }
                        >
                          {generatingPdfType === "COMPLETED"
                            ? "GENERATING..."
                            : "INVOICE"}
                        </button>
                      </>
                    )}

                    {!isCancelled && (
                      <button
                        style={BTN_SKY}
                        onClick={() => {
                          // Show the button for every live booking so the
                          // operator can see the action exists, but block the
                          // modal from opening until the booking is at least
                          // Confirmed (mirrors the backend J1 guard). An
                          // "On Request" booking is still pending, so keep it
                          // locked until it is reconfirmed.
                          if (!isConfirmedOrLater || isOnRequestPending) {
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
                    )}

                    {!isCancelled && !isAgentRole && (
                      <button
                        style={BTN_INDIGO}
                        onClick={() => {
                          if (!isConfirmedOrLater || isOnRequestPending) {
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

                    {!isCancelled && (
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
                    )}

                    {!isCancelled && !isAgentRole && (
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
                  Booking Date : {formatDateTime(booking.bookingDate)}
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
                      <strong>
                        {booking?.parentBookingCode || booking?.bookingCode}
                      </strong>
                      .
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
                        const parent =
                          booking.parentBookingCode || booking.bookingCode;
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

                {/* ── Booking History Modal ─────────────────────────────
                    Read-only timeline of the events that actually happened on
                    this booking. Built from the booking detail already loaded
                    (no extra API call) and only the events with a recorded
                    timestamp are listed. Responsive table for small screens. */}
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
                        {booking?.bookingCode && (
                          <span style={{ opacity: 0.85, fontWeight: 500 }}>
                            {` — ${booking.bookingCode}`}
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
                                      orange for the original on-request
                                      state, red for cancelled, slate for
                                      anything unrecognised. */}
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
                                    {formatDate(ev.at)}
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

                {/* ── Cancel Booking Modal (ported from HotelBookingList) ── */}
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
                      <div className="text-muted small mb-3">
                        <div>
                          <strong>Booking Code:</strong>{" "}
                          {booking.bookingCode || "N/A"}
                        </div>
                        {booking.hotelName && (
                          <div>
                            <strong>Hotel:</strong> {booking.hotelName}
                          </div>
                        )}
                      </div>
                      {/* Informational only — booking value warning. Reuses the
                          SAME total shown on the page (totalRate + Tourism
                          Dirham, in the booking's display currency). Does not
                          alter any cancellation logic. */}
                      {booking.totalRate != null &&
                        (() => {
                          const baseTotal = Number(booking.totalRate) || 0;
                          const td = Number(booking.tourismDirham) || 0;
                          const grand = baseTotal + td;
                          return (
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
                              <strong>
                                {currencyCode}{" "}
                                {toDisplayAmount(grand).toFixed(2)}
                              </strong>
                              .
                              <div className="fw-semibold mt-1">
                                Do you still want to cancel it?
                              </div>
                            </div>
                          );
                        })()}
                      {/* Past the free-cancellation deadline the booking can
                          still be cancelled — the supplier may charge only a
                          partial penalty — but the operator has to accept that
                          charges may apply before the button unlocks. */}
                      {isPastCancellationDeadline && (
                        <div
                          className="mb-3 text-start"
                          style={{
                            border: "1px solid #f5c2c7",
                            backgroundColor: "#fff5f5",
                            color: "#842029",
                            borderRadius: "4px",
                            padding: "10px 12px",
                            fontSize: "0.9rem",
                          }}
                        >
                          <div className="fw-semibold mb-1">
                            <FaExclamationCircle className="me-2" />
                            The free-cancellation deadline has passed
                          </div>
                          <div className="mb-2">
                            You can still cancel this booking, but the supplier may
                            apply cancellation charges. Any charge is settled
                            separately from the amount shown above.
                          </div>
                          <Form.Check
                            type="checkbox"
                            id="acceptCancellationCharges"
                            checked={acceptCancellationCharges}
                            disabled={cancellingBooking}
                            onChange={(e) =>
                              setAcceptCancellationCharges(e.target.checked)
                            }
                            label={
                              <span className="fw-semibold">
                                I understand that cancellation charges may apply.
                              </span>
                            }
                          />
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
                        setAcceptCancellationCharges(false);
                      }}
                      disabled={cancellingBooking}
                    >
                      No
                    </Button>
                    <Button
                      variant="danger"
                      onClick={cancelBooking}
                      disabled={
                        cancellingBooking ||
                        !cancellationReason.trim() ||
                        (isPastCancellationDeadline && !acceptCancellationCharges)
                      }
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

                {/* ── Reconfirm Booking Modal ─────────────────────────── */}
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
                          ? "Are you sure you want to confirm the booking?"
                          : "Are you sure you want to reconfirm the booking?"}
                      </p>
                      <div className="text-muted small mb-3">
                        <div>
                          <strong>Booking Code:</strong>{" "}
                          {booking.bookingCode || "N/A"}
                        </div>
                        {booking.hotelName && (
                          <div>
                            <strong>Hotel:</strong> {booking.hotelName}
                          </div>
                        )}
                      </div>
                    </div>
                  </Modal.Body>
                  <Modal.Footer
                    style={{
                      backgroundColor: "#f8f9fa",
                      borderTop: "1px solid #dee2e6",
                    }}
                  >
                    {/* Reject action shown only in the Confirm Booking (on-request)
                        flow. The Reconfirm flow keeps the Reject button hidden. */}
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
                          Confirming...
                        </>
                      ) : isOnRequestPending ? (
                        "Confirm"
                      ) : (
                        "Reconfirm"
                      )}
                    </Button>
                  </Modal.Footer>
                </Modal>

                {/* ── Reject Booking Modal (follow-up from Reconfirm → Reject) ── */}
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
                    <Form.Group className="mb-3">
                      <Form.Label className="fw-semibold">
                        Rejected By <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="text"
                        value={rejectedBy}
                        onChange={(e) => {
                          setRejectedBy(e.target.value);
                          if (rejectedByError) setRejectedByError("");
                        }}
                        isInvalid={!!rejectedByError}
                        placeholder="Enter name"
                        disabled={rejectingBooking}
                        autoFocus
                      />
                      <Form.Control.Feedback type="invalid">
                        {rejectedByError}
                      </Form.Control.Feedback>
                    </Form.Group>
                    <Form.Group className="mb-2">
                      <Form.Label className="fw-semibold">
                        Remarks{" "}
                        <span className="text-muted small">(optional)</span>
                      </Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={3}
                        value={rejectionRemarks}
                        onChange={(e) => setRejectionRemarks(e.target.value)}
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
                        "Reject Booking"
                      )}
                    </Button>
                  </Modal.Footer>
                </Modal>

                {/* ── Send Document Email Modal ─────────────────────── */}
                <Modal
                  show={showSendEmailModal}
                  onHide={() => {
                    if (!sendingEmail) setShowSendEmailModal(false);
                  }}
                  centered
                  backdrop="static"
                  keyboard={false}
                >
                  <Modal.Header
                    closeButton={!sendingEmail}
                    style={{
                      backgroundColor: "#fff",
                      borderBottom: "2px solid #e9ecef",
                    }}
                  >
                    <Modal.Title className="fw-bold">
                      Send {sendEmailDocLabel} via Email
                    </Modal.Title>
                  </Modal.Header>
                  <Modal.Body style={{ padding: "1.5rem" }}>
                    <Form.Group className="mb-3">
                      <Form.Label className="fw-semibold">
                        Recipient Email <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="email"
                        value={sendEmailRecipient}
                        onChange={(e) => {
                          setSendEmailRecipient(e.target.value);
                          if (sendEmailError) setSendEmailError("");
                        }}
                        isInvalid={!!sendEmailError}
                        placeholder="recipient@example.com"
                        disabled={sendingEmail}
                        autoFocus
                      />
                      <Form.Control.Feedback type="invalid">
                        {sendEmailError}
                      </Form.Control.Feedback>
                    </Form.Group>
                    <Form.Group className="mb-2">
                      <Form.Label className="fw-semibold">
                        Note{" "}
                        <span className="text-muted small">(optional)</span>
                      </Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={3}
                        value={sendEmailNote}
                        onChange={(e) => setSendEmailNote(e.target.value)}
                        placeholder="Add a message for the recipient"
                        disabled={sendingEmail}
                      />
                    </Form.Group>
                    <div className="text-muted small">
                      A fresh PDF will be generated and attached automatically.
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
                      onClick={() => setShowSendEmailModal(false)}
                      disabled={sendingEmail}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      onClick={sendDocumentEmail}
                      disabled={sendingEmail}
                    >
                      {sendingEmail ? (
                        <>
                          <Spinner
                            animation="border"
                            size="sm"
                            className="me-2"
                          />
                          Sending...
                        </>
                      ) : (
                        "Send Email"
                      )}
                    </Button>
                  </Modal.Footer>
                </Modal>

                {/* ── Update Book Status Modal (PATCH confirmation-status + Agent LPO) ── */}
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
                      <div className="text-muted small mb-3">
                        <div>
                          <strong>Booking Code:</strong>{" "}
                          {booking.bookingCode || "N/A"}
                        </div>
                        {booking.hotelName && (
                          <div>
                            <strong>Hotel:</strong> {booking.hotelName}
                          </div>
                        )}
                      </div>
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

                {/* ── Confirmation Number Modal ──────────────────────── */}
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
                    <div className="text-muted small mb-3">
                      <div>
                        <strong>Booking Code:</strong>{" "}
                        {booking.bookingCode || "N/A"}
                      </div>
                      {booking.hotelName && (
                        <div>
                          <strong>Hotel:</strong> {booking.hotelName}
                        </div>
                      )}
                    </div>
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

                {/* ── Booking Remark Modal ───────────────────────────── */}
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

                {/* ── Notes Modal — add a new ad-hoc note inline. Existing
                    notes are already listed in the Notes card above; this
                    modal POSTs to the SAME endpoint the old /notes page
                    used, then refreshes the list so the new note appears
                    immediately. No flow/API change. */}
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

      {/* ── Booking Cannot Be Completed (Reconfirm) ──
          Deferred-credit Reconfirm + agent has no credit AND Card
          payment is disabled → the operator has no path to complete
          this action. Blocks the reconfirm with a courteous message
          instead of pushing them into an online-payment flow they
          can't use. Same shape as HotelBookingPage's create-flow
          block modal so the experience stays consistent. */}
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

      {/* ── Online Payment Required (deferred-credit Reconfirm) ──
          Surfaced when the operator clicks Reconfirm on a Case-5
          booking (voucherGenerated = "On Reconfirmation/ Credit Card")
          and the agent still has no credit. Same shape as the create
          flow's modal on HotelBookingPage so the operator gets a
          consistent experience. */}
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
            The agent's available credit is insufficient to reconfirm this
            booking. You need to proceed with{" "}
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
          Identical to the create-flow picker; on Proceed we hand off to
          /payment/<id> and stamp returnTo so the gateway page can send
          the operator back here with state.resumeReconfirm = true. */}
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
                  htmlFor={`reconfirm-gw-${g.id}`}
                  className={`pg-option${
                    isSelected ? " pg-option-selected" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="reconfirm-payment-gateway"
                    id={`reconfirm-gw-${g.id}`}
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
              // Distinct from the dummy /payment/:gateway path below — the
              // browser fully navigates away to CC Avenue's hosted page and
              // back, so the resume signal has to travel as a URL query
              // param (React Router state doesn't survive a real
              // cross-origin redirect). See the ccavenueOrderId resume
              // effect above. reconfirmBookingId tells CCAvenueCheckoutPage
              // to pay off THIS existing booking rather than create a new
              // one — the backend already has everything else it needs.
              if (selectedGateway === "ccavenue") {
                const cust = booking?.customer;
                const billingName = cust
                  ? [cust.salutation, cust.firstName, cust.lastName]
                      .filter(Boolean)
                      .join(" ")
                  : "";
                navigate("/payment/ccavenue-redirect", {
                  state: {
                    amountLabel: `AED ${Number(insufficientAmount).toFixed(2)}`,
                    billingName,
                    returnTo: location.pathname,
                    reconfirmBookingId: id,
                  },
                });
                return;
              }

              // Dummy /payment/:gateway flow (test/local only). We pass
              // returnTo so the gateway can navigate back to THIS detail
              // page on completion, and resumeReconfirm so the resume
              // effect at the top of this component fires runReconfirm.
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

      {/*
        PDF Preview Modal — opens the Proforma Voucher / Proforma Invoice /
        Voucher / Invoice PDF inside an <iframe> on this page rather than
        sending the user to a new tab or triggering a download. The modal
        is rendered outside the main <main> column so it overlays the
        full viewport; placing it outside the {loading/!booking} ternary
        means it survives a background refetch.
      */}
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
            {booking?.bookingCode ? ` — ${booking.bookingCode}` : ""}
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
                download={`Booking_${id}_${pdfPreview.type || "document"}.pdf`}
              >
                Download
              </Button>
              {/* Send Email — admin-only. Agents see the
                  download + new-tab buttons but cannot dispatch
                  documents by email from this UI. */}
              {isAdmin && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    const labelToDocType = {
                      Voucher: "VOUCHER",
                      "Proforma Voucher": "PROFORMA_VOUCHER",
                      Invoice: "INVOICE",
                      "Proforma Invoice": "PROFORMA_INVOICE",
                    };
                    const dt =
                      labelToDocType[pdfPreview.label] ||
                      (pdfPreview.type === "PROFORMA_VOUCHER"
                        ? "PROFORMA_VOUCHER"
                        : pdfPreview.type === "PROFORMA_INVOICE"
                          ? "PROFORMA_INVOICE"
                          : pdfPreview.type === "COMPLETED"
                            ? "INVOICE"
                            : "VOUCHER");
                    openSendEmailModal(dt, pdfPreview.label || "Document");
                  }}
                >
                  ✉ Send Email
                </Button>
              )}
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
          button POSTs /api/hotel-booking/:id/resend-mail?email=…
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
            {booking?.bookingCode ? ` — ${booking.bookingCode}` : ""}
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

function InfoRow({ label, value }) {
  return (
    <div
      style={{ marginBottom: "6px", display: "flex", alignItems: "flex-start" }}
    >
      <span style={INFO_LABEL}>{label}</span>
      <span style={{ ...INFO_VALUE, marginLeft: "8px" }}>{value ?? "-"}</span>
    </div>
  );
}
