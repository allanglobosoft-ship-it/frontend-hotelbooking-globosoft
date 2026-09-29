/**
 * DayStayBookingDetailView.jsx
 *
 * Full-page detail view for a single Day Stay booking. Replaces the
 * modal-based "View" that used to live in DayStayBookingList. The
 * Voucher / Cancel row icons now sit at the bottom-left of this page as
 * buttons. Endpoints:
 *   - Detail fetch :  GET    /api/day-stay-booking/{id}
 *   - Voucher PDF  :  GET    /api/day-stay-booking/{id}/voucher
 *                     → { status: "SUCCESS", pdfUrl }
 *   - Send by mail :  POST   /api/day-stay-booking/send-pdf-email
 *                     { email, pdfUrl, bookingId }
 *   - Cancel       :  POST   /api/day-stay-booking/{id}/cancel  { reason }
 *
 * The voucher click now opens a modal with an in-page iframe preview
 * of the returned PDF (same pattern as
 * MakeYourOwnPackageV2BookingDetailView).
 *
 * The list row is forwarded via location.state.booking so the page has a
 * booking-code header even before the detail fetch resolves. On hard
 * refresh the route id alone drives the fetch.
 *
 * VISUAL NOTE: the presentation here mirrors the Hotel Booking detail
 * view (BookingDetailedView.jsx) — same card / SECTION_HEADER / InfoRow
 * tokens, StatusBadge colour logic, action-button bar and modal chrome.
 * Only the presentation was reskinned; every Day Stay data field,
 * endpoint, handler and modal is preserved unchanged.
 */
import React, { useEffect, useState, useCallback } from "react";
import {
  Container,
  Row,
  Col,
  Table,
  Spinner,
  Form,
  InputGroup,
  Modal,
  Button,
} from "react-bootstrap";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import {
  FaEnvelope,
  FaPaperPlane,
  FaDownload,
} from "react-icons/fa";
import { FaExclamationCircle } from "react-icons/fa";
import {
  FaHistory, FaMapMarkerAlt, FaNetworkWired, FaCalendarAlt, FaClock,
  FaUserAlt, FaPlusCircle, FaCheckCircle, FaSyncAlt, FaTimesCircle,
} from "react-icons/fa";
import { toast } from "react-hot-toast";
import axiosInstance from "../../components/AxiosInstance";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
// Source of the pg-option-* classes used by the Select Payment Gateway
// modal below — same import BookingDetailedView.jsx uses so the day-stay
// detail picker renders identically to the hotel detail picker.
import "../../styles/HotelBookingPage.css";

// Online-payment gateways — mirrors BookingDetailedView (hotel). CCAvenue
// is the only real gateway wired; the dummy /payment/:gateway path is kept
// as a fallback for any future non-CCAvenue entry.
const PAYMENT_GATEWAYS = [
  { id: "ccavenue", name: "CC Avenue", desc: "Cards, UPI, Net Banking" },
];

// Reverse-geocode browser coordinates to a readable address for the
// Booking History audit trail. Tries OpenStreetMap Nominatim first
// (street-level detail), then BigDataCloud (locality-level, keyless) —
// both free, CORS-enabled endpoints. Returns null when neither responds
// so the caller keeps its IP-derived fallback. Mirrors the hotel
// BookingDetailedView + the day-stay booking page.
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

// ── Visual tokens (copied from the Hotel Booking detail view) ──────────
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

// Purpose-based colour variants (same scheme as the hotel detail page). Reuse
// the BUTTON_STYLE shape — only the background colour changes — to improve
// visual distinction. No behaviour/handler/guard is affected.
const BTN_SUCCESS = { ...BUTTON_STYLE, backgroundColor: "#16a34a" }; // Confirm (on-request first-confirm)
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
// to a neutral slate badge. Mirrors SeniorCitizenBookingDetailView /
// StudentBookingDetailView / GovEmployeeBookingDetailView.
const HISTORY_ACTION_META = {
  "Booking Created": { bg: "#e6f4ea", fg: "#1e7e34", icon: FaPlusCircle },
  "Booking Confirmed": { bg: "#e7f1ff", fg: "#1d4ed8", icon: FaCheckCircle },
  "Booking Reconfirmed": { bg: "#e0f2f1", fg: "#0d9488", icon: FaSyncAlt },
  "Booking Cancelled": { bg: "#fdecea", fg: "#c0392b", icon: FaTimesCircle },
};
const HISTORY_ACTION_FALLBACK = { bg: "#f1f5f9", fg: "#475569", icon: FaHistory };

// Cross-supplier amendment picker — mirrors the parent BookingDetailedView.
// Selecting one navigates to that flow's create form pre-filled with the
// current booking code as the parent reference.
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

const parseLocal = (str) => {
  if (!str) return null;
  const normalized = String(str).includes("T") ? str : `${str}T00:00:00`;
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
};

