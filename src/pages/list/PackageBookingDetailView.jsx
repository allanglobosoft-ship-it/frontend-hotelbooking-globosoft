/**
 * PackageBookingDetailView.jsx
 *
 * Full-page detail view for a single Package booking. Replaces the
 * modal-based "View" that used to live in PackageBookingList. The
 * Edit / Voucher / Cancel action icons from the row now sit at the
 * bottom-left of this page as buttons. All endpoints / behaviour are
 * unchanged:
 *   - Detail fetch   :  GET  /api/v1/package-booking/booking/{id}
 *   - Send voucher   :  POST /api/v1/package-booking/send-voucher/{id}  { email }
 *   - Cancel         :  PUT  /api/v1/package-booking/cancel/{id}
 *   - Amend / Edit   :  navigate('/new-booking/package-booking/{packageId}', state)
 *
 * The list row is forwarded via location.state.booking so the Edit
 * button has access to packageId / agentId / destinationCountryId
 * (those aren't returned by the detail endpoint). On hard refresh the
 * detail endpoint is still called by id, but Edit will toast "package
 * id missing" if state was lost — same guard as the original list.
 */
import React, { useEffect, useState } from "react";
import {
  Container,
  Row,
  Col,
  Form,
  Table,
  InputGroup,
  Spinner,
  Modal,
  Button,
} from "react-bootstrap";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import {
  FaEye,
  FaFileAlt,
  FaEdit,
  FaEnvelope,
  FaDownload,
  FaExclamationCircle,
  FaExclamationTriangle,
  FaHistory,
  FaPlusCircle,
  FaCheckCircle,
  FaTimesCircle,
  FaSyncAlt,
  FaCalendarAlt,
  FaClock,
  FaUserAlt,
  FaMapMarkerAlt,
  FaNetworkWired,
} from "react-icons/fa";
import { toast } from "react-hot-toast";
import axiosInstance from "../../components/AxiosInstance";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import {
  canSeeSupplierNames,
  savedPackageRate,
  savedSupplierHotelRate,
  supplierLabel,
  supplierStatusLabel,
} from "../booking/packagebooking/supplierHotels";
import { useFeatureFlag } from "../../config/FeatureFlagsContext";
import {
  FulfilmentStatusBadge,
  SupplierFulfilmentCell,
  SupplierFulfilmentModal,
  fetchFulfilment,
  isTracked,
} from "./PackageSupplierFulfilment";
import { ServiceFulfilmentSections } from "./PackageServiceFulfilment";
// HotelBookingPage's stylesheet is the source of truth for the .pg-option /
// .pg-option-selected / .pg-option-radio / .pg-option-logo classes used by
// the "Select Payment Gateway" modal below. Importing here keeps the modal
// visually identical to the Hotel / Package-Create / LastMinute / LongStay
// flows without a copy.
import "../../styles/HotelBookingPage.css";
import { orderIdPathSegment } from "../../utils/urlSafety";

// Line under a supplier hotel's name. Admins see the supplier and whether it
// still has to be booked by hand; everyone else only sees it's a live-rate hotel.
const SupplierHotelNote = ({ hotel }) => {
  if (!canSeeSupplierNames()) {
    return <div className="small text-muted">Live rate hotel</div>;
  }
  return (
    <div className="small text-muted">
      {supplierLabel(hotel.supplier)} · {supplierStatusLabel(hotel.supplierBookingStatus)}
      {hotel.supplierReference && ` · Ref: ${hotel.supplierReference}`}
      {hotel.hotelBookingCode && ` · Hotel booking: ${hotel.hotelBookingCode}`}
    </div>
  );
};

// CC Avenue is the only real gateway wired today (see
// project_ccavenue_payment_integration memory). Kept as a list so adding
// more later needs no modal wiring changes.
const PAYMENT_GATEWAYS = [
  { id: "ccavenue", name: "CC Avenue", desc: "Cards, UPI, Net Banking" },
];

