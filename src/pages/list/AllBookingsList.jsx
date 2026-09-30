import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Row,
  Col,
  Card,
  Button,
  Form,
  Table,
  Badge,
  InputGroup,
  Spinner,
  Pagination,
} from "react-bootstrap";
import { FaSearch, FaEye, FaInbox, FaUser, FaExclamationCircle } from "react-icons/fa";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import toast from "react-hot-toast";
import "../../styles/HotelBookingListModern.css";

// Unified "All Bookings" list — reads GET /api/unified-bookings/list, a
// new, standalone, read-only endpoint that combines Hotel, 24 Hour,
// Last Minute, Long Stay, Day Stay, Government Employee, Student and
// Senior Citizen bookings into one list. This page is intentionally
// built to look and behave exactly like HotelBookingList.jsx (same
// shell, header, filters card, table, pagination, status colouring,
// styling) — the ONLY functional addition is the Booking Type dropdown
// below, which filters by booking CATEGORY (Hotel/24 Hours/... ) rather
// than by the confirmation-status "Booking Type" dropdown the reference
// page uses (that concept doesn't apply across 8 different tables, and
// the unified endpoint doesn't expose per-status buckets the way
// /api/bookings/list/* does — see UnifiedBookingListServiceImpl).
//
// Two small, disclosed deviations from the reference, both driven by
// what the unified DTO actually carries:
//   - Customer Name shows only the single primary guest (the unified
//     endpoint doesn't return a full guestNames[] array per row like
//     the hotel-specific endpoint does), so there's no "+N more" badge
//     / Customers modal here.
//   - The Booking Details cell's badge (which on the reference page
//     only ever shows "24H") now shows this row's booking type instead
//     — reusing the exact same badge slot/style so the table still
//     looks identical, since without SOME type indicator a mixed list
//     with a View button that jumps to 8 different detail pages would
//     be unusable.
const PER_PAGE_OPTIONS = [10, 25, 50, 100];
const SEARCH_ALL_PAGE_SIZE = 10000;

// Widths are proportional hints for the browser (table-layout: fixed +
// width: 100% below). The layout fits inside the viewport without any
// horizontal scroll:
//   * Headers use whiteSpace: normal (see thStyle) so full multi-word
//     labels wrap onto two lines instead of getting truncated to
//     "AGENT N...".
//   * Row cells use whiteSpace: nowrap so dates and short values stay
//     on one line; anything longer than its column truncates with
//     ellipsis AND carries a title tooltip so hovering reveals the
//     full string. Hotel column explicitly re-enables wrapping so its
//     name + type badge can stack.
// Sum kept ~1250px so all 16 admin columns land inside the viewport
// content area without a horizontal scrollbar. Multi-word cell values
// still wrap (see baseCellStyle) so nothing gets truncated.
const COLUMN_WIDTHS = {
  sn: "34px",
  agentName: "82px",  // admin-only
  supplier: "72px",   // admin-only (whitelabel invariant — agents never see this)
  booker: "100px",    // was Customer Name — header now reads "Pax Name"
  pax: "38px",        // total pax
  rsvnRef: "90px",    // was Booking Code
  confirmationNumber: "80px", // header now reads "Hotel Conf"
  bookDate: "75px",
  hotel: "130px",     // hotel name + booking-type badge
  bookedBy: "90px",   // "Booker" column — operator who created the booking (Hotel only)
  checkIn: "72px",
  checkOut: "72px",
  deadlineDate: "80px",
  paymentMode: "95px",
  paymentStatus: "90px",
  status: "90px",     // was Notification — NotificationCell content unchanged
  action: "50px",
};

const BOOKING_TYPE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "Hotel", label: "Hotel" },
  { value: "24 Hours", label: "24 Hours" },
  { value: "Last Minute", label: "Last Minute" },
  { value: "Long Stay", label: "Long Stay" },
  { value: "Day Stay", label: "Day Stay" },
  { value: "Government Employee", label: "Government Employee" },
  { value: "Student", label: "Student" },
  { value: "Senior Citizen", label: "Senior Citizen" },
];

// Same badge palette idea as the reference page's "24H" badge — one
// subtle color per type so a mixed "All" view stays scannable.
const TYPE_BADGE_CLASS = {
  "Hotel": "bg-primary-subtle text-primary border border-primary-subtle",
  "24 Hours": "bg-warning-subtle text-warning border border-warning-subtle",
  "Last Minute": "bg-danger-subtle text-danger border border-danger-subtle",
  "Long Stay": "bg-success-subtle text-success border border-success-subtle",
  "Day Stay": "bg-info-subtle text-info border border-info-subtle",
  "Government Employee": "bg-secondary-subtle text-secondary border border-secondary-subtle",
  "Student": "bg-dark-subtle text-dark border border-dark-subtle",
  "Senior Citizen": "bg-secondary-subtle text-secondary border border-secondary-subtle",
};

