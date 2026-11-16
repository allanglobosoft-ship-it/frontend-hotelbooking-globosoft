/**
 * LastMinuteBookingDetailView.jsx
 *
 * Full-page detail view for a single Last Minute booking. Replaces the
 * modal-based "View" that used to live in LastMinuteBookingList. The
 * Voucher / Invoice / Cancel row icons now sit at the bottom-left of this
 * page as buttons. All endpoints / behaviour are unchanged:
 *   - Detail fetch :  GET    /api/last-minute-booking/{id}
 *   - Voucher PDF  :  GET    /api/last-minute-booking/{id}/voucher
 *                     → { status: "SUCCESS", pdfUrl } — opened in a new tab
 *   - Invoice page :  window.open(`/invoice?bookingId={id}`, "_blank")
 *   - Cancel       :  PATCH  /api/last-minute-booking/{id}/cancel  { reason }
 *
 * The list row is forwarded via location.state.booking so the page has a
 * booking-code header even before the detail fetch resolves. On hard
 * refresh the route id alone drives the fetch.
 */
import React, { useEffect, useState } from "react";
import {
  Container,
  Row,
  Col,
  Card,
  Table,
  Badge,
  Spinner,
  Alert,
} from "react-bootstrap";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import {
  FaTrashAlt,
  FaFilePdf,
  FaFileInvoice,
} from "react-icons/fa";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import axiosInstance from "../../components/AxiosInstance";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import RefundBadge from "../../components/RefundBadge";

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

