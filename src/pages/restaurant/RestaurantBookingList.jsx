/**
 * RestaurantBookingList.jsx
 *
 * Booking-list page for restaurant bookings. The Action column now
 * contains only the View (eye) icon — clicking it navigates to a
 * dedicated detail page (/booking-details/restaurant-booking/:id)
 * where Edit / Remark / Voucher / Cancel live as buttons at the
 * bottom-left, alongside any reconfirm / date-change flow.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  Card,
  Form,
  Table,
  InputGroup,
  Spinner,
  Pagination,
  Container,
  Row,
  Col,
  Button,
} from "react-bootstrap";
import { FaSearch, FaEye, FaInbox, FaArrowLeft } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import "../../styles/HotelBookingListModern.css";
import DashboardRedirections from "../../components/DashboardRedirections";

const BOOKING_STATUS_OPTIONS = [
  "Pending Approval",
  "Guarantee Pending",
  "Confirmed",
  "Reconfirmed",
  "Date Change Requested",
  "Checked In",
  "No Show",
  "Completed",
  "Rejected",
  "Cancelled",
  "Auto Cancelled",
];

const PER_PAGE_OPTIONS = [10, 25, 50, 100];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const STATUS_META = {
  "Confirmed":             { label: "Confirmed",   bg: "#e7f6ec", color: "#1b7f3a", dot: "#22c55e" },
  "Checked In":            { label: "Checked In",  bg: "#e7f6ec", color: "#1b7f3a", dot: "#22c55e" },
  "Reconfirmed":           { label: "Reconfirmed", bg: "#eff8ff", color: "#175cd3", dot: "#3b82f6" },
  "Completed":             { label: "Completed",   bg: "#eff8ff", color: "#175cd3", dot: "#3b82f6" },
  "Pending Approval":      { label: "Pending Approval",      bg: "#fff7e6", color: "#b76e00", dot: "#f59e0b" },
  "Guarantee Pending":     { label: "Guarantee Pending",     bg: "#fff7e6", color: "#b76e00", dot: "#f59e0b" },
  "Date Change Requested": { label: "Date Change Requested", bg: "#fff7e6", color: "#b76e00", dot: "#f59e0b" },
  "Pending":               { label: "Pending",               bg: "#fff7e6", color: "#b76e00", dot: "#f59e0b" },
  "Cancelled":             { label: "Cancelled",     bg: "#fdecec", color: "#b42318", dot: "#ef4444" },
  "Rejected":              { label: "Rejected",      bg: "#fdecec", color: "#b42318", dot: "#ef4444" },
  "Auto Cancelled":        { label: "Auto Cancelled",bg: "#f3f4f6", color: "#475467", dot: "#98a2b3" },
  "No Show":               { label: "No Show",       bg: "#f3f4f6", color: "#475467", dot: "#98a2b3" },
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

const RestaurantBookingList = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [bookingType, setBookingType] = useState("upcoming");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  // Time Period filter (Month + Year). Empty means "all".
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const currentYear = new Date().getFullYear();
  const years = Array.from(
    { length: currentYear - 2014 },
    (_, i) => 2020 + i,
  );

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await axiosInstance.get("/api/restaurant/booking/list");
      const data = Array.isArray(res.data) ? res.data : res.data?.content || [];
      setItems(data);
    } catch (e) {
      console.error(e);
      setItems(demoBookings);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  const filtered = useMemo(() => {
    return items.filter((b) => {
      const q = search.toLowerCase();
      const matchQ =
        !q ||
        b.bookingNumber?.toLowerCase().includes(q) ||
        b.restaurantName?.toLowerCase().includes(q) ||
        b.customerName?.toLowerCase().includes(q);
      const matchStatus =
        statusFilter === "all" || b.bookingStatus === statusFilter;
      const isCancelled = b.bookingStatus === "Cancelled";
      const isCompleted = b.bookingStatus === "Completed";
      let matchType = true;
      if (bookingType === "cancelled") matchType = isCancelled;
      else if (bookingType === "completed") matchType = isCompleted;
      else matchType = !isCancelled && !isCompleted;

      let matchTime = true;
      if (selectedMonth || selectedYear) {
        const normalized = b.bookingDate
          ? String(b.bookingDate).includes("T")
            ? b.bookingDate
            : `${b.bookingDate}T00:00:00`
          : null;
        const d = normalized ? new Date(normalized) : null;
        if (!d || isNaN(d.getTime())) {
          matchTime = false;
        } else {
          if (selectedMonth && d.getMonth() + 1 !== Number(selectedMonth)) {
            matchTime = false;
          }
          if (selectedYear && d.getFullYear() !== Number(selectedYear)) {
            matchTime = false;
          }
        }
      }

      return matchQ && matchStatus && matchType && matchTime;
    });
  }, [items, search, statusFilter, bookingType, selectedMonth, selectedYear]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / size));
  const pageData = filtered.slice((page - 1) * size, page * size);
  const displayStart = filtered.length === 0 ? 0 : (page - 1) * size + 1;
  const displayEnd = Math.min(filtered.length, page * size);

  const clearTimePeriod = () => {
    setSelectedMonth("");
    setSelectedYear("");
    setPage(1);
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
                <h3 className="fw-bold text-dark mb-2">Restaurant Bookings</h3>
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
                        {MONTHS.map((m, idx) => (
                          <option key={m} value={idx + 1}>
                            {m.slice(0, 3)}
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
                        {years.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </Form.Select>
                    </Col>
                  </Row>
                  {(selectedMonth || selectedYear) && (
                    <button
                      type="button"
                      onClick={clearTimePeriod}
                      className="btn btn-sm border-0 mt-2 p-0"
                      style={{ fontSize: "0.72rem", color: "#6c757d" }}
                      title="Clear time period"
                    >
                      Clear
                    </button>
                  )}
                </Card.Body>
              </Card>
            </div>

            {/* Filters Section: Booking Type pills + Status select */}
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

                    <Row className="g-2 align-items-center">
                      <Col xs="auto">
                        <div
                          className="d-inline-flex p-1 rounded"
                          style={{ backgroundColor: "#f3f4f6" }}
                        >
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
                                  setPage(1);
                                }}
                                className="border-0 px-3 py-1"
                                style={{
                                  backgroundColor: active
                                    ? "#ffffff"
                                    : "transparent",
                                  color: active ? "#101828" : "#667085",
                                  fontSize: "0.8rem",
                                  fontWeight: active ? 600 : 500,
                                  borderRadius: "6px",
                                  boxShadow: active
                                    ? "0 1px 2px rgba(16,24,40,0.08)"
                                    : "none",
                                  transition: "all 0.15s",
                                }}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </Col>
                      <Col xs={12} md={6} lg={4} xl={3}>
                        <Form.Select
                          value={statusFilter}
                          onChange={(e) => {
                            setStatusFilter(e.target.value);
                            setPage(1);
                          }}
                          size="sm"
                          aria-label="Booking status filter"
                          style={{ fontSize: "0.85rem", height: "46px" }}
                        >
                          <option value="all">All Statuses</option>
                          {BOOKING_STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
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
                          {[
                            { key: "sn", label: "S.N", align: "center", width: "40px" },
                            { key: "booking", label: "Booking", width: "120px" },
                            { key: "restaurant", label: "Restaurant", width: "160px" },
                            { key: "datetime", label: "Date / Time", width: "120px" },
                            { key: "members", label: "Members", align: "center", width: "80px" },
                            { key: "customer", label: "Customer", width: "150px" },
                            { key: "status", label: "Status", align: "center", width: "130px" },
                            { key: "action", label: "Action", align: "center", width: "80px" },
                          ].map((col) => (
                            <th
                              key={col.key}
                              style={{
                                padding: "0.45rem 0.6rem",
                                fontWeight: "600",
                                textTransform: "uppercase",
                                color: "#495057",
                                textAlign: col.align || "left",
                                border: "1px solid #dee2e6",
                                whiteSpace: "normal",
                                lineHeight: 1.2,
                                width: col.width,
                              }}
                            >
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pageData.length === 0 ? (
                          <tr>
                            <td
                              colSpan={8}
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
                          pageData.map((b, i) => {
                            const sMeta = STATUS_META[b.bookingStatus];
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
                            return (
                              <tr
                                key={b.id || i}
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
                                  }}
                                >
                                  {(page - 1) * size + i + 1}
                                </td>
                                <td style={baseCellStyle}>
                                  <span className="fw-bold text-primary">
                                    {b.bookingNumber || "-"}
                                  </span>
                                </td>
                                <td style={baseCellStyle}>
                                  <span className="fw-semibold text-dark">
                                    {b.restaurantName || "-"}
                                  </span>
                                </td>
                                <td style={{ ...baseCellStyle, whiteSpace: "nowrap" }}>
                                  <div className="text-dark">
                                    {fmtDate(b.bookingDate)}
                                  </div>
                                  <div
                                    className="text-muted"
                                    style={{ fontSize: "0.72rem" }}
                                  >
                                    {b.bookingTime || ""}
                                  </div>
                                </td>
                                <td
                                  style={{ ...baseCellStyle, textAlign: "center" }}
                                >
                                  {b.memberCount ?? "-"}
                                </td>
                                <td style={baseCellStyle}>
                                  <div className="fw-medium text-dark">
                                    {b.customerName || "-"}
                                  </div>
                                  <div
                                    className="text-muted"
                                    style={{ fontSize: "0.72rem" }}
                                  >
                                    {b.mobile || ""}
                                  </div>
                                </td>
                                <td
                                  style={{ ...baseCellStyle, textAlign: "center" }}
                                >
                                  <StatusPill meta={sMeta} raw={b.bookingStatus} />
                                </td>
                                <td
                                  style={{ ...baseCellStyle, textAlign: "center" }}
                                >
                                  <div className="d-flex justify-content-center align-items-center">
                                    <FaEye
                                      role="button"
                                      tabIndex={0}
                                      title="View details"
                                      style={{
                                        fontSize: "18px",
                                        color: "#007bff",
                                        cursor: "pointer",
                                      }}
                                      onClick={() =>
                                        navigate(
                                          `/booking-details/restaurant-booking/${b.id}`,
                                        )
                                      }
                                      onKeyDown={(e) => {
                                        if (
                                          e.key === "Enter" ||
                                          e.key === " "
                                        ) {
                                          e.preventDefault();
                                          navigate(
                                            `/booking-details/restaurant-booking/${b.id}`,
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
            {!loading && pageData.length > 0 && (
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
                      <span className="fw-semibold text-dark">{displayEnd}</span>{" "}
                      of{" "}
                      <span className="fw-semibold text-dark">
                        {filtered.length}
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
                        value={size}
                        onChange={(e) => {
                          setSize(Number(e.target.value));
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
                        onClick={() => page > 1 && setPage(page - 1)}
                        style={{
                          cursor: page === 1 ? "not-allowed" : "pointer",
                          opacity: page === 1 ? 0.5 : 1,
                        }}
                      />
                      {Array.from(
                        { length: Math.min(5, totalPages) },
                        (_, i) => {
                          let pageNum;
                          if (totalPages <= 5) pageNum = i + 1;
                          else if (page <= 3) pageNum = i + 1;
                          else if (page >= totalPages - 2)
                            pageNum = totalPages - 4 + i;
                          else pageNum = page - 2 + i;
                          return (
                            <Pagination.Item
                              key={pageNum}
                              active={page === pageNum}
                              onClick={() => setPage(pageNum)}
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
                        disabled={page === totalPages}
                        onClick={() => page < totalPages && setPage(page + 1)}
                        style={{
                          cursor:
                            page === totalPages ? "not-allowed" : "pointer",
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

const demoBookings = [
  {
    id: 101,
    bookingNumber: "RB-2026-0001",
    restaurantName: "Spice Garden",
    bookingDate: "2026-05-15",
    bookingTime: "20:00",
    memberCount: 4,
    customerName: "John Doe",
    mobile: "9876543210",
    agentName: "Travel Plus",
    totalAmount: 1450,
    bookingStatus: "Confirmed",
    specialRequest: "Window seat preferred",
    items: [
      { menuName: "Chicken Biriyani", qty: 2, price: 250, total: 500 },
      { menuName: "Shawarma", qty: 5, price: 180, total: 900 },
    ],
  },
];

export default RestaurantBookingList;
