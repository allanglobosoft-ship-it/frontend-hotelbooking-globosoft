/**
 * SeniorCitizenBookingDetailView.jsx
 *
 * Detail view for a senior-citizen booking. UI + functionality mirror
 * StudentBookingDetailView.jsx: same card / section-header / info-row /
 * button styling, the same two-status flow (Confirmed → Proforma docs +
 * Reconfirm; ReConfirmed → final docs), the same action set and modals,
 * and the same "Add New Item" → child sub-booking behaviour.
 *
 * Action set (all backed by /api/senior-citizen-booking):
 *   - ADD NEW ITEM        → /new-booking/senior-citizen?parentBookingCode=<code>
 *                           (creates a child booking SNCIT7/1, SNCIT7/2, …)
 *   - CANCEL              → DELETE /api/senior-citizen-booking/:id
 *   - RECONFIRM           → PATCH  /api/senior-citizen-booking/:id/reconfirm
 *   - VOUCHER / INVOICE / PROFORMA → GET /api/senior-citizen-booking/:id/document?type=
 *   - ADD AGENT REFERENCE → GET/POST /api/senior-citizen-booking/:id/agent-reference
 *   - CONFIRMATION NO.    → POST   /api/senior-citizen-booking/:id/confirmation-no
 *   - BOOKING REMARK      → POST   /api/senior-citizen-booking/:id/remark
 *   - RESEND MAIL TO AGENT→ POST   /api/senior-citizen-booking/:id/resend-mail
 */

import React, { useCallback, useEffect, useState } from "react";
import { Container, Row, Col, Spinner, Table, Modal, Button, Form } from "react-bootstrap";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import toast from "react-hot-toast";
import {
  FaHistory, FaMapMarkerAlt, FaNetworkWired, FaCalendarAlt, FaClock,
  FaUserAlt, FaPlusCircle, FaCheckCircle, FaSyncAlt, FaTimesCircle,
} from "react-icons/fa";
// Source of the pg-option-* classes used by the Select Payment Gateway
// modal below — same import BookingDetailedView.jsx uses so the
// senior-citizen detail picker renders identically to the hotel detail
// picker.
import "../../styles/HotelBookingPage.css";

// Reverse-geocode browser coordinates to a readable address for the
// Booking History audit trail. Tries OpenStreetMap Nominatim first
// (street-level detail), then BigDataCloud (locality-level, keyless) —
// both free, CORS-enabled endpoints. Returns null when neither responds
// so the caller keeps its IP-derived fallback. Mirrors the hotel
// BookingDetailedView + the senior-citizen booking page.
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
// to a neutral slate badge.
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
// Online-payment gateways — mirrors HotelBookingPage / BookingDetailedView.
// CCAvenue is the only real gateway wired; the dummy /payment/:gateway
// path is kept as a fallback for any future non-CCAvenue entry.
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

const INFO_VALUE = { color: "#222", fontSize: "0.82rem" };

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

const InfoRow = ({ label, value }) => (
  <div style={{ marginBottom: 6 }}>
    <span style={INFO_LABEL}>{label}</span>
    <span style={INFO_VALUE}>{value ?? "-"}</span>
  </div>
);

