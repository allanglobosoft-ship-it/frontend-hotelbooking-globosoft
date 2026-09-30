import React, { useEffect, useMemo, useState } from "react";
import {
  Card,
  Form,
  Row,
  Col,
  Table,
  Badge,
  InputGroup,
  Spinner,
  Pagination,
  Button,
  Modal,
  Container,
} from "react-bootstrap";
import {
  FaSearch,
  FaSuitcaseRolling,
  FaEye,
  FaTimes,
  FaExclamationTriangle,
  FaFilePdf,
  FaDownload,
} from "react-icons/fa";
import { toast } from "react-hot-toast";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";

const PER_PAGE_OPTIONS = [10, 25, 50, 100];

const STATUS_META = {
  CONFIRMED: { label: "Confirmed", bg: "#e7f6ec", color: "#1b7f3a", dot: "#22c55e" },
  Confirmed: { label: "Confirmed", bg: "#e7f6ec", color: "#1b7f3a", dot: "#22c55e" },
  COMPLETED: { label: "Completed", bg: "#eff8ff", color: "#175cd3", dot: "#3b82f6" },
  Completed: { label: "Completed", bg: "#eff8ff", color: "#175cd3", dot: "#3b82f6" },
  PENDING:   { label: "Pending",   bg: "#fff7e6", color: "#b76e00", dot: "#f59e0b" },
  Pending:   { label: "Pending",   bg: "#fff7e6", color: "#b76e00", dot: "#f59e0b" },
  CANCELLED: { label: "Cancelled", bg: "#fdecec", color: "#b42318", dot: "#ef4444" },
  Cancelled: { label: "Cancelled", bg: "#fdecec", color: "#b42318", dot: "#ef4444" },
};

// Status / Notification text — plain coloured words with no pill background,
// matching the Notification column on /booking-details/24hr-booking-list.
// Each "/"-separated segment is coloured on its own so a compound label like
// "Confirmed / Cancelled" reads green then red. Labels outside the shared
// palette keep their STATUS_META colour.
const statusSegColor = (part, fallback) => {
  const p = (part || "").replace(/\s+/g, "").toLowerCase();
  if (p.startsWith("reconfirmed") || p.startsWith("confirmed")) return "#06a301";
  if (p.includes("cancelled") || p.includes("canceled") || p.startsWith("rejected")) return "#dc3545";
  if (p === "onrequest" || p === "requested" || p === "notconfirmed" || p.startsWith("pending")) return "#e67e22";
  return fallback;
};

const StatusPill = ({ meta, raw }) => {
  if (!meta) return <span className="text-muted">{raw || "-"}</span>;
  const parts = String(meta.label ?? "-").split("/");
  return (
    <span style={{ fontSize: "0.82rem", fontWeight: 600, whiteSpace: "nowrap" }}>
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ color: "#6c757d" }}>/</span>}
          <span style={{ color: statusSegColor(part, meta.color) }}>{part}</span>
        </React.Fragment>
      ))}
    </span>
  );
};

