import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Row,
  Col,
  Card,
  Form,
  Table,
  InputGroup,
  Spinner,
  Pagination,
  Button,
} from "react-bootstrap";
import {
  FaSearch,
  FaEye,
  FaInbox,
  FaUser,
  FaArrowLeft,
} from "react-icons/fa";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import toast from "react-hot-toast";
// Shared "hotel booking list" look (Lexend, red/white theme, table/card/
// pagination styling). Same skin the /booking-details/hotel-booking-list,
// long-stay, and last-minute lists use — the four pages line up visually.
import "../../styles/HotelBookingListModern.css";
import DashboardRedirections from "../../components/DashboardRedirections";

const PER_PAGE_OPTIONS = [10, 25, 50, 100];

// Column-width hints kept in sync with LastMinuteBookingList / HotelBookingList
// so all list tables render at the same widths under the shared hbl-modern skin.
const COLUMN_WIDTHS = {
  sn: "40px",
  agentName: "90px",
  customerName: "150px",
  bookingCode: "100px",
  bookDate: "95px",
  bookingDetails: "240px",
  deadlineDate: "110px",
  paymentMode: "140px",
  status: "110px",
  action: "70px",
};

// Human-readable label for the persisted `modeOfPayment` value. Codes come
// from the booking wizard's PAYMENT_MODES; unknown values (legacy rows,
// admin edits) fall back to a title-cased, underscore-stripped version so
// the cell is never blank when a value exists.
const PAYMENT_MODE_LABELS = {
  CREDIT: "Credit Limit Payment",
  CARD: "Card payment",
  BANK_TRANSFER: "Bank transfer",
  CASH: "Cash",
  ONLINE: "Online Payment",
};
const formatPaymentMode = (mode) => {
  if (mode === null || mode === undefined) return "-";
  const key = String(mode).trim().toUpperCase();
  if (!key) return "-";
  if (PAYMENT_MODE_LABELS[key]) return PAYMENT_MODE_LABELS[key];
  return key
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
};

// Derived "Payment Status" label — the column WAS titled "Payment Mode" and
// just echoed the stored mode, but that's misleading for CONFIRMED (Hold
// Package and Pay Later) rows where nothing has actually been debited yet.
// This derivation mirrors PackageBookingDetailView's paymentStatus block:
//
//   • Cancelled + previously RECONFIRMED via credit → "Refunded"
//   • Cancelled + previously RECONFIRMED via ONLINE → "Cancelled (Paid)"
//   • Cancelled otherwise                           → "Cancelled — Not Paid"
//   • RECONFIRMED + modeOfPayment=ONLINE            → "Paid Online"
//   • RECONFIRMED otherwise                         → "Paid via {mode}"
//   • CONFIRMED (Hold Package and Pay Later)        → "Not Paid"
//   • Anything else                                 → the stored mode label
//
// Returns { label, color } — colour drives inline styling on the cell so
// green/amber/red states are visible at a glance.
const derivePaymentStatus = (b) => {
  const status = String(b?.bookingStatus || "").trim().toUpperCase();
  const mode = String(b?.modeOfPayment || "").trim().toUpperCase();
  const isOnline = mode === "ONLINE";
  if (b?.isCancelled === true || status === "CANCELLED") {
    if (status === "RECONFIRMED" || status === "CANCELLED") {
      if (isOnline) return { label: "Cancelled (Paid Online)", color: "#dc2626" };
    }
    // A cancelled row whose pre-cancel state was RECONFIRMED via credit gets
    // its debit restored server-side; treat that as refunded.
    if (mode && !isOnline) return { label: "Refunded", color: "#0d9488" };
    return { label: "Cancelled — Not Paid", color: "#dc2626" };
  }
  if (status === "RECONFIRMED") {
    if (isOnline) return { label: "Paid Online", color: "#16a34a" };
    const humanMode = formatPaymentMode(mode);
    return {
      label: `Paid via ${humanMode !== "-" ? humanMode : "Credit"}`,
      color: "#16a34a",
    };
  }
  if (status === "CONFIRMED") {
    return { label: "Not Paid", color: "#b45309" };
  }
  return { label: formatPaymentMode(mode), color: "#0f172a" };
};

