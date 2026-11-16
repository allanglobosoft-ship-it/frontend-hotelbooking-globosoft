/**
 * ActivityBookingDetailView.jsx
 *
 * Detail view for /booking-details/activity-booking/:id.
 *
 * Data source: fetches the full nested booking shape from the new
 *   GET /api/tour-activity-booking/{id}
 * endpoint (the one TourAndActivityBookingController serves). When
 * that returns 404 (e.g. the URL points at a legacy
 * make-your-own-package booking), we fall back to the snapshot the
 * list page may have passed via location.state.booking so the old
 * rows continue to render.
 *
 * Voucher: a printer/file icon next to the page title hits
 *   GET /api/tour-activity-booking/{id}/voucher
 * which generates a PDF on the server and returns its public URL;
 * we then open a modal with that URL embedded in an iframe.
 */

import React, { useEffect, useState } from "react";
import {
  Container,
  Card,
  Table,
  Badge,
  Spinner,
  Modal,
  Button,
  Alert,
  Form,
} from "react-bootstrap";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import {
  FaTicketAlt,
  FaTrash,
  FaCalendarAlt,
  FaUserAlt,
  FaMapMarkerAlt,
  FaPhoneAlt,
  FaEnvelope,
  FaIdCard,
  FaFilePdf,
  FaCreditCard,
  FaCheckCircle,
} from "react-icons/fa";
import { toast } from "react-hot-toast";
import axiosInstance from "../../components/AxiosInstance";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";

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

// Purpose-based colour variants — same palette + assignments as
// BookingDetailedView.jsx so this Activity detail page reads as part of the
// same design system as /booking-details/hotel-booking/{id}. Base BUTTON_STYLE
// (size / padding / radius / weight / white text) is preserved; only the
// background colour changes.
//   success → Confirm / Reconfirm      danger    → Cancel
//   primary → Add / Edit / Update      info      → Voucher / Invoice docs
//   neutral → View / Back / Notes      accent    → Notes / Remarks
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

const formatPrice = (price) =>
  new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
  }).format(price || 0);

const formatDate = (date) => {
  if (!date) return "-";
  try {
    return new Date(date).toLocaleDateString();
  } catch {
    return date;
  }
};

const formatDateTime = (date) => {
  if (!date) return "-";
  try {
    return new Date(date).toLocaleString();
  } catch {
    return date;
  }
};

const PAYMENT_LABELS = {
  CREDIT: "Credit Limit",
  ONLINE: "Online Payment",
  CASH: "Cash",
};

