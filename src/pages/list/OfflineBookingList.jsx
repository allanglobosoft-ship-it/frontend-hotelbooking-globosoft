/**
 * OfflineBookingList.jsx
 *
 * Booking-list page for offline bookings, reskinned to match the shared
 * `hbl-modern` look used by HotelBookingList / LongStayBookingList. The
 * Action column contains only the View (eye) icon — clicking it navigates
 * to a dedicated detail page (/booking-details/offline-booking/:id) where
 * Voucher / Invoice / Tax live as buttons at the bottom-left.
 *
 * Filters mirror Hotel Booking List:
 *   - "Booking Type" card with 7 options (All / Upcoming / Completed /
 *     Cancelled / On Request / Reconfirmed / Invoiced). The first four map
 *     to the backend `status` query param; the remaining three are applied
 *     client-side on top of the same fetch — they light up automatically
 *     once the backend starts emitting the corresponding fields.
 *   - Time Period (Month + Year) card → backend `month` / `year`.
 *   - Search (left, 300px) — passed to the backend as `search`.
 */
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Container,
  Card,
  Form,
  Table,
  InputGroup,
  Spinner,
  Pagination,
  Row,
  Col,
  Button,
} from "react-bootstrap";
import { FaSearch, FaEye, FaInbox, FaArrowLeft } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import toast from "react-hot-toast";
import "../../styles/HotelBookingListModern.css";
import DashboardRedirections from "../../components/DashboardRedirections";

const PER_PAGE_OPTIONS = [10, 25, 50, 100];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Column-width hints kept in sync with HotelBookingList so the two pages
// line up visually under the shared hbl-modern skin.
const COLUMN_WIDTHS = {
  sn: "40px",
  bookDate: "95px",
  invoice: "110px",
  agent: "130px",
  bookingDetails: "260px",
  total: "110px",
  status: "110px",
  action: "70px",
};

const STATUS_META = {
  CONFIRMED: { label: "Confirmed", bg: "#e7f6ec", color: "#1b7f3a", dot: "#22c55e" },
  COMPLETED: { label: "Completed", bg: "#eff8ff", color: "#175cd3", dot: "#3b82f6" },
  UPCOMING:  { label: "Upcoming",  bg: "#e7f6ec", color: "#1b7f3a", dot: "#22c55e" },
  PENDING:   { label: "Pending",   bg: "#fff7e6", color: "#b76e00", dot: "#f59e0b" },
  CANCELLED: { label: "Cancelled", bg: "#fdecec", color: "#b42318", dot: "#ef4444" },
};

const fmtDate = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d)) return typeof iso === "string" ? iso.slice(0, 10) : "-";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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

const normStatus = (v) =>
  String(v ?? "").replace(/[\s_-]+/g, "").toLowerCase();

// Derive a STATUS_META key for the pill. Offline bookings don't expose a
// single `bookingStatus` field consistently, so fall back to cancel flag
// then check-out date.
const deriveStatusKey = (b) => {
  const raw = normStatus(b?.bookingStatus || b?.status);
  if (raw === "cancelled" || b?.cancelStatus === true) return "CANCELLED";
  if (raw === "confirmed") return "CONFIRMED";
  if (raw === "completed") return "COMPLETED";
  if (raw === "pending" || raw === "onrequest") return "PENDING";
  const co = b?.checkOut ? new Date(b.checkOut) : null;
  if (co && !isNaN(co)) {
    return co < new Date() ? "COMPLETED" : "CONFIRMED";
  }
  return null;
};

