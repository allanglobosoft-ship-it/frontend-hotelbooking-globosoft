import React, { useEffect, useMemo, useState, useCallback } from "react";
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

// Column-width hints kept in sync with HotelBookingList / LongStayBookingList
// so the cab list lines up visually under the shared hbl-modern skin.
const COLUMN_WIDTHS = {
  sn: "40px",
  customerName: "150px",
  bookingCode: "130px",
  // Supplier-side confirmation number from the "CONFIRMATION NO." button
  // on the cab detail view. Sourced from CustomBookPackageCab.confirmationNumber
  // and already exposed on CabBookingResponseDTO by the grouped-list mapper
  // (see TripServiceImpl.mapToGroupedCabBookingResponseDTO). Width tuned so
  // the two-word header ("CONFIRMATION" / "NO") wraps at its space instead
  // of splitting "CONFIRMATION" mid-letter — matches the other list pages.
  confirmationNo: "130px",
  bookDate: "95px",
  bookingDetails: "180px",
  travel: "150px",
  pax: "80px",
  paymentMode: "150px",
  total: "110px",
  status: "110px",
  action: "70px",
};

// Colours picked to match HotelBookingList's Notification column palette:
//   Confirmed / ReConfirmed → #06a301 (bright green)
//   Cancelled              → #dc3545 (red)
//   Upcoming / Pending /
//     On Request           → #e67e22 (orange)
// Completed / Invoiced kept in their own neutral hues since Hotel has no
// direct equivalent — they still read distinctly next to the primary trio.
const STATUS_META = {
  CONFIRMED:  { label: "Confirmed",  color: "#06a301" },
  COMPLETED:  { label: "Completed",  color: "#175cd3" },
  PENDING:    { label: "Pending",    color: "#e67e22" },
  CANCELLED:  { label: "Cancelled",  color: "#dc3545" },
  UPCOMING:   { label: "Upcoming",   color: "#e67e22" },
  RECONFIRMED:{ label: "Reconfirmed",color: "#06a301" },
  INVOICED:   { label: "Invoiced",   color: "#5b21b6" },
  ONREQUEST:  { label: "On Request", color: "#e67e22" },
};

// i'way trip-status (iway_trip_status, 0..5 — see IwayOrderStatusResponse
// on the backend) → the bucket key used by both bucketMeta (Status column)
// and the status-filter dropdown below, so the two never disagree. Missing
// on the row entirely (fetched before this field existed) OR null (booking
// created but never refreshed) is treated the same as 0 — "On Request" is
// the correct label for "nothing has happened yet on i'way's side", it's
// not a "no data" placeholder. Only cab rows with apiType "IWAY" carry a
// real iway_trip_status; in-house rows return null here and fall back to
// the pre-existing generic bucketing untouched.
const IWAY_BUCKET_BY_STATUS = {
  0: "onrequest",
  1: "confirmed",
  2: "reconfirmed",
  3: "completed",
  4: "cancelled",
  5: "cancelled",
};
const iwayBucketFor = (b) => {
  if (b.apiType !== "IWAY") return null;
  const s = b.iwayTripStatus == null ? 0 : b.iwayTripStatus;
  return IWAY_BUCKET_BY_STATUS[s] || "reconfirmed";
};

// Notification cell — bare colored+bold text span, matching the exact
// shape HotelBookingList's `renderColoredStatus` uses for its Cancelled /
// Confirmed labels. Deliberately minimal: no padding, no border-radius,
// no inline-flex — those on a span (with no background) produced a
// baseline-snap artefact that read as an underline in the previous style.
const StatusPill = ({ meta, raw }) => {
  if (!meta) return <span className="text-muted">{raw || "-"}</span>;
  return (
    <span style={{ color: meta.color, fontWeight: 600 }}>
      {meta.label}
    </span>
  );
};

// "dd/mm/yyyy" — matches HotelBookingList / LongStayBookingList row dates.
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

const formatPrice = (price) =>
  new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
  }).format(price || 0);

// Payment Mode labels — mirror CabBookingPage.jsx PAYMENT_MODES so the list
// column reads the same as the booking + checkout pages. Legacy "CREDITLIMIT"
// is treated as agent credit. Null / unknown → "-".
const PAYMENT_MODE_LABELS = {
  CREDIT: "Agent credit limit",
  CREDITLIMIT: "Agent credit limit",
  CARD: "Card payment",
  BANK_TRANSFER: "Bank transfer",
  CASH: "Cash",
};

const formatPaymentMode = (value) => {
  if (!value) return "-";
  return PAYMENT_MODE_LABELS[String(value).trim().toUpperCase()] || value;
};