export default function ActivityBookingDetailView() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();

  // Status flag still drives the Cancel button visibility — carried
  // over from the list page like before.
  const status = location.state?.status || "upcoming";

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // ── Action-button modal / handler state (ported from
  //    BookingDetailedView, adapted for the activity endpoints). ──
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");

  // Update Book Status (PATCH confirmation-status with Agent LPO).
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

  // Resend mail
  const [resendingMail, setResendingMail] = useState(false);

  // Notes — stored separately from the Booking Remark.
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [notesInput, setNotesInput] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // Resend-mail confirmation modal (shows the agent + recipient email
  // before actually dispatching).
  const [showResendModal, setShowResendModal] = useState(false);

  // Generic PDF preview — used by VOUCHER and INVOICE.
  // pdfPreview shape: { url, label, type } | null.
  const [pdfPreview, setPdfPreview] = useState(null);
  const [generatingPdfType, setGeneratingPdfType] = useState(null);

  // Fetch the booking from the new endpoint. Fall back to the
  // location.state snapshot if the GET fails — keeps legacy rows
  // (which live in CustomBookPackageActivity, not the new tables)
  // viewable until the list page migrates over.
  useEffect(() => {
    if (!id) {
      setLoadError("Missing booking id in URL");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    axiosInstance
      .get(`/api/tour-activity-booking/${id}`)
      .then((res) => {
        if (cancelled) return;
        setBooking(res.data || null);
      })
      .catch((err) => {
        if (cancelled) return;
        // Fallback for legacy rows that aren't in the new tables.
        const fallback = location.state?.booking;
        if (fallback) {
          setBooking({ __legacy: true, ...fallback });
        } else {
          setLoadError(
            err.response?.data?.message ||
              "Booking not found in the new tour-and-activity tables.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, location.state]);

  // Refresh helper — many handlers need to pull the latest booking
  // shape after a mutation succeeds so the UI reflects the change.
  const refetchBooking = async () => {
    if (!id) return;
    try {
      const res = await axiosInstance.get(`/api/tour-activity-booking/${id}`);
      setBooking(res.data || null);
    } catch (err) {
      console.error("Failed to refetch booking:", err);
    }
  };

  // ── Cancel ──────────────────────────────────────────────────────
  const openCancelModal = () => {
    setCancellationReason("");
    setShowCancelModal(true);
  };

  const handleCancelBooking = async () => {
    if (!booking) return;
    try {
      setCancelling(true);
      const params = cancellationReason.trim()
        ? { reason: cancellationReason.trim() }
        : undefined;
      const response = await axiosInstance.delete(
        `/api/tour-activity-booking/${id}/cancel`,
        { params },
      );
      if (
        response.data?.success &&
        String(response.data?.confirmationStatus || "").toLowerCase() ===
          "cancelled"
      ) {
        toast.success(response.data?.message || "Booking cancelled");
        setShowCancelModal(false);
        setCancellationReason("");
        await refetchBooking();
      } else {
        toast.error(response.data?.message || "Failed to cancel booking");
      }
    } catch (err) {
      toast.error(
        err.response?.data?.message || "Error cancelling booking",
      );
    } finally {
      setCancelling(false);
    }
  };

  // ── Update Book Status (LPO + confirmStatus) ────────────────────
  const openConfirmStatusModal = () => {
    setConfirmAgentLpo(booking?.agentLpo || "");
    setConfirmAgentLpoError("");
    setShowConfirmStatusModal(true);
  };

  const updateConfirmationStatus = async () => {
    const lpoTrimmed = (confirmAgentLpo || "").trim();
    if (!lpoTrimmed) {
      setConfirmAgentLpoError("Agent LPO is required");
      return;
    }
    setConfirmAgentLpoError("");
    try {
      setUpdatingConfirmationStatus(true);
      const response = await axiosInstance.patch(
        `/api/tour-activity-booking/${id}/confirmation-status`,
        { confirmStatus: true, agentLpo: lpoTrimmed },
      );
      if (response.data?.success) {
        setShowConfirmStatusModal(false);
        toast.success(
          response.data?.message || "Confirmation status updated",
        );
        await refetchBooking();
      } else {
        toast.error(
          response.data?.message ||
            "Failed to update confirmation status",
        );
      }
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
          "Failed to update confirmation status",
      );
    } finally {
      setUpdatingConfirmationStatus(false);
    }
  };

  // ── Confirmation Number ─────────────────────────────────────────
  const openConfirmationNoModal = () => {
    setConfirmationNoInput(booking?.confirmationNumber || "");
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
      const response = await axiosInstance.patch(
        `/api/tour-activity-booking/${id}/confirmation-status`,
        { confirmationNumber: value },
      );
      if (response.data?.success) {
        setShowConfirmationNoModal(false);
        toast.success(
          response.data?.message || "Confirmation number saved",
        );
        await refetchBooking();
      } else {
        toast.error(
          response.data?.message || "Failed to save confirmation number",
        );
      }
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
          "Failed to save confirmation number",
      );
    } finally {
      setSavingConfirmationNo(false);
    }
  };

  // ── Booking Remark ──────────────────────────────────────────────
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
      const createdBy =
        sessionStorage.getItem("UserName") ||
        "user";
      const response = await axiosInstance.post(
        `/api/tour-activity-booking/${id}/notes`,
        { noteText: text, createdBy },
      );
      if (response.data?.success !== false) {
        setShowRemarkModal(false);
        toast.success(response.data?.message || "Remark saved");
        await refetchBooking();
      } else {
        toast.error(response.data?.message || "Failed to save remark");
      }
    } catch (err) {
      toast.error(
        err.response?.data?.message || "Failed to save remark",
      );
    } finally {
      setSavingRemark(false);
    }
  };

  // ── Notes (separate from Booking Remark) ────────────────────────
  const openNotesModal = () => {
    setNotesInput(booking?.notes || "");
    setShowNotesModal(true);
  };

  const saveNotes = async () => {
    const text = (notesInput || "").trim();
    if (!text) {
      toast.error("Note cannot be empty");
      return;
    }
    try {
      setSavingNotes(true);
      const response = await axiosInstance.post(
        `/api/tour-activity-booking/${id}/booking-note`,
        { noteText: text },
      );
      if (response.data?.success !== false) {
        setShowNotesModal(false);
        toast.success(response.data?.message || "Note saved");
        await refetchBooking();
      } else {
        toast.error(response.data?.message || "Failed to save note");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save note");
    } finally {
      setSavingNotes(false);
    }
  };

  // ── Resend Mail to Agent ────────────────────────────────────────
  // Triggered from the confirmation modal's OK button. Closes the
  // modal on a successful dispatch.
  const resendMailToAgent = async () => {
    try {
      setResendingMail(true);
      const response = await axiosInstance.post(
        `/api/tour-activity-booking/${id}/resend-mail`,
      );
      if (response.data?.success !== false) {
        setShowResendModal(false);
        toast.success(
          response.data?.message || "Mail resent to agent",
        );
      } else {
        toast.error(response.data?.message || "Failed to resend mail");
      }
    } catch (err) {
      toast.error(
        err.response?.data?.message || "Failed to resend mail",
      );
    } finally {
      setResendingMail(false);
    }
  };

  // ── Generic PDF preview (Voucher / Invoice) ─────────────────────
  // Shared shape with BookingDetailedView so the modal markup at the
  // bottom of this page can be a near copy. type matches the backend
  // enum on /api/tour-activity-booking/{id}/pdf?type=...
  const handleDownloadPdf = async (type, label) => {
    try {
      setGeneratingPdfType(type);
      const response = await axiosInstance.get(
        `/api/activity_booking/${id}/pdf`,
        { params: { type: type.toUpperCase() } },
      );
      if (
        response.data?.status === "SUCCESS" &&
        response.data?.pdfUrl
      ) {
        setPdfPreview({
          url: response.data.pdfUrl,
          label: label || type,
          type: type.toUpperCase(),
        });
      } else {
        toast.error(
          response.data?.message ||
            `Failed to generate ${label || type}`,
        );
      }
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
          `Error generating ${label || type}`,
      );
    } finally {
      setGeneratingPdfType(null);
    }
  };

  // Loading / error short-circuits
  if (loading) {
    return (
      <PageShell>
        <div className="text-center py-5">
          <Spinner animation="border" variant="primary" />
          <p className="mt-3 text-muted">Loading booking…</p>
        </div>
      </PageShell>
    );
  }
  if (loadError || !booking) {
    return (
      <PageShell>
        <Alert variant="warning" className="text-center">
          {loadError || "Booking not found."}
          <div className="mt-3">
            <button
              style={BTN_NEUTRAL}
              onClick={() => navigate("/booking-details/activity-booking-list")}
            >
              ← Back to list
            </button>
          </div>
        </Alert>
      </PageShell>
    );
  }

  // ── Normalise field access so the page renders for both the new
  // shape AND legacy snapshot rows without branching everywhere. ──
  const isLegacy = booking.__legacy === true;
  const code = booking.bookingCode || booking.packageBookCode || "—";
  const createdAt = booking.createdAt || booking.bookingDate || null;
  const customer = booking.customer || {
    salutation: booking.salutation,
    firstName: booking.firstName,
    lastName: booking.lastName,
    contactNumber: booking.contactNumber,
    emailId: booking.emailId,
    passportNumber: booking.passportNumber,
    lpo: booking.agentLpo,
  };
  const guests = Array.isArray(booking.guests) ? booking.guests : [];
  const childAges = Array.isArray(booking.childAges)
    ? booking.childAges
    : Array.isArray(booking.childAgeArray)
    ? booking.childAgeArray
    : [];

  // Single source of truth for "is this row in a finished /
  // un-actionable state". Hides the whole bottom button row when
  // true — same pattern as BookingDetailedView.
  const isCancelled =
    String(booking.status || "").toUpperCase() === "CANCELLED" ||
    booking.cancelStatus === true;

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4" style={{ overflow: "auto" }}>
          <Container fluid style={{ maxWidth: "1100px" }}>
            {/* Header — Back, title, voucher icon */}
            <div className="mb-3 d-flex align-items-center flex-wrap gap-2">
              <button
                style={BTN_NEUTRAL}
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
                <FaTicketAlt className="me-2 text-primary" />
                Booking Details
                <Badge bg="primary-subtle" text="primary" className="ms-3">
                  {code}
                </Badge>
              </span>

           
            </div>

            {/* ── Booking Details ──────────────────────────────────
                Single consolidated card: booking meta + activity +
                pax counts all live here now (the previously separate
                Activity and Pax Counts cards were folded in). */}
            <Card className="mb-3">
              <Card.Header
                className="fw-semibold d-flex align-items-center"
                style={{ backgroundColor: "#f1f3f5" }}
              >
                {/* <FaTicketAlt className="me-2 text-primary" /> */}
                Booking Details
              </Card.Header>
              <Card.Body>
                <Table size="sm" borderless className="mb-0 align-middle">
                  <tbody>
                    <tr>
                      <td className="text-muted small" style={{ width: 110 }}>
                        Code
                      </td>
                      <td className="fw-semibold">{code}</td>
                      <td className="text-muted small" style={{ width: 100 }}>
                        Booked On
                      </td>
                      <td className="fw-semibold">{formatDateTime(createdAt)}</td>
                      <td className="text-muted small" style={{ width: 70 }}>
                        Status
                      </td>
                      <td>
                        <Badge
                          bg={
                            booking.status === "CANCELLED" || booking.cancelStatus
                              ? "danger-subtle"
                              : "success-subtle"
                          }
                          text={
                            booking.status === "CANCELLED" || booking.cancelStatus
                              ? "danger"
                              : "success"
                          }
                        >
                          {booking.status ||
                            (booking.cancelStatus ? "Cancelled" : "Confirmed")}
                        </Badge>
                      </td>
                    </tr>
                    <tr>
                      <td className="text-muted small">Agent</td>
                      <td className="fw-semibold">
                        {/* Prefer the resolved agentName from the
                            enriched endpoint; fall back to the raw
                            agentId for legacy snapshot rows that
                            don't carry a name. */}
                        {booking.agentName ||
                          (booking.agentId ? `ID: ${booking.agentId}` : "—")}
                      </td>
                      <td className="text-muted small">User ID</td>
                      <td className="fw-semibold">{booking.userId || "—"}</td>
                      <td className="text-muted small">
                        {/* <FaCreditCard className="me-1" /> */}
                        Pay Mode
                      </td>
                      <td className="fw-semibold">
                        {PAYMENT_LABELS[booking.paymentMode] ||
                          booking.paymentMode ||
                          "—"}
                      </td>
                    </tr>
                    {/* Activity ID + Tour Date + Pax — folded in from the
                        old separate cards. */}
                    <tr>
                      <td className="text-muted small">
                        {/* <FaTicketAlt className="me-1" /> */}
                        Activity ID
                      </td>
                      <td className="fw-semibold">
                        {booking.activityId || booking.activityName || "—"}
                      </td>
                      <td className="text-muted small">
                        {/* <FaCalendarAlt className="me-1" /> */}
                        Tour Date
                      </td>
                      <td className="fw-semibold">
                        {formatDate(booking.tourDate)}
                      </td>
                      <td className="text-muted small">
                        {/* <FaUserAlt className="me-1" /> */}
                        Pax
                      </td>
                      <td className="fw-semibold">
                        {booking.noOfAdult ?? 0} ADT / {booking.noOfChild ?? 0} CHD
                        {childAges.length > 0
                          ? ` (Ages: ${childAges.join(", ")})`
                          : ""}
                      </td>
                    </tr>
                    {(booking.reportingPoint ||
                      booking.cityName ||
                      booking.destination) && (
                      <tr>
                        <td className="text-muted small">Reporting</td>
                        <td className="fw-semibold">
                          {booking.reportingPoint || "—"}
                        </td>
                        <td className="text-muted small">
                          {/* <FaMapMarkerAlt className="me-1" /> */}
                          City
                        </td>
                        <td className="fw-semibold" colSpan={3}>
                          {booking.cityName || booking.destination || "—"}
                        </td>
                      </tr>
                    )}
                    {/* Agent Ref + Confirmation No — surfaced here once
                        added via the ADD AGENT REF / CONFIRMATION NO.
                        buttons (row hidden until at least one is set). */}
                    {(booking.agentLpo || booking.confirmationNumber) && (
                      <tr>
                        <td className="text-muted small">
                          {/* <FaIdCard className="me-1" /> */}
                          Agent Ref
                        </td>
                        <td className="fw-semibold">
                          {booking.agentLpo || "—"}
                        </td>
                        <td className="text-muted small">
                          {/* <FaCheckCircle className="me-1" /> */}
                          Confirmation No
                        </td>
                        <td className="fw-semibold" colSpan={3}>
                          {booking.confirmationNumber || "—"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </Table>
              </Card.Body>
            </Card>

            {/* Guests table — only when we have per-guest rows
                (new bookings always do; legacy snapshots may not). */}
            {guests.length > 0 && (
              <Card className="mb-3">
                <Card.Header
                  className="fw-semibold d-flex align-items-center"
                  style={{ backgroundColor: "#f1f3f5" }}
                >
                  {/* <FaUserAlt className="me-2 text-primary" /> */}
                  Passengers
                </Card.Header>
                <Card.Body className="p-0">
                  <Table size="sm" hover className="mb-0 align-middle">
                    <thead style={{ backgroundColor: "#f8f9fa" }}>
                      <tr>
                        <th style={{ width: 50 }} className="text-center">#</th>
                        <th>Title</th>
                        <th>Name</th>
                        {/* <th>Gender</th> */}
                        <th>Type</th>
                        {/* <th>Passport</th> */}
                        <th className="text-center">Lead</th>
                      </tr>
                    </thead>
                    <tbody>
                      {guests.map((g, idx) => (
                        <tr key={g.id ?? idx}>
                          <td className="text-center">
                            {g.guestIndex ?? idx + 1}
                          </td>
                          <td>{g.salutation || "—"}</td>
                          <td>
                            {[g.firstName, g.middleName, g.lastName]
                              .filter(Boolean)
                              .join(" ") || "—"}
                          </td>
                          {/* <td>{g.gender || "—"}</td> */}
                          <td>
                            {g.isChild
                              ? `Child${g.age != null ? ` (${g.age})` : ""}`
                              : "Adult"}
                          </td>
                          {/* <td>{g.passportNo || "—"}</td> */}
                          <td className="text-center">
                            {g.isLead ? (
                              <FaCheckCircle className="text-success" />
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Card.Body>
              </Card>
            )}

               {/* Pricing */}
            <Card className="mb-3">
              <Card.Header
                className="fw-semibold"
                style={{ backgroundColor: "#f1f3f5" }}
              >
                Pricing
              </Card.Header>
              <Card.Body>
                <div className="p-2 px-3 bg-light rounded">
                  {booking.sellingPrice != null && (
                    <div className="d-flex justify-content-between text-muted small">
                      <span>Selling Price</span>
                      <span className="fw-medium">
                        {formatPrice(booking.sellingPrice)}
                      </span>
                    </div>
                  )}
                  <div className="d-flex justify-content-between align-items-center border-top pt-1 mt-1">
                    <span className="fw-semibold">Total Amount</span>
                    <span className="fs-6 fw-bold text-success">
                      {formatPrice(booking.totalPrice)}
                    </span>
                  </div>
                </div>
              </Card.Body>
            </Card>

            {/* Customer contact (snapshot) */}
            {/* <Card className="mb-3">
              <Card.Header
                className="fw-semibold"
                style={{ backgroundColor: "#f1f3f5" }}
              >
                Customer
              </Card.Header>
              <Card.Body>
                <Table size="sm" borderless className="mb-0">
                  <tbody>
                    <tr>
                      <td className="text-muted small" style={{ width: 80 }}>
                        Name
                      </td>
                      <td className="fw-semibold">
                        {[customer.salutation, customer.firstName, customer.lastName]
                          .filter(Boolean)
                          .join(" ") || "—"}
                      </td>
                      <td className="text-muted small" style={{ width: 70 }}>
                        <FaPhoneAlt className="me-1" />
                        Phone
                      </td>
                      <td className="fw-semibold">
                        {customer.contactNumber || "—"}
                      </td>
                    </tr>
                    <tr>
                      <td className="text-muted small">
                        <FaEnvelope className="me-1" />
                        Email
                      </td>
                      <td className="fw-semibold">{customer.emailId || "—"}</td>
                      <td className="text-muted small">
                        <FaIdCard className="me-1" />
                        Passport
                      </td>
                      <td className="fw-semibold">
                        {customer.passportNumber || "—"}
                      </td>
                    </tr>
                    {customer.lpo && (
                      <tr>
                        <td className="text-muted small">LPO</td>
                        <td className="fw-semibold" colSpan={3}>
                          {customer.lpo}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </Table>
              </Card.Body>
            </Card> */}

            {/* Itineraries — backend now overlays each row with the
                master heading via MasterItenaryDetails, so we render
                the heading prominently and keep the id as a small
                muted tag. Falls back to itineraryIds[] when the
                enriched array isn't present (legacy snapshot rows). */}
            {(() => {
              const list =
                Array.isArray(booking.itineraries) &&
                booking.itineraries.length > 0
                  ? booking.itineraries
                  : Array.isArray(booking.itineraryIds)
                  ? booking.itineraryIds.map((iid) => ({
                      itineraryId: iid,
                      heading: null,
                    }))
                  : [];
              if (list.length === 0) return null;
              return (
                <Card className="mb-3">
                  <Card.Header
                    className="fw-semibold"
                    style={{ backgroundColor: "#f1f3f5" }}
                  >
                    Selected Itineraries
                    <span className="text-muted small ms-2 fw-normal">
                      ({list.length})
                    </span>
                  </Card.Header>
                  <Card.Body>
                    <ol
                      className="ps-3 mb-0 small text-secondary"
                      style={{ lineHeight: 1.6 }}
                    >
                      {list.map((it, idx) => (
                        <li key={idx} className="mb-1">
                          <span className="text-dark">
                            {it.heading ||
                              (it.itineraryId
                                ? `Itinerary ${it.itineraryId}`
                                : "Itinerary")}
                          </span>
                          {/* {it.itineraryId != null && (
                            <span
                              className="text-muted ms-2"
                              style={{ fontSize: "0.7rem" }}
                            >
                              · ID {it.itineraryId}
                            </span>
                          )} */}
                          {it.days && it.days > 1 && (
                            <Badge
                              bg="light"
                              text="dark"
                              className="ms-2"
                              style={{ fontSize: "0.65rem" }}
                            >
                              {it.days} days
                            </Badge>
                          )}
                        </li>
                      ))}
                    </ol>
                  </Card.Body>
                </Card>
              );
            })()}

            {/* Policies — three buckets, each only shown when non-empty. */}
            <PolicyCard
              title="Inclusions"
              items={booking.inclusions}
              accepted={booking.acceptedInclusions}
            />
            <PolicyCard
              title="Terms & Conditions"
              items={booking.termsAndConditions}
              accepted={booking.acceptedTermsAndConditions}
            />
            <PolicyCard
              title="Cancellation Policy"
              items={booking.cancellationPolicies}
              accepted={booking.acceptedCancellationPolicies}
            />

         

            {/* Booking Remark — shown in its own card once added via
                the BOOKING REMARK button. */}
            {booking.remarks && (
              <Card className="mb-3">
                <Card.Header
                  className="fw-semibold"
                  style={{ backgroundColor: "#f1f3f5" }}
                >
                  Booking Remark
                </Card.Header>
                <Card.Body>
                  <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
                    {booking.remarks}
                  </p>
                </Card.Body>
              </Card>
            )}

            {/* Notes — shown in its own card once added via the NOTES
                button (separate store from the Booking Remark). */}
            {booking.notes && (
              <Card className="mb-3">
                <Card.Header
                  className="fw-semibold"
                  style={{ backgroundColor: "#f1f3f5" }}
                >
                  Notes
                </Card.Header>
                <Card.Body>
                  <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
                    {booking.notes}
                  </p>
                </Card.Body>
              </Card>
            )}

            {/* Bottom action buttons — full set ported from
                BookingDetailedView, minus RECONFIRM (activity
                bookings are always confirmed at create time). The
                whole row is hidden when the booking is cancelled —
                no further action makes sense at that point. */}
            {!isCancelled && (
              <div
                className="d-flex gap-2 justify-content-start flex-wrap"
                style={{ marginTop: "16px", marginBottom: "20px" }}
              >
                {/* ADD NEW ITEM — opens the activity search with a
                    parentBookingCode in the query so a follow-up
                    booking can be linked back to this one. */}
                <button
                  style={BTN_PRIMARY}
                  onClick={() => {
                    const parent =
                      booking.parentBookingCode || booking.bookingCode || "";
                    navigate(
                      `/new-booking/tours-and-activities?parentBookingCode=${encodeURIComponent(
                        parent,
                      )}`,
                    );
                  }}
                >
                  ADD NEW ITEM
                </button>

                <button style={BTN_DANGER} onClick={openCancelModal}>
                  CANCEL
                </button>

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

                <button
                  style={BTN_SKY}
                  onClick={openConfirmStatusModal}
                >
                  ADD AGENT REF
                </button>

                <button
                  style={BTN_INDIGO}
                  onClick={openConfirmationNoModal}
                >
                  CONFIRMATION NO.
                </button>

                <button
                  style={BTN_ORANGE}
                  onClick={() => setShowResendModal(true)}
                  disabled={resendingMail}
                >
                  {resendingMail ? "SENDING..." : "RESEND MAIL TO AGENT"}
                </button>

                <button style={BTN_ACCENT} onClick={openRemarkModal}>
                  BOOKING REMARK
                </button>

                <button style={BTN_NEUTRAL} onClick={openNotesModal}>
                  NOTES
                </button>
              </div>
            )}
         </Container>
        </main>
      </div>

      {/* Cancel confirmation */}
      <Modal
        show={showCancelModal}
        onHide={() => !cancelling && setShowCancelModal(false)}
        centered
      >
        <Modal.Header closeButton={!cancelling}>
          <Modal.Title>Cancel Activity Booking</Modal.Title>
        </Modal.Header>
        <Modal.Body className="py-4">
          <p className="mb-2 text-muted text-center">
            Are you sure you want to cancel this booking?
          </p>
          <h5 className="mb-3 text-center">{code}</h5>
          <Form.Group>
            <Form.Label className="small fw-semibold text-muted">
              Reason <span className="text-muted fw-normal">(optional)</span>
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              placeholder="Why is this booking being cancelled?"
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              disabled={cancelling}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer className="justify-content-center border-0 pb-4">
          <Button
            variant="light"
            className="px-4"
            onClick={() => setShowCancelModal(false)}
            disabled={cancelling}
          >
            No, Keep
          </Button>
          <Button
            variant="dark"
            className="px-4"
            onClick={handleCancelBooking}
            disabled={cancelling}
          >
            {cancelling ? <Spinner size="sm" className="me-2" /> : "Yes, Cancel"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Update Book Status — Agent LPO required. */}
      <Modal
        show={showConfirmStatusModal}
        onHide={() =>
          !updatingConfirmationStatus && setShowConfirmStatusModal(false)
        }
        centered
      >
        <Modal.Header closeButton={!updatingConfirmationStatus}>
          <Modal.Title>Add Agent Reference</Modal.Title>
        </Modal.Header>
        <Modal.Body className="py-3">
          <Form.Group>
            <Form.Label className="small fw-semibold text-muted">
              Agent LPO <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              type="text"
              placeholder="Agent LPO"
              value={confirmAgentLpo}
              onChange={(e) => {
                setConfirmAgentLpo(e.target.value);
                if (confirmAgentLpoError) setConfirmAgentLpoError("");
              }}
              isInvalid={!!confirmAgentLpoError}
              disabled={updatingConfirmationStatus}
            />
            <Form.Control.Feedback type="invalid">
              {confirmAgentLpoError}
            </Form.Control.Feedback>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer className="border-0">
          <Button
            variant="light"
            onClick={() => setShowConfirmStatusModal(false)}
            disabled={updatingConfirmationStatus}
          >
            Cancel
          </Button>
          <Button
            variant="dark"
            onClick={updateConfirmationStatus}
            disabled={updatingConfirmationStatus}
          >
            {updatingConfirmationStatus ? (
              <Spinner size="sm" className="me-2" />
            ) : (
              "Save"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Confirmation Number */}
      <Modal
        show={showConfirmationNoModal}
        onHide={() =>
          !savingConfirmationNo && setShowConfirmationNoModal(false)
        }
        centered
      >
        <Modal.Header closeButton={!savingConfirmationNo}>
          <Modal.Title>Confirmation Number</Modal.Title>
        </Modal.Header>
        <Modal.Body className="py-3">
          <Form.Group>
            <Form.Label className="small fw-semibold text-muted">
              Confirmation No. <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              type="text"
              placeholder="Supplier confirmation number"
              value={confirmationNoInput}
              onChange={(e) => {
                setConfirmationNoInput(e.target.value);
                if (confirmationNoError) setConfirmationNoError("");
              }}
              isInvalid={!!confirmationNoError}
              disabled={savingConfirmationNo}
            />
            <Form.Control.Feedback type="invalid">
              {confirmationNoError}
            </Form.Control.Feedback>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer className="border-0">
          <Button
            variant="light"
            onClick={() => setShowConfirmationNoModal(false)}
            disabled={savingConfirmationNo}
          >
            Cancel
          </Button>
          <Button
            variant="dark"
            onClick={saveConfirmationNo}
            disabled={savingConfirmationNo}
          >
            {savingConfirmationNo ? (
              <Spinner size="sm" className="me-2" />
            ) : (
              "Save"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Booking Remark */}
      <Modal
        show={showRemarkModal}
        onHide={() => !savingRemark && setShowRemarkModal(false)}
        centered
      >
        <Modal.Header closeButton={!savingRemark}>
          <Modal.Title>Booking Remark</Modal.Title>
        </Modal.Header>
        <Modal.Body className="py-3">
          <Form.Group>
            <Form.Label className="small fw-semibold text-muted">
              Remark
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={5}
              placeholder="Add an operator note for this booking"
              value={remarkInput}
              onChange={(e) => setRemarkInput(e.target.value)}
              disabled={savingRemark}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer className="border-0">
          <Button
            variant="light"
            onClick={() => setShowRemarkModal(false)}
            disabled={savingRemark}
          >
            Cancel
          </Button>
          <Button
            variant="dark"
            onClick={saveRemark}
            disabled={savingRemark}
          >
            {savingRemark ? <Spinner size="sm" className="me-2" /> : "Save"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Notes */}
      <Modal
        show={showNotesModal}
        onHide={() => !savingNotes && setShowNotesModal(false)}
        centered
      >
        <Modal.Header closeButton={!savingNotes}>
          <Modal.Title>Notes</Modal.Title>
        </Modal.Header>
        <Modal.Body className="py-3">
          <Form.Group>
            <Form.Label className="small fw-semibold text-muted">
              Note
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={5}
              placeholder="Add a note for this booking"
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              disabled={savingNotes}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer className="border-0">
          <Button
            variant="light"
            onClick={() => setShowNotesModal(false)}
            disabled={savingNotes}
          >
            Cancel
          </Button>
          <Button variant="dark" onClick={saveNotes} disabled={savingNotes}>
            {savingNotes ? <Spinner size="sm" className="me-2" /> : "Save"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Resend Mail to Agent — confirmation showing the recipient. */}
      <Modal
        show={showResendModal}
        onHide={() => !resendingMail && setShowResendModal(false)}
        centered
      >
        <Modal.Header closeButton={!resendingMail}>
          <Modal.Title>Resend Mail to Agent</Modal.Title>
        </Modal.Header>
        <Modal.Body className="py-3">
          <p className="text-muted small mb-3">
            The voucher will be emailed to:
          </p>
          <div className="d-flex align-items-center mb-2">
            <FaUserAlt className="me-2 text-primary" />
            <span className="fw-semibold">
              {booking.agentName ||
                (booking.agentId ? `Agent #${booking.agentId}` : "Agent")}
            </span>
          </div>
          <div className="d-flex align-items-center">
            <FaEnvelope className="me-2 text-primary" />
            <span className="fw-semibold">
              {booking.agentEmail || booking.customer?.emailId || "—"}
            </span>
          </div>
          {!booking.agentEmail && !booking.customer?.emailId && (
            <div className="text-danger small mt-2">
              No recipient email on file for this booking.
            </div>
          )}
        </Modal.Body>
        <Modal.Footer className="border-0">
          <Button
            variant="light"
            onClick={() => setShowResendModal(false)}
            disabled={resendingMail}
          >
            Cancel
          </Button>
          <Button
            variant="dark"
            onClick={resendMailToAgent}
            disabled={resendingMail}
          >
            {resendingMail ? <Spinner size="sm" className="me-2" /> : "OK, Send"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Generic PDF preview modal — driven by pdfPreview state.
          Same iframe-in-modal pattern as before but reused for
          both VOUCHER and INVOICE types (the label updates per
          request). The "Open in new tab" affordance is preserved so
          users can pop the file out / download it. */}
      <Modal
        show={!!pdfPreview}
        onHide={() => setPdfPreview(null)}
        size="xl"
        centered
        backdrop="static"
        scrollable
      >
        <Modal.Header closeButton>
          <Modal.Title className="d-flex align-items-center">
            <FaFilePdf className="me-2 text-danger" />
            {pdfPreview?.label || "PDF"} Preview
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ padding: 0, height: "75vh" }}>
          {pdfPreview?.url ? (
            <iframe
              title={`${pdfPreview.label || "PDF"} preview`}
              src={pdfPreview.url}
              style={{ width: "100%", height: "100%", border: 0 }}
            />
          ) : (
            <div className="text-center py-5 text-muted">
              PDF URL unavailable.
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          {pdfPreview?.url && (
            <a
              className="btn btn-outline-primary"
              href={pdfPreview.url}
              target="_blank"
              rel="noreferrer"
            >
              Open in new tab
            </a>
          )}
          <Button variant="secondary" onClick={() => setPdfPreview(null)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

// Reusable section card for inclusions / T&C / cancellation. Kept
// inline because it isn't used anywhere else.
function PolicyCard({ title, items, accepted }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <Card className="mb-3">
      <Card.Header
        className="fw-semibold d-flex justify-content-between align-items-center"
        style={{ backgroundColor: "#f1f3f5" }}
      >
        <span>{title}</span>
        {accepted === true && (
          <Badge bg="success-subtle" text="success">
            <FaCheckCircle className="me-1" />
            Accepted
          </Badge>
        )}
      </Card.Header>
      <Card.Body>
        <ul className="ps-3 mb-0 small text-secondary">
          {items.map((line, idx) => (
            <li key={idx} className="mb-1">
              {line}
            </li>
          ))}
        </ul>
      </Card.Body>
    </Card>
  );
}

// Page chrome (TopBar + Sidebar) shared by the loading / error
// states so they line up with the loaded view.
function PageShell({ children }) {
  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <Container fluid style={{ maxWidth: "1100px" }}>
            {children}
          </Container>
        </main>
      </div>
    </div>
  );
}
