import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
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
} from "react-bootstrap";
import {
  FaEye,
  FaSearch,
  FaUser,
  FaUsers,
  FaInbox,
  FaArrowLeft,
  FaExclamationCircle,
} from "react-icons/fa";
import axiosInstance from "../../components/AxiosInstance";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import { toast } from "react-hot-toast";
import "../../styles/HotelBookingListModern.css";
import DashboardRedirections from "../../components/DashboardRedirections";

const PER_PAGE_OPTIONS = [10, 25, 50, 100];

// Column-width hints kept in sync with HotelBookingList so the two
// pages line up visually under the shared hbl-modern skin. Full column
// set now mirrors Hotel exactly: Agent Name / Customer Name / Booking
// Code / Book Date / Booking Details / Deadline Date / Payment Mode /
// Notification / Action.
const COLUMN_WIDTHS = {
  sn: "40px",
  agentName: "90px",
  customerName: "120px",
  bookingCode: "95px",
  // Supplier-side confirmation number added on the DS booking detail view
  // via the "CONFIRMATION NO." button. Sits next to Booking Code so the
  // two identifiers (internal + supplier) read together. Cell renders
  // blank for rows that don't have one yet. Width tuned so the two-word
  // header ("CONFIRMATION" / "NO") wraps at its space instead of splitting
  // the word "CONFIRMATION" mid-letter — mirrors hotel + LM + LS lists.
  confirmationNo: "130px",
  bookDate: "90px",
  // Slightly trimmed to fund the wider Payment Status + Notification
  // columns below. Hotel names still wrap cleanly at word boundary.
  bookingDetails: "210px",
  deadlineDate: "105px",
  paymentMode: "110px",
  // Widened so "Payment Pending" stays on one line.
  paymentStatus: "115px",
  // Widened so "ReConfirmed" / "Confirmed" pills and the NOTIFICATION
  // header word never split mid-letter — matches HotelBookingList.
  notification: "120px",
  action: "110px",
};

// Resolve a human-readable Payment Mode label from whatever shape the
// backend sends. Copied verbatim from HotelBookingList so the two pages
// render identical labels for the same underlying value.
const getPaymentModeLabel = (booking) => {
  const raw =
    booking?.paymentMode ||
    booking?.payment_mode ||
    booking?.paymentType ||
    "";
  const norm = String(raw).trim().toUpperCase();
  if (
    norm === "CREDIT" ||
    norm === "CREDIT_LIMIT" ||
    norm === "CREDIT LIMIT" ||
    norm === "CREDITLIMIT"
  ) {
    return "Credit Limit Payment";
  }
  if (norm === "ONLINE" || norm === "ONLINE_PAYMENT" || norm === "ONLINE PAYMENT") {
    return "Online Payment";
  }
  if (norm) return raw;
  if (booking?.creditLimitPayment === true) return "Credit Limit Payment";
  if (booking?.paidOnline === true || booking?.onlinePayment === true) {
    return "Online Payment";
  }
  return "-";
};

// Notification + Payment Status follow the same configurations as
// /booking-details/hotel-booking-list:
//
//   Booking state                      Notification          Payment Status
//   Confirmed                          Confirmed (green)     Payment Pending
//   On Request, step-1 Confirm pending On Request (orange)   Payment Pending
//   ReConfirmed                        ReConfirmed (green)   Paid
//   Cancelled after ReConfirmed        Cancelled (red)       Paid
//   Cancelled before ReConfirmed       Cancelled (red)       Un-Paid
//   Not Confirmed                      Not Confirmed (red)   -
//   anything else / empty              raw text              -
//
// The hotel engine stamps confirmationStatus = "Cancelled" on cancellation and
// keeps the prior state on cancelledFromStatus. Day Stay instead sets the
// `isCancelled` flag and leaves confirmationStatus at its prior value, so the
// flag is folded in here to land on the same "Cancelled" display, and the
// prior state is read from the fields that survive the cancellation.

