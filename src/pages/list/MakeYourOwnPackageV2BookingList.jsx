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
  Button,
} from "react-bootstrap";
import {
  FaEye,
  FaSearch,
  FaUser,
  FaInbox,
  FaArrowLeft,
} from "react-icons/fa";
import axiosInstance from "../../components/AxiosInstance";
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
  customerName: "170px",
  bookingCode: "110px",
  // Supplier-side confirmation number added on the MYOP v2 booking detail
  // view via the "CONFIRMATION NO." button. Sits next to Booking Code so
  // the two identifiers (internal + supplier) read together. Cell renders
  // blank for rows that don't have one yet. Width tuned so the two-word
  // header ("CONFIRMATION" / "NO") wraps at its space instead of splitting
  // "CONFIRMATION" mid-letter — matches hotel + LM + LS + DS lists.
  confirmationNo: "130px",
  agent: "130px",
  tourDate: "100px",
  total: "110px",
  status: "110px",
  action: "70px",
};

// Reused from LongStayBookingList; mixed-case keys cover the Make Your
// Own Package V2 backend which stores statuses like "On Request".
const STATUS_META = {
  CONFIRMED:    { label: "Confirmed",   bg: "#e7f6ec", color: "#1b7f3a", dot: "#22c55e" },
  Confirmed:    { label: "Confirmed",   bg: "#e7f6ec", color: "#1b7f3a", dot: "#22c55e" },
  COMPLETED:    { label: "Completed",   bg: "#eff8ff", color: "#175cd3", dot: "#3b82f6" },
  Completed:    { label: "Completed",   bg: "#eff8ff", color: "#175cd3", dot: "#3b82f6" },
  PENDING:      { label: "Pending",     bg: "#fff7e6", color: "#b76e00", dot: "#f59e0b" },
  "On Request": { label: "On Request",  bg: "#fff7e6", color: "#b76e00", dot: "#f59e0b" },
  Reconfirmed:  { label: "Reconfirmed", bg: "#eef2ff", color: "#3538cd", dot: "#6366f1" },
  Invoiced:     { label: "Invoiced",    bg: "#eff6ff", color: "#1d4ed8", dot: "#3b82f6" },
  Failed:       { label: "Failed",      bg: "#f3f4f6", color: "#475467", dot: "#98a2b3" },
  CANCELLED:    { label: "Cancelled",   bg: "#fdecec", color: "#b42318", dot: "#ef4444" },
  Cancelled:    { label: "Cancelled",   bg: "#fdecec", color: "#b42318", dot: "#ef4444" },
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

// "dd/mm/yyyy" — matches HotelBookingList's cell rendering.
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

const MakeYourOwnPackageV2BookingList = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState("");

  // Same seven Booking Type options shipped by Hotel Booking List.
  // Make Your Own Package V2 backend persists statuses like
  // "Confirmed" / "On Request" / "Reconfirmed" / "Invoiced" /
  // "Cancelled" plus an `isCancelled` boolean; we map directly to those.
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

  const fetchList = async () => {
    setLoading(true);
    try {
      const role = (
        localStorage.getItem("currentActiveRole") || ""
      ).toLowerCase();
      const params = {};
      if (role === "agent") {
        const agentId = localStorage.getItem("agentId");
        if (agentId && agentId !== "null") params.agentId = agentId;
      }
      const res = await axiosInstance.get(
        "/api/makeYourOwnPackageV2/booking/list",
        { params },
      );
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error("v2 booking list error", e);
      toast.error("Failed to load bookings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  const filteredBookings = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const needle = search.trim().toLowerCase();
    return (rows || []).filter((b) => {
      const isCancelled =
        !!b.isCancelled || normStatus(b.bookingStatus) === "cancelled";
      const tour = b.tourDate ? new Date(b.tourDate) : null;
      if (tour && !isNaN(tour.getTime())) tour.setHours(0, 0, 0, 0);

      if (status === "cancelled" && !isCancelled) return false;
      if (status === "upcoming") {
        if (isCancelled) return false;
        if (!tour || isNaN(tour.getTime())) return false;
        if (tour.getTime() < now.getTime()) return false;
      }
      if (status === "completed") {
        if (isCancelled) return false;
        const isCompletedStatus = normStatus(b.bookingStatus) === "completed";
        const isPastTour =
          tour && !isNaN(tour.getTime()) && tour.getTime() < now.getTime();
        if (!isCompletedStatus && !isPastTour) return false;
      }
      if (status === "onrequest") {
        if (isCancelled) return false;
        if (normStatus(b.bookingStatus) !== "onrequest") return false;
      }
      if (status === "reconfirmed") {
        if (isCancelled) return false;
        if (normStatus(b.bookingStatus) !== "reconfirmed") return false;
      }
      if (status === "invoiced") {
        if (isCancelled) return false;
        if (normStatus(b.bookingStatus) !== "invoiced") return false;
      }

      if (tour && !isNaN(tour.getTime()) && (selectedMonth || selectedYear)) {
        const m = tour.getMonth() + 1;
        const y = tour.getFullYear();
        if (selectedMonth && Number(selectedMonth) !== m) return false;
        if (selectedYear && Number(selectedYear) !== y) return false;
      } else if (!tour && (selectedMonth || selectedYear)) {
        return false;
      }

      if (needle) {
        const hay = [
          b.bookingCode,
          b.customerFirstName,
          b.customerLastName,
          b.customerEmail,
          b.customerPhone,
          b.agentName,
          b.bookingStatus,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, search, status, selectedMonth, selectedYear]);

  useEffect(() => {
    setPage(1);
  }, [search, status, selectedMonth, selectedYear, perPage]);

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
                <h3 className="fw-bold text-dark mb-2">
                  Make Your Own Package Bookings
                </h3>
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
                              the MYOP v2 detail view. MyPkgV2BookingListItem
                              already exposes `confirmationNumber` (mapped in
                              MyPkgV2Service.toResponse), so no backend change
                              is needed. Cell renders blank on rows that don't
                              have one. wordBreak / overflowWrap normal keep
                              the two-word header wrapping only at its space. */}
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
                              width: COLUMN_WIDTHS.agent,
                            }}
                          >
                            Agent
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
                        {pageBookings.length === 0 ? (
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
                              <p className="mt-2 mb-0 fs-5">
                                No bookings found.
                              </p>
                            </td>
                          </tr>
                        ) : (
                          pageBookings.map((b, i) => {
                            const rawStatus = b.isCancelled
                              ? "Cancelled"
                              : b.bookingStatus || "Confirmed";
                            const sMeta =
                              STATUS_META[rawStatus] ||
                              STATUS_META[
                                Object.keys(STATUS_META).find(
                                  (k) =>
                                    k.toLowerCase() ===
                                    String(rawStatus).toLowerCase(),
                                )
                              ];
                            const customerName =
                              [
                                b.salutation,
                                b.customerFirstName,
                                b.customerLastName,
                              ]
                                .filter(Boolean)
                                .join(" ") || "-";
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
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    width: COLUMN_WIDTHS.customerName,
                                  }}
                                >
                                  <div
                                    className="d-flex align-items-center"
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
                                      {customerName}
                                    </span>
                                  </div>
                                  {(b.customerEmail || b.customerPhone) && (
                                    <div
                                      className="text-muted"
                                      style={{ fontSize: "0.7rem" }}
                                    >
                                      {b.customerEmail || ""}
                                      {b.customerEmail && b.customerPhone
                                        ? " · "
                                        : ""}
                                      {b.customerPhone || ""}
                                    </div>
                                  )}
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
                                    already exposed by MyPkgV2BookingListItem.
                                    Renders a muted "-" placeholder when the
                                    supplier hasn't stamped a number yet, so
                                    operators can tell "no confirmation yet"
                                    apart from "cell failed to render". nowrap
                                    keeps the number atomic when present. */}
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
                                  style={{
                                    ...baseCellStyle,
                                    width: COLUMN_WIDTHS.agent,
                                  }}
                                >
                                  <span className="text-dark">
                                    {b.agentName || "-"}
                                  </span>
                                </td>
                                <td
                                  className="text-muted"
                                  style={{
                                    ...baseCellStyle,
                                    textAlign: "center",
                                    width: COLUMN_WIDTHS.tourDate,
                                  }}
                                >
                                  {formatShortDate(b.tourDate) || "-"}
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
                                    ₹ {Number(b.totalPrice || 0).toLocaleString()}
                                  </span>
                                </td>
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    textAlign: "center",
                                    width: COLUMN_WIDTHS.status,
                                  }}
                                >
                                  <StatusPill meta={sMeta} raw={rawStatus} />
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
                                          `/booking-details/make-your-own-package-v2/${b.id}`,
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
                                            `/booking-details/make-your-own-package-v2/${b.id}`,
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
    </div>
  );
};

export default MakeYourOwnPackageV2BookingList;
