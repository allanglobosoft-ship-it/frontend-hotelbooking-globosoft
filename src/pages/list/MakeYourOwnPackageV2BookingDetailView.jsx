/**
 * MakeYourOwnPackageV2BookingDetailView.jsx
 *
 * Full-page detail view for a single MYOP v2 booking. Replaces the
 * modal-based "View" that used to live in MakeYourOwnPackageV2BookingList.
 * The Voucher / Cancel row icons now sit at the bottom-left of this page
 * as buttons. All endpoints / behaviour are unchanged:
 *   - Detail fetch :  GET    /api/makeYourOwnPackageV2/booking/{id}
 *   - Voucher PDF  :  GET    /api/makeYourOwnPackageV2/booking/{id}/voucher
 *   - Send by mail :  POST   /api/makeYourOwnPackageV2/booking/send-pdf-email
 *                     { email, pdfUrl, bookingId }
 *   - Cancel       :  DELETE /api/makeYourOwnPackageV2/booking/{id}?reason=...
 *
 * The list row is forwarded via location.state.booking so the page has a
 * booking-code header even before the detail fetch resolves. On hard
 * refresh the route id alone drives the fetch and the page recovers.
 *
 * VISUAL NOTE: The presentation here is reskinned to match the Hotel
 * Booking detail view (BookingDetailedView.jsx) — same page wrapper,
 * header, card / InfoRow styling, action-button bar + booking-date
 * footer, and PDF/modal styling. Only the JSX presentation changed; the
 * data fetch, booking-id resolution, location.state handling, every
 * action handler / modal, all navigate targets and the default export
 * name are untouched.
 */
import React, { useEffect, useState } from "react";
import {
  Container,
  Row,
  Col,
  Form,
  Table,
  Spinner,
  Modal,
  Button,
  InputGroup,
} from "react-bootstrap";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import {
  FaEnvelope,
  FaPaperPlane,
  FaDownload,
  FaExclamationCircle,
} from "react-icons/fa";
import { toast } from "react-hot-toast";
import axiosInstance from "../../components/AxiosInstance";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import { ADDON_SERVICES_CATALOG } from "../../components/AddOnServicesPanel";

// ── Hotel-view visual system (copied from BookingDetailedView.jsx) ─────
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
// BookingDetailedView.jsx so this MYOP v2 detail page reads as part of the
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

const formatDateTime = (dateStr) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? String(dateStr) : d.toLocaleString();
};