// Resolve a human-readable Payment Mode label — identical logic to
// HotelBookingList.jsx's getPaymentModeLabel.
const getPaymentModeLabel = (booking) => {
  const raw = booking?.paymentMode || booking?.payment_mode || booking?.paymentType || "";
  const norm = String(raw).trim().toUpperCase();
  if (norm === "CREDIT" || norm === "CREDIT_LIMIT" || norm === "CREDIT LIMIT" || norm === "CREDITLIMIT") {
    return "Credit Limit Payment";
  }
  if (norm === "ONLINE" || norm === "ONLINE_PAYMENT" || norm === "ONLINE PAYMENT") {
    return "Online Payment";
  }
  if (norm) return raw;
  if (booking?.creditLimitPayment === true) return "Credit Limit Payment";
  if (booking?.paidOnline === true || booking?.onlinePayment === true) return "Online Payment";
  return "-";
};

// Resolve the Payment Status label from the booking's DISPLAYED status — same
// mapping as /booking-details/hotel-booking-list:
//   Confirmed                      → Payment Pending
//   ReConfirmed                    → Paid
//   ReConfirmed/Cancelled          → Paid
//   Confirmed/Cancelled            → Un-Paid
//   On Request/Confirmed/Cancelled → Un-Paid
// plus the Day-Stay rule: a live On Request booking — whether or not step-1
// Confirm has landed — reads "Payment Pending", because the money has not been
// collected yet.
// Anything else — Not Confirmed, Requested, Sold Out, or an unknown/empty
// status — has no defined mapping and renders "-".
//
// A cancelled booking reports whether the money had already been collected at
// the point of cancellation rather than the cancellation itself: a history that
// reached ReConfirmed was paid, one that stopped at On Request / Confirmed
// never was.
//
// The resolution deliberately mirrors NotificationCell below — same compound
// collapse, same On-Request override — so the two columns can never disagree.
//
// Note on cancellations: this aggregated list flattens a cancelled hotel
// booking's label to a bare "Cancelled" (UnifiedBookingListServiceImpl.
// resolveHotelConfirmationStatus → formatFlowStatus), discarding the history.
// `cancelledFromStatus` is stamped at cancel time (BookingCancellationServiceImpl:207)
// from the engine bookingStatus label and is therefore the authoritative signal
// for what the booking had reached before it was cancelled.
//
// `booking.reconfirmation` is deliberately NOT consulted here: several inhouse
// creation paths (see InhouseHotelBookingService setReconfirmation(true) at
// booking time) set it as a scheduling flag rather than a "was reconfirmed"
// marker, so a Confirmed-then-Cancelled booking can carry reconfirmation=true
// and would be wrongly reported as Paid.
const getPaymentStatusLabel = (booking) => {
  const rawStatus = String(booking?.confirmationStatus || "");
  const segments = rawStatus
    .split("/")
    .map((seg) => seg.replace(/\s+/g, "").toLowerCase())
    .filter(Boolean);
  if (segments.length === 0) return "-";

  // Cancelled histories are settled by what the booking reached BEFORE the
  // cancellation, so check this ahead of the confirm-history collapse.
  const latest = segments[segments.length - 1];
  if (latest === "cancelled" || latest === "canceled") {
    const cancelledFromNormalized = String(booking?.cancelledFromStatus || "")
      .replace(/\s+/g, "")
      .toLowerCase();
    const wasReconfirmedBeforeCancel =
      cancelledFromNormalized.includes("reconfirmed") ||
      segments.includes("reconfirmed");
    return wasReconfirmedBeforeCancel ? "Paid" : "Un-Paid";
  }

  // Collapse a confirm-history compound ("Confirmed / ReConfirmed") to its
  // LATEST segment, exactly as NotificationCell does.
  const isConfirmHistoryCompound =
    segments.length > 1 &&
    segments.every((seg) => ["confirmed", "reconfirmed"].includes(seg));
  const effective = isConfirmHistoryCompound ? latest : segments.join("/");

  if (effective === "reconfirmed") return "Paid";
  if (effective === "confirmed") {
    // An On Request room shows as "On Request" in the Notification column even
    // though the engine stamps it Confirmed — and an on-request booking is
    // payment-pending either way, so both states resolve the same here.
    return "Payment Pending";
  }

  return "-";
};

const formatDate = (dateString) => {
  if (!dateString) return "";
  const normalized = String(dateString).includes("T") ? dateString : `${dateString}T00:00:00`;
  const date = new Date(normalized);
  if (isNaN(date.getTime())) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
};

const formatDeadlineDate = (dateString) => {
  if (!dateString) return "-";
  return String(dateString).split("T")[0] || "-";
};

const toIsoDay = (dateString) => {
  if (!dateString) return "";
  return String(dateString).split("T")[0].trim();
};

