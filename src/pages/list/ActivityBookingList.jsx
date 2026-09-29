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
  FaCalendarAlt,
  FaEye,
  FaUser,
  FaInbox,
  FaArrowLeft,
} from "react-icons/fa";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import toast from "react-hot-toast";
// Reuse the exact same modern styling the hotel list uses so the two
// pages look identical (`.hbl-modern`, `.thin-scrollbar`).
import "../../styles/HotelBookingListModern.css";
import DashboardRedirections from "../../components/DashboardRedirections";

const PER_PAGE_OPTIONS = [10, 25, 50, 100];

// Fixed per-column widths — mirrors the COLUMN_WIDTHS approach in
// HotelBookingList so the table sizing stays predictable.
const COLUMN_WIDTHS = {
  sn: "50px",
  agent: "100px",
  booking: "130px",
  // Supplier-side confirmation number saved on the activity detail view
  // via the "CONFIRMATION NO." button. Sourced from
  // TourAndActivityBooking.confirmationNumber and returned by the real
  // grouped-list mapper in TourAndActivityBookingService.toResponseDTO.
  // Width tuned so the two-word header ("CONFIRMATION" / "NO") wraps at
  // its space instead of splitting "CONFIRMATION" mid-letter.
  confirmationNo: "130px",
  customer: "160px",
  activity: "220px",
  tourDate: "120px",
  pax: "110px",
  amount: "120px",
  // Booking lifecycle badge (CONFIRMED / CANCELLED / …), rendered as a
  // small coloured pill.
  status: "110px",
  action: "80px",
};

// Shared cell style copied from HotelBookingList for a 1:1 table look.
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

