import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
} from "react-bootstrap";
import {
  FaSearch,
  FaEye,
  FaUser,
  FaInbox,
} from "react-icons/fa";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import toast from "react-hot-toast";
import "../../styles/HotelBookingListModern.css";

const PER_PAGE_OPTIONS = [10, 25, 50, 100];

// Column-width hints kept in sync with HotelBookingList so the two
// pages line up visually under the shared hbl-modern skin.
const COLUMN_WIDTHS = {
  sn: "40px",
  agent: "120px",
  customerName: "150px",
  packageCode: "110px",
  bookDate: "95px",
  tourDate: "95px",
  status: "110px",
  action: "70px",
};

// Reused from LongStayBookingList; PENDING/UPCOMING covers the
// client-side "on request" bucket, COMPLETED/CONFIRMED/CANCELLED match
// the values this page emits via the existing backend filter.
const STATUS_META = {
  CONFIRMED: { label: "Confirmed", bg: "#e7f6ec", color: "#1b7f3a", dot: "#22c55e" },
  COMPLETED: { label: "Completed", bg: "#eff8ff", color: "#175cd3", dot: "#3b82f6" },
  PENDING:   { label: "Pending",   bg: "#fff7e6", color: "#b76e00", dot: "#f59e0b" },
  UPCOMING:  { label: "Upcoming",  bg: "#fff7e6", color: "#b76e00", dot: "#f59e0b" },
  CANCELLED: { label: "Cancelled", bg: "#fdecec", color: "#b42318", dot: "#ef4444" },
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

// "dd/mm/yyyy" — matches HotelBookingList cell formatting.
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

const normStatus = (v) =>
  String(v ?? "").replace(/[\s_-]+/g, "").toLowerCase();

const CustomBookingList = () => {
  const navigate = useNavigate();
  const [role, setRole] = useState(() => {
    return sessionStorage.getItem("currentActiveRole")?.toLowerCase() || null;
  });
  const [userId, setUserId] = useState(() => {
    const stored = sessionStorage.getItem("userId");
    return (stored && stored !== "null") ? stored : null;
  });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("upcoming");
  const [search, setSearch] = useState("");
  const [perPage, setPerPage] = useState(10);
  const [page, setPage] = useState(1);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [allBookings, setAllBookings] = useState([]);

  // Same seven booking-type options Hotel Booking List ships with.
  // The first three map cleanly to the backend's type=1/2/3 filter; the
  // remaining four are layered as client-side filters and will simply
  // render "No bookings found" if the payload carries no matching field.
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

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: current - 2014 }, (_, i) => 2020 + i);
  }, []);

  // Backend filter only recognises upcoming/completed/cancelled. For the
  // other dropdown options we still need a payload to filter client-side,
  // so fall through to type=1 (upcoming) — the extra client filter then
  // pares it down further.
  const getTypeParam = (s) => {
    switch (s) {
      case "upcoming": return 1;
      case "completed": return 2;
      case "cancelled": return 3;
      default: return 1;
    }
  };

  // Time-period card has its own Month/Year filter that we apply
  // client-side, so the server fetch always asks for the broadest window.
  const getTimeParam = () => 2;

  // Handle role sync if it's missing from localStorage initially
  useEffect(() => {
    const storedRole = sessionStorage.getItem("currentActiveRole")?.toLowerCase();
    if (storedRole && storedRole !== role) {
      setRole(storedRole);
    } else if (!storedRole) {
      const userRoles = (sessionStorage.getItem("userRole") || "").toLowerCase().split(",");
      if (userRoles.includes("agent")) setRole("agent");
      else if (userRoles.includes("staff")) setRole("staff");
      else if (userRoles.includes("admin")) setRole("admin");
    }
  }, [role]);

  // Fetch userId if missing
  useEffect(() => {
    const fetchUserId = async () => {
      if (userId && userId !== "null") return;
      const userName = sessionStorage.getItem("UserName");
      if (!userName) return;
      try {
        const response = await axiosInstance.get(`/api/personalProfile/${userName}`);
        if (response.data && response.data.id) {
          const id = String(response.data.id);
          setUserId(id);
          sessionStorage.setItem("userId", id);
        }
      } catch (error) {
        console.error("Error fetching user profile for ID:", error);
      }
    };

    if (role === "agent" || role === "staff") {
      fetchUserId();
    }
  }, [role, userId]);

  // Fetch bookings from API
  const fetchBookings = useCallback(async () => {
    if (!role) return;
    if ((role === "agent" || role === "staff") && (!userId || userId === "null")) return;

    try {
      setLoading(true);
      const type = getTypeParam(status);
      const time = getTimeParam();

      const params = { type, time };

      if (role === "agent" && userId) {
        params.agentId = userId;
      } else if (role === "staff" && userId) {
        params.staffId = userId;
      }

      const response = await axiosInstance.get(
        "/api/makeYourOwnPackage/getCustomBookingList",
        { params }
      );

      setAllBookings(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Error fetching custom bookings:", error);
      toast.error("Failed to load bookings");
      setAllBookings([]);
    } finally {
      setLoading(false);
    }
  }, [status, role, userId]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Reset to page 1 when filters or perPage change
  useEffect(() => {
    setPage(1);
  }, [status, selectedMonth, selectedYear, perPage, search]);

  // Apply search + status + time-period filters in one pass.
  const filteredBookings = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (allBookings || []).filter((b) => {
      const isCancelled =
        normStatus(b.bookingStatus) === "cancelled" ||
        b.cancelStatus === true;

      // The backend already narrowed by type=1/2/3 for the first three
      // options, but for "all" we relax that here; for the remaining
      // options we layer a client-side check so the dropdown reflects the
      // currently-visible subset honestly.
      if (status === "cancelled" && !isCancelled) return false;
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

      const tourDate = b.travelDate ? new Date(b.travelDate) : null;
      if (tourDate && (selectedMonth || selectedYear)) {
        const m = tourDate.getMonth() + 1;
        const y = tourDate.getFullYear();
        if (selectedMonth && Number(selectedMonth) !== m) return false;
        if (selectedYear && Number(selectedYear) !== y) return false;
      }

      if (needle) {
        const hay = [
          b.packageCode,
          b.customerName,
          b.agentName,
          // Tour Date — shown in the Tour Date column, so a date search
          // (e.g. "26/06/2026") matches. Both dd/mm/yyyy display form and the
          // raw value are included.
          formatShortDate(b.travelDate),
          b.travelDate,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [allBookings, search, status, selectedMonth, selectedYear]);

  // Pagination derived from the filtered list.
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

  const showAgentCol = role === "admin";
  const colSpanTotal = showAgentCol ? 8 : 7;

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
            {/* Header: Title + Search (left) | Time Period (right) */}
            <div className="d-flex justify-content-between align-items-end mb-3 hbl-header">
              <div className="hbl-header-left">
                <h3 className="fw-bold text-dark mb-2">Custom Bookings</h3>
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
                          {showAgentCol && (
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
                              width: COLUMN_WIDTHS.customerName,
                            }}
                          >
                            Customer Name
                          </th>
                          <th
                            style={{
                              ...baseHeaderStyle,
                              width: COLUMN_WIDTHS.packageCode,
                            }}
                          >
                            Package Code
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
                              textAlign: "center",
                              width: COLUMN_WIDTHS.tourDate,
                            }}
                          >
                            Tour Date
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
                              colSpan={colSpanTotal}
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
                            const rawStatus = b.bookingStatus
                              ? String(b.bookingStatus).toUpperCase()
                              : status === "upcoming"
                                ? "UPCOMING"
                                : status === "completed"
                                  ? "COMPLETED"
                                  : status === "cancelled"
                                    ? "CANCELLED"
                                    : null;
                            const sMeta = rawStatus ? STATUS_META[rawStatus] : null;
                            const detailId =
                              b.customBookingId || b.bookingId || b.id;
                            return (
                              <tr
                                key={detailId || b.packageCode || i}
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
                                {showAgentCol && (
                                  <td
                                    style={{
                                      ...baseCellStyle,
                                      width: COLUMN_WIDTHS.agent,
                                    }}
                                  >
                                    <span className="fw-medium text-dark">
                                      {b.agentName || "-"}
                                    </span>
                                  </td>
                                )}
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    width: COLUMN_WIDTHS.customerName,
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
                                      {b.customerName || "-"}
                                    </span>
                                  </span>
                                </td>
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    width: COLUMN_WIDTHS.packageCode,
                                  }}
                                >
                                  <span className="fw-bold text-primary">
                                    {b.packageCode || "-"}
                                  </span>
                                </td>
                                <td
                                  className="text-muted"
                                  style={{
                                    ...baseCellStyle,
                                    textAlign: "center",
                                    width: COLUMN_WIDTHS.bookDate,
                                  }}
                                >
                                  {formatShortDate(b.bookDate) || "-"}
                                </td>
                                <td
                                  className="text-muted"
                                  style={{
                                    ...baseCellStyle,
                                    textAlign: "center",
                                    width: COLUMN_WIDTHS.tourDate,
                                  }}
                                >
                                  {formatShortDate(b.travelDate) || "-"}
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
                                    raw={b.bookingStatus || rawStatus}
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
                                          `/booking-details/custom-booking/${detailId}`,
                                          { state: { booking: b, status } },
                                        )
                                      }
                                      onKeyDown={(e) => {
                                        if (
                                          e.key === "Enter" ||
                                          e.key === " "
                                        ) {
                                          e.preventDefault();
                                          navigate(
                                            `/booking-details/custom-booking/${detailId}`,
                                            { state: { booking: b, status } },
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
    </div>
  );
};

export default CustomBookingList;
