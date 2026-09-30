import React, { useEffect, useState, useCallback } from "react";
import {
  Container,
  Card,
  Table,
  Button,
  Spinner,
  Pagination,
  Form,
  InputGroup,  
  Modal, 
  Row,
  Col,
} from "react-bootstrap";
import { FaEye, FaTimesCircle, FaSearch, FaSpa, FaUserMd, FaBookOpen, FaTrashAlt, FaArrowLeft } from "react-icons/fa";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import "../../styles/Ayurveda.css";
import DashboardRedirections from "../../components/DashboardRedirections";

const AYURVEDA_API = "/api/v1/ayurveda";
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const formatDate = (d) => {
  if (!d) return "-";
  const dt = new Date(d);
  if (isNaN(dt)) return typeof d === "string" ? d.slice(0, 10) : "-";
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};
const formatAmount = (a) => (a != null ? `₹${Number(a).toFixed(2)}` : "-");

const typeIcon = (type) => {
  if (type === "PACKAGE") return <FaSpa className="me-1" />;
  if (type === "CONSULTATION") return <FaUserMd className="me-1" />;
  if (type === "COURSE") return <FaBookOpen className="me-1" />;
  return null;
};

const STATUS_META = {
  CONFIRMED: { label: "Confirmed", bg: "#e7f6ec", color: "#1b7f3a", dot: "#22c55e" },
  COMPLETED: { label: "Completed", bg: "#eff8ff", color: "#175cd3", dot: "#3b82f6" },
  PENDING:   { label: "Pending",   bg: "#fff7e6", color: "#b76e00", dot: "#f59e0b" },
  CANCELLED: { label: "Cancelled", bg: "#fdecec", color: "#b42318", dot: "#ef4444" },
  Cancelled: { label: "Cancelled", bg: "#fdecec", color: "#b42318", dot: "#ef4444" },
};

const PAYMENT_META = {
  PAID:      { label: "Paid",     bg: "#e7f6ec", color: "#1b7f3a", dot: "#22c55e" },
  PENDING:   { label: "Pending",  bg: "#fff7e6", color: "#b76e00", dot: "#f59e0b" },
  FAILED:    { label: "Failed",   bg: "#fdecec", color: "#b42318", dot: "#ef4444" },
  REFUNDED:  { label: "Refunded", bg: "#eff8ff", color: "#175cd3", dot: "#3b82f6" },
  UNPAID:    { label: "Unpaid",   bg: "#f3f4f6", color: "#475467" },
};

const TYPE_META = {
  PACKAGE:      { bg: "#f0f9ff", color: "#0369a1" },
  CONSULTATION: { bg: "#faf5ff", color: "#7e22ce" },
  COURSE:       { bg: "#fff7ed", color: "#c2410c" },
};

const StatusPill = ({ meta, raw }) => {
  if (!meta) return <span className="text-muted">{raw || "-"}</span>;
  return (
    <span
      className="d-inline-flex align-items-center gap-1 px-2 py-1 rounded-pill"
      style={{
        backgroundColor: meta.bg,
        color: meta.color,
        fontSize: "0.7rem",
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {meta.dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: meta.dot,
            display: "inline-block",
          }}
        />
      )}
      {meta.label}
    </span>
  );
};