// Displayed status label — the single source both columns read, so they can
// never disagree.
const resolveDisplayStatus = (booking) => {
  if (booking?.isCancelled) return "Cancelled";

  // `confirmationStatus` first, then the legacy `status`. A confirm-history
  // compound ("Confirmed / ReConfirmed") collapses to its LATEST segment.
  const rawStatus = String(
    booking?.confirmationStatus || booking?.status || "",
  ).trim();
  const rawSegments = rawStatus.split("/").map((seg) => seg.trim());
  const isConfirmHistoryCompound =
    rawSegments.length > 1 &&
    rawSegments.every((seg) =>
      ["confirmed", "reconfirmed"].includes(seg.replace(/\s+/g, "").toLowerCase()),
    );
  const effective = isConfirmHistoryCompound
    ? rawSegments[rawSegments.length - 1]
    : rawStatus;
  const norm = effective.replace(/\s+/g, "").toLowerCase();

  if (norm === "cancelled" || norm === "canceled") return "Cancelled";
  if (norm === "rejected") return "Rejected";
  if (norm === "reconfirmed") return "ReConfirmed";

  // On Request room: a day-stay On Request booking is CREATED on flow
  // REQUESTED (confirmationStatus "Not Confirmed"), so this is keyed off
  // `roomStatus`, not the status text. It reads "On Request" until step-1
  // Confirm lands (onRequestConfirmed), then plain "Confirmed" — same as the
  // hotel list.
  const isOnRequestRoom = /^on\s*request$/i.test(
    String(booking?.roomStatus || "").trim(),
  );
  if (isOnRequestRoom) {
    return booking?.onRequestConfirmed ? "Confirmed" : "On Request";
  }

  if (norm === "confirmed") return "Confirmed";
  if (norm === "notconfirmed") return "Not Confirmed";
  return effective;
};

// Payment Status for the label resolveDisplayStatus returned.
const getPaymentStatusLabel = (booking, displayStatus) => {
  switch (displayStatus) {
    case "Confirmed":
    case "On Request":
      // Money not collected yet.
      return "Payment Pending";
    case "ReConfirmed":
      return "Paid";
    case "Cancelled": {
      // Settled by what the booking had reached BEFORE the cancellation:
      // confirmationStatus still holds "Confirmed" / "ReConfirmed", and
      // reconfirmation / reconfirmedAt record that a reconfirm happened.
      const priorNormalized = String(booking?.confirmationStatus || "")
        .replace(/\s+/g, "")
        .toLowerCase();
      const wasReconfirmedBeforeCancel =
        booking?.reconfirmation === true ||
        !!booking?.reconfirmedAt ||
        priorNormalized.includes("reconfirmed");
      return wasReconfirmedBeforeCancel ? "Paid" : "Un-Paid";
    }
    default:
      return "-";
  }
};

// Every customer/guest name on a day-stay booking. The list payload
// already carries the full guest list under `rooms[].guests[]`; fall back
// to the single `primaryGuest` when no per-room guests are present.
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
  if (names.length === 0 && booking?.primaryGuest) {
    const pg = booking.primaryGuest;
    const n = [pg.salutation, pg.firstName, pg.lastName]
      .filter((p) => String(p ?? "").trim())
      .join(" ")
      .trim();
    if (n) names.push(n);
  }
  return names;
};

// "dd/mm/yyyy" — same shape HotelBookingList uses in the table cells.
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

const trimTime = (t) => (t ? String(t).slice(0, 5) : "");

/**
 * DayStayBookingList — mirrors HotelBookingList for the Day Stay flow.
 * Action column is the eye icon only; it navigates to
 * /booking-details/day-stay-booking/:id where Voucher (GET .../voucher)
 * and Cancel (POST .../cancel with reason) live as buttons at the
 * bottom-left of the detail view.
 */
