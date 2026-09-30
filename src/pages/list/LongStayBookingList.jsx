import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  Table,
  Spinner,
  Pagination,
  Container,
  Row,
  Col,
  Form,
  InputGroup,
  Badge,
  Modal,
  Button,
} from "react-bootstrap";
import {
  FaEye,
  FaSearch,
  FaUser,
  FaUsers,
  FaInbox,
  FaArrowLeft,
} from "react-icons/fa";
import axiosInstance from "../../components/AxiosInstance";
import { formatDateTime } from "../../utils/dateUtils";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import { toast } from "react-hot-toast";
import "../../styles/HotelBookingListModern.css";
import DashboardRedirections from "../../components/DashboardRedirections";

const PER_PAGE_OPTIONS = [10, 25, 50, 100];

// Column-width hints kept in sync with HotelBookingList so the two
// pages line up visually under the shared hbl-modern skin.
const COLUMN_WIDTHS = {
  sn: "40px",
  customerName: "150px",
  bookingCode: "100px",
  // Supplier-side confirmation number added on the LS booking detail view
  // via the "CONFIRMATION NO." button. Sits next to Booking Code so the
  // two identifiers (internal + supplier) read together. Cell renders
  // blank for rows that don't have one yet. Width tuned so the two-word
  // header ("CONFIRMATION" / "NO") wraps at its space instead of splitting
  // the word "CONFIRMATION" mid-letter — mirrors the hotel + LM lists.
  confirmationNo: "130px",
  bookDate: "95px",
  bookingDetails: "240px",
  nights: "70px",
  total: "110px",
  paymentStatus: "110px",
  status: "110px",
  action: "70px",
};

const STATUS_META = {
  CONFIRMED: { label: "Confirmed", bg: "#e7f6ec", color: "#1b7f3a", dot: "#22c55e" },
  COMPLETED: { label: "Completed", bg: "#eff8ff", color: "#175cd3", dot: "#3b82f6" },
  PENDING:   { label: "Pending",   bg: "#fff7e6", color: "#b76e00", dot: "#f59e0b" },
  CANCELLED: { label: "Cancelled", bg: "#fdecec", color: "#b42318", dot: "#ef4444" },
  // On Request — orange pill, same palette the hotel + LM lists use for this
  // state. Aliased under every spelling the backend has been seen to emit
  // (uppercase `ONREQUEST`, snake `ON_REQUEST`, spaced `On Request`,
  // `Requested`/`REQUESTED`) so the Status column never falls through to the
  // unstyled raw-text branch of StatusPill for an on-request booking.
  ONREQUEST:    { label: "On Request", bg: "#fff3e0", color: "#e67e22", dot: "#f59e0b" },
  ON_REQUEST:   { label: "On Request", bg: "#fff3e0", color: "#e67e22", dot: "#f59e0b" },
  "On Request": { label: "On Request", bg: "#fff3e0", color: "#e67e22", dot: "#f59e0b" },
  REQUESTED:    { label: "Requested",  bg: "#fff3e0", color: "#e67e22", dot: "#f59e0b" },
  Requested:    { label: "Requested",  bg: "#fff3e0", color: "#e67e22", dot: "#f59e0b" },
  // ReConfirmed — green pill, same palette hotel + LM lists use.
  RECONFIRMED:  { label: "ReConfirmed", bg: "#e7f6ec", color: "#06a301", dot: "#22c55e" },
  ReConfirmed:  { label: "ReConfirmed", bg: "#e7f6ec", color: "#06a301", dot: "#22c55e" },
  Reconfirmed:  { label: "ReConfirmed", bg: "#e7f6ec", color: "#06a301", dot: "#22c55e" },
};