const CabBookingList = () => {
  const navigate = useNavigate();
  const [role, setRole] = useState(() => {
    return localStorage.getItem("currentActiveRole")?.toLowerCase() || null;
  });
  const [userId, setUserId] = useState(() => {
    const stored = localStorage.getItem("userId");
    return (stored && stored !== "null") ? stored : null;
  });

  const [loading, setLoading] = useState(false);
  const [apiData, setApiData] = useState({
    upcomingBookings: { content: [] },
    completedBookings: { content: [] },
    cancelledBookings: { content: [] },
  });

  // Filters mirror HotelBookingList / LongStayBookingList: one Booking
  // Type dropdown (7 options), a search box and a Month + Year card.
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  // Transfer Date filter (YYYY-MM-DD from <input type="date">). Matches
  // HotelBookingList's Check-in Date filter — narrows the list to rows
  // whose pickupDate equals the picked day. Blank = no restriction.
  const [transferDateFilter, setTransferDateFilter] = useState("");

  // Client-side pagination across the merged + filtered list.
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const statusOptions = useMemo(
    () => [
      { value: "all", label: "All" },
      { value: "upcoming", label: "Upcoming" },
      { value: "completed", label: "Completed" },
      { value: "cancelled", label: "Cancelled" },
      { value: "onrequest", label: "On Request" },
      { value: "confirmed", label: "Confirmed" },
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

  // Handle role sync if it's missing from localStorage initially
  useEffect(() => {
    const storedRole = localStorage.getItem("currentActiveRole")?.toLowerCase();
    if (storedRole && storedRole !== role) {
      setRole(storedRole);
    } else if (!storedRole) {
      const userRoles = (localStorage.getItem("userRole") || "").toLowerCase().split(",");
      if (userRoles.includes("agent")) setRole("agent");
      else if (userRoles.includes("staff")) setRole("staff");
      else if (userRoles.includes("admin")) setRole("admin");
    }
  }, [role]);

  // Fetch userId if missing
  useEffect(() => {
    const fetchUserId = async () => {
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
    if (!role) return;
    if ((role === "agent" || role === "staff") && (!userId || userId === "null")) return;

    try {
      setLoading(true);
      // Pull a large window per bucket so the unified "All" view + the
      // booking-type tabs can filter client-side without re-fetching.
      const params = {
        upcomingPage: 0,
        upcomingSize: 500,
        completedPage: 0,
        completedSize: 500,
        cancelledPage: 0,
        cancelledSize: 500,
      };

      if (selectedMonth && selectedYear) {
        params.month = Number(selectedMonth);
        params.year = Number(selectedYear);
      }
      if (role === "agent" && userId) params.agentId = userId;
      else if (role === "staff" && userId) params.staffId = userId;

      const response = await axiosInstance.get("/api/cab/grouped-list", { params });
      if (response.data && response.data.success) {
        setApiData({
          upcomingBookings: response.data.upcomingBookings || { content: [] },
          completedBookings: response.data.completedBookings || { content: [] },
          cancelledBookings: response.data.cancelledBookings || { content: [] },
        });
      }
    } catch {
      toast.error("Failed to load cab bookings");
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear, role, userId]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Tag each booking with the bucket it came from so filters can rely on
  // that even when the backend lacks an explicit `bookingStatus` field.
  //
  // Dedupe by packageBookCode, preferring the "cancelled" bucket.
  //
  // Why: the backend's three grouped queries use MISMATCHED filters —
  // findUpcomingCabBookings gates on `pkg.isDeleted=false` while
  // findCancelledCabBookings gates on `cab.isDeleted=true`. A package
  // whose cab was cancelled but whose sibling items are still active
  // satisfies BOTH, so the same packageBookCode arrives in two buckets
  // and paints two rows for one booking (a Reconfirmed row AND a
  // Cancelled row). Operators only care about the FINAL state on the
  // list — the detail page renders the ReConfirmed → Cancelled history
  // separately — so we collapse duplicates here with cancelled winning.
  const allBookings = useMemo(() => {
    const tag = (list, bucket) =>
      (list || []).map((b) => ({ ...b, __bucket: bucket }));
    const combined = [
      ...tag(apiData.upcomingBookings.content, "upcoming"),
      ...tag(apiData.completedBookings.content, "completed"),
      ...tag(apiData.cancelledBookings.content, "cancelled"),
    ];
    const seen = new Map();
    for (const b of combined) {
      // Fall back to a synthetic key when packageBookCode is missing so
      // ID-less rows are never merged with each other.
      const key = b.packageBookCode || `__row_${seen.size}`;
      const prior = seen.get(key);
      if (!prior || (b.__bucket === "cancelled" && prior.__bucket !== "cancelled")) {
        seen.set(key, b);
      }
    }
    return Array.from(seen.values());
  }, [apiData]);

  const filteredBookings = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return allBookings.filter((b) => {
      const bucket = b.__bucket;
      const isCancelled =
        bucket === "cancelled" ||
        normStatus(b.bookingStatus) === "cancelled" ||
        b.cancelStatus === true;

      if (status === "cancelled" && !isCancelled) return false;
      if (status === "upcoming" && (isCancelled || bucket !== "upcoming")) return false;
      if (status === "completed" && (isCancelled || bucket !== "completed")) return false;
      if (status === "onrequest") {
        if (isCancelled) return false;
        const ib = iwayBucketFor(b);
        if (ib != null) {
          if (ib !== "onrequest") return false;
        } else {
          const s = normStatus(b.bookingStatus || b.confirmationStatus);
          if (s !== "pending" && s !== "onrequest") return false;
        }
      }
      if (status === "confirmed") {
        // Only i'way rows can sit in the "Confirmed" (iway_trip_status=1)
        // bucket today — in-house cab bookings jump straight from
        // On Request to Reconfirmed, same as before this change.
        if (isCancelled) return false;
        if (iwayBucketFor(b) !== "confirmed") return false;
      }
      if (status === "reconfirmed") {
        if (isCancelled) return false;
        const ib = iwayBucketFor(b);
        if (ib != null) {
          if (ib !== "reconfirmed") return false;
        } else {
          const cs = normStatus(b.confirmationStatus);
          if (cs !== "reconfirmed") return false;
        }
      }
      if (status === "invoiced") {
        if (isCancelled) return false;
        const inv =
          normStatus(b.invoiceStatus) === "invoiced" ||
          b.invoiced === true ||
          b.isInvoiced === true;
        if (!inv) return false;
      }

      // Time-period filter — anchored on pickupDate (or bookingDate fallback).
      const anchor = b.pickupDate || b.bookingDate;
      if (anchor && (selectedMonth || selectedYear)) {
        const d = new Date(anchor);
        if (!isNaN(d.getTime())) {
          const m = d.getMonth() + 1;
          const y = d.getFullYear();
          if (selectedMonth && Number(selectedMonth) !== m) return false;
          if (selectedYear && Number(selectedYear) !== y) return false;
        }
      }

      // Transfer Date filter — exact-day match on bookingDate (the value
      // shown in the "Book Date" column) against the YYYY-MM-DD value
      // from <input type="date">. Rows without a bookingDate are
      // excluded when the filter is active.
      const transferPick = (transferDateFilter || "").trim();
      if (transferPick) {
        const bookIso = b.bookingDate
          ? String(b.bookingDate).split("T")[0].trim()
          : "";
        if (bookIso !== transferPick) return false;
      }

      if (needle) {
        const hay = [
          b.packageBookCode,
          b.cabName,
          b.transporter,
          b.customer?.firstName,
          b.customer?.lastName,
          b.customer?.emailId,
          b.agentName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [allBookings, status, search, selectedMonth, selectedYear, transferDateFilter]);

  // Default row order — mirror HotelBookingList: newest Book Date first
  // (descending) across every status, so the list opens on the most
  // recent bookings regardless of Confirmed/Cancelled state. Rows with
  // no bookingDate are pushed to the end.
  const sortedBookings = useMemo(() => {
    return [...filteredBookings].sort((a, b) => {
      const aIso = a.bookingDate ? String(a.bookingDate).split("T")[0].trim() : "";
      const bIso = b.bookingDate ? String(b.bookingDate).split("T")[0].trim() : "";
      if (!aIso && !bIso) return 0;
      if (!aIso) return 1;
      if (!bIso) return -1;
      return bIso.localeCompare(aIso);
    });
  }, [filteredBookings]);

  // Reset to page 1 whenever a filter changes.
  useEffect(() => {
    setPage(1);
  }, [search, status, selectedMonth, selectedYear, transferDateFilter, perPage]);

  const totalEntries = sortedBookings.length;
  const safeTotalPages = Math.max(1, Math.ceil(totalEntries / perPage));
  const currentPage = Math.min(page, safeTotalPages);
  const serialNumberBase = (currentPage - 1) * perPage;
  const pageBookings = sortedBookings.slice(
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
    overflowWrap: "break-word",
    lineHeight: 1.25,
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

  // i'way rows: Status mirrors the live iway_trip_status via iwayBucketFor
  // (0 → On Request, 1 → Confirmed, 2 → Reconfirmed, ...) so this column
  // always matches the detail page's badge — never hardcoded.
  //
  // Non-iWay (in-house) rows keep the pre-existing behaviour unchanged:
  // any booking that survived create + approve + wallet deduction is fully
  // committed, so legacy raw values ("OK", "CONFIRMED", null, etc.) all
  // fold into the same "Reconfirmed" label.
  const bucketMeta = (b) => {
    const isCancelled =
      b.__bucket === "cancelled" ||
      normStatus(b.bookingStatus) === "cancelled" ||
      b.cancelStatus === true;
    if (isCancelled) return STATUS_META.CANCELLED;
    const iwayBucket = iwayBucketFor(b);
    switch (iwayBucket) {
      case "onrequest":   return STATUS_META.ONREQUEST;
      case "confirmed":   return STATUS_META.CONFIRMED;
      case "reconfirmed": return STATUS_META.RECONFIRMED;
      case "completed":   return STATUS_META.COMPLETED;
      case "cancelled":   return STATUS_META.CANCELLED;
      default:            return STATUS_META.RECONFIRMED;
    }
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column hbl-modern cab-booking-list">
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
                <h3 className="fw-bold text-dark mb-2">Cab Bookings</h3>
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
                          Transfer Date
                        </h6>
                        <div className="d-flex gap-2">
                          <Form.Control
                            type="date"
                            value={transferDateFilter}
                            onChange={(e) =>
                              setTransferDateFilter(e.target.value)
                            }
                            size="sm"
                            aria-label="Transfer date filter"
                            style={{ fontSize: "0.85rem", height: "46px" }}
                          />
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            onClick={() => setTransferDateFilter("")}
                            disabled={!transferDateFilter}
                            aria-label="Clear transfer date filter"
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
                        overflowWrap: "break-word",
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
                          <th style={{ ...baseHeaderStyle, textAlign: "center", whiteSpace: "nowrap", width: COLUMN_WIDTHS.sn }}>
                            S.N
                          </th>
                          {role === "admin" && (
                            <th style={{ ...baseHeaderStyle, whiteSpace: "nowrap", width: COLUMN_WIDTHS.customerName }}>
                              Agent Name
                            </th>
                          )}
                          <th style={{ ...baseHeaderStyle, width: COLUMN_WIDTHS.customerName }}>
                            Customer Name
                          </th>
                          <th style={{ ...baseHeaderStyle, width: COLUMN_WIDTHS.bookingCode }}>
                            Booking Code
                          </th>
                          {/* Confirmation No — supplier's confirmation number
                              from the "CONFIRMATION NO." button on the cab
                              detail view. CabBookingResponseDTO already
                              exposes `confirmationNumber`, so no backend
                              change is needed. Cell renders "-" on rows
                              that don't have one. wordBreak / overflowWrap
                              normal keep the two-word header wrapping only
                              at its space, mirroring the other list pages. */}
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
                          <th style={{ ...baseHeaderStyle, textAlign: "center", whiteSpace: "nowrap", width: COLUMN_WIDTHS.bookDate }}>
                            Book Date
                          </th>
                          <th style={{ ...baseHeaderStyle, width: COLUMN_WIDTHS.bookingDetails }}>
                            Cab Details
                          </th>
                          <th style={{ ...baseHeaderStyle, width: COLUMN_WIDTHS.travel }}>
                            Travel
                          </th>
                          <th style={{ ...baseHeaderStyle, textAlign: "center", width: COLUMN_WIDTHS.pax }}>
                            Pax
                          </th>
                          <th style={{ ...baseHeaderStyle, textAlign: "center", whiteSpace: "nowrap", width: COLUMN_WIDTHS.paymentMode }}>
                            Payment Mode
                          </th>
                          <th style={{ ...baseHeaderStyle, textAlign: "right", width: COLUMN_WIDTHS.total }}>
                            Total
                          </th>
                          <th style={{ ...baseHeaderStyle, textAlign: "center", whiteSpace: "nowrap", width: COLUMN_WIDTHS.status }}>
                            Notification
                          </th>
                          <th style={{ ...baseHeaderStyle, textAlign: "center", whiteSpace: "nowrap", width: COLUMN_WIDTHS.action }}>
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageBookings.length === 0 ? (
                          <tr>
                            <td
                              colSpan={role === "admin" ? 12 : 11}
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
                            const sMeta = bucketMeta(b);
                            const customerName =
                              [b.customer?.salutaion, b.customer?.firstName, b.customer?.lastName]
                                .filter(Boolean)
                                .join(" ") || "-";
                            return (
                              <tr
                                key={b.custombookingId ?? `${b.__bucket}-${i}`}
                                style={{
                                  backgroundColor:
                                    i % 2 === 0 ? "#ffffff" : "#f8f9fa",
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
                                  <td style={{ ...baseCellStyle, width: COLUMN_WIDTHS.customerName }}>
                                    <span className="fw-medium text-dark">
                                      {b.agentName || "-"}
                                    </span>
                                  </td>
                                )}
                                <td style={{ ...baseCellStyle, width: COLUMN_WIDTHS.customerName }}>
                                  <div
                                    className="d-flex align-items-center"
                                    style={{ gap: "0.4rem", flexWrap: "wrap" }}
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
                                        {customerName}
                                      </span>
                                    </span>
                                  </div>
                                  {b.customer?.emailId && (
                                    <div
                                      className="text-muted"
                                      style={{ fontSize: "0.7rem" }}
                                    >
                                      {b.customer.emailId}
                                    </div>
                                  )}
                                </td>
                                <td style={{ ...baseCellStyle, width: COLUMN_WIDTHS.bookingCode }}>
                                  <span className="fw-bold text-primary">
                                    {b.packageBookCode || "-"}
                                  </span>
                                </td>
                                {/* Confirmation No cell — reads the field
                                    already returned on CabBookingResponseDTO.
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
                                  className="text-muted"
                                  style={{
                                    ...baseCellStyle,
                                    textAlign: "center",
                                    width: COLUMN_WIDTHS.bookDate,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {formatShortDate(b.bookingDate) || "-"}
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
                                      {b.cabName || "-"}
                                    </span>
                                    {b.transporter && (
                                      <span
                                        className="text-muted"
                                        style={{ fontSize: "0.75rem" }}
                                      >
                                        ({b.transporter})
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    width: COLUMN_WIDTHS.travel,
                                  }}
                                >
                                  <div className="text-dark" style={{ fontSize: "0.78rem" }}>
                                    {formatShortDate(b.pickupDate) || "-"}
                                  </div>
                                  {(b.pickupName || b.dropoffName) && (
                                    <div
                                      className="text-muted"
                                      style={{
                                        fontSize: "0.7rem",
                                        // Cap the Travel cell at 3 lines total:
                                        // 1 line for the date above + up to 2
                                        // lines for the route (clamped with an
                                        // ellipsis; full route shows on hover).
                                        display: "-webkit-box",
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: "vertical",
                                        overflow: "hidden",
                                      }}
                                      title={`${b.pickupName || ""}${
                                        b.dropoffName ? ` → ${b.dropoffName}` : ""
                                      }`}
                                    >
                                      {b.pickupName || ""}
                                      {b.dropoffName ? ` → ${b.dropoffName}` : ""}
                                    </div>
                                  )}
                                </td>
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    textAlign: "center",
                                    width: COLUMN_WIDTHS.pax,
                                  }}
                                >
                                  <span
                                    className="px-2 py-1 rounded"
                                    style={{
                                      backgroundColor: "#eff8ff",
                                      color: "#175cd3",
                                      fontSize: "0.7rem",
                                      fontWeight: 600,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {b.noOfAdult || 0}A / {b.noOfChild || 0}C
                                  </span>
                                </td>
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    textAlign: "center",
                                    width: COLUMN_WIDTHS.paymentMode,
                                  }}
                                >
                                  <span
                                    className="fw-medium text-dark"
                                    style={{ whiteSpace: "nowrap" }}
                                  >
                                    {formatPaymentMode(b.paymentMode)}
                                  </span>
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
                                    {formatPrice(b.totalPrice)}
                                  </span>
                                </td>
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    textAlign: "center",
                                    width: COLUMN_WIDTHS.status,
                                  }}
                                >
                                  <StatusPill meta={sMeta} raw={b.confirmationStatus || b.bookingStatus || b.__bucket} />
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
                                          `/booking-details/cab-booking/${b.custombookingId}`,
                                          { state: { booking: b } },
                                        )
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault();
                                          navigate(
                                            `/booking-details/cab-booking/${b.custombookingId}`,
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
                        onClick={() => currentPage > 1 && setPage(currentPage - 1)}
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
                            onClick={() => setPage(pageNumber)}
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
                          currentPage < safeTotalPages && setPage(currentPage + 1)
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

export default CabBookingList;