// Reverse-geocode browser coordinates to a readable address for the Booking
// History audit trail — used when the user reconfirms a held booking so the
// Reconfirmed row's Location column can show a precise street-level address.
// Tries OpenStreetMap Nominatim first (street-level), then BigDataCloud
// (locality-level, keyless). Returns null when neither responds so the caller
// keeps its IP-derived fallback. Mirrors PaxInformation.jsx's helper.
async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1`,
      { headers: { Accept: "application/json" } },
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
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
    );
    if (res.ok) {
      const d = await res.json();
      const parts = [
        d.locality,
        d.city,
        d.principalSubdivision,
        d.countryName,
      ].filter(Boolean);
      const line = parts.filter((p, i) => parts.indexOf(p) === i).join(", ");
      if (line) return line.slice(0, 255);
    }
  } catch {
    // give up — caller keeps the IP-based fallback
  }
  return null;
}

const BUTTON_STYLE = {
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

// Per-action button colours — mirror the Hotel booking detail view
// (BookingDetailedView.jsx) so both detail screens share one palette.
const BTN_PRIMARY = { ...BUTTON_STYLE, backgroundColor: "#2563eb" }; // Add New Item
const BTN_DANGER = { ...BUTTON_STYLE, backgroundColor: "#dc2626" }; // Cancel
const BTN_RECONFIRM = { ...BUTTON_STYLE, backgroundColor: "#16a34a" }; // Reconfirm
const BTN_TEAL = { ...BUTTON_STYLE, backgroundColor: "#0d9488" }; // Voucher
const BTN_INFO = { ...BUTTON_STYLE, backgroundColor: "#0891b2" }; // Invoice
const BTN_SKY = { ...BUTTON_STYLE, backgroundColor: "#3ba2e8" }; // Add Agent Reference
const BTN_INDIGO = { ...BUTTON_STYLE, backgroundColor: "#6366f1" }; // Confirmation No.
const BTN_ORANGE = { ...BUTTON_STYLE, backgroundColor: "#f0922b" }; // Resend Mail
const BTN_ACCENT = { ...BUTTON_STYLE, backgroundColor: "#7c3aed" }; // Booking Remark
const BTN_NEUTRAL = { ...BUTTON_STYLE, backgroundColor: "#64748b" }; // Notes
const BTN_HISTORY = { ...BUTTON_STYLE, backgroundColor: "#334155" }; // History

// Sub-booking types offered by "ADD NEW ITEM". Mirrors the Hotel detail view
// (BookingDetailedView.jsx): each entry launches its OWN existing create flow
// with ?parentBookingCode set so the child is stamped "{parent}/{n}" on the
// backend. The Package option is included so an operator can also amend with
// another package (the previous behaviour on this screen).
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

// Style tokens mirror BookingDetailedView.jsx (the Hotel booking
// detail page) so this screen reads with the same neutral palette
// — gray section bars, plain label/value rows, no gradients.
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

const CARD_STYLE = {
  border: "1px solid #ddd",
  borderRadius: "4px",
  marginBottom: "14px",
  overflow: "hidden",
  backgroundColor: "#fff",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
};

const InfoRow = ({ label, value }) => (
  <div
    style={{
      marginBottom: "6px",
      display: "flex",
      alignItems: "flex-start",
    }}
  >
    <span style={INFO_LABEL}>{label}</span>
    <span style={{ ...INFO_VALUE, marginLeft: "8px" }}>{value ?? "-"}</span>
  </div>
);

const formatDate = (dateString) => {
  if (!dateString) return "-";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return dateString;
  }
};

// Deadline Date is the end of the last free-cancellation day, worked out by the
// backend from the travel date. Every package-booking detail view shows BOTH the date AND
// the time. Values may be a full datetime ("yyyy-MM-ddTHH:mm:ss") or a legacy
// date-only ("yyyy-MM-dd"); a date-only value is normalised to local midnight
// so it renders as "12:00 AM" rather than a timezone-shifted time — new Date()
// parses a bare "yyyy-MM-dd" as UTC, which would otherwise show e.g. 05:30 AM
// (IST) / 04:00 AM (GST) here.
const formatDateTime = (dateString) => {
  if (!dateString) return "-";
  const str = String(dateString).trim();
  const normalised = /^\d{4}-\d{2}-\d{2}$/.test(str) ? `${str}T00:00:00` : str;
  const date = new Date(normalised);
  if (isNaN(date.getTime())) return str;
  const datePart = date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timePart = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return `${datePart}, ${timePart}`;
};

export default function PackageBookingDetailView() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // The list row (carries packageId / agentId / destinationCountryId
  // for the Edit button) plus the bucket key (so we can mirror the
  // "actions only on non-cancelled rows" gate from the list).
  const rowStub = location.state?.booking || null;
  const listStatus = location.state?.status || "upcoming";
  const bookingId = rowStub?.bookingId || rowStub?.id || routeId;

  const [bookingDetails, setBookingDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  // Full package programme — fetched once we know the packageId so we
  // can show duration, itinerary, includes/excludes, cancellation
  // policy, and T&C on the same page.
  const [packageView, setPackageView] = useState(null);

  // ── Mirrors the Hotel detail flow:
  //    Add Agent Reference / Confirmation No. / Booking Remark / Notes
  //    each get their own modal + handler. Endpoints are the
  //    package-booking equivalents of the hotel-booking ones used by
  //    BookingDetailedView.jsx.
  const [showAgentRefModal, setShowAgentRefModal] = useState(false);
  const [agentRefInput, setAgentRefInput] = useState("");
  const [agentRefError, setAgentRefError] = useState("");
  const [savingAgentRef, setSavingAgentRef] = useState(false);

  const [showConfirmationNoModal, setShowConfirmationNoModal] =
    useState(false);
  const [confirmationNoInput, setConfirmationNoInput] = useState("");
  const [confirmationNoError, setConfirmationNoError] = useState("");
  const [savingConfirmationNo, setSavingConfirmationNo] = useState(false);

  // Resend Mail to Agent — clicking the button opens a preview modal that
  // shows the voucher PDF the mail will attach and lets the admin edit the
  // agent's email before the /resend-mail POST fires. Mirrors the hotel
  // detail view (BookingDetailedView.jsx) so the flow is consistent across
  // Confirmed, ReConfirmed, and Cancelled bookings.
  const [resendingMail, setResendingMail] = useState(false);
  const [showResendMailModal, setShowResendMailModal] = useState(false);
  const [resendMailPdfUrl, setResendMailPdfUrl] = useState("");
  const [resendMailEmail, setResendMailEmail] = useState("");
  const [resendMailEmailError, setResendMailEmailError] = useState("");
  const [resendMailPreparing, setResendMailPreparing] = useState(false);

  const [showRemarkModal, setShowRemarkModal] = useState(false);
  const [remarkInput, setRemarkInput] = useState("");
  const [savingRemark, setSavingRemark] = useState(false);

  const [showNotesModal, setShowNotesModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [bookingNotes, setBookingNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);

  // Agent Reference / Confirmation No. / Booking Remark are read directly
  // from bookingDetails (backed by the package_booking row). Notes are
  // fetched separately into bookingNotes below. Saves POST to dedicated
  // backend endpoints and then re-fetch, so values persist across sessions,
  // devices, and backend restarts.

  // Cancellation state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  // Mandatory reason, matching the hotel detail view's Cancel modal. Sent as
  // `reason` on the cancel request and persisted on the booking.
  const [cancellationReason, setCancellationReason] = useState("");
  const [showReconfirmModal, setShowReconfirmModal] = useState(false);
  const [isReconfirming, setIsReconfirming] = useState(false);
  // Client location captured when the user opens the Reconfirm / Cancel
  // modal, sent with the corresponding request so the History modal's
  // "Booking Reconfirmed" / "Booking Cancelled" rows can show it. IP
  // address is stamped server-side from the HTTP request.
  const [reconfirmLocation, setReconfirmLocation] = useState(null);
  const [cancelLocation, setCancelLocation] = useState(null);

  // ── CC Avenue reconfirm gateway state ────────────────────────────────
  // Mirrors the shape of the PaxInformation / HotelBookingPage credit-
  // gate flow: when the plain PUT /reconfirm/{id} call comes back
  // "Insufficient credit", we show a "Booking Cannot Be Completed" popup
  // (no card enabled) OR "Online Payment Required" → "Select Payment
  // Gateway" (card enabled) → navigate to /payment/ccavenue-redirect with
  // flowType=PACKAGE_RECONFIRM. isFinalizingReconfirmPayment gates the
  // full-viewport "creating your booking" overlay while the resume effect
  // calls /finalize-package-reconfirm/{orderId}.
  const [showReconfirmInsufficientModal, setShowReconfirmInsufficientModal] =
    useState(false);
  const [showReconfirmNoPaymentPathModal, setShowReconfirmNoPaymentPathModal] =
    useState(false);
  const [showReconfirmGatewayModal, setShowReconfirmGatewayModal] =
    useState(false);
  const [reconfirmSelectedGateway, setReconfirmSelectedGateway] = useState("");
  const [reconfirmInsufficientAmount, setReconfirmInsufficientAmount] =
    useState(0);
  const [isFinalizingReconfirmPayment, setIsFinalizingReconfirmPayment] =
    useState(false);
  // Backend switch package.payment.card-via-gateway: a "Card" booking is
  // reconfirmed through the payment gateway, never the credit limit. Off by
  // default (Reconfirm then behaves as before).
  const cardViaGateway = !!useFeatureFlag("packageCardViaGateway");
  // Backend switch package.admin-confirmation.enabled: a paid booking waits
  // for an admin, who books the hotel with a supplier from Selected Services.
  // Off by default (nothing below is fetched or rendered then).
  const adminConfirmation = !!useFeatureFlag("packageAdminConfirmation");
  // Backend switch package.service-fulfilment.enabled (on top of the one
  // above): separate Book Hotel / Book Transfer / Book Activities cards below
  // Selected Services, each service confirmed on its own
  // (PackageServiceFulfilment.jsx). Off by default: none of it renders.
  const serviceFulfilmentFlag = !!useFeatureFlag("packageServiceFulfilment");
  const serviceFulfilment = adminConfirmation && serviceFulfilmentFlag;
  // The Selected Preferred Hotels heading's slot for the booking's status and
  // Reject booking (filled by ServiceFulfilmentSections' three-column layout).
  const [servicesHeaderEl, setServicesHeaderEl] = useState(null);
  const [fulfilment, setFulfilment] = useState(null);
  const [showFulfilmentModal, setShowFulfilmentModal] = useState(false);

  // ── Add New Item (amendment) picker — same flow as hotel detail view.
  // Opens a modal listing every sub-booking type; the chosen type's create
  // flow is launched with ?parentBookingCode so the backend chains children
  // under this booking's code.
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [selectedAddItemType, setSelectedAddItemType] = useState(
    ADD_NEW_ITEM_TYPES[0].key,
  );

  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [voucherEmail, setVoucherEmail] = useState("");
  const [isSendingVoucher, setIsSendingVoucher] = useState(false);
  const [voucherPdfUrl, setVoucherPdfUrl] = useState("");
  const [isLoadingVoucherPdf, setIsLoadingVoucherPdf] = useState(false);

  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoicePdfUrl, setInvoicePdfUrl] = useState("");
  const [isLoadingInvoicePdf, setIsLoadingInvoicePdf] = useState(false);

  const fetchDetails = async () => {
    if (!bookingId) {
      toast.error("Booking ID not found");
      setLoadingDetails(false);
      return;
    }
    try {
      setLoadingDetails(true);
      const response = await axiosInstance.get(
        `/api/v1/package-booking/booking/${bookingId}`
      );
      if (response.data) {
        setBookingDetails(response.data);
      } else {
        toast.error("Failed to load booking details");
      }
    } catch (error) {
      console.error("Error fetching booking details:", error);
      toast.error(
        error.response?.data?.message || "Failed to load booking details"
      );
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    fetchDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  // Admin confirmation status — refreshed whenever the booking's payment /
  // cancellation state changes (reconfirm, cancel). Off: never fetched.
  const loadFulfilment = async () => {
    if (!adminConfirmation || !bookingId) return;
    try {
      setFulfilment(await fetchFulfilment(bookingId));
    } catch (error) {
      console.warn("Could not load the booking's confirmation status:", error);
      setFulfilment(null);
    }
  };
  useEffect(() => {
    loadFulfilment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    adminConfirmation,
    bookingId,
    bookingDetails?.bookingStatus,
    bookingDetails?.isCancelled,
  ]);
  // With per-service confirmation on, hotels are booked from the separate
  // "Book Hotel" card instead, so the old single-hotel Supplier column is not
  // shown (flag off: exactly as before).
  const showSupplierColumn =
    adminConfirmation && !serviceFulfilment && canSeeSupplierNames() && isTracked(fulfilment);

  // CC Avenue post-payment resume — mirrors BookingDetailedView.jsx (hotel
  // reconfirm) and PackageCheckout.jsx (package create). CC Avenue's
  // redirect is a real cross-domain browser navigation, so React Router
  // `state` never survives it; the backend appends
  // ?ccavenueOrderId=&ccavenueStatus= to the URL when it 302s the browser
  // back. We verify server-side (so a tampered URL can't force a
  // reconfirm), then call /finalize-package-reconfirm which stamps the
  // booking as RECONFIRMED with modeOfPayment=ONLINE and no credit debit
  // (real money already captured via CC Avenue).
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const ccavenueOrderId = searchParams.get("ccavenueOrderId");
    const ccavenueStatus = searchParams.get("ccavenueStatus");
    if (!ccavenueOrderId) return;

    // Strip the resume query right away so a remount / reload can't
    // re-trigger this effect (and re-POST /finalize-package-reconfirm).
    navigate(location.pathname, { replace: true, state: {} });

    (async () => {
      if (ccavenueStatus !== "success") {
        toast.error("Payment was not completed. Please try again.");
        return;
      }
      try {
        setIsFinalizingReconfirmPayment(true);
        const statusResponse = await axiosInstance.get(
          `/api/payment/ccavenue/status/${orderIdPathSegment(ccavenueOrderId)}`,
        );
        if (statusResponse.data?.status !== "SUCCESS") {
          toast.error(
            statusResponse.data?.statusMessage ||
              "Payment was not successful. Please try again.",
          );
          return;
        }
        const res = await axiosInstance.post(
          `/api/payment/ccavenue/finalize-package-reconfirm/${orderIdPathSegment(ccavenueOrderId)}`,
        );
        const body = res?.data || {};
        if (body.status === "success") {
          toast.success(body.message || "Booking reconfirmed successfully");
          // Refresh so the detail page picks up the new RECONFIRMED status,
          // the ONLINE payment-mode label, the reconfirm audit fields, and
          // switches Voucher / Invoice from Proforma to Final.
          await fetchDetails();
        } else {
          toast.error(
            body.message ||
              "Payment succeeded but reconfirm could not be completed. Please contact support with your payment reference.",
          );
        }
      } catch (err) {
        const beMsg =
          err?.response?.data?.message || err?.message || null;
        console.error("Post-payment package reconfirm failed:", err);
        toast.error(
          beMsg ||
            "Payment succeeded but reconfirm could not be completed. Please contact support with your payment reference.",
        );
      } finally {
        setIsFinalizingReconfirmPayment(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // Warn on close / navigate-away while the paid-for reconfirm is still
  // being applied server-side. Only attached during that window.
  useEffect(() => {
    if (!isFinalizingReconfirmPayment) return;
    const beforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [isFinalizingReconfirmPayment]);

  // Backend is now the single source of truth for notes.
  const mergedNotes = bookingNotes;

  const fetchBookingNotes = async () => {
    if (!bookingId) return;
    try {
      setNotesLoading(true);
      const res = await axiosInstance.get(
        `/api/v1/package-booking/booking/${bookingId}/notes`,
      );
      const list = Array.isArray(res.data?.notes)
        ? res.data.notes
        : Array.isArray(res.data)
          ? res.data
          : [];
      setBookingNotes(list);
    } catch {
      setBookingNotes([]);
    } finally {
      setNotesLoading(false);
    }
  };

  // Fetch server-side notes on mount / bookingId change. Individual saves
  // call fetchBookingNotes() directly to refresh after appending.
  useEffect(() => {
    fetchBookingNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  // Once we have the booking row, lazy-fetch the underlying package's
  // programme so the page can render the itinerary, inclusions,
  // exclusions, cancellation window and T&C just like the booking-flow
  // screens do. Failure is non-blocking — the page still works without
  // the enrichment.
  useEffect(() => {
    const pkgId = bookingDetails?.packageId || rowStub?.packageId;
    if (!pkgId) return;
    let cancelled = false;
    axiosInstance
      .get(`/api/TravelPackage/view/${pkgId}`)
      .then((res) => {
        if (cancelled) return;
        setPackageView(res.data || null);
      })
      .catch(() => {
        if (!cancelled) setPackageView(null);
      });
    return () => {
      cancelled = true;
    };
  }, [bookingDetails?.packageId, rowStub?.packageId]);


  // ── ADD NEW ITEM handlers ──────────────────────────────────────────
  // Mirrors the Hotel "ADD NEW ITEM" pattern in BookingDetailedView.jsx: the
  // button opens a picker modal listing every sub-booking type; the chosen
  // type's own create flow is launched with ?parentBookingCode set. Walking
  // up to the root parent means amendments of amendments still chain to the
  // original code (GPKG-4 → GPKG-4/1 → GPKG-4/2, not GPKG-4/1/1).
  const openAddItemModal = () => {
    const source = bookingDetails || rowStub || {};
    const parent = source.parentBookingCode || source.confirmationCode;
    if (!parent) {
      toast.error("Cannot add new item — booking code missing");
      return;
    }
    setSelectedAddItemType(ADD_NEW_ITEM_TYPES[0].key);
    setShowAddItemModal(true);
  };

  const submitAddItem = () => {
    const chosen = ADD_NEW_ITEM_TYPES.find(
      (t) => t.key === selectedAddItemType,
    );
    if (!chosen) return;
    const source = bookingDetails || rowStub || {};
    const parent = source.parentBookingCode || source.confirmationCode;
    if (!parent) {
      toast.error("Cannot add new item — booking code missing");
      return;
    }
    setShowAddItemModal(false);
    navigate(
      `${chosen.route}?parentBookingCode=${encodeURIComponent(parent)}`,
    );
  };

  // ── Cancel handlers ─────────────────────────────────────────────────
  // Sends the resolved client location alongside the cancel request so the
  // backend can stamp cancelled_booking_location / cancelled_ip_address —
  // the IP is resolved server-side from the HTTP request itself.
  const confirmCancelBooking = async () => {
    if (!bookingId) return;
    // Cancellation reason is mandatory — the modal marks the field with an
    // asterisk + invalid state and disables "Yes, Cancel" while it's empty.
    // Belt-and-braces guard so a stray submit can't sneak past. Mirrors
    // cancelBooking() on the hotel detail view.
    const reason = cancellationReason.trim();
    if (!reason) {
      toast.error("Please enter a cancellation reason.");
      return;
    }
    try {
      setIsCancelling(true);
      const response = await axiosInstance.put(
        `/api/v1/package-booking/cancel/${bookingId}`,
        { bookingLocation: cancelLocation, reason },
      );
      if (response.data && response.data.status === "success") {
        toast.success(
          response.data.message || "Booking cancelled successfully"
        );
        setShowCancelModal(false);
        setCancellationReason("");
        navigate(-1);
      } else {
        toast.error(response.data?.message || "Failed to cancel booking");
      }
    } catch (error) {
      console.error("Error cancelling booking:", error);
      toast.error(
        error.response?.data?.message ||
          "Error cancelling booking. Please try again."
      );
    } finally {
      setIsCancelling(false);
    }
  };

  // Kick off client-location resolution and feed the result into the given
  // setter. IP-derived coarse fallback fires first so that even if the user
  // denies geolocation we have SOMETHING to show; browser geolocation, when
  // granted, overrides with a precise reverse-geocoded address. Shared
  // between the Reconfirm and Cancel modal openers so both capture the same
  // audit snapshot with identical fallback behaviour.
  const resolveClientLocation = (setter) => {
    fetch("https://ipapi.co/json/")
      .then((res) => (res.ok ? res.json() : null))
      .then((info) => {
        if (!info) return;
        const line = [info.city, info.region, info.country_name]
          .filter(Boolean)
          .join(", ");
        if (!line) return;
        setter((prev) => prev || line);
      })
      .catch(() => {});

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
          const precise = await reverseGeocode(coords.latitude, coords.longitude);
          if (precise) setter(precise);
        },
        () => {}, // denied / unavailable — keep the IP-derived fallback
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
      );
    }
  };

  // Open the Reconfirm modal AND kick off client-location resolution so the
  // reconfirm submit has an address ready to send. Deferring resolution
  // until the user opens the modal avoids pinging geolocation on every
  // detail-page view — the prompt only appears when the user actually
  // intends to reconfirm.
  const openReconfirmModal = () => {
    setReconfirmLocation(null);
    setShowReconfirmModal(true);
    resolveClientLocation(setReconfirmLocation);
  };

  // Open the Cancel modal AND kick off client-location resolution so the
  // cancel submit has an address ready to send. Same pattern as the
  // reconfirm opener above — geolocation prompt only appears when the user
  // actually intends to cancel, and the result feeds the History modal's
  // "Booking Cancelled" row Location column.
  const openCancelModal = () => {
    setCancelLocation(null);
    setShowCancelModal(true);
    resolveClientLocation(setCancelLocation);
  };

  // Reconfirm a held (Confirmed) booking → ReConfirmed. Mirrors the hotel
  // detail view's RECONFIRM: the backend flips the status AND settles the
  // agent's deferred credit (blocking if credit is insufficient). On success
  // we re-fetch so the buttons switch to the final Voucher / Invoice, and so
  // the History modal picks up the freshly-captured reconfirm location + IP.
  const confirmReconfirmBooking = async () => {
    if (!bookingId) return;
    // "Card" booking with the card-via-gateway switch on: pay through the
    // gateway (same picker as the insufficient-credit path) instead of the
    // credit limit. Switch off: skipped, Reconfirm behaves as before.
    const isCardBooking = ["CARD", "CARD_PAYMENT"].includes(
      String(bookingDetails?.modeOfPayment || "").trim().toUpperCase(),
    );
    if (cardViaGateway && isCardBooking && bookingDetails?.agentId) {
      const agentResp = await axiosInstance
        .get(`/api/agent/${bookingDetails.agentId}`)
        .catch(() => ({ data: { cardPaymentEnabled: false } }));
      setReconfirmInsufficientAmount(Number(bookingDetails?.totalPrice) || 0);
      setShowReconfirmModal(false);
      if (!agentResp?.data?.cardPaymentEnabled) {
        toast.error("Card payment is not enabled for this agent.");
        return;
      }
      setReconfirmSelectedGateway("");
      setShowReconfirmGatewayModal(true);
      return;
    }
    try {
      setIsReconfirming(true);
      const response = await axiosInstance.put(
        `/api/v1/package-booking/reconfirm/${bookingId}`,
        { bookingLocation: reconfirmLocation },
      );
      if (response.data && response.data.status === "success") {
        toast.success(
          response.data.message || "Booking reconfirmed successfully",
        );
        setShowReconfirmModal(false);
        await fetchDetails();
      } else {
        toast.error(response.data?.message || "Failed to reconfirm booking");
      }
    } catch (error) {
      console.error("Error reconfirming booking:", error);
      // Insufficient-credit branch: PackageBookingServiceImpl.reconfirmBooking
      // throws IllegalArgumentException whose message starts with "Agent
      // credit limit is insufficient to reconfirm this booking." (400 body:
      // {status:"error", message:"…Insufficient credit. Available: X,
      // Required: Y"}). Instead of leaving the operator stuck, route them
      // through the same "Online Payment Required → CC Avenue" flow the
      // create-side PaxInformation uses. We probe the agent's card gate in
      // parallel — a Cash-only agent gets the "Booking Cannot Be Completed"
      // popup instead. Fails open on the card-probe request (assumes card
      // disabled) so a hiccup can't silently expose Card.
      const beMsg =
        error?.response?.data?.message || error?.message || "";
      const isInsufficientCredit =
        /insufficient credit|credit limit is insufficient/i.test(beMsg);
      const agentIdForProbe = bookingDetails?.agentId;
      if (isInsufficientCredit && agentIdForProbe) {
        try {
          const agentResp = await axiosInstance
            .get(`/api/agent/${agentIdForProbe}`)
            .catch(() => ({ data: { cardPaymentEnabled: false } }));
          const requiredMatch = /Required:\s*([0-9.,]+)/i.exec(beMsg);
          const required = requiredMatch
            ? Number(String(requiredMatch[1]).replace(/,/g, ""))
            : Number(bookingDetails?.totalPrice) || 0;
          setReconfirmInsufficientAmount(required);
          setShowReconfirmModal(false);
          if (!agentResp?.data?.cardPaymentEnabled) {
            setShowReconfirmNoPaymentPathModal(true);
            return;
          }
          setReconfirmSelectedGateway("");
          setShowReconfirmInsufficientModal(true);
          return;
        } catch (probeErr) {
          console.warn("Card-gate probe failed:", probeErr);
          // Fall through to the plain error toast so the operator at least
          // sees the raw insufficient-credit message.
        }
      }
      toast.error(
        beMsg || "Failed to reconfirm booking. Please try again.",
      );
    } finally {
      setIsReconfirming(false);
    }
  };

  const loadVoucherPdf = async () => {
    if (!bookingId) return;
    setIsLoadingVoucherPdf(true);
    try {
      const response = await axiosInstance.get(
        `/api/package-bookings/${bookingId}/pdf`,
        { params: { type: "VOUCHER", proforma: !showsFinalDocs } }
      );
      if (response.data?.status === "SUCCESS" && response.data?.pdfUrl) {
        setVoucherPdfUrl(response.data.pdfUrl);
      } else {
        toast.error(response.data?.message || "Failed to load voucher PDF");
      }
    } catch (err) {
      console.error("Voucher load failed:", err);
      toast.error(err.response?.data?.message || "Failed to load voucher PDF");
    } finally {
      setIsLoadingVoucherPdf(false);
    }
  };

  const openVoucher = () => {
    const seedEmail =
      bookingDetails?.contactInfo?.email ||
      rowStub?.contactEmail ||
      rowStub?.email ||
      "";
    setVoucherEmail(seedEmail);
    setVoucherPdfUrl("");
    setShowVoucherModal(true);
    loadVoucherPdf();
  };

  const closeVoucher = () => {
    if (isSendingVoucher) return;
    setShowVoucherModal(false);
    setVoucherEmail("");
    setVoucherPdfUrl("");
  };

  const handleDownloadVoucher = async () => {
    if (!bookingId) {
      toast.error("Booking ID not found");
      return;
    }
    try {
      let url = voucherPdfUrl;
      if (!url) {
        const response = await axiosInstance.get(
          `/api/package-bookings/${bookingId}/pdf`,
          { params: { type: "VOUCHER", proforma: !showsFinalDocs } }
        );
        if (response.data?.status === "SUCCESS" && response.data?.pdfUrl) {
          url = response.data.pdfUrl;
          setVoucherPdfUrl(url);
        } else {
          toast.error(response.data?.message || "Failed to download voucher");
          return;
        }
      }
      const a = document.createElement("a");
      a.href = url;
      a.download = `AccommodationVoucher_${bookingId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error("Voucher download failed:", err);
      toast.error("Failed to download voucher");
    }
  };

  const loadInvoicePdf = async () => {
    if (!bookingId) return;
    setIsLoadingInvoicePdf(true);
    try {
      const response = await axiosInstance.get(
        `/api/package-bookings/${bookingId}/pdf`,
        { params: { type: "INVOICE", proforma: !showsFinalDocs } }
      );
      if (response.data?.status === "SUCCESS" && response.data?.pdfUrl) {
        setInvoicePdfUrl(response.data.pdfUrl);
      } else {
        toast.error(response.data?.message || "Failed to load invoice PDF");
      }
    } catch (err) {
      console.error("Invoice load failed:", err);
      toast.error(err.response?.data?.message || "Failed to load invoice PDF");
    } finally {
      setIsLoadingInvoicePdf(false);
    }
  };

  const openInvoice = () => {
    setInvoicePdfUrl("");
    setShowInvoiceModal(true);
    loadInvoicePdf();
  };

  const closeInvoice = () => {
    setShowInvoiceModal(false);
    setInvoicePdfUrl("");
  };

  const handleDownloadInvoice = async () => {
    if (!bookingId) {
      toast.error("Booking ID not found");
      return;
    }
    try {
      let url = invoicePdfUrl;
      if (!url) {
        const response = await axiosInstance.get(
          `/api/package-bookings/${bookingId}/pdf`,
          { params: { type: "INVOICE", proforma: !showsFinalDocs } }
        );
        if (response.data?.status === "SUCCESS" && response.data?.pdfUrl) {
          url = response.data.pdfUrl;
          setInvoicePdfUrl(url);
        } else {
          toast.error(response.data?.message || "Failed to download invoice");
          return;
        }
      }
      const a = document.createElement("a");
      a.href = url;
      a.download = `TaxInvoice_${bookingId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error("Invoice download failed:", err);
      toast.error("Failed to download invoice");
    }
  };

  const handleSendVoucherEmail = async () => {
    if (!bookingId) {
      toast.error("Booking ID not found");
      return;
    }
    const trimmed = (voucherEmail || "").trim();
    if (!trimmed) {
      toast.error("Please enter a recipient email");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("Please enter a valid email address");
      return;
    }
    try {
      setIsSendingVoucher(true);
      const res = await axiosInstance.post(
        `/api/v1/package-booking/send-voucher/${bookingId}`,
        { email: trimmed }
      );
      if (res.data?.status === "success") {
        toast.success(res.data.message || "Voucher emailed");
        closeVoucher();
      } else {
        toast.error(res.data?.message || "Failed to send voucher");
      }
    } catch (err) {
      console.error("Voucher email failed:", err);
      toast.error(err.response?.data?.message || "Failed to send voucher");
    } finally {
      setIsSendingVoucher(false);
    }
  };

  // ── Action handlers (mirror BookingDetailedView.jsx). Endpoints
  //    follow the existing /api/v1/package-booking/booking/{id}/...
  //    convention used by the rest of this page.

  // Agent Reference
  const openAgentRefModal = () => {
    setAgentRefInput(bookingDetails?.agentReference || "");
    setAgentRefError("");
    setShowAgentRefModal(true);
  };

  const saveAgentReference = async () => {
    const value = (agentRefInput || "").trim();
    if (!value) {
      setAgentRefError("Agent Reference is required");
      return;
    }
    setAgentRefError("");
    try {
      setSavingAgentRef(true);
      const res = await axiosInstance.post(
        `/api/v1/package-booking/booking/${bookingId}/agent-reference`,
        { agentReference: value },
      );
      if (res.data?.success !== false) {
        setShowAgentRefModal(false);
        toast.success(res.data?.message || "Agent Reference saved successfully");
        await fetchDetails();
      } else {
        toast.error(res.data?.message || "Failed to save Agent Reference");
      }
    } catch (err) {
      toast.error(
        err.response?.data?.message || "Failed to save Agent Reference",
      );
    } finally {
      setSavingAgentRef(false);
    }
  };

  // Confirmation Number
  const openConfirmationNoModal = () => {
    setConfirmationNoInput(bookingDetails?.confirmationNumber || "");
    setConfirmationNoError("");
    setShowConfirmationNoModal(true);
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
      const res = await axiosInstance.post(
        `/api/v1/package-booking/booking/${bookingId}/confirmation-number`,
        { confirmationNumber: value },
      );
      if (res.data?.success !== false) {
        setShowConfirmationNoModal(false);
        toast.success(
          res.data?.message || "Confirmation Number saved successfully",
        );
        await fetchDetails();
      } else {
        toast.error(res.data?.message || "Failed to save Confirmation Number");
      }
    } catch (err) {
      toast.error(
        err.response?.data?.message || "Failed to save Confirmation Number",
      );
    } finally {
      setSavingConfirmationNo(false);
    }
  };

  // Open the RESEND MAIL preview modal. Two parallel calls hydrate the
  // modal so the admin sees exactly what's about to go out:
  //   1) /api/package-bookings/{id}/pdf?type=VOUCHER — the same PDF the
  //      mail will attach, rendered inside an <iframe>. The proforma flag
  //      mirrors the Voucher / Proforma Voucher distinction shown
  //      elsewhere on this page (final voucher only once RECONFIRMED).
  //   2) /api/agent/{agentId} — pulls the agent's personal email so the
  //      recipient field starts pre-filled and editable.
  // Errors on either lookup surface as an inline modal warning but do
  // not block the admin from typing an address manually.
  const openResendMailModal = async () => {
    setResendMailPdfUrl("");
    setResendMailEmail("");
    setResendMailEmailError("");
    setShowResendMailModal(true);
    setResendMailPreparing(true);
    try {
      const agentId = bookingDetails?.agentId
        ? Number(String(bookingDetails.agentId).trim())
        : null;
      const [docRes, agentRes] = await Promise.all([
        axiosInstance
          .get(`/api/package-bookings/${bookingId}/pdf`, {
            params: { type: "VOUCHER", proforma: !showsFinalDocs },
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

  // Fire the actual /resend-mail POST using whatever address the admin
  // left in the modal's email field. Backend re-validates and falls back
  // to the agent's on-file address if the field is blank; here we keep
  // it strict so the preview matches what actually gets sent.
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
        `/api/v1/package-booking/booking/${bookingId}/resend-mail`,
        null,
        { params: { email } },
      );
      if (res.data?.success === false) {
        toast.error(res.data?.message || "Failed to resend mail to agent");
      } else {
        toast.success(
          res.data?.message || "Mail resent to agent successfully!",
        );
        setShowResendMailModal(false);
      }
    } catch (err) {
      toast.error(
        err.response?.data?.message || "Failed to resend mail to agent",
      );
    } finally {
      setResendingMail(false);
    }
  };

  // Booking Remark
  const openRemarkModal = () => {
    setRemarkInput(bookingDetails?.remarks || "");
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
      const res = await axiosInstance.post(
        `/api/v1/package-booking/booking/${bookingId}/remark`,
        { remarks: text },
      );
      if (res.data?.success !== false) {
        setShowRemarkModal(false);
        toast.success(res.data?.message || "Remark saved successfully");
        await fetchDetails();
      } else {
        toast.error(res.data?.message || "Failed to save remark");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save remark");
    } finally {
      setSavingRemark(false);
    }
  };

  // Notes — persisted server-side, listed newest-first via GET /notes.
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
        localStorage.getItem("username") ||
        sessionStorage.getItem("UserName") ||
        "unknown";
      const res = await axiosInstance.post(
        `/api/v1/package-booking/booking/${bookingId}/notes`,
        { noteText: text, createdBy },
      );
      if (res.data?.success !== false) {
        toast.success(res.data?.message || "Note added successfully");
        setNoteInput("");
        await fetchBookingNotes();
      } else {
        toast.error(res.data?.message || "Failed to save note");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save note");
    } finally {
      setSavingNote(false);
    }
  };

  // Live-only actions (Add New Item / Cancel / Reconfirm) are hidden once
  // the booking is cancelled. listStatus alone isn't enough — it's read
  // from location.state and is missing when the page is opened by direct
  // URL, so we also consult the fetched bookingDetails.isCancelled flag.
  // A booking is treated as live only when NEITHER source reports it
  // cancelled.
  const isCancellable =
    listStatus !== "cancelled" && bookingDetails?.isCancelled !== true;

  // Booking lifecycle events for the History modal — built from the detail
  // already loaded (no extra API call). Mirrors the Hotel booking detail
  // view: only events with a recorded timestamp are listed, sorted
  // chronologically, with per-action "Performed By" plus (for Created /
  // Reconfirmed) the capture location / IP.
  const bookingHistory = (() => {
    if (!bookingDetails) return [];
    const events = [];
    if (bookingDetails.bookingDate) {
      events.push({
        action: "Booking Created",
        at: bookingDetails.bookingDate,
        by: bookingDetails.createdBy || "-",
        location: bookingDetails.bookingLocation,
        ip: bookingDetails.ipAddress,
      });
    }
    if (bookingDetails.confirmedDate) {
      events.push({
        action: "Booking Confirmed",
        at: bookingDetails.confirmedDate,
        by: bookingDetails.confirmedBy || "-",
      });
    }
    // Packages don't record a separate reconfirmation timestamp (there's no
    // deadline flow like the hotel side has), but a "Book & Voucher" choice
    // maps to RECONFIRMED at create time. Surface it as its own history row
    // using the same audit trail so users see the lifecycle transition. The
    // reconfirm location / IP mirror the Created row's fields when the
    // RECONFIRM button was clicked; older bookings without those fields fall
    // back to whatever create-time location / IP was captured, so the row is
    // never empty when data exists.
    if (
      String(bookingDetails.bookingStatus || "").trim().toUpperCase() ===
        "RECONFIRMED" &&
      bookingDetails.bookingDate
    ) {
      events.push({
        action: "Booking Reconfirmed",
        at: bookingDetails.reconfirmedDate || bookingDetails.bookingDate,
        by:
          bookingDetails.reconfirmedBy ||
          bookingDetails.createdBy ||
          "-",
        location:
          bookingDetails.reconfirmedBookingLocation ||
          bookingDetails.bookingLocation,
        ip:
          bookingDetails.reconfirmedIpAddress ||
          bookingDetails.ipAddress,
      });
    } else if (bookingDetails.reconfirmedDate) {
      events.push({
        action: "Booking Reconfirmed",
        at: bookingDetails.reconfirmedDate,
        by: bookingDetails.reconfirmedBy || "-",
        location:
          bookingDetails.reconfirmedBookingLocation ||
          bookingDetails.bookingLocation,
        ip:
          bookingDetails.reconfirmedIpAddress ||
          bookingDetails.ipAddress,
      });
    }
    const cancelled =
      bookingDetails.isCancelled === true || listStatus === "cancelled";
    if (cancelled && bookingDetails.cancelledDate) {
      events.push({
        action: "Booking Cancelled",
        at: bookingDetails.cancelledDate,
        by: bookingDetails.cancelledBy || "-",
        location: bookingDetails.cancelledBookingLocation,
        ip: bookingDetails.cancelledIpAddress,
      });
    }
    return events.sort((a, b) => {
      const da = parseHistoryDate(a.at)?.getTime() ?? 0;
      const db = parseHistoryDate(b.at)?.getTime() ?? 0;
      return da - db;
    });
  })();

  // ── Derived enrichment from packageView ──
  const itineraries = Array.isArray(packageView?.itineraries)
    ? packageView.itineraries
    : [];
  const inclusions = Array.isArray(packageView?.inclusions)
    ? packageView.inclusions
    : [];
  const exclusions = Array.isArray(packageView?.exclusions)
    ? packageView.exclusions
    : [];
  const termsAndConditions = Array.isArray(packageView?.termsAndConditions)
    ? packageView.termsAndConditions
    : [];
  // A saved inclusion / exclusion / term can hold several lines (a custom
  // entry typed as a list in Package Registration). Each line is shown as its
  // own bullet, in full, instead of the lines running together in one bullet.
  const toBulletLines = (list, prefix) =>
    list.flatMap((item, i) =>
      String(item?.description ?? "")
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*[•·*-]\s*/, "").trim())
        .filter(Boolean)
        .map((text, k) => ({ key: `${prefix}-${item?.otherId ?? "custom"}-${i}-${k}`, text })),
    );
  const inclusionLines = toBulletLines(inclusions, "inc");
  const exclusionLines = toBulletLines(exclusions, "exc");
  const termsLines = toBulletLines(termsAndConditions, "tnc");
  const nights = packageView?.noOfNights ?? "";
  const nightsInt = parseInt(nights, 10);
  const daysInt = Number.isFinite(nightsInt) ? nightsInt + 1 : null;

  const cancellationParts = (() => {
    const free = packageView?.cancellationDaysFree;
    const withCharge = packageView?.cancellationDaysWithCharge;
    const type = packageView?.cancellationChargeType;
    const value = packageView?.cancellationChargeValue;
    if (free == null && withCharge == null && !value) {
      return [
        {
          tone: "muted",
          text: "Cancellation policy will be confirmed by the supplier.",
        },
      ];
    }
    const parts = [];
    if (free != null) {
      parts.push({
        tone: "ok",
        text: `Free cancellation up to ${free} day${free === 1 ? "" : "s"} before travel.`,
      });
    }
    if (withCharge != null) {
      let chargeText = "";
      if (value) {
        chargeText =
          type && type.toLowerCase() === "percent" ? `${value}%` : value;
      }
      parts.push({
        tone: "warn",
        text: `Within ${withCharge} day${withCharge === 1 ? "" : "s"} of travel${
          chargeText
            ? `, ${chargeText} cancellation charge applies`
            : ", cancellation charge applies"
        }.`,
      });
    }
    return parts;
  })();

  // Human-readable label for the mode-of-payment enum captured at
  // booking time. Falls back to the underscored constant if unknown.
  const modePaymentLabel = (() => {
    const m = (bookingDetails?.modeOfPayment || "").toString();
    if (!m) return "-";
    const dict = {
      AGENT_CREDIT_LIMIT: "Agent credit limit",
      CARD_PAYMENT: "Card payment",
      BANK_TRANSFER: "Bank transfer",
      CASH: "Cash",
      CREDIT: "Credit Limit",
      CARD: "Card",
      ONLINE: "Online Payment",
    };
    return dict[m] || m.replace(/_/g, " ");
  })();

  // ── Payment Status (derived) ─────────────────────────────────────────
  // Distinct from "Mode of Payment" — the mode is *how* the operator chose
  // to pay; the status is *whether* money has actually moved yet. Reads
  // cleanly across every combination:
  //
  //   • Cancelled + previously RECONFIRMED via credit → "Refunded"
  //     (backend restores the debit on cancel).
  //   • Cancelled + previously RECONFIRMED via ONLINE → "Cancelled (Paid)"
  //     (ONLINE cancels don't restore anything — real money already left).
  //   • Cancelled otherwise → "Cancelled — Not Paid".
  //   • RECONFIRMED + modeOfPayment=ONLINE → "Paid Online (CC Avenue)"
  //     — real money captured via CC Avenue's PACKAGE_CREATE or
  //     PACKAGE_RECONFIRM flow.
  //   • RECONFIRMED otherwise → "Paid via {mode}" (credit was debited).
  //   • CONFIRMED (Hold Package and Pay Later) → "Not Paid — Pending
  //     Reconfirm" — no credit debited, no money moved yet; the operator
  //     must Reconfirm (which routes through the payment gate) to settle.
  //   • Anything else → the derived status word only.
  const paymentStatus = (() => {
    const status = String(bookingDetails?.bookingStatus || "").trim().toUpperCase();
    const mode = String(bookingDetails?.modeOfPayment || "").trim().toUpperCase();
    const isOnline = mode === "ONLINE";
    if (listStatus === "cancelled" || bookingDetails?.isCancelled === true) {
      if (status === "RECONFIRMED") {
        return isOnline
          ? { label: "Cancelled (Paid Online)", color: "#dc2626" }
          : { label: "Refunded", color: "#0d9488" };
      }
      return { label: "Cancelled — Not Paid", color: "#dc2626" };
    }
    if (status === "RECONFIRMED") {
      if (isOnline) {
        return { label: "Paid Online (CC Avenue)", color: "#16a34a" };
      }
      const humanMode = modePaymentLabel && modePaymentLabel !== "-"
        ? modePaymentLabel
        : "Credit";
      return { label: `Paid via ${humanMode}`, color: "#16a34a" };
    }
    if (status === "CONFIRMED") {
      return {
        label: "Not Paid — Pending Reconfirm",
        color: "#b45309",
      };
    }
    // Any other bookingStatus (legacy rows / unknown values) — just render
    // the raw value; NEVER reference derivedStatus here, it's defined
    // below and hitting it during initial render throws a TDZ ReferenceError.
    return { label: status || "-", color: "#475569" };
  })();

  // Plain status label — Confirmed / Cancelled — colored inline only
  // (matches the Hotel detail page's StatusBadge approach of using
  // text color to convey state, no pill or background).
  // Mirrors the hotel booking flow: Cancelled → red, Confirmed → green.
  // ReConfirmed is displayed as "Confirm/ReConfirmed" in green too — only the
  // Status row's label/colour differ; derivedStatus itself keeps the plain
  // "ReConfirmed" value the action-button logic further down relies on.
  // Cancellation takes precedence over the persisted bookingStatus so a
  // cancelled-then-uncancelled row still reads correctly.
  const derivedStatus = (() => {
    if (listStatus === "cancelled" || bookingDetails?.isCancelled === true) {
      return "Cancelled";
    }
    const raw = String(bookingDetails?.bookingStatus || "").trim().toUpperCase();
    if (raw === "RECONFIRMED") return "ReConfirmed";
    if (raw === "CONFIRMED") return "Confirmed";
    if (raw === "CANCELLED") return "Cancelled";
    // Legacy fallback — reconstruct from the booking-confirmation choice.
    if (bookingDetails?.bookingConfirmation === "Book Now & Voucher later") {
      return "Confirmed";
    }
    if (bookingDetails?.bookingConfirmation === "Book & Voucher") {
      return "ReConfirmed";
    }
    return "Confirmed";
  })();
  // Status row display only: ReConfirmed reads "Confirm/ReConfirmed" (green)
  // and Cancelled reads "ReConfirmed/Cancelled" (red). derivedStatus itself is
  // unchanged so the action-button logic still keys off the plain values.
  const statusLabel =
    derivedStatus === "ReConfirmed"
      ? "Confirm/ReConfirmed"
      : derivedStatus === "Cancelled"
        ? "ReConfirmed/Cancelled"
        : derivedStatus;
  const statusColor = derivedStatus === "Cancelled" ? "#dc2626" : "#16a34a";

  // Voucher / Invoice variant. The raw bookingStatus survives cancellation
  // (only isCancelled flips), so a cancelled-from-Confirmed booking still
  // reports "CONFIRMED" here — same rule the hotel detail view uses via
  // cancelledFromStatus. Only a booking that was actually ReConfirmed (live
  // or before cancel) gets the final Voucher / Invoice; everything else
  // stays on the Proforma equivalents.
  const showsFinalDocs =
    String(bookingDetails?.bookingStatus || "").trim().toUpperCase() ===
    "RECONFIRMED";

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4" style={{ overflow: "auto" }}>
          <Container fluid style={{ maxWidth: "1100px" }}>
            {/* Header */}
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
                <FaEye className="me-2 text-info" />
                Booking Details
              </span>
            </div>

            {loadingDetails ? (
              <div className="text-center py-5">
                <Spinner animation="border" variant="primary" />
                <p className="mt-3 text-muted fw-medium">
                  Fetching details...
                </p>
              </div>
            ) : !bookingDetails ? (
              <div className="text-center py-5">
                <FaExclamationTriangle
                  size={40}
                  className="text-muted mb-3"
                />
                <p className="text-muted">
                  Booking data is unavailable at this moment.
                </p>
              </div>
            ) : (
              <>
                {/* ── Booking Information ──────────────────────────── */}
                <div style={CARD_STYLE}>
                  <div style={SECTION_HEADER}>Booking Information</div>
                  <div style={{ padding: "12px 16px" }}>
                    <Row>
                      <Col md={6}>
                        <InfoRow
                          label="Confirmation Code"
                          value={bookingDetails.confirmationCode}
                        />
                        <InfoRow
                          label="Package Name"
                          value={
                            bookingDetails.packageName ||
                            packageView?.packageName
                          }
                        />
                        <InfoRow
                          label="Package Code"
                          value={packageView?.packageCode}
                        />
                        <InfoRow
                          label="Package Type"
                          value={packageView?.packageTypeName}
                        />
                        <InfoRow
                          label="Package Category"
                          value={bookingDetails.packageCategory}
                        />
                        <InfoRow
                          label="Travel Date"
                          value={formatDate(bookingDetails.travelDate)}
                        />
                        {/* Check-in Date row hidden per request
                        <InfoRow
                          label="Check-in Date"
                          value={formatDate(bookingDetails.checkInDate)}
                        />
                        */}
                        <InfoRow
                          label="No. of Nights"
                          value={
                            nights ? `${nights} Nights / ${daysInt} Days` : "-"
                          }
                        />
                        <InfoRow
                          label="Deadline Date"
                          value={formatDateTime(bookingDetails.deadlineDate)}
                        />
                      </Col>
                      <Col md={6}>
                        <InfoRow
                          label="Arrive Country"
                          value={packageView?.arriveCountryName}
                        />
                        <InfoRow
                          label="Native Country"
                          value={bookingDetails.nativeCountry}
                        />
                        <InfoRow
                          label="Currency"
                          value={packageView?.currencyName}
                        />
                        <InfoRow
                          label="Mode of Payment"
                          value={modePaymentLabel}
                        />
                        <InfoRow
                          label="Payment Status"
                          value={
                            <span
                              style={{
                                color: paymentStatus.color,
                                fontWeight: 700,
                              }}
                            >
                              {paymentStatus.label}
                            </span>
                          }
                        />
                        {/* Flight legs are captured separately from
                            2026-08-17 onward. Bookings made before that only
                            carry the combined field, so fall back to it
                            rather than showing two empty rows. */}
                        {bookingDetails.arrivalFlightDetails ||
                        bookingDetails.departureFlightDetails ? (
                          <>
                            <InfoRow
                              label="Arrival Flight"
                              value={bookingDetails.arrivalFlightDetails}
                            />
                            <InfoRow
                              label="Departure Flight"
                              value={bookingDetails.departureFlightDetails}
                            />
                          </>
                        ) : (
                          <InfoRow
                            label="Flight Details"
                            value={bookingDetails.flightDetails}
                          />
                        )}
                        <InfoRow
                          label="Pax Count"
                          value={`${bookingDetails.counts?.adultCount || 0} Adult${bookingDetails.counts?.childCount ? `, ${bookingDetails.counts.childCount} Child` : ""}${bookingDetails.counts?.infantCount ? `, ${bookingDetails.counts.infantCount} Infant` : ""}`}
                        />
                        <InfoRow
                          label="Terms Accepted"
                          value={
                            bookingDetails.termsAccepted
                              ? "Yes"
                              : "No"
                          }
                        />
                        <InfoRow
                          label="Agent Reference"
                          value={
                            bookingDetails.agentReference ||
                            bookingDetails.agentLpo
                          }
                        />
                        <InfoRow
                          label="Confirmation No."
                          value={
                            bookingDetails.confirmationNumber ||
                            bookingDetails.confirmationNo
                          }
                        />
                        <InfoRow
                          label="Status"
                          value={
                            <span
                              style={{
                                color: statusColor,
                                fontWeight: 700,
                                fontSize: "0.85rem",
                              }}
                            >
                              {statusLabel}
                            </span>
                          }
                        />
                      </Col>
                    </Row>
                  </div>
                </div>

                {/* ── Contact Information ──────────────────────────── */}
                <div style={CARD_STYLE}>
                  <div style={SECTION_HEADER}>Contact Information</div>
                  <div style={{ padding: "12px 16px" }}>
                    <Row>
                      <Col md={6}>
                        <InfoRow
                          label="Primary Contact"
                          value={
                            [
                              bookingDetails.contactInfo?.title,
                              bookingDetails.contactInfo?.name,
                            ]
                              .filter(Boolean)
                              .join(" ") || "-"
                          }
                        />
                        <InfoRow
                          label="Email"
                          value={bookingDetails.contactInfo?.email}
                        />
                      </Col>
                      <Col md={6}>
                        <InfoRow
                          label="Mobile"
                          value={bookingDetails.contactInfo?.mobile}
                        />
                      </Col>
                    </Row>
                  </div>
                </div>

                {/* ── Travellers ──────────────────────────────────── */}
                <div style={CARD_STYLE}>
                  <div style={SECTION_HEADER}>
                    Travellers ({bookingDetails.travellers?.length || 0})
                  </div>
                  <div style={{ padding: "10px 16px 12px" }}>
                    <Table
                      size="sm"
                      className="mb-0"
                      style={{ fontSize: "0.82rem" }}
                    >
                      <thead style={{ backgroundColor: "#f8f8f8" }}>
                        <tr>
                          <th style={{ width: 80 }}>Type</th>
                          <th>Name</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bookingDetails.travellers?.map((traveller, idx) => (
                          <tr key={idx}>
                            <td>{traveller.type}</td>
                            <td>
                              {[
                                traveller.title,
                                traveller.firstName,
                                traveller.middleName,
                                traveller.lastName,
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                </div>

                {/* ── Selected Services ──────────────────────────── */}
                <div style={CARD_STYLE}>
                  <div style={SECTION_HEADER}>
                    {/* Renamed only with per-service confirmation on (off: as before). */}
                    {serviceFulfilment ? "Selected Preferred Hotels" : "Selected Services"}
                    {/* With per-service confirmation on, the booking's status is on the Book Hotel card instead. */}
                    {adminConfirmation && !serviceFulfilment && (
                      <FulfilmentStatusBadge fulfilment={fulfilment} />
                    )}
                    {serviceFulfilment && (
                      <span
                        ref={setServicesHeaderEl}
                        className="ms-auto d-flex align-items-center gap-2"
                        style={{ fontWeight: 400 }}
                      />
                    )}
                  </div>
                  <div style={{ padding: "10px 16px 12px" }}>
                    {bookingDetails.selections?.hotels &&
                    bookingDetails.selections.hotels.length > 0 ? (
                      <Table
                        size="sm"
                        className="mb-2"
                        style={{ fontSize: "0.82rem" }}
                      >
                        <thead style={{ backgroundColor: "#f8f8f8" }}>
                          <tr>
                            <th>Hotel</th>
                            <th style={{ width: 110 }}>Hotel ID</th>
                            <th
                              className="text-end"
                              style={{ width: 160 }}
                            >
                              Per Pax Rate
                            </th>
                            {showSupplierColumn && (
                              <th style={{ width: 280, paddingLeft: 28 }}>Supplier</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {bookingDetails.selections.hotels.map(
                            (hotel, hIdx) => (
                              <tr key={hotel.hotelId || hIdx}>
                                <td>
                                  {hotel.hotelName}
                                  {hotel.supplier && (
                                    <SupplierHotelNote hotel={hotel} />
                                  )}
                                </td>
                                <td>
                                  {hotel.supplier
                                    ? canSeeSupplierNames()
                                      ? hotel.supplierHotelCode
                                      : "—"
                                    : hotel.hotelId}
                                </td>
                                <td className="text-end">
                                  {hotel.currency || "AED"}{" "}
                                  {parseFloat(
                                    hotel.selectedRate || 0,
                                  ).toLocaleString("en-US", {
                                    minimumFractionDigits: 2,
                                  })}
                                  {hotel.supplier && (
                                    <div className="small text-muted">
                                      Whole stay
                                    </div>
                                  )}
                                </td>
                                {showSupplierColumn && (
                                  <td style={{ paddingLeft: 28 }}>
                                    {hIdx === 0 ? (
                                      <SupplierFulfilmentCell
                                        fulfilment={fulfilment}
                                        onOpen={() => setShowFulfilmentModal(true)}
                                      />
                                    ) : (
                                      <span className="text-muted">—</span>
                                    )}
                                  </td>
                                )}
                              </tr>
                            ),
                          )}
                        </tbody>
                      </Table>
                    ) : (
                      <div
                        style={{
                          fontSize: "0.82rem",
                          color: "#888",
                          fontStyle: "italic",
                        }}
                      >
                        No hotels selected.
                      </div>
                    )}

                    {bookingDetails.selections?.cab && (
                      <InfoRow
                        label="Transfer"
                        value={`${bookingDetails.selections.cab.cabName} — AED ${parseFloat(bookingDetails.selections.cab.selectedRate || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
                      />
                    )}
                    {bookingDetails.selections?.activity && (
                      <InfoRow
                        label="Activity"
                        value={`${bookingDetails.selections.activity.activityName} — AED ${parseFloat(bookingDetails.selections.activity.selectedRate || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
                      />
                    )}

                    {/* ── Book Hotel / Book Transfer / Book Activities ── */}
                    {/* Per-service confirmation only (flag off: not rendered): three
                        columns inside this card, each opened below them. */}
                    {serviceFulfilment && (
                      <ServiceFulfilmentSections
                        layout="columns"
                        headerTarget={servicesHeaderEl}
                        bookingId={bookingId}
                        cardStyle={CARD_STYLE}
                        headerStyle={SECTION_HEADER}
                        canSeeSuppliers={canSeeSupplierNames()}
                        refreshKey={`${bookingDetails?.bookingStatus}|${bookingDetails?.isCancelled}`}
                        onChanged={async () => {
                          await fetchDetails();
                          await loadFulfilment();
                        }}
                      />
                    )}
                  </div>
                </div>

                {showSupplierColumn && (
                  <SupplierFulfilmentModal
                    show={showFulfilmentModal}
                    onHide={() => setShowFulfilmentModal(false)}
                    bookingId={bookingId}
                    fulfilment={fulfilment}
                    onDone={async () => {
                      await fetchDetails();
                      await loadFulfilment();
                    }}
                  />
                )}

                {/* ── Pricing ────────────────────────────────────── */}
                <div style={CARD_STYLE}>
                  <div style={SECTION_HEADER}>Pricing</div>
                  <div style={{ padding: "12px 16px" }}>
                    {savedPackageRate(bookingDetails) > 0 && (
                      <>
                        <InfoRow
                          label="Package Rate"
                          value={`AED ${savedPackageRate(bookingDetails).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        />
                        <InfoRow
                          label="Hotel"
                          value={`AED ${savedSupplierHotelRate(bookingDetails).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        />
                      </>
                    )}
                    {/* Meal plan picked on the Hotels tab — only recorded for
                        bookings made since the backend stores it. */}
                    {bookingDetails.selections?.mealPlan?.mealPlanCode && (
                      <InfoRow
                        label="Meal Plan"
                        value={`${bookingDetails.selections.mealPlan.mealPlanName || bookingDetails.selections.mealPlan.mealPlanCode}${
                          bookingDetails.selections.mealPlan.selectedRate != null
                            ? ` — AED ${parseFloat(bookingDetails.selections.mealPlan.selectedRate || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : ""
                        }`}
                      />
                    )}
                    {bookingDetails.tourismDirham != null &&
                      bookingDetails.tourismDirham !== 0 && (
                        <InfoRow
                          label="Tourism Dirham"
                          value={`AED ${parseFloat(bookingDetails.tourismDirham || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
                        />
                      )}
                    <InfoRow
                      label="Total Price"
                      value={`AED ${parseFloat(bookingDetails.totalPrice || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    />
                  </div>
                </div>

                {/* ── Day-wise Itinerary ────────────────────────── */}
                {itineraries.length > 0 && (
                  <div style={CARD_STYLE}>
                    <div style={SECTION_HEADER}>
                      Day-wise Itinerary
                    </div>
                    <div style={{ padding: "10px 16px 12px" }}>
                      <Table
                        bordered
                        size="sm"
                        style={{ fontSize: "0.82rem" }}
                      >
                        <thead style={{ backgroundColor: "#f8f8f8" }}>
                          <tr>
                            <th style={{ width: 60 }}>Day</th>
                            <th>Heading</th>
                            <th>Place</th>
                            <th>Activities</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...itineraries]
                            .sort((a, b) => a.day - b.day)
                            .map((it, idx) => (
                              <tr key={`day-${it.day}-${idx}`}>
                                <td>{it.day}</td>
                                <td>{it.heading || "-"}</td>
                                <td>{it.placeName || "-"}</td>
                                <td style={{ whiteSpace: "pre-line" }}>
                                  {it.dayActivities || "-"}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* ── Inclusions ────────────────────────────────── */}
                <div style={CARD_STYLE}>
                  <div style={SECTION_HEADER}>Inclusions</div>
                  <div
                    style={{
                      padding: "12px 16px",
                      fontSize: "0.82rem",
                      color: "#222",
                    }}
                  >
                    {inclusionLines.length > 0 ? (
                      <ul style={{ marginBottom: 0, paddingLeft: "18px" }}>
                        {inclusionLines.map((l) => (
                          <li key={l.key}>{l.text}</li>
                        ))}
                      </ul>
                    ) : (
                      <span style={{ color: "#888", fontStyle: "italic" }}>
                        No inclusions.
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Exclusions ────────────────────────────────── */}
                <div style={CARD_STYLE}>
                  <div style={SECTION_HEADER}>Exclusions</div>
                  <div
                    style={{
                      padding: "12px 16px",
                      fontSize: "0.82rem",
                      color: "#222",
                    }}
                  >
                    {exclusionLines.length > 0 ? (
                      <ul style={{ marginBottom: 0, paddingLeft: "18px" }}>
                        {exclusionLines.map((l) => (
                          <li key={l.key}>{l.text}</li>
                        ))}
                      </ul>
                    ) : (
                      <span style={{ color: "#888", fontStyle: "italic" }}>
                        No exclusions.
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Cancellation Policy ─────────────────────── */}
                <div style={CARD_STYLE}>
                  <div style={SECTION_HEADER}>Cancellation Policy</div>
                  <div
                    style={{
                      padding: "12px 16px",
                      fontSize: "0.82rem",
                      color: "#222",
                    }}
                  >
                    {cancellationParts.map((p, i) => (
                      <div
                        key={`cancel-${i}`}
                        style={{ marginBottom: i === cancellationParts.length - 1 ? 0 : 6 }}
                      >
                        {p.text}
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Terms & Conditions ─────────────────────── */}
                {termsLines.length > 0 && (
                  <div style={CARD_STYLE}>
                    <div style={SECTION_HEADER}>Terms & Conditions</div>
                    <div
                      style={{
                        padding: "12px 16px",
                        fontSize: "0.82rem",
                        color: "#222",
                      }}
                    >
                      <ul style={{ marginBottom: 0, paddingLeft: "18px" }}>
                        {termsLines.map((l) => (
                          <li key={l.key}>{l.text}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* ── Remarks ────────────────────────────────────
                    Saved value comes from bookingDetails.remarks
                    (set via the Booking Remark modal below). */}
                <div style={CARD_STYLE}>
                  <div style={SECTION_HEADER}>Remarks</div>
                  <div
                    style={{
                      padding: "12px 16px",
                      fontSize: "0.82rem",
                      color: "#222",
                    }}
                  >
                    {bookingDetails.remarks ? (
                      <div style={{ whiteSpace: "pre-line" }}>
                        {bookingDetails.remarks}
                      </div>
                    ) : (
                      <span style={{ color: "#888", fontStyle: "italic" }}>
                        No remarks.
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Notes ──────────────────────────────────────
                    List of ad-hoc notes attached to this booking,
                    fetched from /api/v1/package-booking/booking/{id}/notes.
                    The NOTES button below opens a modal that posts to
                    the same endpoint and refreshes this list. */}
                <div style={CARD_STYLE}>
                  <div style={SECTION_HEADER}>Notes</div>
                  <div
                    style={{
                      padding: "12px 16px",
                      fontSize: "0.82rem",
                      color: "#222",
                    }}
                  >
                    {notesLoading && mergedNotes.length === 0 ? (
                      <span style={{ color: "#888" }}>Loading notes…</span>
                    ) : mergedNotes.length === 0 ? (
                      <span style={{ color: "#888", fontStyle: "italic" }}>
                        No notes yet.
                      </span>
                    ) : (
                      <ul
                        style={{
                          marginBottom: 0,
                          paddingLeft: "18px",
                        }}
                      >
                        {mergedNotes.map((n, idx) => (
                          <li
                            key={n.noteId || idx}
                            style={{ marginBottom: 6 }}
                          >
                            <div style={{ whiteSpace: "pre-line" }}>
                              {n.noteText || n.text || "-"}
                            </div>
                            {(n.createdBy || n.createdAt) && (
                              <div
                                style={{
                                  fontSize: "0.72rem",
                                  color: "#888",
                                  marginTop: 2,
                                }}
                              >
                                {n.createdBy ? `By ${n.createdBy}` : ""}
                                {n.createdBy && n.createdAt ? " · " : ""}
                                {n.createdAt
                                  ? String(n.createdAt).replace("T", " ")
                                  : ""}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {/* Related Sub-Bookings — children created via ADD NEW ITEM.
                    Mirrors the "Related Sub-Bookings" card in
                    BookingDetailedView.jsx (Hotel detail page). The list
                    comes from bookingDetails.subBookings populated server-side
                    via findByParentBookingCodeOrderByChildBookingIndexAsc. */}
                {bookingDetails.subBookings &&
                  bookingDetails.subBookings.length > 0 && (
                    <div style={CARD_STYLE}>
                      <div style={SECTION_HEADER}>
                        Related Sub-Bookings ({bookingDetails.subBookings.length})
                      </div>
                      <div style={{ padding: "10px 16px" }}>
                        {bookingDetails.subBookings.map((sub) => {
                          const subCancelled = sub.isCancelled === true;
                          const subStatusLabel = subCancelled
                            ? "Cancelled"
                            : "Confirmed";
                          const subStatusColor = subCancelled
                            ? "#dc2626"
                            : "#16a34a";
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
                                  {sub.confirmationCode || "-"}
                                  {sub.childBookingIndex != null && (
                                    <span
                                      style={{
                                        marginLeft: "8px",
                                        color: "#888",
                                        fontWeight: "500",
                                        fontSize: "0.8rem",
                                      }}
                                    >
                                      (Amend #{sub.childBookingIndex})
                                    </span>
                                  )}
                                </span>
                                <button
                                  style={{
                                    ...BUTTON_STYLE,
                                    backgroundColor: "#555",
                                  }}
                                  onClick={() =>
                                    navigate(
                                      `/booking-details/package-booking/${sub.bookingId}`
                                    )
                                  }
                                >
                                  View
                                </button>
                              </div>
                              <Row>
                                <Col md={6}>
                                  <InfoRow
                                    label="Package"
                                    value={sub.packageName}
                                  />
                                  <InfoRow
                                    label="Travel Date"
                                    value={formatDate(sub.travelDate)}
                                  />
                                </Col>
                                <Col md={6}>
                                  <InfoRow
                                    label="Contact"
                                    value={sub.contactName}
                                  />
                                  <InfoRow
                                    label="Total Price"
                                    value={
                                      sub.totalPrice != null
                                        ? `AED ${parseFloat(
                                            sub.totalPrice
                                          ).toLocaleString("en-US", {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                          })}`
                                        : "-"
                                    }
                                  />
                                  <InfoRow
                                    label="Status"
                                    value={
                                      <span
                                        style={{
                                          color: subStatusColor,
                                          fontWeight: 700,
                                          fontSize: "0.85rem",
                                        }}
                                      >
                                        {subStatusLabel}
                                      </span>
                                    }
                                  />
                                </Col>
                              </Row>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                {/* Bottom action buttons (left-aligned).
                    Visibility rules mirror the Hotel detail view
                    (BookingDetailedView.jsx):
                      • Live booking (not cancelled) → full toolbar
                        (Add New Item, Cancel, Reconfirm, docs, admin
                        actions, History).
                      • Cancelled booking → only the docs + admin follow-up
                        buttons remain (Voucher, Invoice, Agent Reference,
                        Confirmation No., Resend Mail, Remark, Notes,
                        History). Add New Item / Cancel / Reconfirm are
                        hidden because they don't apply once cancelled.
                    Proforma vs Final labels come from showsFinalDocs so a
                    booking cancelled while still "Confirmed" keeps the
                    Proforma labels the operator saw pre-cancel. */}
                <div
                  className="d-flex gap-2 justify-content-start flex-wrap"
                  style={{ marginTop: "16px", marginBottom: "20px" }}
                >
                  {isCancellable &&
                    (derivedStatus === "Confirmed" ||
                      derivedStatus === "ReConfirmed") && (
                      <button
                        style={BTN_PRIMARY}
                        onClick={openAddItemModal}
                        title="Add a new sub-booking under this booking"
                      >
                        ADD NEW ITEM
                      </button>
                    )}
                  {isCancellable && (
                    <button
                      style={BTN_DANGER}
                      onClick={openCancelModal}
                      title="Cancel booking"
                    >
                      CANCEL
                    </button>
                  )}
                  {/* RECONFIRM — shown only for a held (Confirmed) booking.
                      Flips it to ReConfirmed and settles the agent's deferred
                      credit. A ReConfirmed booking shows no reconfirm button. */}
                  {isCancellable && derivedStatus === "Confirmed" && (
                    <button
                      style={BTN_RECONFIRM}
                      onClick={openReconfirmModal}
                      title="Reconfirm this held booking"
                    >
                      RECONFIRM
                    </button>
                  )}
                  {/* Hide the final "VOUCHER" button once the booking is
                      cancelled — no live voucher is offered post-cancellation.
                      A cancelled-from-Confirmed booking still surfaces the
                      "PROFORMA VOUCHER" variant. */}
                  {!(derivedStatus === "Cancelled" && showsFinalDocs) && (
                    <button
                      style={BTN_TEAL}
                      onClick={openVoucher}
                      title="Voucher"
                    >
                      {showsFinalDocs ? "VOUCHER" : "PROFORMA VOUCHER"}
                    </button>
                  )}
                  <button style={BTN_INFO} onClick={openInvoice} title="Invoice">
                    {showsFinalDocs ? "INVOICE" : "PROFORMA INVOICE"}
                  </button>
                  <button style={BTN_SKY} onClick={openAgentRefModal}>
                    ADD AGENT REFERENCE
                  </button>
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
                      cancelled bookings. */}
                  <button
                    style={BTN_HISTORY}
                    onClick={() => setShowHistoryModal(true)}
                    title="Booking history"
                  >
                    HISTORY
                  </button>
                </div>
              </>
            )}
          </Container>
        </main>
      </div>

      {/* ── Booking History Modal ───────────────────────────────────────
          Read-only timeline built from the loaded detail (no extra API
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
              {bookingDetails?.confirmationCode && (
                <span style={{ opacity: 0.85, fontWeight: 500 }}>
                  {` — ${bookingDetails.confirmationCode}`}
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

      {/* ── Reconfirm Modal ─────────────────────────────────────────────
          Confirms the CONFIRMED → RECONFIRMED transition. Warns that the
          agent's credit will be debited (deferred from the Hold + Pay Later
          choice). */}
      <Modal
        show={showReconfirmModal}
        onHide={() => !isReconfirming && setShowReconfirmModal(false)}
        centered
        backdrop="static"
        keyboard={false}
      >
        <Modal.Header closeButton={!isReconfirming} className="border-0">
          <Modal.Title className="fw-bold d-flex align-items-center">
            <FaCheckCircle className="me-2" style={{ color: "#16a34a" }} />
            <span>Reconfirm Booking</span>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-2">
            Reconfirming moves this booking from{" "}
            <strong>Confirmed</strong> (held) to <strong>ReConfirmed</strong>,
            and the payable total{" "}
            {bookingDetails?.totalPrice != null && (
              <strong>
                AED {Number(bookingDetails.totalPrice).toFixed(2)}
              </strong>
            )}{" "}
            will be debited from the agent's credit balance now.
          </p>
          <p className="mb-0 text-muted small">
            If the agent's available credit is insufficient, the
            reconfirmation will be declined.
          </p>
        </Modal.Body>
        <Modal.Footer className="border-0">
          <Button
            variant="outline-secondary"
            onClick={() => setShowReconfirmModal(false)}
            disabled={isReconfirming}
          >
            Cancel
          </Button>
          <Button
            style={{ backgroundColor: "#16a34a", border: "none" }}
            onClick={confirmReconfirmBooking}
            disabled={isReconfirming}
          >
            {isReconfirming ? "Reconfirming..." : "Reconfirm & Pay"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Add New Item (Amendment) booking-type picker ──────────────
          Mirrors the Hotel detail view's picker: choose any sub-booking
          type, then jump into that flow with ?parentBookingCode set so
          the backend chains the child code under this booking. */}
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
              {bookingDetails?.parentBookingCode ||
                bookingDetails?.confirmationCode}
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
          <Button variant="danger" onClick={submitAddItem}>
            Continue
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Cancellation Modal ──────────────────────────────────────────
          Mirrors the Cancel Booking modal on the hotel detail view
          (BookingDetailedView.jsx) — same header rule, same wording, same
          booking-value warning, same mandatory Cancellation Reason field, and
          the same No / Yes, Cancel footer — so the two flows behave
          identically for the operator.

          One deliberate difference in the maths: package_booking.total_price
          ALREADY includes Tourism Dirham (see bookPackage on the backend),
          whereas the hotel row stores them separately and its modal sums
          them. Adding tourismDirham here too would overstate the figure, so
          the warning shows totalPrice as-is — the same number the Pricing
          section on this page renders. */}
      <Modal
        show={showCancelModal}
        onHide={() => {
          if (!isCancelling) {
            setShowCancelModal(false);
            setCancellationReason("");
          }
        }}
        centered
        backdrop="static"
        keyboard={false}
      >
        <Modal.Header
          closeButton={!isCancelling}
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
                {bookingDetails?.confirmationCode ||
                  rowStub?.confirmationCode ||
                  "N/A"}
              </div>
              {(bookingDetails?.packageName || rowStub?.packageName) && (
                <div>
                  <strong>Package:</strong>{" "}
                  {bookingDetails?.packageName || rowStub?.packageName}
                </div>
              )}
            </div>
            {/* Informational only — booking value warning. Reuses the SAME
                total shown in the Pricing section of this page. Does not
                alter any cancellation logic. */}
            {bookingDetails?.totalPrice != null && (
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
                  AED {Number(bookingDetails.totalPrice).toFixed(2)}
                </strong>
                .
                <div className="fw-semibold mt-1">
                  Do you still want to cancel it?
                </div>
              </div>
            )}
            <Form.Group
              controlId="packageCancellationReason"
              className="text-start"
            >
              <Form.Label className="fw-semibold">
                Cancellation Reason <span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                placeholder="Add a reason for cancellation"
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                disabled={isCancelling}
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
            disabled={isCancelling}
          >
            No
          </Button>
          <Button
            variant="danger"
            onClick={confirmCancelBooking}
            disabled={isCancelling || !cancellationReason.trim()}
          >
            {isCancelling ? (
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

      {/* ── Agent Reference Modal ──────────────────────────────────── */}
      <Modal
        show={showAgentRefModal}
        onHide={() => {
          if (!savingAgentRef) {
            setShowAgentRefModal(false);
            setAgentRefError("");
          }
        }}
        centered
        backdrop="static"
        keyboard={false}
        size="md"
      >
        <Modal.Header
          closeButton={!savingAgentRef}
          style={{
            backgroundColor: "#fff",
            borderBottom: "2px solid #e9ecef",
          }}
        >
          <Modal.Title className="fw-bold d-flex align-items-center">
            <FaExclamationCircle className="me-2 text-warning" />
            <span>Add Agent Reference</span>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ padding: "1.5rem" }}>
          <div className="text-muted small mb-3">
            <div>
              <strong>Booking Code:</strong>{" "}
              {bookingDetails?.confirmationCode || "N/A"}
            </div>
            {bookingDetails?.packageName && (
              <div>
                <strong>Package:</strong> {bookingDetails.packageName}
              </div>
            )}
          </div>
          <Form.Group controlId="agentRefInput">
            <Form.Label className="fw-semibold mb-1">
              Agent Reference <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              type="text"
              placeholder="Enter Agent Reference"
              value={agentRefInput}
              onChange={(e) => {
                setAgentRefInput(e.target.value);
                if (agentRefError && e.target.value.trim()) {
                  setAgentRefError("");
                }
              }}
              isInvalid={!!agentRefError}
              disabled={savingAgentRef}
            />
            <Form.Control.Feedback type="invalid">
              {agentRefError}
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
              setShowAgentRefModal(false);
              setAgentRefError("");
            }}
            disabled={savingAgentRef}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={saveAgentReference}
            disabled={savingAgentRef}
          >
            {savingAgentRef ? (
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

      {/* ── Confirmation Number Modal ──────────────────────────────── */}
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
          <Modal.Title className="fw-bold">Confirmation Number</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ padding: "1.5rem" }}>
          <div className="text-muted small mb-3">
            <div>
              <strong>Booking Code:</strong>{" "}
              {bookingDetails?.confirmationCode || "N/A"}
            </div>
            {bookingDetails?.packageName && (
              <div>
                <strong>Package:</strong> {bookingDetails.packageName}
              </div>
            )}
          </div>
          <Form.Group controlId="confirmationNoInput">
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

      {/* ── Booking Remark Modal ───────────────────────────────────── */}
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
          <Form.Group controlId="packageRemarkInput">
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

      {/* ── Notes Modal ────────────────────────────────────────────── */}
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
          style={{
            backgroundColor: "#fff",
            borderBottom: "2px solid #e9ecef",
          }}
        >
          <Modal.Title className="fw-bold">Add Note</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ padding: "1.5rem" }}>
          {mergedNotes.length > 0 && (
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
                Existing notes ({mergedNotes.length})
              </div>
              <ul className="mb-0 ps-3">
                {mergedNotes.map((n, idx) => (
                  <li
                    key={n.noteId || idx}
                    style={{ marginBottom: 4 }}
                  >
                    {n.noteText || n.text || "-"}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Form.Group controlId="packageNoteInput">
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
          <Button
            variant="primary"
            onClick={saveNote}
            disabled={savingNote}
          >
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

      {/* ── Voucher Modal — iframe + email-send form ────────────────── */}
      <Modal
        show={showVoucherModal}
        onHide={closeVoucher}
        centered
        size="xl"
        backdrop="static"
        keyboard={!isSendingVoucher}
      >
        <Modal.Header
          closeButton={!isSendingVoucher}
          className="bg-dark text-white border-0"
        >
          <Modal.Title className="d-flex align-items-center gap-2">
            <FaFileAlt className="text-success" />
            <span className="fw-bold">Booking Voucher</span>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {bookingDetails && (
            <div className="mb-3 d-flex justify-content-between align-items-start flex-wrap gap-2">
              <div className="text-muted small">
                <div className="fw-bold text-dark">
                  {bookingDetails.confirmationCode}
                </div>
                <div>
                  {bookingDetails.packageName || rowStub?.packageName}
                </div>
              </div>
              <Button
                variant="outline-primary"
                size="sm"
                onClick={handleDownloadVoucher}
                disabled={isLoadingVoucherPdf}
              >
                <FaDownload className="me-2" /> Download PDF
              </Button>
            </div>
          )}

          <div
            className="border rounded mb-3"
            style={{ background: "#f8fafc", minHeight: "520px" }}
          >
            {isLoadingVoucherPdf && (
              <div className="text-center text-muted py-5">
                <Spinner animation="border" size="sm" className="me-2" />
                Loading voucher PDF...
              </div>
            )}
            {!isLoadingVoucherPdf && voucherPdfUrl && (
              <iframe
                src={voucherPdfUrl}
                title="Accommodation Voucher"
                style={{ width: "100%", height: "520px", border: "none" }}
              />
            )}
            {!isLoadingVoucherPdf && !voucherPdfUrl && (
              <div className="text-center text-muted py-5">
                Voucher preview unavailable. Try Download or Send Email below.
              </div>
            )}
          </div>

          <Form.Group className="mb-2">
            <Form.Label className="fw-semibold">
              Send voucher by email
            </Form.Label>
            <InputGroup>
              <InputGroup.Text>
                <FaEnvelope />
              </InputGroup.Text>
              <Form.Control
                type="email"
                placeholder="recipient@example.com"
                value={voucherEmail}
                onChange={(e) => setVoucherEmail(e.target.value)}
                disabled={isSendingVoucher}
              />
            </InputGroup>
            <Form.Text className="text-muted">
              The voucher PDF will be attached to the email.
            </Form.Text>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer className="border-0">
          <Button
            variant="secondary"
            onClick={closeVoucher}
            disabled={isSendingVoucher}
          >
            Close
          </Button>
          <Button
            variant="success"
            onClick={handleSendVoucherEmail}
            disabled={isSendingVoucher || !voucherEmail.trim()}
          >
            {isSendingVoucher ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Sending...
              </>
            ) : (
              <>
                <FaEnvelope className="me-2" /> Send Email
              </>
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Invoice Modal — iframe preview + download ───────────────── */}
      <Modal
        show={showInvoiceModal}
        onHide={closeInvoice}
        centered
        size="xl"
        backdrop="static"
      >
        <Modal.Header closeButton className="bg-dark text-white border-0">
          <Modal.Title className="d-flex align-items-center gap-2">
            <FaFileAlt className="text-success" />
            <span className="fw-bold">Tax Invoice</span>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {bookingDetails && (
            <div className="mb-3 d-flex justify-content-between align-items-start flex-wrap gap-2">
              <div className="text-muted small">
                <div className="fw-bold text-dark">
                  {bookingDetails.confirmationCode}
                </div>
                <div>
                  {bookingDetails.packageName || rowStub?.packageName}
                </div>
              </div>
              <Button
                variant="outline-primary"
                size="sm"
                onClick={handleDownloadInvoice}
                disabled={isLoadingInvoicePdf}
              >
                <FaDownload className="me-2" /> Download PDF
              </Button>
            </div>
          )}

          <div
            className="border rounded mb-3"
            style={{ background: "#f8fafc", minHeight: "520px" }}
          >
            {isLoadingInvoicePdf && (
              <div className="text-center text-muted py-5">
                <Spinner animation="border" size="sm" className="me-2" />
                Loading invoice PDF...
              </div>
            )}
            {!isLoadingInvoicePdf && invoicePdfUrl && (
              <iframe
                src={invoicePdfUrl}
                title="Tax Invoice"
                style={{ width: "100%", height: "520px", border: "none" }}
              />
            )}
            {!isLoadingInvoicePdf && !invoicePdfUrl && (
              <div className="text-center text-muted py-5">
                Invoice preview unavailable. Try Download below.
              </div>
            )}
          </div>
        </Modal.Body>
        <Modal.Footer className="border-0">
          <Button variant="secondary" onClick={closeInvoice}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Resend Mail to Agent — preview + send ────────────────────────
          Opens on the RESEND MAIL TO AGENT button click. Shows the Voucher
          PDF the mail will attach inside an <iframe>, and an editable
          email field pre-populated with the agent's on-file address, so
          the operator sees which file goes out and who receives it before
          confirming. The Send button POSTs
          /api/v1/package-booking/booking/:id/resend-mail?email=…
          and toasts success/failure. Applies to Confirmed, ReConfirmed,
          and Cancelled bookings alike — same button, same modal. */}
      <Modal
        show={showResendMailModal}
        onHide={() =>
          resendingMail ? null : setShowResendMailModal(false)
        }
        size="xl"
        centered
        backdrop="static"
        keyboard={!resendingMail}
      >
        <Modal.Header closeButton={!resendingMail}>
          <Modal.Title style={{ fontSize: "1rem", fontWeight: 700 }}>
            Resend {showsFinalDocs ? "Voucher" : "Proforma Voucher"} to
            Agent
            {bookingDetails?.confirmationCode
              ? ` — ${bookingDetails.confirmationCode}`
              : ""}
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
              Voucher preview unavailable. You can still send the mail —
              the backend will regenerate the attachment on dispatch.
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

      {/* ─── Reconfirm: Booking Cannot Be Completed (no viable payment path) ───
          Shown when the agent has no available credit AND Card payment is
          disabled on their profile — mirrors the same-titled popup on
          HotelBookingPage / PaxInformation. */}
      <Modal
        show={showReconfirmNoPaymentPathModal}
        onHide={() => setShowReconfirmNoPaymentPathModal(false)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Booking Cannot Be Completed</Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center py-4">
          <p className="mb-2 text-dark">
            Sorry — this reconfirm can't be completed because the agent has
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
              AED{" "}
              {Number(reconfirmInsufficientAmount || 0).toLocaleString(
                "en-US",
                { minimumFractionDigits: 2, maximumFractionDigits: 2 },
              )}
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer className="justify-content-center border-0">
          <Button
            variant="secondary"
            onClick={() => setShowReconfirmNoPaymentPathModal(false)}
          >
            OK
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ─── Reconfirm: Online Payment Required ───
          Bridge between the credit-check failure and the gateway picker.
          Green Pay opens the "Select Payment Gateway" modal below. */}
      <Modal
        show={showReconfirmInsufficientModal}
        onHide={() => setShowReconfirmInsufficientModal(false)}
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
              AED{" "}
              {Number(reconfirmInsufficientAmount || 0).toLocaleString(
                "en-US",
                { minimumFractionDigits: 2, maximumFractionDigits: 2 },
              )}
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer className="justify-content-center border-0">
          <Button
            variant="danger"
            onClick={() => setShowReconfirmInsufficientModal(false)}
          >
            Cancel
          </Button>
          <Button
            variant="success"
            onClick={() => {
              setShowReconfirmInsufficientModal(false);
              setReconfirmSelectedGateway("");
              setShowReconfirmGatewayModal(true);
            }}
          >
            Pay
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ─── Reconfirm: Select Payment Gateway ───
          Same pg-option card-style radios as the create flows (styles come
          from the top-of-file HotelBookingPage.css import). On Proceed, CC
          Avenue navigates to /payment/ccavenue-redirect with
          flowType=PACKAGE_RECONFIRM + existingBookingId. Browser leaves for
          CC Avenue's hosted billing page and returns to this same detail
          URL with ?ccavenueOrderId=&ccavenueStatus= — picked up by the
          resume useEffect above. */}
      <Modal
        show={showReconfirmGatewayModal}
        onHide={() => setShowReconfirmGatewayModal(false)}
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
              const isSelected = reconfirmSelectedGateway === g.id;
              return (
                <label
                  key={g.id}
                  htmlFor={`pkg-reconfirm-gw-${g.id}`}
                  className={`pg-option${
                    isSelected ? " pg-option-selected" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="pkg-reconfirm-payment-gateway"
                    id={`pkg-reconfirm-gw-${g.id}`}
                    className="pg-option-input"
                    checked={isSelected}
                    onChange={() => setReconfirmSelectedGateway(g.id)}
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
            onClick={() => setShowReconfirmGatewayModal(false)}
          >
            Cancel
          </Button>
          <Button
            variant="success"
            disabled={!reconfirmSelectedGateway || !bookingId}
            onClick={() => {
              setShowReconfirmGatewayModal(false);
              if (reconfirmSelectedGateway === "ccavenue") {
                const leadName = (() => {
                  const t =
                    bookingDetails?.travellers &&
                    bookingDetails.travellers[0];
                  if (t) {
                    return [t.title, t.firstName, t.middleName, t.lastName]
                      .filter(Boolean)
                      .join(" ")
                      .trim();
                  }
                  return bookingDetails?.contactInfo?.name || "";
                })();
                navigate("/payment/ccavenue-redirect", {
                  state: {
                    flowType: "PACKAGE_RECONFIRM",
                    reconfirmBookingId: bookingId,
                    // CCAvenueCheckoutPage forwards flowType +
                    // existingBookingId to /initiate — the backend
                    // dispatcher (initiatePackageReconfirm) computes the
                    // authoritative amount from the stored
                    // booking.totalPrice, so no bookingPayload is needed.
                    billingName: leadName,
                    amountLabel: `AED ${Number(
                      reconfirmInsufficientAmount || 0,
                    ).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`,
                    returnTo: location.pathname,
                  },
                });
              }
            }}
          >
            Proceed to Pay
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Post-payment finalize overlay — shown while
          /api/payment/ccavenue/finalize-package-reconfirm/{orderId} is
          running. Same look as the other CC Avenue finalize overlays so
          operators see a consistent "do not close this window" popup
          across booking flows. */}
      {isFinalizingReconfirmPayment && (
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
              Payment successful — reconfirming your booking
            </h5>
            <p className="text-muted mb-3" style={{ fontSize: 14 }}>
              Please{" "}
              <strong>
                do not close this window, refresh the page, or press the
                back button
              </strong>{" "}
              until you see the confirmation.
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