const fmtDate = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d)) return typeof iso === "string" ? iso.slice(0, 10) : "-";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const HoneymoonBookingList = () => {
  const [data, setData] = useState({ content: [], totalElements: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [bookingType, setBookingType] = useState("upcoming");
  const [selected, setSelected] = useState(null);
  const [toCancel, setToCancel] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // ── Voucher modal state ────────────────────────────────────────────
  // Mirrors the meet-and-space voucher flow: click the envelope icon in
  // the actions column → server generates a PDF and returns
  // { status, message, pdfUrl } → the URL is loaded in an inline iframe.
  const [voucherFor, setVoucherFor] = useState(null);
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [voucherPdfUrl, setVoucherPdfUrl] = useState("");

  const openVoucher = async (booking) => {
    setVoucherFor(booking);
    setVoucherLoading(true);
    setVoucherPdfUrl("");
    try {
      const res = await axiosInstance.get(
        `/api/honeymoon/booking/${booking.id}/voucher`
      );
      if (res.data && res.data.status === "SUCCESS" && res.data.pdfUrl) {
        setVoucherPdfUrl(res.data.pdfUrl);
      } else {
        toast.error(res.data?.message || "Failed to generate voucher PDF");
      }
    } catch (e) {
      console.error("Voucher fetch failed", e);
      toast.error(
        e?.response?.data?.message || "Failed to load voucher PDF"
      );
    } finally {
      setVoucherLoading(false);
    }
  };

  const closeVoucher = () => {
    setVoucherFor(null);
    setVoucherPdfUrl("");
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await axiosInstance.get(
        `/api/honeymoon/booking/list?page=${page}&size=${size}&search=${encodeURIComponent(debouncedSearch)}`
      );
      setData(res.data);
    } catch (e) {
      console.error(e);
      setData({ content: [], totalElements: 0, totalPages: 0 });
    } finally {
      setLoading(false);
    }
  };

  // Debounce the search box so we don't fire on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    load();
  }, [page, size, debouncedSearch]); // eslint-disable-line

  // Client-side booking-type filter (Upcoming / Completed / Cancelled)
  // layered over the server page. Matches the convention from the other
  // booking-list pages.
  const filteredContent = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (data.content || []).filter((b) => {
      if (bookingType === "cancelled") return !!b.isCancelled;
      if (b.isCancelled) return false;
      const ref = b.startingDate;
      const refDate = ref ? new Date(ref) : null;
      if (refDate && !isNaN(refDate.getTime())) {
        refDate.setHours(0, 0, 0, 0);
        if (bookingType === "completed" && refDate >= today) return false;
        if (bookingType === "upcoming" && refDate < today) return false;
      }
      return true;
    });
  }, [data.content, bookingType]);

  const handleCancel = async () => {
    if (!toCancel) return;
    setCancelling(true);
    try {
      await axiosInstance.put(`/api/honeymoon/booking/${toCancel.id}/cancel`, {
        reason: cancelReason || "Cancelled by user",
      });
      toast.success("Booking cancelled");
      setToCancel(null);
      setCancelReason("");
      load();
    } catch (e) {
      toast.error("Failed to cancel");
    } finally {
      setCancelling(false);
    }
  };

  const pageNumbers = useMemo(() => {
    if (!data.totalPages) return [];
    const max = data.totalPages;
    const cur = page;
    const arr = [];
    const start = Math.max(0, cur - 2);
    const end = Math.min(max - 1, cur + 2);
    for (let i = start; i <= end; i++) arr.push(i);
    return arr;
  }, [data.totalPages, page]);

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
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h5 className="mb-0 text-dark fw-semibold">
                <FaSuitcaseRolling className="me-2 text-muted" />
                Honeymoon Bookings
              </h5>
              <span
                className="text-muted"
                style={{ fontSize: "0.78rem", fontWeight: 500 }}
              >
                {data.totalElements || 0} total
              </span>
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
                {/* Compact toolbar: filter pills + page size + search */}
                <div
                  className="d-flex flex-wrap justify-content-between align-items-center gap-2"
                  style={{ marginBottom: "1.5rem" }}
                >
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
                      value={size}
                      onChange={(e) => {
                        setSize(Number(e.target.value));
                        setPage(0);
                      }}
                      size="sm"
                      style={{ width: "auto", fontSize: "0.8rem" }}
                    >
                      {PER_PAGE_OPTIONS.map((n) => (
                        <option key={n} value={n}>{n} / page</option>
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
                            <th>Booking</th>
                            <th>Package</th>
                            <th>Start</th>
                            <th className="text-center">Pax / Rooms</th>
                            <th>Customer</th>
                            <th className="text-end">Base</th>
                            <th className="text-end">Markup</th>
                            <th className="text-end">Total</th>
                            <th>Status</th>
                            <th className="text-center" style={{ width: "120px" }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredContent.length === 0 ? (
                            <tr>
                              <td colSpan={11} className="text-center py-5 text-muted">
                                No bookings found
                              </td>
                            </tr>
                          ) : (
                            filteredContent.map((b, i) => {
                              const statusText = b.isCancelled
                                ? "Cancelled"
                                : b.bookingStatus || "Confirmed";
                              const sMeta = STATUS_META[statusText];
                              return (
                                <tr key={b.id}>
                                  <td className="text-muted">{page * size + i + 1}</td>
                                  <td>
                                    <span className="fw-semibold text-dark">
                                      {b.bookingNumber || "-"}
                                    </span>
                                  </td>
                                  <td>
                                    <div className="fw-medium text-dark">
                                      {b.packageName || "-"}
                                    </div>
                                    <div className="text-muted" style={{ fontSize: "0.7rem" }}>
                                      {b.startingFrom} → {b.destination}
                                    </div>
                                  </td>
                                  <td style={{ whiteSpace: "nowrap" }}>
                                    {fmtDate(b.startingDate)}
                                  </td>
                                  <td className="text-center">
                                    <div>{(b.adults || 0) + (b.children || 0)} pax</div>
                                    <div className="text-muted" style={{ fontSize: "0.7rem" }}>
                                      {b.rooms || 0} room{(b.rooms || 0) === 1 ? "" : "s"}
                                    </div>
                                  </td>
                                  <td>
                                    <div className="fw-medium text-dark">
                                      {b.customerName || "-"}
                                    </div>
                                    <div className="text-muted" style={{ fontSize: "0.7rem" }}>
                                      {b.mobile || ""}
                                    </div>
                                  </td>
                                  <td className="text-end" style={{ whiteSpace: "nowrap" }}>
                                    ₹ {Number(b.baseRate || 0).toFixed(2)}
                                  </td>
                                  <td className="text-end" style={{ whiteSpace: "nowrap" }}>
                                    <span
                                      className="px-2 py-1 rounded"
                                      style={{
                                        backgroundColor: "#eff8ff",
                                        color: "#175cd3",
                                        fontSize: "0.7rem",
                                        fontWeight: 600,
                                      }}
                                    >
                                      {Number(b.markupPercent || 0).toFixed(2)}%
                                    </span>
                                    <div className="text-muted" style={{ fontSize: "0.7rem" }}>
                                      +₹ {Number(b.markupAmount || 0).toFixed(2)}
                                    </div>
                                  </td>
                                  <td className="text-end" style={{ whiteSpace: "nowrap" }}>
                                    <span className="fw-semibold text-dark">
                                      ₹ {Number(b.totalAmount || 0).toFixed(2)}
                                    </span>
                                  </td>
                                  <td>
                                    <StatusPill meta={sMeta} raw={statusText} />
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
                                        onClick={() => setSelected(b)}
                                        title="View details"
                                      >
                                        <FaEye style={{ fontSize: "12px" }} />
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-sm border-0 p-1"
                                        style={{
                                          backgroundColor: b.isCancelled ? "#f3f4f6" : "#fef3f2",
                                          color: b.isCancelled ? "#98a2b3" : "#b42318",
                                          borderRadius: "6px",
                                          cursor: b.isCancelled ? "not-allowed" : "pointer",
                                        }}
                                        onClick={() => !b.isCancelled && openVoucher(b)}
                                        disabled={b.isCancelled}
                                        title="Voucher"
                                      >
                                        <FaFilePdf style={{ fontSize: "12px" }} />
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
                                          onClick={() => setToCancel(b)}
                                          title="Cancel booking"
                                        >
                                          <FaTimes style={{ fontSize: "12px" }} />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
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

                    {data.totalPages > 1 && (
                      <div className="d-flex justify-content-between align-items-center mt-3">
                        <div className="text-muted small">
                          Page {page + 1} of {data.totalPages} · {data.totalElements} total
                        </div>
                        <Pagination className="mb-0">
                          <Pagination.First disabled={page === 0} onClick={() => setPage(0)} />
                          <Pagination.Prev disabled={page === 0} onClick={() => setPage((p) => p - 1)} />
                          {pageNumbers.map((n) => (
                            <Pagination.Item key={n} active={n === page} onClick={() => setPage(n)}>
                              {n + 1}
                            </Pagination.Item>
                          ))}
                          <Pagination.Next
                            disabled={page >= data.totalPages - 1}
                            onClick={() => setPage((p) => p + 1)}
                          />
                          <Pagination.Last
                            disabled={page >= data.totalPages - 1}
                            onClick={() => setPage(data.totalPages - 1)}
                          />
                        </Pagination>
                      </div>
                    )}
                  </>
                )}
              </Card.Body>
            </Card>
          </Container>
        </main>
      </div>

      <Modal show={!!selected} onHide={() => setSelected(null)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>Booking Details — {selected?.bookingNumber}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selected && (
            <>
              <Row className="g-2 mb-3">
                <Col md={6}><strong>Package:</strong> {selected.packageName}</Col>
                <Col md={6}><strong>Route:</strong> {selected.startingFrom} → {selected.destination}</Col>
                <Col md={6}><strong>Start Date:</strong> {selected.startingDate}</Col>
                <Col md={6}><strong>Nights:</strong> {selected.noOfNights}</Col>
                <Col md={6}><strong>Rooms:</strong> {selected.rooms}</Col>
                <Col md={6}>
                  <strong>Pax:</strong> {selected.adults} Adults
                  {selected.children
                    ? `, ${selected.children} Children${
                        Array.isArray(selected.childAges) && selected.childAges.length
                          ? ` (ages: ${selected.childAges.join(", ")})`
                          : ""
                      }`
                    : ""}
                </Col>
                <Col md={6}><strong>Customer:</strong> {selected.customerName} ({selected.mobile})</Col>
                <Col md={6}><strong>Email:</strong> {selected.email || "-"}</Col>
                <Col md={6}><strong>Agent:</strong> {selected.agentName || "-"}</Col>
                <Col md={6}>
                  <strong>Status:</strong>{" "}
                  {selected.isCancelled ? (
                    <Badge bg="danger">Cancelled</Badge>
                  ) : (
                    <Badge bg="success">{selected.bookingStatus || "Confirmed"}</Badge>
                  )}
                </Col>
                <Col md={6}><strong>Payment Mode:</strong> {selected.paymentMode || "-"}</Col>
                <Col md={6}><strong>Booked on:</strong> {selected.createdDate}</Col>
                {selected.isCancelled && (
                  <>
                    <Col md={6}><strong>Cancelled at:</strong> {selected.cancelledAt}</Col>
                    <Col md={12}><strong>Cancellation reason:</strong> {selected.cancellationReason || "-"}</Col>
                  </>
                )}
                <Col md={12}><strong>Special Request:</strong> {selected.specialRequest || "-"}</Col>
              </Row>
              <Table size="sm" bordered>
                <tbody>
                  <tr><td>Base Rate (per pax)</td><td className="text-end">₹ {Number(selected.baseRate || 0).toFixed(2)}</td></tr>
                  <tr><td>Markup ({selected.markupPercent || 0}%)</td><td className="text-end">₹ {Number(selected.markupAmount || 0).toFixed(2)}</td></tr>
                  <tr><td>Tax ({selected.taxPercent || 0}%)</td><td className="text-end">₹ {Number(selected.taxAmount || 0).toFixed(2)}</td></tr>
                  <tr className="table-light fw-bold">
                    <td>Grand Total</td>
                    <td className="text-end text-success">₹ {Number(selected.totalAmount || 0).toFixed(2)}</td>
                  </tr>
                </tbody>
              </Table>
            </>
          )}
        </Modal.Body>
      </Modal>

      {/* Voucher modal — backend returns { status, message, pdfUrl };
          the pdfUrl is loaded into an inline iframe so the agent can scroll
          through the voucher without leaving the page. */}
      <Modal
        show={!!voucherFor}
        onHide={closeVoucher}
        size="xl"
        centered
        backdrop="static"
      >
        <Modal.Header closeButton>
          <Modal.Title>
            <FaFilePdf className="text-danger me-2" />
            Voucher — {voucherFor?.bookingNumber}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {voucherLoading ? (
            <div className="text-center py-5">
              <Spinner animation="border" />
              <div className="mt-2 small text-muted">
                Generating voucher PDF…
              </div>
            </div>
          ) : voucherPdfUrl ? (
            <div
              style={{
                border: "1px solid #dee2e6",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "8px 12px",
                  background: "#f8f9fa",
                  fontWeight: 600,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>Voucher PDF Preview</span>
                <a
                  href={voucherPdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-sm btn-outline-primary"
                >
                  <FaDownload className="me-1" /> Open / Download
                </a>
              </div>
              <iframe
                src={voucherPdfUrl}
                title="Honeymoon Voucher"
                width="100%"
                height="560px"
                style={{ border: "none" }}
              />
            </div>
          ) : (
            <div className="text-muted text-center py-4">
              No voucher available for this booking.
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeVoucher}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={!!toCancel} onHide={() => !cancelling && setToCancel(null)} centered>
        <Modal.Header closeButton={!cancelling}>
          <Modal.Title>
            <FaExclamationTriangle className="text-primary me-2" /> Cancel Booking
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Cancel booking <strong>{toCancel?.bookingNumber}</strong>?
          <Form.Group className="mt-3">
            <Form.Label>Reason (optional)</Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" disabled={cancelling} onClick={() => setToCancel(null)}>
            Back
          </Button>
          <Button variant="danger" disabled={cancelling} onClick={handleCancel}>
            {cancelling ? "Cancelling..." : "Confirm Cancel"}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default HoneymoonBookingList;
