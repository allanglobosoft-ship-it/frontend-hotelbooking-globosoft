import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Form,
  InputGroup,
  Modal,
  Pagination,
  Spinner,
  Table,
} from "react-bootstrap";
import {
  FaBan,
  FaEye,
  FaInbox,
  FaPlaneDeparture,
  FaSearch,
  FaSyncAlt,
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";

const PER_PAGE_OPTIONS = [10, 25, 50, 100];

/**
 * Agent-facing list of flight bookings persisted by /api/amadeus/bookFlight.
 *
 * <p>Mirrors the shape of {@code HotelBookingList} but scaled down —
 * client-side search + pagination is enough for a single agent's
 * history. Server-side pagination gets added when volume warrants it.
 */
const FlightBookingList = () => {
  const navigate = useNavigate();

  const [role] = useState(() =>
    sessionStorage.getItem("currentActiveRole")?.toLowerCase() || null,
  );
  const [userId] = useState(() => {
    const stored = sessionStorage.getItem("userId");
    return stored && stored !== "null" ? stored : null;
  });

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);
  const [detailTarget, setDetailTarget] = useState(null);

  // Admin sees every booking; any other role is scoped to their own agentId.
  // Same rule as the hotel list — see HotelBookingList.jsx auth-scope logic.
  const isAdmin = role === "admin" || role === "administrator";

  const fetchBookings = useCallback(
    async ({ silent = false } = {}) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const params = {};
        if (!isAdmin && userId) params.agentId = userId;
        const res = await axiosInstance.get("/api/amadeus/flight-bookings", {
          params,
        });
        setBookings(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        const msg =
          err?.response?.data?.message ||
          err?.message ||
          "Failed to load bookings";
        toast.error(msg);
        setBookings([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isAdmin, userId],
  );

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // ── Client-side filter + paginate ────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bookings.filter((b) => {
      if (statusFilter !== "ALL" && b.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        b.pnrRecordLocator,
        b.primaryPassengerName,
        b.journeyOrigin,
        b.journeyDestination,
        b.contactEmail,
        b.contactPhone,
        b.paymentMode,
        (b.ticketNumbers || []).join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [bookings, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const displayed = useMemo(() => {
    const start = (page - 1) * perPage;
    return filtered.slice(start, start + perPage);
  }, [filtered, page, perPage]);

  // Snap back to page 1 when filters change so we don't land on a blank
  // page after a search narrows the result set.
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, perPage]);

  const openCancel = (booking) => {
    setCancelTarget(booking);
    setCancelReason("");
  };

  const submitCancel = async () => {
    if (!cancelTarget) return;
    setCancelBusy(true);
    try {
      const res = await axiosInstance.post("/api/amadeus/cancelBooking", {
        pnrRecordLocator: cancelTarget.pnrRecordLocator,
        cancellationReason: cancelReason?.trim() || null,
        cancelledBy: userId || "AGENT",
      });
      const data = res?.data || {};
      if (data.success) {
        toast.success("Booking cancelled");
        setCancelTarget(null);
        fetchBookings({ silent: true });
      } else {
        toast.error(data.message || "Cancellation rejected by Amadeus");
      }
    } catch (err) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          "Cancellation failed — please try again",
      );
    } finally {
      setCancelBusy(false);
    }
  };

  const paginationItems = useMemo(() => {
    const items = [];
    const maxVisible = 5;
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) items.push(i);
    return items;
  }, [page, totalPages]);

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main
          className="flex-grow-1 p-3"
          style={{ background: "#f7f8fa", minHeight: "calc(100vh - 60px)" }}
        >
          {/* Page header */}
          <div className="d-flex justify-content-between align-items-center flex-wrap mb-3">
            <h4 className="mb-0">
              <FaPlaneDeparture
                style={{ marginRight: 8, color: "#e11d48" }}
              />
              Flight Bookings
            </h4>
            <div className="d-flex" style={{ gap: 8 }}>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => fetchBookings({ silent: true })}
                disabled={loading || refreshing}
              >
                <FaSyncAlt
                  className={refreshing ? "spinning" : ""}
                  style={{ marginRight: 6 }}
                />
                Refresh
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate("/new-booking/flight")}
              >
                New Flight Booking
              </Button>
            </div>
          </div>

          {/* Filter bar */}
          <Card className="mb-3 shadow-sm" style={{ borderRadius: 8 }}>
            <Card.Body className="py-2">
              <div
                className="d-flex flex-wrap align-items-center"
                style={{ gap: 12 }}
              >
                <InputGroup style={{ maxWidth: 380 }}>
                  <InputGroup.Text>
                    <FaSearch />
                  </InputGroup.Text>
                  <Form.Control
                    type="text"
                    placeholder="Search PNR, passenger, route, ticket…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </InputGroup>
                <Form.Select
                  size="sm"
                  style={{ maxWidth: 180 }}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="ALL">All statuses</option>
                  <option value="PERSISTED">Confirmed</option>
                  <option value="PENDING_SAVE">Pending Save</option>
                  <option value="CANCELLED">Cancelled</option>
                </Form.Select>
                <Form.Select
                  size="sm"
                  style={{ maxWidth: 130 }}
                  value={perPage}
                  onChange={(e) => setPerPage(Number(e.target.value))}
                >
                  {PER_PAGE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n} per page
                    </option>
                  ))}
                </Form.Select>
                <div
                  className="ms-auto text-muted small"
                  style={{ fontSize: 13 }}
                >
                  {filtered.length} of {bookings.length} bookings
                </div>
              </div>
            </Card.Body>
          </Card>

          {/* Table */}
          <Card className="shadow-sm" style={{ borderRadius: 8 }}>
            <Card.Body className="p-0">
              {loading ? (
                <div className="text-center py-5">
                  <Spinner animation="border" variant="primary" />
                  <div className="text-muted mt-2 small">
                    Loading bookings…
                  </div>
                </div>
              ) : displayed.length === 0 ? (
                <div className="text-center py-5 text-muted">
                  <FaInbox size={36} style={{ opacity: 0.4 }} />
                  <div className="mt-2">No bookings found.</div>
                  {search && (
                    <div className="small mt-1">
                      Try clearing the search or filter.
                    </div>
                  )}
                </div>
              ) : (
                <div className="table-responsive">
                  <Table hover className="mb-0 align-middle">
                    <thead
                      style={{
                        background: "#f9fafb",
                        borderBottom: "2px solid #e5e7eb",
                      }}
                    >
                      <tr>
                        <th style={{ width: 50 }}>#</th>
                        <th>PNR</th>
                        <th>Passenger</th>
                        <th>Route</th>
                        <th>Book Date</th>
                        <th>Status</th>
                        <th className="text-end">Amount</th>
                        <th>Payment</th>
                        <th>Tickets</th>
                        <th style={{ width: 130 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayed.map((b, idx) => (
                        <tr key={b.bookingId}>
                          <td className="text-muted">
                            {(page - 1) * perPage + idx + 1}
                          </td>
                          <td>
                            <strong
                              style={{
                                fontFamily: "monospace",
                                fontSize: 13,
                              }}
                            >
                              {b.pnrRecordLocator}
                            </strong>
                            <div
                              className="text-muted"
                              style={{ fontSize: 11 }}
                            >
                              #{b.bookingId}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontSize: 14 }}>
                              {b.primaryPassengerName || "—"}
                            </div>
                            {b.passengerCount > 1 && (
                              <div
                                className="text-muted"
                                style={{ fontSize: 11 }}
                              >
                                +{b.passengerCount - 1} more
                              </div>
                            )}
                          </td>
                          <td>
                            <div style={{ fontSize: 13 }}>
                              {b.journeyOrigin || "—"}
                              <span
                                className="mx-1 text-muted"
                                aria-hidden="true"
                              >
                                →
                              </span>
                              {b.journeyDestination || "—"}
                            </div>
                            <div
                              className="text-muted"
                              style={{ fontSize: 11 }}
                            >
                              {b.tripType || ""}
                              {b.segmentCount
                                ? ` · ${b.segmentCount} seg`
                                : ""}
                            </div>
                          </td>
                          <td style={{ fontSize: 13 }}>
                            {formatDateTime(b.createdAt)}
                          </td>
                          <td>
                            <StatusBadge status={b.status} />
                          </td>
                          <td
                            className="text-end"
                            style={{ fontSize: 13, fontWeight: 600 }}
                          >
                            {formatMoney(b.totalAmount, b.currency)}
                          </td>
                          <td style={{ fontSize: 12 }}>
                            {b.paymentMode ? (
                              <>
                                <div>{paymentModeLabel(b.paymentMode)}</div>
                                {b.paymentStatus && (
                                  <div
                                    className="text-muted"
                                    style={{ fontSize: 10 }}
                                  >
                                    {b.paymentStatus}
                                  </div>
                                )}
                              </>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td style={{ fontSize: 12 }}>
                            {b.ticketCount > 0 ? (
                              <Badge bg="info">{b.ticketCount}</Badge>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td>
                            <Button
                              size="sm"
                              variant="outline-primary"
                              className="me-1"
                              onClick={() => setDetailTarget(b)}
                              title="View details"
                            >
                              <FaEye />
                            </Button>
                            {b.status !== "CANCELLED" && (
                              <Button
                                size="sm"
                                variant="outline-danger"
                                onClick={() => openCancel(b)}
                                title="Cancel booking"
                              >
                                <FaBan />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
            </Card.Body>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="d-flex justify-content-center mt-3">
              <Pagination>
                <Pagination.First
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                />
                <Pagination.Prev
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                />
                {paginationItems.map((n) => (
                  <Pagination.Item
                    key={n}
                    active={n === page}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </Pagination.Item>
                ))}
                <Pagination.Next
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                />
                <Pagination.Last
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                />
              </Pagination>
            </div>
          )}
        </main>
      </div>

      {/* Cancel modal */}
      <Modal
        show={!!cancelTarget}
        onHide={() => !cancelBusy && setCancelTarget(null)}
        centered
        backdrop={cancelBusy ? "static" : true}
      >
        <Modal.Header closeButton={!cancelBusy}>
          <Modal.Title>Cancel Booking</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            Cancel PNR{" "}
            <strong style={{ fontFamily: "monospace" }}>
              {cancelTarget?.pnrRecordLocator}
            </strong>
            ? This voids any issued tickets and removes the itinerary from
            Amadeus. This cannot be undone.
          </p>
          <Form.Group>
            <Form.Label className="small">Reason (optional)</Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              placeholder="Customer requested / schedule change / …"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              disabled={cancelBusy}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="outline-secondary"
            onClick={() => setCancelTarget(null)}
            disabled={cancelBusy}
          >
            Keep booking
          </Button>
          <Button variant="danger" onClick={submitCancel} disabled={cancelBusy}>
            {cancelBusy ? (
              <>
                <Spinner size="sm" animation="border" className="me-2" />
                Cancelling…
              </>
            ) : (
              "Yes, cancel"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Detail modal */}
      <Modal
        show={!!detailTarget}
        onHide={() => setDetailTarget(null)}
        size="lg"
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>
            Booking{" "}
            <span style={{ fontFamily: "monospace" }}>
              {detailTarget?.pnrRecordLocator}
            </span>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {detailTarget && <BookingDetail booking={detailTarget} />}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setDetailTarget(null)}
          >
            Close
          </Button>
        </Modal.Footer>
      </Modal>

      <style>{`.spinning { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

// ── Helpers ────────────────────────────────────────────────────────────

const formatDateTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
};

const formatMoney = (amount, currency) => {
  if (amount == null) return "—";
  const num = Number(amount);
  if (!Number.isFinite(num)) return "—";
  return `${currency || ""} ${num.toFixed(2)}`.trim();
};

const paymentModeLabel = (mode) => {
  switch (mode) {
    case "CARD":
      return "Card";
    case "CREDITLIMIT":
      return "Credit Limit";
    default:
      return mode;
  }
};

const StatusBadge = ({ status }) => {
  const map = {
    PERSISTED: { bg: "success", label: "Confirmed" },
    PENDING_SAVE: { bg: "warning", label: "Pending Save" },
    CANCELLED: { bg: "secondary", label: "Cancelled" },
  };
  const cfg = map[status] || { bg: "light", label: status || "—" };
  return (
    <Badge bg={cfg.bg} style={{ fontSize: 11 }}>
      {cfg.label}
    </Badge>
  );
};

// Placeholder detail view. When the /retrievePnr endpoint gets a UI, this
// can pop into that flow instead — for now, everything we already know
// about the booking is on the list item.
const BookingDetail = ({ booking }) => (
  <div>
    <dl className="row mb-0" style={{ fontSize: 14 }}>
      <dt className="col-sm-4 text-muted">Route</dt>
      <dd className="col-sm-8">
        {booking.journeyOrigin} → {booking.journeyDestination}{" "}
        <span className="text-muted small">({booking.tripType || "—"})</span>
      </dd>
      <dt className="col-sm-4 text-muted">Passenger</dt>
      <dd className="col-sm-8">
        {booking.primaryPassengerName}
        {booking.passengerCount > 1 && ` (+${booking.passengerCount - 1} more)`}
      </dd>
      <dt className="col-sm-4 text-muted">Contact</dt>
      <dd className="col-sm-8">
        {booking.contactEmail || "—"}
        <br />
        {booking.contactPhone || "—"}
      </dd>
      <dt className="col-sm-4 text-muted">Amount</dt>
      <dd className="col-sm-8">
        {formatMoney(booking.totalAmount, booking.currency)}
      </dd>
      <dt className="col-sm-4 text-muted">Payment</dt>
      <dd className="col-sm-8">
        {booking.paymentMode
          ? `${paymentModeLabel(booking.paymentMode)} · ${booking.paymentStatus || ""}`
          : "—"}
      </dd>
      <dt className="col-sm-4 text-muted">Status</dt>
      <dd className="col-sm-8">
        <StatusBadge status={booking.status} />
        {booking.cancelledAt && (
          <span className="text-muted small ms-2">
            on {formatDateTime(booking.cancelledAt)}
          </span>
        )}
      </dd>
      <dt className="col-sm-4 text-muted">Booked</dt>
      <dd className="col-sm-8">{formatDateTime(booking.createdAt)}</dd>
      {booking.ticketNumbers?.length > 0 && (
        <>
          <dt className="col-sm-4 text-muted">Tickets</dt>
          <dd className="col-sm-8" style={{ fontFamily: "monospace" }}>
            {booking.ticketNumbers.map((t) => (
              <div key={t}>{t}</div>
            ))}
          </dd>
        </>
      )}
      {booking.warnings && (
        <>
          <dt className="col-sm-4 text-muted">Warnings</dt>
          <dd className="col-sm-8 small text-warning">
            {booking.warnings.replace(/\|/g, " · ")}
          </dd>
        </>
      )}
    </dl>
  </div>
);

export default FlightBookingList;
