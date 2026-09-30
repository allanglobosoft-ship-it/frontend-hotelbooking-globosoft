import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Card,
  Table,
  Spinner,
  Form,
  InputGroup,
  Badge,
  Modal,
  Row,
  Col,
  Pagination,
  Button,
} from "react-bootstrap";
import {
  FaEye,
  FaSearch,
  FaInbox,
  FaUser,
  FaUsers,
  FaArrowLeft,
} from "react-icons/fa";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import toast from "react-hot-toast";
import { formatDateTime } from "../../utils/dateUtils";
// Shared "hotel booking list" look (Lexend, red/white theme, table/card/
// pagination styling). Scoped under .hbl-modern — same stylesheet the
// /booking-details/hotel-booking-list and long-stay list use, so all three
// pages share one uniform look. Visual only; no logic change.
import "../../styles/HotelBookingListModern.css";
import DashboardRedirections from "../../components/DashboardRedirections";

// Rows-per-page choices — same set as /booking-details/hotel-booking-list.
const PER_PAGE_OPTIONS = [10, 25, 50, 100];

// Column-width hints kept in sync with HotelBookingList / LongStayBookingList so
// all three booking lists line up visually under the shared hbl-modern skin.
const COLUMN_WIDTHS = {
  sn: "40px",
  customerName: "150px",
  bookingCode: "100px",
  // Supplier-side confirmation number added on the LM booking detail view.
  // Sits next to Booking Code so the two identifiers (internal + supplier)
  // read together. Cell renders blank for rows that don't have one yet.
  // Width tuned so the two-word header ("CONFIRMATION" / "NO") wraps at
  // its space instead of splitting "CONFIRMATION" mid-word — needs enough
  // room for the longest word on its own line. Mirrors the hotel list.
  confirmationNo: "130px",
  bookDate: "95px",
  bookingDetails: "240px",
  nights: "70px",
  total: "110px",
  paymentStatus: "110px",
  status: "110px",
  action: "70px",
};

