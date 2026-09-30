/**
 * SchefferDriverBookingList.jsx
 *
 * Booking-list page for the Scheffer Driver new-booking flow.
 *
 *   GET /api/scheffer/grouped-list — upcoming / completed / cancelled buckets,
 *   accepts optional month / year params (Time Period filter).
 *
 * The Action column contains only the View (eye) icon — clicking it
 * navigates to a dedicated detail page
 * (/booking-details/scheffer-driver-booking/:id) where Voucher / Cancel /
 * Action buttons live.
 *
 * Visually mirrors the Hotel Booking List (`hbl-modern` skin): title +
 * 300px search left, Time Period card right, Booking Type filter card,
 * bordered table, FaInbox empty state, StatusPill, plain blue FaEye
 * action, and a pagination card with Showing/Rows-per-page/Prev-Pages-Next.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  Container,
  Card,
  Form,
  Table,
  InputGroup,
  Spinner,
  Row,
  Col,
  Pagination,
  Button,
} from "react-bootstrap";
import { FaSearch, FaEye, FaMapMarkerAlt, FaInbox, FaArrowLeft } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import toast from "react-hot-toast";
import "../../styles/HotelBookingListModern.css";
import DashboardRedirections from "../../components/DashboardRedirections";

const PER_PAGE_OPTIONS = [10, 25, 50, 100];

const COLUMN_WIDTHS = {
  sn: "40px",
  booking: "120px",
  // Supplier-side confirmation number from the "CONFIRMATION NO." button
  // on the Scheffer detail view. Sourced from
  // SchefferBooking.confirmationNumber and already exposed on
  // SchefferBookingResponseDTO by the grouped mapper (see
  // SchefferBookingService.toResponse). Width tuned so the two-word
  // header ("CONFIRMATION" / "NO") wraps at its space instead of
  // splitting "CONFIRMATION" mid-letter — matches the other list pages.
  confirmationNo: "130px",
  customer: "160px",
  cab: "150px",
  travel: "260px",
  pax: "90px",
  amount: "120px",
  status: "110px",
  action: "70px",
};

// Status meta — Scheffer buckets map to Confirmed (upcoming),
// Completed and Cancelled. Extra entries kept for parity with HBL.
const STATUS_META = {
  CONFIRMED:   { label: "Confirmed",   bg: "#e7f6ec", color: "#1b7f3a", dot: "#22c55e" },
  RECONFIRMED: { label: "Reconfirmed", bg: "#e6faf7", color: "#0f766e", dot: "#14b8a6" },
  COMPLETED:   { label: "Completed",   bg: "#eff8ff", color: "#175cd3", dot: "#3b82f6" },
  PENDING:     { label: "Pending",     bg: "#fff7e6", color: "#b76e00", dot: "#f59e0b" },
  REJECTED:    { label: "Rejected",    bg: "#fff4e5", color: "#c2410c", dot: "#f97316" },
  CANCELLED:   { label: "Cancelled",   bg: "#fdecec", color: "#b42318", dot: "#ef4444" },
  UPCOMING:    { label: "Upcoming",    bg: "#e7f6ec", color: "#1b7f3a", dot: "#22c55e" },
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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

const fmtDateLong = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d)) return typeof iso === "string" ? iso.slice(0, 10) : "-";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const normStatus = (v) =>
  String(v ?? "").replace(/[\s_-]+/g, "").toLowerCase();

// Status pill resolver. The date-based bucket alone can't tell Confirmed
// from Reconfirmed (a reconfirmed booking still lives in the "upcoming"
// bucket), so the workflow status (confirmationStatus / reconfirmation)
// takes precedence — matching the detail page. Cancelled always wins since
// a cancelled row may still carry a prior "ReConfirmed" confirmationStatus.
// Kept at module scope so both the Status column and the search haystack
// (below) can derive the same visible label.
const rowStatusMeta = (b) => {
  if (b.__bucket === "cancelled") return STATUS_META.CANCELLED;
  const cs = normStatus(b.confirmationStatus);
  if (cs === "cancelled") return STATUS_META.CANCELLED;
  if (cs === "reconfirmed" || b.reconfirmation === true)
    return STATUS_META.RECONFIRMED;
  if (cs === "rejected") return STATUS_META.REJECTED;
  return STATUS_META.CONFIRMED;
};

const getPickupLandmarkAddress = (b) => {
  if (!b) return "";
  return (
    b.pickupLandmarkAddress ||
    b.pickupLandmark ||
    b.landmark ||
    b.landMark ||
    b.pickupAddress ||
    b.pickUpLandmark ||
    b.pickUpLandmarkAddress ||
    b.pickUpAddress ||
    b.pickupLocation ||
    b.pickupDetails ||
    b.pickupRemark ||
    b.pickupLandmarkDetails ||
    b.custPickupLandmark ||
    b.custPickupAddress ||
    b.customerDTO?.pickupLandmark ||
    b.customerDTO?.pickupLandmarkAddress ||
    b.customerDTO?.landmark ||
    b.customerDTO?.pickupAddress ||
    b.customer?.pickupLandmark ||
    b.customer?.pickupLandmarkAddress ||
    b.customer?.landmark ||
    b.customer?.pickupAddress ||
    ""
  );
};

const SchefferDriverBookingList = ({
  apiBase = "/api/scheffer",
  pageTitle = "Chauffeur Driver & Limousine Bookings",
}) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({
    upcoming: [],
    completed: [],
    cancelled: [],
  });

  // Filters mirror HBL: search + booking-type dropdown + month/year.
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState("");

  // Pagination (1-indexed) mirrors HBL.
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: current - 2014 }, (_, i) => 2020 + i);
  }, []);

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

  const fetchList = async () => {
    setLoading(true);
    try {
      const role = (localStorage.getItem("currentActiveRole") || "")
        .toLowerCase();
      const params = {
        upcomingPage: 0,
        upcomingSize: 500,
        completedPage: 0,
        completedSize: 500,
        cancelledPage: 0,
        cancelledSize: 500,
      };
      if (role === "agent") {
        const agentId = localStorage.getItem("agentId");
        if (agentId && agentId !== "null") params.agentId = agentId;
      }
      if (selectedMonth) params.month = selectedMonth;
      if (selectedYear) params.year = selectedYear;
      const res = await axiosInstance.get(`${apiBase}/grouped-list`, {
        params,
      });
      const d = res.data || {};
      setData({
        upcoming: d.upcoming || [],
        completed: d.completed || [],
        cancelled: d.cancelled || [],
      });
    } catch (e) {
      console.error("Error loading bookings:", e);
      toast.error("Failed to load bookings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line
  }, [apiBase, selectedMonth, selectedYear]);

  // Flatten the three buckets into one list, tagging each row with the
  // bucket it came from so the Status column / filter can use it.
 const allRows = useMemo(() => {
  const tag = (arr, bucket) =>
    (arr || []).map((b) => ({ ...b, __bucket: bucket }));

  return [
    ...tag(data.upcoming, "upcoming"),
    ...tag(data.completed, "completed"),
    ...tag(data.cancelled, "cancelled"),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}, [data]);

  const filteredBookings = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return allRows.filter((b) => {
      // Bucket / status filter
      if (status === "upcoming" && b.__bucket !== "upcoming") return false;
      if (status === "completed" && b.__bucket !== "completed") return false;
      if (status === "cancelled" && b.__bucket !== "cancelled") return false;
      if (status === "onrequest") {
        const s = normStatus(b.bookingStatus || b.confirmationStatus);
        if (s !== "pending" && s !== "onrequest") return false;
      }
      if (status === "reconfirmed") {
        const cs = normStatus(b.confirmationStatus);
        if (cs !== "reconfirmed") return false;
      }
      if (status === "invoiced") {
        const inv =
          normStatus(b.invoiceStatus) === "invoiced" ||
          b.invoiced === true ||
          b.isInvoiced === true;
        if (!inv) return false;
      }

      if (needle) {
        // Include the visible Status label (Confirmed / Reconfirmed /
        // Completed / Cancelled …) so a search like "reconfirmed" matches
        // the Status column, plus the raw confirmationStatus for good
        // measure — alongside the existing Booking / Cab / customer /
        // location fields.
        const hay = [
          b.bookingCode,
          b.packageBookCode,
          b.cabName,
          b.cabProviderName,
          b.transporter,
          b.custFirstName,
          b.custLastName,
          b.pickupName,
          b.dropoffName,
          rowStatusMeta(b)?.label,
          b.confirmationStatus,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [allRows, search, status]);

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
                <h3 className="fw-bold text-dark mb-2">{pageTitle}</h3>
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

            {/* Filters: Booking Type */}
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
                              width: COLUMN_WIDTHS.booking,
                            }}
                          >
                            Booking
                          </th>
                          {/* Confirmation No — supplier's confirmation number
                              from the "CONFIRMATION NO." button on the
                              Scheffer detail view. SchefferBookingResponseDTO
                              already exposes `confirmationNumber`, so no
                              backend change is needed. Cell renders "-" on
                              rows that don't have one. wordBreak /
                              overflowWrap normal keep the two-word header
                              wrapping only at its space, mirroring the other
                              list pages. */}
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
                              width: COLUMN_WIDTHS.customer,
                            }}
                          >
                            Customer
                          </th>
                          <th
                            style={{
                              ...baseHeaderStyle,
                              width: COLUMN_WIDTHS.cab,
                            }}
                          >
                            Cab
                          </th>
                          <th
                            style={{
                              ...baseHeaderStyle,
                              width: COLUMN_WIDTHS.travel,
                            }}
                          >
                            Travel
                          </th>
                          <th
                            style={{
                              ...baseHeaderStyle,
                              textAlign: "center",
                              width: COLUMN_WIDTHS.pax,
                            }}
                          >
                            Pax
                          </th>
                          <th
                            style={{
                              ...baseHeaderStyle,
                              textAlign: "right",
                              width: COLUMN_WIDTHS.amount,
                            }}
                          >
                            Amount
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
                              colSpan={9}
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
                            const sMeta = rowStatusMeta(b);
                            return (
                              <tr
                                key={b.id || b.custombookingId || `${b.__bucket}-${i}`}
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
                                    width: COLUMN_WIDTHS.booking,
                                  }}
                                >
                                  <div className="fw-bold text-primary">
                                    {b.bookingCode || b.packageBookCode || "-"}
                                  </div>
                                  {b.createdAt && (
                                    <div
                                      className="text-muted"
                                      style={{ fontSize: "0.7rem" }}
                                    >
                                      {fmtDateLong(b.createdAt)}
                                    </div>
                                  )}
                                </td>
                                {/* Confirmation No cell — reads the field
                                    already returned on SchefferBookingResponseDTO.
                                    Muted "-" when the operator hasn't saved
                                    a number yet (consistent with the other
                                    list pages' placeholder). nowrap keeps a
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
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    width: COLUMN_WIDTHS.customer,
                                  }}
                                >
                                  <div className="fw-medium text-dark">
                                    {[
                                      b.custSalutation,
                                      b.custFirstName,
                                      b.custLastName,
                                    ]
                                      .filter(Boolean)
                                      .join(" ") || "-"}
                                  </div>
                                  {(b.custEmail || b.custPhone) && (
                                    <div
                                      className="text-muted"
                                      style={{ fontSize: "0.7rem" }}
                                    >
                                      {b.custEmail || b.custPhone}
                                    </div>
                                  )}
                                </td>
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    width: COLUMN_WIDTHS.cab,
                                  }}
                                >
                                  <div className="fw-medium text-dark">
                                    {b.cabName || `Cab #${b.cabId || "-"}`}
                                  </div>
                                  {b.cabProviderName && (
                                    <div
                                      className="text-muted"
                                      style={{ fontSize: "0.7rem" }}
                                    >
                                      {b.cabProviderName}
                                    </div>
                                  )}
                                </td>
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    width: COLUMN_WIDTHS.travel,
                                  }}
                                >
                                  <div className="d-flex align-items-center gap-1">
                                    <FaMapMarkerAlt
                                      style={{
                                        color: "#22c55e",
                                        fontSize: "0.7rem",
                                      }}
                                    />
                                    <span className="text-dark">
                                      {b.pickupName || "-"}
                                    </span>
                                    {b.pickupTime && (
                                      <span
                                        className="text-muted"
                                        style={{ fontSize: "0.7rem" }}
                                      >
                                        @ {b.pickupTime}
                                      </span>
                                    )}
                                  </div>
                                  {getPickupLandmarkAddress(b) ? (
                                    <div
                                      className="text-muted"
                                      style={{
                                        fontSize: "0.7rem",
                                        paddingLeft: "12px",
                                      }}
                                    >
                                      📍 {getPickupLandmarkAddress(b)}
                                    </div>
                                  ) : null}
                                  <div className="d-flex align-items-center gap-1">
                                    <FaMapMarkerAlt
                                      style={{
                                        color: "#ef4444",
                                        fontSize: "0.7rem",
                                      }}
                                    />
                                    <span className="text-dark">
                                      {b.dropoffName || "-"}
                                    </span>
                                    {b.dropoffTime && (
                                      <span
                                        className="text-muted"
                                        style={{ fontSize: "0.7rem" }}
                                      >
                                        @ {b.dropoffTime}
                                      </span>
                                    )}
                                  </div>
                                  <div
                                    className="text-muted"
                                    style={{
                                      fontSize: "0.7rem",
                                      marginTop: "2px",
                                    }}
                                  >
                                    {fmtDateLong(b.pickupDate)}
                                    {b.dropOffDate
                                      ? ` → ${fmtDateLong(b.dropOffDate)}`
                                      : ""}
                                  </div>
                                </td>
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    textAlign: "center",
                                    width: COLUMN_WIDTHS.pax,
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: "0.72rem",
                                      fontWeight: 600,
                                    }}
                                  >
                                    {b.noOfAdult || 0} ADT / {b.noOfChild || 0}{" "}
                                    CHD
                                  </span>
                                </td>
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    textAlign: "right",
                                    width: COLUMN_WIDTHS.amount,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  <div className="fw-semibold text-dark">
                                    AED{" "}
                                    {b.finalAmount != null
                                      ? b.finalAmount
                                      : b.totalPrice || b.totalRate || "-"}
                                  </div>
                                  {b.packageName && (
                                    <div
                                      className="text-muted"
                                      style={{ fontSize: "0.7rem" }}
                                    >
                                      {b.packageName}
                                    </div>
                                  )}
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
                                    raw={b.confirmationStatus || b.__bucket}
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
                                          `/booking-details/scheffer-driver-booking/${b.id || b.custombookingId}`,
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
                                            `/booking-details/scheffer-driver-booking/${b.id || b.custombookingId}`,
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

export default SchefferDriverBookingList;