// Resolve the Payment Status label from the booking's DISPLAYED status — same
// mapping as /booking-details/hotel-booking-list:
//   Confirmed   → Payment Pending
//   On Request  → Payment Pending
//   ReConfirmed → Paid
//   Cancelled   → Paid when the booking had been reconfirmed before it was
//                 cancelled, otherwise Un-Paid
// Anything else — Pending, Completed, or an unknown/empty status — has no
// defined mapping and renders "-".
//
// On Request bookings haven't collected money yet, so they carry the same
// "Payment Pending" meaning as a genuinely Confirmed row. The Status column
// still shows them as "On Request" (orange) — only the Payment Status column
// collapses the two into the same settled/unsettled label.
//
// A cancelled booking reports whether the money had already been collected at
// the point of cancellation rather than the cancellation itself: a history that
// reached ReConfirmed was paid, one that stopped at On Request / Confirmed
// never was.
//
// The Status column on this page renders `bookingStatus`, so that is the field
// consulted first — the two columns can then never disagree. `confirmationStatus`
// is the fallback when bookingStatus is blank, matching the `bookingStatus ||
// confirmationStatus` idiom this page already uses in its Booking Type filter.
const getPaymentStatusLabel = (booking) => {
  // Cancelled is checked first: the label reflects what the booking reached
  // BEFORE the cancellation. `cancelStatus` is treated as a cancellation signal
  // alongside bookingStatus, mirroring the isCancelled test in filteredBookings.
  const rawStatus = String(booking?.bookingStatus || booking?.confirmationStatus || "");
  const segments = rawStatus
    .split("/")
    .map((seg) => seg.replace(/\s+/g, "").toLowerCase())
    .filter(Boolean);
  if (segments.length === 0 && booking?.cancelStatus !== true) return "-";

  const latest = segments[segments.length - 1];
  if (booking?.cancelStatus === true || latest === "cancelled" || latest === "canceled") {
    const cancelledFromNormalized = String(booking?.cancelledFromStatus || "")
      .replace(/\s+/g, "")
      .toLowerCase();
    const wasReconfirmedBeforeCancel =
      booking?.reconfirmation === true ||
      segments.includes("reconfirmed") ||
      cancelledFromNormalized.includes("reconfirmed");
    return wasReconfirmedBeforeCancel ? "Paid" : "Un-Paid";
  }

  // Collapse a confirm-history compound ("Confirmed / ReConfirmed") to its
  // LATEST segment, exactly as the hotel list does.
  const isConfirmHistoryCompound =
    segments.length > 1 &&
    segments.every((seg) => ["confirmed", "reconfirmed"].includes(seg));
  const effective = isConfirmHistoryCompound ? latest : segments.join("/");

  if (effective === "reconfirmed") return "Paid";
  if (effective === "confirmed") {
    // Both display states collapse to the same "money not yet collected"
    // label: a genuine "Confirmed" row AND an on-request-room-still-pending
    // row (whose Status column shows "On Request" via the display override).
    // The Status column keeps the two visually distinct on its own.
    return "Payment Pending";
  }
  // bookingStatus stamped directly as ONREQUEST / ON_REQUEST / "On Request"
  // (Long Stay stamps this at the top level, unlike the hotel list where
  // it hides under confirmationStatus="Confirmed" + roomStatus="On Request").
  if (effective === "onrequest" || effective === "on_request") {
    return "Payment Pending";
  }

  return "-";
};