// "dd/mm/yyyy" — same shape the hotel / long-stay lists use in their table
// cells so dates render identically across all three pages.
const formatShortDate = (dateString) => {
  if (!dateString) return "";
  const normalized = String(dateString).includes("T")
    ? dateString
    : `${dateString}T00:00:00`;
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getFullYear()}`;
};

const STATUS_META = {
  CONFIRMED: { label: "Confirmed", bg: "#e7f6ec", color: "#1b7f3a", dot: "#22c55e" },
  Confirmed: { label: "Confirmed", bg: "#e7f6ec", color: "#1b7f3a", dot: "#22c55e" },
  ReConfirmed: { label: "ReConfirmed", bg: "#e7f6ec", color: "#1b7f3a", dot: "#22c55e" },
  Requested: { label: "Requested", bg: "#fff7e6", color: "#b76e00", dot: "#f59e0b" },
  PENDING:   { label: "Pending",   bg: "#fff7e6", color: "#b76e00", dot: "#f59e0b" },
  CANCELLED: { label: "Cancelled", bg: "#fdecec", color: "#b42318", dot: "#ef4444" },
  Cancelled: { label: "Cancelled", bg: "#fdecec", color: "#b42318", dot: "#ef4444" },
  "On Request": { label: "On Request", bg: "#fff3e0", color: "#e67e22", dot: "#f59e0b" },
  Rejected: { label: "Rejected", bg: "#fdecec", color: "#b42318", dot: "#ef4444" },
};

// Derive the display status label from a booking's lifecycle fields — mirrors
// /booking-details/hotel-booking-list. An On-Request booking is engine-CONFIRMED
// (so it can follow the reconfirm flow) but must DISPLAY as "On Request" until it
// is reconfirmed; the list keys that off roomStatus exactly like the hotel list.
const deriveDisplayStatus = (b) => {
  const conf = String(b?.confirmationStatus || "").replace(/\s+/g, "").toLowerCase();
  const engine = String(b?.bookingStatus || "").replace(/\s+/g, "").toUpperCase();
  if (b?.isCancelled === true || engine === "CANCELLED" || conf === "cancelled") {
    return "Cancelled";
  }
  if (conf === "rejected") return "Rejected";
  const isReconfirmed =
    b?.reconfirmation === true || engine === "RECONFIRMED" || conf === "reconfirmed";
  if (isReconfirmed) return "ReConfirmed";
  const isOnRequestRoom = /^on\s*request$/i.test(String(b?.roomStatus || "").trim());
  if (isOnRequestRoom) return "On Request";
  if (engine === "CONFIRMED" || conf === "confirmed") return "Confirmed";
  if (engine === "REQUESTED" || conf === "requested") return "Requested";
  return b?.confirmationStatus || "Confirmed";
};

// Resolve the Payment Status label from the booking's DISPLAYED status — same
// mapping as /booking-details/hotel-booking-list:
//   Confirmed   → Payment Pending
//   On Request  → Payment Pending
//   ReConfirmed → Paid
//   Cancelled   → Paid when the booking had been reconfirmed before it was
//                 cancelled, otherwise Un-Paid
// Anything else — Requested, Rejected, or an unknown/empty status — has no
// defined mapping and renders "-".
//
// A cancelled booking reports whether the money had already been collected at
// the point of cancellation rather than the cancellation itself: a history that
// reached ReConfirmed was paid, one that stopped at On Request / Confirmed
// never was.
//
// On Request rooms haven't collected money yet either, so they carry the same
// "Payment Pending" meaning as a genuinely Confirmed row. The Status column
// still shows them as "On Request" (orange) — only the Payment Status column
// collapses the two into the same settled/unsettled label.
//
// It is deliberately fed the label already computed by deriveDisplayStatus so
// this column can never disagree with the adjacent Status column.
const getPaymentStatusLabel = (booking, displayStatus) => {
  const normalized = String(displayStatus || "").replace(/\s+/g, "").toLowerCase();
  if (!normalized) return "-";

  if (normalized === "cancelled" || normalized === "canceled") {
    // Whether the money had been collected before the cancellation. The
    // last-minute cancel endpoint (PATCH /api/last-minute-booking/{id}/cancel)
    // only stamps is_cancelled + cancelled_at — it leaves confirmationStatus and
    // cancelledFromStatus untouched — so the persisted `reconfirmation` flag is
    // the signal that survives for rows cancelled through that route. The
    // compound-status and cancelledFromStatus checks mirror the hotel list and
    // cover bookings cancelled through the shared booking-cancellation flow.
    const segments = String(booking?.confirmationStatus || "")
      .split("/")
      .map((seg) => seg.replace(/\s+/g, "").toLowerCase())
      .filter(Boolean);
    const cancelledFromNormalized = String(booking?.cancelledFromStatus || "")
      .replace(/\s+/g, "")
      .toLowerCase();
    const wasReconfirmedBeforeCancel =
      booking?.reconfirmation === true ||
      segments.includes("reconfirmed") ||
      cancelledFromNormalized.includes("reconfirmed");
    return wasReconfirmedBeforeCancel ? "Paid" : "Un-Paid";
  }

  if (normalized === "reconfirmed") return "Paid";
  if (normalized === "confirmed") return "Payment Pending";
  // Match the hotel list: an On Request booking is Confirmed-in-waiting —
  // no money collected yet, same badge as a Confirmed row.
  if (normalized === "onrequest") return "Payment Pending";

  return "-";
};

// Every customer/guest name on a booking. The backend now sends a
// `guestNames` array (collected across all room bookings); fall back to
// the single `customerName` for older payload shapes.
const getGuestNames = (booking) => {
  if (Array.isArray(booking?.guestNames) && booking.guestNames.length > 0) {
    return booking.guestNames.filter((n) => String(n ?? "").trim());
  }
  return booking?.customerName && booking.customerName !== "-"
    ? [booking.customerName]
    : [];
};

// Booking Type filter options — mirrors the dropdown on
// /booking-details/hotel-booking-list, adapted to the fields the
// last-minute list row actually carries (confirmationStatus / isCancelled /
// checkOutDate). Filtering is client-side over the already-fetched list.
const BOOKING_TYPE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "completed", label: "Completed" },
  { value: "reconfirmed", label: "ReConfirmed" },
  { value: "confirmed", label: "Confirmed" },
  { value: "requested", label: "Requested" },
  { value: "cancelled", label: "Cancelled" },
];

// True when a booking matches the selected Booking Type. "Upcoming" /
// "Completed" are derived from the stay's check-out date (cancelled rows are
// excluded from both); the status options match the backend's formatted
// confirmationStatus ("ReConfirmed" / "Confirmed" / "Requested").
const matchesBookingType = (booking, type) => {
  if (!type || type === "all") return true;
  // Match against the derived display label so the filter stays consistent
  // with the Status column (e.g. an On-Request booking is filterable).
  const derived = deriveDisplayStatus(booking).replace(/\s+/g, "").toLowerCase();
  if (type === "cancelled") return derived === "cancelled";
  if (derived === "cancelled") return false;

  if (type === "reconfirmed") return derived === "reconfirmed";
  if (type === "confirmed") return derived === "confirmed";
  if (type === "requested") return derived === "onrequest" || derived === "requested";

  const co = booking?.checkOutDate ? new Date(booking.checkOutDate) : null;
  if (!co || isNaN(co.getTime())) return type === "upcoming";
  co.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (type === "upcoming") return co >= today;
  if (type === "completed") return co < today;
  return true;
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
/**
 * LastMinuteBookingList — mirrors HotelBookingList.jsx structure for the
 * Last Minute flow. Talks to /api/last-minute-booking/list, /api/last-minute-
 * booking/{id} (view), and /api/last-minute-booking/{id}/cancel.
 *
 * Columns: S.N · Customer · Booking Code · Hotel · Check-in · Check-out ·
 * Total · Payment Method · Status · Actions.
 * Action column is the eye icon only; it navigates to
 * /booking-details/last-minute-booking/:id where Voucher (PDF in new
 * tab), Invoice (/invoice?bookingId=... in new tab), and Cancel
 * (SweetAlert confirm + PATCH .../cancel) live as buttons at the
 * bottom-left of the detail view.
 *
 * Payment Method may be left blank by the backend and rendered as "-" —
 * it is populated by ops at a later stage.
 */
export default function LastMinuteBookingList() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // Booking Type filter — same control as /booking-details/hotel-booking-list.
  const [bookingType, setBookingType] = useState("all");
  // Check-in Date filter — exact-day match, mirrors /booking-details/hotel-booking-list.
  const [checkInDateFilter, setCheckInDateFilter] = useState("");
  // Time Period filter (by check-in month/year) — same control + position as
  // /booking-details/hotel-booking-list. Either field can be set independently.
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  // Client-side pagination — same UX as /booking-details/hotel-booking-list.
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(PER_PAGE_OPTIONS[0]);
  // "Customers (N)" modal — opened from the "+N more" badge on the
  // Customer column to show every guest on a booking.
  const [showCustomersModal, setShowCustomersModal] = useState(false);
  const [customersModalBooking, setCustomersModalBooking] = useState(null);

  const handleShowCustomers = (booking) => {
    setCustomersModalBooking(booking);
    setShowCustomersModal(true);
  };

  const fetchBookings = async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get("/api/last-minute-booking/list");
      setBookings(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load last-minute bookings");
      setBookings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  // Month / Year option lists for the Time Period selectors.
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 2014 }, (_, i) => 2020 + i);

  // Client-side filter by Booking Type, Time Period (check-in month/year),
  // then search term (booking code / customer / hotel name).
  // Exact check-in day match (YYYY-MM-DD from the <input type="date">).
  const checkInPick = (checkInDateFilter || "").trim();
  const toIsoDay = (d) => (d ? String(d).split("T")[0].trim() : "");
  const filtered = bookings.filter((b) => {
    if (checkInPick && toIsoDay(b.checkInDate) !== checkInPick) return false;
    if (!matchesBookingType(b, bookingType)) return false;
    // Time Period — match the check-in date's month/year (mirrors the hotel
    // list, whose month/year primarily filters on checkInDate). Each field is
    // optional and applied independently.
    if (selectedMonth || selectedYear) {
      const ci = b.checkInDate ? new Date(b.checkInDate) : null;
      if (!ci || isNaN(ci.getTime())) return false;
      if (selectedMonth && ci.getMonth() + 1 !== Number(selectedMonth)) return false;
      if (selectedYear && ci.getFullYear() !== Number(selectedYear)) return false;
    }
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    // dd/mm/yyyy form of a date so a stay-date search (e.g. "26/06/2026")
    // matches the check-in / check-out shown in the Stay column.
    const fmtDM = (d) => {
      if (!d) return "";
      const dt = new Date(String(d).includes("T") ? d : `${d}T00:00:00`);
      if (isNaN(dt.getTime())) return "";
      return `${String(dt.getDate()).padStart(2, "0")}/${String(
        dt.getMonth() + 1
      ).padStart(2, "0")}/${dt.getFullYear()}`;
    };
    return (
      (b.bookingCode || "").toLowerCase().includes(q) ||
      (b.customerName || "").toLowerCase().includes(q) ||
      getGuestNames(b).some((n) => n.toLowerCase().includes(q)) ||
      (b.hotelName || "").toLowerCase().includes(q) ||
      fmtDM(b.checkInDate).includes(q) ||
      fmtDM(b.checkOutDate).includes(q) ||
      String(b.checkInDate || "").toLowerCase().includes(q) ||
      String(b.checkOutDate || "").toLowerCase().includes(q)
    );
  });

  // ── Pagination (client-side, over the filtered list) ──────────────────
  const totalEntries = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / perPage));
  // Clamp the active page if filtering/resizing shrank the result set.
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * perPage;
  const pageItems = filtered.slice(startIdx, startIdx + perPage);
  const displayStart = totalEntries === 0 ? 0 : startIdx + 1;
  const displayEnd = Math.min(startIdx + perPage, totalEntries);

  // Jump back to page 1 whenever the filters change so the user isn't
  // stranded on an out-of-range page.
  useEffect(() => {
    setCurrentPage(1);
  }, [search, bookingType, checkInDateFilter, selectedMonth, selectedYear, perPage]);

  const goToPage = (p) => {
    if (p < 1 || p > totalPages) return;
    setCurrentPage(p);
  };

  // Shared table cell/header styling — identical to HotelBookingList /
  // LongStayBookingList so the three tables render uniformly.
  const baseCellStyle = {
    padding: "0.5rem 0.6rem",
    fontSize: "0.8rem",
    border: "1px solid #dee2e6",
    verticalAlign: "middle",
    whiteSpace: "normal",
    overflow: "visible",
    wordBreak: "break-word",
    lineHeight: 1.4,
  };

  const baseHeaderStyle = {
    padding: "0.45rem 0.6rem",
    fontWeight: 600,
    textTransform: "uppercase",
    color: "#495057",
    border: "1px solid #dee2e6",
    whiteSpace: "normal",
    lineHeight: 1.2,
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column hbl-modern">
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

            {/* Header: Title + Search (left) | Time Period (right) — mirrors
                /booking-details/hotel-booking-list */}
            <div className="d-flex justify-content-between align-items-end mb-3 hbl-header">
              <div className="hbl-header-left">
                <h3 className="fw-bold text-dark mb-2">Last Minute Bookings</h3>
                <InputGroup className="hbl-search" style={{ height: "40px", width: "300px" }}>
                  <InputGroup.Text
                    style={{
                      backgroundColor: "#f8f9fa",
                      borderRight: "none",
                      borderColor: "#dee2e6",
                    }}
                  >
                    <FaSearch style={{ color: "#6c757d" }} />
                  </InputGroup.Text>
                  <Form.Control
                    type="text"
                    placeholder="Search by code / customer / hotel"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{
                      borderLeft: "none",
                      fontSize: "0.85rem",
                      borderColor: "#dee2e6",
                      height: "40px",
                    }}
                  />
                </InputGroup>
              </div>
              <Card
                className="shadow-sm border-0 hbl-timecard"
                style={{ borderRadius: "8px", minWidth: "260px" }}
              >
                <Card.Body className="p-3">
                  <h6
                    className="mb-2 fw-bold text-dark"
                    style={{ fontSize: "0.85rem", letterSpacing: "0.4px" }}
                  >
                    Time Period
                  </h6>
                  <Row className="g-2">
                    <Col xs={6}>
                      <Form.Select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="form-control"
                        size="sm"
                        style={{ fontSize: "0.82rem", height: "45px" }}
                      >
                        <option value="">Month</option>
                        {months.map((month, index) => (
                          <option key={month} value={index + 1}>
                            {month.slice(0, 3)}
                          </option>
                        ))}
                      </Form.Select>
                    </Col>
                    <Col xs={6}>
                      <Form.Select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(e.target.value)}
                        className="form-control"
                        size="sm"
                        style={{ fontSize: "0.82rem", height: "45px" }}
                      >
                        <option value="">Year</option>
                        {years.map((year) => (
                          <option key={year} value={year}>
                            {year}
                          </option>
                        ))}
                      </Form.Select>
                    </Col>
                  </Row>
                </Card.Body>
              </Card>
            </div>

            {/* Booking Type filter — mirrors /booking-details/hotel-booking-list */}
            <Row className="mb-2 g-1">
              <Col xs={12}>
                <Card
                  className="shadow-sm border-0 w-100"
                  style={{ borderRadius: "8px" }}
                >
                  <Card.Body className="p-3">
                    <Row className="g-2">
                      <Col xs={12} md={6} lg={4} xl={3}>
                        <h6
                          className="mb-2 fw-bold text-dark"
                          style={{ fontSize: "0.85rem", letterSpacing: "0.4px" }}
                        >
                          Booking Type
                        </h6>
                        <Form.Select
                          value={bookingType}
                          onChange={(e) => setBookingType(e.target.value)}
                          size="sm"
                          aria-label="Booking type filter"
                          style={{ fontSize: "0.85rem", height: "46px" }}
                        >
                          {BOOKING_TYPE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </Form.Select>
                      </Col>
                      {/* Check-in Date filter — mirrors /booking-details/hotel-booking-list. */}
                      <Col xs={12} md={6} lg={4} xl={3}>
                        <h6
                          className="mb-2 fw-bold text-dark"
                          style={{ fontSize: "0.85rem", letterSpacing: "0.4px" }}
                        >
                          Check-in Date
                        </h6>
                        <div className="d-flex gap-2">
                          <Form.Control
                            type="date"
                            value={checkInDateFilter}
                            onChange={(e) => setCheckInDateFilter(e.target.value)}
                            size="sm"
                            aria-label="Check-in date filter"
                            style={{ fontSize: "0.85rem", height: "46px" }}
                          />
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            onClick={() => setCheckInDateFilter("")}
                            disabled={!checkInDateFilter}
                            aria-label="Clear check-in date filter"
                            style={{
                              fontSize: "0.85rem",
                              height: "46px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Clear
                          </Button>
                        </div>
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>
              </Col>
            </Row>

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
                {loading ? (
                  <div className="text-center py-5">
                    <Spinner animation="border" variant="primary" />
                    <p className="mt-3 text-muted">Loading bookings...</p>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-5 text-muted">
                    <FaInbox className="display-4 mb-3" style={{ opacity: 0.4 }} />
                    <h6 className="fw-semibold">No last-minute bookings yet</h6>
                    <p className="mb-0 small">
                      They'll appear here once you create one via{" "}
                      <em>New Booking → Last Minute Booking</em>.
                    </p>
                  </div>
                ) : (
                  <>
                    <div
                      className="thin-scrollbar"
                      style={{ overflowX: "auto", width: "100%" }}
                    >
                      <Table
                        hover
                        size="sm"
                        className="mb-0 align-middle table-bordered hbl-table"
                        style={{
                          tableLayout: "auto",
                          width: "100%",
                          fontSize: "0.78rem",
                          borderCollapse: "separate",
                          borderSpacing: 0,
                          wordBreak: "break-word",
                        }}
                      >
                        <thead
                          style={{
                            backgroundColor: "#f8f9fa",
                            borderBottom: "2px solid #dee2e6",
                            boxShadow: "0 2px 4px rgba(0,0,0,0.08)",
                            fontSize: "0.7rem",
                            letterSpacing: "0.03em",
                          }}
                        >
                          <tr>
                            <th style={{ ...baseHeaderStyle, textAlign: "center", width: COLUMN_WIDTHS.sn }}>
                              S.N
                            </th>
                            <th style={{ ...baseHeaderStyle, width: COLUMN_WIDTHS.customerName }}>
                              Customer Name
                            </th>
                            <th style={{ ...baseHeaderStyle, width: COLUMN_WIDTHS.bookingCode }}>
                              Booking Code
                            </th>
                            {/* Confirmation No — supplier's confirmation number,
                                populated via the "CONFIRMATION NO." button on
                                the booking detail view (booking.confirmationNumber).
                                Cell renders blank on rows that don't have one.
                                wordBreak / overflowWrap normal keep the two-word
                                header wrapping only at its space, mirroring
                                the hotel list. */}
                            <th
                              style={{
                                ...baseHeaderStyle,
                                width: COLUMN_WIDTHS.confirmationNo,
                                whiteSpace: "normal",
                                wordBreak: "normal",
                                overflowWrap: "normal",
                              }}
                            >
                              Confirmation No
                            </th>
                            <th style={{ ...baseHeaderStyle, textAlign: "center", width: COLUMN_WIDTHS.bookDate }}>
                              Book Date
                            </th>
                            <th style={{ ...baseHeaderStyle, width: COLUMN_WIDTHS.bookingDetails }}>
                              Booking Details
                            </th>
                            <th style={{ ...baseHeaderStyle, textAlign: "center", width: COLUMN_WIDTHS.nights }}>
                              Nights
                            </th>
                            <th style={{ ...baseHeaderStyle, textAlign: "right", width: COLUMN_WIDTHS.total }}>
                              Total
                            </th>
                            {/* Payment Status column — same mapping as
                                /booking-details/hotel-booking-list. See
                                getPaymentStatusLabel. */}
                            <th style={{ ...baseHeaderStyle, textAlign: "center", width: COLUMN_WIDTHS.paymentStatus }}>
                              Payment Status
                            </th>
                            <th style={{ ...baseHeaderStyle, textAlign: "center", width: COLUMN_WIDTHS.status }}>
                              Status
                            </th>
                            <th style={{ ...baseHeaderStyle, textAlign: "center", width: COLUMN_WIDTHS.action }}>
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {pageItems.map((b, idx) => {
                            const statusText = deriveDisplayStatus(b);
                            const sMeta = STATUS_META[statusText];
                            return (
                              <tr key={b.bookingId}>
                                <td
                                  className="text-muted fw-semibold"
                                  style={{ ...baseCellStyle, textAlign: "center", color: "#6c757d", width: COLUMN_WIDTHS.sn }}
                                >
                                  {startIdx + idx + 1}
                                </td>
                                {/* Customer — first guest prominent, rest behind
                                    a "+N more" badge that opens the modal. */}
                                <td style={{ ...baseCellStyle, width: COLUMN_WIDTHS.customerName }}>
                                  {(() => {
                                    const names = getGuestNames(b);
                                    const first = names[0] || "-";
                                    const extra = Math.max(0, names.length - 1);
                                    return (
                                      <div
                                        className="d-flex align-items-center"
                                        style={{ gap: "0.4rem", flexWrap: "wrap" }}
                                      >
                                        <span
                                          className="d-inline-flex align-items-center"
                                          style={{ gap: "0.3rem" }}
                                        >
                                          <FaUser
                                            style={{ color: "#6c757d", fontSize: "0.78rem", flexShrink: 0 }}
                                          />
                                          <span className="fw-medium text-dark">
                                            {first}
                                          </span>
                                        </span>
                                        {extra > 0 && (
                                          <Badge
                                            bg="light"
                                            text="primary"
                                            role="button"
                                            tabIndex={0}
                                            title="View all customers"
                                            onClick={() => handleShowCustomers(b)}
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                handleShowCustomers(b);
                                              }
                                            }}
                                            style={{
                                              cursor: "pointer",
                                              border: "1px solid #cfe2ff",
                                              fontWeight: 600,
                                              fontSize: "0.7rem",
                                            }}
                                          >
                                            +{extra} more
                                          </Badge>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </td>
                                <td style={{ ...baseCellStyle, width: COLUMN_WIDTHS.bookingCode }}>
                                  <span className="fw-bold text-primary">
                                    {b.bookingCode || "-"}
                                  </span>
                                </td>
                                {/* Confirmation No cell — mirrors the detail
                                    view's field resolution. Renders blank
                                    when the supplier hasn't stamped a number
                                    yet, per the requirement that empty means
                                    "nothing shown here". nowrap keeps the
                                    number atomic. */}
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    width: COLUMN_WIDTHS.confirmationNo,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {(() => {
                                    const confNo =
                                      b.confirmationNumber ||
                                      b.customer?.confirmationNumber ||
                                      "";
                                    return confNo ? (
                                      <span
                                        className="fw-semibold text-dark"
                                        style={{ fontSize: "0.85rem" }}
                                      >
                                        {confNo}
                                      </span>
                                    ) : (
                                      <span className="text-muted">-</span>
                                    );
                                  })()}
                                </td>
                                <td
                                  className="text-muted"
                                  style={{ ...baseCellStyle, textAlign: "center", width: COLUMN_WIDTHS.bookDate, whiteSpace: "nowrap" }}
                                >
                                  {formatShortDate(b.bookingDate) ||
                                    formatDateTime(b.bookingDate) ||
                                    "-"}
                                </td>
                                <td style={{ ...baseCellStyle, width: COLUMN_WIDTHS.bookingDetails }}>
                                  <div
                                    className="d-flex align-items-center"
                                    style={{ gap: "0.35rem", flexWrap: "wrap" }}
                                  >
                                    <span
                                      className="fw-semibold text-dark"
                                      style={{ fontSize: "0.875rem" }}
                                    >
                                      {b.hotelName || "-"}
                                    </span>
                                    {formatShortDate(b.checkInDate) &&
                                      formatShortDate(b.checkOutDate) && (
                                        <span
                                          className="text-muted"
                                          style={{ fontSize: "0.75rem" }}
                                        >
                                          ({formatShortDate(b.checkInDate)} -{" "}
                                          {formatShortDate(b.checkOutDate)})
                                        </span>
                                      )}
                                  </div>
                                </td>
                                <td
                                  className="text-muted"
                                  style={{ ...baseCellStyle, textAlign: "center", fontFamily: "monospace", width: COLUMN_WIDTHS.nights }}
                                >
                                  {b.nights ?? "-"}
                                </td>
                                <td style={{ ...baseCellStyle, textAlign: "right", width: COLUMN_WIDTHS.total, whiteSpace: "nowrap" }}>
                                  <span className="fw-semibold text-dark">
                                    {b.displayCurrencyCode &&
                                    b.displayCurrencyCode !== "AED" &&
                                    Number(b.displayAmount) > 0
                                      ? `${b.displayCurrencyCode} ${Number(b.displayAmount).toFixed(2)}`
                                      : b.totalRate != null
                                        ? `AED ${Number(b.totalRate).toFixed(2)}`
                                        : "-"}
                                  </span>
                                </td>
                                {/* Payment Status cell — derived from the
                                    booking's displayed Status: Confirmed →
                                    Payment Pending, ReConfirmed → Paid, a
                                    cancellation → Paid or Un-Paid depending on
                                    whether it had been reconfirmed. See
                                    getPaymentStatusLabel. */}
                                <td style={{ ...baseCellStyle, textAlign: "center", width: COLUMN_WIDTHS.paymentStatus }}>
                                  {(() => {
                                    const label = getPaymentStatusLabel(b, statusText);
                                    if (label === "-") {
                                      return <span className="text-muted">-</span>;
                                    }
                                    // Same palette as the hotel list — green
                                    // settled, red never collected, orange still
                                    // outstanding.
                                    const color =
                                      label === "Paid"
                                        ? "#06a301"
                                        : label === "Un-Paid"
                                          ? "#dc3545"
                                          : "#e67e22";
                                    return (
                                      <span
                                        style={{
                                          color,
                                          fontSize: "0.82rem",
                                          fontWeight: "600",
                                        }}
                                      >
                                        {label}
                                      </span>
                                    );
                                  })()}
                                </td>
                                <td style={{ ...baseCellStyle, textAlign: "center", width: COLUMN_WIDTHS.status }}>
                                  <StatusPill meta={sMeta} raw={statusText} />
                                </td>
                                <td style={{ ...baseCellStyle, textAlign: "center", width: COLUMN_WIDTHS.action }}>
                                  <div className="d-flex justify-content-center align-items-center">
                                    <FaEye
                                      role="button"
                                      tabIndex={0}
                                      title="View full booking details"
                                      style={{ fontSize: "18px", color: "#007bff", cursor: "pointer" }}
                                      onClick={() =>
                                        navigate(
                                          `/booking-details/last-minute-booking/${b.bookingId}`,
                                          { state: { booking: b } },
                                        )
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault();
                                          navigate(
                                            `/booking-details/last-minute-booking/${b.bookingId}`,
                                            { state: { booking: b } },
                                          );
                                        }
                                      }}
                                    />
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </Table>
                    </div>

                    {/* Pagination footer — mirrors /booking-details/hotel-booking-list */}
                    <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 mt-3 hbl-pagination-bar">
                      <div className="text-muted" style={{ fontSize: "0.875rem" }}>
                        Showing{" "}
                        <span className="fw-semibold text-dark">{displayStart}</span>{" "}
                        to <span className="fw-semibold text-dark">{displayEnd}</span>{" "}
                        of <span className="fw-semibold text-dark">{totalEntries}</span>{" "}
                        entries
                      </div>
                      <div className="d-flex align-items-center gap-2">
                        <span className="text-muted" style={{ fontSize: "0.8rem" }}>
                          Rows per page
                        </span>
                        <Form.Select
                          size="sm"
                          value={perPage}
                          onChange={(e) => setPerPage(Number(e.target.value))}
                          style={{ width: "auto", fontSize: "0.8rem" }}
                        >
                          {PER_PAGE_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </Form.Select>
                      </div>
                      <Pagination className="mb-0">
                        <Pagination.Prev
                          disabled={safePage === 1}
                          onClick={() => goToPage(safePage - 1)}
                          style={{
                            cursor: safePage === 1 ? "not-allowed" : "pointer",
                            opacity: safePage === 1 ? 0.5 : 1,
                          }}
                        />
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                          (pageNumber) => (
                            <Pagination.Item
                              key={pageNumber}
                              active={safePage === pageNumber}
                              onClick={() => goToPage(pageNumber)}
                              style={{
                                cursor: "pointer",
                                minWidth: "38px",
                                textAlign: "center",
                              }}
                            >
                              {pageNumber}
                            </Pagination.Item>
                          ),
                        )}
                        <Pagination.Next
                          disabled={safePage === totalPages}
                          onClick={() => goToPage(safePage + 1)}
                          style={{
                            cursor:
                              safePage === totalPages ? "not-allowed" : "pointer",
                            opacity: safePage === totalPages ? 0.5 : 1,
                          }}
                        />
                      </Pagination>
                    </div>
                  </>
                )}
              </Card.Body>
            </Card>
          </Container>
        </main>
      </div>

      {/* Customers Modal — full guest list for a single booking */}
      <Modal
        show={showCustomersModal}
        onHide={() => setShowCustomersModal(false)}
        centered
        size="sm"
      >
        <Modal.Header closeButton style={{ borderBottom: "2px solid #e9ecef" }}>
          <Modal.Title
            className="fw-bold d-flex align-items-center"
            style={{ fontSize: "1rem" }}
          >
            <FaUsers className="me-2 text-primary" />
            <span>Customers ({getGuestNames(customersModalBooking).length})</span>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {customersModalBooking?.bookingCode && (
            <div className="text-muted mb-2" style={{ fontSize: "0.78rem" }}>
              Booking Code:{" "}
              <span className="fw-semibold" style={{ color: "#1d4ed8" }}>
                {customersModalBooking.bookingCode}
              </span>
            </div>
          )}
          <ul className="list-unstyled mb-0">
            {getGuestNames(customersModalBooking).map((name, idx) => (
              <li
                key={idx}
                className="d-flex align-items-center py-2"
                style={{ gap: "0.5rem", borderBottom: "1px solid #f1f3f5" }}
              >
                <FaUser style={{ color: "#98a2b3", flexShrink: 0 }} />
                <span className="fw-medium text-dark">{name}</span>
              </li>
            ))}
            {getGuestNames(customersModalBooking).length === 0 && (
              <li className="text-muted py-2">No customers found.</li>
            )}
          </ul>
        </Modal.Body>
      </Modal>
    </div>
  );
}