const AyurvedaBookingList = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  // Booking-type filter: upcoming / completed / cancelled. Filtered
  // client-side against isCancelled + endDate so we don't need a new
  // backend endpoint (mirrors SeniorCitizenBookingList).
  const [bookingType, setBookingType] = useState("upcoming");

  // Modals
  const [detailsBooking, setDetailsBooking] = useState(null);
  const [cancelBooking, setCancelBooking] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosInstance.get(`${AYURVEDA_API}/bookings`, {
        params: { page, size },
      });
      const data = res.data || {};
      setBookings(Array.isArray(data.content) ? data.content : []);
      setTotalPages(data.totalPages || 0);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load bookings");
    } finally {
      setLoading(false);
    }
  }, [page, size]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = bookings.filter((b) => {
    if (filterType && b.bookingType !== filterType) return false;
    // Booking-type filter (Upcoming / Completed / Cancelled).
    if (bookingType === "cancelled") {
      if (!b.isCancelled) return false;
    } else {
      if (b.isCancelled) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const ref = b.endDate || b.startDate;
      const refDate = ref ? new Date(ref) : null;
      if (refDate && !isNaN(refDate.getTime())) {
        refDate.setHours(0, 0, 0, 0);
        if (bookingType === "completed" && refDate >= today) return false;
        if (bookingType === "upcoming" && refDate < today) return false;
      }
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = [
        b.bookingReference,
        b.packageName,
        b.doctorName,
        b.courseName,
        b.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const submitCancel = async () => {
    if (!cancelBooking) return;
    setCancelling(true);
    try {
      await axiosInstance.post(
        `${AYURVEDA_API}/bookings/${cancelBooking.id}/cancel`,
        { reason: cancelReason || "Cancelled by user" }
      );
      toast.success("Booking cancelled");
      setCancelBooking(null);
      setCancelReason("");
      load();
    } catch (e) {
      console.error(e);
      toast.error("Cancel failed");
    } finally {
      setCancelling(false);
    }
  };

  const totalElements =
    bookings.length === 0
      ? 0
      : totalPages > 1
        ? totalPages * size
        : filtered.length;
  const displayStart = filtered.length === 0 ? 0 : page * size + 1;
  const displayEnd = page * size + filtered.length;

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main
          className="flex-grow-1 p-3"
          style={{ width: "100%", overflow: "hidden" }}
        >
          <Container
            fluid
            style={{
              maxWidth: "100%",
              paddingLeft: "0.5rem",
              paddingRight: "0.5rem",
            }}
          >
            {/* Back to the signed-in user's dashboard — top-left, above the header row */}
            <div className="mb-3">
              <Button
                variant="outline-secondary"
                onClick={() => DashboardRedirections((localStorage.getItem("currentActiveRole") || "").trim().toUpperCase(), navigate)}
                className="d-inline-flex align-items-center gap-2 rounded-pill px-3 py-2"
              >
                <FaArrowLeft />
                Back
              </Button>
            </div>

            <div className="d-flex justify-content-between align-items-center mb-4">
              <h5 className="mb-0 text-dark fw-semibold">Ayurveda Booking</h5>
            </div>

            {/* List of Bookings Section */}
            <Card
              className="border mb-3 shadow-sm"
              style={{ borderRadius: "6px" }}
            >
              <Card.Header
                className="d-flex justify-content-between align-items-center text-dark border-bottom py-2"
                style={{
                  borderRadius: "6px 6px 0 0",
                  backgroundColor: "#f8f9fa",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                }}
              >
                <span>List of Bookings</span>
              </Card.Header>
              <Card.Body style={{ padding: "1.5rem 1rem 1rem" }}>
                {/* Compact toolbar: filter pills + type select + search */}
                <div className="d-flex flex-wrap justify-content-between align-items-center gap-2" style={{ marginBottom: "1.5rem" }}>
                  <div className="d-inline-flex p-1 rounded" style={{ backgroundColor: "#f3f4f6" }}>
                    {[
                      { value: "upcoming", label: "Upcoming" },
                      { value: "completed", label: "Completed" },
                      { value: "cancelled", label: "Cancelled" },
                    ].map((opt) => {
                      const active = bookingType === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setBookingType(opt.value);
                            setPage(0);
                          }}
                          className="border-0 px-3 py-1"
                          style={{
                            backgroundColor: active ? "#ffffff" : "transparent",
                            color: active ? "#101828" : "#667085",
                            fontSize: "0.78rem",
                            fontWeight: active ? 600 : 500,
                            borderRadius: "6px",
                            boxShadow: active ? "0 1px 2px rgba(16,24,40,0.08)" : "none",
                            transition: "all 0.15s",
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="d-flex align-items-center gap-2 hm-toolbar-right">
                    <Form.Select
                      size="sm"
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      style={{ width: "auto", fontSize: "0.8rem" }}
                    >
                      <option value="">All Types</option>
                      <option value="PACKAGE">Package</option>
                      <option value="CONSULTATION">Consultation</option>
                      <option value="COURSE">Course</option>
                    </Form.Select>
                    <Form.Select
                      value={size}
                      onChange={(e) => {
                        setSize(Number(e.target.value));
                        setPage(0);
                      }}
                      size="sm"
                      style={{ width: "auto", fontSize: "0.8rem" }}
                    >
                      {PAGE_SIZE_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s} / page
                        </option>
                      ))}
                    </Form.Select>
                    <InputGroup size="sm" className="hm-search" style={{ width: "240px" }}>
                      <InputGroup.Text
                        style={{
                          fontSize: "0.75rem",
                          backgroundColor: "#ffffff",
                          borderRight: "none",
                          color: "#98a2b3",
                        }}
                      >
                        <FaSearch />
                      </InputGroup.Text>
                      <Form.Control
                        type="text"
                        placeholder="Search bookings..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ fontSize: "0.8rem", borderLeft: "none" }}
                      />
                    </InputGroup>
                  </div>
                </div>

                {/* Table */}
                {loading ? (
                  <div className="text-center py-5">
                    <Spinner animation="border" variant="primary" />
                    <p className="mt-3 text-muted">Loading bookings...</p>
                  </div>
                ) : (
                  <>
                    <div className="table-responsive saas-table-wrap">
                      <Table hover className="mb-0 align-middle saas-table">
                        <thead>
                          <tr>
                            <th style={{ width: "48px" }}>#</th>
                            <th>Reference</th>
                            <th>Type</th>
                            <th>Item</th>
                            <th>Booked</th>
                            <th>Period</th>
                            <th className="text-center">Pax</th>
                            <th className="text-end">Total</th>
                            <th>Status</th>
                            <th>Payment</th>
                            <th className="text-center" style={{ width: "100px" }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.length > 0 ? (
                            filtered.map((b, idx) => {
                              const sMeta = STATUS_META[b.status];
                              const pMeta = PAYMENT_META[b.paymentStatus];
                              const tMeta = TYPE_META[b.bookingType] || { bg: "#f3f4f6", color: "#475467" };
                              return (
                                <tr key={b.id}>
                                  <td className="text-muted">{idx + 1 + page * size}</td>
                                  <td>
                                    <span className="fw-semibold text-dark">
                                      {b.bookingReference || "-"}
                                    </span>
                                  </td>
                                  <td>
                                    <span
                                      className="d-inline-flex align-items-center px-2 py-1 rounded"
                                      style={{
                                        backgroundColor: tMeta.bg,
                                        color: tMeta.color,
                                        fontSize: "0.7rem",
                                        fontWeight: 600,
                                      }}
                                    >
                                      {typeIcon(b.bookingType)}
                                      {b.bookingType || "-"}
                                    </span>
                                  </td>
                                  <td>
                                    {b.packageName ||
                                      b.doctorName ||
                                      b.courseName ||
                                      "-"}
                                  </td>
                                  <td style={{ whiteSpace: "nowrap" }}>
                                    {formatDate(b.bookingDate)}
                                  </td>
                                  <td style={{ whiteSpace: "nowrap" }}>
                                    <div>{formatDate(b.startDate)}</div>
                                    <div className="text-muted" style={{ fontSize: "0.7rem" }}>
                                      → {formatDate(b.endDate)}
                                    </div>
                                  </td>
                                  <td className="text-center">
                                    {b.numberOfParticipants ?? "-"}
                                  </td>
                                  <td className="text-end" style={{ whiteSpace: "nowrap" }}>
                                    <span className="fw-semibold text-dark">
                                      {formatAmount(b.totalPrice)}
                                    </span>
                                  </td>
                                  <td>
                                    <StatusPill meta={sMeta} raw={b.status} />
                                  </td>
                                  <td>
                                    <StatusPill meta={pMeta} raw={b.paymentStatus} />
                                  </td>
                                  <td className="text-center">
                                    <div className="d-flex justify-content-center gap-1">
                                      <button
                                        type="button"
                                        className="btn btn-sm border-0 p-1"
                                        style={{
                                          backgroundColor: "#eff6ff",
                                          color: "#1d4ed8",
                                          borderRadius: "6px",
                                        }}
                                        onClick={() => setDetailsBooking(b)}
                                        title="View details"
                                      >
                                        <FaEye style={{ fontSize: "12px" }} />
                                      </button>
                                      {!b.isCancelled && (
                                        <button
                                          type="button"
                                          className="btn btn-sm border-0 p-1"
                                          style={{
                                            backgroundColor: "#fef2f2",
                                            color: "#b42318",
                                            borderRadius: "6px",
                                          }}
                                          onClick={() => setCancelBooking(b)}
                                          title="Cancel booking"
                                        >
                                          <FaTrashAlt style={{ fontSize: "12px" }} />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td
                                colSpan={11}
                                className="text-center py-5 text-muted"
                              >
                                No bookings found
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </Table>
                    </div>

                    <style>{`
                      .saas-table-wrap { border: 1px solid #eaecf0; border-radius: 8px; overflow-x: auto; }
                      .saas-table { font-size: 0.8rem; margin-bottom: 0; }
                      .saas-table thead th {
                        background-color: #f9fafb;
                        color: #667085;
                        font-size: 0.68rem;
                        font-weight: 600;
                        text-transform: uppercase;
                        letter-spacing: 0.04em;
                        border-bottom: 1px solid #eaecf0;
                        border-top: none;
                        padding: 0.65rem 0.75rem;
                        white-space: nowrap;
                      }
                      .saas-table tbody td {
                        padding: 0.65rem 0.75rem;
                        border-top: 1px solid #f2f4f7;
                        vertical-align: middle;
                        color: #344054;
                      }
                      .saas-table tbody tr:first-child td { border-top: none; }
                      .saas-table tbody tr:hover { background-color: #fafbfc; }
                      /* Mobile: keep the 11-column table readable by letting it
                         scroll horizontally inside its wrapper instead of
                         crushing columns, and let the search box fill the row. */
                      @media (max-width: 768px) {
                        .saas-table { min-width: 860px; }
                        .hm-toolbar-right { width: 100%; }
                        .hm-search { width: 100% !important; flex: 1 1 auto; }
                      }
                    `}</style>

                    {/* Pagination */}
                    <div className="d-flex justify-content-between align-items-center mt-3">
                      <div className="text-muted small">
                        Showing {displayStart} to {displayEnd} of {totalElements}{" "}
                        entries
                      </div>
                      {totalPages > 1 && (
                        <Pagination className="mb-0">
                          <Pagination.Prev
                            disabled={page === 0}
                            onClick={() =>
                              setPage((p) => Math.max(0, p - 1))
                            }
                          />
                          {Array.from(
                            { length: Math.min(5, totalPages) },
                            (_, i) => {
                              let pageNum;
                              if (totalPages <= 5) {
                                pageNum = i;
                              } else if (page <= 2) {
                                pageNum = i;
                              } else if (page >= totalPages - 3) {
                                pageNum = totalPages - 5 + i;
                              } else {
                                pageNum = page - 2 + i;
                              }
                              return (
                                <Pagination.Item
                                  key={pageNum}
                                  active={pageNum === page}
                                  onClick={() => setPage(pageNum)}
                                >
                                  {pageNum + 1}
                                </Pagination.Item>
                              );
                            },
                          )}
                          <Pagination.Next
                            disabled={page + 1 >= totalPages}
                            onClick={() => setPage((p) => p + 1)}
                          />
                        </Pagination>
                      )}
                    </div>
                  </>
                )}
              </Card.Body>
            </Card>
          </Container>
        </main>
      </div>

      {/* Details Modal */}
      <Modal
        show={!!detailsBooking}
        onHide={() => setDetailsBooking(null)}
        centered
        size="lg"
      >
        <Modal.Header closeButton>
          <Modal.Title>Booking Details</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {detailsBooking && (
            <Row className="g-2">
              <Col md={6}>
                <strong>Reference:</strong> {detailsBooking.bookingReference}
              </Col>
              <Col md={6}>
                <strong>Type:</strong> {detailsBooking.bookingType}
              </Col>
              <Col md={6}>
                <strong>Status:</strong> {detailsBooking.status}
              </Col>
              <Col md={6}>
                <strong>Payment:</strong> {detailsBooking.paymentStatus}
              </Col>
              <Col md={6}>
                <strong>Booking Date:</strong>{" "}
                {formatDate(detailsBooking.bookingDate)}
              </Col>
              <Col md={6}>
                <strong>Participants:</strong>{" "}
                {detailsBooking.numberOfParticipants}
              </Col>
              <Col md={6}>
                <strong>Start Date:</strong>{" "}
                {formatDate(detailsBooking.startDate)}
              </Col>
              <Col md={6}>
                <strong>End Date:</strong> {formatDate(detailsBooking.endDate)}
              </Col>
              {detailsBooking.packageName && (
                <Col md={12}>
                  <strong>Package:</strong> {detailsBooking.packageName}
                </Col>
              )}
              {detailsBooking.doctorName && (
                <Col md={12}>
                  <strong>Doctor:</strong> {detailsBooking.doctorName}
                </Col>
              )}
              {detailsBooking.courseName && (
                <Col md={12}>
                  <strong>Course:</strong> {detailsBooking.courseName}
                </Col>
              )}
              {detailsBooking.symptoms && (
                <Col md={12}>
                  <strong>Symptoms:</strong> {detailsBooking.symptoms}
                </Col>
              )}
              {detailsBooking.previousExperience && (
                <Col md={12}>
                  <strong>Previous Experience:</strong>{" "}
                  {detailsBooking.previousExperience}
                </Col>
              )}
              {detailsBooking.specialRequests && (
                <Col md={12}>
                  <strong>Special Requests:</strong>{" "}
                  {detailsBooking.specialRequests}
                </Col>
              )}
              <Col md={12}>
                <strong>Total:</strong> {formatAmount(detailsBooking.totalPrice)}
              </Col>
              {detailsBooking.isCancelled && (
                <Col md={12}>
                  <strong>Cancelled on:</strong>{" "}
                  {formatDate(detailsBooking.cancelledDate)} —{" "}
                  {detailsBooking.cancellationReason}
                </Col>
              )}
            </Row>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setDetailsBooking(null)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Cancel Modal */}
      <Modal
        show={!!cancelBooking}
        onHide={() => setCancelBooking(null)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Cancel Booking</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {cancelBooking && (
            <>
              <p>
                Are you sure you want to cancel booking{" "}
                <strong>{cancelBooking.bookingReference}</strong>?
              </p>
              <Form.Group>
                <Form.Label>Reason</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
              </Form.Group>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setCancelBooking(null)} disabled={cancelling}>
            Close
          </Button>
          <Button variant="danger" onClick={submitCancel} disabled={cancelling}>
            {cancelling ? <Spinner size="sm" animation="border" /> : "Confirm Cancel"}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default AyurvedaBookingList;