export default function SeniorCitizenBookingDetailView() {
  const { id } = useParams();
  const navigate = useNavigate();
  // Needed by the post-payment resume effect (state.resumeReconfirm).
  const location = useLocation();
  // Role gate for admin-only actions — currently gates the "Send Email"
  // affordance inside the PDF preview modal. Matches HotelBookingPage's
  // convention.
  const activeUserRole = localStorage.getItem("currentActiveRole");
  const isAdmin = String(activeUserRole || "").toUpperCase() === "ADMIN";
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

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);

  // Operator location snapshot for the Booking History audit trail. Resolved
  // once on mount and sent on the reconfirm PATCH / cancel-reject DELETE so
  // the BE can stamp confirmed_location / reconfirmed_location /
  // cancelled_location the same way the Create flow stamps booking_location.
  // The IP is NOT resolved here — browsers only see the shared public/NAT IP;
  // SeniorCitizenBookingController fills it in from the HTTP request itself.
  // Same two-step resolution as the senior-citizen booking page: coarse
  // IP-derived city first, precise geolocation second (only if it lands and
  // permission is granted).
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

  // Cancel
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellingBooking, setCancellingBooking] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");

  // Reconfirm
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

  // Agent reference
  const [showAgentRefModal, setShowAgentRefModal] = useState(false);
  const [agentRefInput, setAgentRefInput] = useState("");
  const [agentRefError, setAgentRefError] = useState("");
  const [savingAgentRef, setSavingAgentRef] = useState(false);

  // Confirmation number
  const [showConfirmationNoModal, setShowConfirmationNoModal] = useState(false);
  const [confirmationNoInput, setConfirmationNoInput] = useState("");
  const [confirmationNoError, setConfirmationNoError] = useState("");
  const [savingConfirmationNo, setSavingConfirmationNo] = useState(false);

  // Remark
  const [showRemarkModal, setShowRemarkModal] = useState(false);
  const [remarkInput, setRemarkInput] = useState("");
  const [savingRemark, setSavingRemark] = useState(false);

  // Notes (ad-hoc, multiple) — added via the NOTES modal.
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Documents (Voucher / Proforma Voucher / Invoice / Proforma Invoice)
  const [generatingDocType, setGeneratingDocType] = useState(null);
  // PDF preview modal — { url, label, type }
  const [pdfPreview, setPdfPreview] = useState(null);
  // Resend mail — clicking the button opens a preview modal that shows the
  // Voucher PDF in an iframe and lets the admin confirm / edit the agent's
  // email before the /resend-mail POST fires. The old click-to-send flow is
  // retained inline in the modal's Send button.
  const [resendingMail, setResendingMail] = useState(false);
  const [showResendMailModal, setShowResendMailModal] = useState(false);
  const [resendMailPdfUrl, setResendMailPdfUrl] = useState("");
  const [resendMailEmail, setResendMailEmail] = useState("");
  const [resendMailEmailError, setResendMailEmailError] = useState("");
  const [resendMailPreparing, setResendMailPreparing] = useState(false);

  // Reject (only reachable when isOnRequestPending — currently unreachable
  // for senior-citizen bookings since the backend does not surface an
  // On-Request state, but the modal is wired for parity with
  // BookingDetailedView).
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectedBy, setRejectedBy] = useState("");
  const [rejectedByError, setRejectedByError] = useState("");
  const [rejectionRemarks, setRejectionRemarks] = useState("");
  const [rejectingBooking, setRejectingBooking] = useState(false);

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

  // Related notes (added via the NOTES page) — shown under the Remarks section.
  const [relatedNotes, setRelatedNotes] = useState([]);

  const fetchBooking = useCallback(() => {
    if (!id) return;
    setLoading(true);
    return axiosInstance
      .get(`/api/senior-citizen-booking/${id}`)
      .then((res) => {
        if (res.data?.success !== false) setBooking(res.data);
        else toast.error(res.data?.message || "Failed to load booking details");
      })
      .catch(() => toast.error("Error loading booking details"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchBooking();
  }, [fetchBooking]);

  // Load the booking's related notes so they can be previewed under Remarks.
  const fetchNotes = useCallback(() => {
    if (!id) return;
    axiosInstance
      .get(`/api/senior-citizen-booking/${id}/notes`)
      .then((res) => {
        if (res.data?.success) setRelatedNotes(res.data.notes || []);
      })
      .catch(() => {
        /* non-fatal — notes preview is optional */
      });
  }, [id]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // ── Status helpers ────────────────────────────────────────────────
  const normalizedStatus = String(booking?.confirmationStatus || "")
    .replace(/\s+/g, "")
    .toUpperCase();
  const isCancelled = !!booking?.cancelled;
  const isConfirmedOrLater =
    normalizedStatus === "CONFIRMED" ||
    normalizedStatus === "RECONFIRMED" ||
    normalizedStatus === "COMPLETED";
  // Final docs available once the booking is reconfirmed/completed.
  const showsFinalDocs = normalizedStatus === "RECONFIRMED" || normalizedStatus === "COMPLETED";

  // Mirrors the docs-vs-proforma rule used across the app for the resend-mail
  // preview: a still-tentative senior-citizen booking (CONFIRMED / On Request)
  // resends the Proforma Voucher; once ReConfirmed / Completed — or Cancelled
  // — it resends the real Voucher.
  const resendUsesFinalDoc =
    isCancelled ||
    normalizedStatus === "RECONFIRMED" ||
    normalizedStatus === "COMPLETED";
  const resendDocLabel = resendUsesFinalDoc
    ? "Voucher"
    : "Senior Citizen Booking Proforma Voucher";
  const resendDocType = resendUsesFinalDoc ? "VOUCHER" : "PROFORMA_VOUCHER";

  // On-Request flow mirror (degrades gracefully — senior-citizen backend
  // does not currently expose roomStatus="On Request" or
  // onRequestConfirmed, so both flags evaluate false and the page behaves
  // exactly as before).
  const isOnRequestRoom = /^on\s*request$/i.test(
    String(booking?.roomStatus || "").trim(),
  );
  const isOnRequestPending =
    isOnRequestRoom &&
    normalizedStatus === "CONFIRMED" &&
    !booking?.onRequestConfirmed;

  // For a cancelled booking the doc variant (final vs proforma) and whether
  // Agent Reference / Confirmation No. can be added are governed by the
  // status the booking held BEFORE cancellation. Senior-citizen backend may
  // not expose cancelledFromStatus; missing values keep these branches
  // inert.
  const priorStatus = String(booking?.cancelledFromStatus || "")
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
    const raw = booking?.checkInDate;
    if (!raw) return false;
    const checkIn = new Date(
      String(raw).includes("T") ? raw : `${raw}T00:00:00`,
    );
    if (isNaN(checkIn.getTime())) return false;
    return new Date().getTime() > checkIn.getTime();
  })();

  const statusColor = (() => {
    if (isCancelled) return "#dc3545"; // cancelled → red
    if (normalizedStatus === "RECONFIRMED" || normalizedStatus === "COMPLETED")
      return "#198754"; // finalised → green
    if (normalizedStatus === "CONFIRMED") return "#e67e22"; // pending reconfirm → orange
    if (normalizedStatus === "ONREQUEST" || normalizedStatus === "NOTCONFIRMED")
      return "#e67e22"; // on request → orange
    return "#6c757d"; // default → grey
  })();
  const StatusBadge = () => {
    const raw = String(booking?.confirmationStatus || "").trim();
    const isConfirmedish =
      normalizedStatus === "CONFIRMED" ||
      normalizedStatus === "RECONFIRMED" ||
      normalizedStatus === "COMPLETED";
    const base = { fontWeight: "700", fontSize: "0.85rem" };

    // ── On Request breadcrumb chain (mirrors BookingDetailedView) ──
    // On Request senior-citizen bookings are created with confirmationStatus
    // "Confirmed", so without this override the badge would read a plain
    // green "Confirmed". The chain grows as the operator acts. Each segment
    // carries the colour of the state it represents so the reader can see
    // at a glance what has already landed:
    //   "On Request"                        → orange (pending step-1)
    //   "/Confirmed"                        → green  (step-1 done)
    //   "/Reconfirmed"                      → green  (finalised)
    //   " / Cancelled" appended at any step → red
    if (isOnRequestRoom) {
      const finalised =
        normalizedStatus === "RECONFIRMED" || normalizedStatus === "COMPLETED";
      const showConfirmed = finalised || booking?.onRequestConfirmed;
      return (
        <span style={base}>
          <span style={{ color: "#e67e22" }}>On Request</span>
          {showConfirmed && (
            <span style={{ color: "#198754" }}>/Confirmed</span>
          )}
          {finalised && (
            <span style={{ color: "#198754" }}>/Reconfirmed</span>
          )}
          {isCancelled && (
            <span style={{ color: "#dc3545" }}> / Cancelled</span>
          )}
        </span>
      );
    }

    // Cancelled on top of a Confirmed/Reconfirmed booking → two-tone:
    // the original status in green, "/ Cancelled" in red.
    if (isCancelled && isConfirmedish) {
      return (
        <span style={base}>
          <span style={{ color: "#198754" }}>{raw}</span>
          <span style={{ color: "#dc3545" }}> / Cancelled</span>
        </span>
      );
    }
    if (isCancelled) {
      return <span style={{ ...base, color: "#dc3545" }}>Cancelled</span>;
    }
    // Confirmed / Reconfirmed → green; everything else uses statusColor.
    const color = isConfirmedish ? "#198754" : statusColor;
    return <span style={{ ...base, color }}>{raw || "-"}</span>;
  };

  // ── Currency ──────────────────────────────────────────────────────
  const _dispCode = booking?.displayCurrencyCode;
  const _aedTotal = Number(booking?.totalRate) || 0;
  const _dispAmt = Number(booking?.displayAmount);
  const isConverted =
    !!_dispCode && _dispCode !== "AED" && Number.isFinite(_dispAmt) && _dispAmt > 0 && _aedTotal > 0;
  const currencyCode = isConverted ? _dispCode : "AED";
  const currencyFactor = isConverted ? _dispAmt / _aedTotal : 1;
  const money = (aed) =>
    aed == null ? "-" : `${currencyCode} ${((Number(aed) || 0) * currencyFactor).toFixed(2)}`;

  // ── Handlers ──────────────────────────────────────────────────────
  const openCancelModal = () => {
    setCancellationReason("");
    setShowCancelModal(true);
  };

  const openConfirmModal = () => setShowConfirmModal(true);

  const openRejectModal = () => {
    setShowConfirmModal(false);
    setRejectedBy("");
    setRejectedByError("");
    setRejectionRemarks("");
    setShowRejectModal(true);
  };

  // Reject — only reachable for On-Request bookings. Senior-citizen
  // backend has no dedicated reject endpoint, so this calls the cancel
  // path with a "rejected by …" reason so the lifecycle progresses and
  // the audit trail captures the rejector. Mirrors BookingDetailedView
  // semantically: a rejected on-request becomes Cancelled.
  const rejectBooking = async () => {
    const by = (rejectedBy || "").trim();
    if (!by) {
      setRejectedByError("Rejected By is required");
      return;
    }
    setRejectedByError("");
    try {
      setRejectingBooking(true);
      const reasonParts = ["Rejected by " + by];
      if (rejectionRemarks.trim()) reasonParts.push(rejectionRemarks.trim());
      const res = await axiosInstance.delete(`/api/senior-citizen-booking/${id}`, {
        // Booking History audit — BE stamps bookingLocation onto
        // cancelled_location. Reject cancels the booking, so its history row
        // carries the same audit pair as a plain cancel.
        params: { reason: reasonParts.join(" — "), bookingLocation: operatorLocation },
      });
      if (res.data?.success !== false) {
        setShowRejectModal(false);
        toast.success(res.data?.message || "Booking rejected");
        await fetchBooking();
      } else {
        toast.error(res.data?.message || "Failed to reject booking");
      }
    } catch (e) {
      toast.error(e.response?.data?.message || "Failed to reject booking");
    } finally {
      setRejectingBooking(false);
    }
  };

  const cancelBooking = async () => {
    try {
      setCancellingBooking(true);
      const res = await axiosInstance.delete(`/api/senior-citizen-booking/${id}`, {
        // Booking History audit — BE stamps bookingLocation onto
        // cancelled_location. May be null if the operator denied geolocation
        // and the IP-derived fallback also failed; the BE treats null as "no
        // capture" and the "Booking Cancelled" row renders "-".
        params: {
          ...(cancellationReason ? { reason: cancellationReason } : {}),
          bookingLocation: operatorLocation,
        },
      });
      if (res.data?.success !== false) {
        setShowCancelModal(false);
        setCancellationReason("");
        toast.success("Booking cancelled");
        await fetchBooking();
      } else {
        toast.error(res.data?.message || "Failed to cancel booking");
      }
    } catch (e) {
      toast.error(e.response?.data?.message || "Failed to cancel booking");
    } finally {
      setCancellingBooking(false);
    }
  };

  // Actual reconfirm API call. Split out (mirrors BookingDetailedView)
  // so the same call can be made from (a) the Reconfirm modal's Confirm
  // button when credit is fine, and (b) the post-payment resume effect
  // after the operator pays through the gateway picker. The same PATCH
  // drives BOTH On-Request steps — the BE lands step 1 on
  // "On Request/Confirmed" and step 2 (and every other booking) on
  // ReConfirmed, and returns the step-appropriate message.
  const runReconfirm = async () => {
    try {
      setConfirmingBooking(true);
      const res = await axiosInstance.patch(
        `/api/senior-citizen-booking/${id}/reconfirm`,
        {
          // Booking History audit — BE stamps this onto confirmed_location /
          // reconfirmed_location depending on which step this call lands (the
          // same button drives both On-Request steps). May be null if the
          // operator denied geolocation and the IP-derived fallback also
          // failed; the history row then shows "-".
          bookingLocation: operatorLocation,
        },
      );
      if (res.data?.success) {
        setShowConfirmModal(false);
        toast.success(res.data.message || "Booking reconfirmed successfully!");
        await fetchBooking();
      } else {
        toast.error(res.data?.message || "Failed to reconfirm booking");
      }
    } catch (e) {
      toast.error(e.response?.data?.message || "Failed to reconfirm booking");
    } finally {
      setConfirmingBooking(false);
    }
  };

  // Reconfirm modal's Confirm/Reconfirm button handler — same payment-gate
  // pre-check as the hotel detail page (BookingDetailedView.confirmBooking).
  //
  // STEP-1 CONFIRM of an On Request booking is NEVER gated — it only moves
  // the booking to "On Request/Confirmed" (no credit settles yet), so it
  // goes straight to the BE step-1 branch. Unlike the hotel flow, senior
  // On Request bookings carry creditDeferred=TRUE, so without this explicit
  // guard the pre-check below would fire the payment gate at CONFIRM instead
  // of at RECONFIRM.
  //
  // The pre-check then runs ONLY for:
  //   • Deferred-credit bookings (creditDeferred === true — On Request /
  //     Voucher-Later creates whose debit the BE deferred to RECONFIRM;
  //     senior can't reuse the hotel's voucherGenerated marker because it
  //     stamps "On Reconfirmation" on every Confirmed booking).
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
    const isDeferredCreditBooking = booking?.creditDeferred === true;
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
    if (!booking) return;
    navigate(location.pathname, { replace: true, state: {} });
    runReconfirm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.resumeReconfirm, booking]);

  // CC Avenue post-payment resume — mirrors BookingDetailedView /
  // DayStayBookingDetailView / GovEmployeeBookingDetailView. CC Avenue's
  // redirect is a real cross-domain browser navigation, so React Router
  // `state` (resumeReconfirm above) never survives it; the backend
  // instead appends ?ccavenueOrderId=&ccavenueStatus= to the URL when
  // it redirects back here. Unlike the dummy-gateway path, no
  // runReconfirm call is made — the backend replays the reconfirm
  // itself using the transaction row persisted at /initiate time, with
  // alreadyPaidOnline=true so credit isn't touched and
  // paymentMode="ONLINE" is stamped.
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
          `/api/payment/ccavenue/finalize-seniorcitizen-reconfirm/${ccavenueOrderId}`,
        );
        if (response.data?.success) {
          toast.success(
            response.data.message || "Booking reconfirmed successfully!",
          );
          await fetchBooking();
        } else {
          toast.error(
            response.data?.message ||
              "Payment succeeded but the booking could not be reconfirmed. Please contact support with your payment reference.",
          );
        }
      } catch (err) {
        console.error("Post-payment senior-citizen reconfirm finalize failed:", err);
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

  const openAgentRefModal = async () => {
    if (!isConfirmedOrLater) {
      toast.error("Agent Reference can only be added once the booking is Confirmed or ReConfirmed.");
      return;
    }
    setAgentRefInput(booking?.agentReference || "");
    setAgentRefError("");
    setShowAgentRefModal(true);
    try {
      const res = await axiosInstance.get(`/api/senior-citizen-booking/${id}/agent-reference`);
      if (res?.data?.agentLpo) setAgentRefInput(res.data.agentLpo);
    } catch (e) {
      /* non-fatal */
    }
  };

  const saveAgentRef = async () => {
    const v = (agentRefInput || "").trim();
    if (!v) {
      setAgentRefError("Agent Reference is required");
      return;
    }
    setAgentRefError("");
    try {
      setSavingAgentRef(true);
      const res = await axiosInstance.post(`/api/senior-citizen-booking/${id}/agent-reference`, {
        agentLpo: v,
      });
      if (res.data?.success) {
        setShowAgentRefModal(false);
        toast.success(res.data.message || "Agent Reference updated successfully");
        await fetchBooking();
      } else {
        toast.error(res.data?.message || "Failed to update Agent Reference");
      }
    } catch (e) {
      toast.error(e.response?.data?.message || "Failed to update Agent Reference");
    } finally {
      setSavingAgentRef(false);
    }
  };

  const openConfirmationNoModal = async () => {
    if (!isConfirmedOrLater) {
      toast.error("Confirmation Number can only be added once the booking is Confirmed or ReConfirmed.");
      return;
    }
    setConfirmationNoInput(booking?.confirmationNumber || "");
    setConfirmationNoError("");
    setShowConfirmationNoModal(true);
    try {
      const res = await axiosInstance.get(`/api/senior-citizen-booking/${id}/agent-reference`);
      if (res?.data?.confirmationNumber) setConfirmationNoInput(res.data.confirmationNumber);
    } catch (e) {
      /* non-fatal */
    }
  };

  const saveConfirmationNo = async () => {
    const v = (confirmationNoInput || "").trim();
    if (!v) {
      setConfirmationNoError("Confirmation Number is required");
      return;
    }
    setConfirmationNoError("");
    try {
      setSavingConfirmationNo(true);
      const res = await axiosInstance.post(`/api/senior-citizen-booking/${id}/confirmation-no`, {
        confirmationNumber: v,
      });
      if (res.data?.success) {
        setShowConfirmationNoModal(false);
        toast.success(res.data.message || "Confirmation number saved successfully!");
        await fetchBooking();
      } else {
        toast.error(res.data?.message || "Failed to save confirmation number");
      }
    } catch (e) {
      toast.error(e.response?.data?.message || "Failed to save confirmation number");
    } finally {
      setSavingConfirmationNo(false);
    }
  };

  const openRemarkModal = () => {
    setRemarkInput(booking?.remarks || "");
    setShowRemarkModal(true);
  };

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
        `/api/senior-citizen-booking/${id}/notes`,
        { noteText: text, createdBy },
      );
      if (res.data?.success) {
        toast.success(res.data?.message || "Note saved");
        setShowNotesModal(false);
        setNoteInput("");
        fetchNotes(); // refresh the preview under Remarks
      } else {
        toast.error(res.data?.message || "Failed to save note");
      }
    } catch (e) {
      toast.error(e.response?.data?.message || "Failed to save note");
    } finally {
      setSavingNote(false);
    }
  };

  const saveRemark = async () => {
    const text = (remarkInput || "").trim();
    if (!text) {
      toast.error("Remark cannot be empty");
      return;
    }
    try {
      setSavingRemark(true);
      const res = await axiosInstance.post(`/api/senior-citizen-booking/${id}/remark`, { remarks: text });
      if (res.data?.success !== false) {
        setShowRemarkModal(false);
        toast.success(res.data?.message || "Remark saved successfully");
        await fetchBooking();
      } else {
        toast.error(res.data?.message || "Failed to save remark");
      }
    } catch (e) {
      toast.error(e.response?.data?.message || "Failed to save remark");
    } finally {
      setSavingRemark(false);
    }
  };

  // Typed document — backs Voucher / Proforma Voucher / Invoice /
  // Proforma Invoice via GET /api/senior-citizen-booking/:id/document?type=...
  // The backend persists the PDF and returns { status, message, pdfUrl };
  // we render that URL inside an <iframe> modal on this page.
  const handleDocument = async (type, label) => {
    try {
      setGeneratingDocType(type);
      const res = await axiosInstance.get(`/api/senior-citizen-booking/${id}/document`, {
        params: { type },
      });
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
      setGeneratingDocType(null);
    }
  };

  /**
   * Open the RESEND MAIL preview modal. Two parallel calls hydrate the
   * modal so the admin sees exactly what's about to go out:
   *   1) /document?type=VOUCHER — the same PDF the mail will attach,
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
          .get(`/api/senior-citizen-booking/${id}/document`, {
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
      const res = await axiosInstance.post(
        `/api/senior-citizen-booking/${id}/resend-mail`,
        null,
        { params: { email } },
      );
      if (res.data?.success) {
        toast.success(res.data.message || "Mail resent to agent");
        setShowResendMailModal(false);
      } else {
        toast.error(res.data?.message || "Failed to resend mail");
      }
    } catch (e) {
      toast.error(e.response?.data?.message || "Failed to resend mail");
    } finally {
      setResendingMail(false);
    }
  };

  // Send a typed PDF to a custom recipient (admin-only). Triggered from
  // the PDF preview modal's "Send Email" button. The backend endpoint
  // mirrors /api/booking-document-email/{id}; if the senior-citizen
  // backend hasn't wired it yet, the modal surfaces the failure clearly.
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
    if (!email) {
      setSendEmailError("Recipient email is required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setSendEmailError("Enter a valid email address");
      return;
    }
    setSendEmailError("");
    try {
      setSendingEmail(true);
      const res = await axiosInstance.post(
        `/api/senior-citizen-booking-document-email/${id}`,
        {
          email,
          docType: sendEmailDocType,
          note: sendEmailNote || null,
        },
      );
      if (res.data?.success !== false) {
        toast.success(res.data?.message || "Document emailed");
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
  // being present, so a booking that was never reconfirmed/cancelled
  // simply omits those rows. "Performed By" reads per-action fields the
  // backend may capture (createdBy / confirmedBy / reconfirmedBy /
  // cancelledBy). Historical rows from before those captures fall back
  // to "-" (Created additionally falls back to the creator label).
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
    if (booking.bookingDate) {
      events.push({
        action: "Booking Created",
        at: booking.bookingDate,
        by: creatorLabel,
        // Captured at create time only — later lifecycle rows show "-".
        location: booking.bookingLocation,
        ip: booking.ipAddress,
      });
    }
    if (booking.confirmedDate) {
      events.push({
        action: "Booking Confirmed",
        at: booking.confirmedDate,
        by: booking.confirmedBy || "-",
        // Per-action audit captured on the RECONFIRM PATCH (On-Request step 1).
        // Rows actioned before this was captured have both null and render "-".
        location: booking.confirmedLocation,
        ip: booking.confirmedIp,
      });
    }
    if (booking.reconfirmedDate) {
      events.push({
        action: "Booking Reconfirmed",
        at: booking.reconfirmedDate,
        by: booking.reconfirmedBy || "-",
        location: booking.reconfirmedLocation,
        ip: booking.reconfirmedIp,
      });
    }
    const cancelTs = booking.cancelledAt || booking.cancelledDate;
    if (cancelTs) {
      events.push({
        action: "Booking Cancelled",
        at: cancelTs,
        by: booking.cancelledBy || "-",
        // Per-action audit captured on the cancel/reject DELETE. Rows
        // cancelled before this was captured have both null and render "-".
        location: booking.cancelledLocation,
        ip: booking.cancelledIp,
      });
    }
    return events.sort((a, b) => {
      const ta = parseLocal(a.at)?.getTime() ?? 0;
      const tb = parseLocal(b.at)?.getTime() ?? 0;
      return ta - tb;
    });
  })();

  const c = booking?.customer || {};
  const guestName =
    [c.salutation, c.firstName, c.middleName, c.lastName].filter(Boolean).join(" ") || "-";
  const rooms = booking?.rooms || [];
  const totalAdults = rooms.reduce((s, r) => s + (r.adults || 0), 0);
  const totalChildren = rooms.reduce((s, r) => s + (r.children || 0), 0);

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4" style={{ overflow: "auto" }}>
          <Container fluid style={{ maxWidth: "1100px" }}>
            {/* Back button */}
            <div className="mb-3">
              <button style={BTN_NEUTRAL} onClick={() => navigate(-1)}>
                ← Back
              </button>
              <span
                style={{ marginLeft: "12px", fontWeight: "700", fontSize: "1.1rem", color: "#333" }}
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
              <div className="text-center py-5 text-muted">Booking not found.</div>
            ) : (
              <>
                {/* ── Booking Info ─────────────────────────────────────── */}
                <div style={card}>
                  <div style={SECTION_HEADER}>Booking Information</div>
                  <div style={{ padding: "12px 16px" }}>
                    <Row>
                      <Col md={6}>
                        <InfoRow label="Booking Code" value={booking.bookingCode} />
                        <InfoRow label="Hotel Name" value={booking.hotelName} />
                        <InfoRow label="Address" value={booking.address} />
                        <InfoRow
                          label="Star Rating"
                          value={booking.starRating ? `${booking.starRating} Star` : "-"}
                        />
                        <InfoRow label="Check-In" value={formatDateTime(booking.checkInDate)} />
                        <InfoRow label="Check-Out" value={formatDateTime(booking.checkOutDate)} />
                        <InfoRow
                          label="No. of Nights"
                          value={booking.nights ? `${booking.nights} Nights` : "-"}
                        />
                      </Col>
                      <Col md={6}>
                        <InfoRow label="Agent" value={booking.agentId} />
                        {booking.employeeName && (
                          <InfoRow label="Booked By Employee" value={booking.employeeName} />
                        )}
                        <InfoRow
                          label="Deadline Date"
                          value={
                            booking.deadlineDate ? (
                              <span style={{ color: "#dc3545", fontWeight: 600 }}>
                                {booking.deadlineDate.replace("T", " ")}
                              </span>
                            ) : (
                              "-"
                            )
                          }
                        />
                        {booking.agentReference && (
                          <InfoRow label="Agent Reference" value={booking.agentReference} />
                        )}
                        {booking.confirmationNumber && (
                          <InfoRow label="Confirmation No." value={booking.confirmationNumber} />
                        )}
                        <InfoRow label="Refund Status" value={booking.refundStatus} />
                        <InfoRow label="Voucher" value={booking.voucherGenerated} />
                        <InfoRow label="Payment Mode" value={booking.paymentMode} />
                        <InfoRow label="Total" value={money(booking.totalRate)} />
                        <InfoRow label="Status" value={<StatusBadge />} />
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
                          <InfoRow label="Guest Name" value={guestName} />
                          <InfoRow label="Nationality" value={c.nativeCountry} />
                        </Col>
                      </Row>
                    </div>
                  </div>
                )}

                {/* ── Senior Citizen Verification (senior-specific) ────── */}
                <div style={card}>
                  <div style={SECTION_HEADER}>Senior Citizen Verification</div>
                  <div style={{ padding: "12px 16px" }}>
                    <Row>
                      <Col md={6}>
                        <InfoRow label="Senior Citizen Name" value={booking.seniorCitizenName} />
                        <InfoRow
                          label="Verification Method"
                          value={
                            booking.verificationMethod === "EMPLOYEE_CODE"
                              ? "Employee Code"
                              : booking.verificationMethod
                              ? "ID Document Upload"
                              : "-"
                          }
                        />
                      </Col>
                      <Col md={6}>
                        {booking.seniorCitizenCode && (
                          <InfoRow label="Citizen Code" value={booking.seniorCitizenCode} />
                        )}
                        {booking.govEmployeeDepartment && (
                          <InfoRow label="Department" value={booking.govEmployeeDepartment} />
                        )}
                      </Col>
                    </Row>
                    {booking.govtIdFileName && (
                      <InfoRow label="Uploaded Document" value={booking.govtIdFileName} />
                    )}
                  </div>
                </div>

                {/* ── Rooms Details ───────────────────────────────────── */}
                <div style={card}>
                  <div style={SECTION_HEADER}>Rooms Details</div>
                  <div style={{ padding: "12px 16px" }}>
                    <div style={{ fontSize: "0.82rem", color: "#555", marginBottom: 8 }}>
                      No of Rooms - {rooms.length} &nbsp;|&nbsp; No of Guests - {totalAdults} Adult
                      {totalAdults !== 1 ? "s" : ""}
                      {totalChildren ? `, ${totalChildren} Child${totalChildren !== 1 ? "ren" : ""}` : ""}
                    </div>
                    <Table bordered size="sm" style={{ fontSize: "0.8rem", marginBottom: 8 }}>
                      <thead style={{ backgroundColor: "#f8f9fa" }}>
                        <tr>
                          <th>#</th>
                          <th>Category</th>
                          <th>Meal Plan</th>
                          <th>Adults</th>
                          <th>Children</th>
                          <th>Refund</th>
                          <th className="text-end">Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rooms.map((r, idx) => (
                          <tr key={r.roomBookingId || idx}>
                            <td>{r.roomNo || idx + 1}</td>
                            <td>{r.roomCategory || "-"}</td>
                            <td>{r.mealPlan || "-"}</td>
                            <td>{r.adults || 0}</td>
                            <td>{r.children || 0}</td>
                            <td>{r.nonRefundable ? "Non-Refundable" : "Flexible"}</td>
                            <td className="text-end">{money(r.rate)}</td>
                          </tr>
                        ))}
                        {rooms.length === 0 && (
                          <tr>
                            <td colSpan={7} className="text-center text-muted">
                              No rooms.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </Table>
                    {/* Per-room guests */}
                    {rooms.some((r) => Array.isArray(r.guests) && r.guests.length > 0) && (
                      <div style={{ fontSize: "0.8rem" }}>
                        {rooms.map((r, idx) =>
                          Array.isArray(r.guests) && r.guests.length > 0 ? (
                            <div key={r.roomBookingId || idx} className="mb-1">
                              <span style={INFO_LABEL}>Room {r.roomNo || idx + 1} Guests</span>
                              <span style={INFO_VALUE}>
                                {r.guests
                                  .map((g) =>
                                    [g.salutation, g.firstName, g.lastName].filter(Boolean).join(" "),
                                  )
                                  .join(", ")}
                              </span>
                            </div>
                          ) : null,
                        )}
                      </div>
                    )}
                    <div className="d-flex justify-content-between fw-bold" style={{ fontSize: "0.85rem" }}>
                      <span>Total Rate</span>
                      <span>{money(booking.totalRate)}</span>
                    </div>
                  </div>
                </div>

                {/* ── Cancellation Policy ─────────────────────────────── */}
                <div style={card}>
                  <div style={SECTION_HEADER}>Cancellation Policy</div>
                  <div style={{ padding: "12px 16px", fontSize: "0.82rem", color: "#333" }}>
                    {String(booking.refundStatus || "").toLowerCase().includes("non")
                      ? "Non-Refundable — this booking cannot be cancelled for a refund once confirmed."
                      : "Flexible — cancellation is allowed per the hotel's refund terms."}
                    {isCancelled && booking.cancellationReason && (
                      <div className="text-danger mt-2">Cancelled — {booking.cancellationReason}</div>
                    )}
                  </div>
                </div>

                {/* ── Remarks ─────────────────────────────────────────── */}
                <div style={card}>
                  <div style={SECTION_HEADER}>Remarks</div>
                  <div style={{ padding: "10px 16px", fontSize: "0.83rem", color: "#333" }}>
                    {booking.remarks ? (
                      <p style={{ marginBottom: 0 }}>{booking.remarks}</p>
                    ) : (
                      <span className="text-muted">No remarks.</span>
                    )}

                  </div>
                </div>

                {/* ── Remarks ─────────────────────────────────────────── */}
                <div style={card}>
                  <div style={SECTION_HEADER}>Notes</div>
                  <div style={{ padding: "10px 16px", fontSize: "0.83rem", color: "#333" }}>
                  {relatedNotes.length > 0 && (
                      <div style={{ marginTop: booking.remarks ? 10 : 0 }}>
                        {relatedNotes.map((n) => (
                          <div key={n.noteId} style={{ marginBottom: 6 }}>
                            <span
                              style={{
                                color: "#1d4ed8",
                                fontWeight: 600,
                                whiteSpace: "pre-wrap",
                              }}
                            >
                              {n.noteText}
                            </span>
                            {n.createdBy && (
                              <span
                                style={{
                                  color: "#9aa0a6",
                                  fontSize: "0.72rem",
                                  marginLeft: 8,
                                }}
                              >
                                — {n.createdBy}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Related Sub-Bookings (created via ADD NEW ITEM) ──── */}
                {Array.isArray(booking.subBookings) && booking.subBookings.length > 0 && (
                  <div style={card}>
                    <div style={SECTION_HEADER}>
                      Related Sub-Bookings ({booking.subBookings.length})
                    </div>
                    <div style={{ padding: "10px 16px" }}>
                      {booking.subBookings.map((sub, sIdx) => {
                        const subRooms = sub.rooms?.length ?? 0;
                        const subAdults = sub.rooms?.reduce((s, r) => s + (r.adults || 0), 0) ?? 0;
                        const subChildren = sub.rooms?.reduce((s, r) => s + (r.children || 0), 0) ?? 0;
                        return (
                          <div
                            key={sub.bookingId || sIdx}
                            style={{ borderTop: sIdx === 0 ? "none" : "1px solid #eee", padding: "10px 0" }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: "6px",
                              }}
                            >
                              <span style={{ color: "#c0392b", fontWeight: "700", fontSize: "0.9rem" }}>
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
                                    (Item #{sub.childBookingIndex})
                                  </span>
                                )}
                              </span>
                              <button
                                style={BTN_NEUTRAL}
                                onClick={() =>
                                  navigate(`/booking-details/senior-citizen-booking/${sub.bookingId}`)
                                }
                              >
                                View
                              </button>
                            </div>
                            <Row>
                              <Col md={6}>
                                <InfoRow label="Reference No." value={sub.referenceNumber} />
                                <InfoRow label="Hotel" value={sub.hotelName} />
                                <InfoRow label="Check-In" value={formatDateTime(sub.checkInDate)} />
                                <InfoRow label="Check-Out" value={formatDateTime(sub.checkOutDate)} />
                              </Col>
                              <Col md={6}>
                                <InfoRow
                                  label="Rooms / Guests"
                                  value={`${subRooms} Room${subRooms !== 1 ? "s" : ""}, ${subAdults} Adult${
                                    subAdults !== 1 ? "s" : ""
                                  }${
                                    subChildren > 0
                                      ? `, ${subChildren} Child${subChildren !== 1 ? "ren" : ""}`
                                      : ""
                                  }`}
                                />
                                <InfoRow label="Total Rate" value={money(sub.totalRate)} />
                                <InfoRow label="Status" value={sub.confirmationStatus || "-"} />
                                <InfoRow label="Booking Date" value={formatDateTime(sub.bookingDate)} />
                              </Col>
                            </Row>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Action Buttons ──────────────────────────────────────
                    Mirrors BookingDetailedView's layout: live bookings get
                    the CONFIRM/RECONFIRM split (driven by isOnRequestPending),
                    Proforma vs final docs (driven by showsFinalDocs), and
                    Agent Reference / Confirmation No. guards. Cancelled
                    bookings drop CANCEL and CONFIRM/RECONFIRM but keep
                    every applicable read-only / docs action. */}
                <div style={{ marginBottom: "10px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
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

                  {!showsFinalDocs && !isCancelled && (
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
                          so the first action is CONFIRM. Once confirmed it
                          behaves like a normal Confirmed booking →
                          RECONFIRM. */}
                      {isOnRequestPending ? "CONFIRM" : "RECONFIRM"}
                    </button>
                  )}

                  {/* Proforma Voucher / Invoice — pre-finalised state, and
                      not available while On-Request is still pending. */}
                  {!isCancelled && !showsFinalDocs && !isOnRequestPending && (
                    <>
                      <button
                        style={BTN_INFO}
                        disabled={generatingDocType === "PROFORMA_VOUCHER"}
                        onClick={() => handleDocument("PROFORMA_VOUCHER", "Proforma Voucher")}
                      >
                        {generatingDocType === "PROFORMA_VOUCHER" ? "GENERATING..." : "PROFORMA VOUCHER"}
                      </button>
                      <button
                        style={BTN_INFO}
                        disabled={generatingDocType === "PROFORMA_INVOICE"}
                        onClick={() => handleDocument("PROFORMA_INVOICE", "Proforma Invoice")}
                      >
                        {generatingDocType === "PROFORMA_INVOICE" ? "GENERATING..." : "PROFORMA INVOICE"}
                      </button>
                    </>
                  )}

                  {/* Final Voucher / Invoice — finalised state. */}
                  {!isCancelled && showsFinalDocs && (
                    <>
                      <button
                        style={BTN_INFO}
                        disabled={generatingDocType === "VOUCHER"}
                        onClick={() => handleDocument("VOUCHER", "Voucher")}
                      >
                        {generatingDocType === "VOUCHER" ? "GENERATING..." : "VOUCHER"}
                      </button>
                      <button
                        style={BTN_INFO}
                        disabled={generatingDocType === "COMPLETED"}
                        onClick={() => handleDocument("COMPLETED", "Invoice")}
                      >
                        {generatingDocType === "COMPLETED" ? "GENERATING..." : "INVOICE"}
                      </button>
                    </>
                  )}

                  {/* Cancelled booking docs: pick the final or proforma pair
                      based on the pre-cancellation status. */}
                  {isCancelled && cancelledShowsFinalDocs && (
                    <>
                      <button
                        style={BTN_INFO}
                        disabled={generatingDocType === "VOUCHER"}
                        onClick={() => handleDocument("VOUCHER", "Voucher")}
                      >
                        {generatingDocType === "VOUCHER" ? "GENERATING..." : "VOUCHER"}
                      </button>
                      <button
                        style={BTN_INFO}
                        disabled={generatingDocType === "COMPLETED"}
                        onClick={() => handleDocument("COMPLETED", "Invoice")}
                      >
                        {generatingDocType === "COMPLETED" ? "GENERATING..." : "INVOICE"}
                      </button>
                    </>
                  )}
                  {isCancelled && !cancelledShowsFinalDocs && (
                    <>
                      <button
                        style={BTN_INFO}
                        disabled={generatingDocType === "PROFORMA_VOUCHER"}
                        onClick={() => handleDocument("PROFORMA_VOUCHER", "Proforma Voucher")}
                      >
                        {generatingDocType === "PROFORMA_VOUCHER" ? "GENERATING..." : "PROFORMA VOUCHER"}
                      </button>
                      <button
                        style={BTN_INFO}
                        disabled={generatingDocType === "PROFORMA_INVOICE"}
                        onClick={() => handleDocument("PROFORMA_INVOICE", "Proforma Invoice")}
                      >
                        {generatingDocType === "PROFORMA_INVOICE" ? "GENERATING..." : "PROFORMA INVOICE"}
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
                            "Agent Reference can only be added once the booking is Confirmed or ReConfirmed.",
                          );
                          return;
                        }
                        openAgentRefModal();
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
                            "Agent Reference can only be added on bookings that were Confirmed before cancellation.",
                          );
                          return;
                        }
                        openAgentRefModal();
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
                  {isCancelled && !isAgentRole && (
                    <button
                      style={BTN_INDIGO}
                      onClick={() => {
                        if (!cancelledFromConfirmedOrLater) {
                          toast.error(
                            "Confirmation Number can only be added on bookings that were Confirmed before cancellation.",
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
                    <button style={BTN_NEUTRAL} onClick={openNotesModal}>
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

                {/* ── Booking Date footer ─────────────────────────────── */}
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
              </>
            )}
          </Container>
        </main>
      </div>

      {/* Cancel Modal */}
      <Modal show={showCancelModal} onHide={() => setShowCancelModal(false)} centered backdrop="static">
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: "1rem" }}>Cancel Booking</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted small">
            Are you sure you want to cancel this booking? Refundable bookings will have their agent
            credit restored.
          </p>
          {/* Informational only — booking value warning. Reuses the same
              money() helper used elsewhere on the page so the currency and
              amount match. Does not alter any cancellation logic. */}
          {booking?.totalRate != null && (
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
              <span className="me-2" aria-hidden="true">⚠</span>
              Total value of this booking is{" "}
              <strong>{money(booking.totalRate)}</strong>.
              <div className="fw-semibold mt-1">
                Do you still want to cancel it?
              </div>
            </div>
          )}
          <Form.Group>
            <Form.Label>Cancellation Reason (optional)</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              placeholder="Reason for cancellation"
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowCancelModal(false)} disabled={cancellingBooking}>
            Close
          </Button>
          <Button variant="danger" onClick={cancelBooking} disabled={cancellingBooking}>
            {cancellingBooking ? <Spinner size="sm" /> : "Cancel Booking"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Confirm / Reconfirm Modal — label and CTA mirror isOnRequestPending. */}
      <Modal show={showConfirmModal} onHide={() => setShowConfirmModal(false)} centered backdrop="static">
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: "1rem" }}>
            {isOnRequestPending ? "Confirm Booking" : "Reconfirm Booking"}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-2">
            {isOnRequestPending
              ? "Approve this On-Request booking and confirm it now?"
              : "Are you sure you want to reconfirm the booking?"}
          </p>
          <div className="small" style={{ color: "#555" }}>
            <div>
              <strong>Booking Code:</strong> {booking?.bookingCode || "-"}
            </div>
            <div>
              <strong>Hotel:</strong> {booking?.hotelName || "-"}
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowConfirmModal(false)} disabled={confirmingBooking}>
            Close
          </Button>
          {/* Reject is only meaningful while the booking is still On-Request
              pending. It cancels the booking with a "rejected by …" reason. */}
          {isOnRequestPending && (
            <Button variant="outline-danger" onClick={openRejectModal} disabled={confirmingBooking}>
              Reject
            </Button>
          )}
          <Button variant="success" onClick={confirmBooking} disabled={confirmingBooking}>
            {confirmingBooking
              ? <Spinner size="sm" />
              : isOnRequestPending ? "Confirm" : "Reconfirm"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Booking Cannot Be Completed (Reconfirm) ──
          Deferred-credit / On-Request Reconfirm + agent has no credit AND
          Card payment is disabled → the operator has no path to complete
          this action. Blocks the reconfirm with a courteous message. Same
          shape as the hotel detail page's block modal. */}
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

      {/* ── Online Payment Required (Reconfirm) ──
          Surfaced when the operator reconfirms a deferred-credit /
          On-Request booking and the agent still has no credit but CAN pay
          by card. Same shape as the hotel detail page. */}
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
          Identical to the hotel detail picker (BookingDetailedView) and
          the day-stay / gov-employee detail pickers.
          On Proceed:
            • CC Avenue → real billing-page redirect via the shared
              CCAvenueCheckoutPage; the browser fully navigates away to
              CC Avenue's hosted page and back with
              ?ccavenueOrderId=&ccavenueStatus= appended, which the
              resume effect below catches and finalizes.
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
                  htmlFor={`senior-reconfirm-gw-${g.id}`}
                  className={`pg-option${
                    isSelected ? " pg-option-selected" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="senior-reconfirm-payment-gateway"
                    id={`senior-reconfirm-gw-${g.id}`}
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
              // Distinct from the dummy /payment/:gateway path below —
              // the browser fully navigates away to CC Avenue's hosted
              // page and back, so the resume signal has to travel as a
              // URL query param (React Router state doesn't survive a
              // real cross-origin redirect). See the ccavenueOrderId
              // resume effect below. reconfirmBookingId tells
              // CCAvenueCheckoutPage to pay off THIS existing booking.
              // flowType is explicit (unlike hotel, which defaults to
              // RECONFIRM when only reconfirmBookingId is set) so
              // /initiate reaches the SRCITIZEN_RECONFIRM arm.
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
                    flowType: "SRCITIZEN_RECONFIRM",
                  },
                });
                return;
              }

              // Dummy /payment/:gateway flow (test/local only) — kept
              // for parity with BookingDetailedView; no gateway
              // currently routes through it because CCAvenue is the
              // only PAYMENT_GATEWAYS entry.
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

      {/* Reject Modal — only reachable when On-Request is still pending. */}
      <Modal show={showRejectModal} onHide={() => setShowRejectModal(false)} centered backdrop="static" keyboard={false}>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: "1rem" }}>Reject Booking</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted small mb-3">
            Rejecting an On-Request booking cancels it. Please record who is
            rejecting it and an optional reason.
          </p>
          <Form.Group className="mb-3">
            <Form.Label>Rejected By *</Form.Label>
            <Form.Control
              type="text"
              placeholder="Name of the person rejecting the booking"
              value={rejectedBy}
              onChange={(e) => {
                setRejectedBy(e.target.value);
                if (rejectedByError) setRejectedByError("");
              }}
              isInvalid={!!rejectedByError}
              disabled={rejectingBooking}
            />
            <Form.Control.Feedback type="invalid">{rejectedByError}</Form.Control.Feedback>
          </Form.Group>
          <Form.Group>
            <Form.Label>Remarks (optional)</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              placeholder="Reason for rejection"
              value={rejectionRemarks}
              onChange={(e) => setRejectionRemarks(e.target.value)}
              disabled={rejectingBooking}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowRejectModal(false)} disabled={rejectingBooking}>
            Close
          </Button>
          <Button variant="danger" onClick={rejectBooking} disabled={rejectingBooking}>
            {rejectingBooking ? <Spinner size="sm" /> : "Reject"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Agent Reference Modal */}
      <Modal show={showAgentRefModal} onHide={() => setShowAgentRefModal(false)} centered backdrop="static" keyboard={false}>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: "1rem" }}>Agent Reference</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-2">Are you sure you want to update the agent reference?</p>
          <div className="small mb-3" style={{ color: "#555" }}>
            <div>
              <strong>Booking Code:</strong> {booking?.bookingCode || "-"}
            </div>
            <div>
              <strong>Hotel:</strong> {booking?.hotelName || "-"}
            </div>
          </div>
          <Form.Group>
            <Form.Label>Agent Reference *</Form.Label>
            <Form.Control
              type="text"
              placeholder="Enter Agent Reference"
              value={agentRefInput}
              onChange={(e) => {
                setAgentRefInput(e.target.value);
                if (agentRefError) setAgentRefError("");
              }}
              isInvalid={!!agentRefError}
              disabled={savingAgentRef}
            />
            <Form.Control.Feedback type="invalid">{agentRefError}</Form.Control.Feedback>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowAgentRefModal(false)} disabled={savingAgentRef}>
            Close
          </Button>
          <Button variant="primary" onClick={saveAgentRef} disabled={savingAgentRef}>
            {savingAgentRef ? <Spinner size="sm" /> : "Save"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Confirmation Number Modal */}
      <Modal show={showConfirmationNoModal} onHide={() => setShowConfirmationNoModal(false)} centered backdrop="static" keyboard={false}>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: "1rem" }}>Confirmation Number</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-2">Are you sure you want to update the confirmation no?</p>
          <div className="small mb-3" style={{ color: "#555" }}>
            <div>
              <strong>Booking Code:</strong> {booking?.bookingCode || "-"}
            </div>
            <div>
              <strong>Hotel:</strong> {booking?.hotelName || "-"}
            </div>
          </div>
          <Form.Group>
            <Form.Label>Confirmation Number *</Form.Label>
            <Form.Control
              type="text"
              placeholder="Enter Hotel Confirmation Number"
              value={confirmationNoInput}
              onChange={(e) => {
                setConfirmationNoInput(e.target.value);
                if (confirmationNoError) setConfirmationNoError("");
              }}
              isInvalid={!!confirmationNoError}
              disabled={savingConfirmationNo}
            />
            <Form.Control.Feedback type="invalid">{confirmationNoError}</Form.Control.Feedback>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowConfirmationNoModal(false)} disabled={savingConfirmationNo}>
            Close
          </Button>
          <Button variant="primary" onClick={saveConfirmationNo} disabled={savingConfirmationNo}>
            {savingConfirmationNo ? <Spinner size="sm" /> : "Save"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Remark Modal */}
      <Modal show={showRemarkModal} onHide={() => setShowRemarkModal(false)} centered backdrop="static" keyboard={false}>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: "1rem" }}>Booking Remark</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group>
            <Form.Label>Remark</Form.Label>
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
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowRemarkModal(false)} disabled={savingRemark}>
            Close
          </Button>
          <Button variant="primary" onClick={saveRemark} disabled={savingRemark}>
            {savingRemark ? <Spinner size="sm" /> : "Save"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Notes Modal — add an ad-hoc note (long text). On OK we POST the note,
          close, and refresh the coloured preview under the Remarks section. */}
      <Modal
        show={showNotesModal}
        onHide={() => setShowNotesModal(false)}
        centered
        backdrop="static"
        keyboard={false}
      >
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: "1rem" }}>Add Note</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group>
            <Form.Label>Note</Form.Label>
            <Form.Control
              as="textarea"
              rows={6}
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
          <Button variant="primary" onClick={saveNote} disabled={savingNote}>
            {savingNote ? <Spinner size="sm" /> : "OK"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* PDF Preview Modal — renders Voucher / Proforma Voucher / Invoice /
          Proforma Invoice inside an <iframe> using the pdfUrl returned by
          /api/senior-citizen-booking/:id/document. Mirrors the pattern used
          in BookingDetailedView.jsx. */}
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
                download={`SeniorCitizen_${id}_${pdfPreview.type || "document"}.pdf`}
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
            <strong>{booking?.bookingCode || "-"}</strong>.
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
              const parent = booking?.parentBookingCode || booking?.bookingCode || "";
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
              {booking?.bookingCode && (
                <span style={{ opacity: 0.85, fontWeight: 500 }}>{` — ${booking.bookingCode}`}</span>
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
                      { label: "Action", width: "17%" },
                      { label: "Performed By", icon: FaUserAlt, width: "13%" },
                      { label: "Location", icon: FaMapMarkerAlt, width: "30%" },
                      { label: "IP Address", icon: FaNetworkWired, width: "14%" },
                      { label: "Date", icon: FaCalendarAlt, width: "11%" },
                      { label: "Time", icon: FaClock, width: "10%" },
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
            The system will generate the latest{" "}
            <strong>{sendEmailDocLabel || "document"}</strong> for{" "}
            <strong>{booking?.bookingCode || "-"}</strong> and email it to the
            recipient below.
          </p>
          <Form.Group className="mb-3">
            <Form.Label>Recipient Email *</Form.Label>
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
            <Form.Control.Feedback type="invalid">{sendEmailError}</Form.Control.Feedback>
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
            {sendingEmail ? <Spinner size="sm" /> : "Send"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Resend Mail to Agent — preview + send ────────────────────────
          Opens on the RESEND MAIL TO AGENT button click. Shows the Voucher
          PDF the mail will attach inside an <iframe>, and an editable email
          field pre-populated with the agent's on-file address. The Send
          button POSTs /api/senior-citizen-booking/:id/resend-mail?email=…
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