export default function DayStayBookingList() {
  const navigate = useNavigate();
  // Role gate mirrors HotelBookingList — Agent Name column is admin-only.
  // Reads currentActiveRole first (multi-role logins), then falls back to
  // userRole (single-role logins).
  const [role, setRole] = useState(() => {
    return localStorage.getItem("currentActiveRole")?.toLowerCase() || null;
  });
  useEffect(() => {
    const storedRole = localStorage.getItem("currentActiveRole")?.toLowerCase();
    if (storedRole && storedRole !== role) {
      setRole(storedRole);
    } else if (!storedRole) {
      const userRoles = (localStorage.getItem("userRole") || "")
        .toLowerCase()
        .split(",");
      if (userRoles.includes("agent")) setRole("agent");
      else if (userRoles.includes("staff")) setRole("staff");
      else if (userRoles.includes("admin")) setRole("admin");
    }
  }, [role]);

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

  // Filters — mirror the Hotel Booking List.
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [checkInDateFilter, setCheckInDateFilter] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState("");

  // Same seven booking-type options Hotel Booking List ships with. Day
  // Stay only has `status` + `isCancelled` today; the Reconfirmed and
  // Invoiced filters are wired against `confirmationStatus` /
  // `invoiceStatus` so they light up if the backend later starts
  // emitting those fields.
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
      const res = await axiosInstance.get("/api/day-stay-booking");
      setBookings(Array.isArray(res.data) ? res.data : []);
    } catch {
      toast.error("Failed to load Day Stay bookings");
      setBookings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  // Apply search + status + time-period + check-in-date filters in one pass.
  const filteredBookings = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const needle = search.trim().toLowerCase();
    const checkInPick = (checkInDateFilter || "").trim(); // YYYY-MM-DD
    return (bookings || []).filter((b) => {
      const isCancelled = !!b.isCancelled || normStatus(b.status) === "cancelled";
      const refDate = b.checkInDate ? new Date(b.checkInDate) : null;
      if (refDate && !isNaN(refDate.getTime())) refDate.setHours(0, 0, 0, 0);

      // Check-in Date picker — exact-day match against the booking's
      // checkInDate. Mirrors HotelBookingList: rows without a check-in
      // date are hidden while a pick is active.
      if (checkInPick) {
        const raw = String(b.checkInDate || "");
        const rowDay = raw.includes("T") ? raw.slice(0, 10) : raw.slice(0, 10);
        if (rowDay !== checkInPick) return false;
      }

      if (status === "cancelled" && !isCancelled) return false;
      if (status === "upcoming") {
        if (isCancelled) return false;
        if (!refDate || isNaN(refDate.getTime()) || refDate < today) return false;
      }
      if (status === "completed") {
        if (isCancelled) return false;
        if (!refDate || isNaN(refDate.getTime()) || refDate >= today) return false;
      }
      if (status === "onrequest") {
        if (isCancelled) return false;
        const s = normStatus(b.status || b.bookingStatus || b.confirmationStatus);
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

      if (refDate && !isNaN(refDate.getTime()) && (selectedMonth || selectedYear)) {
        const m = refDate.getMonth() + 1;
        const y = refDate.getFullYear();
        if (selectedMonth && Number(selectedMonth) !== m) return false;
        if (selectedYear && Number(selectedYear) !== y) return false;
      }

      if (needle) {
        const hay = [
          b.bookingCode,
          b.hotelName,
          ...getGuestNames(b),
          // Stay Date — shown in the Stay Date column, so a date search
          // (e.g. "26/06/2026") matches. Both dd/mm/yyyy display form and the
          // raw value are included.
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
                <h3 className="fw-bold text-dark mb-2">Day Stay Bookings</h3>
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

            {/* Filters Section — layout mirrors HotelBookingList so the two
                pages line up: Booking Type on the left, Check-in Date picker
                (with Clear button) on the right. */}
            <Row className="mb-2 g-1">
              <Col xs={12}>
                <Card
                  className="shadow-sm border-0 w-100"
                  style={{ borderRadius: "8px" }}
                >
                  <Card.Body className="p-3">
                    <Row className="g-2 align-items-end">
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
                            style={{ fontSize: "0.85rem", height: "46px", whiteSpace: "nowrap" }}
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
                          {role === "admin" && (
                            <th
                              style={{
                                ...baseHeaderStyle,
                                width: COLUMN_WIDTHS.agentName,
                              }}
                            >
                              Agent Name
                            </th>
                          )}
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
                              the DS booking detail view. DayStayBookingDTO
                              already exposes `confirmationNumber`, so no
                              backend change is needed. Cell renders blank on
                              rows that don't have one. wordBreak / overflowWrap
                              normal keep the two-word header wrapping only at
                              its space, mirroring the hotel + LS lists. */}
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
                              width: COLUMN_WIDTHS.deadlineDate,
                            }}
                          >
                            Deadline Date
                          </th>
                          <th
                            style={{
                              ...baseHeaderStyle,
                              textAlign: "center",
                              width: COLUMN_WIDTHS.paymentMode,
                            }}
                          >
                            Payment Mode
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
                              width: COLUMN_WIDTHS.notification,
                            }}
                          >
                            Notification
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
                              colSpan={role === "admin" ? 11 : 10}
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
                            // Displayed status — hotel-booking-list
                            // configurations, see resolveDisplayStatus.
                            const statusText = resolveDisplayStatus(b);
                            const timeRange =
                              trimTime(b.checkInTime) && trimTime(b.checkOutTime)
                                ? `${trimTime(b.checkInTime)} – ${trimTime(b.checkOutTime)}`
                                : "";
                            return (
                              <tr
                                key={b.id}
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
                                {role === "admin" && (
                                  <td
                                    style={{
                                      ...baseCellStyle,
                                      width: COLUMN_WIDTHS.agentName,
                                    }}
                                    className="fw-medium text-dark"
                                  >
                                    {b.agentName || b.agentCompanyName || "-"}
                                  </td>
                                )}
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
                                    already exposed by DayStayBookingDTO
                                    (service impl setConfirmationNumber on the
                                    DTO mapping). Renders blank when the
                                    supplier hasn't stamped a number yet, per
                                    the "empty means nothing shown" rule.
                                    nowrap keeps the number atomic. */}
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
                                  {/* Book Date — when the booking record
                                      was created. Falls back to createdAt
                                      when bookingDate isn't populated on
                                      older rows. */}
                                  {formatShortDate(b.bookingDate || b.createdAt) || "-"}
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
                                    {timeRange && (
                                      <span
                                        className="text-muted"
                                        style={{ fontSize: "0.75rem" }}
                                      >
                                        {timeRange}
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
                                    width: COLUMN_WIDTHS.deadlineDate,
                                    // Keep the ISO date on one line.
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {/* Deadline Date — day-only ISO fragment. */}
                                  {b.deadlineDate
                                    ? String(b.deadlineDate).split("T")[0]
                                    : "-"}
                                </td>
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    textAlign: "center",
                                    width: COLUMN_WIDTHS.paymentMode,
                                  }}
                                >
                                  {(() => {
                                    const label = getPaymentModeLabel(b);
                                    if (label === "-") {
                                      return (
                                        <span className="text-muted">-</span>
                                      );
                                    }
                                    return (
                                      <span style={{ color: "#000" }}>
                                        {label}
                                      </span>
                                    );
                                  })()}
                                </td>
                                {/* Payment Status cell — derived from the same
                                    statusText the Notification cell renders:
                                    Confirmed → Payment Pending, ReConfirmed →
                                    Paid, a cancellation → Paid or Un-Paid
                                    depending on whether it had been
                                    reconfirmed. See getPaymentStatusLabel. */}
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    textAlign: "center",
                                    width: COLUMN_WIDTHS.paymentStatus,
                                    // "Payment Pending" / "Un-Paid" / "Paid"
                                    // are single labels — never break them
                                    // mid-word.
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {(() => {
                                    const label = getPaymentStatusLabel(
                                      b,
                                      statusText,
                                    );
                                    if (label === "-") {
                                      return (
                                        <span className="text-muted">-</span>
                                      );
                                    }
                                    // Same palette as the adjacent Notification
                                    // column — green settled, red never
                                    // collected, orange still outstanding.
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
                                    width: COLUMN_WIDTHS.notification,
                                    // Keep "Confirmed" / "ReConfirmed" /
                                    // "On Request" / "Cancelled" pills on
                                    // one line — the widened column above
                                    // has the room; nowrap protects it if
                                    // the viewport ever gets narrower.
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {/* Notification — same pills as
                                      HotelBookingList (Confirmed / ReConfirmed
                                      green, On Request orange, Not Confirmed /
                                      Cancelled red). Read-only here — the
                                      click-to-confirm affordance is on the
                                      detail view. */}
                                  {(() => {
                                    const raw = statusText || "-";
                                    const pill = (color, text) => (
                                      <span
                                        style={{
                                          color,
                                          padding: "0.32rem 0.6rem",
                                          fontSize: "0.82rem",
                                          fontWeight: "600",
                                          borderRadius: "0.375rem",
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: "0.35rem",
                                        }}
                                      >
                                        {text}
                                      </span>
                                    );
                                    if (raw === "On Request") return pill("#e67e22", raw);
                                    if (raw === "Confirmed" || raw === "ReConfirmed") {
                                      return pill("#06a301", raw);
                                    }
                                    if (raw === "Cancelled" || raw === "Rejected") {
                                      return pill("#dc3545", raw);
                                    }
                                    if (raw === "Not Confirmed") {
                                      return pill(
                                        "#dc3545",
                                        <>
                                          {raw}
                                          <FaExclamationCircle
                                            style={{ fontSize: "15px", color: "#ff9800" }}
                                            title="Non-refundable booking."
                                          />
                                        </>,
                                      );
                                    }
                                    return (
                                      <span className="text-muted" style={{ fontSize: "0.82rem" }}>
                                        {raw}
                                      </span>
                                    );
                                  })()}
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
                                          `/booking-details/day-stay-booking/${b.id}`,
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
                                            `/booking-details/day-stay-booking/${b.id}`,
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