const formatDate = (dateStr) => {
  const d = parseLocal(dateStr);
  if (!d) return "-";
  const day = String(d.getDate()).padStart(2, "0");
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
// Time-only (HH:MM:SS) — used by the History modal which shows Date / Time
// in separate columns. Returns "-" when the value is missing/unparseable.
const formatTimeOnly = (dateStr) => {
  const d = parseLocal(dateStr);
  if (!d) return "-";
  const hrs = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const sec = String(d.getSeconds()).padStart(2, "0");
  return `${hrs}:${min}:${sec}`;
};

// StatusBadge — colour each status word on its own (Confirmed/ReConfirmed
// green, Cancelled red, On Request orange). Copied from the Hotel view.
const StatusBadge = ({ status }) => {
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

export default function DayStayBookingDetailView() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  // Role gate for admin-only actions — currently gates the "Send Email"
  // affordance inside the PDF preview modal. Matches HotelBookingPage's
  // convention.
  const activeUserRole = localStorage.getItem("currentActiveRole");
  const isAdmin = String(activeUserRole || "").toUpperCase() === "ADMIN";
  const isSuperAdmin =
    String(activeUserRole || "").toUpperCase() === "SUPER_ADMIN";
  // Confirming an On-Request booking (step 1 of the two-step flow — moves
  // the row from tentative to "On Request/Confirmed") is a supplier-facing
  // action agents must not perform on their own. Admin / super-admin keep
  // full control. Reconfirming a NON-On-Request booking (or step 2 of the
  // On Request flow after admin already confirmed step 1) is unaffected
  // — agents still see the RECONFIRM button. Mirrors the identical gate
  // on BookingDetailedView / LongStayBookingDetailView.
  const canConfirmOnRequest = isAdmin || isSuperAdmin;
  // Agent-role gate (UI visibility only) — hides internal/admin-facing actions
  // (Booking Remark, Notes, Confirmation No.) for Agent logins.
  // currentActiveRole isn't set for single-role logins, so fall back to
  // userRole (same convention as HotelSearch.jsx). Visibility only — no
  // API/flow/permission change.
  const activeRole = String(localStorage.getItem("currentActiveRole") || "")
    .trim()
    .toUpperCase();
  const storedRoles = String(
    localStorage.getItem("userRole") || "",
  ).toUpperCase();
  const isAgentRole = activeRole
    ? activeRole === "AGENT"
    : storedRoles.includes("AGENT") && !storedRoles.includes("ADMIN");
  const location = useLocation();
  const rowStub = location.state?.booking || null;
  const bookingId = rowStub?.id || routeId;

  // Details (modal body content, fetched via the same endpoint the list
  // used). Seeded with the row stub so the header renders immediately.
  const [selected, setSelected] = useState(rowStub);
  const [detailsLoading, setDetailsLoading] = useState(true);

  // Operator location snapshot for the Booking History audit trail. Resolved
  // once on mount and sent on the confirmation-status PATCH / cancel POST so
  // the BE can stamp confirmed_location / reconfirmed_location /
  // cancelled_location the same way the Create flow stamps booking_location.
  // The IP is NOT resolved here — browsers only see the shared public/NAT IP;
  // DayStayBookingController fills it in from the HTTP request itself. Same
  // two-step resolution as DayStayBookingPage.jsx: coarse IP-derived city
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

  // Cancel modal
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  // ── Action-button modal / handler state (mirror LongStayBookingDetailView) ──
  // Reconfirm (Confirm / Reject popup)
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmingBooking, setConfirmingBooking] = useState(false);

  // ── Online Payment Required (Reconfirm credit pre-check) ──────────
  // Mirrors BookingDetailedView: when the operator reconfirms a
  // Voucher-Later or On-Request day-stay booking and the agent STILL has
  // no credit, we surface the Online Payment Required modal → gateway
  // picker → dummy payment page, which navigates back here with
  // location.state.resumeReconfirm = true and the reconfirm completes.
  // When the agent's Card payment is disabled too, the dedicated
  // "Booking Cannot Be Completed" modal blocks the action instead.
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [showGatewayModal, setShowGatewayModal] = useState(false);
  const [insufficientAmount, setInsufficientAmount] = useState(0);
  const [selectedGateway, setSelectedGateway] = useState("");
  const [showNoPaymentPathModal, setShowNoPaymentPathModal] = useState(false);

  // Reject (follow-up modal from Reconfirm → Reject)
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectedBy, setRejectedBy] = useState("");
  const [rejectedByError, setRejectedByError] = useState("");
  const [rejectionRemarks, setRejectionRemarks] = useState("");
  const [rejectingBooking, setRejectingBooking] = useState(false);

  // Agent Reference (GET prefill / POST save)
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
  // /notes navigation). Backend shape: GET returns a bare array of rows
  // ({ id, note, createdBy, createdDate }); POST body is { note, createdBy }.
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

  // Amendment links — cross-supplier children recorded via
  // /api/booking-amendment-link/parent/{code}. Fetched separately from
  // the main booking detail so the Related Sub-Bookings card can render
  // Long Stay / Day Stay / Gov / Student / Senior amendments alongside
  // the same-type sub-bookings.
  const [amendmentLinks, setAmendmentLinks] = useState([]);

  // Documents (Voucher / Proforma Voucher / Invoice / Proforma Invoice) —
  // typed PDF generator. The button row exposes 4 buttons; each calls
  // /api/day-stay-bookings/{id}/pdf?type=... The backend returns
  // { status, message, pdfUrl } and we render that in an iframe modal.
  const [generatingPdfType, setGeneratingPdfType] = useState(null);
  const [pdfPreview, setPdfPreview] = useState(null);

  // History modal — pure derivation from loaded booking, no API.
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Add New Item picker — cross-supplier amendment.
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [selectedAddItemType, setSelectedAddItemType] = useState(
    ADD_NEW_ITEM_TYPES[0].key,
  );

  // Send Document Email modal — admin-only.
  const [showSendEmailModal, setShowSendEmailModal] = useState(false);
  const [sendEmailDocType, setSendEmailDocType] = useState(null);
  const [sendEmailDocLabel, setSendEmailDocLabel] = useState("");
  const [sendEmailRecipient, setSendEmailRecipient] = useState("");
  const [sendEmailNote, setSendEmailNote] = useState("");
  const [sendEmailError, setSendEmailError] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  const fetchDetail = async () => {
    if (!bookingId) {
      toast.error("Booking id missing");
      setDetailsLoading(false);
      return;
    }
    setDetailsLoading(true);
    try {
      const res = await axiosInstance.get(`/api/day-stay-booking/${bookingId}`);
      setSelected(res.data);
    } catch {
      // Fall back to the row stub — preserves the original "if /id fails,
      // render what we have" behaviour the list modal used.
      if (!rowStub) toast.error("Failed to load booking details");
    } finally {
      setDetailsLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  // Fetch cross-supplier amendment links once the booking code is known.
  // The endpoint is keyed by the parent booking code (falls back to the
  // booking's own code when this record isn't itself an amendment child).
  const amendmentParentCode = selected?.parentBookingCode || selected?.bookingCode;
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
    return () => {
      alive = false;
    };
  }, [amendmentParentCode]);

  // ── Cancel ─────────────────────────────────────────────────────────
  const openCancel = () => {
    setCancelReason("");
    setShowCancel(true);
  };

  const submitCancel = async () => {
    if (!bookingId) return;
    setCancelling(true);
    try {
      const trimmed = (cancelReason || "").trim();
      // Send JSON body so Spring picks the JSON converter — a null body
      // makes axios send application/x-www-form-urlencoded which the
      // @RequestBody Map<String,Object> handler rejects with 415.
      await axiosInstance.post(
        `/api/day-stay-booking/${bookingId}/cancel`,
        {
          reason: trimmed || null,
          // Booking History audit — BE stamps this onto cancelled_location.
          // May be null if the operator denied geolocation and the IP-derived
          // fallback also failed; the BE treats null as "no capture" and the
          // "Booking Cancelled" history row renders "-".
          bookingLocation: operatorLocation,
        },
      );
      toast.success("Booking cancelled");
      setShowCancel(false);
      setCancelReason("");
      await fetchDetail();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Cancellation failed");
    } finally {
      setCancelling(false);
    }
  };

  // ── Status helpers (mirror LongStayBookingDetailView). Day Stay uses
  //    `status`/`isCancelled` where Long Stay uses bookingStatus/cancelStatus. ──
  const normalizedStatus = String(selected?.confirmationStatus || "")
    .replace(/\s+/g, "")
    .toUpperCase();
  const isCancelledStatus =
    selected?.isCancelled === true ||
    String(selected?.status || "").toUpperCase() === "CANCELLED" ||
    normalizedStatus === "CANCELLED";
  const showsFinalDocs =
    selected?.reconfirmation === true ||
    normalizedStatus === "RECONFIRMED" ||
    normalizedStatus === "COMPLETED";
  const isConfirmedOrLater =
    normalizedStatus === "CONFIRMED" ||
    normalizedStatus === "RECONFIRMED" ||
    normalizedStatus === "COMPLETED" ||
    selected?.reconfirmation === true ||
    String(selected?.status || "").toUpperCase() === "CONFIRMED";

  // Mirrors the docs-vs-proforma rule used across the app for the resend-mail
  // preview: a still-tentative day-stay booking (CONFIRMED) resends the
  // Proforma Voucher; once ReConfirmed / Completed — or Cancelled — it resends
  // the real Voucher. Kept as derived values so the modal title, loading
  // copy, iframe title, and the /pdf?type= request all stay in sync.
  const resendUsesFinalDoc =
    isCancelledStatus ||
    selected?.reconfirmation === true ||
    normalizedStatus === "RECONFIRMED" ||
    normalizedStatus === "COMPLETED";
  const resendDocLabel = resendUsesFinalDoc
    ? "Voucher"
    : "Day Stay Booking Proforma Voucher";
  const resendDocType = resendUsesFinalDoc ? "VOUCHER" : "PROFORMA_VOUCHER";

  // On-Request flow mirror (degrades gracefully — when the backend does
  // not populate roomStatus="On Request" or onRequestConfirmed both flags
  // evaluate false and the page behaves as a standard booking).
  const isOnRequestRoom = /^on\s*request$/i.test(
    String(selected?.roomStatus || "").trim(),
  );
  const isOnRequestConfirmedStep =
    isOnRequestRoom && Boolean(selected?.onRequestConfirmed);
  // "Pending" = the INITIAL On Request step (before the first Confirm).
  // Unlike the hotel flow (where the engine stamps On Request creates as
  // CONFIRMED), day-stay On Request bookings are created with
  // confirmationStatus "Not Confirmed" (flow REQUESTED) — so both states,
  // plus a null status on legacy rows, count as pending. Rejected /
  // ReConfirmed / Cancelled never match. The first Confirm flips
  // onRequestConfirmed on the BE (updateConfirmationStatus step-1 branch)
  // and the button becomes RECONFIRM.
  const isOnRequestPending =
    isOnRequestRoom &&
    (normalizedStatus === "CONFIRMED" ||
      normalizedStatus === "NOTCONFIRMED" ||
      normalizedStatus === "") &&
    !selected?.onRequestConfirmed;

  // For a cancelled booking the doc variant (final vs proforma) and whether
  // Agent Reference / Confirmation No. can be added are governed by the
  // status the booking held BEFORE cancellation.
  const priorStatus = String(selected?.cancelledFromStatus || "")
    .replace(/\s+/g, "")
    .toUpperCase();
  const cancelledShowsFinalDocs =
    priorStatus === "RECONFIRMED" || priorStatus === "COMPLETED";
  const cancelledFromConfirmedOrLater =
    priorStatus === "CONFIRMED" ||
    priorStatus === "RECONFIRMED" ||
    priorStatus === "COMPLETED";

  // Cancel button gate: cancellation isn't allowed once the stay has
  // started. Falls back to false (allow cancel) if the date is missing or
  // unparseable.
  const isPastCheckIn = (() => {
    const raw = selected?.checkInDate;
    if (!raw) return false;
    const checkIn = new Date(
      String(raw).includes("T") ? raw : `${raw}T00:00:00`,
    );
    if (isNaN(checkIn.getTime())) return false;
    return new Date().getTime() > checkIn.getTime();
  })();

  // Display status — chains the lifecycle stages the booking has actually
  // been through so the badge reads like a history breadcrumb. Uses the
  // backend-stamped timestamps (confirmedAt / reconfirmedAt / cancelledAt)
  // so the chain grows one segment at a time as the operator acts:
  //   • Confirmed booking                → "Confirmed"
  //   • Confirmed → Reconfirmed          → "Confirmed/Reconfirmed"
  //   • Confirmed → Reconfirmed → Cancel → "Confirmed/Reconfirmed/Cancelled"
  //   • Cancelled from Confirmed         → "Confirmed/Cancelled"
  //   • On-Request created               → "On Request"
  //   • On-Request → Confirm             → "On Request/Confirmed"
  //   • On-Request → Confirm → Reconfirm → "On Request/Confirmed/Reconfirmed"
  //   • On-Request → cancelled at any    → adds "/Cancelled" to the chain
  //   • Rejected                         → "Rejected" (terminal)
  const displayStatus = (() => {
    if (normalizedStatus === "REJECTED") return "Rejected";
    const parts = [];
    const wasConfirmed =
      !!selected?.confirmedAt ||
      normalizedStatus === "CONFIRMED" ||
      normalizedStatus === "RECONFIRMED";
    const wasReconfirmed =
      !!selected?.reconfirmedAt ||
      selected?.reconfirmation === true ||
      normalizedStatus === "RECONFIRMED";
    if (isOnRequestRoom) {
      parts.push("On Request");
      if (isOnRequestConfirmedStep || wasConfirmed) parts.push("Confirmed");
    } else if (wasConfirmed) {
      parts.push("Confirmed");
    }
    if (wasReconfirmed) parts.push("Reconfirmed");
    if (isCancelledStatus) parts.push("Cancelled");
    if (parts.length === 0) {
      return (
        selected?.confirmationStatus ||
        selected?.status ||
        (selected?.reconfirmation ? "ReConfirmed" : "-")
      );
    }
    return parts.join("/");
  })();

  // ── Reconfirm ──────────────────────────────────────────────────────
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

  // Actual reconfirm API call. Split out (mirrors BookingDetailedView)
  // so the same call can be made from (a) the Reconfirm modal's Confirm
  // button when credit is fine, and (b) the post-payment resume effect
  // after the operator pays through the gateway picker.
  const runReconfirm = async () => {
    if (!bookingId) return;
    try {
      setConfirmingBooking(true);
      await axiosInstance.patch(
        `/api/day-stay-booking/${bookingId}/confirmation-status`,
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
      // Step-aware message: the same PATCH drives BOTH On-Request steps —
      // step 1 lands "On Request/Confirmed", step 2 (and every non-On-
      // Request booking) lands ReConfirmed.
      toast.success(
        isOnRequestPending
          ? "Booking confirmed successfully!"
          : "Booking reconfirmed successfully!",
      );
      await fetchDetail();
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Failed to reconfirm booking. Please try again."
      );
    } finally {
      setConfirmingBooking(false);
    }
  };

  // Reconfirm modal's Confirm/Reconfirm button handler — same payment-gate
  // pre-check as the hotel detail page (BookingDetailedView.confirmBooking).
  //
  // The credit + card pre-check runs ONLY for:
  //   • Voucher-Later bookings (bookingConfirmation === "Book Now &
  //     Voucher later") — day-stay has NO voucherGenerated marker (the
  //     hotel create matrix stamps it; DayStayBookingServiceImpl doesn't),
  //     so the voucher choice string persisted on the booking is the
  //     deferred-credit equivalent here.
  //   • On Request bookings at the RECONFIRM step only — step-1 Confirm
  //     (isOnRequestPending) goes through untouched, same as hotel.
  // Every other booking (credit already settled at create) calls
  // runReconfirm directly — existing flow unchanged.
  //
  // Insufficient credit → close the Reconfirm modal, then:
  //   • Card disabled  → "Booking Cannot Be Completed" (blocked).
  //   • Card enabled   → "Online Payment Required" → gateway picker →
  //     back here with state.resumeReconfirm=true → runReconfirm.
  // Missing agentId/amount or a credit-check API error fail OPEN to the
  // legacy direct reconfirm so the operator is never trapped.
  const confirmBooking = async () => {
    const isVoucherLaterBooking =
      (selected?.bookingConfirmation || "") === "Book Now & Voucher later";
    const isOnRequestReconfirmStep = isOnRequestRoom && !isOnRequestPending;
    if (!isVoucherLaterBooking && !isOnRequestReconfirmStep) {
      await runReconfirm();
      return;
    }
    const agentIdNum = selected?.agentId
      ? Number(String(selected.agentId).trim())
      : null;
    const amount = Number(selected?.totalAmount) || 0;
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
    } catch (err) {
      console.error("Error checking credit before reconfirm:", err);
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
    if (!selected) return;
    navigate(location.pathname, { replace: true, state: {} });
    runReconfirm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.resumeReconfirm, selected]);

  // CC Avenue post-payment resume — mirrors BookingDetailedView. CC
  // Avenue's redirect is a real cross-domain browser navigation, so React
  // Router `state` (resumeReconfirm above) never survives it; the backend
  // instead appends ?ccavenueOrderId=&ccavenueStatus= to the URL when it
  // redirects back here (see CCAvenuePaymentServiceImpl.buildRedirect).
  // Unlike the dummy-gateway path, no runReconfirm call is made — the
  // backend replays the reconfirm itself using the transaction row
  // persisted at /initiate time, with alreadyPaidOnline=true so credit
  // isn't touched and paymentMode="ONLINE" is stamped.
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const ccavenueOrderId = searchParams.get("ccavenueOrderId");
    const ccavenueStatus = searchParams.get("ccavenueStatus");
    if (!ccavenueOrderId) return;
    if (!selected) return;

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
        await axiosInstance.post(
          `/api/payment/ccavenue/finalize-daystay-reconfirm/${ccavenueOrderId}`,
        );
        toast.success("Booking reconfirmed successfully!");
        await fetchDetail();
      } catch (err) {
        console.error("Post-payment day-stay reconfirm finalize failed:", err);
        toast.error(
          err?.response?.data?.message ||
            "Payment succeeded but the booking could not be reconfirmed. Please contact support with your payment reference.",
        );
      } finally {
        setConfirmingBooking(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, selected]);

  // ── Reject (Reconfirm popup → "Reject") ────────────────────────────
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
      await axiosInstance.patch(
        `/api/day-stay-booking/${bookingId}/confirmation-status`,
        {
          action: "REJECT",
          rejectedBy: rb,
          rejectionRemarks: (rejectionRemarks || "").trim() || null,
        }
      );
      setShowRejectModal(false);
      toast.success("Booking rejected.");
      await fetchDetail();
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Failed to reject booking. Please try again."
      );
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
        `/api/day-stay-booking/${bookingId}/agent-reference`
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
        `/api/day-stay-booking/${bookingId}/agent-reference`,
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

  // ── Confirmation Number (prefill from agent-reference, save via PATCH) ──
  const openConfirmationNoModal = async () => {
    setConfirmationNoInput("");
    setConfirmationNoError("");
    setShowConfirmationNoModal(true);
    try {
      const res = await axiosInstance.get(
        `/api/day-stay-booking/${bookingId}/agent-reference`
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
        `/api/day-stay-booking/${bookingId}/confirmation-status`,
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

  // ── Notes (modal-based; replaces the standalone /notes page link) ──
  const fetchNotes = useCallback(() => {
    if (!bookingId) return undefined;
    setNotesLoading(true);
    return axiosInstance
      .get(`/api/day-stay-booking/${bookingId}/notes`)
      .then((res) => {
        // Endpoint returns a bare array of note rows.
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
      // SAME endpoint + payload shape the standalone /notes page uses
      // (body field is `note`, not `noteText`). Nothing about how notes are
      // stored is changed.
      const createdBy =
        localStorage.getItem("UserName") ||
        sessionStorage.getItem("UserName") ||
        "unknown";
      const res = await axiosInstance.post(
        `/api/day-stay-booking/${bookingId}/notes`,
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
    setRemarkInput(selected?.remarks || "");
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
      await axiosInstance.post(`/api/day-stay-booking/${bookingId}/remark`, {
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
  // Typed document — backs Voucher / Proforma Voucher / Invoice /
  // Proforma Invoice via GET /api/day-stay-bookings/:id/pdf?type=…
  // The backend persists the PDF and returns { status, message, pdfUrl };
  // we render that URL inside an <iframe> modal on this page.
  const handleDocument = async (type, label) => {
    if (!bookingId) return;
    try {
      setGeneratingPdfType(type);
      const res = await axiosInstance.get(
        `/api/day-stay-bookings/${bookingId}/pdf`,
        { params: { type } },
      );
      if (res.data && res.data.status === "SUCCESS" && res.data.pdfUrl) {
        setPdfPreview({
          url: res.data.pdfUrl,
          label: label || type,
          type: String(type).toUpperCase(),
        });
      } else {
        toast.error(res.data?.message || `Failed to generate ${label || "document"}`);
      }
    } catch (e) {
      toast.error(
        e.response?.data?.message || `Failed to generate ${label || "document"}`,
      );
    } finally {
      setGeneratingPdfType(null);
    }
  };

  // Send a typed PDF to a custom recipient (admin-only). Triggered from
  // the PDF preview modal's "Send Email" button. Posts to /send-pdf-email
  // (same endpoint the existing voucher modal uses) with { email, pdfUrl,
  // bookingId }.
  const openSendEmailModal = (docType, label) => {
    setSendEmailDocType(docType);
    setSendEmailDocLabel(label);
    setSendEmailRecipient("");
    setSendEmailNote("");
    setSendEmailError("");
    setShowSendEmailModal(true);
  };

  const sendDocumentEmail = async () => {
    const recipient = (sendEmailRecipient || "").trim();
    if (!recipient) {
      setSendEmailError("Recipient email is required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      setSendEmailError("Enter a valid email address");
      return;
    }
    setSendEmailError("");
    try {
      setSendingEmail(true);
      const res = await axiosInstance.post(
        "/api/day-stay-booking/send-pdf-email",
        {
          email: recipient,
          pdfUrl: pdfPreview?.url || "",
          bookingId,
          docType: sendEmailDocType,
          note: sendEmailNote || null,
        },
      );
      if (res.data?.status === "SUCCESS" || res.data?.success !== false) {
        toast.success(res.data?.message || `${sendEmailDocLabel || "Document"} emailed`);
        setShowSendEmailModal(false);
      } else {
        toast.error(res.data?.message || "Failed to send document");
      }
    } catch (e) {
      toast.error(e.response?.data?.message || "Failed to send document");
    } finally {
      setSendingEmail(false);
    }
  };

  // Booking lifecycle events for the History modal. Pure derivation from
  // the loaded booking — no API call. Rows are gated on the timestamp
  // being present. Historical rows from before per-action user capture
  // fall back to "-" (Created additionally falls back to the creator
  // label). Sorted chronologically.
  const creatorLabel =
    selected?.createdBy ||
    selected?.employeeName ||
    selected?.agentName ||
    selected?.createdByRole ||
    selected?.source ||
    "-";
  const bookingHistory = (() => {
    if (!selected) return [];
    const events = [];
    // Each event carries the resulting booking status right after that
    // action ran — surfaced in the new "Status" column so the History
    // modal reads as a lifecycle timeline (Confirmed → ReConfirmed →
    // Cancelled) instead of a bare action log. Mirrors the identical
    // treatment on BookingDetailedView / LongStayBookingDetailView.
    const createdRowStatus = isOnRequestRoom ? "On Request" : "Confirmed";
    const createdTs = selected.createdAt || selected.bookingDate;
    if (createdTs) {
      events.push({
        action: "Booking Created",
        status: createdRowStatus,
        at: createdTs,
        by: creatorLabel,
        // Captured at create time only — later lifecycle rows show "-".
        location: selected.bookingLocation,
        ip: selected.ipAddress,
      });
    }
    // The day-stay DTO names these confirmedAt / reconfirmedAt (the hotel and
    // long-stay DTOs use *Date). Read the day-stay names first and keep the
    // *Date fallback so this stays correct if the payload is ever aligned.
    const confirmedTs = selected.confirmedAt || selected.confirmedDate;
    if (confirmedTs) {
      events.push({
        action: "Booking Confirmed",
        // For an On Request row the "Confirmed" action is the step-1
        // supplier acknowledgement, so the status label reads
        // "On Request/Confirmed" to preserve the on-request origin.
        status: isOnRequestRoom ? "On Request/Confirmed" : "Confirmed",
        at: confirmedTs,
        by: selected.confirmedBy || "-",
        // Per-action audit. Bookings confirmed at create time copy the create
        // pair; a later Confirm stamps the operator's own location/IP. Legacy
        // rows have both null and render "-".
        location: selected.confirmedLocation,
        ip: selected.confirmedIp,
      });
    }
    const reconfirmedTs = selected.reconfirmedAt || selected.reconfirmedDate;
    if (reconfirmedTs) {
      events.push({
        action: "Booking Reconfirmed",
        status: isOnRequestRoom
          ? "On Request/Confirmed/Reconfirmed"
          : "ReConfirmed",
        at: reconfirmedTs,
        by: selected.reconfirmedBy || "-",
        location: selected.reconfirmedLocation,
        ip: selected.reconfirmedIp,
      });
    }
    const cancelTs = selected.cancelledAt || selected.cancelledDate;
    if (cancelTs) {
      events.push({
        action: "Booking Cancelled",
        status: "Cancelled",
        at: cancelTs,
        by: selected.cancelledBy || "-",
        location: selected.cancelledLocation,
        ip: selected.cancelledIp,
      });
    }
    return events.sort((a, b) => {
      const ta = parseLocal(a.at)?.getTime() ?? 0;
      const tb = parseLocal(b.at)?.getTime() ?? 0;
      return ta - tb;
    });
  })();

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
      const agentId = selected?.agentId
        ? Number(String(selected.agentId).trim())
        : null;
      const [docRes, agentRes] = await Promise.all([
        axiosInstance
          .get(`/api/day-stay-bookings/${bookingId}/pdf`, {
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
        `/api/day-stay-booking/${bookingId}/resend-mail`,
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

  const isCancelled = !!selected?.isCancelled || isCancelledStatus;

  // Derived totals / display helpers for the cards.
  const totalRooms = selected?.rooms?.length ?? 0;
  const totalAdults =
    selected?.rooms?.reduce((s, r) => s + (Number(r.adults) || 0), 0) ?? 0;
  const totalChildren =
    selected?.rooms?.reduce((s, r) => s + (Number(r.children) || 0), 0) ?? 0;

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4" style={{ overflow: "auto" }}>
          <Container fluid style={{ maxWidth: "1100px" }}>
            {/* ── Header: Back + title + booking code + status ────────── */}
            <div className="mb-3 d-flex align-items-center flex-wrap gap-2">
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
                Day Stay Booking Details
              </span>
              {selected?.bookingCode && (
                <span
                  style={{
                    marginLeft: "10px",
                    fontWeight: "700",
                    fontSize: "0.9rem",
                    color: "#c0392b",
                  }}
                >
                  {selected.bookingCode}
                </span>
              )}
              {selected && (
                <span style={{ marginLeft: "10px" }}>
                  <StatusBadge status={displayStatus} />
                </span>
              )}
            </div>

            {detailsLoading && !selected ? (
              <div className="text-center py-5">
                <Spinner animation="border" style={{ color: "#c0392b" }} />
                <p className="mt-3 text-muted">Loading booking details...</p>
              </div>
            ) : !selected ? (
              <div className="text-center py-5 text-muted">
                Booking not found.
              </div>
            ) : (
              <>
                {/* ── Booking Information ───────────────────────────────
                    Mirrors BookingDetailedView's Booking-Information block:
                    Booking Code / Hotel / Address / Star Rating / Date /
                    Window / Nights / Booking Date / Confirmed Date on the
                    left; Agent / Booked-By-Employee / Agent Ref /
                    Confirmation No. / Deadline / Refund Status / Total /
                    Status / Reconfirmed Date / Cancelled Date on the right.
                    Rows that carry no value fall back to "-" via InfoRow;
                    lifecycle-timestamp rows (Reconfirmed/Cancelled) are
                    conditionally rendered so they only appear once the
                    action has taken place. */}
                <div style={card}>
                  <div style={SECTION_HEADER}>Booking Information</div>
                  <div style={{ padding: "12px 16px" }}>
                    <Row>
                      <Col md={6}>
                        <InfoRow
                          label="Booking Code"
                          value={selected.bookingCode}
                        />
                        <InfoRow label="Hotel Name" value={selected.hotelName} />
                        <InfoRow label="Address" value={selected.address} />
                        <InfoRow
                          label="Star Rating"
                          value={
                            selected.starRating
                              ? `${selected.starRating} Star`
                              : "-"
                          }
                        />
                        <InfoRow
                          label="Date"
                          value={
                            selected.checkInDate
                              ? formatDate(selected.checkInDate)
                              : "-"
                          }
                        />
                        <InfoRow
                          label="Window"
                          value={`${(selected.checkInTime || "").slice(0, 5) || "-"} – ${
                            (selected.checkOutTime || "").slice(0, 5) || "-"
                          }`}
                        />
                        <InfoRow
                          label="No. of Nights"
                          value={
                            selected.nights
                              ? `${selected.nights} Night${
                                  selected.nights === 1 ? "" : "s"
                                }`
                              : "1 Night"
                          }
                        />
                        {selected.createdAt && (
                          <InfoRow
                            label="Booking Date"
                            value={formatDateTime(selected.createdAt)}
                          />
                        )}
                        {selected.confirmedAt && (
                          <InfoRow
                            label="Confirmed Date"
                            value={formatDateTime(selected.confirmedAt)}
                          />
                        )}
                      </Col>
                      <Col md={6}>
                        <InfoRow
                          label="Agent"
                          value={selected.agentName || selected.agentId}
                        />
                        {/* Contact — "Booking done for" value entered on the
                            booking page, shown as "<value>/<agentName>". Only
                            rendered when a value was entered. */}
                        {selected.bookingDoneFor && (
                          <InfoRow
                            label="Contact"
                            value={
                              selected.agentName
                                ? `${selected.bookingDoneFor}/${selected.agentName}`
                                : selected.bookingDoneFor
                            }
                          />
                        )}
                        {selected.employeeName && (
                          <InfoRow
                            label="Booked By Employee"
                            value={selected.employeeName}
                          />
                        )}
                        <InfoRow
                          label="Agent Reference"
                          value={selected.agentLpo}
                        />
                        <InfoRow
                          label="Confirmation No."
                          value={selected.confirmationNumber}
                        />
                        <InfoRow
                          label="Deadline Date"
                          value={
                            selected.deadlineDate ? (
                              <span
                                style={{ color: "#dc2626", fontWeight: 600 }}
                              >
                                {`${String(selected.deadlineDate).slice(0, 10)} 02:00 PM (UAE)`}
                              </span>
                            ) : (
                              "-"
                            )
                          }
                        />
                        <InfoRow
                          label="Refund Status"
                          value={
                            (selected.rooms || []).some(
                              (r) => r?.nonRefundable === true,
                            )
                              ? "Non-Refundable"
                              : "Refundable"
                          }
                        />
                        <InfoRow
                          label="Total"
                          value={
                            selected.totalAmount != null
                              ? `AED ${Number(selected.totalAmount).toFixed(2)}`
                              : "-"
                          }
                        />
                        <InfoRow
                          label="Status"
                          value={<StatusBadge status={displayStatus} />}
                        />
                        {selected.reconfirmedAt && (
                          <InfoRow
                            label="Reconfirmed Date"
                            value={formatDateTime(selected.reconfirmedAt)}
                          />
                        )}
                        {selected.cancelledAt && (
                          <InfoRow
                            label="Cancelled Date"
                            value={formatDateTime(selected.cancelledAt)}
                          />
                        )}
                      </Col>
                    </Row>
                  </div>
                </div>

                {/* ── Primary Guest ──────────────────────────────────── */}
                {selected.primaryGuest && (
                  <div style={card}>
                    <div style={SECTION_HEADER}>Primary Guest</div>
                    <div style={{ padding: "12px 16px" }}>
                      <Row>
                        <Col md={6}>
                          <InfoRow
                            label="Guest Name"
                            value={
                              [
                                selected.primaryGuest.salutation,
                                selected.primaryGuest.firstName,
                                selected.primaryGuest.lastName,
                              ]
                                .filter(Boolean)
                                .join(" ") || "-"
                            }
                          />
                          <InfoRow
                            label="Email"
                            value={selected.primaryGuest.email}
                          />
                        </Col>
                        <Col md={6}>
                          <InfoRow
                            label="Phone"
                            value={selected.primaryGuest.phone}
                          />
                          <InfoRow
                            label="LPO"
                            value={selected.primaryGuest.agentLpo}
                          />
                        </Col>
                      </Row>
                    </div>
                  </div>
                )}

                {/* ── Rooms Details ──────────────────────────────────── */}
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
                  <div style={{ padding: "8px 16px 12px" }}>
                    {(selected.rooms || []).map((r, i) => (
                      <div
                        key={i}
                        className={i > 0 ? "mt-3 pt-3 border-top" : ""}
                      >
                        <div
                          className="fw-semibold mb-2"
                          style={{ color: "#c0392b", fontSize: "0.88rem" }}
                        >
                          Room {r.roomNo ?? i + 1}
                        </div>
                        <Table
                          bordered
                          size="sm"
                          style={{ fontSize: "0.82rem", marginBottom: "8px" }}
                        >
                          <thead style={{ backgroundColor: "#f8f8f8" }}>
                            <tr>
                              <th>Category</th>
                              <th>Meal Plan</th>
                              <th>Adults</th>
                              <th>Children</th>
                              <th className="text-end">Rate</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td>{r.roomCategory}</td>
                              <td>{r.mealPlan}</td>
                              <td>{r.adults}</td>
                              <td>{r.children}</td>
                              <td className="text-end">
                                AED {Number(r.rate || 0).toFixed(2)}
                              </td>
                            </tr>
                          </tbody>
                        </Table>
                        {r.guests && r.guests.length > 0 && (
                          <Table
                            bordered
                            size="sm"
                            style={{ fontSize: "0.8rem", marginBottom: 0 }}
                          >
                            <thead style={{ backgroundColor: "#f8f8f8" }}>
                              <tr>
                                <th>#</th>
                                <th>Name</th>
                                <th>Type</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.guests.map((g, gi) => (
                                <tr key={gi}>
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
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Related Sub-Bookings of OTHER types (amendment links) ──
                    Long Stay / Day Stay / Gov Employee / Student / Senior
                    Citizen children, recorded via /api/booking-amendment-link.
                    Each row is clickable to its own (live) detail page.
                    Mirrors BookingDetailedView exactly. */}
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
                    {selected.cancellationPolicy && selected.cancellationPolicy.length > 0 ? (
                      selected.cancellationPolicy.map((p, i) => (
                        <p key={i} style={{ marginBottom: "4px" }}>
                          {typeof p === "string" ? p : p?.policyText || ""}
                        </p>
                      ))
                    ) : (
                      <span className="text-muted">
                        No cancellation policy available.
                      </span>
                    )}
                    {selected.isCancelled && (
                      <div className="alert alert-danger mt-2 mb-0 py-2 small">
                        <strong>Cancelled at:</strong>{" "}
                        {selected.cancelledAt || "—"}
                        <br />
                        <strong>Reason:</strong>{" "}
                        {selected.cancellationReason || "—"}
                      </div>
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
                    {selected.remarks ? (
                      <p style={{ marginBottom: 0 }}>{selected.remarks}</p>
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
                    {selected.specialRequests && selected.specialRequests.length > 0 ? (
                      <ul style={{ marginBottom: 0, paddingLeft: "18px" }}>
                        {selected.specialRequests.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-muted">No special requests.</span>
                    )}
                  </div>
                </div>

                {/* ── Related Notes (ad-hoc notes added via the NOTES modal) ──
                    Same data shown in the modal, surfaced here on the page so
                    notes are visible without opening the modal. Read-only;
                    saves still happen through the existing modal flow. */}
                <div style={card}>
                  <div style={SECTION_HEADER}>
                    Related Notes{" "}
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
                    Mirrors BookingDetailedView's layout: live bookings get
                    the CONFIRM/RECONFIRM split (driven by isOnRequestPending),
                    Proforma vs final docs (driven by showsFinalDocs), and
                    Agent Reference / Confirmation No. guards. Cancelled
                    bookings drop CANCEL and CONFIRM/RECONFIRM but keep
                    every applicable read-only / docs action. */}
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

                  {!isCancelled && (
                    <button
                      style={{
                        ...BTN_DANGER,
                        opacity: isPastCheckIn ? 0.55 : 1,
                        cursor: isPastCheckIn ? "not-allowed" : "pointer",
                      }}
                      onClick={openCancel}
                      disabled={isPastCheckIn}
                      title={
                        isPastCheckIn
                          ? "Cancellation is not allowed after the check-in date."
                          : "Cancel Booking"
                      }
                    >
                      CANCEL
                    </button>
                  )}

                  {!showsFinalDocs &&
                    !isCancelledStatus &&
                    !(isOnRequestPending && !canConfirmOnRequest) && (
                      <button
                        style={{
                          ...(isOnRequestPending ? BTN_SUCCESS : BTN_TEAL),
                          opacity: isPastCheckIn ? 0.55 : 1,
                          cursor: isPastCheckIn ? "not-allowed" : "pointer",
                        }}
                        onClick={openConfirmModal}
                        disabled={isPastCheckIn}
                        title={
                          isPastCheckIn
                            ? (isOnRequestPending
                                ? "Confirmation is not allowed after the check-in date."
                                : "Reconfirmation is not allowed after the check-in date.")
                            : undefined
                        }
                      >
                        {/* An On-Request booking hasn't been confirmed yet,
                            so the first action is CONFIRM. Once confirmed
                            it behaves like a normal Confirmed booking →
                            RECONFIRM. Agents don't get to see this action
                            for On Request bookings — only admin / super-
                            admin do; see canConfirmOnRequest above. */}
                        {isOnRequestPending ? "CONFIRM" : "RECONFIRM"}
                      </button>
                    )}

                  {/* Proforma Voucher / Invoice — pre-finalised state, and
                      not available while On-Request is still pending. */}
                  {!isCancelled && !showsFinalDocs && !isOnRequestPending && (
                    <>
                      <button
                        style={BTN_INFO}
                        disabled={generatingPdfType === "PROFORMA_VOUCHER"}
                        onClick={() => handleDocument("PROFORMA_VOUCHER", "Proforma Voucher")}
                      >
                        {generatingPdfType === "PROFORMA_VOUCHER" ? "GENERATING..." : "PROFORMA VOUCHER"}
                      </button>
                      <button
                        style={BTN_INFO}
                        disabled={generatingPdfType === "PROFORMA_INVOICE"}
                        onClick={() => handleDocument("PROFORMA_INVOICE", "Proforma Invoice")}
                      >
                        {generatingPdfType === "PROFORMA_INVOICE" ? "GENERATING..." : "PROFORMA INVOICE"}
                      </button>
                    </>
                  )}

                  {/* Final Voucher / Invoice — finalised state. */}
                  {!isCancelled && showsFinalDocs && (
                    <>
                      <button
                        style={BTN_INFO}
                        disabled={generatingPdfType === "VOUCHER"}
                        onClick={() => handleDocument("VOUCHER", "Voucher")}
                      >
                        {generatingPdfType === "VOUCHER" ? "GENERATING..." : "VOUCHER"}
                      </button>
                      <button
                        style={BTN_INFO}
                        disabled={generatingPdfType === "INVOICE"}
                        onClick={() => handleDocument("INVOICE", "Invoice")}
                      >
                        {generatingPdfType === "INVOICE" ? "GENERATING..." : "INVOICE"}
                      </button>
                    </>
                  )}

                  {/* Cancelled booking docs: pick the final or proforma pair
                      based on the pre-cancellation status. */}
                  {isCancelled && cancelledShowsFinalDocs && (
                    <>
                      <button
                        style={BTN_INFO}
                        disabled={generatingPdfType === "VOUCHER"}
                        onClick={() => handleDocument("VOUCHER", "Voucher")}
                      >
                        {generatingPdfType === "VOUCHER" ? "GENERATING..." : "VOUCHER"}
                      </button>
                      <button
                        style={BTN_INFO}
                        disabled={generatingPdfType === "INVOICE"}
                        onClick={() => handleDocument("INVOICE", "Invoice")}
                      >
                        {generatingPdfType === "INVOICE" ? "GENERATING..." : "INVOICE"}
                      </button>
                    </>
                  )}
                  {isCancelled && !cancelledShowsFinalDocs && (
                    <>
                      <button
                        style={BTN_INFO}
                        disabled={generatingPdfType === "PROFORMA_VOUCHER"}
                        onClick={() => handleDocument("PROFORMA_VOUCHER", "Proforma Voucher")}
                      >
                        {generatingPdfType === "PROFORMA_VOUCHER" ? "GENERATING..." : "PROFORMA VOUCHER"}
                      </button>
                      <button
                        style={BTN_INFO}
                        disabled={generatingPdfType === "PROFORMA_INVOICE"}
                        onClick={() => handleDocument("PROFORMA_INVOICE", "Proforma Invoice")}
                      >
                        {generatingPdfType === "PROFORMA_INVOICE" ? "GENERATING..." : "PROFORMA INVOICE"}
                      </button>
                    </>
                  )}

                  {/* Add Agent Reference — guarded both for live (must be
                      Confirmed or later, not On-Request) and cancelled
                      (must have been Confirmed-or-later before cancel). */}
                  {!isCancelled && (
                    <button
                      style={BTN_SKY}
                      onClick={() => {
                        if (!isConfirmedOrLater || isOnRequestPending) {
                          toast.error(
                            "Agent Reference can only be added once the booking is Confirmed or ReConfirmed."
                          );
                          return;
                        }
                        openConfirmStatusModal();
                      }}
                    >
                      ADD AGENT REFERENCE
                    </button>
                  )}
                  {isCancelled && (
                    <button
                      style={BTN_SKY}
                      onClick={() => {
                        if (!cancelledFromConfirmedOrLater) {
                          toast.error(
                            "Agent Reference can only be added on bookings that were Confirmed before cancellation."
                          );
                          return;
                        }
                        openConfirmStatusModal();
                      }}
                    >
                      ADD AGENT REFERENCE
                    </button>
                  )}

                  {/* Confirmation No. — hidden from agents; same guard
                      pattern as Agent Reference. */}
                  {!isCancelled && !isAgentRole && (
                    <button
                      style={BTN_INDIGO}
                      onClick={() => {
                        if (!isConfirmedOrLater || isOnRequestPending) {
                          toast.error(
                            "Confirmation Number can only be added once the booking is Confirmed or ReConfirmed."
                          );
                          return;
                        }
                        openConfirmationNoModal();
                      }}
                    >
                      CONFIRMATION NO.
                    </button>
                  )}
                  {isCancelled && !isAgentRole && (
                    <button
                      style={BTN_INDIGO}
                      onClick={() => {
                        if (!cancelledFromConfirmedOrLater) {
                          toast.error(
                            "Confirmation Number can only be added on bookings that were Confirmed before cancellation."
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

                {/* ── Booking Date footer ───────────────────────────── */}
                <div
                  style={{
                    textAlign: "right",
                    fontSize: "0.8rem",
                    color: "#555",
                    paddingBottom: "8px",
                  }}
                >
                  Booking Date :{" "}
                  {selected.bookingDate
                    ? formatDateTime(selected.bookingDate)
                    : "-"}
                </div>

                {/* ── Reconfirm Booking Modal ───────────────────────── */}
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
                      <span>{isOnRequestPending ? "Confirm Booking" : "Reconfirm Booking"}</span>
                    </Modal.Title>
                  </Modal.Header>
                  <Modal.Body style={{ padding: "1.5rem" }}>
                    <div className="text-center">
                      <p className="fs-5 mb-3">
                        {isOnRequestPending
                          ? "Approve this On-Request booking and confirm it now?"
                          : "Are you sure you want to reconfirm the booking?"}
                      </p>
                      <div className="text-muted small mb-3">
                        <div>
                          <strong>Booking Code:</strong>{" "}
                          {selected.bookingCode || "N/A"}
                        </div>
                        {selected.hotelName && (
                          <div>
                            <strong>Hotel:</strong> {selected.hotelName}
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
                    {/* Reject is only meaningful while the booking is still
                        On-Request pending. It cancels the booking with a
                        "rejected by …" reason. */}
                    {isOnRequestPending && (
                      <Button
                        variant="danger"
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
                      ) : (
                        isOnRequestPending ? "Confirm" : "Reconfirm"
                      )}
                    </Button>
                  </Modal.Footer>
                </Modal>

                {/* ── Booking Cannot Be Completed (Reconfirm) ──
                    Voucher-Later / On-Request Reconfirm + agent has no
                    credit AND Card payment is disabled → the operator has
                    no path to complete this action. Blocks the reconfirm
                    with a courteous message. Same shape as the hotel
                    detail page's block modal. */}
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
                    Surfaced when the operator reconfirms a Voucher-Later /
                    On-Request booking and the agent still has no credit
                    but CAN pay by card. Same shape as the hotel detail
                    page so the operator gets a consistent experience. */}
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
                    Identical to the hotel detail picker (BookingDetailedView).
                    On Proceed:
                      • CC Avenue → real billing-page redirect via the shared
                        CCAvenueCheckoutPage; the browser fully navigates away
                        to CC Avenue's hosted page and back with
                        ?ccavenueOrderId=&ccavenueStatus= appended, which the
                        resume effect above catches and finalizes.
                      • Any other gateway → dummy /payment/:gateway page with
                        location.state.resumeReconfirm = true so the older
                        resume effect fires runReconfirm directly. */}
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
                            htmlFor={`ds-reconfirm-gw-${g.id}`}
                            className={`pg-option${
                              isSelected ? " pg-option-selected" : ""
                            }`}
                          >
                            <input
                              type="radio"
                              name="ds-reconfirm-payment-gateway"
                              id={`ds-reconfirm-gw-${g.id}`}
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

                        // ── CC Avenue: real billing-page redirect ──
                        // Distinct from the dummy /payment/:gateway path below
                        // — the browser fully navigates away to CC Avenue's
                        // hosted page and back, so the resume signal has to
                        // travel as a URL query param (React Router state
                        // doesn't survive a real cross-origin redirect). See
                        // the ccavenueOrderId resume effect above.
                        // reconfirmBookingId tells CCAvenueCheckoutPage to pay
                        // off THIS existing booking (the backend has the
                        // total + agent + everything else it needs).
                        // flowType is explicit (unlike hotel, which defaults
                        // to RECONFIRM when only reconfirmBookingId is set)
                        // so /initiate reaches the DAYSTAY_RECONFIRM arm.
                        if (selectedGateway === "ccavenue") {
                          const guest = selected?.primaryGuest;
                          const billingName = guest
                            ? [guest.salutation, guest.firstName, guest.lastName]
                                .filter(Boolean)
                                .join(" ")
                            : "";
                          navigate("/payment/ccavenue-redirect", {
                            state: {
                              amountLabel: `AED ${Number(insufficientAmount).toFixed(2)}`,
                              billingName,
                              returnTo: location.pathname,
                              reconfirmBookingId: bookingId,
                              flowType: "DAYSTAY_RECONFIRM",
                            },
                          });
                          return;
                        }

                        // Dummy /payment/:gateway flow (test/local only) —
                        // kept for parity with BookingDetailedView; no
                        // gateway currently routes through it because
                        // CCAvenue is the only PAYMENT_GATEWAYS entry.
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

                {/* ── Reject Booking Modal ──────────────────────────── */}
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
                          Saving...
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
                    <div className="text-muted small mb-3">
                      <div>
                        <strong>Booking Code:</strong>{" "}
                        {selected.bookingCode || "N/A"}
                      </div>
                      {selected.hotelName && (
                        <div>
                          <strong>Hotel:</strong> {selected.hotelName}
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
                    <Modal.Title className="fw-bold">Booking Remark</Modal.Title>
                  </Modal.Header>
                  <Modal.Body style={{ padding: "1.5rem" }}>
                    <Form.Group controlId="bookingRemarkInput">
                      <Form.Label className="fw-semibold mb-1">Remark</Form.Label>
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

                {/* ── Notes Modal — list existing notes (read-only) and add a
                    new one inline. POSTs to the SAME endpoint and payload
                    shape the standalone /notes page uses; no flow change. */}
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

      {/* ── Cancel modal ──────────────────────────────────────────────── */}
      <Modal
        show={showCancel}
        onHide={() => !cancelling && setShowCancel(false)}
        centered
        backdrop="static"
      >
        <Modal.Header
          closeButton={!cancelling}
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
          <p>Are you sure you want to cancel this Day Stay booking?</p>
          {/* Informational only — booking value warning. Mirrors the Total
              Amount shown on the page. Does not alter any cancellation logic. */}
          {selected?.totalAmount != null && (
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
                AED {Number(selected.totalAmount).toFixed(2)}
              </strong>
              .
              <div className="fw-semibold mt-1">
                Do you still want to cancel it?
              </div>
            </div>
          )}
          <Form.Group controlId="dayStayCancellationReason">
            <Form.Label className="fw-semibold">
              Reason <span className="text-muted">(optional)</span>
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              disabled={cancelling}
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
            disabled={cancelling}
            onClick={() => setShowCancel(false)}
          >
            Back
          </Button>
          <Button variant="danger" disabled={cancelling} onClick={submitCancel}>
            {cancelling ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Cancelling...
              </>
            ) : (
              "Confirm Cancellation"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── PDF Preview Modal ───────────────────────────────────────────
          Renders Voucher / Proforma Voucher / Invoice / Proforma Invoice
          inside an <iframe> using the pdfUrl returned by
          /api/day-stay-bookings/:id/pdf. Mirrors the pattern used in
          BookingDetailedView.jsx and the sibling gov-employee / student /
          senior-citizen views. */}
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
            {selected?.bookingCode ? ` — ${selected.bookingCode}` : ""}
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
                <FaDownload className="me-1" /> Open in new tab
              </Button>
              <Button
                variant="outline-primary"
                size="sm"
                as="a"
                href={pdfPreview.url}
                download={`DayStay_${bookingId}_${pdfPreview.type || "document"}.pdf`}
              >
                Download
              </Button>
              {/* Send Email — admin-only. Agents see download / new-tab
                  but cannot dispatch documents by email from this UI. */}
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
                            : pdfPreview.type || "VOUCHER");
                    openSendEmailModal(dt, pdfPreview.label || "Document");
                  }}
                >
                  <FaPaperPlane className="me-1" /> Send Email
                </Button>
              )}
            </>
          )}
          <Button variant="secondary" size="sm" onClick={() => setPdfPreview(null)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Add New Item picker ────────────────────────────────────────
          Cross-supplier amendment picker. Selecting one navigates to that
          flow's create form, pre-filled with the current booking code as
          the parent reference. */}
      <Modal
        show={showAddItemModal}
        onHide={() => setShowAddItemModal(false)}
        centered
        backdrop="static"
        keyboard
      >
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: "1rem" }}>Add New Item</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted small mb-3">
            Pick the booking type to amend onto{" "}
            <strong>{selected?.bookingCode || "-"}</strong>.
          </p>
          {ADD_NEW_ITEM_TYPES.map((t) => (
            <Form.Check
              key={t.key}
              type="radio"
              id={`add-item-${t.key}`}
              name="addItemType"
              label={t.label}
              value={t.key}
              checked={selectedAddItemType === t.key}
              onChange={(e) => setSelectedAddItemType(e.target.value)}
              className="mb-2"
            />
          ))}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowAddItemModal(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              const chosen = ADD_NEW_ITEM_TYPES.find(
                (t) => t.key === selectedAddItemType,
              );
              if (!chosen) return;
              const parent = selected?.parentBookingCode || selected?.bookingCode || "";
              setShowAddItemModal(false);
              navigate(
                `${chosen.route}?parentBookingCode=${encodeURIComponent(parent)}`,
              );
            }}
          >
            Continue
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Booking History ────────────────────────────────────────────
          Pure derivation from the loaded booking (no API). Rows are
          gated on the timestamp being present. */}
      <Modal
        show={showHistoryModal}
        onHide={() => setShowHistoryModal(false)}
        centered
        size="xl"
        backdrop="static"
        contentClassName="hbs-history-modal-content"
      >
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: "1rem", display: "flex", alignItems: "center", gap: 10 }}>
            <FaHistory size={16} />
            <span>
              Booking History
              {selected?.bookingCode && (
                <span style={{ opacity: 0.85, fontWeight: 500 }}>{` — ${selected.bookingCode}`}</span>
              )}
            </span>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ backgroundColor: "#f8fafc", padding: "1.25rem 1.5rem" }}>
          {bookingHistory.length === 0 ? (
            <div className="text-center text-muted py-4">
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
              {/* tableLayout "fixed" + percentage widths: the columns always
                  share the modal's width, so the popup never needs a
                  horizontal scrollbar — long values wrap inside their cell. */}
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
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
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
                  {bookingHistory.map((evt, idx) => {
                    const meta = HISTORY_ACTION_META[evt.action] || HISTORY_ACTION_FALLBACK;
                    const ActionIcon = meta.icon;
                    return (
                      <tr
                        key={`${evt.action}-${idx}`}
                        style={{ backgroundColor: idx % 2 === 1 ? "#f8fafc" : "#fff" }}
                      >
                        <td style={{ padding: "10px 14px", borderBottom: "1px solid #eef2f6", color: "#64748b" }}>
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
                            {evt.action}
                          </span>
                        </td>
                        {/* Status column — the resulting booking state right
                            after this action. Colour-coded so a timeline
                            glance conveys the progression: green for
                            confirmed / reconfirmed / on-request-confirmed,
                            amber for the original on-request state, red for
                            cancelled, slate for anything unrecognised.
                            Mirrors the identical treatment on
                            BookingDetailedView / LongStayBookingDetailView. */}
                        <td style={{ padding: "10px 14px", borderBottom: "1px solid #eef2f6" }}>
                          {(() => {
                            const raw = String(evt.status || "").trim();
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
                        <td style={{ padding: "10px 14px", borderBottom: "1px solid #eef2f6" }}>{evt.by || "-"}</td>
                        <td
                          style={{
                            padding: "10px 14px",
                            borderBottom: "1px solid #eef2f6",
                            wordBreak: "break-word",
                          }}
                        >
                          {evt.location ? (
                            <span style={{ display: "inline-flex", alignItems: "flex-start", gap: 6 }}>
                              <FaMapMarkerAlt size={11} style={{ color: "#c0392b", marginTop: 2, flexShrink: 0 }} />
                              <span>{evt.location}</span>
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td style={{ padding: "10px 14px", borderBottom: "1px solid #eef2f6" }}>
                          {evt.ip ? (
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
                              {evt.ip}
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td style={{ padding: "10px 14px", borderBottom: "1px solid #eef2f6" }}>
                          {formatDate(evt.at)}
                        </td>
                        <td style={{ padding: "10px 14px", borderBottom: "1px solid #eef2f6" }}>
                          {formatTimeOnly(evt.at)}
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
            style={{ borderRadius: 6, padding: "6px 20px", fontWeight: 600, fontSize: "0.85rem" }}
          >
            Close
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Send Document Email ──────────────────────────────────────── */}
      <Modal
        show={showSendEmailModal}
        onHide={() => setShowSendEmailModal(false)}
        centered
        backdrop="static"
        keyboard={false}
      >
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: "1rem" }}>
            Send {sendEmailDocLabel || "Document"} by Email
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted small mb-3">
            The system will email the{" "}
            <strong>{sendEmailDocLabel || "document"}</strong> for{" "}
            <strong>{selected?.bookingCode || "-"}</strong> to the recipient
            below.
          </p>
          <Form.Group className="mb-3">
            <Form.Label>Recipient Email *</Form.Label>
            <InputGroup>
              <InputGroup.Text>
                <FaEnvelope />
              </InputGroup.Text>
              <Form.Control
                type="email"
                placeholder="name@example.com"
                value={sendEmailRecipient}
                onChange={(e) => {
                  setSendEmailRecipient(e.target.value);
                  if (sendEmailError) setSendEmailError("");
                }}
                isInvalid={!!sendEmailError}
                disabled={sendingEmail}
              />
            </InputGroup>
            {sendEmailError && (
              <div className="text-danger small mt-1">{sendEmailError}</div>
            )}
          </Form.Group>
          <Form.Group>
            <Form.Label>Note (optional)</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              placeholder="Add a short message included in the email body"
              value={sendEmailNote}
              onChange={(e) => setSendEmailNote(e.target.value)}
              disabled={sendingEmail}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowSendEmailModal(false)} disabled={sendingEmail}>
            Close
          </Button>
          <Button variant="primary" onClick={sendDocumentEmail} disabled={sendingEmail}>
            {sendingEmail ? (
              <>
                <Spinner size="sm" animation="border" className="me-1" /> Sending…
              </>
            ) : (
              <>
                <FaPaperPlane className="me-1" /> Send
              </>
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Resend Mail to Agent — preview + send ────────────────────────
          Opens on the RESEND MAIL TO AGENT button click. Shows the Voucher
          PDF the mail will attach inside an <iframe>, and an editable email
          field pre-populated with the agent's on-file address. The Send
          button POSTs /api/day-stay-booking/:id/resend-mail?email=…
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
            {selected?.bookingCode ? ` — ${selected.bookingCode}` : ""}
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