// Colour each "/"-separated segment of a confirmation status
// independently — identical to HotelBookingList.jsx's statusSegColor /
// renderColoredStatus.
const statusSegColor = (part) => {
  const p = (part || "").trim().replace(/\s+/g, "").toLowerCase();
  if (p.startsWith("reconfirmed")) return "#06a301";
  if (p.startsWith("confirmed")) return "#06a301";
  if (p.startsWith("cancelled")) return "#dc3545";
  if (p === "onrequest") return "#ff9800";
  return "#6c757d";
};
const renderColoredStatus = (text) => {
  const parts = String(text ?? "-").split("/");
  return parts.map((part, i) => (
    <React.Fragment key={i}>
      {i > 0 && <span style={{ color: "#6c757d" }}>/</span>}
      <span style={{ color: statusSegColor(part) }}>{part}</span>
    </React.Fragment>
  ));
};

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const currentYear = new Date().getFullYear();
const years = Array.from({ length: currentYear - 2014 }, (_, i) => 2020 + i);

const AllBookingsList = () => {
  const navigate = useNavigate();
  const [role] = useState(() => localStorage.getItem("currentActiveRole")?.toLowerCase() || null);

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [bookingTypeFilter, setBookingTypeFilter] = useState("all");
  const [checkInDateFilter, setCheckInDateFilter] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [pageState, setPageState] = useState({ page: 1, perPage: 10 });
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);

  const currentPage = pageState.page;
  const currentPerPage = pageState.perPage;

  const resetPage = useCallback(() => {
    setPageState((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 }));
  }, []);

  const handlePageChange = useCallback((nextPage) => {
    setPageState((prev) => (prev.page === nextPage ? prev : { ...prev, page: nextPage }));
  }, []);

  const handlePageSizeChange = useCallback((nextSize) => {
    setPageState((prev) =>
      prev.perPage === nextSize && prev.page === 1 ? prev : { perPage: nextSize, page: 1 },
    );
  }, []);

  const handleMonthChange = useCallback((value) => { setSelectedMonth(value); resetPage(); }, [resetPage]);
  const handleYearChange = useCallback((value) => { setSelectedYear(value); resetPage(); }, [resetPage]);

  // Any client-side filter active? Search / Check-in Date / Booking Type
  // all filter the already-fetched dataset (the unified endpoint has no
  // search/date/type query params), mirroring HotelBookingList's
  // isClientFiltering trick: fetch the FULL month/year-filtered dataset
  // instead of just the current page whenever one of these is active.
  const isClientFiltering =
    Boolean(search.trim()) || Boolean(checkInDateFilter.trim()) || bookingTypeFilter !== "all";

  const fetchBookings = useCallback(() => {
    setLoading(true);
    const params = {
      page: isClientFiltering ? 0 : currentPage - 1,
      size: isClientFiltering ? SEARCH_ALL_PAGE_SIZE : currentPerPage,
    };
    if (selectedMonth) params.month = Number(selectedMonth);
    if (selectedYear) params.year = Number(selectedYear);

    axiosInstance
      .get("/api/unified-bookings/list", { params })
      .then((res) => {
        const body = res.data;
        if (body && body.success && body.bookings) {
          setBookings(Array.isArray(body.bookings.content) ? body.bookings.content : []);
          setTotalElements(body.bookings.totalElements || 0);
          setTotalPages(body.bookings.totalPages || 0);
        } else {
          setBookings([]);
          setTotalElements(0);
          setTotalPages(0);
          toast.error((body && body.message) || "Failed to load bookings");
        }
      })
      .catch((err) => {
        setBookings([]);
        setTotalElements(0);
        setTotalPages(0);
        toast.error(err?.response?.data?.message || "Error loading bookings");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClientFiltering, currentPage, currentPerPage, selectedMonth, selectedYear]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Filter bookings based on Booking Type, Check-in Date and search —
  // identical shape to HotelBookingList's filteredBookings memo.
  const filteredBookings = useMemo(() => {
    const query = search.trim().toLowerCase();
    const checkInPick = (checkInDateFilter || "").trim();

    return bookings.filter((booking) => {
      if (bookingTypeFilter !== "all" && booking.bookingType !== bookingTypeFilter) {
        return false;
      }
      if (checkInPick && toIsoDay(booking.checkInDate) !== checkInPick) {
        return false;
      }
      if (!query) return true;
      return [
        booking.bookingCode,
        booking.agentName,
        booking.primaryGuestName,
        booking.referenceNumber,
        booking.hotelName,
        booking.bookingType,
        formatDate(booking.bookingDate),
        formatDate(booking.checkInDate),
        formatDate(booking.checkOutDate),
        booking.checkInDate,
        booking.checkOutDate,
        formatDeadlineDate(booking.deadlineDate),
        booking.confirmationStatus,
      ]
        .map((val) => String(val ?? "").toLowerCase())
        .some((val) => val.includes(query));
    });
  }, [bookings, search, checkInDateFilter, bookingTypeFilter]);

  const filteredCount = filteredBookings.length;
  const displayedBookings = useMemo(() => {
    if (!isClientFiltering) return filteredBookings;
    const start = (currentPage - 1) * currentPerPage;
    return filteredBookings.slice(start, start + currentPerPage);
  }, [filteredBookings, isClientFiltering, currentPage, currentPerPage]);

  const totalEntries = isClientFiltering
    ? filteredCount
    : typeof totalElements === "number" && totalElements >= 0
      ? totalElements
      : bookings.length;
  const hasResults = displayedBookings.length > 0;
  const serialNumberBase = (currentPage - 1) * currentPerPage;
  const displayStart = hasResults ? serialNumberBase + 1 : 0;
  const displayEnd = hasResults ? Math.min(serialNumberBase + displayedBookings.length, totalEntries) : 0;
  const safeTotalPages = isClientFiltering
    ? Math.max(1, Math.ceil(filteredCount / currentPerPage))
    : totalPages > 0
      ? totalPages
      : Math.max(1, Math.ceil((totalEntries || 0) / currentPerPage));

  const handleView = (row) => {
    if (!row.detailRoute || !row.bookingId) {
      toast.error("This booking's detail page could not be resolved.");
      return;
    }
    navigate(`${row.detailRoute}${row.bookingId}`);
  };

  // +1 for the Payment Status column.
  // 14 columns visible to every role; admins additionally see Agent Name and
  // Supplier, so 16 total. Update in sync with the <thead> below.
  // Column count bumped by one — new "Booker" column sits after Hotel.
  const colSpan = role === "admin" ? 17 : 15;

  return (
    <div className="min-vh-100 bg-light d-flex flex-column hbl-modern">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-3" style={{ width: "100%", overflow: "hidden" }}>
          <Container fluid className="px-0">
            {/* Header: Title + Search (left) | Time Period (right) */}
            <div className="d-flex justify-content-between align-items-end mb-3 hbl-header">
              <div className="hbl-header-left">
                <h3 className="fw-bold text-dark mb-2">All Bookings</h3>
                <InputGroup className="hbl-search" style={{ height: "40px", width: "300px" }}>
                  <InputGroup.Text style={{ backgroundColor: "#f8f9fa", borderRight: "none", borderColor: "#dee2e6" }}>
                    <FaSearch style={{ color: "#6c757d" }} />
                  </InputGroup.Text>
                  <Form.Control
                    type="text"
                    placeholder="Search here..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      resetPage();
                    }}
                    style={{ borderLeft: "none", fontSize: "0.85rem", borderColor: "#dee2e6", height: "40px" }}
                  />
                </InputGroup>
              </div>
              <Card className="shadow-sm border-0 hbl-timecard" style={{ borderRadius: "8px", minWidth: "260px" }}>
                <Card.Body className="p-3">
                  <h6 className="mb-2 fw-bold text-dark" style={{ fontSize: "0.85rem", letterSpacing: "0.4px" }}>
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
                          <option key={month} value={index + 1}>{month.slice(0, 3)}</option>
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
                          <option key={year} value={year}>{year}</option>
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
                <Card className="shadow-sm border-0 w-100" style={{ borderRadius: "8px" }}>
                  <Card.Body className="p-3">
                    <Row className="g-2 align-items-end">
                      <Col xs={12} md={6} lg={4} xl={3}>
                        <h6 className="mb-2 fw-bold text-dark" style={{ fontSize: "0.85rem", letterSpacing: "0.4px" }}>
                          Booking Type
                        </h6>
                        <Form.Select
                          value={bookingTypeFilter}
                          onChange={(e) => {
                            setBookingTypeFilter(e.target.value);
                            resetPage();
                          }}
                          size="sm"
                          aria-label="Booking type filter"
                          style={{ fontSize: "0.85rem", height: "46px" }}
                        >
                          {BOOKING_TYPE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </Form.Select>
                      </Col>
                      <Col xs={12} md={6} lg={4} xl={3}>
                        <h6 className="mb-2 fw-bold text-dark" style={{ fontSize: "0.85rem", letterSpacing: "0.4px" }}>
                          Check-in Date
                        </h6>
                        <div className="d-flex gap-2">
                          <Form.Control
                            type="date"
                            value={checkInDateFilter}
                            onChange={(e) => {
                              setCheckInDateFilter(e.target.value);
                              resetPage();
                            }}
                            size="sm"
                            aria-label="Check-in date filter"
                            style={{ fontSize: "0.85rem", height: "46px" }}
                          />
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            onClick={() => {
                              setCheckInDateFilter("");
                              resetPage();
                            }}
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
            <Card className="shadow-sm border-0" style={{ borderRadius: "8px", overflow: "hidden", width: "100%" }}>
              <Card.Body className="p-0" style={{ width: "100%" }}>
                {loading ? (
                  <div className="text-center p-5">
                    <Spinner animation="border" variant="primary" />
                    <p className="mt-2 text-muted">Loading bookings...</p>
                  </div>
                ) : (
                  <div className="thin-scrollbar" style={{ overflowX: "hidden", width: "100%" }}>
                    <Table
                      hover
                      size="sm"
                      className="mb-0 align-middle table-bordered hbl-table"
                      style={{
                        // Fits the viewport without a horizontal scrollbar:
                        // fixed layout distributes width: 100% across
                        // every column according to the widths below,
                        // then whiteSpace:nowrap + ellipsis on th/td
                        // means labels stay on one line and any overflow
                        // truncates gracefully instead of wrapping.
                        tableLayout: "fixed",
                        width: "100%",
                        fontSize: "0.75rem",
                        borderCollapse: "separate",
                        borderSpacing: 0,
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
                          <th style={thStyle("center", COLUMN_WIDTHS.sn)}>SN</th>
                          {role === "admin" && (
                            <th style={thStyle(undefined, COLUMN_WIDTHS.agentName)}>Agent Name</th>
                          )}
                          {/* Supplier column — admin-only so agents never
                              see which supplier fulfilled the booking
                              (whitelabel invariant). */}
                          {role === "admin" && (
                            <th style={thStyle("center", COLUMN_WIDTHS.supplier)}>Supplier</th>
                          )}
                          {/* Column renamed from "Booker" → "Pax Name".
                              Data source unchanged (b.primaryGuestName) —
                              this column always showed the guest name, the
                              old header was misleading. A dedicated
                              "Booker" column (operator who created the
                              booking) now sits after Hotel below. */}
                          <th style={thStyle(undefined, COLUMN_WIDTHS.booker)}>Pax Name</th>
                          <th style={thStyle("center", COLUMN_WIDTHS.pax)}>Pax</th>
                          <th style={thStyle(undefined, COLUMN_WIDTHS.rsvnRef)}>Rsvn Ref</th>
                          {/* Confirmation No. — the supplier-side ref the
                              operator entered on the booking detail page.
                              Blank cell renders when unset. Shown to
                              everyone since agents enter it themselves. */}
                          {/* Full-text headers restored; multi-word
                              labels wrap onto two lines (thStyle uses
                              whiteSpace: normal) so nothing gets
                              truncated to "AGENT N..." and no
                              horizontal scroll is needed. */}
                          {/* Header shortened from "Confirmation No." →
                              "Hotel Conf". Data source unchanged
                              (b.confirmationNumber, supplier-side ref
                              entered on the detail page). */}
                          <th style={thStyle("center", COLUMN_WIDTHS.confirmationNumber)}>Hotel Conf</th>
                          <th style={thStyle("center", COLUMN_WIDTHS.bookDate)}>Book Date</th>
                          <th style={thStyle(undefined, COLUMN_WIDTHS.hotel)}>Hotel</th>
                          {/* Booker — the operator who created the
                              booking (agent-staff picked in the search
                              form, or created_by as fallback). Populated
                              by UnifiedBookingListServiceImpl in the
                              Hotel section; other booking-type rows show
                              "-" because they don't currently capture an
                              agent-staff attribution. Sits after Hotel
                              per spec, distinct from Agent Name (agency)
                              and Pax Name (guest). */}
                          <th style={thStyle(undefined, COLUMN_WIDTHS.bookedBy)}>Booker</th>
                          <th style={thStyle("center", COLUMN_WIDTHS.checkIn)}>Check In</th>
                          <th style={thStyle("center", COLUMN_WIDTHS.checkOut)}>Check Out</th>
                          <th style={thStyle("center", COLUMN_WIDTHS.deadlineDate)}>Deadline Date</th>
                          <th style={thStyle("center", COLUMN_WIDTHS.paymentMode)}>Payment Mode</th>
                          {/* Payment Status — same mapping as
                              /booking-details/hotel-booking-list. See
                              getPaymentStatusLabel. */}
                          <th style={thStyle("center", COLUMN_WIDTHS.paymentStatus)}>Payment Status</th>
                          {/* Status — renamed from "Notification". Cell
                              content unchanged, still rendered by
                              NotificationCell. */}
                          <th style={thStyle("center", COLUMN_WIDTHS.status)}>Status</th>
                          <th style={thStyle("center", COLUMN_WIDTHS.action)}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedBookings.length === 0 ? (
                          <tr>
                            <td
                              colSpan={colSpan}
                              className="text-center py-5 text-muted"
                              style={{ border: "1px solid #dee2e6", backgroundColor: "#ffffff" }}
                            >
                              <FaInbox style={{ fontSize: "2.5rem", marginBottom: "10px", color: "#adb5bd" }} />
                              <p className="mt-2 mb-0 fs-5">No bookings found.</p>
                            </td>
                          </tr>
                        ) : (
                          displayedBookings.map((b, i) => {
                            const baseCellStyle = {
                              padding: "0.35rem 0.3rem",
                              fontSize: "0.72rem",
                              border: "1px solid #dee2e6",
                              verticalAlign: "middle",
                              // Cell values wrap onto additional lines
                              // when they don't fit the column — so
                              // nothing truncates with "..." and every
                              // detail stays fully visible. overflowWrap
                              // "break-word" only splits words when a
                              // token is genuinely wider than the cell
                              // (long booking codes); short words like
                              // "Credit", "Limit", "Payment" break at
                              // spaces first, so nothing renders as
                              // "Credit Lim it".
                              whiteSpace: "normal",
                              overflow: "visible",
                              overflowWrap: "break-word",
                              lineHeight: 1.4,
                            };
                            return (
                              <tr
                                key={`${b.bookingType}-${b.bookingId}-${i}`}
                                style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#f8f9fa", transition: "background-color 0.2s ease" }}
                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#e7f3ff"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = i % 2 === 0 ? "#ffffff" : "#f8f9fa"; }}
                              >
                                <td className="text-muted fw-semibold" style={{ ...baseCellStyle, textAlign: "center", color: "#6c757d", width: COLUMN_WIDTHS.sn }}>
                                  {serialNumberBase + i + 1}
                                </td>
                                {role === "admin" && (
                                  <td style={{ ...baseCellStyle, width: COLUMN_WIDTHS.agentName }} title={b.agentName || ""}>
                                    <span className="fw-medium text-dark">{b.agentName || "-"}</span>
                                  </td>
                                )}
                                {role === "admin" && (
                                  <td style={{ ...baseCellStyle, textAlign: "center", width: COLUMN_WIDTHS.supplier }} title={b.supplierName || ""}>
                                    <span className="fw-medium text-dark">
                                      {b.supplierName || "-"}
                                    </span>
                                  </td>
                                )}
                                <td style={{ ...baseCellStyle, width: COLUMN_WIDTHS.booker }} title={b.primaryGuestName || ""}>
                                  <span className="d-inline-flex align-items-center" style={{ gap: "0.3rem" }}>
                                    <FaUser style={{ color: "#6c757d", fontSize: "0.78rem", flexShrink: 0 }} />
                                    <span className="fw-medium text-dark">{b.primaryGuestName || "-"}</span>
                                  </span>
                                </td>
                                <td style={{ ...baseCellStyle, textAlign: "center", width: COLUMN_WIDTHS.pax }}>
                                  {b.pax != null ? (
                                    <span className="fw-medium text-dark">{b.pax}</span>
                                  ) : (
                                    <span className="text-muted">-</span>
                                  )}
                                </td>
                                <td style={{ ...baseCellStyle, width: COLUMN_WIDTHS.rsvnRef }} title={b.bookingCode || ""}>
                                  <span className="fw-bold text-primary">{b.bookingCode || "-"}</span>
                                </td>
                                <td style={{ ...baseCellStyle, textAlign: "center", fontFamily: "monospace", width: COLUMN_WIDTHS.confirmationNumber }} title={b.confirmationNumber || ""}>
                                  {b.confirmationNumber ? (
                                    <span className="text-dark">{b.confirmationNumber}</span>
                                  ) : (
                                    <span className="text-muted">-</span>
                                  )}
                                </td>
                                <td className="text-muted" style={{ ...baseCellStyle, textAlign: "center", width: COLUMN_WIDTHS.bookDate }} title={formatDate(b.bookingDate) || ""}>
                                  {formatDate(b.bookingDate) || "-"}
                                </td>
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    width: COLUMN_WIDTHS.hotel,
                                    // Hotel column keeps normal wrapping so
                                    // the type badge can drop to a second
                                    // line under a long hotel name — the
                                    // rest of the row stays no-wrap.
                                    whiteSpace: "normal",
                                    overflow: "visible",
                                    textOverflow: "clip",
                                    wordBreak: "break-word",
                                  }}
                                >
                                  <div className="d-flex align-items-center" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
                                    <span className="fw-semibold text-dark" style={{ fontSize: "0.875rem" }}>
                                      {b.hotelName || "-"}
                                    </span>
                                    <span
                                      className={`badge ${TYPE_BADGE_CLASS[b.bookingType] || "bg-secondary-subtle text-secondary border border-secondary-subtle"}`}
                                      style={{ fontSize: "0.65rem", padding: "2px 6px" }}
                                      title="Booking type"
                                    >
                                      {b.bookingType || "-"}
                                    </span>
                                  </div>
                                </td>
                                {/* Booker cell — mirrors the new "Booker"
                                    header above. b.bookerName is null on
                                    non-Hotel rows and legacy hotel rows
                                    without agent_staff_name / created_by,
                                    so we render "-" for those. */}
                                <td style={{ ...baseCellStyle, width: COLUMN_WIDTHS.bookedBy }} title={b.bookerName || ""}>
                                  {b.bookerName ? (
                                    <span className="fw-medium text-dark">{b.bookerName}</span>
                                  ) : (
                                    <span className="text-muted">-</span>
                                  )}
                                </td>
                                <td className="text-muted" style={{ ...baseCellStyle, textAlign: "center", width: COLUMN_WIDTHS.checkIn }} title={formatDate(b.checkInDate) || ""}>
                                  {formatDate(b.checkInDate) || "-"}
                                </td>
                                <td className="text-muted" style={{ ...baseCellStyle, textAlign: "center", width: COLUMN_WIDTHS.checkOut }} title={formatDate(b.checkOutDate) || ""}>
                                  {formatDate(b.checkOutDate) || "-"}
                                </td>
                                <td className="text-muted" style={{ ...baseCellStyle, textAlign: "center", fontFamily: "monospace", width: COLUMN_WIDTHS.deadlineDate }} title={b.deadlineDate || ""}>
                                  {formatDeadlineDate(b.deadlineDate)}
                                </td>
                                <td style={{ ...baseCellStyle, textAlign: "center", width: COLUMN_WIDTHS.paymentMode }} title={getPaymentModeLabel(b)}>
                                  {(() => {
                                    const label = getPaymentModeLabel(b);
                                    if (label === "-") return <span className="text-muted">-</span>;
                                    return <span style={{ color: "#000" }}>{label}</span>;
                                  })()}
                                </td>
                                {/* Payment Status — derived from the same status
                                    NotificationCell renders: Confirmed / On
                                    Request → Payment Pending, ReConfirmed →
                                    Paid, a cancellation → Paid or Un-Paid
                                    depending on whether it had been
                                    reconfirmed. See getPaymentStatusLabel. */}
                                <td style={{ ...baseCellStyle, textAlign: "center", width: COLUMN_WIDTHS.paymentStatus }} title={getPaymentStatusLabel(b)}>
                                  {(() => {
                                    const label = getPaymentStatusLabel(b);
                                    if (label === "-") return <span className="text-muted">-</span>;
                                    // Same palette as the hotel list — green
                                    // settled, red never collected, orange still
                                    // outstanding.
                                    const color =
                                      label === "Paid"
                                        ? "#06a301"
                                        : label === "Un-Paid"
                                          ? "#dc3545"
                                          : "#e67e22";
                                    return (
                                      <span style={{ color, fontSize: "0.82rem", fontWeight: "600" }}>
                                        {label}
                                      </span>
                                    );
                                  })()}
                                </td>
                                <td style={{ ...baseCellStyle, textAlign: "center", width: COLUMN_WIDTHS.status }}>
                                  <NotificationCell booking={b} />
                                </td>
                                <td style={{ ...baseCellStyle, textAlign: "center", width: COLUMN_WIDTHS.action }}>
                                  <div className="d-flex justify-content-center align-items-center">
                                    <FaEye
                                      role="button"
                                      tabIndex={0}
                                      title="View full booking details"
                                      style={{ fontSize: "18px", color: "#007bff", cursor: "pointer" }}
                                      onClick={() => handleView(b)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault();
                                          handleView(b);
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
            {!loading && displayedBookings.length > 0 && (
              <Card className="shadow-sm border-0 mt-3" style={{ borderRadius: "8px" }}>
                <Card.Body className="py-3">
                  <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 hbl-pagination-bar">
                    <div className="text-muted" style={{ fontSize: "0.875rem" }}>
                      Showing {""}
                      <span className="fw-semibold text-dark">{displayStart}</span>{" "}
                      to {""}
                      <span className="fw-semibold text-dark">{displayEnd}</span>{" "}
                      of {""}
                      <span className="fw-semibold text-dark">{totalEntries}</span>{" "}
                      entries
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <span className="text-muted" style={{ fontSize: "0.8rem" }}>Rows per page</span>
                      <Form.Select
                        size="sm"
                        value={currentPerPage}
                        onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                        style={{ width: "auto", fontSize: "0.8rem" }}
                      >
                        {PER_PAGE_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </Form.Select>
                    </div>
                    <Pagination className="mb-0">
                      <Pagination.Prev
                        disabled={currentPage === 1}
                        onClick={() => currentPage > 1 && handlePageChange(currentPage - 1)}
                        style={{ cursor: currentPage === 1 ? "not-allowed" : "pointer", opacity: currentPage === 1 ? 0.5 : 1 }}
                      />
                      {(() => {
                        const windowSize = 5;
                        const startPage = Math.max(1, Math.min(currentPage - Math.floor(windowSize / 2), safeTotalPages - windowSize + 1));
                        const endPage = Math.min(safeTotalPages, startPage + windowSize - 1);
                        return Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i).map((pageNumber) => (
                          <Pagination.Item
                            key={pageNumber}
                            active={currentPage === pageNumber}
                            onClick={() => handlePageChange(pageNumber)}
                            style={{ cursor: "pointer", minWidth: "38px", textAlign: "center" }}
                          >
                            {pageNumber}
                          </Pagination.Item>
                        ));
                      })()}
                      <Pagination.Next
                        disabled={currentPage === safeTotalPages}
                        onClick={() => currentPage < safeTotalPages && handlePageChange(currentPage + 1)}
                        style={{ cursor: currentPage === safeTotalPages ? "not-allowed" : "pointer", opacity: currentPage === safeTotalPages ? 0.5 : 1 }}
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

function thStyle(textAlign, width) {
  return {
    padding: "0.35rem 0.25rem",
    fontWeight: "600",
    textTransform: "uppercase",
    color: "#495057",
    ...(textAlign ? { textAlign } : {}),
    border: "1px solid #dee2e6",
    // Headers wrap onto up to two lines when they don't fit their
    // column — so "Confirmation No." reads as
    //     CONFIRMATION
    //     NO.
    // instead of being truncated to "CONFIRMAT...". Data cells still
    // wrap when needed via baseCellStyle below.
    whiteSpace: "normal",
    wordBreak: "keep-all",
    lineHeight: 1.15,
    width,
  };
}

// Notification cell — identical logic to HotelBookingList.jsx's inline
// status renderer: collapses a "Confirmed / ReConfirmed" history label
// to just the latest state, shows On-Request rooms as orange "On
// Request" even though the engine stamps them Confirmed, colors
// Confirmed/ReConfirmed green, Not Confirmed red with a hint icon, and
// any other/combined status (e.g. Cancelled) via per-segment coloring.
function NotificationCell({ booking: b }) {
  const rawStatus = String(b.confirmationStatus || "");
  const rawSegments = rawStatus.split("/").map((seg) => seg.trim());
  const isConfirmHistoryCompound =
    rawSegments.length > 1 &&
    rawSegments.every((seg) => ["confirmed", "reconfirmed"].includes(seg.replace(/\s+/g, "").toLowerCase()));
  const effectiveStatus = isConfirmHistoryCompound ? rawSegments[rawSegments.length - 1] : rawStatus;
  const normalizedStatus = effectiveStatus.replace(/\s+/g, "").toLowerCase();
  const isConfirmed = normalizedStatus === "confirmed";
  const isReconfirmed = normalizedStatus === "reconfirmed";
  const isNotConfirmed = normalizedStatus === "notconfirmed";
  const showConfirmIcon = isNotConfirmed;

  const isOnRequestRoom = /^on\s*request$/i.test(String(b.roomStatus || "").trim());
  const isOnRequestStillPending = isOnRequestRoom && !b.onRequestConfirmed;
  if (isOnRequestStillPending && isConfirmed) {
    return (
      <span style={{ color: "#e67e22", padding: "0.32rem 0.6rem", fontSize: "0.82rem", fontWeight: "600", borderRadius: "0.375rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
        On Request
      </span>
    );
  }
  if (isConfirmed) {
    return (
      <span style={{ color: "#06a301", padding: "0.32rem 0.6rem", fontSize: "0.82rem", fontWeight: "600", borderRadius: "0.375rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
        Confirmed
      </span>
    );
  }
  if (isReconfirmed) {
    return (
      <span style={{ color: "#06a301", padding: "0.32rem 0.6rem", fontSize: "0.82rem", fontWeight: "600", borderRadius: "0.375rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
        ReConfirmed
      </span>
    );
  }

  const label = isNotConfirmed ? "Not Confirmed" : effectiveStatus || "-";
  return (
    <div
      className="d-inline-flex align-items-center justify-content-center gap-2"
      style={{
        padding: "0.32rem 0.6rem",
        borderRadius: "0.375rem",
        backgroundColor: "transparent",
        color: isNotConfirmed ? "#dc3545" : "#6c757d",
        fontSize: "0.72rem",
        fontWeight: "600",
      }}
    >
      {!isNotConfirmed ? (
        renderColoredStatus(label)
      ) : (
        <>
          <span>{label}</span>
          {showConfirmIcon && (
            <FaExclamationCircle
              style={{ fontSize: "15px", color: "#ff9800", transition: "all 0.2s ease" }}
              title="Non-refundable booking."
              onMouseEnter={(e) => { e.currentTarget.style.color = "#f57c00"; e.currentTarget.style.transform = "scale(1.15)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "#ff9800"; e.currentTarget.style.transform = "scale(1)"; }}
            />
          )}
        </>
      )}
    </div>
  );
}

export default AllBookingsList;