// Every customer/guest name on a long-stay booking. The list payload
// already carries the full guest list under `rooms[].guests[]`; fall back
// to the single `primaryGuestName` when no per-room guests are present.
const getGuestNames = (booking) => {
  const names = [];
  if (Array.isArray(booking?.rooms)) {
    booking.rooms.forEach((room) => {
      (room?.guests || []).forEach((g) => {
        const n = [g?.salutation, g?.firstName, g?.lastName]
          .filter((p) => String(p ?? "").trim())
          .join(" ")
          .trim();
        if (n) names.push(n);
      });
    });
  }
  if (names.length === 0 && booking?.primaryGuestName) {
    names.push(booking.primaryGuestName);
  }
  return names;
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

// "dd/mm/yyyy" — same shape HotelBookingList uses in the table cells so
// dates render identically across both pages.
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

export default function LongStayBookingList() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1); // 1-indexed to mirror HotelBookingList
  const [perPage, setPerPage] = useState(10);

  // "Customers (N)" modal — opened from the "+N more" badge on the
  // Customer Name column to show every guest on a booking.
  const [showCustomersModal, setShowCustomersModal] = useState(false);
  const [customersModalBooking, setCustomersModalBooking] = useState(null);

  const handleShowCustomers = (booking) => {
    setCustomersModalBooking(booking);
    setShowCustomersModal(true);
  };

  // Filters — mirror the Hotel Booking List: a single "Booking Type"
  // dropdown (All / Upcoming / Completed / Cancelled), a search box and
  // a Month + Year time-period card. All applied client-side over the
  // single fetch.
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  // Check-in Date filter — exact-day match, mirrors HotelBookingList.
  const [checkInDateFilter, setCheckInDateFilter] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState("");

  // Same seven booking-type options Hotel Booking List ships with. For
  // long-stay bookings the new three map to the closest available field:
  // PENDING → On Request; an optional `confirmationStatus` /
  // `invoiceStatus` is read for Reconfirmed / Invoiced so the filters
  // light up the moment the backend starts emitting those fields.
  const statusOptions = useMemo(
    () => [
      { value: "all", label: "All" },
      { value: "upcoming", label: "Upcoming" },
      { value: "completed", label: "Completed" },
      { value: "cancelled", label: "Cancelled" },
      { value: "onrequest", label: "On Request" },
      { value: "reconfirmed", label: "Reconfirmed" },
      { value: "invoiced", label: "Invoiced" },
    ],
    [],
  );

  const normStatus = (v) =>
    String(v ?? "").replace(/[\s_-]+/g, "").toLowerCase();

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: current - 2014 }, (_, i) => 2020 + i);
  }, []);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get(
        `/api/longStayBooking?page=0&size=500`,
      );
      setBookings(res.data.content || []);
    } catch {
      toast.error("Failed to load Long Stay bookings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  // Apply search + status + time-period filters in one pass.
  const filteredBookings = useMemo(() => {
    const now = new Date();
    const needle = search.trim().toLowerCase();
    // YYYY-MM-DD from the <input type="date">; compare against the booking's
    // check-in normalised to the same day form.
    const checkInPick = (checkInDateFilter || "").trim();
    const toIsoDay = (d) => (d ? String(d).split("T")[0].trim() : "");
    return (bookings || []).filter((b) => {
      const isCancelled =
        b.bookingStatus === "CANCELLED" || b.cancelStatus === true;
      const checkIn = b.checkInDate ? new Date(b.checkInDate) : null;
      const checkOut = b.checkOutDate ? new Date(b.checkOutDate) : null;
      if (checkInPick && toIsoDay(b.checkInDate) !== checkInPick) return false;
      if (status === "cancelled" && !isCancelled) return false;
      if (status === "upcoming") {
        if (isCancelled) return false;
        if (!checkIn || checkIn < now) return false;
      }
      if (status === "completed") {
        if (isCancelled) return false;
        if (!checkOut || checkOut > now) return false;
      }
      if (status === "onrequest") {
        if (isCancelled) return false;
        const s = normStatus(b.bookingStatus || b.confirmationStatus);
        if (s !== "pending" && s !== "onrequest") return false;
      }
      if (status === "reconfirmed") {
        if (isCancelled) return false;
        const cs = normStatus(b.confirmationStatus);
        if (cs !== "reconfirmed") return false;
      }
      if (status === "invoiced") {
        if (isCancelled) return false;
        const inv =
          normStatus(b.invoiceStatus) === "invoiced" ||
          b.invoiced === true ||
          b.isInvoiced === true;
        if (!inv) return false;
      }

      if (checkIn && (selectedMonth || selectedYear)) {
        const m = checkIn.getMonth() + 1;
        const y = checkIn.getFullYear();
        if (selectedMonth && Number(selectedMonth) !== m) return false;
        if (selectedYear && Number(selectedYear) !== y) return false;
      }

      if (needle) {
        const hay = [
          b.bookingCode,
          b.primaryGuestName,
          ...getGuestNames(b),
          b.primaryGuestEmail,
          b.hotelName,
          // Stay dates — shown in the Stay column, so a check-in / check-out
          // date search (e.g. "26/06/2026") matches. Both dd/mm/yyyy display
          // form and the raw value are included.
          formatShortDate(b.checkInDate),
          formatShortDate(b.checkOutDate),
          b.checkInDate,
          b.checkOutDate,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [bookings, search, status, checkInDateFilter, selectedMonth, selectedYear]);

  // Reset to page 1 whenever a filter changes.
  useEffect(() => {
    setPage(1);
  }, [search, status, checkInDateFilter, selectedMonth, selectedYear, perPage]);

  // Pagination derived from the filtered list (single client-side window).
  const totalEntries = filteredBookings.length;
  const safeTotalPages = Math.max(1, Math.ceil(totalEntries / perPage));
  const currentPage = Math.min(page, safeTotalPages);
  const serialNumberBase = (currentPage - 1) * perPage;
  const pageBookings = filteredBookings.slice(
    serialNumberBase,
    serialNumberBase + perPage,
  );
  const hasResults = totalEntries > 0;
  const displayStart = hasResults ? serialNumberBase + 1 : 0;
  const displayEnd = hasResults
    ? Math.min(serialNumberBase + pageBookings.length, totalEntries)
    : 0;

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
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main
          className="flex-grow-1 p-3"
          style={{ width: "100%", overflow: "hidden" }}
        >
          <Container fluid className="px-0">
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

            {/* Header: Title + Search (left) | Time Period (right) */}
            <div className="d-flex justify-content-between align-items-end mb-3 hbl-header">
              <div className="hbl-header-left">
                <h3 className="fw-bold text-dark mb-2">Long Stay Bookings</h3>
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
                    placeholder="Search here..."
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

            {/* Filters Section */}
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
                          value={status}
                          onChange={(e) => setStatus(e.target.value)}
                          size="sm"
                          aria-label="Booking type filter"
                          style={{ fontSize: "0.85rem", height: "46px" }}
                        >
                          {statusOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </Form.Select>
                      </Col>
                      {/* Check-in Date filter — mirrors HotelBookingList. */}
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

            {/* Table */}
            <Card
              className="shadow-sm border-0"
              style={{ borderRadius: "8px", overflow: "hidden", width: "100%" }}
            >
              <Card.Body className="p-0" style={{ width: "100%" }}>
                {loading ? (
                  <div className="text-center p-5">
                    <Spinner animation="border" variant="primary" />
                    <p className="mt-2 text-muted">Loading bookings...</p>
                  </div>
                ) : (
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
                          <th
                            style={{
                              ...baseHeaderStyle,
                              textAlign: "center",
                              width: COLUMN_WIDTHS.sn,
                            }}
                          >
                            S.N
                          </th>
                          <th
                            style={{
                              ...baseHeaderStyle,
                              width: COLUMN_WIDTHS.customerName,
                            }}
                          >
                            Customer Name
                          </th>
                          <th
                            style={{
                              ...baseHeaderStyle,
                              width: COLUMN_WIDTHS.bookingCode,
                            }}
                          >
                            Booking Code
                          </th>
                          {/* Confirmation No — supplier's confirmation number,
                              populated via the "CONFIRMATION NO." button on
                              the LS booking detail view. LongStayBookingDTO
                              already exposes `confirmationNumber`, so no
                              backend change is needed. Cell renders blank on
                              rows that don't have one. wordBreak / overflowWrap
                              normal keep the two-word header wrapping only at
                              its space, mirroring the hotel list. */}
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
                          <th
                            style={{
                              ...baseHeaderStyle,
                              textAlign: "center",
                              width: COLUMN_WIDTHS.bookDate,
                            }}
                          >
                            Book Date
                          </th>
                          <th
                            style={{
                              ...baseHeaderStyle,
                              width: COLUMN_WIDTHS.bookingDetails,
                            }}
                          >
                            Booking Details
                          </th>
                          <th
                            style={{
                              ...baseHeaderStyle,
                              textAlign: "center",
                              width: COLUMN_WIDTHS.nights,
                            }}
                          >
                            Nights
                          </th>
                          <th
                            style={{
                              ...baseHeaderStyle,
                              textAlign: "right",
                              width: COLUMN_WIDTHS.total,
                            }}
                          >
                            Total
                          </th>
                          {/* Payment Status column — same mapping as
                              /booking-details/hotel-booking-list. See
                              getPaymentStatusLabel. */}
                          <th
                            style={{
                              ...baseHeaderStyle,
                              textAlign: "center",
                              width: COLUMN_WIDTHS.paymentStatus,
                            }}
                          >
                            Payment Status
                          </th>
                          <th
                            style={{
                              ...baseHeaderStyle,
                              textAlign: "center",
                              width: COLUMN_WIDTHS.status,
                            }}
                          >
                            Status
                          </th>
                          <th
                            style={{
                              ...baseHeaderStyle,
                              textAlign: "center",
                              width: COLUMN_WIDTHS.action,
                            }}
                          >
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageBookings.length === 0 ? (
                          <tr>
                            <td
                              colSpan={10}
                              className="text-center py-5 text-muted"
                              style={{
                                border: "1px solid #dee2e6",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              <FaInbox
                                style={{
                                  fontSize: "2.5rem",
                                  marginBottom: "10px",
                                  color: "#adb5bd",
                                }}
                              />
                              <p className="mt-2 mb-0 fs-5">
                                No bookings found.
                              </p>
                            </td>
                          </tr>
                        ) : (
                          pageBookings.map((b, i) => {
                            // Long-stay bookings can advance to ReConfirmed while
                            // the roll-up `bookingStatus` column still reads
                            // "Confirmed" (the reconfirm write only stamps
                            // `confirmationStatus`). Prefer confirmationStatus
                            // when it's ahead of bookingStatus so the list pill
                            // matches what the detail page shows — mirrors the
                            // same precedence getPaymentStatusLabel already uses.
                            const confNorm = String(b?.confirmationStatus || "")
                              .replace(/\s+/g, "")
                              .toLowerCase();
                            const effectiveStatus =
                              !b.cancelStatus && confNorm === "reconfirmed"
                                ? "Reconfirmed"
                                : b.bookingStatus;
                            const sMeta = STATUS_META[effectiveStatus];
                            return (
                              <tr
                                key={b.longStayBookingId}
                                style={{
                                  backgroundColor:
                                    i % 2 === 0 ? "#ffffff" : "#f8f9fa",
                                  transition: "background-color 0.2s ease",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor =
                                    "#e7f3ff";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor =
                                    i % 2 === 0 ? "#ffffff" : "#f8f9fa";
                                }}
                              >
                                <td
                                  className="text-muted fw-semibold"
                                  style={{
                                    ...baseCellStyle,
                                    textAlign: "center",
                                    color: "#6c757d",
                                    width: COLUMN_WIDTHS.sn,
                                  }}
                                >
                                  {serialNumberBase + i + 1}
                                </td>
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    width: COLUMN_WIDTHS.customerName,
                                  }}
                                >
                                  {(() => {
                                    const names = getGuestNames(b);
                                    const first = names[0] || "-";
                                    const extra = Math.max(0, names.length - 1);
                                    return (
                                      <>
                                        <div
                                          className="d-flex align-items-center"
                                          style={{
                                            gap: "0.4rem",
                                            flexWrap: "wrap",
                                          }}
                                        >
                                          <span
                                            className="d-inline-flex align-items-center"
                                            style={{ gap: "0.3rem" }}
                                          >
                                            <FaUser
                                              style={{
                                                color: "#6c757d",
                                                fontSize: "0.78rem",
                                                flexShrink: 0,
                                              }}
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
                                              onClick={() =>
                                                handleShowCustomers(b)
                                              }
                                              onKeyDown={(e) => {
                                                if (
                                                  e.key === "Enter" ||
                                                  e.key === " "
                                                ) {
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
                                        {b.primaryGuestEmail && (
                                          <div
                                            className="text-muted"
                                            style={{ fontSize: "0.7rem" }}
                                          >
                                            {b.primaryGuestEmail}
                                          </div>
                                        )}
                                      </>
                                    );
                                  })()}
                                </td>
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    width: COLUMN_WIDTHS.bookingCode,
                                  }}
                                >
                                  <span className="fw-bold text-primary">
                                    {b.bookingCode || "-"}
                                  </span>
                                </td>
                                {/* Confirmation No cell — reads the field
                                    already exposed by LongStayBookingDTO.
                                    Renders blank when the supplier hasn't
                                    stamped a number yet, per the "empty means
                                    nothing shown" rule. nowrap keeps the
                                    number atomic. */}
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    width: COLUMN_WIDTHS.confirmationNo,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {b.confirmationNumber ? (
                                    <span
                                      className="fw-semibold text-dark"
                                      style={{ fontSize: "0.85rem" }}
                                    >
                                      {b.confirmationNumber}
                                    </span>
                                  ) : (
                                    <span className="text-muted">-</span>
                                  )}
                                </td>
                                <td
                                  className="text-muted"
                                  style={{
                                    ...baseCellStyle,
                                    textAlign: "center",
                                    width: COLUMN_WIDTHS.bookDate,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {formatShortDate(b.bookingDateTime) ||
                                    formatDateTime(b.bookingDateTime) ||
                                    "-"}
                                </td>
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    width: COLUMN_WIDTHS.bookingDetails,
                                  }}
                                >
                                  <div
                                    className="d-flex align-items-center"
                                    style={{
                                      gap: "0.35rem",
                                      flexWrap: "wrap",
                                    }}
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
                                  style={{
                                    ...baseCellStyle,
                                    textAlign: "center",
                                    fontFamily: "monospace",
                                    width: COLUMN_WIDTHS.nights,
                                  }}
                                >
                                  {b.totalNights ?? "-"}
                                </td>
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    textAlign: "right",
                                    width: COLUMN_WIDTHS.total,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  <span className="fw-semibold text-dark">
                                    {b.displayCurrencyCode &&
                                    b.displayCurrencyCode !== "AED" &&
                                    Number(b.displayAmount) > 0
                                      ? `${b.displayCurrencyCode} ${Number(
                                          b.displayAmount,
                                        ).toFixed(2)}`
                                      : b.totalAmount ?? "-"}
                                  </span>
                                </td>
                                {/* Payment Status cell — derived from the
                                    booking's displayed Status: Confirmed →
                                    Payment Pending, ReConfirmed → Paid, a
                                    cancellation → Paid or Un-Paid depending on
                                    whether it had been reconfirmed. See
                                    getPaymentStatusLabel. */}
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    textAlign: "center",
                                    width: COLUMN_WIDTHS.paymentStatus,
                                  }}
                                >
                                  {(() => {
                                    const label = getPaymentStatusLabel(b);
                                    if (label === "-") {
                                      return (
                                        <span className="text-muted">-</span>
                                      );
                                    }
                                    // Same palette as the hotel list — green
                                    // settled, red never collected, orange
                                    // still outstanding.
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
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    textAlign: "center",
                                    width: COLUMN_WIDTHS.status,
                                  }}
                                >
                                  <StatusPill
                                    meta={sMeta}
                                    raw={effectiveStatus}
                                  />
                                </td>
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    textAlign: "center",
                                    width: COLUMN_WIDTHS.action,
                                  }}
                                >
                                  <div className="d-flex justify-content-center align-items-center">
                                    <FaEye
                                      role="button"
                                      tabIndex={0}
                                      title="View full booking details"
                                      style={{
                                        fontSize: "18px",
                                        color: "#007bff",
                                        cursor: "pointer",
                                      }}
                                      onClick={() =>
                                        navigate(
                                          `/booking-details/long-stay-booking/${b.longStayBookingId}`,
                                          { state: { booking: b } },
                                        )
                                      }
                                      onKeyDown={(e) => {
                                        if (
                                          e.key === "Enter" ||
                                          e.key === " "
                                        ) {
                                          e.preventDefault();
                                          navigate(
                                            `/booking-details/long-stay-booking/${b.longStayBookingId}`,
                                            { state: { booking: b } },
                                          );
                                        }
                                      }}
                                    />
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </Table>
                  </div>
                )}
              </Card.Body>
            </Card>

            {/* Pagination */}
            {!loading && hasResults && (
              <Card
                className="shadow-sm border-0 mt-3"
                style={{ borderRadius: "8px" }}
              >
                <Card.Body className="py-3">
                  <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 hbl-pagination-bar">
                    <div
                      className="text-muted"
                      style={{ fontSize: "0.875rem" }}
                    >
                      Showing{" "}
                      <span className="fw-semibold text-dark">
                        {displayStart}
                      </span>{" "}
                      to{" "}
                      <span className="fw-semibold text-dark">
                        {displayEnd}
                      </span>{" "}
                      of{" "}
                      <span className="fw-semibold text-dark">
                        {totalEntries}
                      </span>{" "}
                      entries
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <span
                        className="text-muted"
                        style={{ fontSize: "0.8rem" }}
                      >
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
                        disabled={currentPage === 1}
                        onClick={() =>
                          currentPage > 1 && setPage(currentPage - 1)
                        }
                        style={{
                          cursor:
                            currentPage === 1 ? "not-allowed" : "pointer",
                          opacity: currentPage === 1 ? 0.5 : 1,
                        }}
                      />
                      {Array.from(
                        { length: safeTotalPages },
                        (_, i) => i + 1,
                      ).map((pageNumber) => (
                        <Pagination.Item
                          key={pageNumber}
                          active={currentPage === pageNumber}
                          onClick={() => setPage(pageNumber)}
                          style={{
                            cursor: "pointer",
                            minWidth: "38px",
                            textAlign: "center",
                          }}
                        >
                          {pageNumber}
                        </Pagination.Item>
                      ))}
                      <Pagination.Next
                        disabled={currentPage === safeTotalPages}
                        onClick={() =>
                          currentPage < safeTotalPages &&
                          setPage(currentPage + 1)
                        }
                        style={{
                          cursor:
                            currentPage === safeTotalPages
                              ? "not-allowed"
                              : "pointer",
                          opacity:
                            currentPage === safeTotalPages ? 0.5 : 1,
                        }}
                      />
                    </Pagination>
                  </div>
                </Card.Body>
              </Card>
            )}
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
        <Modal.Header
          closeButton
          style={{ borderBottom: "2px solid #e9ecef" }}
        >
          <Modal.Title
            className="fw-bold d-flex align-items-center"
            style={{ fontSize: "1rem" }}
          >
            <FaUsers className="me-2 text-primary" />
            <span>
              Customers ({getGuestNames(customersModalBooking).length})
            </span>
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
