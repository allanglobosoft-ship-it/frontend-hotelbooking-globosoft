/**
 * MeetAndSpaceBookingDetailView.jsx
 *
 * Full-page detail view for a single Meet & Space booking. Mirrors
 * BookingDetailedView (the hotel detail page)'s visual shell AND action-bar
 * button set — Edit / Cancel / Voucher / Invoice / Add Agent Reference /
 * Confirmation No. / Resend Mail to Agent / Booking Remark / Notes /
 * History — scaled to what the Meet & Space booking lifecycle actually
 * supports (no On-Request/Confirm/Reconfirm chain, no cross-type
 * amendment linking, so there is no "Add New Item" here).
 */
import React, { useEffect, useState } from "react";
import {
  Container,
  Row,
  Col,
  Card,
  Table,
  Spinner,
  Form,
  Modal,
  Button,
  Badge,
} from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import {
  FaEdit,
  FaEnvelope,
  FaTrashAlt,
  FaFileInvoice,
} from "react-icons/fa";
import { toast } from "react-hot-toast";
import axiosInstance from "../../components/AxiosInstance";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";

// ── Visual shell constants — mirror BookingDetailedView (hotel detail page)
// so the meet-and-space detail view sits inside the same layout language
// (button colours, section-card header strip, key/value spacing) as the
// hotel page. Business logic below is unchanged — this is a pure re-skin.
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
// Colour-by-purpose matches BookingDetailedView's own legend exactly:
//   success → Confirm/Reconfirm (n/a here)   danger → Cancel
//   primary → Add / Edit / Update            info → Voucher / Invoice docs
//   neutral → View / Back / Notes            accent → Booking Remark
//   sky → Add Agent Reference                indigo → Confirmation No.
//   orange → Resend Mail                     history → History
const BTN_NEUTRAL = { ...BUTTON_STYLE, backgroundColor: "#64748b" }; // Back / Notes
const BTN_PRIMARY = { ...BUTTON_STYLE, backgroundColor: "#2563eb" }; // Edit
const BTN_DANGER = { ...BUTTON_STYLE, backgroundColor: "#dc2626" }; // Cancel
const BTN_INFO = { ...BUTTON_STYLE, backgroundColor: "#0891b2" }; // Voucher / Invoice
const BTN_SKY = { ...BUTTON_STYLE, backgroundColor: "#3ba2e8" }; // Add Agent Reference
const BTN_INDIGO = { ...BUTTON_STYLE, backgroundColor: "#6366f1" }; // Confirmation No.
const BTN_ORANGE = { ...BUTTON_STYLE, backgroundColor: "#f0922b" }; // Resend Mail
const BTN_ACCENT = { ...BUTTON_STYLE, backgroundColor: "#7c3aed" }; // Booking Remark
const BTN_HISTORY = { ...BUTTON_STYLE, backgroundColor: "#334155" }; // History

// Section card + label/value styling — copied verbatim from BookingDetailedView
// so the two pages render sections identically.
const CARD_STYLE = {
  border: "1px solid #ddd",
  borderRadius: "4px",
  marginBottom: "14px",
  overflow: "hidden",
  backgroundColor: "#fff",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
};
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

const InfoRow = ({ label, value }) => (
  <div
    style={{ marginBottom: "6px", display: "flex", alignItems: "flex-start" }}
  >
    <span style={INFO_LABEL}>{label}</span>
    <span style={{ ...INFO_VALUE, marginLeft: "8px" }}>{value ?? "-"}</span>
  </div>
);

const SectionCard = ({ title, children }) => (
  <div style={CARD_STYLE}>
    <div style={SECTION_HEADER}>{title}</div>
    <div style={{ padding: "12px 16px" }}>{children}</div>
  </div>
);