const OfflineBookingList = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [role, setRole] = useState(() => {
    return localStorage.getItem("currentActiveRole")?.toLowerCase() || null;
  });
  const [userId, setUserId] = useState(() => {
    const stored = localStorage.getItem("userId");
    return stored && stored !== "null" ? stored : null;
  });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState(10);
  const [page, setPage] = useState(1);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Default landing tab is "all" to mirror Hotel Booking List.
  const [bookingType, setBookingType] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: current - 2014 }, (_, i) => 2020 + i);
  }, []);

  // Same seven booking-type options Hotel Booking List ships with.
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

  // Role sync if missing from localStorage initially
  useEffect(() => {
    const storedRole = localStorage
      .getItem("currentActiveRole")
      ?.toLowerCase();
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

  // Fetch userId if missing
  useEffect(() => {
    const fetchUserId = async () => {
      if (userId && userId !== "null") return;
      const userName =
        localStorage.getItem("UserName") ||
        sessionStorage.getItem("UserName");
      if (!userName) return;
      try {
        const response = await axiosInstance.get(
          `/api/personalProfile/${userName}`,
        );
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

  const fetchBookings = useCallback(async () => {
    if (!role) return;
    if (
      (role === "agent" || role === "staff") &&
      (!userId || userId === "null")
    )
      return;

    try {
      setLoading(true);
      // Only the original three statuses (upcoming/completed/cancelled)
      // are recognised by the backend — the remaining three are filtered
      // client-side from a status-less response.
      const serverStatuses = new Set(["upcoming", "completed", "cancelled"]);
      const params = {
        page: page - 1,
        limit: perPage,
        search: search.trim() || undefined,
        status: serverStatuses.has(bookingType)
          ? bookingType.toUpperCase()
          : undefined,
        month: selectedMonth || undefined,
        year: selectedYear || undefined,
      };

      if (role === "agent" && userId) {
        params.agentId = userId;
      } else if (role === "staff" && userId) {
        params.agentId = userId;
      }

      const response = await axiosInstance.get(
        "api/v1/offline-booking/all-list",
        { params },
      );

      if (response.data) {
        const data = response.data.content || response.data;
        setBookings(Array.isArray(data) ? data : []);
        setTotalElements(
          response.data.totalElements || (data.length || 0),
        );
        setTotalPages(
          response.data.totalPages ||
            Math.ceil((data.length || 0) / perPage),
        );
      }
    } catch (error) {
      console.error("Error fetching offline bookings:", error);
      toast.error("Failed to load offline bookings");
    } finally {
      setLoading(false);
    }
  }, [
    page,
    perPage,
    search,
    role,
    userId,
    bookingType,
    selectedMonth,
    selectedYear,
  ]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Client-side narrowing for the three filter values the backend doesn't
  // yet understand. Returns the server list unchanged for "all" and for
  // the three statuses the backend already handled.
  const visibleBookings = useMemo(() => {
    if (
      bookingType === "all" ||
      bookingType === "upcoming" ||
      bookingType === "completed" ||
      bookingType === "cancelled"
    ) {
      return bookings;
    }
    return (bookings || []).filter((b) => {
      const isCancelled =
        normStatus(b?.bookingStatus) === "cancelled" ||
        b?.cancelStatus === true;
      if (isCancelled) return false;
      if (bookingType === "onrequest") {
        const s = normStatus(b?.bookingStatus || b?.confirmationStatus);
        return s === "pending" || s === "onrequest";
      }
      if (bookingType === "reconfirmed") {
        return normStatus(b?.confirmationStatus) === "reconfirmed";
      }
      if (bookingType === "invoiced") {
        return (
          normStatus(b?.invoiceStatus) === "invoiced" ||
          b?.invoiced === true ||
          b?.isInvoiced === true
        );
      }
      return false;
    });
  }, [bookings, bookingType]);

  const handlePageChange = (newPage) => setPage(newPage);

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

  const colCount = role === "admin" ? 8 : 7;
  const safeTotalPages = Math.max(1, totalPages || 1);
  const hasResults = visibleBookings.length > 0;
  const displayStart = hasResults ? (page - 1) * perPage + 1 : 0;
  const displayEnd = hasResults
    ? Math.min((page - 1) * perPage + visibleBookings.length, totalElements)
    : 0;

  return (
    <div className="min-vh-100 bg-light d-flex flex-column hbl-modern">
      <TopBar />
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
                <h3 className="fw-bold text-dark mb-2">Offline Bookings</h3>
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
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
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
                        onChange={(e) => {
                          setSelectedMonth(e.target.value);
                          setPage(1);
                        }}
                        className="form-control"
                        size="sm"
                        style={{ fontSize: "0.82rem", height: "45px" }}
                      >
                        <option value="">Month</option>
                        {MONTHS.map((month, index) => (
                          <option key={month} value={index + 1}>
                            {month.slice(0, 3)}
                          </option>
                        ))}
                      </Form.Select>
                    </Col>
                    <Col xs={6}>
                      <Form.Select
                        value={selectedYear}
                        onChange={(e) => {
                          setSelectedYear(e.target.value);
                          setPage(1);
                        }}
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
                    <h6
                      className="mb-2 fw-bold text-dark"
                      style={{ fontSize: "0.85rem", letterSpacing: "0.4px" }}
                    >
                      Booking Type
                    </h6>
                    <Row className="g-2">
                      <Col xs={12} md={6} lg={4} xl={3}>
                        <Form.Select
                          value={bookingType}
                          onChange={(e) => {
                            setBookingType(e.target.value);
                            setPage(1);
                          }}
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
                    </Row>
                  </Card.Body>
                </Card>
              </Col>
            </Row>

            {/* Table */}
            <Card
              className="shadow-sm border-0"
              style={{
                borderRadius: "8px",
                overflow: "hidden",
                width: "100%",
              }}
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
                              textAlign: "center",
                              width: COLUMN_WIDTHS.bookDate,
                            }}
                          >
                            Booking Date
                          </th>
                          <th
                            style={{
                              ...baseHeaderStyle,
                              width: COLUMN_WIDTHS.invoice,
                            }}
                          >
                            Invoice
                          </th>
                          {role === "admin" && (
                            <th
                              style={{
                                ...baseHeaderStyle,
                                width: COLUMN_WIDTHS.agent,
                              }}
                            >
                              Agent
                            </th>
                          )}
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
                              textAlign: "right",
                              width: COLUMN_WIDTHS.total,
                            }}
                          >
                            Total
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
                        {visibleBookings.length === 0 ? (
                          <tr>
                            <td
                              colSpan={colCount}
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
                          visibleBookings.map((booking, idx) => {
                            const statusKey = deriveStatusKey(booking);
                            const sMeta = statusKey
                              ? STATUS_META[statusKey]
                              : null;
                            return (
                              <tr
                                key={booking.id || idx}
                                style={{
                                  backgroundColor:
                                    idx % 2 === 0 ? "#ffffff" : "#f8f9fa",
                                  transition: "background-color 0.2s ease",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor =
                                    "#e7f3ff";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor =
                                    idx % 2 === 0 ? "#ffffff" : "#f8f9fa";
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
                                  {(page - 1) * perPage + idx + 1}
                                </td>
                                <td
                                  className="text-muted"
                                  style={{
                                    ...baseCellStyle,
                                    textAlign: "center",
                                    width: COLUMN_WIDTHS.bookDate,
                                  }}
                                >
                                  {fmtDate(
                                    booking.bookingDate || booking.createdAt,
                                  )}
                                </td>
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    width: COLUMN_WIDTHS.invoice,
                                  }}
                                >
                                  <span
                                    className="font-monospace fw-semibold"
                                    style={{
                                      color: "#1d4ed8",
                                      fontSize: "0.78rem",
                                    }}
                                  >
                                    {booking.invoiceNumber || "-"}
                                  </span>
                                </td>
                                {role === "admin" && (
                                  <td
                                    style={{
                                      ...baseCellStyle,
                                      width: COLUMN_WIDTHS.agent,
                                    }}
                                  >
                                    {booking.agentName || "Direct Client"}
                                  </td>
                                )}
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    width: COLUMN_WIDTHS.bookingDetails,
                                  }}
                                >
                                  <div className="fw-semibold text-dark">
                                    {booking.customerName || "-"}
                                  </div>
                                  <div
                                    className="text-muted"
                                    style={{
                                      fontSize: "0.72rem",
                                      lineHeight: 1.5,
                                    }}
                                  >
                                    {fmtDate(booking.checkIn)} →{" "}
                                    {fmtDate(booking.checkOut)}
                                    <br />
                                    {booking.adult || 0} adult
                                    {(booking.adult || 0) === 1 ? "" : "s"}
                                    {booking.child
                                      ? `, ${booking.child} child${
                                          booking.child === 1 ? "" : "ren"
                                        }`
                                      : ""}
                                  </div>
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
                                    {booking.totalAmount ||
                                      booking.grandTotal ||
                                      "0.00"}
                                  </span>
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
                                    raw={booking.bookingStatus}
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
                                          `/booking-details/offline-booking/${booking.supplierMainBasicId}`,
                                          { state: { booking } },
                                        )
                                      }
                                      onKeyDown={(e) => {
                                        if (
                                          e.key === "Enter" ||
                                          e.key === " "
                                        ) {
                                          e.preventDefault();
                                          navigate(
                                            `/booking-details/offline-booking/${booking.supplierMainBasicId}`,
                                            { state: { booking } },
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
                        {totalElements}
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
                        onChange={(e) => {
                          setPerPage(Number(e.target.value));
                          setPage(1);
                        }}
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
                        onClick={() =>
                          page > 1 && handlePageChange(page - 1)
                        }
                        style={{
                          cursor: page === 1 ? "not-allowed" : "pointer",
                          opacity: page === 1 ? 0.5 : 1,
                        }}
                      />
                      {Array.from(
                        { length: Math.min(5, safeTotalPages) },
                        (_, i) => {
                          let pageNum;
                          if (safeTotalPages <= 5) pageNum = i + 1;
                          else if (page <= 3) pageNum = i + 1;
                          else if (page >= safeTotalPages - 2)
                            pageNum = safeTotalPages - 4 + i;
                          else pageNum = page - 2 + i;
                          return (
                            <Pagination.Item
                              key={pageNum}
                              active={pageNum === page}
                              onClick={() => handlePageChange(pageNum)}
                              style={{
                                cursor: "pointer",
                                minWidth: "38px",
                                textAlign: "center",
                              }}
                            >
                              {pageNum}
                            </Pagination.Item>
                          );
                        },
                      )}
                      <Pagination.Next
                        disabled={page === safeTotalPages}
                        onClick={() =>
                          page < safeTotalPages && handlePageChange(page + 1)
                        }
                        style={{
                          cursor:
                            page === safeTotalPages
                              ? "not-allowed"
                              : "pointer",
                          opacity: page === safeTotalPages ? 0.5 : 1,
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

export default OfflineBookingList;