const fmt = (v) => (v == null || v === "" ? "—" : String(v));
const fmtDt = (v) => {
  if (!v) return "—";
  const normalized = String(v).includes("T") ? v : `${v}T00:00:00`;
  return new Date(normalized).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

// Detail body — identical to BookingDetailContent in the original list,
// just rendered top-down on a full page instead of inside a modal.
function BookingDetailBody({ booking: b }) {
  const c = b.customer || {};
  // Render in the currency the booking was made in. The backend persisted the
  // code + converted total (displayAmount = totalRate × factor); derive the
  // factor to convert every AED figure. AED / older bookings → AED, factor 1.
  const _dispCode = b.displayCurrencyCode;
  const _aedTotal = Number(b.totalRate) || 0;
  const _dispAmt = Number(b.displayAmount);
  const isConv =
    _dispCode &&
    _dispCode !== "AED" &&
    Number.isFinite(_dispAmt) &&
    _dispAmt > 0 &&
    _aedTotal > 0;
  const curCode = isConv ? _dispCode : "AED";
  const curFactor = isConv ? _dispAmt / _aedTotal : 1;
  const conv = (aed) => (Number(aed) || 0) * curFactor;
  return (
    <div>
      {b.isCancelled && (
        <Alert variant="danger" className="py-2">
          <strong>Cancelled</strong> at {fmtDt(b.cancelledAt)}
          {b.cancellationReason ? ` — ${b.cancellationReason}` : ""}
        </Alert>
      )}

      <Card className="mb-3">
        <Card.Header
          className="fw-semibold"
          style={{ backgroundColor: "#f1f3f5" }}
        >
          Booking
        </Card.Header>
        <Card.Body>
          <Row>
            <Col md={4}>
              <small className="text-muted d-block">Booking Code</small>
              <strong className="text-primary">{fmt(b.bookingCode)}</strong>
            </Col>
            <Col md={4}>
              <small className="text-muted d-block">Reference No.</small>
              <span>{fmt(b.referenceNumber)}</span>
            </Col>
            <Col md={4}>
              <small className="text-muted d-block">Booking Date</small>
              <span>{fmtDt(b.bookingDate)}</span>
            </Col>
            {/* Contact — "Booking done for" value entered on the booking
                form, shown as "<value>/<agentName>". Only rendered when a
                value was entered. */}
            {b.bookingDoneFor && (
              <Col md={4} className="mt-2">
                <small className="text-muted d-block">Contact</small>
                <span>
                  {b.agentName
                    ? `${b.bookingDoneFor}/${b.agentName}`
                    : b.bookingDoneFor}
                </span>
              </Col>
            )}
          </Row>
        </Card.Body>
      </Card>

      <Card className="mb-3">
        <Card.Header
          className="fw-semibold"
          style={{ backgroundColor: "#f1f3f5" }}
        >
          Hotel
        </Card.Header>
        <Card.Body>
          <Row>
            <Col md={6}>
              <small className="text-muted d-block">Hotel Name</small>
              <span>{fmt(b.hotelName)}</span>
            </Col>
            <Col md={6}>
              <small className="text-muted d-block">Address</small>
              <span>{fmt(b.address)}</span>
            </Col>
            {/* Optional "Booking Done By Employee" — only rendered when
                an employee was picked at search time. Backend returns
                the resolved name in toDetailMap. */}
            {b.employeeName && (
              <Col md={6} className="mt-2">
                <small className="text-muted d-block">Booked By Employee</small>
                <span>{fmt(b.employeeName)}</span>
              </Col>
            )}
          </Row>
        </Card.Body>
      </Card>

      <Card className="mb-3">
        <Card.Header
          className="fw-semibold"
          style={{ backgroundColor: "#f1f3f5" }}
        >
          Stay
        </Card.Header>
        <Card.Body>
          <Row>
            <Col md={3}>
              <small className="text-muted d-block">Check-in</small>
              <span>{fmt(b.checkInDate)}</span>
            </Col>
            <Col md={3}>
              <small className="text-muted d-block">Check-out</small>
              <span>{fmt(b.checkOutDate)}</span>
            </Col>
            <Col md={3}>
              <small className="text-muted d-block">Nights</small>
              <span>{fmt(b.nights)}</span>
            </Col>
            <Col md={3}>
              <small className="text-muted d-block">Total</small>
              <strong>
                {b.totalRate != null
                  ? `${curCode} ${conv(b.totalRate).toFixed(2)}`
                  : "—"}
              </strong>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Card className="mb-3">
        <Card.Header
          className="fw-semibold"
          style={{ backgroundColor: "#f1f3f5" }}
        >
          Primary Guest
        </Card.Header>
        <Card.Body>
          <Row>
            <Col md={6}>
              <small className="text-muted d-block">Name</small>
              <span>
                {[c.salutation, c.firstName, c.middleName, c.lastName]
                  .filter(Boolean)
                  .join(" ") || "—"}
              </span>
            </Col>
            <Col md={3}>
              <small className="text-muted d-block">Email</small>
              <span>{fmt(c.email)}</span>
            </Col>
            <Col md={3}>
              <small className="text-muted d-block">Phone</small>
              <span>{fmt(c.phone)}</span>
            </Col>
            <Col md={3} className="mt-2">
              <small className="text-muted d-block">Passport</small>
              <span>{fmt(c.passportNo)}</span>
            </Col>
            <Col md={3} className="mt-2">
              <small className="text-muted d-block">Nationality</small>
              <span>{fmt(c.nationality)}</span>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Card className="mb-3">
        <Card.Header
          className="fw-semibold"
          style={{ backgroundColor: "#f1f3f5" }}
        >
          Rooms ({b.rooms?.length || 0})
        </Card.Header>
        <Card.Body>
          {b.rooms && b.rooms.length > 0 ? (
            b.rooms.map((r, i) => (
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
                <Table size="sm" bordered className="mb-2">
                  <thead className="table-light">
                    <tr>
                      <th>Category</th>
                      <th>Meal Plan</th>
                      <th>Adults</th>
                      <th>Children</th>
                      <th>Rate</th>
                      <th>Refund</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{fmt(r.roomCategory)}</td>
                      <td>{fmt(r.mealPlan)}</td>
                      <td>{fmt(r.adults)}</td>
                      <td>{fmt(r.children)}</td>
                      <td>
                        {r.rate != null
                          ? `${curCode} ${conv(r.rate).toFixed(2)}`
                          : "—"}
                      </td>
                      <td>
                        <RefundBadge rate={r} />
                      </td>
                    </tr>
                  </tbody>
                </Table>
                {r.guests && r.guests.length > 0 && (
                  <Table size="sm" bordered className="mb-0">
                    <thead className="table-light">
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
                              .join(" ") || "—"}
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
            ))
          ) : (
            <p className="text-muted small mb-0">No rooms on this booking.</p>
          )}
        </Card.Body>
      </Card>

      {b.remarks && (
        <Card className="mb-3">
          <Card.Header
            className="fw-semibold"
            style={{ backgroundColor: "#f1f3f5" }}
          >
            Remarks
          </Card.Header>
          <Card.Body>
            <p className="text-muted mb-0">{b.remarks}</p>
          </Card.Body>
        </Card>
      )}
    </div>
  );
}

export default function LastMinuteBookingDetailView() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const rowStub = location.state?.booking || null;
  const bookingId = rowStub?.bookingId || routeId;

  const [booking, setBooking] = useState(rowStub);
  const [loading, setLoading] = useState(true);

  // Voucher button loading state (PDF is opened in a new tab — no modal).
  const [voucherLoading, setVoucherLoading] = useState(false);

  const fetchDetail = async () => {
    if (!bookingId) {
      toast.error("Booking id missing");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await axiosInstance.get(
        `/api/last-minute-booking/${bookingId}`
      );
      setBooking(res.data);
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to load booking details"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  // ── View Voucher — fetch PDF URL, open in a new tab.
  //    Matches the original list handler verbatim. ─────────────────
  const handleViewVoucher = async () => {
    if (!bookingId) return;
    try {
      setVoucherLoading(true);
      const res = await axiosInstance.get(
        `/api/last-minute-booking/${bookingId}/voucher`
      );
      const status = res.data?.status;
      const url = res.data?.pdfUrl || res.data?.pdfPath;
      if (status === "SUCCESS" && url) {
        window.open(url, "_blank");
      } else {
        toast.error(res.data?.message || "Voucher not available yet.");
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load voucher");
    } finally {
      setVoucherLoading(false);
    }
  };

  // ── View Invoice — opens the existing invoice page in a new tab.
  const handleViewInvoice = () => {
    if (!bookingId) return;
    window.open(`/invoice?bookingId=${bookingId}`, "_blank");
  };

  // ── Cancel — SweetAlert confirm + PATCH /cancel  ────────────────
  //    Identical Swal config to the list, so operators get the same
  //    prompt regardless of which surface they cancel from.
  const handleCancel = async () => {
    if (!bookingId) return;
    const result = await Swal.fire({
      title: "Cancel this booking?",
      text: `Booking ${
        booking?.bookingCode || ""
      } will be marked as cancelled. This sets is_cancelled = true and records the cancellation timestamp.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, cancel it",
      cancelButtonText: "Keep booking",
      input: "textarea",
      inputLabel: "Reason (optional)",
      inputPlaceholder: "Why are you cancelling?",
    });
    if (!result.isConfirmed) return;

    try {
      const res = await axiosInstance.patch(
        `/api/last-minute-booking/${bookingId}/cancel`,
        { reason: result.value || null }
      );
      if (res.data?.success) {
        toast.success("Booking cancelled");
        navigate(-1);
      } else {
        toast.error(res.data?.message || "Cancel failed");
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Cancel failed");
    }
  };

  const isCancelled = !!booking?.isCancelled;

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
                Booking Details
                {(booking?.bookingCode || rowStub?.bookingCode) && (
                  <Badge
                    bg="light"
                    text="dark"
                    className="ms-3 fw-semibold border"
                  >
                    {booking?.bookingCode || rowStub?.bookingCode}
                  </Badge>
                )}
              </span>
            </div>

            {loading && !booking ? (
              <div className="text-center py-5">
                <Spinner animation="border" />
                <p className="mt-2 text-muted small">Loading details…</p>
              </div>
            ) : !booking ? (
              <Alert variant="warning">No data available.</Alert>
            ) : (
              <>
                <BookingDetailBody booking={booking} />

                {/* Bottom action buttons (left-aligned) — mirrors the
                    Voucher / Invoice / Cancel row icons. Cancel hidden
                    when the booking is already cancelled, matching the
                    original list's row-level gating. */}
                <div
                  className="d-flex gap-2 justify-content-start flex-wrap"
                  style={{ marginTop: "16px", marginBottom: "20px" }}
                >
                  <button
                    style={{ ...BUTTON_STYLE, backgroundColor: "#198754" }}
                    onClick={handleViewVoucher}
                    disabled={voucherLoading}
                    title="View Voucher"
                  >
                    {voucherLoading ? (
                      <Spinner
                        size="sm"
                        style={{ width: 12, height: 12, marginRight: 6 }}
                      />
                    ) : (
                      <FaFilePdf style={{ marginRight: "6px" }} />
                    )}
                    Voucher
                  </button>
                  <button
                    style={{ ...BUTTON_STYLE, backgroundColor: "#b76e00" }}
                    onClick={handleViewInvoice}
                    title="View Invoice"
                  >
                    <FaFileInvoice style={{ marginRight: "6px" }} />
                    Invoice
                  </button>
                  {!isCancelled && (
                    <button
                      style={{ ...BUTTON_STYLE, backgroundColor: "#dc3545" }}
                      onClick={handleCancel}
                      title="Cancel booking"
                    >
                      <FaTrashAlt style={{ marginRight: "6px" }} />
                      Cancel
                    </button>
                  )}
                </div>
              </>
            )}
          </Container>
        </main>
      </div>
    </div>
  );
}