const fmtDateLong = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d)) return typeof iso === "string" ? iso.slice(0, 10) : "-";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const ActivityBookingList = () => {
  const navigate = useNavigate();
  const [role, setRole] = useState(() => {
    return localStorage.getItem("currentActiveRole")?.toLowerCase() || null;
  });
  const [userId, setUserId] = useState(() => {
    const stored = localStorage.getItem("userId");
    return (stored && stored !== "null") ? stored : null;
  });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [apiData, setApiData] = useState({
    upcomingBookings: { content: [] },
    completedBookings: { content: [] },
    cancelledBookings: { content: [] },
  });
  const [pagination, setPagination] = useState({
    all: { page: 1, perPage: 10 },
    upcoming: { page: 1, perPage: 10 },
    completed: { page: 1, perPage: 10 },
    cancelled: { page: 1, perPage: 10 },
  });

  // Booking-type options for the "Booking Type" filter dropdown —
  // same control HotelBookingList uses. "All" (default) merges the
  // three groups the activity grouped-list endpoint returns.
  const statusOptions = useMemo(
    () => [
      { value: "all", label: "All" },
      { value: "upcoming", label: "Upcoming" },
      { value: "completed", label: "Completed" },
      { value: "cancelled", label: "Cancelled" },
    ],
    [],
  );

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 2014 }, (_, i) => 2020 + i);

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
      // When "All" is active, every group is paged together using the
      // shared `all` cursor so the merged list advances as one.
      const isAll = status === "all";
      const params = {
        upcomingPage: Math.max(
          (isAll ? pagination.all.page : pagination.upcoming.page) - 1,
          0,
        ),
        upcomingSize: isAll ? pagination.all.perPage : pagination.upcoming.perPage,
        completedPage: Math.max(
          (isAll ? pagination.all.page : pagination.completed.page) - 1,
          0,
        ),
        completedSize: isAll ? pagination.all.perPage : pagination.completed.perPage,
        cancelledPage: Math.max(
          (isAll ? pagination.all.page : pagination.cancelled.page) - 1,
          0,
        ),
        cancelledSize: isAll ? pagination.all.perPage : pagination.cancelled.perPage,
      };

      if (selectedMonth && selectedYear) {
        params.month = Number(selectedMonth);
        params.year = Number(selectedYear);
      }

      // Role-based filtering
      if (role === "agent" && userId) {
        params.agentId = userId;
      } else if (role === "staff" && userId) {
        params.staffId = userId;
      }

      const response = await axiosInstance.get("/api/activity/grouped-list", { params });
      if (response.data && response.data.success) {
        setApiData({
          upcomingBookings: response.data.upcomingBookings || { content: [] },
          completedBookings: response.data.completedBookings || { content: [] },
          cancelledBookings: response.data.cancelledBookings || { content: [] },
        });
      }
    } catch {
      toast.error("Failed to load activity bookings");
    } finally {
      setLoading(false);
    }
  }, [pagination, selectedMonth, selectedYear, role, userId, status]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const handleMonthChange = (value) => {
    setSelectedMonth(value);
    resetAllPages();
  };

  const handleYearChange = (value) => {
    setSelectedYear(value);
    resetAllPages();
  };

  const resetAllPages = () => {
    setPagination((prev) => ({
      all: { ...prev.all, page: 1 },
      upcoming: { ...prev.upcoming, page: 1 },
      completed: { ...prev.completed, page: 1 },
      cancelled: { ...prev.cancelled, page: 1 },
    }));
  };

  const handlePageChange = (nextPage) => {
    setPagination((prev) => ({
      ...prev,
      [status]: { ...prev[status], page: nextPage },
    }));
  };

  const handlePageSizeChange = (nextSize) => {
    setPagination((prev) => ({
      ...prev,
      [status]: { ...prev[status], perPage: nextSize, page: 1 },
    }));
  };

  const getCurrentList = () => {
    if (status === "upcoming") return apiData.upcomingBookings.content || [];
    if (status === "completed") return apiData.completedBookings.content || [];
    if (status === "cancelled") return apiData.cancelledBookings.content || [];
    // "All" — merge the three groups' currently-loaded pages.
    return [
      ...(apiData.upcomingBookings.content || []),
      ...(apiData.completedBookings.content || []),
      ...(apiData.cancelledBookings.content || []),
    ];
  };

  const filteredBookings = useMemo(() => {
    const list = getCurrentList();
    if (!search.trim()) return list;
    return list.filter(
      (b) =>
        b.packageBookCode?.toLowerCase().includes(search.toLowerCase()) ||
        b.firstName?.toLowerCase().includes(search.toLowerCase()) ||
        b.lastName?.toLowerCase().includes(search.toLowerCase()) ||
        b.activityName?.toLowerCase().includes(search.toLowerCase())
    );
  }, [apiData, status, search]);

  const formatPrice = (price) =>
    new Intl.NumberFormat("en-AE", {
      style: "currency",
      currency: "AED",
    }).format(price || 0);

  const isAll = status === "all";
  const currentTabPagination = isAll ? {} : apiData[`${status}Bookings`] || {};
  // "All" totals = sum of the three groups; pages = the largest group's
  // page count (smaller groups just return empty pages past their end).
  const totalPages = isAll
    ? Math.max(
        apiData.upcomingBookings?.totalPages || 0,
        apiData.completedBookings?.totalPages || 0,
        apiData.cancelledBookings?.totalPages || 0,
      )
    : currentTabPagination.totalPages || 0;
  const totalElements = isAll
    ? (apiData.upcomingBookings?.totalElements || 0) +
      (apiData.completedBookings?.totalElements || 0) +
      (apiData.cancelledBookings?.totalElements || 0)
    : currentTabPagination.totalElements || 0;
  const currentPage = pagination[status].page;
  const currentPerPage = pagination[status].perPage;

  // Pagination math — same shape as HotelBookingList.
  const hasResults = filteredBookings.length > 0;
  const totalEntries =
    typeof totalElements === "number" && totalElements >= 0
      ? totalElements
      : filteredBookings.length;
  const serialNumberBase = (currentPage - 1) * currentPerPage;
  const displayStart = hasResults ? serialNumberBase + 1 : 0;
  const displayEnd = hasResults
    ? Math.min(serialNumberBase + filteredBookings.length, totalEntries)
    : 0;
  const safeTotalPages =
    totalPages > 0
      ? totalPages
      : Math.max(1, Math.ceil((totalEntries || 0) / currentPerPage));

  const colCount = role === "admin" ? 9 : 8;

  // Shared <th> style (centered, uppercase) — from HotelBookingList.
  const thStyle = (width) => ({
    padding: "0.45rem 0.6rem",
    fontWeight: "600",
    textTransform: "uppercase",
    color: "#495057",
    textAlign: "center",
    border: "1px solid #dee2e6",
    whiteSpace: "normal",
    lineHeight: 1.2,
    width,
  });

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
                <h3 className="fw-bold text-dark mb-2">Activity Bookings</h3>
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
                        onChange={(e) => handleMonthChange(e.target.value)}
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
                        onChange={(e) => handleYearChange(e.target.value)}
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
                          value={status}
                          onChange={(e) => {
                            setStatus(e.target.value);
                            resetAllPages();
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
                          <th style={thStyle(COLUMN_WIDTHS.sn)}>S.N</th>
                          {role === "admin" && (
                            <th style={thStyle(COLUMN_WIDTHS.agent)}>Agent</th>
                          )}
                          <th style={thStyle(COLUMN_WIDTHS.booking)}>Booking</th>
                          {/* Confirmation No — supplier's confirmation number
                              from TourAndActivityBooking (populated via the
                              "CONFIRMATION NO." button on the detail view).
                              wordBreak / overflowWrap normal keep the two-word
                              header wrapping only at its space, mirroring the
                              other list pages. */}
                          <th
                            style={{
                              ...thStyle(COLUMN_WIDTHS.confirmationNo),
                              whiteSpace: "normal",
                              wordBreak: "normal",
                              overflowWrap: "normal",
                            }}
                          >
                            Confirmation No
                          </th>
                          <th style={thStyle(COLUMN_WIDTHS.customer)}>Customer</th>
                          <th style={thStyle(COLUMN_WIDTHS.activity)}>Activity</th>
                          <th style={thStyle(COLUMN_WIDTHS.tourDate)}>Tour Date</th>
                          <th style={thStyle(COLUMN_WIDTHS.pax)}>Pax</th>
                          <th style={thStyle(COLUMN_WIDTHS.amount)}>Amount</th>
                          <th style={thStyle(COLUMN_WIDTHS.status)}>Status</th>
                          <th style={thStyle(COLUMN_WIDTHS.action)}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredBookings.length === 0 ? (
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
                              <p className="mt-2 mb-0 fs-5">No bookings found.</p>
                            </td>
                          </tr>
                        ) : (
                          filteredBookings.map((b, i) => (
                            <tr
                              key={b.customBookingId}
                              style={{
                                backgroundColor: i % 2 === 0 ? "#ffffff" : "#f8f9fa",
                                transition: "background-color 0.2s ease",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = "#e7f3ff";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  i % 2 === 0 ? "#ffffff" : "#f8f9fa";
                              }}
                            >
                              <td
                                className="text-muted fw-semibold"
                                style={{ ...baseCellStyle, textAlign: "center", width: COLUMN_WIDTHS.sn }}
                              >
                                {serialNumberBase + i + 1}
                              </td>
                              {role === "admin" && (
                                <td style={{ ...baseCellStyle, width: COLUMN_WIDTHS.agent }}>
                                  <span className="fw-medium text-dark">
                                    {b.agentName || "-"}
                                  </span>
                                </td>
                              )}
                              <td style={{ ...baseCellStyle, width: COLUMN_WIDTHS.booking }}>
                                <div className="fw-bold text-primary">
                                  {b.packageBookCode || "-"}
                                </div>
                                <div className="text-muted" style={{ fontSize: "0.7rem" }}>
                                  {fmtDateLong(b.bookingDate)}
                                </div>
                              </td>
                              {/* Confirmation No cell — reads the field
                                  now returned on ActivityBookingResponseDTO
                                  (cross-looked-up from TourAndActivityBooking
                                  on the backend). Muted "-" when the operator
                                  hasn't saved a number yet; nowrap keeps a
                                  present number atomic. */}
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
                              <td style={{ ...baseCellStyle, width: COLUMN_WIDTHS.customer }}>
                                <span className="d-inline-flex align-items-center" style={{ gap: "0.3rem" }}>
                                  <FaUser style={{ color: "#6c757d", fontSize: "0.78rem", flexShrink: 0 }} />
                                  <span className="fw-medium text-dark">
                                    {[b.salutation, b.firstName, b.lastName].filter(Boolean).join(" ") || "-"}
                                  </span>
                                </span>
                                {b.emailId && (
                                  <div className="text-muted" style={{ fontSize: "0.7rem" }}>
                                    {b.emailId}
                                  </div>
                                )}
                              </td>
                              <td style={{ ...baseCellStyle, width: COLUMN_WIDTHS.activity }}>
                                <div className="fw-semibold text-dark">{b.activityName || "-"}</div>
                                {b.customBookingItinearyDTO?.length > 0 && (
                                  <ul
                                    className="list-unstyled mb-0 mt-1"
                                    style={{ fontSize: "0.7rem", color: "#667085" }}
                                  >
                                    {b.customBookingItinearyDTO.map((it, idx) => (
                                      <li key={idx}>• {it.itinerary}</li>
                                    ))}
                                  </ul>
                                )}
                              </td>
                              <td
                                style={{ ...baseCellStyle, textAlign: "center", width: COLUMN_WIDTHS.tourDate, whiteSpace: "nowrap" }}
                              >
                                <span className="d-inline-flex align-items-center" style={{ gap: "0.3rem" }}>
                                  <FaCalendarAlt style={{ fontSize: "0.7rem", color: "#98a2b3" }} />
                                  <span>{fmtDateLong(b.tourDate)}</span>
                                </span>
                              </td>
                              <td
                                style={{ ...baseCellStyle, textAlign: "center", width: COLUMN_WIDTHS.pax }}
                              >
                                {b.noOfAdult || 0} ADT / {b.noOfChild || 0} CHD
                              </td>
                              <td
                                className="fw-semibold text-dark"
                                style={{ ...baseCellStyle, textAlign: "right", width: COLUMN_WIDTHS.amount, whiteSpace: "nowrap" }}
                              >
                                {formatPrice(b.totalPrice)}
                              </td>
                              {/* Status cell — coloured pill for CONFIRMED /
                                  CANCELLED / other lifecycle values sourced
                                  from TourAndActivityBooking.status. Green for
                                  CONFIRMED, red for CANCELLED, gray for
                                  anything else so the value stays legible
                                  even if a new status enum lands. */}
                              <td
                                style={{ ...baseCellStyle, textAlign: "center", width: COLUMN_WIDTHS.status, whiteSpace: "nowrap" }}
                              >
                                {(() => {
                                  const raw = String(b.status || "").trim().toUpperCase();
                                  if (!raw) return <span className="text-muted">-</span>;
                                  const [bg, color] =
                                    raw === "CONFIRMED"
                                      ? ["#e6f7ea", "#0d7a2f"]
                                      : raw === "CANCELLED"
                                        ? ["#fdecea", "#b3241c"]
                                        : ["#eef2f7", "#425466"];
                                  const label =
                                    raw.charAt(0) + raw.slice(1).toLowerCase();
                                  return (
                                    <span
                                      style={{
                                        backgroundColor: bg,
                                        color,
                                        padding: "3px 10px",
                                        borderRadius: "999px",
                                        fontSize: "0.72rem",
                                        fontWeight: "600",
                                        display: "inline-block",
                                      }}
                                    >
                                      {label}
                                    </span>
                                  );
                                })()}
                              </td>
                              <td
                                style={{ ...baseCellStyle, textAlign: "center", width: COLUMN_WIDTHS.action }}
                              >
                                <div className="d-flex justify-content-center align-items-center">
                                  <FaEye
                                    role="button"
                                    tabIndex={0}
                                    title="View full booking details"
                                    style={{ fontSize: "18px", color: "#007bff", cursor: "pointer" }}
                                    onClick={() =>
                                      navigate(
                                        `/booking-details/activity-booking/${b.customBookingId}`,
                                        { state: { booking: b, status } },
                                      )
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        navigate(
                                          `/booking-details/activity-booking/${b.customBookingId}`,
                                          { state: { booking: b, status } },
                                        );
                                      }
                                    }}
                                  />
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </Table>
                  </div>
                )}
              </Card.Body>
            </Card>

            {/* Pagination */}
            {!loading && filteredBookings.length > 0 && (
              <Card
                className="shadow-sm border-0 mt-3"
                style={{ borderRadius: "8px" }}
              >
                <Card.Body className="py-3">
                  <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 hbl-pagination-bar">
                    <div className="text-muted" style={{ fontSize: "0.875rem" }}>
                      Showing{" "}
                      <span className="fw-semibold text-dark">{displayStart}</span>{" "}
                      to{" "}
                      <span className="fw-semibold text-dark">{displayEnd}</span>{" "}
                      of{" "}
                      <span className="fw-semibold text-dark">{totalEntries}</span>{" "}
                      entries
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <span className="text-muted" style={{ fontSize: "0.8rem" }}>
                        Rows per page
                      </span>
                      <Form.Select
                        size="sm"
                        value={currentPerPage}
                        onChange={(e) => handlePageSizeChange(Number(e.target.value))}
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
                          currentPage > 1 && handlePageChange(currentPage - 1)
                        }
                        style={{
                          cursor: currentPage === 1 ? "not-allowed" : "pointer",
                          opacity: currentPage === 1 ? 0.5 : 1,
                        }}
                      />
                      {Array.from({ length: safeTotalPages }, (_, i) => i + 1).map(
                        (pageNumber) => (
                          <Pagination.Item
                            key={pageNumber}
                            active={currentPage === pageNumber}
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
                        disabled={currentPage === safeTotalPages}
                        onClick={() =>
                          currentPage < safeTotalPages &&
                          handlePageChange(currentPage + 1)
                        }
                        style={{
                          cursor:
                            currentPage === safeTotalPages ? "not-allowed" : "pointer",
                          opacity: currentPage === safeTotalPages ? 0.5 : 1,
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

export default ActivityBookingList;