export default function MeetAndSpaceBookingDetailView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Cancel modal state
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSaving, setCancelSaving] = useState(false);

  // Voucher / Invoice modal — shared iframe preview + (voucher-only)
  // email-to-recipient form. docType picks which PDF is generated/shown.
  const [showDocModal, setShowDocModal] = useState(false);
  const [docType, setDocType] = useState("VOUCHER"); // "VOUCHER" | "INVOICE"
  const [docLabel, setDocLabel] = useState("Voucher");
  const [docPdfUrl, setDocPdfUrl] = useState("");
  const [docLoading, setDocLoading] = useState(false);
  const [voucherEmail, setVoucherEmail] = useState("");
  const [voucherEmailError, setVoucherEmailError] = useState("");
  const [voucherSending, setVoucherSending] = useState(false);

  // Add Agent Reference modal
  const [showAgentRefModal, setShowAgentRefModal] = useState(false);
  const [agentRefInput, setAgentRefInput] = useState("");
  const [agentRefError, setAgentRefError] = useState("");
  const [agentRefSaving, setAgentRefSaving] = useState(false);

  // Confirmation No. modal
  const [showConfNoModal, setShowConfNoModal] = useState(false);
  const [confNoInput, setConfNoInput] = useState("");
  const [confNoError, setConfNoError] = useState("");
  const [confNoSaving, setConfNoSaving] = useState(false);

  // Booking Remark modal
  const [showRemarkModal, setShowRemarkModal] = useState(false);
  const [remarkInput, setRemarkInput] = useState("");
  const [remarkSaving, setRemarkSaving] = useState(false);

  // Notes modal — read-only list + add form, same shape as the hotel flow
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  // Resend Mail — single click + button-level loading state (no modal;
  // the backend resolves the agent's email itself, so there's nothing to
  // preview/edit before sending).
  const [resendingMail, setResendingMail] = useState(false);

  // History modal — derived client-side from Created / Cancelled
  // timestamps already on the booking (mirrors the hotel page's approach;
  // Meet & Space has no separate Confirm/Reconfirm step to track).
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const fetchBooking = async () => {
    setLoading(true);
    try {
      const res = await axiosInstance.get(
        `/api/meet-and-space/booking/${id}`,
      );
      setData(res.data);
    } catch (e) {
      console.error("Load booking detail failed", e);
      toast.error("Failed to load booking");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBooking(); /* eslint-disable-next-line */
  }, [id]);

  // ── Voucher / Invoice PDF + email-send (voucher email endpoint only) ──
  const fetchDocPdf = async (type) => {
    if (!data) return;
    setDocLoading(true);
    setDocPdfUrl("");
    try {
      const res = await axiosInstance.get(
        `api/meet_and_space_booking/${data.id}/pdf?type=${type}`,
      );
      if (res.data && res.data.status === "SUCCESS" && res.data.pdfUrl) {
        setDocPdfUrl(res.data.pdfUrl);
      } else {
        toast.error(
          res.data?.message || `Failed to generate ${docLabel.toLowerCase()} PDF`,
        );
      }
    } catch (e) {
      console.error("Doc fetch failed", e);
      toast.error(
        e?.response?.data?.message || `Failed to load ${docLabel.toLowerCase()} PDF`,
      );
    } finally {
      setDocLoading(false);
    }
  };

  const openDoc = (type, label) => {
    if (!data) return;
    setDocType(type);
    setDocLabel(label);
    setShowDocModal(true);
    setVoucherEmail(data?.customer?.email || "");
    setVoucherEmailError("");
    fetchDocPdf(type);
  };
  const openVoucher = () => openDoc("VOUCHER", "Voucher");
  const openInvoice = () => openDoc("INVOICE", "Invoice");

  const closeDoc = () => {
    if (voucherSending) return;
    setShowDocModal(false);
    setDocPdfUrl("");
    setVoucherEmail("");
    setVoucherEmailError("");
  };

  const sendVoucherEmail = async () => {
    if (!data) return;
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
        `/api/meet-and-space/booking/${data.id}/voucher/send`,
        { email },
      );
      toast.success(`Voucher sent to ${email}`);
    } catch (e) {
      toast.error(
        e?.response?.data?.message || "Failed to send voucher email",
      );
    } finally {
      setVoucherSending(false);
    }
  };

  // ── Cancel (same endpoint as the list page) ──────────────────────
  const openCancel = () => {
    setShowCancel(true);
    setCancelReason("");
  };

  const handleCancelSubmit = async () => {
    if (!data) return;
    setCancelSaving(true);
    try {
      await axiosInstance.put(
        `/api/meet-and-space/booking/${data.id}/cancel`,
        { reason: cancelReason || "Cancelled by user" },
      );
      toast.success("Booking cancelled");
      setShowCancel(false);
      setCancelReason("");
      fetchBooking();
    } catch (e) {
      console.error("Cancel failed", e);
      toast.error("Failed to cancel booking");
    } finally {
      setCancelSaving(false);
    }
  };

  // ── Add Agent Reference ───────────────────────────────────────────
  const openAgentRefModal = async () => {
    if (!data) return;
    setAgentRefInput("");
    setAgentRefError("");
    setShowAgentRefModal(true);
    try {
      const res = await axiosInstance.get(
        `/api/meet-and-space/booking/${data.id}/agent-reference`,
      );
      if (res?.data?.agentReference) setAgentRefInput(res.data.agentReference);
    } catch (e) {
      console.warn("Could not prefill agent reference:", e?.message);
    }
  };

  const saveAgentReference = async () => {
    if (!data) return;
    const value = (agentRefInput || "").trim();
    if (!value) {
      setAgentRefError("Agent Reference is required");
      return;
    }
    setAgentRefError("");
    try {
      setAgentRefSaving(true);
      await axiosInstance.post(
        `/api/meet-and-space/booking/${data.id}/agent-reference`,
        { agentReference: value },
      );
      setShowAgentRefModal(false);
      toast.success("Agent Reference saved successfully");
      await fetchBooking();
    } catch (e) {
      toast.error(
        e?.response?.data?.message || "Failed to save Agent Reference",
      );
    } finally {
      setAgentRefSaving(false);
    }
  };

  // ── Confirmation No. ──────────────────────────────────────────────
  const openConfNoModal = async () => {
    if (!data) return;
    setConfNoInput("");
    setConfNoError("");
    setShowConfNoModal(true);
    try {
      const res = await axiosInstance.get(
        `/api/meet-and-space/booking/${data.id}/agent-reference`,
      );
      if (res?.data?.confirmationNumber) {
        setConfNoInput(res.data.confirmationNumber);
      }
    } catch (e) {
      console.warn("Could not prefill confirmation number:", e?.message);
    }
  };

  const saveConfirmationNo = async () => {
    if (!data) return;
    const value = (confNoInput || "").trim();
    if (!value) {
      setConfNoError("Confirmation Number is required");
      return;
    }
    setConfNoError("");
    try {
      setConfNoSaving(true);
      await axiosInstance.post(
        `/api/meet-and-space/booking/${data.id}/confirmation-number`,
        { confirmationNumber: value },
      );
      setShowConfNoModal(false);
      toast.success("Confirmation number saved successfully!");
      await fetchBooking();
    } catch (e) {
      toast.error(
        e?.response?.data?.message || "Failed to save confirmation number",
      );
    } finally {
      setConfNoSaving(false);
    }
  };

  // ── Booking Remark ────────────────────────────────────────────────
  const openRemarkModal = () => {
    setRemarkInput(data?.bookingRemark || "");
    setShowRemarkModal(true);
  };

  const saveBookingRemark = async () => {
    if (!data) return;
    const text = (remarkInput || "").trim();
    if (!text) {
      toast.error("Remark cannot be empty");
      return;
    }
    try {
      setRemarkSaving(true);
      await axiosInstance.post(
        `/api/meet-and-space/booking/${data.id}/remark`,
        { remarks: text },
      );
      setShowRemarkModal(false);
      toast.success("Remark saved successfully");
      await fetchBooking();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Failed to save remark");
    } finally {
      setRemarkSaving(false);
    }
  };

  // ── Notes ──────────────────────────────────────────────────────────
  const fetchNotes = async () => {
    if (!data) return;
    setNotesLoading(true);
    try {
      const res = await axiosInstance.get(
        `/api/meet-and-space/booking/${data.id}/notes`,
      );
      setNotes(res?.data?.notes || []);
    } catch (e) {
      console.warn("Could not load notes:", e?.message);
    } finally {
      setNotesLoading(false);
    }
  };

  const openNotesModal = () => {
    setNoteInput("");
    setShowNotesModal(true);
    fetchNotes();
  };

  const saveNote = async () => {
    if (!data) return;
    const text = (noteInput || "").trim();
    if (!text) {
      toast.error("Note cannot be empty");
      return;
    }
    try {
      setNoteSaving(true);
      const createdBy =
        sessionStorage.getItem("UserName") ||
        "unknown";
      const res = await axiosInstance.post(
        `/api/meet-and-space/booking/${data.id}/notes`,
        { noteText: text, createdBy },
      );
      if (res.data?.success !== false) {
        toast.success(res.data?.message || "Note saved");
        setNoteInput("");
        await fetchNotes();
      } else {
        toast.error(res.data?.message || "Failed to save note");
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || "Failed to save note");
    } finally {
      setNoteSaving(false);
    }
  };

  // ── Resend Mail to Agent ──────────────────────────────────────────
  const resendMail = async () => {
    if (!data) return;
    try {
      setResendingMail(true);
      const res = await axiosInstance.post(
        `/api/meet-and-space/booking/${data.id}/resend-mail`,
      );
      toast.success(res?.data?.message || "Mail resent to agent successfully!");
    } catch (e) {
      toast.error(e?.response?.data?.message || "Failed to resend mail to agent");
    } finally {
      setResendingMail(false);
    }
  };

  const isCancelled = data?.bookingStatus === "Cancelled";

  // History timeline — derived from fields already on the booking response,
  // same pattern BookingDetailedView uses (see its bookingHistory useMemo).
  // Meet & Space bookings go straight to "Confirmed" at creation and have
  // no separate Confirm/Reconfirm step, so only Created + Cancelled apply.
  const bookingHistory = data
    ? [
        data.createdDate && { action: "Booking Created", at: data.createdDate },
        isCancelled &&
          data.cancelledAt && { action: "Booking Cancelled", at: data.cancelledAt },
      ].filter(Boolean)
    : [];

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4" style={{ overflow: "auto" }}>
          <Container fluid style={{ maxWidth: "1100px" }}>
            {/* Back button + page title — matches BookingDetailedView so the
                two pages read identically at a glance. */}
            <div className="mb-3">
              <button style={BTN_NEUTRAL} onClick={() => navigate(-1)}>
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
                <Spinner animation="border" />
                <p className="mt-3 text-muted">Loading booking details...</p>
              </div>
            ) : !data ? (
              <div className="text-center py-5 text-muted">
                Booking not found.
              </div>
            ) : (
              <>
                {/* ── Booking & Event ─────────────────────────────────── */}
                <SectionCard title="Booking & Event">
                  <Row>
                    <Col md={6}>
                      <InfoRow label="Booking #" value={data.bookingNumber} />
                      <InfoRow label="Space" value={data.meetingSpaceName} />
                      <InfoRow label="Hotel" value={data.hotelName} />
                      <InfoRow label="Date" value={data.bookingDate} />
                      <InfoRow
                        label="Time"
                        value={
                          data.startTime
                            ? `${data.startTime} – ${data.endTime} (${data.durationHours}h)`
                            : "-"
                        }
                      />
                      <InfoRow
                        label="Confirmation No."
                        value={data.confirmationNumber}
                      />
                      <InfoRow
                        label="Agent Reference"
                        value={data.agentReference}
                      />
                    </Col>
                    <Col md={6}>
                      <InfoRow label="Event Type" value={data.eventType} />
                      <InfoRow label="Layout" value={data.layout} />
                      <InfoRow label="Attendees" value={data.attendees} />
                      <InfoRow
                        label="Rate Plan"
                        value={
                          data.ratePlan
                            ? `${data.ratePlan} (${data.rateType})`
                            : "-"
                        }
                      />
                      <InfoRow
                        label="Unit Rate"
                        value={
                          data.unitRate != null
                            ? `${data.currency || ""} ${Number(data.unitRate).toFixed(2)}`
                            : "-"
                        }
                      />
                      <InfoRow
                        label="Status"
                        value={
                          <span
                            style={{
                              color: isCancelled ? "#dc2626" : "#16a34a",
                              fontWeight: 700,
                              fontSize: "0.85rem",
                            }}
                          >
                            {data.bookingStatus || "-"}
                          </span>
                        }
                      />
                    </Col>
                    {data.requestedAmenities && (
                      <Col md={12}>
                        <InfoRow
                          label="Requested Amenities"
                          value={data.requestedAmenities}
                        />
                      </Col>
                    )}
                    {data.additionalRequirements && (
                      <Col md={12}>
                        <InfoRow
                          label="Notes"
                          value={data.additionalRequirements}
                        />
                      </Col>
                    )}
                    {data.bookingRemark && (
                      <Col md={12}>
                        <InfoRow
                          label="Booking Remark"
                          value={data.bookingRemark}
                        />
                      </Col>
                    )}
                  </Row>
                </SectionCard>

                {/* ── Customer ─────────────────────────────────────────── */}
                <SectionCard title="Customer">
                  {data.customer ? (
                    <Row>
                      <Col md={6}>
                        <InfoRow
                          label="Name"
                          value={
                            [
                              data.customer.salutation,
                              data.customer.firstName,
                              data.customer.lastName,
                            ]
                              .filter(Boolean)
                              .join(" ") || "-"
                          }
                        />
                        <InfoRow label="Mobile" value={data.customer.mobile} />
                        <InfoRow label="Email" value={data.customer.email} />
                        <InfoRow
                          label="Company"
                          value={
                            data.customer.companyName
                              ? `${data.customer.companyName}${data.customer.designation ? ` (${data.customer.designation})` : ""}`
                              : "-"
                          }
                        />
                        <InfoRow label="GSTIN" value={data.customer.gstNumber} />
                      </Col>
                      <Col md={6}>
                        <InfoRow
                          label="Address"
                          value={
                            [
                              data.customer.address,
                              data.customer.city,
                              data.customer.state,
                              data.customer.country,
                              data.customer.pincode,
                            ]
                              .filter(Boolean)
                              .join(", ") || "-"
                          }
                        />
                        <InfoRow
                          label="ID"
                          value={
                            [data.customer.idType, data.customer.idNumber]
                              .filter(Boolean)
                              .join(" ") || "-"
                          }
                        />
                        <InfoRow
                          label="Remarks"
                          value={data.customer.remarks}
                        />
                      </Col>
                    </Row>
                  ) : (
                    <em className="small text-muted">No customer record.</em>
                  )}
                </SectionCard>

                {/* ── Payment ──────────────────────────────────────────── */}
                <SectionCard title="Payment">
                  {data.payment ? (
                    <Row>
                      <Col md={6}>
                        <InfoRow
                          label="Mode"
                          value={data.payment.paymentMode}
                        />
                        <InfoRow
                          label="Status"
                          value={data.payment.paymentStatus}
                        />
                        <InfoRow
                          label="Reference"
                          value={data.payment.transactionReference}
                        />
                      </Col>
                      <Col md={6}>
                        <InfoRow
                          label="Amount Paid"
                          value={
                            data.payment.amountPaid != null
                              ? `${data.currency || ""} ${Number(data.payment.amountPaid).toFixed(2)}`
                              : "-"
                          }
                        />
                        <InfoRow
                          label="Balance Due"
                          value={
                            data.payment.balanceDue != null
                              ? `${data.currency || ""} ${Number(data.payment.balanceDue).toFixed(2)}`
                              : "-"
                          }
                        />
                        <InfoRow label="Notes" value={data.payment.notes} />
                      </Col>
                    </Row>
                  ) : (
                    <em className="small text-muted">No payment record.</em>
                  )}
                </SectionCard>

                {/* ── Add-ons ──────────────────────────────────────────── */}
                {data.addons && data.addons.length > 0 && (
                  <div style={CARD_STYLE}>
                    <div style={SECTION_HEADER}>Add-ons</div>
                    <div className="bg-white">
                      <Table size="sm" hover className="mb-0 align-middle">
                        <thead style={{ backgroundColor: "#f8f9fa" }}>
                          <tr>
                            <th>Item</th>
                            <th style={{ width: 80 }}>Qty</th>
                            <th style={{ width: 100 }}>Unit</th>
                            <th style={{ width: 100 }}>Total</th>
                            <th>Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.addons.map((a) => (
                            <tr key={a.id}>
                              <td>{a.addonName}</td>
                              <td>{a.quantity}</td>
                              <td>{Number(a.unitPrice || 0).toFixed(2)}</td>
                              <td>{Number(a.totalPrice || 0).toFixed(2)}</td>
                              <td>{a.remarks}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* ── Price Summary ───────────────────────────────────── */}
                <SectionCard title="Price Summary">
                  <InfoRow
                    label="Sub Total"
                    value={`${data.currency || ""} ${Number(data.subTotal || 0).toFixed(2)}`}
                  />
                  <InfoRow
                    label="Add-ons"
                    value={Number(data.addonTotal || 0).toFixed(2)}
                  />
                  <InfoRow
                    label={`Tax (${data.taxPercent || 0}%)`}
                    value={`${data.currency || ""} ${Number(data.taxAmount || 0).toFixed(2)}`}
                  />
                  <InfoRow
                    label="Discount"
                    value={Number(data.discountAmount || 0).toFixed(2)}
                  />
                  <div
                    style={{
                      marginTop: "8px",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{ ...INFO_LABEL, fontSize: "0.9rem", color: "#222" }}
                    >
                      Total
                    </span>
                    <span
                      style={{
                        marginLeft: "8px",
                        color: "#16a34a",
                        fontWeight: 700,
                        fontSize: "1rem",
                      }}
                    >
                      {data.currency || ""}{" "}
                      {Number(data.totalAmount || 0).toFixed(2)}
                    </span>
                  </div>
                </SectionCard>

                {/* ── Cancellation ────────────────────────────────────── */}
                {isCancelled && (
                  <SectionCard title="Cancellation">
                    <InfoRow label="Reason" value={data.cancellationReason} />
                    <InfoRow
                      label="Cancelled At"
                      value={data.cancelledAt}
                    />
                  </SectionCard>
                )}

                {/* ── Action bar — same bottom slot AND same button set the
                    hotel detail page uses, scaled to what Meet & Space
                    actually supports (no On-Request chain, no cross-type
                    "Add New Item" amendment). */}
                <div
                  style={{
                    marginBottom: "10px",
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                  }}
                >
                  {!isCancelled && (
                    <button
                      style={BTN_PRIMARY}
                      onClick={() =>
                        navigate(
                          `/booking-details/meet-and-space-booking-list/${data.id}/edit`,
                        )
                      }
                      title="Edit Booking"
                    >
                      <FaEdit style={{ marginRight: "6px" }} />
                      EDIT
                    </button>
                  )}
                  {!isCancelled && (
                    <button
                      style={BTN_DANGER}
                      onClick={openCancel}
                      title="Cancel Booking"
                    >
                      <FaTrashAlt style={{ marginRight: "6px" }} />
                      CANCEL
                    </button>
                  )}
                  <button
                    style={BTN_INFO}
                    onClick={openVoucher}
                    title="Voucher / Confirmation"
                  >
                    <FaEnvelope style={{ marginRight: "6px" }} />
                    VOUCHER
                  </button>
                  <button style={BTN_INFO} onClick={openInvoice} title="Invoice">
                    INVOICE
                  </button>
                  {!isCancelled && (
                    <button
                      style={BTN_SKY}
                      onClick={openAgentRefModal}
                      title="Add Agent Reference"
                    >
                      ADD AGENT REFERENCE
                    </button>
                  )}
                  {!isCancelled && (
                    <button
                      style={BTN_INDIGO}
                      onClick={openConfNoModal}
                      title="Confirmation No."
                    >
                      CONFIRMATION NO.
                    </button>
                  )}
                  <button
                    style={BTN_ORANGE}
                    onClick={resendMail}
                    disabled={resendingMail}
                    title="Resend Mail to Agent"
                  >
                    {resendingMail ? "SENDING..." : "RESEND MAIL TO AGENT"}
                  </button>
                  <button
                    style={BTN_ACCENT}
                    onClick={openRemarkModal}
                    title="Booking Remark"
                  >
                    BOOKING REMARK
                  </button>
                  <button style={BTN_NEUTRAL} onClick={openNotesModal} title="Notes">
                    NOTES
                  </button>
                  <button
                    style={BTN_HISTORY}
                    onClick={() => setShowHistoryModal(true)}
                    title="History"
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
                  Booking Date : {data.bookingDate || "-"}
                </div>
              </>
            )}
          </Container>
        </main>
      </div>

      {/* ── Voucher / Invoice modal — iframe preview + (voucher-only)
          email-send form. There is no dedicated invoice-email endpoint yet,
          so the email panel only shows for the Voucher document. ───── */}
      <Modal
        show={showDocModal}
        onHide={closeDoc}
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
            {docLabel}
            {data?.bookingNumber && (
              <Badge bg="light" text="dark" className="ms-3 fw-semibold border">
                {data.bookingNumber}
              </Badge>
            )}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-3 bg-white">
          {/* Email panel — Voucher only. */}
          {docType === "VOUCHER" && (
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
                        The voucher PDF will be attached and sent to this
                        address.
                      </Form.Text>
                    )}
                  </Col>
                  <Col md={4} className="d-flex flex-column gap-2 mt-md-4">
                    <Button
                      variant="dark"
                      onClick={sendVoucherEmail}
                      disabled={voucherSending || !docPdfUrl}
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
                    {docPdfUrl && (
                      <Button
                        variant="outline-secondary"
                        href={docPdfUrl}
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
          )}

          {/* PDF preview. */}
          <Card className="border shadow-none rounded-3 overflow-hidden">
            <Card.Body className="p-0">
              {docLoading ? (
                <div className="text-center py-5">
                  <Spinner animation="border" />
                  <div className="mt-2 small text-muted">
                    Generating {docLabel.toLowerCase()} PDF…
                  </div>
                </div>
              ) : docPdfUrl ? (
                <>
                  <iframe
                    title={`${docLabel} PDF`}
                    src={docPdfUrl}
                    style={{
                      width: "100%",
                      height: "65vh",
                      border: "none",
                      display: "block",
                    }}
                  />
                  {docType === "INVOICE" && (
                    <div className="p-3 border-top text-end">
                      <Button
                        variant="outline-secondary"
                        href={docPdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open in New Tab
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-muted text-center py-5">
                  No {docLabel.toLowerCase()} available for this booking.
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
            onClick={closeDoc}
            disabled={voucherSending}
          >
            Close
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Cancel modal */}
      <Modal show={showCancel} onHide={() => setShowCancel(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Cancel Booking</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            Cancel booking <strong>{data?.bookingNumber}</strong>?
          </p>
          <Form.Label>Reason</Form.Label>
          <Form.Control
            as="textarea"
            rows={3}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Optional reason for cancellation"
          />
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowCancel(false)}
            disabled={cancelSaving}
          >
            Keep Booking
          </Button>
          <Button
            variant="danger"
            onClick={handleCancelSubmit}
            disabled={cancelSaving}
          >
            {cancelSaving ? (
              <>
                <Spinner size="sm" animation="border" /> Cancelling...
              </>
            ) : (
              "Confirm Cancellation"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Add Agent Reference modal */}
      <Modal show={showAgentRefModal} onHide={() => setShowAgentRefModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Add Agent Reference</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Label>
            Agent Reference <span className="text-danger">*</span>
          </Form.Label>
          <Form.Control
            type="text"
            value={agentRefInput}
            onChange={(e) => {
              setAgentRefInput(e.target.value);
              if (agentRefError) setAgentRefError("");
            }}
            isInvalid={!!agentRefError}
            placeholder="Enter agent reference / LPO number"
            disabled={agentRefSaving}
          />
          {agentRefError && (
            <div className="invalid-feedback d-block">{agentRefError}</div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowAgentRefModal(false)}
            disabled={agentRefSaving}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={saveAgentReference}
            disabled={agentRefSaving}
          >
            {agentRefSaving ? (
              <>
                <Spinner size="sm" animation="border" /> Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Confirmation No. modal */}
      <Modal show={showConfNoModal} onHide={() => setShowConfNoModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Confirmation No.</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Label>
            Confirmation Number <span className="text-danger">*</span>
          </Form.Label>
          <Form.Control
            type="text"
            value={confNoInput}
            onChange={(e) => {
              setConfNoInput(e.target.value);
              if (confNoError) setConfNoError("");
            }}
            isInvalid={!!confNoError}
            placeholder="Enter supplier confirmation number"
            disabled={confNoSaving}
          />
          {confNoError && (
            <div className="invalid-feedback d-block">{confNoError}</div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowConfNoModal(false)}
            disabled={confNoSaving}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={saveConfirmationNo}
            disabled={confNoSaving}
          >
            {confNoSaving ? (
              <>
                <Spinner size="sm" animation="border" /> Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Booking Remark modal */}
      <Modal show={showRemarkModal} onHide={() => setShowRemarkModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Booking Remark</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Label>Remark</Form.Label>
          <Form.Control
            as="textarea"
            rows={4}
            value={remarkInput}
            onChange={(e) => setRemarkInput(e.target.value)}
            placeholder="Enter a remark for this booking"
            disabled={remarkSaving}
          />
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowRemarkModal(false)}
            disabled={remarkSaving}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={saveBookingRemark}
            disabled={remarkSaving}
          >
            {remarkSaving ? (
              <>
                <Spinner size="sm" animation="border" /> Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Notes modal — existing notes (newest first) + add-note form */}
      <Modal show={showNotesModal} onHide={() => setShowNotesModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Notes</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {notesLoading ? (
            <div className="text-center py-3">
              <Spinner animation="border" size="sm" />
            </div>
          ) : notes.length === 0 ? (
            <div className="text-muted small mb-3">No notes yet.</div>
          ) : (
            <div className="mb-3" style={{ maxHeight: "260px", overflowY: "auto" }}>
              {notes.map((n) => (
                <div
                  key={n.noteId}
                  className="border rounded-3 p-2 mb-2"
                  style={{ backgroundColor: "#f8f9fa" }}
                >
                  <div style={{ fontSize: "0.85rem", color: "#222" }}>
                    {n.noteText}
                  </div>
                  <div className="text-muted" style={{ fontSize: "0.72rem" }}>
                    {n.createdBy || "unknown"} · {n.createdAt}
                  </div>
                </div>
              ))}
            </div>
          )}
          <Form.Label>Add Note</Form.Label>
          <Form.Control
            as="textarea"
            rows={3}
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            placeholder="Type a note..."
            disabled={noteSaving}
          />
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowNotesModal(false)}
            disabled={noteSaving}
          >
            Close
          </Button>
          <Button variant="primary" onClick={saveNote} disabled={noteSaving}>
            {noteSaving ? (
              <>
                <Spinner size="sm" animation="border" /> Saving...
              </>
            ) : (
              "Add Note"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* History modal — Created / Cancelled timeline */}
      <Modal show={showHistoryModal} onHide={() => setShowHistoryModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Booking History</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {bookingHistory.length === 0 ? (
            <div className="text-muted small">No history available.</div>
          ) : (
            <Table size="sm" className="mb-0">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>At</th>
                </tr>
              </thead>
              <tbody>
                {bookingHistory.map((ev, i) => (
                  <tr key={i}>
                    <td>{ev.action}</td>
                    <td>{ev.at}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowHistoryModal(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
