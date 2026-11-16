/**
 * CabBookingDetailView.jsx
 *
 * Full-page detail view for a single Cab booking. Replaces the modal-based
 * "View" that used to live in CabBookingList. Per-row Voucher / Cancel
 * icons now sit at the bottom-left of this page as buttons. All endpoints
 * / behaviour are unchanged:
 *   - Voucher PDF :  GET  /api/cab/{id}/pdf?type=VOUCHER
 *   - Send voucher:  POST /api/cab/{id}/voucher/send  { email }
 *   - Cancel      :  DELETE /api/cab/delete/{id}
 *
 * Booking summary is passed via location.state when the user clicks the
 * eye icon on CabBookingList. On hard refresh we surface a "Booking not
 * found — go back" hint because the list endpoint doesn't expose a
 * per-id GET.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Container,
  Row,
  Col,
  Card,
  Table,
  Badge,
  Spinner,
  Form,
  Modal,
  Button,
  InputGroup,
} from "react-bootstrap";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import {
  FaCar,
  FaFileInvoice,
  FaEnvelope,
  FaExclamationCircle,
  FaHistory,
  FaUserAlt,
  FaMapMarkerAlt,
  FaNetworkWired,
  FaCalendarAlt,
  FaClock,
  FaPlusCircle,
  FaCheckCircle,
  FaSyncAlt,
  FaTimesCircle,
} from "react-icons/fa";
import { toast } from "react-hot-toast";
import axiosInstance from "../../components/AxiosInstance";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import {
  hidesTransporter,
  supplierText,
  withoutSupplierName,
} from "../../utils/supplierDisplay";

// Red action button used by the action row + modals (matches the Hotel
// Booking detail view's BUTTON_STYLE).
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

// Purpose-based colour variants for the action buttons — ported verbatim from
// the Hotel Booking detail view so the cab action row uses the same palette
// instead of an all-red set. They reuse the exact BUTTON_STYLE shape (size /
// padding / radius / white text); only the background colour changes. No
// handler, guard, or disabled state is affected.
const BTN_SUCCESS = { ...BUTTON_STYLE, backgroundColor: "#16a34a" }; // Email Voucher
const BTN_TEAL = { ...BUTTON_STYLE, backgroundColor: "#0d9488" }; // Reconfirm (i'way status=1)
const BTN_CONFIRM = { ...BUTTON_STYLE, backgroundColor: "#0d6efd" }; // Confirm (i'way status=0)
const BTN_DANGER = { ...BUTTON_STYLE, backgroundColor: "#dc2626" }; // Cancel
const BTN_SKY = { ...BUTTON_STYLE, backgroundColor: "#3ba2e8" }; // Add Agent Reference
const BTN_INDIGO = { ...BUTTON_STYLE, backgroundColor: "#6366f1" }; // Confirmation No.
const BTN_INFO = { ...BUTTON_STYLE, backgroundColor: "#0891b2" }; // Voucher / Invoice
const BTN_ORANGE = { ...BUTTON_STYLE, backgroundColor: "#f0922b" }; // Resend Mail
const BTN_ACCENT = { ...BUTTON_STYLE, backgroundColor: "#7c3aed" }; // Booking Remark
const BTN_NEUTRAL = { ...BUTTON_STYLE, backgroundColor: "#64748b" }; // Notes
const BTN_HISTORY = { ...BUTTON_STYLE, backgroundColor: "#334155" }; // History
const BTN_PRIMARY = { ...BUTTON_STYLE, backgroundColor: "#2563eb" }; // Add New Item

// Sub-booking types offered by "ADD NEW ITEM". Mirrors the Package / Hotel
// detail views: each entry launches its OWN existing create flow with
// ?parentBookingCode set so the backend stamps the child "{parent}/{n}"
// under this booking's code.
const ADD_NEW_ITEM_TYPES = [
  { key: "HOTEL", label: "Hotel Booking", route: "/new-booking/hotel" },
  { key: "HOTEL_24HR", label: "24 Hour Check-In", route: "/new-booking/hotel-24hr" },
  { key: "LONG_STAY", label: "Long Stay Booking", route: "/new-booking/long-stay" },
  { key: "DAY_STAY", label: "Day Stay Check-In", route: "/new-booking/day-stay" },
  { key: "GOV_EMPLOYEE", label: "Government Employee", route: "/new-booking/gov-employee" },
  { key: "STUDENT", label: "Student Booking", route: "/new-booking/student" },
  { key: "SENIOR_CITIZEN", label: "Senior Citizen Booking", route: "/new-booking/senior-citizen" },
  { key: "PACKAGE", label: "Package Booking", route: "/new-booking/package-search" },
];

// Colour + icon per Booking History action (keyed by the exact label pushed
// onto `bookingHistory`). Unknown actions fall back to a neutral slate badge.
// Ported from the Package / Hotel booking detail views so the cab History
// modal reads with the same palette.
const HISTORY_ACTION_META = {
  "Booking Created": { bg: "#e6f4ea", fg: "#1e7e34", icon: FaPlusCircle },
  "Booking Confirmed": { bg: "#e7f1ff", fg: "#1d4ed8", icon: FaCheckCircle },
  "Booking Reconfirmed": { bg: "#e0f2f1", fg: "#0d9488", icon: FaSyncAlt },
  "Booking Cancelled": { bg: "#fdecea", fg: "#c0392b", icon: FaTimesCircle },
};
const HISTORY_ACTION_FALLBACK = { bg: "#f1f5f9", fg: "#475569", icon: FaHistory };

// Date / time helpers for the History modal. Accept "yyyy-MM-ddTHH:mm:ss" or
// "yyyy-MM-dd HH:mm:ss"; return "-" when unparseable so the table stays tidy.
const parseHistoryDate = (v) => {
  if (!v) return null;
  const d = new Date(String(v).replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
};
const formatHistoryDate = (v) => {
  const d = parseHistoryDate(v);
  if (!d) return "-";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};
const formatHistoryTime = (v) => {
  const d = parseHistoryDate(v);
  if (!d) return "-";
  return d.toLocaleTimeString("en-GB", { hour12: false });
};

// Card / section styling copied from the Hotel Booking detail view.
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

const formatPrice = (price) =>
  new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
  }).format(price || 0);

// Parse the mixed date formats the cab API returns: `bookingDate` arrives as
// ISO (yyyy-MM-dd / yyyy-MM-ddTHH:mm:ss) while `pickupDate` / `dropoffDate`
// arrive as dd-MM-yyyy (or dd/MM/yyyy). Handling both here keeps every date
// on the page rendering, instead of silently collapsing dd-MM-yyyy to "-".
const parseFlexibleDate = (value) => {
  if (!value) return null;
  const str = String(value).trim();
  // ISO — yyyy-MM-dd, optionally with a time component.
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const normalized = str.includes("T") ? str : `${str}T00:00:00`;
    const d = new Date(normalized);
    return isNaN(d.getTime()) ? null : d;
  }
  // dd-MM-yyyy or dd/MM/yyyy.
  const m = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    return isNaN(d.getTime()) ? null : d;
  }
  // Fallback — let the engine try whatever else it can parse.
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
};

// "dd MMM yyyy" — mirrors the Hotel Booking detail view's date style so the
// cab detail page reads consistently (e.g. "21 Jul 2026") instead of the
// raw / locale-dependent values it showed before.
const formatDate = (value) => {
  const d = parseFlexibleDate(value);
  if (!d) return "-";
  const day = String(d.getDate()).padStart(2, "0");
  return `${day} ${d.toLocaleString("default", { month: "short" })} ${d.getFullYear()}`;
};

// Coloured status label, copied from the Hotel Booking detail view. Coloured by
// the label's dominant meaning (so the combined labels match the Package detail
// view): Cancelled → red (cancellation wins, e.g. "ReConfirmed/Cancelled"),
// Confirmed / ReConfirmed (incl. "Confirm/ReConfirmed") → green, On Request →
// orange, anything else → grey.
const StatusBadge = ({ status }) => {
  const raw = String(status ?? "-").trim();

  // Per-token colour rule — matches the pre-change whole-string logic
  // so isolated labels look identical.
  const colorFor = (label) => {
    const p = label.trim().toUpperCase();
    if (p.includes("CANCELLED")) return "#dc2626";
    if (p.includes("CONFIRM")) return "#16a34a";
    if (p === "ON REQUEST") return "#e67e22";
    return "#888";
  };

  // Combined labels like "ReConfirmed/Cancelled" render each part in its
  // own colour so the operator sees the prior state (green) alongside
  // the terminal one (red) at a glance. The slash separator stays muted.
  if (raw.includes("/")) {
    const parts = raw.split("/");
    return (
      <span style={{ fontWeight: "700", fontSize: "0.85rem" }}>
        {parts.map((part, idx) => (
          <span key={idx}>
            {idx > 0 && <span style={{ color: "#888" }}>/</span>}
            <span style={{ color: colorFor(part) }}>{part.trim()}</span>
          </span>
        ))}
      </span>
    );
  }

  return (
    <span style={{ fontWeight: "700", fontSize: "0.85rem", color: colorFor(raw) }}>
      {raw}
    </span>
  );
};

// Label / value row, copied from the Hotel Booking detail view's InfoRow.
const InfoRow = ({ label, value }) => (
  <div
    style={{ marginBottom: "6px", display: "flex", alignItems: "flex-start" }}
  >
    <span style={INFO_LABEL}>{label}</span>
    <span style={{ ...INFO_VALUE, marginLeft: "8px" }}>{value ?? "-"}</span>
  </div>
);

// Hotel-style card section wrappers (replace the old Bootstrap-bordered
// SectionHeader / SectionBody so the cab cards match the Hotel view).
const SectionHeader = ({ children }) => (
  <div style={SECTION_HEADER}>{children}</div>
);

const SectionBody = ({ children }) => (
  <div style={{ padding: "12px 16px" }}>{children}</div>
);

// Reverse-geocode browser coordinates to a readable address for the Booking
// History audit trail on the RECONFIRM / CANCEL actions. Tries OpenStreetMap
// Nominatim first (street-level), then BigDataCloud (locality-level, keyless)
// — both free, CORS-enabled. Returns null when neither responds so the caller
// keeps its IP-derived fallback. Mirrors the booking pages + PackageBookingDetailView.
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

export default function CabBookingDetailView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const booking = location.state?.booking || null;

  // ── iWay trip-status workflow (guide §11.14) ────────────────────────
  // Local snapshot so a Confirm/Reconfirm click re-renders the badge in
  // place without a full-page reload. Initialised from the row payload the
  // list page passed in (mapToGroupedCabBookingResponseDTO) — null for
  // in-house rows and for i'way rows never checked since creation.
  // mapIwayStatus treats null the same as 0, so a never-checked i'way row
  // still renders a real status ("On Request"), never a placeholder.
  const [iwayTripStatus, setIwayTripStatus] = useState(
    booking?.tripStatus ?? null,
  );
  const [iwayStatusRefreshedAt, setIwayStatusRefreshedAt] = useState(
    booking?.statusRefreshedAt ?? null,
  );
  const [iwayRefreshing, setIwayRefreshing] = useState(false);

  // Cancel modal
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Voucher: track loading state for the PDF generation
  const [voucherLoadingId, setVoucherLoadingId] = useState(null);

  // Voucher modal — opens an in-page iframe preview of the PDF and
  // lets the operator email the voucher to an arbitrary recipient.
  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [voucherPdfUrl, setVoucherPdfUrl] = useState("");
  const [voucherEmail, setVoucherEmail] = useState("");
  const [voucherEmailError, setVoucherEmailError] = useState("");
  const [voucherSending, setVoucherSending] = useState(false);

  // ── Action-button state (mirror of LongStayBookingDetailView). The cab
  // detail view has no per-id detail fetch, so the live action state is
  // seeded from the row stub and merged from each mutation's response DTO. ──
  const [actionState, setActionState] = useState({
    confirmationStatus: booking?.confirmationStatus,
    reconfirmation: booking?.reconfirmation,
    agentLpo: booking?.agentLpo || booking?.lpo,
    confirmationNumber: booking?.confirmationNumber,
    remarks: booking?.remarks,
    cancelStatus: booking?.cancelStatus,
  });

  // Cancel (with reason)
  const [cancellationReason, setCancellationReason] = useState("");

  // Cancel-modal preview — Free vs Penalty banner + refund figure the
  // operator sees before confirming. Populated by /api/cab/{id}/cancel-preview
  // on modal open. For i'way bookings this hits i'way's check-cancel
  // (§11.13) server-side; in-house rows short-circuit to "full refund".
  const [cancelPreview, setCancelPreview] = useState(null);
  const [cancelPreviewLoading, setCancelPreviewLoading] = useState(false);
  const [cancelPenaltyAcknowledged, setCancelPenaltyAcknowledged] = useState(false);

  // Client location captured when the Cancel / Reconfirm modals open, so the
  // History modal's "Booking Cancelled" / "Booking Reconfirmed" rows show
  // where the action was performed. IP is stamped server-side.
  const [cancelLocation, setCancelLocation] = useState(null);
  const [reconfirmLocation, setReconfirmLocation] = useState(null);

  // Reconfirm (Confirm / Reject popup)
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmingBooking, setConfirmingBooking] = useState(false);

  // Reject (follow-up modal from Reconfirm → Reject)
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectedBy, setRejectedBy] = useState("");
  const [rejectedByError, setRejectedByError] = useState("");
  const [rejectionRemarks, setRejectionRemarks] = useState("");
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

  // Notes — inline list + add-modal (mirrors the Package detail view; the
  // legacy NOTES button navigated to a separate page).
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [bookingNotes, setBookingNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);

  // Resend Mail — preview modal (voucher PDF + editable agent email), then
  // POST /resend-mail?email=… . Mirrors the Package booking detail view.
  const [resendingMail, setResendingMail] = useState(false);
  const [showResendMailModal, setShowResendMailModal] = useState(false);
  const [resendMailPdfUrl, setResendMailPdfUrl] = useState("");
  const [resendMailEmail, setResendMailEmail] = useState("");
  const [resendMailEmailError, setResendMailEmailError] = useState("");
  const [resendMailPreparing, setResendMailPreparing] = useState(false);

  // Booking History (read-only timeline modal)
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Add New Item (amendment) picker — mirrors the Package / Hotel detail
  // views. Opens a modal listing every sub-booking type; the chosen type's
  // create flow is launched with ?parentBookingCode so the backend chains
  // the child under this cab booking's code.
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [selectedAddItemType, setSelectedAddItemType] = useState(
    ADD_NEW_ITEM_TYPES[0].key
  );

  // PDF generation feedback + in-page preview. Shape: { url, label, type }.
  const [generatingPdfType, setGeneratingPdfType] = useState(null);
  const [pdfPreview, setPdfPreview] = useState(null);

  const bookingId = booking?.custombookingId;

  // Maps i'way trip-lifecycle status (guide §11.14, 0..5) to the
  // operator-facing label + Bootstrap Badge variant. Business labels for
  // 0/1/2 diverge from i'way's raw wording ("Pending processing" /
  // "Processing" / "Accepted") per the i'way trip-status workflow —
  // On Request / Confirmed / Reconfirmed. null/undefined (booking created
  // but never refreshed) is treated the same as 0 — "On Request" is the
  // correct label for "nothing has happened on i'way's side yet", not a
  // "no data" placeholder, so the badge is never hardcoded and never reads
  // "Not yet refreshed" for an i'way row.
  const mapIwayStatus = (status) => {
    const effective = status == null ? 0 : status;
    switch (effective) {
      case 0:  return { label: "On Request",              variant: "secondary" };
      case 1:  return { label: "Confirmed",               variant: "info"      };
      case 2:  return { label: "Reconfirmed",             variant: "primary"   };
      case 3:  return { label: "Completed",               variant: "success"   };
      case 4:  return { label: "Cancelled",               variant: "danger"    };
      case 5:  return { label: "Cancelled + penalty",     variant: "dark"      };
      default: return { label: `Unknown (${status})`,     variant: "light"     };
    }
  };

  // Formats the last-refresh timestamp as "24 Aug 2026, 15:37" — kept
  // locale-neutral so it renders the same in every operator's browser.
  const formatIwayRefreshedAt = (ts) => {
    if (!ts) return null;
    try {
      const d = new Date(typeof ts === "string" ? ts.replace(" ", "T") : ts);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleString("en-GB", {
        day:    "2-digit",
        month:  "short",
        year:   "numeric",
        hour:   "2-digit",
        minute: "2-digit",
      });
    } catch {
      return null;
    }
  };

  // Backs BOTH the Confirm button (shown at iway_trip_status = 0/null) and
  // the Reconfirm button (shown at iway_trip_status = 1) — there's no
  // standalone Refresh icon/button any more, its functionality now lives
  // entirely inside this single click handler per the i'way trip-status
  // workflow. Fires PATCH /api/cab/{bookingId}/refresh-status which
  // calls GET https://sandbox.iway.io/transnextgen/v4/orders/{orderId}
  // under the hood, updates the local snapshot, and returns the fresh
  // values — the Status badge re-renders from the new iwayTripStatus with
  // no page reload. On failure the local snapshot is left untouched (only
  // a toast fires) so a supplier-side/transport error can never flip the
  // displayed HBS status incorrectly.
  const handleIwayStatusAction = async () => {
    if (!bookingId || iwayRefreshing) return;
    try {
      setIwayRefreshing(true);
      const res = await axiosInstance.patch(
        `/api/cab/${bookingId}/refresh-status`,
      );
      const data = res?.data;
      if (data && typeof data === "object" && data.tripStatus != null) {
        setIwayTripStatus(data.tripStatus);
        setIwayStatusRefreshedAt(data.refreshedAt || new Date().toISOString());
        const label = data.tripStatusLabel || data.tripStatus;
        toast.success(supplierText(`iWay status: ${label}`, `Trip status: ${label}`));
      } else {
        toast.error(
          supplierText(
            "Empty response from iWay status check",
            "Empty response from the trip status check",
          ),
        );
      }
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        supplierText("Failed to update iWay status", "Failed to update the trip status");
      toast.error(withoutSupplierName(msg));
    } finally {
      setIwayRefreshing(false);
    }
  };

  // Merge an action mutation's response DTO into the live action state so the
  // gating below re-derives without a full-page detail fetch.
  const mergeActionState = (dto) => {
    if (!dto) return;
    setActionState((prev) => ({
      ...prev,
      confirmationStatus:
        dto.confirmationStatus ?? prev.confirmationStatus,
      reconfirmation: dto.reconfirmation ?? prev.reconfirmation,
      agentLpo: dto.agentLpo ?? prev.agentLpo,
      confirmationNumber: dto.confirmationNumber ?? prev.confirmationNumber,
      remarks: dto.remarks ?? prev.remarks,
      cancelStatus: dto.cancelStatus ?? prev.cancelStatus,
      // Reconfirm / Cancel audit — lets the History modal show the freshly
      // captured Location + IP immediately after the action (no reload).
      reconfirmedDate: dto.reconfirmedDate ?? prev.reconfirmedDate,
      reconfirmedBy: dto.reconfirmedBy ?? prev.reconfirmedBy,
      reconfirmedBookingLocation:
        dto.reconfirmedBookingLocation ?? prev.reconfirmedBookingLocation,
      reconfirmedIpAddress: dto.reconfirmedIpAddress ?? prev.reconfirmedIpAddress,
      cancelledDate: dto.cancelledDate ?? prev.cancelledDate,
      cancelledBy: dto.cancelledBy ?? prev.cancelledBy,
      cancelledBookingLocation:
        dto.cancelledBookingLocation ?? prev.cancelledBookingLocation,
      cancelledIpAddress: dto.cancelledIpAddress ?? prev.cancelledIpAddress,
    }));
  };

  // ── Status helpers (mirror LongStayBookingDetailView) ──
  const normalizedStatus = String(actionState.confirmationStatus || "")
    .replace(/\s+/g, "")
    .toUpperCase();
  const isCancelled =
    !!booking?.cancelStatus ||
    actionState.cancelStatus === true ||
    normalizedStatus === "CANCELLED";
  const showsFinalDocs =
    actionState.reconfirmation === true ||
    normalizedStatus === "RECONFIRMED" ||
    normalizedStatus === "COMPLETED";

  // Kick off client-location resolution and feed the result into the given
  // setter. IP-derived coarse fallback fires first so that even if the user
  // denies geolocation we have SOMETHING to show; browser geolocation, when
  // granted, overrides with a precise reverse-geocoded address. Shared by the
  // Cancel and Reconfirm modal openers. Mirrors PackageBookingDetailView.
  const resolveClientLocation = (setter) => {
    fetch("https://ipapi.co/json/")
      .then((res) => (res.ok ? res.json() : null))
      .then((info) => {
        if (!info) return;
        const line = [info.city, info.region, info.country_name]
          .filter(Boolean)
          .join(", ");
        if (line) setter((prev) => prev || line);
      })
      .catch(() => {});

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
          const precise = await reverseGeocode(coords.latitude, coords.longitude);
          if (precise) setter(precise);
        },
        () => {}, // denied / unavailable — keep the IP-derived fallback
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
      );
    }
  };

  const handleCancelBooking = async () => {
    if (!booking) return;
    try {
      setCancelling(true);
      const params = cancellationReason.trim()
        ? { reason: cancellationReason.trim() }
        : undefined;
      // bookingLocation travels in the request body; the backend stamps the
      // IP server-side. Feeds the History modal's "Booking Cancelled" row.
      const response = await axiosInstance.delete(
        `/api/cab/delete/${booking.custombookingId}`,
        { params, data: { bookingLocation: cancelLocation } }
      );
      if (response.data?.status === "success") {
        toast.success("Booking cancelled");
        setShowCancelModal(false);
        setCancellationReason("");
        navigate(-1);
      } else {
        toast.error("Cancel failed");
      }
    } catch {
      toast.error("Error cancelling booking");
    } finally {
      setCancelling(false);
    }
  };

  const openCancelModal = () => {
    setCancellationReason("");
    setCancelLocation(null);
    setCancelPreview(null);
    setCancelPenaltyAcknowledged(false);
    setShowCancelModal(true);
    resolveClientLocation(setCancelLocation);
    // Fetch penalty preview so the modal can render Free/Penalty banner
    // + refund amount before the operator confirms. Preview failure is
    // non-blocking — the operator can still cancel (backend will re-check
    // and reject if truly not allowed), but the banner just won't render.
    if (booking?.custombookingId) {
      setCancelPreviewLoading(true);
      axiosInstance
        .get(`/api/cab/${booking.custombookingId}/cancel-preview`)
        .then((res) => setCancelPreview(res.data || null))
        .catch(() => setCancelPreview(null))
        .finally(() => setCancelPreviewLoading(false));
    }
  };

  // ── Reconfirm ──
  const openConfirmModal = () => {
    setReconfirmLocation(null);
    setShowConfirmModal(true);
    resolveClientLocation(setReconfirmLocation);
  };

  const confirmBooking = async () => {
    if (!bookingId) return;
    try {
      setConfirmingBooking(true);
      // bookingLocation travels in the body; the backend stamps the IP
      // server-side. Feeds the History modal's "Booking Reconfirmed" row.
      const res = await axiosInstance.patch(
        `/api/cab/${bookingId}/confirmation-status`,
        { confirmStatus: true, bookingLocation: reconfirmLocation }
      );
      mergeActionState(res.data);
      setShowConfirmModal(false);
      toast.success("Booking reconfirmed successfully!");
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Failed to reconfirm booking. Please try again."
      );
    } finally {
      setConfirmingBooking(false);
    }
  };

  // ── Reject ──
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
      const res = await axiosInstance.patch(
        `/api/cab/${bookingId}/confirmation-status`,
        {
          action: "REJECT",
          rejectedBy: rb,
          rejectionRemarks: (rejectionRemarks || "").trim() || null,
        }
      );
      mergeActionState(res.data);
      setShowRejectModal(false);
      toast.success("Booking rejected.");
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Failed to reject booking. Please try again."
      );
    } finally {
      setRejectingBooking(false);
    }
  };

  // ── Agent Reference ──
  const openConfirmStatusModal = async () => {
    setConfirmAgentLpo("");
    setConfirmAgentLpoError("");
    setShowConfirmStatusModal(true);
    try {
      const res = await axiosInstance.get(
        `/api/cab/${bookingId}/agent-reference`
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
      const res = await axiosInstance.post(
        `/api/cab/${bookingId}/agent-reference`,
        { agentLpo: lpoTrimmed }
      );
      mergeActionState(res.data);
      setShowConfirmStatusModal(false);
      toast.success("Agent Reference updated successfully");
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Failed to update Agent Reference. Please try again."
      );
    } finally {
      setUpdatingConfirmationStatus(false);
    }
  };

  // ── Confirmation Number ──
  const openConfirmationNoModal = async () => {
    setConfirmationNoInput("");
    setConfirmationNoError("");
    setShowConfirmationNoModal(true);
    try {
      const res = await axiosInstance.get(
        `/api/cab/${bookingId}/agent-reference`
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
      const res = await axiosInstance.patch(
        `/api/cab/${bookingId}/confirmation-status`,
        { action: "CONFIRMATION_NO", confirmationNumber: value }
      );
      mergeActionState(res.data);
      setShowConfirmationNoModal(false);
      toast.success("Confirmation number saved successfully!");
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Failed to save confirmation number. Please try again."
      );
    } finally {
      setSavingConfirmationNo(false);
    }
  };

  // ── Booking Remark ──
  const openRemarkModal = () => {
    setRemarkInput(actionState.remarks || "");
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
      const res = await axiosInstance.post(`/api/cab/${bookingId}/remark`, {
        remarks: text,
      });
      mergeActionState(res.data);
      setShowRemarkModal(false);
      toast.success("Remark saved successfully");
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Failed to save remark. Please try again."
      );
    } finally {
      setSavingRemark(false);
    }
  };

  // ── Notes (server-side list + add) ──
  const fetchCabNotes = useCallback(async () => {
    if (!bookingId) return;
    try {
      setNotesLoading(true);
      const res = await axiosInstance.get(`/api/cab/${bookingId}/notes`);
      const list = Array.isArray(res.data) ? res.data : res.data?.notes || [];
      setBookingNotes(list);
    } catch {
      setBookingNotes([]);
    } finally {
      setNotesLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    fetchCabNotes();
  }, [fetchCabNotes]);

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
        sessionStorage.getItem("UserName") ||
        "unknown";
      await axiosInstance.post(`/api/cab/${bookingId}/notes`, {
        note: text,
        createdBy,
      });
      toast.success("Note added successfully");
      setNoteInput("");
      setShowNotesModal(false);
      await fetchCabNotes();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save note");
    } finally {
      setSavingNote(false);
    }
  };

  // ── Resend Mail ──
  // Open the preview modal: (1) generate the cab voucher PDF for preview
  // (proforma while held, final once ReConfirmed), and (2) prefill the
  // agent's on-file email into an editable recipient field. Lookup errors
  // surface inline but never block the admin from typing an address.
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
          .get(`/api/cab/${bookingId}/pdf`, {
            params: { type: showsFinalDocs ? "VOUCHER" : "PROFORMA_VOUCHER" },
          })
          .catch(() => null),
        agentId
          ? axiosInstance.get(`/api/agent/${agentId}`).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (docRes?.data?.status === "SUCCESS" && docRes.data.pdfUrl) {
        setResendMailPdfUrl(docRes.data.pdfUrl);
      }
      const a = agentRes?.data || {};
      const email =
        a.personalEmail || a.financeManagerEmail || a.gmEmail || "";
      setResendMailEmail(email);
    } finally {
      setResendMailPreparing(false);
    }
  };

  // Fire the actual /resend-mail POST with whatever address the admin left
  // in the modal's email field. The backend re-validates and falls back to
  // the agent's on-file address when blank.
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
        `/api/cab/${bookingId}/resend-mail`,
        null,
        { params: { email } }
      );
      if (res.data?.success === false) {
        toast.error(res.data?.message || "Failed to resend mail to agent");
      } else {
        toast.success(res.data?.message || "Mail resent to agent successfully!");
        setShowResendMailModal(false);
      }
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Failed to resend mail to agent. Please try again."
      );
    } finally {
      setResendingMail(false);
    }
  };

  // ── PDF preview gateway (Proforma / Final Voucher & Invoice) ──
  const handleDownloadPdf = async (type, label) => {
    if (!bookingId) return;
    try {
      setGeneratingPdfType(type);
      const res = await axiosInstance.get(`/api/cab/${bookingId}/pdf`, {
        params: { type: type.toUpperCase() },
      });
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

  // Voucher action → backend (CabBookingController#getCabBookingPdf) returns a
  // PdfGenerationResponseDTO with { status, message, pdfUrl }; instead of
  // opening a new tab, surface the URL inside an in-page modal with an
  // iframe preview + an email-to field.
  const handleVoucher = async () => {
    if (!booking) return;
    const bid = booking.custombookingId;
    if (!bid) return;
    try {
      setVoucherLoadingId(bid);
      const res = await axiosInstance.get(`/api/cab_booking/${bid}/pdf`, {
        params: { type: "VOUCHER" },
      });
      if (res.data && res.data.status === "SUCCESS" && res.data.pdfUrl) {
        setVoucherPdfUrl(res.data.pdfUrl);
        setVoucherEmail(booking.customer?.emailId || "");
        setVoucherEmailError("");
        setShowVoucherModal(true);
      } else {
        toast.error(res.data?.message || "Failed to generate voucher");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to generate voucher");
    } finally {
      setVoucherLoadingId(null);
    }
  };

  // Email the voucher PDF to the address typed into the modal.
  const sendVoucherEmail = async () => {
    if (!booking) return;
    const email = (voucherEmail || "").trim();
    if (!email) {
      setVoucherEmailError("Email is required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setVoucherEmailError("Please enter a valid email address");
      return;
    }
    setVoucherEmailError("");
    try {
      setVoucherSending(true);
      await axiosInstance.post(
        `/api/cab/${booking.custombookingId}/voucher/send`,
        { email }
      );
      toast.success(`Voucher sent to ${email}`);
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to send voucher email"
      );
    } finally {
      setVoucherSending(false);
    }
  };

  const closeVoucherModal = () => {
    if (voucherSending) return;
    setShowVoucherModal(false);
    setVoucherPdfUrl("");
    setVoucherEmail("");
    setVoucherEmailError("");
  };

  if (!booking) {
    return (
      <div className="min-vh-100 bg-light d-flex flex-column">
        <TopBar />
        <div className="d-flex flex-grow-1">
          <Sidebar />
          <main className="flex-grow-1 p-4">
            <Container fluid style={{ maxWidth: "1100px" }}>
              <div className="text-center py-5">
                <p className="text-muted mb-3">
                  Booking not found. Please reopen it from the Cab Bookings list.
                </p>
                <button
                  style={{ ...BUTTON_STYLE, backgroundColor: "#555" }}
                  onClick={() =>
                    navigate("/booking-details/cab-booking-list")
                  }
                >
                  ← Back to list
                </button>
              </div>
            </Container>
          </main>
        </div>
      </div>
    );
  }

  const customerName = [
    booking.customer?.salutaion,
    booking.customer?.firstName,
    booking.customer?.lastName,
  ]
    .filter(Boolean)
    .join(" ");

  // Display status for the StatusBadge — cancelled shows red, everything
  // else reads as "Reconfirmed". Rationale: any booking that survived
  // create-order + approve + wallet deduction is fully committed on both
  // sides, and the operator no longer has to press RECONFIRM manually.
  // Legacy raw values ("OK", "CONFIRMED", "PENDING_IWAY_PAYMENT") all fold
  // into the same "Reconfirmed" label so historic rows read consistently
  // with new ones. The underlying confirmationStatus in the DB is unchanged.
  //
  // Cancellations that happened AFTER a reconfirmation render as the
  // combined "ReConfirmed/Cancelled" label so the operator sees both
  // the booking's terminal state (Cancelled — red wins per the status
  // renderer's rule) and the fact that it was fully committed before
  // being cancelled. Cancellations from any other prior state (e.g. a
  // pending booking cancelled before it ever confirmed) keep the plain
  // "Cancelled" label so we don't imply a reconfirmation that never
  // happened.
  const wasReconfirmedBeforeCancel =
    String(actionState.confirmationStatus || "").toUpperCase() === "RECONFIRMED";
  const displayStatus = isCancelled
    ? (wasReconfirmedBeforeCancel ? "ReConfirmed/Cancelled" : "Cancelled")
    : "Reconfirmed";

  // For iWay bookings, i'way's own trip-lifecycle status (iway_trip_status)
  // is ALWAYS the source of truth for the Status badge — per the i'way
  // trip-status workflow the displayed status must never be the hardcoded
  // confirmationStatus. mapIwayStatus treats a null/never-refreshed
  // iwayTripStatus the same as 0 ("On Request"), so this applies from the
  // very first render, not only after the operator has taken an action.
  // A local cancel (cancelStatus) still wins so the combined
  // "ReConfirmed/Cancelled" label survives. Falls back to the pre-existing
  // displayStatus only for non-iWay bookings, which are unaffected by this
  // workflow.
  const iwayMappedStatus =
    booking.external ? mapIwayStatus(iwayTripStatus) : null;
  const effectiveStatus = isCancelled
    ? displayStatus
    : (iwayMappedStatus ? iwayMappedStatus.label : displayStatus);

  // Numeric i'way status driving the Confirm/Reconfirm button below —
  // null/never-refreshed treated as 0, same rule as mapIwayStatus.
  const effectiveIwayTripStatus =
    booking.external ? (iwayTripStatus ?? 0) : null;

  // Booking lifecycle events for the History modal — built from the row stub
  // already loaded (no extra API call), mirroring the Package / Hotel booking
  // detail views. The cab booking DTO only carries a real `bookingDate`
  // (creation time); the confirm / reconfirm / cancel transitions are not
  // timestamped server-side today, so those rows are added defensively — only
  // when a genuine timestamp is present, never fabricated. If the backend
  // later exposes those fields they light up automatically. Events are sorted
  // chronologically so the timeline reads top-to-bottom.
  const bookingHistory = (() => {
    if (!booking) return [];
    const events = [];
    if (booking.bookingDate) {
      events.push({
        action: "Booking Created",
        at: booking.bookingDate,
        by: booking.createdBy || "-",
        location: booking.bookingLocation,
        ip: booking.ipAddress,
      });
    }
    if (booking.confirmedDate) {
      events.push({
        action: "Booking Confirmed",
        at: booking.confirmedDate,
        by: booking.confirmedBy || "-",
      });
    }
    // Reconfirm audit — prefer the fresh action-response snapshot (so the row
    // appears right after the user reconfirms) and fall back to the row stub.
    const reconfirmedAt = actionState.reconfirmedDate || booking.reconfirmedDate;
    if (reconfirmedAt) {
      events.push({
        action: "Booking Reconfirmed",
        at: reconfirmedAt,
        by: actionState.reconfirmedBy || booking.reconfirmedBy || "-",
        location:
          actionState.reconfirmedBookingLocation ||
          booking.reconfirmedBookingLocation,
        ip: actionState.reconfirmedIpAddress || booking.reconfirmedIpAddress,
      });
    }
    const cancelled =
      actionState.cancelStatus === true ||
      booking.cancelStatus === true ||
      isCancelled;
    const cancelledAt =
      actionState.cancelledDate ||
      booking.cancelledDate ||
      booking.cancelledAt;
    if (cancelled && cancelledAt) {
      events.push({
        action: "Booking Cancelled",
        at: cancelledAt,
        by: actionState.cancelledBy || booking.cancelledBy || "-",
        location:
          actionState.cancelledBookingLocation ||
          booking.cancelledBookingLocation,
        ip: actionState.cancelledIpAddress || booking.cancelledIpAddress,
      });
    }
    return events.sort((a, b) => {
      const da = parseHistoryDate(a.at)?.getTime() ?? 0;
      const db = parseHistoryDate(b.at)?.getTime() ?? 0;
      return da - db;
    });
  })();

  // ── ADD NEW ITEM handlers ──────────────────────────────────────────
  // Mirrors the Package / Hotel "ADD NEW ITEM" pattern: the button opens a
  // picker modal listing every sub-booking type; the chosen type's own
  // create flow is launched with ?parentBookingCode set so the backend
  // chains the child under this cab booking's code (PAC… → PAC…/1). Cab
  // bookings are always top-level, so packageBookCode is the root parent.
  const addItemParentCode = () =>
    booking?.parentBookingCode || booking?.packageBookCode || "";

  const openAddItemModal = () => {
    if (!addItemParentCode()) {
      toast.error("Cannot add new item — booking code missing");
      return;
    }
    setSelectedAddItemType(ADD_NEW_ITEM_TYPES[0].key);
    setShowAddItemModal(true);
  };

  const submitAddItem = () => {
    const chosen = ADD_NEW_ITEM_TYPES.find((t) => t.key === selectedAddItemType);
    const parent = addItemParentCode();
    if (!chosen || !parent) {
      toast.error("Cannot add new item — booking code missing");
      return;
    }
    setShowAddItemModal(false);
    navigate(`${chosen.route}?parentBookingCode=${encodeURIComponent(parent)}`);
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4" style={{ overflow: "auto" }}>
          <Container fluid style={{ maxWidth: "1100px" }}>
            {/* Header — Back + title + booking code + status (matches the
                Hotel Booking detail view). */}
            <div className="mb-3 d-flex align-items-center flex-wrap gap-2">
              <button
                style={{ ...BUTTON_STYLE, backgroundColor: "#555" }}
                onClick={() => navigate(-1)}
              >
                ← Back
              </button>
              <span
                className="d-flex align-items-center"
                style={{
                  marginLeft: "12px",
                  fontWeight: "700",
                  fontSize: "1.1rem",
                  color: "#333",
                }}
              >
                <FaCar className="me-2 text-secondary" />
                Booking Details
                {booking.packageBookCode && (
                  <span
                    style={{
                      marginLeft: "12px",
                      fontWeight: "700",
                      fontSize: "0.95rem",
                      color: "#c0392b",
                    }}
                  >
                    {booking.packageBookCode}
                  </span>
                )}
                <span style={{ marginLeft: "12px" }}>
                  <StatusBadge status={effectiveStatus} />
                </span>
              </span>
            </div>

            {/* ── Booking Information ── */}
            <div style={card}>
              <SectionHeader>Booking Information</SectionHeader>
              <SectionBody>
                <Row>
                  <Col md={6}>
                    <InfoRow
                      label="Booking Code"
                      value={booking.packageBookCode}
                    />
                    <InfoRow
                      label="Booking Date"
                      value={formatDate(booking.bookingDate)}
                    />
                    <InfoRow label="Cab" value={booking.cabName} />
                    {!hidesTransporter(booking) && (
                    <InfoRow label="Transporter" value={booking.transporter} />
                    )}
                    <InfoRow
                      label="Pickup Date"
                      value={formatDate(booking.pickupDate)}
                    />
                    <InfoRow
                      label="Dropoff Date"
                      value={formatDate(
                        booking.dropOffDate ||
                          booking.dropoffDate ||
                          booking.pickupDate
                      )}
                    />
                    {/* Reflects the value saved via "CONFIRMATION NO." —
                        actionState.confirmationNumber is refreshed on save.
                        Moved here from Guest Information (booking-level id,
                        belongs with the other booking identifiers). */}
                    <InfoRow
                      label="Confirmation No."
                      value={
                        actionState.confirmationNumber ||
                        booking.confirmationNumber
                      }
                    />
                  </Col>
                  <Col md={6}>
                    <InfoRow label="Agent" value={booking.agentName} />
                    {/* Reflects the value saved via "ADD AGENT REFERENCE" —
                        actionState.agentLpo is refreshed on save (mergeActionState),
                        falling back to whatever the row stub carried. Renamed
                        from "Agent LPO" and grouped next to Agent. */}
                    <InfoRow
                      label="Agent Reference"
                      value={
                        actionState.agentLpo || booking.agentLpo || booking.lpo
                      }
                    />
                    <InfoRow
                      label="Pickup"
                      value={
                        [booking.pickupName, booking.pickupTime]
                          .filter(Boolean)
                          .join(" @ ") || "-"
                      }
                    />
                    <InfoRow
                      label="Dropoff"
                      value={
                        [booking.dropoffName, booking.dropoffTime]
                          .filter(Boolean)
                          .join(" @ ") || "-"
                      }
                    />
                    <InfoRow
                      label="Driver"
                      value={
                        [booking.driverName, booking.driverContact]
                          .filter(Boolean)
                          .join(" · ") || "-"
                      }
                    />
                    <InfoRow
                      label="Voucher"
                      value={
                        booking.voucherIssued || booking.voucher ? "Yes" : "No"
                      }
                    />
                    {/* Status — for i'way bookings the badge reflects
                        i'way's own live trip status (iway_trip_status),
                        never a hardcoded value. No refresh icon here any
                        more — per the i'way trip-status workflow, pulling
                        a fresh status is done via the Confirm/Reconfirm
                        action button below, not a separate control. The
                        last-refresh timestamp that used to live in the
                        icon's tooltip is kept as plain text so that
                        context isn't lost. */}
                    <InfoRow
                      label="Status"
                      value={
                        <span className="d-inline-flex align-items-center gap-2">
                          <StatusBadge status={effectiveStatus} />
                          {booking.external && iwayStatusRefreshedAt && (
                            <span
                              className="text-muted"
                              style={{ fontSize: "0.72rem" }}
                              title={supplierText("Last i'way status check", "Last status check")}
                            >
                              (as of {formatIwayRefreshedAt(iwayStatusRefreshedAt)})
                            </span>
                          )}
                        </span>
                      }
                    />
                  </Col>
                </Row>
              </SectionBody>
            </div>

            {/* ── Guest Information ──
                 Passport No and Nationality removed on request; Agent
                 Reference and Confirmation No. moved into Booking
                 Information above, so this section is just the lead
                 contact triad now. */}
            <div style={card}>
              <SectionHeader>Guest Information</SectionHeader>
              <SectionBody>
                <Row>
                  <Col md={6}>
                    <InfoRow label="Guest Name" value={customerName} />
                    <InfoRow label="Email" value={booking.customer?.emailId} />
                  </Col>
                  <Col md={6}>
                    <InfoRow
                      label="Phone"
                      value={
                        booking.customer?.mobileNumber ||
                        booking.customer?.contactNumber ||
                        booking.customer?.phone
                      }
                    />
                  </Col>
                </Row>
              </SectionBody>
            </div>

            {/* ── Passenger Details ── */}
            <div style={card}>
              <SectionHeader>
                Passenger Details
                <span className="text-muted small fw-normal ms-2">
                  ({booking.noOfAdult ?? 0} Adult
                  {(booking.noOfAdult ?? 0) !== 1 ? "s" : ""}
                  {(booking.noOfChild ?? 0) > 0
                    ? `, ${booking.noOfChild} Child${
                        booking.noOfChild !== 1 ? "ren" : ""
                      }`
                    : ""}
                  )
                </span>
              </SectionHeader>
              {Array.isArray(booking.guests) && booking.guests.length > 0 ? (
                // Full card width (matches every other section on this page)
                // with tableLayout: "fixed" + percentage widths, so Age gets
                // a genuinely wide column and sits centered within it — a
                // fixed pixel-width table left dead blank space on the right
                // of the card, which read as "not centered" relative to the
                // card even though Age was centered within its own column.
                <Table
                  size="sm"
                  hover
                  className="mb-0 align-middle"
                  style={{ tableLayout: "fixed" }}
                >
                  <thead style={{ backgroundColor: "#f8f9fa" }}>
                    <tr>
                      <th style={{ width: "8%" }}>#</th>
                      <th style={{ width: "15%" }}>Type</th>
                      <th style={{ width: "42%" }}>Name</th>
                      <th style={{ width: "35%", textAlign: "center" }}>Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {booking.guests.map((g, idx) => (
                      <tr key={g.id || idx}>
                        <td>{g.guestIndex || idx + 1}</td>
                        <td>
                          <Badge bg={g.isChild ? "secondary" : "dark"}>
                            {g.isChild ? "Child" : "Adult"}
                          </Badge>
                        </td>
                        <td>
                          {[
                            g.salutation,
                            g.firstName,
                            g.middleName,
                            g.lastName,
                          ]
                            .filter(Boolean)
                            .join(" ") || "—"}
                        </td>
                        <td style={{ textAlign: "center" }}>{g.age ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <div className="small text-muted px-3 py-2">
                  No per-pax manifest captured for this booking.
                  {Array.isArray(booking.childAgeArray) &&
                    booking.childAgeArray.length > 0 && (
                      <span>
                        {" "}
                        Child ages: {booking.childAgeArray.join(", ")}.
                      </span>
                    )}
                </div>
              )}
            </div>

            {/* ── Price Details ── */}
            <div style={card}>
              <SectionHeader>Price Details</SectionHeader>
              <SectionBody>
                {booking.sellingPrice != null && (
                  <InfoRow
                    label="Selling Price"
                    value={formatPrice(booking.sellingPrice)}
                  />
                )}
                {booking.totalRate != null &&
                  Number(booking.totalRate) !== Number(booking.totalPrice) && (
                    <InfoRow
                      label="Total Rate"
                      value={formatPrice(booking.totalRate)}
                    />
                  )}
                {booking.tourismDirham != null &&
                  Number(booking.tourismDirham) > 0 && (
                    <InfoRow
                      label="Tourism Dirham"
                      value={`+ ${formatPrice(booking.tourismDirham)}`}
                    />
                  )}
                <div
                  style={{
                    marginTop: "6px",
                    paddingTop: "8px",
                    borderTop: "1px solid #eee",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <span style={{ ...INFO_LABEL, color: "#333" }}>
                    Total Amount
                  </span>
                  <span
                    style={{
                      marginLeft: "8px",
                      fontWeight: "700",
                      fontSize: "0.95rem",
                      color: "#16a34a",
                    }}
                  >
                    {formatPrice(booking.totalPrice)}
                  </span>
                </div>
              </SectionBody>
            </div>

            {/* ── Special Requirements ── Multi-select picks from the
                provider's configured catalog + any free-text notes the
                customer added on the booking page. Either can be absent. */}
            {(Array.isArray(booking?.selectedSpecialRequirements) &&
              booking.selectedSpecialRequirements.length > 0) ||
            (booking?.specialRequirements &&
              String(booking.specialRequirements).trim()) ? (
              <div style={card}>
                <SectionHeader>Special Requirements</SectionHeader>
                <SectionBody>
                  {Array.isArray(booking?.selectedSpecialRequirements) &&
                    booking.selectedSpecialRequirements.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 6,
                          marginBottom:
                            booking?.specialRequirements &&
                            String(booking.specialRequirements).trim()
                              ? 8
                              : 0,
                        }}
                      >
                        {booking.selectedSpecialRequirements.map((item, i) => (
                          <span
                            key={`ssr-${i}`}
                            style={{
                              background: "#F1F3F5",
                              color: "#222",
                              padding: "2px 8px",
                              borderRadius: 12,
                              fontSize: "0.78rem",
                            }}
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    )}
                  {booking?.specialRequirements &&
                    String(booking.specialRequirements).trim() && (
                      <div
                        style={{
                          fontSize: "0.82rem",
                          color: "#222",
                          whiteSpace: "pre-line",
                        }}
                      >
                        <span
                          style={{
                            color: "#666",
                            fontSize: "0.75rem",
                            display: "block",
                            marginBottom: 2,
                          }}
                        >
                          Additional notes
                        </span>
                        {String(booking.specialRequirements).trim()}
                      </div>
                    )}
                </SectionBody>
              </div>
            ) : null}

            {/* ── Remarks ── Saved via the "BOOKING REMARK" modal;
                actionState.remarks refreshes on save (mergeActionState). */}
            <div style={card}>
              <SectionHeader>Remarks</SectionHeader>
              <SectionBody>
                {actionState.remarks ? (
                  <div
                    style={{
                      whiteSpace: "pre-line",
                      fontSize: "0.82rem",
                      color: "#222",
                    }}
                  >
                    {actionState.remarks}
                  </div>
                ) : (
                  <span
                    style={{
                      color: "#888",
                      fontStyle: "italic",
                      fontSize: "0.82rem",
                    }}
                  >
                    No remarks.
                  </span>
                )}
              </SectionBody>
            </div>

            {/* ── Notes ── Ad-hoc notes fetched from /api/cab/{id}/notes.
                The "NOTES" button below opens a modal that posts to the same
                endpoint and refreshes this list. */}
            <div style={card}>
              <SectionHeader>Notes</SectionHeader>
              <SectionBody>
                {notesLoading && bookingNotes.length === 0 ? (
                  <span style={{ color: "#888", fontSize: "0.82rem" }}>
                    Loading notes…
                  </span>
                ) : bookingNotes.length === 0 ? (
                  <span
                    style={{
                      color: "#888",
                      fontStyle: "italic",
                      fontSize: "0.82rem",
                    }}
                  >
                    No notes yet.
                  </span>
                ) : (
                  <ul style={{ marginBottom: 0, paddingLeft: "18px" }}>
                    {bookingNotes.map((n, idx) => (
                      <li key={n.id || idx} style={{ marginBottom: 6 }}>
                        <div
                          style={{
                            whiteSpace: "pre-line",
                            fontSize: "0.82rem",
                            color: "#222",
                          }}
                        >
                          {n.note || "-"}
                        </div>
                        {(n.createdBy || n.createdDate) && (
                          <div
                            style={{
                              fontSize: "0.72rem",
                              color: "#888",
                              marginTop: 2,
                            }}
                          >
                            {n.createdBy ? `By ${n.createdBy}` : ""}
                            {n.createdBy && n.createdDate ? " · " : ""}
                            {n.createdDate
                              ? String(n.createdDate).replace("T", " ")
                              : ""}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </SectionBody>
            </div>

            {/* Bottom action buttons — mirrors LongStayBookingDetailView's
                action row. The legacy email-voucher modal is preserved on the
                first button; the rest are the Long-Stay action set. The
                PROFORMA vs FINAL doc pair flips off `showsFinalDocs`. */}
            <div
              className="d-flex gap-2 justify-content-start flex-wrap"
              style={{ marginTop: "16px", marginBottom: "20px" }}
            >
              {/* ADD NEW ITEM — first action. Opens the sub-booking picker so
                  the operator can chain a new item under this booking's code.
                  Hidden once cancelled (no amendments on a dead booking). */}
              {!isCancelled && (
                <button
                  style={BTN_PRIMARY}
                  onClick={openAddItemModal}
                  title="Add a new sub-booking under this booking"
                >
                  ADD NEW ITEM
                </button>
              )}

              {!isCancelled && (
                <button style={BTN_DANGER} onClick={openCancelModal}>
                  CANCEL
                </button>
              )}

              {/* Local confirmation-status RECONFIRM (the generic, non-iWay
                  modal below via confirmBooking/openConfirmModal) stays
                  removed — every successful booking is auto-reconfirmed at
                  save time (TripServiceImpl.placeIwayOrder →
                  confirmationStatus = "RECONFIRMED"), so it had no new
                  state to move to. Its handler + modal remain in the file
                  for potential future use / audit backfill but are not
                  reachable from the UI.

                  i'way trip-status Confirm/Reconfirm — this IS reachable:
                  it replaces the old standalone Refresh icon. Confirm shows
                  at iway_trip_status 0 (or never-refreshed), Reconfirm at 1;
                  both call handleIwayStatusAction (GET the live trip status
                  from i'way) and the badge above re-renders from the result.
                  Hidden once status reaches 2 (Reconfirmed) — the i'way
                  trip-status workflow's terminal state — or once cancelled. */}
              {!isCancelled && booking.external && effectiveIwayTripStatus === 0 && (
                <button
                  style={BTN_CONFIRM}
                  onClick={handleIwayStatusAction}
                  disabled={iwayRefreshing || !bookingId}
                  title={supplierText(
                    "Check i'way for the latest trip status",
                    "Check the latest trip status",
                  )}
                >
                  {iwayRefreshing ? "CHECKING..." : "CONFIRM"}
                </button>
              )}
              {!isCancelled && booking.external && effectiveIwayTripStatus === 1 && (
                <button
                  style={BTN_TEAL}
                  onClick={handleIwayStatusAction}
                  disabled={iwayRefreshing || !bookingId}
                  title={supplierText(
                    "Check i'way for the latest trip status",
                    "Check the latest trip status",
                  )}
                >
                  {iwayRefreshing ? "CHECKING..." : "RECONFIRM"}
                </button>
              )}

              {!showsFinalDocs ? (
                <>
                  <button
                    style={BTN_INFO}
                    disabled={generatingPdfType === "PROFORMA_VOUCHER"}
                    onClick={() =>
                      handleDownloadPdf("PROFORMA_VOUCHER", "Proforma Voucher")
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
                      handleDownloadPdf("PROFORMA_INVOICE", "Proforma Invoice")
                    }
                  >
                    {generatingPdfType === "PROFORMA_INVOICE"
                      ? "GENERATING..."
                      : "PROFORMA INVOICE"}
                  </button>
                </>
              ) : (
                <>
                  {/* Final VOUCHER is hidden once cancelled — no live voucher
                      is offered post-cancellation (mirrors the Package view).
                      The INVOICE remains available. */}
                  {!isCancelled && (
                    <button
                      style={BTN_INFO}
                      disabled={generatingPdfType === "VOUCHER"}
                      onClick={() => handleDownloadPdf("VOUCHER", "Voucher")}
                    >
                      {generatingPdfType === "VOUCHER"
                        ? "GENERATING..."
                        : "VOUCHER"}
                    </button>
                  )}
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

              {/* ADD AGENT REFERENCE — opens the modal directly, mirroring the
                  Package booking detail view (no status gate). The cab list DTO
                  doesn't carry confirmationStatus, so an isConfirmedOrLater gate
                  here wrongly blocked the action on otherwise-valid bookings. */}
              <button style={BTN_SKY} onClick={openConfirmStatusModal}>
                ADD AGENT REFERENCE
              </button>

              {/* CONFIRMATION NO. — opens the modal directly, mirroring the
                  Package booking detail view (no status gate). The cab list DTO
                  doesn't carry confirmationStatus, so an isConfirmedOrLater gate
                  here wrongly blocked the action on otherwise-valid bookings. */}
              <button style={BTN_INDIGO} onClick={openConfirmationNoModal}>
                CONFIRMATION NO.
              </button>

              <button
                style={BTN_ORANGE}
                onClick={openResendMailModal}
                disabled={resendingMail || resendMailPreparing}
              >
                {resendingMail
                  ? "SENDING..."
                  : resendMailPreparing
                    ? "PREPARING..."
                    : "RESEND MAIL TO AGENT"}
              </button>

              <button style={BTN_ACCENT} onClick={openRemarkModal}>
                BOOKING REMARK
              </button>

              <button style={BTN_NEUTRAL} onClick={openNotesModal}>
                NOTES
              </button>

              {/* HISTORY is always available (read-only), including for
                  cancelled bookings — mirrors the Package booking detail. */}
              <button
                style={BTN_HISTORY}
                onClick={() => setShowHistoryModal(true)}
                title="Booking history"
              >
                HISTORY
              </button>

              {/* "Email Voucher" action button commented out per request —
                  hidden from the action row. Uncomment the block below to
                  restore it (handler handleVoucher + BTN_SUCCESS style are
                  still defined above). */}
              {/*
              <button
                style={BTN_SUCCESS}
                onClick={handleVoucher}
                disabled={voucherLoadingId === booking.custombookingId}
                title="Email Voucher"
              >
                {voucherLoadingId === booking.custombookingId ? (
                  <Spinner
                    size="sm"
                    style={{ width: 12, height: 12, marginRight: 6 }}
                  />
                ) : (
                  <FaEnvelope style={{ marginRight: "6px" }} />
                )}
                Email Voucher
              </button>
              */}
            </div>

            {/* ── Booking Date footer (matches the Hotel Booking detail view) ── */}
            <div
              style={{
                textAlign: "right",
                fontSize: "0.8rem",
                color: "#555",
                paddingBottom: "8px",
              }}
            >
              Booking Date : {formatDate(booking.bookingDate)}
            </div>
          </Container>
        </main>
      </div>

      {/* ── Booking History Modal ───────────────────────────────────────
          Read-only timeline built from the loaded row stub (no extra API
          call). Only events with a recorded timestamp are listed. */}
      <Modal
        show={showHistoryModal}
        onHide={() => setShowHistoryModal(false)}
        centered
        size="xl"
        scrollable
      >
        <Modal.Header closeButton>
          <Modal.Title
            style={{
              fontSize: "1.05rem",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <FaHistory size={16} />
            <span>
              Booking History
              {booking.packageBookCode && (
                <span style={{ opacity: 0.85, fontWeight: 500 }}>
                  {` — ${booking.packageBookCode}`}
                </span>
              )}
            </span>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body
          style={{ backgroundColor: "#f8fafc", padding: "1.25rem 1.5rem" }}
        >
          {bookingHistory.length === 0 ? (
            <div className="text-muted text-center py-4">
              <FaHistory
                size={26}
                style={{ opacity: 0.25, marginBottom: 8 }}
              />
              <div>No history available for this booking.</div>
            </div>
          ) : (
            <div
              style={{
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06)",
                backgroundColor: "#fff",
                overflow: "hidden",
              }}
            >
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
                          textAlign: "left",
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
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                            }}
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
                      HISTORY_ACTION_META[ev.action] ||
                      HISTORY_ACTION_FALLBACK;
                    const ActionIcon = meta.icon;
                    return (
                      <tr
                        key={`${ev.action}-${idx}`}
                        style={{
                          backgroundColor: idx % 2 === 1 ? "#f8fafc" : "#fff",
                        }}
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
                        <td
                          style={{
                            padding: "10px 14px",
                            borderBottom: "1px solid #eef2f6",
                          }}
                        >
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
                        <td
                          style={{
                            padding: "10px 14px",
                            borderBottom: "1px solid #eef2f6",
                            wordBreak: "break-word",
                          }}
                        >
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
                              style={{
                                display: "inline-flex",
                                alignItems: "flex-start",
                                gap: 6,
                              }}
                            >
                              <FaMapMarkerAlt
                                size={11}
                                style={{
                                  color: "#c0392b",
                                  marginTop: 2,
                                  flexShrink: 0,
                                }}
                              />
                              <span>{ev.location}</span>
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td
                          style={{
                            padding: "10px 14px",
                            borderBottom: "1px solid #eef2f6",
                          }}
                        >
                          {ev.ip ? (
                            <span
                              style={{
                                fontFamily:
                                  "'Consolas', 'Courier New', monospace",
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
                        <td
                          style={{
                            padding: "10px 14px",
                            borderBottom: "1px solid #eef2f6",
                          }}
                        >
                          {formatHistoryDate(ev.at)}
                        </td>
                        <td
                          style={{
                            padding: "10px 14px",
                            borderBottom: "1px solid #eef2f6",
                          }}
                        >
                          {formatHistoryTime(ev.at)}
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

      {/* ── Add New Item picker ──────────────────────────────────────────
          Lists every sub-booking type; the chosen type's create flow is
          launched with ?parentBookingCode set so the backend chains the
          child code under this booking. */}
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
            <strong>{addItemParentCode()}</strong>.
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
          <Button variant="danger" onClick={submitAddItem}>
            Continue
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Cancel confirmation (with optional reason) */}
      <Modal
        show={showCancelModal}
        onHide={() => {
          if (!cancelling) {
            setShowCancelModal(false);
            setCancellationReason("");
          }
        }}
        centered
        backdrop="static"
        keyboard={false}
      >
        <Modal.Header
          closeButton={!cancelling}
          style={{ backgroundColor: "#fff", borderBottom: "2px solid #e9ecef" }}
        >
          <Modal.Title className="fw-bold d-flex align-items-center">
            <FaExclamationCircle className="me-2 text-danger" />
            Cancel Cab Booking
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ padding: "1.5rem" }}>
          <div className="text-center">
            <p className="fs-5 mb-2">
              Are you sure you want to cancel this booking?
            </p>
            <h5 className="mb-1">{booking.packageBookCode}</h5>
            <p className="text-primary small mb-3">{booking.cabName}</p>

            {/* Cancellation-preview banner — Free / Penalty / Blocked. Only
                rendered once the preview call has returned. Non-blocking:
                a preview fetch failure just hides the banner and lets the
                backend re-check on the actual cancel. */}
            {cancelPreviewLoading && (
              <div className="text-muted small mb-3">
                <Spinner animation="border" size="sm" className="me-2" />
                Checking cancellation eligibility…
              </div>
            )}
            {!cancelPreviewLoading && cancelPreview && (
              <div
                className={`alert text-start ${
                  !cancelPreview.allowed
                    ? "alert-danger"
                    : cancelPreview.hasPenalty
                      ? "alert-warning"
                      : "alert-success"
                }`}
                role="alert"
              >
                {!cancelPreview.allowed ? (
                  <>
                    <div className="fw-semibold mb-1">Cancellation blocked</div>
                    <div className="small">
                      {withoutSupplierName(cancelPreview.message) ||
                        "This booking can no longer be cancelled."}
                    </div>
                  </>
                ) : cancelPreview.hasPenalty ? (
                  <>
                    <div className="fw-semibold mb-1">
                      Penalty window — 100% charge applies
                    </div>
                    <div className="small mb-2">
                      {supplierText(
                        "The free-cancellation window has closed. i'way will charge the full trip cost as a penalty.",
                        "The free-cancellation window has closed. The full trip cost is charged as a penalty.",
                      )}
                    </div>
                    <div className="small">
                      <div>
                        Trip total:{" "}
                        <b>
                          {cancelPreview.totalAmount != null
                            ? cancelPreview.totalAmount.toFixed(2)
                            : "—"}{" "}
                          {cancelPreview.currency || ""}
                        </b>
                      </div>
                      <div>
                        Penalty:{" "}
                        <b>
                          {cancelPreview.penaltyAmount != null
                            ? cancelPreview.penaltyAmount.toFixed(2)
                            : "—"}{" "}
                          {cancelPreview.currency || ""}
                        </b>
                      </div>
                      <div>
                        Wallet refund:{" "}
                        <b>
                          {cancelPreview.refundAmount != null
                            ? cancelPreview.refundAmount.toFixed(2)
                            : "—"}{" "}
                          {cancelPreview.currency || ""}
                        </b>
                      </div>
                    </div>
                    <Form.Check
                      type="checkbox"
                      className="mt-2"
                      id="cancelPenaltyAck"
                      label="I understand the agent will not be refunded for this cancellation."
                      checked={cancelPenaltyAcknowledged}
                      onChange={(e) =>
                        setCancelPenaltyAcknowledged(e.target.checked)
                      }
                      disabled={cancelling}
                    />
                  </>
                ) : (
                  <>
                    <div className="fw-semibold mb-1">Free cancellation</div>
                    <div className="small">
                      Full wallet refund of{" "}
                      <b>
                        {cancelPreview.refundAmount != null
                          ? cancelPreview.refundAmount.toFixed(2)
                          : "—"}{" "}
                        {cancelPreview.currency || ""}
                      </b>{" "}
                      will be credited.
                    </div>
                  </>
                )}
              </div>
            )}

            <Form.Group controlId="cabCancellationReason" className="text-start">
              <Form.Label className="fw-semibold">
                Cancellation Reason{" "}
                <span className="text-muted">(optional)</span>
              </Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                placeholder="Add a reason for cancellation (optional)"
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                disabled={cancelling}
              />
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
            disabled={cancelling}
          >
            No, Keep
          </Button>
          <Button
            variant="danger"
            onClick={handleCancelBooking}
            disabled={
              cancelling ||
              // Preview arrived and said "not allowed" — hard-block.
              (cancelPreview && !cancelPreview.allowed) ||
              // Penalty case requires explicit acknowledgement.
              (cancelPreview &&
                cancelPreview.hasPenalty &&
                !cancelPenaltyAcknowledged)
            }
          >
            {cancelling ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Cancelling...
              </>
            ) : (
              "Yes, Cancel"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Reconfirm Booking Modal ── */}
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
          style={{ backgroundColor: "#fff", borderBottom: "2px solid #e9ecef" }}
        >
          <Modal.Title className="fw-bold d-flex align-items-center">
            <FaExclamationCircle className="me-2 text-warning" />
            Reconfirm Booking
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ padding: "1.5rem" }}>
          <div className="text-center">
            <p className="fs-5 mb-3">
              Are you sure you want to reconfirm the booking?
            </p>
            <div className="text-muted small">
              <div>
                <strong>Booking Code:</strong>{" "}
                {booking.packageBookCode || "N/A"}
              </div>
              {booking.cabName && (
                <div>
                  <strong>Cab:</strong> {booking.cabName}
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
          <Button
            variant="danger"
            onClick={openRejectModal}
            disabled={confirmingBooking}
          >
            Reject
          </Button>
          <Button
            variant="success"
            onClick={confirmBooking}
            disabled={confirmingBooking}
          >
            {confirmingBooking ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Confirming...
              </>
            ) : (
              "Confirm"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Reject Booking Modal ── */}
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
          style={{ backgroundColor: "#fff", borderBottom: "2px solid #e9ecef" }}
        >
          <Modal.Title className="fw-bold d-flex align-items-center">
            <FaExclamationCircle className="me-2 text-danger" />
            Reject Booking
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
              Remarks <span className="text-muted small">(optional)</span>
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
                <Spinner animation="border" size="sm" className="me-2" />
                Rejecting...
              </>
            ) : (
              "Reject Booking"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Agent Reference Modal ── */}
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
          style={{ backgroundColor: "#fff", borderBottom: "2px solid #e9ecef" }}
        >
          <Modal.Title className="fw-bold d-flex align-items-center">
            <FaExclamationCircle className="me-2 text-warning" />
            Update Agent Reference
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ padding: "1.5rem" }}>
          <Form.Group controlId="cabConfirmAgentLpoInput">
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
                <Spinner animation="border" size="sm" className="me-2" />
                Saving...
              </>
            ) : (
              "OK"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Confirmation Number Modal ── */}
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
          style={{ backgroundColor: "#fff", borderBottom: "2px solid #e9ecef" }}
        >
          <Modal.Title className="fw-bold">Confirmation Number</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ padding: "1.5rem" }}>
          <Form.Group controlId="cabConfirmationNoInput">
            <Form.Label className="fw-semibold mb-1">
              Confirmation Number <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              type="text"
              placeholder="Enter Confirmation Number"
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
                <Spinner animation="border" size="sm" className="me-2" />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Booking Remark Modal ── */}
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
          style={{ backgroundColor: "#fff", borderBottom: "2px solid #e9ecef" }}
        >
          <Modal.Title className="fw-bold">Booking Remark</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ padding: "1.5rem" }}>
          <Form.Group controlId="cabBookingRemarkInput">
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
                <Spinner animation="border" size="sm" className="me-2" />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Notes Modal ── */}
      <Modal
        show={showNotesModal}
        onHide={() => {
          if (!savingNote) setShowNotesModal(false);
        }}
        centered
        backdrop="static"
        keyboard={false}
        size="md"
      >
        <Modal.Header
          closeButton={!savingNote}
          style={{ backgroundColor: "#fff", borderBottom: "2px solid #e9ecef" }}
        >
          <Modal.Title className="fw-bold">Add Note</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ padding: "1.5rem" }}>
          {bookingNotes.length > 0 && (
            <div
              className="mb-3"
              style={{
                background: "#f8f9fa",
                border: "1px solid #e9ecef",
                borderRadius: 4,
                padding: "10px 12px",
                maxHeight: 180,
                overflowY: "auto",
                fontSize: "0.82rem",
              }}
            >
              <div
                className="fw-semibold mb-2"
                style={{ fontSize: "0.78rem", color: "#555" }}
              >
                Existing notes ({bookingNotes.length})
              </div>
              <ul className="mb-0 ps-3">
                {bookingNotes.map((n, idx) => (
                  <li key={n.id || idx} style={{ marginBottom: 4 }}>
                    {n.note || "-"}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Form.Group controlId="cabNoteInput">
            <Form.Label className="fw-semibold mb-1">New Note</Form.Label>
            <Form.Control
              as="textarea"
              rows={4}
              placeholder="Enter a note for this booking"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              disabled={savingNote}
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
            onClick={() => setShowNotesModal(false)}
            disabled={savingNote}
          >
            Close
          </Button>
          <Button variant="primary" onClick={saveNote} disabled={savingNote}>
            {savingNote ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Saving...
              </>
            ) : (
              "Add Note"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Resend Mail to Agent Modal ──
          Previews the cab voucher that will be attached and lets the admin
          confirm/edit the recipient before the /resend-mail POST fires. */}
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
            Resend {showsFinalDocs ? "Voucher" : "Proforma Voucher"} to Agent
            {booking?.packageBookCode ? ` — ${booking.packageBookCode}` : ""}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ padding: 0, height: "80vh" }}>
          {resendMailPreparing ? (
            <div className="d-flex align-items-center justify-content-center h-100">
              <Spinner animation="border" variant="primary" />
              <span className="ms-2 text-muted">
                Preparing voucher attachment…
              </span>
            </div>
          ) : resendMailPdfUrl ? (
            <iframe
              key={resendMailPdfUrl}
              src={resendMailPdfUrl}
              title="Voucher preview"
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

      {/* ── PDF Preview Modal (Proforma/Final Voucher & Invoice) ── */}
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
            {booking.packageBookCode ? ` — ${booking.packageBookCode}` : ""}
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
                download={`CabBooking_${bookingId}_${
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

      {/* ── Voucher modal — iframe preview + email-send form ───── */}
      <Modal
        show={showVoucherModal}
        onHide={closeVoucherModal}
        size="xl"
        centered
        backdrop="static"
        keyboard={false}
      >
        <Modal.Header
          closeButton={!voucherSending}
          className="border-bottom"
          style={{ backgroundColor: "#f1f3f5" }}
        >
          <Modal.Title className="d-flex align-items-center text-dark fw-semibold">
            <FaFileInvoice className="me-2 text-secondary" />
            Voucher
            {booking.packageBookCode && (
              <Badge
                bg="light"
                text="dark"
                className="ms-3 fw-semibold border"
              >
                {booking.packageBookCode}
              </Badge>
            )}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-3 bg-white">
          {/* Email Voucher panel — sits ABOVE the PDF preview. */}
          <Card className="border shadow-none rounded-3 mb-3">
            <Card.Header
              className="py-2 fw-semibold text-dark d-flex align-items-center"
              style={{ backgroundColor: "#f1f3f5" }}
            >
              <FaEnvelope className="me-2 text-secondary" /> Email Voucher
            </Card.Header>
            <Card.Body className="p-3">
              <Row className="g-2 align-items-start">
                <Col md={8}>
                  <Form.Label className="small fw-semibold mb-1">
                    Recipient Email <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    type="email"
                    placeholder="name@example.com"
                    value={voucherEmail}
                    onChange={(e) => {
                      setVoucherEmail(e.target.value);
                      if (voucherEmailError) setVoucherEmailError("");
                    }}
                    isInvalid={!!voucherEmailError}
                    disabled={voucherSending}
                  />
                  {voucherEmailError ? (
                    <div className="invalid-feedback d-block">
                      {voucherEmailError}
                    </div>
                  ) : (
                    <Form.Text className="text-muted">
                      The voucher PDF will be attached and sent to this address.
                    </Form.Text>
                  )}
                </Col>
                <Col md={4} className="d-flex flex-column gap-2 mt-md-4">
                  <Button
                    variant="dark"
                    onClick={sendVoucherEmail}
                    disabled={voucherSending}
                  >
                    {voucherSending ? (
                      <>
                        <Spinner size="sm" className="me-2" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <FaEnvelope className="me-2" /> Send
                      </>
                    )}
                  </Button>
                  {voucherPdfUrl && (
                    <Button
                      variant="outline-secondary"
                      href={voucherPdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      disabled={voucherSending}
                    >
                      Open in New Tab
                    </Button>
                  )}
                </Col>
              </Row>
            </Card.Body>
          </Card>

          {/* PDF preview below the email form. */}
          <Card className="border shadow-none rounded-3 overflow-hidden">
            <Card.Body className="p-0">
              {voucherPdfUrl ? (
                <iframe
                  title="Voucher PDF"
                  src={voucherPdfUrl}
                  style={{
                    width: "100%",
                    height: "65vh",
                    border: "none",
                    display: "block",
                  }}
                />
              ) : (
                <div className="text-center text-muted py-5">
                  No voucher loaded.
                </div>
              )}
            </Card.Body>
          </Card>
        </Modal.Body>
        <Modal.Footer
          className="border-top"
          style={{ backgroundColor: "#f8f9fa" }}
        >
          <Button
            variant="secondary"
            onClick={closeVoucherModal}
            disabled={voucherSending}
          >
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