// "dd/mm/yyyy" — matches the last-minute list's date shape so the two tables
// render dates identically.
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

// Deadline Date column uses ISO-style yyyy-MM-dd. Kept separate from
// formatShortDate so the other columns (Book Date / Travel Date) still
// render as dd/mm/yyyy.
const formatIsoDate = (dateString) => {
  if (!dateString) return "";
  const normalized = String(dateString).includes("T")
    ? dateString
    : `${dateString}T00:00:00`;
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
};

// Package-booking lifecycle — now mirrors the hotel flow with three states:
//   RECONFIRMED (Book & Voucher / paid up front) — blue pill
//   CONFIRMED   (Book Now & Voucher later / held) — green pill
//   CANCELLED   — red pill
const STATUS_META = {
  ReConfirmed: { label: "ReConfirmed", bg: "#e6f0ff", color: "#1d4ed8", dot: "#3b82f6" },
  Confirmed:   { label: "Confirmed",   bg: "#e7f6ec", color: "#1b7f3a", dot: "#22c55e" },
  Cancelled:   { label: "Cancelled",   bg: "#fdecec", color: "#b42318", dot: "#ef4444" },
};

// Derive the display label from the persisted lifecycle status. Cancellation
// takes precedence; falls back to the bookingConfirmation choice for legacy
// rows that pre-date the bookingStatus column.
const deriveDisplayStatus = (b) => {
  if (b?.isCancelled === true) return "Cancelled";
  const raw = String(b?.bookingStatus || "").trim().toUpperCase();
  if (raw === "RECONFIRMED") return "ReConfirmed";
  if (raw === "CANCELLED") return "Cancelled";
  if (raw === "CONFIRMED") return "Confirmed";
  // Legacy fallback — reconstruct from the booking-confirmation choice.
  if (b?.bookingConfirmation === "Book Now & Voucher later") return "Confirmed";
  if (b?.bookingConfirmation === "Book & Voucher") return "ReConfirmed";
  return "Confirmed";
};