// Per-part status colouring — same logic as the hotel detail view, so the
// row → detail transition feels seamless. Confirmed / ReConfirmed → green,
// Cancelled → red, On Request → orange.
const StatusBadge = ({ status }) => {
  const colorFor = (part) => {
    const p = (part || "").trim().toUpperCase();
    if (p.startsWith("CONFIRMED") || p.startsWith("RECONFIRMED")) return "#16a34a";
    if (p.startsWith("COMPLETED")) return "#16a34a";
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

const _catalogByKey = ADDON_SERVICES_CATALOG.reduce((acc, svc) => {
  acc[svc.key] = svc;
  return acc;
}, {});
const _fieldLabel = (svcKey, fieldName) => {
  const svc = _catalogByKey[svcKey];
  if (!svc) return fieldName;
  const f = (svc.fields || []).find((x) => x.name === fieldName);
  return f ? f.label : fieldName;
};

export default function MakeYourOwnPackageV2BookingDetailView() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const rowStub = location.state?.booking || null;
  const bookingId = rowStub?.id || routeId;

  const [details, setDetails] = useState(rowStub);
  const [loadingDetails, setLoadingDetails] = useState(true);

  // Cancel modal
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  // Voucher modal — iframe preview + send-email form
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfUrl, setPdfUrl] = useState("");
  const [loadingPdf, setLoadingPdf] = useState(false);

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [sendingMail, setSendingMail] = useState(false);

  // ── Long-Stay-parity action state ──────────────────────────────────
  // Reconfirm (Confirm / Reject popup)
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmingBooking, setConfirmingBooking] = useState(false);

  // Reject (follow-up modal from Reconfirm → Reject)
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectedBy, setRejectedBy] = useState("");
  const [rejectedByError, setRejectedByError] = useState("");
  const [rejectionRemarks, setRejectionRemarks] = useState("");
  const [rejectingBooking, setRejectingBooking] = useState(false);

  // Agent Reference (GET prefill / POST agent-reference)
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

  // Resend Mail to Agent
  const [resendingMail, setResendingMail] = useState(false);

  const fetchDetail = async () => {
    if (!bookingId) {
      toast.error("Booking id missing");
      setLoadingDetails(false);
      return;
    }
    setLoadingDetails(true);
    try {
      const res = await axiosInstance.get(
        `/api/makeYourOwnPackageV2/booking/${bookingId}`,
      );
      if (res.data) setDetails(res.data);
    } catch (e) {
      console.error("v2 booking detail error", e);
      toast.error("Failed to load booking details");
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    fetchDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  // ── Cancel ─────────────────────────────────────────────────────────
  const doCancel = async () => {
    if (!bookingId) return;
    setCancelling(true);
    try {
      await axiosInstance.delete(
        `/api/makeYourOwnPackageV2/booking/${bookingId}`,
        { params: { reason: cancelReason || "" } },
      );
      toast.success("Booking cancelled");
      setShowCancel(false);
      setCancelReason("");
      navigate(-1);
    } catch (e) {
      console.error("v2 cancel error", e);
      toast.error("Failed to cancel booking");
    } finally {
      setCancelling(false);
    }
  };

  // ── Voucher / PDF ──────────────────────────────────────────────────
  const onVoucher = async () => {
    if (!bookingId) return;
    setEmail("");
    setEmailError("");
    setPdfUrl("");
    setShowPdfModal(true);
    setLoadingPdf(true);
    try {
      const res = await axiosInstance.get(
        `/api/make-your-own-package-v2/${bookingId}/pdf?type=VOUCHER`,
      );
      if (res.data?.status === "SUCCESS" && res.data?.pdfUrl) {
        setPdfUrl(res.data.pdfUrl);
      } else {
        toast.error(res.data?.message || "Failed to generate voucher");
        setShowPdfModal(false);
      }
    } catch (e) {
      console.error("voucher error", e);
      toast.error("Failed to generate voucher");
      setShowPdfModal(false);
    } finally {
      setLoadingPdf(false);
    }
  };

  const closePdfModal = () => {
    setShowPdfModal(false);
    setPdfUrl("");
    setEmail("");
    setEmailError("");
  };

  const handleSendMail = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Enter a valid email address");
      return;
    }
    setEmailError("");
    setSendingMail(true);
    try {
      const res = await axiosInstance.post(
        "/api/makeYourOwnPackageV2/booking/send-pdf-email",
        {
          email,
          pdfUrl,
          bookingId,
        },
      );
      if (res.data?.status === "SUCCESS") {
        toast.success("Voucher emailed to " + email);
        setEmail("");
      } else {
        toast.error(res.data?.message || "Failed to send email");
      }
    } catch (e) {
      console.error("send mail error", e);
      toast.error("Failed to send email");
    } finally {
      setSendingMail(false);
    }
  };

  // ── Status helpers (mirror LongStayBookingDetailView) ──────────────
  const normalizedStatus = String(details?.confirmationStatus || "")
    .replace(/\s+/g, "")
    .toUpperCase();
  const isCancelled =
    !!details?.isCancelled ||
    String(details?.bookingStatus || "").trim().toUpperCase() === "CANCELLED" ||
    normalizedStatus === "CANCELLED";
  // Final docs once reconfirmed/completed; otherwise Proforma equivalents.
  const showsFinalDocs =
    details?.reconfirmation === true ||
    normalizedStatus === "RECONFIRMED" ||
    normalizedStatus === "COMPLETED";
  // Agent Reference / Confirmation No. only once Confirmed-or-later.
  const isConfirmedOrLater =
    normalizedStatus === "CONFIRMED" ||
    normalizedStatus === "RECONFIRMED" ||
    normalizedStatus === "COMPLETED" ||
    details?.reconfirmation === true;

  // Display status string for the header / status rows — surfaces an
  // explicit Cancelled label, else falls back to the booking status.
  const displayStatus = isCancelled
    ? "Cancelled"
    : String(details?.bookingStatus || "Confirmed").trim();

  // ── Reconfirm ──────────────────────────────────────────────────────
  const openConfirmModal = () => setShowConfirmModal(true);

  const confirmBooking = async () => {
    if (!bookingId) return;
    try {
      setConfirmingBooking(true);
      await axiosInstance.patch(
        `/api/makeYourOwnPackageV2/booking/${bookingId}/confirmation-status`,
        { confirmStatus: true },
      );
      setShowConfirmModal(false);
      toast.success("Booking reconfirmed successfully!");
      await fetchDetail();
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Failed to reconfirm booking. Please try again.",
      );
    } finally {
      setConfirmingBooking(false);
    }
  };

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
        `/api/makeYourOwnPackageV2/booking/${bookingId}/confirmation-status`,
        {
          action: "REJECT",
          rejectedBy: rb,
          rejectionRemarks: (rejectionRemarks || "").trim() || null,
        },
      );
      setShowRejectModal(false);
      toast.success("Booking rejected.");
      await fetchDetail();
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Failed to reject booking. Please try again.",
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
        `/api/makeYourOwnPackageV2/booking/${bookingId}/agent-reference`,
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
        `/api/makeYourOwnPackageV2/booking/${bookingId}/agent-reference`,
        { agentLpo: lpoTrimmed },
      );
      setShowConfirmStatusModal(false);
      toast.success("Agent Reference updated successfully");
      await fetchDetail();
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Failed to update Agent Reference. Please try again.",
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
        `/api/makeYourOwnPackageV2/booking/${bookingId}/agent-reference`,
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
        `/api/makeYourOwnPackageV2/booking/${bookingId}/confirmation-status`,
        { action: "CONFIRMATION_NO", confirmationNumber: value },
      );
      setShowConfirmationNoModal(false);
      toast.success("Confirmation number saved successfully!");
      await fetchDetail();
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Failed to save confirmation number. Please try again.",
      );
    } finally {
      setSavingConfirmationNo(false);
    }
  };

  // ── Booking Remark ─────────────────────────────────────────────────
  const openRemarkModal = () => {
    setRemarkInput(details?.remarks || "");
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
      await axiosInstance.post(
        `/api/makeYourOwnPackageV2/booking/${bookingId}/remark`,
        { remarks: text },
      );
      setShowRemarkModal(false);
      toast.success("Remark saved successfully");
      await fetchDetail();
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Failed to save remark. Please try again.",
      );
    } finally {
      setSavingRemark(false);
    }
  };

  // ── Resend Mail to Agent ───────────────────────────────────────────
  const resendMailToAgent = async () => {
    try {
      setResendingMail(true);
      await axiosInstance.post(
        `/api/makeYourOwnPackageV2/booking/${bookingId}/resend-mail`,
      );
      toast.success("Mail resent to agent successfully!");
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          "Failed to resend mail to agent. Please try again.",
      );
    } finally {
      setResendingMail(false);
    }
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4" style={{ overflow: "auto" }}>
          <Container fluid style={{ maxWidth: "1100px" }}>
            {/* ── Header (Back + title) ── */}
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
                Booking Details
              </span>
            </div>

            {loadingDetails && !details ? (
              <div className="text-center py-5">
                <Spinner animation="border" style={{ color: "#c0392b" }} />
                <p className="mt-3 text-muted">Loading booking details...</p>
              </div>
            ) : !details ? (
              <div className="text-center py-5 text-muted">
                Booking not found.
              </div>
            ) : (
              <>
                {/* ── Customer Information ──────────────────────────── */}
                <div style={card}>
                  <div style={SECTION_HEADER}>Customer Information</div>
                  <div style={{ padding: "12px 16px" }}>
                    <Row>
                      <Col md={6}>
                        <InfoRow
                          label="Name"
                          value={
                            [
                              details.salutation,
                              details.customerFirstName,
                              details.customerLastName,
                            ]
                              .filter(Boolean)
                              .join(" ") || "-"
                          }
                        />
                        <InfoRow label="Email" value={details.customerEmail} />
                        <InfoRow label="Phone" value={details.customerPhone} />
                      </Col>
                      <Col md={6}>
                        <InfoRow
                          label="Passport"
                          value={details.customerPassport}
                        />
                        <InfoRow
                          label="Nationality"
                          value={details.customerNationality}
                        />
                        <InfoRow label="Agent" value={details.agentName} />
                      </Col>
                    </Row>
                  </div>
                </div>

                {/* ── Policy Acceptance ─────────────────────────────── */}
                <div style={card}>
                  <div style={SECTION_HEADER}>Policy Acceptance</div>
                  <div style={{ padding: "12px 16px" }}>
                    <Row>
                      <Col md={6}>
                        <InfoRow
                          label="Terms & Conditions"
                          value={
                            details.acceptedTerms ? (
                              <span style={{ color: "#16a34a", fontWeight: 600 }}>
                                Accepted
                              </span>
                            ) : (
                              <span style={{ color: "#888" }}>Not recorded</span>
                            )
                          }
                        />
                        <InfoRow
                          label="Cancellation Policies"
                          value={
                            details.acceptedCancellation ? (
                              <span style={{ color: "#16a34a", fontWeight: 600 }}>
                                Accepted
                              </span>
                            ) : (
                              <span style={{ color: "#888" }}>Not recorded</span>
                            )
                          }
                        />
                      </Col>
                      <Col md={6}>
                        <InfoRow
                          label="Accepted On"
                          value={
                            details.acceptedAt
                              ? new Date(details.acceptedAt).toLocaleString()
                              : "-"
                          }
                        />
                      </Col>
                    </Row>
                  </div>
                </div>

                {/* ── Booking Summary ───────────────────────────────── */}
                <div style={card}>
                  <div style={SECTION_HEADER}>Booking Summary</div>
                  <div style={{ padding: "12px 16px" }}>
                    <Row>
                      <Col md={6}>
                        <InfoRow
                          label="Booking Code"
                          value={details.bookingCode}
                        />
                        <InfoRow
                          label="Booking Date"
                          value={
                            details.bookingDate
                              ? new Date(details.bookingDate).toLocaleString()
                              : "-"
                          }
                        />
                        <InfoRow label="Tour Date" value={details.tourDate} />
                        <InfoRow
                          label="Status"
                          value={<StatusBadge status={displayStatus} />}
                        />
                      </Col>
                      <Col md={6}>
                        <InfoRow
                          label="Payment Mode"
                          value={details.paymentMode}
                        />
                        <InfoRow
                          label="Selling Price"
                          value={`₹ ${Number(
                            details.sellingPrice || 0,
                          ).toLocaleString()}`}
                        />
                        <InfoRow
                          label="Total Price"
                          value={`₹ ${Number(
                            details.totalPrice || 0,
                          ).toLocaleString()}`}
                        />
                      </Col>
                    </Row>
                  </div>
                </div>

                {/* ── Hotels ────────────────────────────────────────── */}
                {details.hotels?.length > 0 && (
                  <div style={card}>
                    <div style={SECTION_HEADER}>Hotels</div>
                    <div style={{ padding: "10px 16px 4px" }}>
                      <Table
                        bordered
                        size="sm"
                        style={{ fontSize: "0.82rem", marginBottom: "8px" }}
                      >
                        <thead style={{ backgroundColor: "#f8f8f8" }}>
                          <tr>
                            <th>#</th>
                            <th>Hotel</th>
                            <th>Room</th>
                            <th>Check-in / Out</th>
                            <th>Pax</th>
                            <th>Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {details.hotels.map((h, i) => (
                            <tr key={i}>
                              <td>{i + 1}</td>
                              <td>{h.hotelName || `#${h.hotelId}`}</td>
                              <td>{h.roomCategory || "-"}</td>
                              <td>
                                {h.checkIn || "-"} → {h.checkOut || "-"}
                              </td>
                              <td>
                                {h.noOfAdults || 0}A / {h.noOfChildren || 0}C
                              </td>
                              <td>
                                ₹ {Number(h.totalRate || 0).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* ── Transfers ─────────────────────────────────────── */}
                {details.cabs?.length > 0 && (
                  <div style={card}>
                    <div style={SECTION_HEADER}>Transfers</div>
                    <div style={{ padding: "10px 16px 4px" }}>
                      <Table
                        bordered
                        size="sm"
                        style={{ fontSize: "0.82rem", marginBottom: "8px" }}
                      >
                        <thead style={{ backgroundColor: "#f8f8f8" }}>
                          <tr>
                            <th>#</th>
                            <th>Cab</th>
                            <th>Pickup → Dropoff</th>
                            <th>Date</th>
                            <th>Pax</th>
                            <th>Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {details.cabs.map((c, i) => (
                            <tr key={i}>
                              <td>{i + 1}</td>
                              <td>{c.cabName || `#${c.cabId}`}</td>
                              <td>
                                {c.pickupName || "-"}
                                {c.pickupTime ? ` @ ${c.pickupTime}` : ""} →{" "}
                                {c.dropoffName || "-"}
                                {c.dropoffTime ? ` @ ${c.dropoffTime}` : ""}
                              </td>
                              <td>
                                {c.pickupDate || "-"}
                                {c.dropoffDate ? ` → ${c.dropoffDate}` : ""}
                              </td>
                              <td>
                                {c.noOfAdult || 0}A / {c.noOfChild || 0}C
                              </td>
                              <td>
                                ₹ {Number(c.totalRate || 0).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* ── Tours & Activities ────────────────────────────── */}
                {details.activities?.length > 0 && (
                  <div style={card}>
                    <div style={SECTION_HEADER}>Tours &amp; Activities</div>
                    <div style={{ padding: "10px 16px 4px" }}>
                      <Table
                        bordered
                        size="sm"
                        style={{ fontSize: "0.82rem", marginBottom: "8px" }}
                      >
                        <thead style={{ backgroundColor: "#f8f8f8" }}>
                          <tr>
                            <th>#</th>
                            <th>Activity</th>
                            <th>Date</th>
                            <th>Pax</th>
                            <th>Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {details.activities.map((a, i) => (
                            <tr key={i}>
                              <td>{i + 1}</td>
                              <td>{a.activityName || `#${a.activityId}`}</td>
                              <td>{a.tourDate || "-"}</td>
                              <td>
                                {a.noOfAdult || 0}A / {a.noOfChild || 0}C
                              </td>
                              <td>
                                ₹ {Number(a.totalRate || 0).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* ── Guests — full pax manifest. The lead traveller is
                    flagged "Primary" and surfaces booking-owner contact
                    details. ───────────────────────────────────────── */}
                {details.guests?.length > 0 && (
                  <div style={card}>
                    <div style={SECTION_HEADER}>
                      Guests ({details.guests.length})
                    </div>
                    <div style={{ padding: "10px 16px 4px" }}>
                      <Table
                        bordered
                        size="sm"
                        style={{ fontSize: "0.8rem", marginBottom: "8px" }}
                      >
                        <thead style={{ backgroundColor: "#f8f8f8" }}>
                          <tr>
                            <th style={{ width: 40 }}>S.No</th>
                            <th style={{ width: 90 }}>Type</th>
                            <th>Name</th>
                            <th style={{ width: 80 }}>Gender</th>
                            <th style={{ width: 70 }}>Age</th>
                            <th>Contact / Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {details.guests.map((g, i) => {
                            const isPrimary = g.primaryGuest === true;
                            const contactBits = [];
                            if (g.email) contactBits.push(`✉ ${g.email}`);
                            if (g.phone) contactBits.push(`☎ ${g.phone}`);
                            if (g.passportNo)
                              contactBits.push(`Passport: ${g.passportNo}`);
                            if (g.nativeCountry)
                              contactBits.push(
                                `Nationality: ${g.nativeCountry}`,
                              );
                            if (g.agentLpo)
                              contactBits.push(`LPO: ${g.agentLpo}`);
                            return (
                              <tr key={i}>
                                <td>{i + 1}</td>
                                <td>
                                  {g.isChild ? "CHD" : "ADT"}
                                  {isPrimary && (
                                    <span
                                      style={{
                                        marginLeft: 6,
                                        fontSize: "0.65rem",
                                        fontWeight: 700,
                                        color: "#fff",
                                        backgroundColor: "#0dcaf0",
                                        borderRadius: 3,
                                        padding: "1px 6px",
                                      }}
                                    >
                                      Primary
                                    </span>
                                  )}
                                </td>
                                <td>
                                  {[
                                    g.salutation,
                                    g.firstName,
                                    g.middleName,
                                    g.lastName,
                                  ]
                                    .filter(Boolean)
                                    .join(" ") || ""}
                                </td>
                                <td>{g.gender || ""}</td>
                                <td>{g.age || ""}</td>
                                <td>
                                  {contactBits.length
                                    ? contactBits.join(" · ")
                                    : ""}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* ── Add-On Services ───────────────────────────────── */}
                {details.addOnServices &&
                  Object.keys(details.addOnServices).length > 0 && (
                    <div style={card}>
                      <div style={SECTION_HEADER}>Add-On Services</div>
                      <div style={{ padding: "12px 16px" }}>
                        <Row className="g-2">
                          {Object.entries(details.addOnServices).map(
                            ([svcKey, data]) => {
                              if (!data || data.enabled !== true) return null;
                              const svc = _catalogByKey[svcKey];
                              const label = svc ? svc.label : svcKey;
                              const filled = Object.entries(data || {}).filter(
                                ([k, v]) =>
                                  k !== "enabled" &&
                                  v !== undefined &&
                                  v !== null &&
                                  v !== "",
                              );
                              return (
                                <Col md={6} key={svcKey}>
                                  <div
                                    style={{
                                      border: "1px solid #ddd",
                                      borderRadius: 4,
                                      overflow: "hidden",
                                      height: "100%",
                                      backgroundColor: "#fff",
                                    }}
                                  >
                                    <div
                                      style={{
                                        backgroundColor: "#f0f0f0",
                                        padding: "6px 10px",
                                        fontWeight: 600,
                                        fontSize: "0.82rem",
                                        borderBottom: "1px solid #ddd",
                                      }}
                                    >
                                      {label}
                                    </div>
                                    <div style={{ padding: "8px 10px" }}>
                                      {filled.length === 0 ? (
                                        <span
                                          style={{
                                            fontSize: "0.78rem",
                                            color: "#888",
                                            fontStyle: "italic",
                                          }}
                                        >
                                          Enabled (no extra details)
                                        </span>
                                      ) : (
                                        filled.map(([k, v]) => (
                                          <InfoRow
                                            key={k}
                                            label={_fieldLabel(svcKey, k)}
                                            value={String(v)}
                                          />
                                        ))
                                      )}
                                    </div>
                                  </div>
                                </Col>
                              );
                            },
                          )}
                        </Row>
                      </div>
                    </div>
                  )}

                {/* ── Action Buttons ──────────────────────────────────
                    All booking-level actions live here, styled with the
                    hotel-view BUTTON_STYLE bar. PROFORMA / FINAL doc PDFs
                    are intentionally omitted — the v2 backend exposes only
                    a single Voucher PDF endpoint, so the Voucher button is
                    the only PDF action. */}
                <div
                  style={{
                    marginBottom: "10px",
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    style={BTN_INFO}
                    onClick={onVoucher}
                    title="Voucher"
                  >
                    VOUCHER
                  </button>

                  {!isCancelled && (
                    <button
                      style={BTN_DANGER}
                      onClick={() => setShowCancel(true)}
                      title="Cancel booking"
                    >
                      CANCEL
                    </button>
                  )}

                  {!showsFinalDocs && !isCancelled && (
                    <button style={BTN_TEAL} onClick={openConfirmModal}>
                      RECONFIRM
                    </button>
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

                  <button
                    style={BTN_ORANGE}
                    onClick={resendMailToAgent}
                    disabled={resendingMail}
                  >
                    {resendingMail ? "SENDING..." : "RESEND MAIL TO AGENT"}
                  </button>

                  <button style={BTN_ACCENT} onClick={openRemarkModal}>
                    BOOKING REMARK
                  </button>

                  <button
                    style={BTN_NEUTRAL}
                    onClick={() =>
                      navigate(
                        `/booking-details/make-your-own-package-v2/${bookingId}/notes`,
                      )
                    }
                  >
                    NOTES
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
                  Booking Date : {formatDateTime(details.bookingDate)}
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
                      <span>Reconfirm Booking</span>
                    </Modal.Title>
                  </Modal.Header>
                  <Modal.Body style={{ padding: "1.5rem" }}>
                    <div className="text-center">
                      <p className="fs-5 mb-3">
                        Are you sure you want to reconfirm the booking?
                      </p>
                      <div className="text-muted small mb-3">
                        <strong>Booking Code:</strong>{" "}
                        {details.bookingCode || "N/A"}
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
                          <Spinner
                            animation="border"
                            size="sm"
                            className="me-2"
                          />
                          Confirming...
                        </>
                      ) : (
                        "Confirm"
                      )}
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
                    <div className="text-muted small mb-3">
                      <strong>Booking Code:</strong>{" "}
                      {details.bookingCode || "N/A"}
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
                      <strong>Booking Code:</strong>{" "}
                      {details.bookingCode || "N/A"}
                    </div>
                    <Form.Group controlId="confirmationNoInput">
                      <Form.Label className="fw-semibold mb-1">
                        Confirmation Number{" "}
                        <span className="text-danger">*</span>
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
              </>
            )}
          </Container>
        </main>
      </div>

      {/* Cancel modal */}
      <Modal
        show={showCancel}
        onHide={() => {
          if (!cancelling) setShowCancel(false);
        }}
        centered
        backdrop="static"
        keyboard={false}
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
          <div className="text-center">
            <p className="fs-5 mb-3">
              Are you sure you want to cancel this booking?
            </p>
            <div className="text-muted small mb-3">
              <strong>Booking Code:</strong> {details?.bookingCode || "N/A"}
            </div>
            <Form.Group controlId="cancellationReason">
              <Form.Label className="fw-semibold">
                Cancellation Reason{" "}
                <span className="text-muted">(optional)</span>
              </Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                placeholder="Add a reason for cancellation (optional)"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
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
            onClick={() => setShowCancel(false)}
            disabled={cancelling}
          >
            No
          </Button>
          <Button variant="danger" onClick={doCancel} disabled={cancelling}>
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

      {/* Voucher / PDF preview modal — iframe + send-email */}
      <Modal
        show={showPdfModal}
        onHide={closePdfModal}
        size="xl"
        centered
        scrollable
        backdrop="static"
      >
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: "1rem", fontWeight: 700 }}>
            Voucher
            {details?.bookingCode ? ` — ${details.bookingCode}` : ""}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ padding: 0, height: "80vh" }}>
          {loadingPdf ? (
            <div className="h-100 d-flex flex-column align-items-center justify-content-center">
              <Spinner animation="border" style={{ color: "#c0392b" }} />
              <p className="mt-2 text-muted">Generating Voucher…</p>
            </div>
          ) : pdfUrl ? (
            <iframe
              key={pdfUrl}
              src={`${pdfUrl}#toolbar=0`}
              title="Voucher PDF"
              style={{
                width: "100%",
                height: "100%",
                border: "none",
                display: "block",
              }}
            />
          ) : (
            <div className="text-center text-muted py-5">
              Failed to load PDF.
            </div>
          )}
        </Modal.Body>
        <div className="p-3 border-top bg-light">
          <Row className="g-2 align-items-center">
            <Col md={8}>
              <InputGroup>
                <InputGroup.Text>
                  <FaEnvelope />
                </InputGroup.Text>
                <Form.Control
                  type="email"
                  placeholder="recipient@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError("");
                  }}
                  isInvalid={!!emailError}
                />
                <Button
                  variant="primary"
                  onClick={handleSendMail}
                  disabled={sendingMail || !pdfUrl}
                >
                  {sendingMail ? (
                    <>
                      <Spinner size="sm" animation="border" className="me-1" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <FaPaperPlane className="me-1" /> Send Mail
                    </>
                  )}
                </Button>
              </InputGroup>
              {emailError && (
                <div className="text-danger small mt-1">{emailError}</div>
              )}
            </Col>
            <Col md={4} className="text-end">
              {pdfUrl && (
                <Button
                  variant="outline-primary"
                  size="sm"
                  onClick={() => window.open(pdfUrl, "_blank")}
                >
                  <FaDownload className="me-1" /> Download
                </Button>
              )}
            </Col>
          </Row>
        </div>
        <Modal.Footer>
          <Button variant="secondary" onClick={closePdfModal}>
            Close
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