// Plain colored bold text — matches the hotel-booking-list notification cell
// (green for Confirmed / ReConfirmed, red for Cancelled) instead of a filled
// pill with a dot. Preserves the `meta` prop shape so callers stay unchanged.
const StatusPill = ({ meta, raw }) => {
  const label = meta?.label || raw || "-";
  const normalized = String(label).replace(/\s+/g, "").toLowerCase();
  let color = "#6c757d";
  if (normalized === "confirmed" || normalized === "reconfirmed") color = "#06a301";
  else if (normalized === "cancelled") color = "#dc3545";
  else if (normalized === "onrequest") color = "#e67e22";
  return (
    <span
      style={{
        color,
        padding: "0.32rem 0.6rem",
        fontSize: "0.82rem",
        fontWeight: 600,
        borderRadius: "0.375rem",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
};

const PackageBookingList = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [role, setRole] = useState(() => {
    return localStorage.getItem("currentActiveRole")?.toLowerCase() || null;
  });
  const [userId, setUserId] = useState(() => {
    const stored = localStorage.getItem("userId");
    return (stored && stored !== "null") ? stored : null;
  });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState(10);
  const [page, setPage] = useState(1);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  // Exact-day travel-date filter — mirrors the Check-in Date control on the
  // last-minute list. Applied client-side.
  const [travelDateFilter, setTravelDateFilter] = useState("");
  const [allBookings, setAllBookings] = useState([]); // Store all bookings for client-side pagination
  // Server-side pagination metadata. `serverPaginated` is true when the
  // current endpoint returns a Spring Page (i.e. /bookings, /all) so we can
  // trust its totalElements/totalPages and avoid re-slicing client-side.
  // The /cancelled endpoint returns a plain List, so we paginate it locally.
  const [serverPaginated, setServerPaginated] = useState(false);
  const [serverTotalElements, setServerTotalElements] = useState(0);
  const [serverTotalPages, setServerTotalPages] = useState(0);

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 2014 }, (_, i) => 2020 + i);

  // Fetch bookings from API
  const fetchBookings = useCallback(async () => {
    // SECURITY BLOCK:
    // 1. If role is missing, we don't know what to fetch.
    if (!role) {
      console.log("Blocking fetchBookings: role is missing.");
      return;
    }

    // 2. If we are an agent or staff but don't have the ID yet, do NOT call.
    if ((role === "agent" || role === "staff") && (!userId || userId === "null")) {
      console.log("Blocking fetchBookings: role is " + role + " but userId is missing.");
      return;
    }

    try {
      setLoading(true);

      const params = {
        page: page - 1,
        limit: perPage
      };

      // Role-based filtering
      if (role === "agent" && userId) {
        params.agentId = userId;
      } else if (role === "staff" && userId) {
        params.staffId = userId;
      }

      // Time Period filter — backend matches month/year against travelDate.
      if (selectedMonth) params.month = selectedMonth;
      if (selectedYear) params.year = selectedYear;

      // Switch endpoint based on status: "all" hits the dedicated all-statuses
      // endpoint, "cancelled" the cancelled-only list, anything else (upcoming
      // / completed / reconfirmed / confirmed) falls back to the active-
      // bookings endpoint — ReConfirmed / Confirmed then narrow client-side.
      let endpoint;
      if (status === "all") {
        endpoint = "/api/v1/package-booking/all";
      } else if (status === "cancelled") {
        endpoint = "/api/v1/package-booking/cancelled";
      } else {
        endpoint = "/api/v1/package-booking/bookings";
      }

      console.log(`Package Booking API Request -> ${endpoint} with params:`, params);
      const response = await axiosInstance.get(endpoint, { params });

      const data = response.data;
      if (data && Array.isArray(data.content)) {
        // Spring Page response — backend already paginated. Trust its totals
        // and don't re-slice client-side.
        setAllBookings(data.content);
        setServerPaginated(true);
        setServerTotalElements(
          typeof data.totalElements === "number"
            ? data.totalElements
            : data.content.length,
        );
        setServerTotalPages(
          typeof data.totalPages === "number" && data.totalPages > 0
            ? data.totalPages
            : 1,
        );
      } else if (Array.isArray(data)) {
        // Plain list response (e.g. /cancelled). Paginate client-side.
        setAllBookings(data);
        setServerPaginated(false);
        setServerTotalElements(data.length);
        setServerTotalPages(Math.max(1, Math.ceil(data.length / perPage)));
      } else {
        setAllBookings([]);
        setServerPaginated(false);
        setServerTotalElements(0);
        setServerTotalPages(0);
      }
    } catch (error) {
      console.error("Error fetching package bookings:", error);
      toast.error("Failed to load bookings");
      setAllBookings([]);
      setServerPaginated(false);
      setServerTotalElements(0);
      setServerTotalPages(0);
    } finally {
      setLoading(false);
    }
  }, [status, page, perPage, role, userId, selectedMonth, selectedYear]);

  // Handle role sync if it's missing from localStorage initially
  useEffect(() => {
    const storedRole = localStorage.getItem("currentActiveRole")?.toLowerCase();
    if (storedRole && storedRole !== role) {
      setRole(storedRole);
    } else if (!storedRole) {
      // Fallback to userRole if currentActiveRole is missing
      const userRoles = (localStorage.getItem("userRole") || "").toLowerCase().split(",");
      if (userRoles.includes("agent")) setRole("agent");
      else if (userRoles.includes("staff")) setRole("staff");
      else if (userRoles.includes("admin")) setRole("admin");
    }
  }, [role]);

  // Fetch userId if missing
  useEffect(() => {
    const fetchUserId = async () => {
      // Don't fetch if we already have a valid userId
      if (userId && userId !== "null") return;
      
      const userName = localStorage.getItem("UserName") || sessionStorage.getItem("UserName");
      if (!userName) return;

      try {
        const response = await axiosInstance.get(`/api/personalProfile/${userName}`);
        if (response.data && response.data.id) {
          const id = String(response.data.id);
          setUserId(id);
          localStorage.setItem("userId", id);
        }
      } catch (error) {
        console.error("Error fetching user profile for ID:", error);
      }
    };

    if (role === "agent" || role === "staff") {
      fetchUserId();
    }
  }, [role, userId]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Reset to page 1 when filters or perPage change
  useEffect(() => {
    setPage(1);
  }, [status, perPage, selectedMonth, selectedYear, travelDateFilter, search]);

  // Filter and paginate bookings client-side
  const filteredBookings = useMemo(() => {
    let filtered = allBookings;

    // ReConfirmed / Confirmed refine the fetched list on the derived label —
    // the backend endpoint groups all live rows together, so pick the exact
    // lifecycle state here.
    if (status === "reconfirmed" || status === "confirmed") {
      const target = status === "reconfirmed" ? "ReConfirmed" : "Confirmed";
      filtered = filtered.filter((b) => deriveDisplayStatus(b) === target);
    }

    // Exact travel-date match (mirrors the last-minute list's Check-in Date).
    const dayPick = (travelDateFilter || "").trim();
    if (dayPick) {
      const toIsoDay = (d) => (d ? String(d).split("T")[0].trim() : "");
      filtered = filtered.filter(
        (b) => toIsoDay(b.travelDate) === dayPick,
      );
    }

    // Apply search filter
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter((booking) =>
        String(booking.confirmationCode || "").toLowerCase().includes(searchLower) ||
        String(booking.packageName || "").toLowerCase().includes(searchLower) ||
        String(booking.contactName || "").toLowerCase().includes(searchLower) ||
        (role === "admin" && String(booking.agentName || "").toLowerCase().includes(searchLower))
      );
    }

    return filtered;
  }, [allBookings, search, travelDateFilter, role]);

  // Paginate filtered bookings. When the backend already paginated (Page
  // response) skip the local slice — `filteredBookings` is already the
  // current page; slicing again would empty out pages 2+.
  const paginatedBookings = useMemo(() => {
    if (serverPaginated) return filteredBookings;
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    return filteredBookings.slice(startIndex, endIndex);
  }, [filteredBookings, page, perPage, serverPaginated]);

  // Pagination totals: prefer server values for Page responses, fall back to
  // the local filtered count for List responses.
  const totalElements = serverPaginated
    ? serverTotalElements
    : filteredBookings.length;
  const totalPages = serverPaginated
    ? Math.max(1, serverTotalPages)
    : Math.max(1, Math.ceil(filteredBookings.length / perPage));

  const getStatusBadge = (s) => {
    switch (s?.toLowerCase()) {
      case "confirmed":
      case "completed":
        return "success";
      case "cancelled":
        return "danger";
      case "pending":
      case "upcoming":
        return "warning";
      default:
        return "secondary";
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      });
    } catch {
      return dateString;
    }
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  const displayStart = paginatedBookings.length > 0 ? (page - 1) * perPage + 1 : 0;
  const displayEnd = Math.min(page * perPage, totalElements);

  // Shared table cell/header styling — identical to LastMinuteBookingList so
  // the two tables render uniformly.
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

            <div className="d-flex justify-content-between align-items-end mb-3 hbl-header">
              <div className="hbl-header-left">
                <h3 className="fw-bold text-dark mb-2">Package Booking</h3>
                <InputGroup className="hbl-search" style={{ height: "40px", width: "320px" }}>
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
                    placeholder="Search by code / customer / package"
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

            {/* Booking Type + Travel Date filters — full-width row above the
                table. Mirrors the last-minute list's two-column filter card. */}
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
                          id="package-booking-type"
                          value={status}
                          onChange={(e) => setStatus(e.target.value)}
                          size="sm"
                          aria-label="Booking type filter"
                          style={{ fontSize: "0.85rem", height: "46px" }}
                        >
                          <option value="all">All</option>
                          <option value="upcoming">Upcoming</option>
                          <option value="completed">Completed</option>
                          <option value="reconfirmed">ReConfirmed</option>
                          <option value="confirmed">Confirmed</option>
                          <option value="cancelled">Cancelled</option>
                        </Form.Select>
                      </Col>
                      <Col xs={12} md={6} lg={4} xl={3}>
                        <h6
                          className="mb-2 fw-bold text-dark"
                          style={{ fontSize: "0.85rem", letterSpacing: "0.4px" }}
                        >
                          Travel Date
                        </h6>
                        <div className="d-flex gap-2">
                          <Form.Control
                            type="date"
                            value={travelDateFilter}
                            onChange={(e) => setTravelDateFilter(e.target.value)}
                            size="sm"
                            aria-label="Travel date filter"
                            style={{ fontSize: "0.85rem", height: "46px" }}
                          />
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            onClick={() => setTravelDateFilter("")}
                            disabled={!travelDateFilter}
                            aria-label="Clear travel date filter"
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
                {loading ? (
                  <div className="text-center py-5">
                    <Spinner animation="border" variant="primary" />
                    <p className="mt-3 text-muted">Loading bookings...</p>
                  </div>
                ) : paginatedBookings.length === 0 ? (
                  <div className="text-center py-5 text-muted">
                    <FaInbox className="display-4 mb-3" style={{ opacity: 0.4 }} />
                    <h6 className="fw-semibold">No package bookings yet</h6>
                    <p className="mb-0 small">
                      They'll appear here once you create one via{" "}
                      <em>New Booking → Package</em>.
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
                            <th style={{ ...baseHeaderStyle, textAlign: "center", width: COLUMN_WIDTHS.sn, whiteSpace: "nowrap" }}>
                              S.N
                            </th>
                            <th style={{ ...baseHeaderStyle, width: COLUMN_WIDTHS.agentName, whiteSpace: "nowrap" }}>
                              Agent Name
                            </th>
                            <th style={{ ...baseHeaderStyle, width: COLUMN_WIDTHS.customerName }}>
                              Customer Name
                            </th>
                            <th style={{ ...baseHeaderStyle, width: COLUMN_WIDTHS.bookingCode }}>
                              Booking Code
                            </th>
                            <th style={{ ...baseHeaderStyle, textAlign: "center", width: COLUMN_WIDTHS.bookDate }}>
                              Book Date
                            </th>
                            <th style={{ ...baseHeaderStyle, width: COLUMN_WIDTHS.bookingDetails }}>
                              Booking Details
                            </th>
                            <th style={{ ...baseHeaderStyle, textAlign: "center", width: COLUMN_WIDTHS.deadlineDate }}>
                              Deadline Date
                            </th>
                            <th style={{ ...baseHeaderStyle, textAlign: "center", width: COLUMN_WIDTHS.paymentMode }}>
                              Payment Status
                            </th>
                            <th style={{ ...baseHeaderStyle, textAlign: "center", width: COLUMN_WIDTHS.status }}>
                              Notification
                            </th>
                            <th style={{ ...baseHeaderStyle, textAlign: "center", width: COLUMN_WIDTHS.action }}>
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedBookings.map((b, idx) => {
                            const statusText = deriveDisplayStatus(b);
                            const sMeta = STATUS_META[statusText];
                            return (
                              <tr key={b.bookingId || idx}>
                                <td
                                  className="text-muted fw-semibold"
                                  style={{ ...baseCellStyle, textAlign: "center", color: "#6c757d", width: COLUMN_WIDTHS.sn }}
                                >
                                  {(page - 1) * perPage + idx + 1}
                                </td>
                                {/* Agent Name — pulled from the DTO, populated
                                    by the service via AgentRepository lookup. */}
                                <td style={{ ...baseCellStyle, width: COLUMN_WIDTHS.agentName }}>
                                  <span className="fw-medium text-dark">
                                    {b.agentName || "-"}
                                  </span>
                                </td>
                                {/* Customer Name — matches the FaUser layout on
                                    the last-minute list. */}
                                <td style={{ ...baseCellStyle, width: COLUMN_WIDTHS.customerName }}>
                                  <span className="d-inline-flex align-items-center" style={{ gap: "0.3rem" }}>
                                    <FaUser style={{ color: "#6c757d", fontSize: "0.78rem", flexShrink: 0 }} />
                                    <span className="fw-medium text-dark">
                                      {b.contactName || "-"}
                                    </span>
                                  </span>
                                </td>
                                {/* Booking Code — red, matching the last-minute
                                    list (which uses text-danger for the code). */}
                                <td style={{ ...baseCellStyle, width: COLUMN_WIDTHS.bookingCode }}>
                                  <span className="fw-bold" style={{ color: "#dc2626" }}>
                                    {b.confirmationCode || "-"}
                                  </span>
                                </td>
                                <td
                                  className="text-muted"
                                  style={{ ...baseCellStyle, textAlign: "center", width: COLUMN_WIDTHS.bookDate }}
                                >
                                  {formatShortDate(b.bookingDate) || "-"}
                                </td>
                                {/* Booking Details — package name + travel date
                                    in the same "Name (date)" shape the last-
                                    minute list uses for hotel + stay window. */}
                                <td style={{ ...baseCellStyle, width: COLUMN_WIDTHS.bookingDetails }}>
                                  <div
                                    className="d-flex align-items-center"
                                    style={{ gap: "0.35rem", flexWrap: "wrap" }}
                                  >
                                    <span
                                      className="fw-semibold text-dark"
                                      style={{ fontSize: "0.875rem" }}
                                    >
                                      {b.packageName || "-"}
                                    </span>
                                    {formatShortDate(b.travelDate) && (
                                      <span
                                        className="text-muted"
                                        style={{ fontSize: "0.75rem" }}
                                      >
                                        ({formatShortDate(b.travelDate)})
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td
                                  className="text-muted"
                                  style={{
                                    ...baseCellStyle,
                                    textAlign: "center",
                                    width: COLUMN_WIDTHS.deadlineDate,
                                  }}
                                >
                                  {formatIsoDate(b.deadlineDate) || "-"}
                                </td>
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    textAlign: "center",
                                    width: COLUMN_WIDTHS.paymentMode,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {(() => {
                                    const ps = derivePaymentStatus(b);
                                    return (
                                      <span
                                        className="fw-semibold"
                                        style={{ color: ps.color }}
                                      >
                                        {ps.label}
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
                                          `/booking-details/package-booking/${b.bookingId || b.id}`,
                                          { state: { booking: b, status } },
                                        )
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault();
                                          navigate(
                                            `/booking-details/package-booking/${b.bookingId || b.id}`,
                                            { state: { booking: b, status } },
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
                  </>
                )}
              </Card.Body>
            </Card>

            {/* Pagination — separate card mirroring the hotel-booking-list footer. */}
            {!loading && filteredBookings.length > 0 && (
              <Card
                className="shadow-sm border-0 mt-3"
                style={{ borderRadius: "8px" }}
              >
                <Card.Body className="py-3">
                  <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
                    <div
                      className="text-muted"
                      style={{ fontSize: "0.875rem" }}
                    >
                      Showing{" "}
                      <span className="fw-semibold text-dark">{displayStart}</span>{" "}
                      to{" "}
                      <span className="fw-semibold text-dark">{displayEnd}</span>{" "}
                      of{" "}
                      <span className="fw-semibold text-dark">{totalElements}</span>{" "}
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
                        disabled={page === 1}
                        onClick={() => page > 1 && handlePageChange(page - 1)}
                        style={{
                          cursor: page === 1 ? "not-allowed" : "pointer",
                          opacity: page === 1 ? 0.5 : 1,
                        }}
                      />
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                        (pageNumber) => (
                          <Pagination.Item
                            key={pageNumber}
                            active={page === pageNumber}
                            onClick={() => handlePageChange(pageNumber)}
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
                        disabled={page === totalPages}
                        onClick={() =>
                          page < totalPages && handlePageChange(page + 1)
                        }
                        style={{
                          cursor: page === totalPages ? "not-allowed" : "pointer",
                          opacity: page === totalPages ? 0.5 : 1,
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
    </div>
  );
};

export default PackageBookingList;

