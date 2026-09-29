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
  Modal,
} from "react-bootstrap";
import {
  FaSearch,
  FaEye,
  FaTrash,
  FaInbox,
  FaEnvelope,
  FaPaperPlane,
  FaExclamationCircle,
  FaDownload,
  FaUser,
  FaUsers,
  FaArrowLeft,
} from "react-icons/fa";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import toast from "react-hot-toast";
import "../../styles/HotelBookingListModern.css";
import DashboardRedirections from "../../components/DashboardRedirections";

const PER_PAGE_OPTIONS = [10, 25, 50, 100];
// When the user has an active client-side filter (search or Check-in Date),
// each booking-status endpoint is hit with this size so the response contains
// every matching record, not just the current server page. The client filter
// then runs across the full set and the result is paginated locally.
const SEARCH_ALL_PAGE_SIZE = 10000;
// Column widths — soft hints for the auto-layout table. Cells will
// flex if content requires more space; horizontal scroll only kicks
// in at very narrow viewports because the wrapper has overflowX:auto.
const COLUMN_WIDTHS = {
  sn: "40px",
  agentName: "90px",
  customerName: "120px",
  bookingCode: "95px",
  // Supplier-side confirmation number added on the booking detail view via
  // the "CONFIRMATION NO." button. Sits next to Booking Code so the two
  // identifiers (internal + supplier) read together. Cell renders blank
  // for rows that don't have one yet. Width tuned so the two-word header
  // ("CONFIRMATION" / "NO") wraps at its space instead of splitting the
  // word "CONFIRMATION" mid-letter — this needs enough room for the
  // longest word alone. The cell itself is `whiteSpace: nowrap` on rare
  // longer values so the number never splits either.
  confirmationNo: "130px",
  referenceCode: "160px",
  bookDate: "90px",
  bookingDetails: "210px",
  deadlineDate: "105px",
  paymentMode: "110px",
  paymentStatus: "115px",
  // Widened so the "ReConfirmed" / "Confirmed" / "On Request" pill labels
  // (and the "NOTIFICATION" header word) never wrap mid-word.
  notification: "120px",
  action: "110px",
};

// Resolve a human-readable Payment Mode label from whatever shape the
// backend sends. Most rows will have `paymentMode` directly; older
// rows may only have a boolean (`creditLimitPayment` / `paidOnline`)
// or a snake_case alias.
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
    // CREDITLIMIT — the exact string HotelBookingPage sends when the
    // agent's credit check passes (see confirmBooking).
    norm === "CREDITLIMIT"
  ) {
    return "Credit Limit Payment";
  }
  if (norm === "ONLINE" || norm === "ONLINE_PAYMENT" || norm === "ONLINE PAYMENT") {
    return "Online Payment";
  }
  if (norm) return raw; // unrecognised, show as-is

  // Fallbacks for older row shapes.
  if (booking?.creditLimitPayment === true) return "Credit Limit Payment";
  if (booking?.paidOnline === true || booking?.onlinePayment === true) {
    return "Online Payment";
  }
  return "-";
};

// Resolve the Payment Status label from the booking's DISPLAYED status
// (the Status / Notification column):
//   Confirmed                      → Payment Pending
//   On Request                     → Payment Pending
//   ReConfirmed                    → Paid
//   ReConfirmed/Cancelled          → Paid
//   Confirmed/Cancelled            → Un-Paid
//   On Request/Confirmed/Cancelled → Un-Paid
// Anything else — Not Confirmed, or an unknown/empty status — has no
// defined mapping and renders "-".
//
// On Request rooms are stamped confirmationStatus=CONFIRMED by the status
// engine (see the Notification cell around line 2047) so they can follow
// the reconfirm flow, but no money has been collected on them yet — so
// they carry the same "Payment Pending" meaning as a genuinely Confirmed
// row. The Notification cell handles the visual distinction on its own.
//
// A cancelled booking reports whether the money had already been
// collected at the point of cancellation rather than the cancellation
// itself: a history that reached ReConfirmed was paid, one that stopped
// at On Request / Confirmed never was.
//
// The resolution below deliberately mirrors the Notification cell so the
// two columns can never disagree: a confirm-history compound
// ("Confirmed / ReConfirmed") collapses to its LATEST segment, and an
// unconfirmed On Request room displays as "On Request" even though the
// status engine stamped it CONFIRMED.
const getPaymentStatusLabel = (booking) => {
  const rawStatus = String(booking?.confirmationStatus || "");
  const segments = rawStatus
    .split("/")
    .map((seg) => seg.trim())
    .filter(Boolean);
  if (segments.length === 0) return "-";

  const normalizedSegments = segments.map((seg) =>
    seg.replace(/\s+/g, "").toLowerCase(),
  );

  // Cancelled histories are settled by what the booking reached BEFORE the
  // cancellation, so check this ahead of the confirm-history collapse.
  //
  // The engine stamps confirmationStatus to "Cancelled" on cancellation
  // (see BookingCancellationServiceImpl) — the prior state is preserved
  // separately on booking.cancelledFromStatus ("Confirmed" / "ReConfirmed"),
  // which the detail view uses to render "ReConfirmed/Cancelled". Consult
  // it here too so the list's Payment Status matches: a booking that was
  // ReConfirmed before cancellation had its money collected → "Paid".
  const latestSegment = normalizedSegments[normalizedSegments.length - 1];
  if (latestSegment === "cancelled" || latestSegment === "canceled") {
    const cancelledFromNormalized = String(booking?.cancelledFromStatus || "")
      .replace(/\s+/g, "")
      .toLowerCase();
    const wasReconfirmedBeforeCancel =
      normalizedSegments.includes("reconfirmed") ||
      cancelledFromNormalized.includes("reconfirmed");
    return wasReconfirmedBeforeCancel ? "Paid" : "Un-Paid";
  }

  const isConfirmHistoryCompound =
    segments.length > 1 &&
    normalizedSegments.every((seg) =>
      ["confirmed", "reconfirmed"].includes(seg),
    );
  const effectiveStatus = isConfirmHistoryCompound
    ? segments[segments.length - 1]
    : rawStatus;
  const normalizedStatus = effectiveStatus.replace(/\s+/g, "").toLowerCase();

  if (normalizedStatus === "confirmed") {
    // Covers both display states:
    //   • genuinely Confirmed (Notification cell → "Confirmed")
    //   • On Request still awaiting reconfirm (Notification cell →
    //     "On Request"; underlying confirmationStatus is still CONFIRMED
    //     per the display-only override around line 2047)
    // Neither has collected money yet, so both map to "Payment Pending"
    // in this column.
    return "Payment Pending";
  }
  if (normalizedStatus === "reconfirmed") return "Paid";

  return "-";
};

// Every customer/guest name on a booking. The backend now sends a
// `guestNames` array (collected across all room bookings); fall back to
// the single `primaryGuestName` for older payload shapes so the column
// still renders something.
const getGuestNames = (booking) => {
  if (Array.isArray(booking?.guestNames) && booking.guestNames.length > 0) {
    return booking.guestNames.filter((n) => String(n ?? "").trim());
  }
  return booking?.primaryGuestName ? [booking.primaryGuestName] : [];
};

const normalizeBoolean = (value, truthyMatchers = [], falsyMatchers = []) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (truthyMatchers.includes(normalized)) return true;
    if (falsyMatchers.includes(normalized)) return false;
  }
  return false;
};

const isCancellationAllowed = (booking) => {
  const refundStatus = booking?.refundStatus?.toLowerCase();
  const isNonRefundable = refundStatus === "non-refundable";

  console.log("isNonRefundable::", isNonRefundable);
  //  Returns false when it's “Non-Refundable”.
  // Returns true for “Flexi” or any other refundable type.
  return !isNonRefundable;
};

// ── Props ────────────────────────────────────────────────────────────
// `force24HourOnly` is the opt-in for the dedicated 24-Hour Booking
// List menu (/booking-details/24hr-booking-list). When true the page
// post-filters every fetched booking list to rows where
// `is24HourCheckin === true`, and tweaks the heading. The regular
// /booking-details/hotel-booking-list route renders this component
// with no prop and therefore stays unchanged.
//
// `religiousOnly` is the same shape opt-in for the Religious Booking
// List (/booking-details/religious-booking-list). When true the page
// keeps only rows where `isReligiousBooking === true` and updates the
// heading; when false the regular list also EXCLUDES religious rows so
// they don't appear in two places (mirrors how force24HourOnly toggles
// the 24-hour rows in/out of the standard list).
const HotelBookingList = ({
  force24HourOnly = false,
  religiousOnly = false,
} = {}) => {
  const navigate = useNavigate();
  const [role, setRole] = useState(() => {
    return localStorage.getItem("currentActiveRole")?.toLowerCase() || null;
  });
  const [userId, setUserId] = useState(() => {
    const stored = localStorage.getItem("userId");
    return stored && stored !== "null" ? stored : null;
  });

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [checkInDateFilter, setCheckInDateFilter] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [pagination, setPagination] = useState({
    all: { page: 1, perPage: 10 },
    upcoming: { page: 1, perPage: 10 },
    completed: { page: 1, perPage: 10 },
    cancelled: { page: 1, perPage: 10 },
    onrequest: { page: 1, perPage: 10 },
    confirmed: { page: 1, perPage: 10 },
    reconfirmed: { page: 1, perPage: 10 },
    invoiced: { page: 1, perPage: 10 },
  });
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [apiData, setApiData] = useState({
    upcomingBookings: { content: [] },
    completedBookings: { content: [] },
    cancelledBookings: { content: [] },
  });
  const [onRequestData, setOnRequestData] = useState({
    content: [],
    totalElements: 0,
    totalPages: 0,
  });
  const [reconfirmedData, setReconfirmedData] = useState({
    content: [],
    totalElements: 0,
    totalPages: 0,
  });
  const [confirmedData, setConfirmedData] = useState({
    content: [],
    totalElements: 0,
    totalPages: 0,
  });
  const [invoicedData, setInvoicedData] = useState({
    content: [],
    totalElements: 0,
    totalPages: 0,
  });
  const [allData, setAllData] = useState({
    content: [],
    totalElements: 0,
    totalPages: 0,
  });
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [bookingDetails, setBookingDetails] = useState(null);
  const [loadingBookingId, setLoadingBookingId] = useState(null);
  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [selectedVoucherType, setSelectedVoucherType] = useState("Request");
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [bookingToConfirm, setBookingToConfirm] = useState(null);
  const [confirmingBooking, setConfirmingBooking] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [bookingToCancel, setBookingToCancel] = useState(null);
  const [cancellingBooking, setCancellingBooking] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [voucherDetails, setVoucherDetails] = useState(null);
  const [loadingVoucherDetails, setLoadingVoucherDetails] = useState(false);
  // Agent LPO captured inside the "Confirm Booking Status" modal.
  // Required before the OK click can fire — saved on the booking's
  // hotel_customer row (the column already exists there).
  const [confirmAgentLpo, setConfirmAgentLpo] = useState("");
  const [confirmAgentLpoError, setConfirmAgentLpoError] = useState("");
  const [updatingConfirmationStatus, setUpdatingConfirmationStatus] =
    useState(null);
  const [showConfirmStatusModal, setShowConfirmStatusModal] = useState(false);
  const [bookingToUpdateStatus, setBookingToUpdateStatus] = useState(null);
  // "Customers (N)" modal — opened from the "+N more" badge on the
  // Customer Name column to show every guest on a booking.
  const [showCustomersModal, setShowCustomersModal] = useState(false);
  const [customersModalBooking, setCustomersModalBooking] = useState(null);
  const hasTimeFilter = Boolean(selectedMonth) && Boolean(selectedYear);
  // True when any text/date-based client filter is in effect. In that mode
  // we fetch the entire dataset for the active Booking Type and let the
  // client-side filter run across everything, so a search isn't limited to
  // the rows currently on screen.
  const isClientFiltering = Boolean(
    (search || "").trim() || (checkInDateFilter || "").trim(),
  );
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

  // Generate months
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  // Generate years (2020 to current year + 1)
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 2014 }, (_, i) => 2020 + i);

  // Handle role sync if it's missing from localStorage initially
  useEffect(() => {
    const storedRole = localStorage.getItem("currentActiveRole")?.toLowerCase();
    if (storedRole && storedRole !== role) {
      setRole(storedRole);
    } else if (!storedRole) {
      // Fallback to userRole if currentActiveRole is missing
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
      // Don't fetch if we already have a valid userId
      if (userId && userId !== "null") return;

      const userName =
        localStorage.getItem("UserName") || sessionStorage.getItem("UserName");
      if (!userName) {
        console.warn("No UserName found in storage, cannot fetch profile ID");
        return;
      }

      try {
        console.log(`Fetching profile for user: ${userName} to get ID`);
        const response = await axiosInstance.get(
          `/api/personalProfile/${userName}`,
        );
        if (response.data && response.data.id) {
          const id = String(response.data.id);
          console.log(`Successfully retrieved ID: ${id} for user: ${userName}`);
          setUserId(id);
          localStorage.setItem("userId", id);
        } else {
          console.warn(
            "Profile fetch successful but no ID found in response",
            response.data,
          );
        }
      } catch (error) {
        console.error("Error fetching user profile for ID:", error);
      }
    };

    if (role === "agent" || role === "staff") {
      fetchUserId();
    }
  }, [role, userId]);

  // Fetch data from API
  const fetchBookings = useCallback(async () => {
    // SECURITY BLOCK:
    // 1. If role is missing, we don't know what to fetch.
    if (!role) {
      console.log("Blocking fetchBookings: role is missing.");
      return;
    }

    // 2. If we are an agent or staff but don't have the ID yet, do NOT call.
    if (
      (role === "agent" || role === "staff") &&
      (!userId || userId === "null")
    ) {
      console.log(
        "Blocking fetchBookings: role is " + role + " but userId is missing.",
      );
      return;
    }

    try {
      setLoading(true);

      // When a client-side filter is active, ask for every row in each
      // bucket so the search runs across the full dataset instead of one
      // page; otherwise honour the user's pagination state.
      const params = isClientFiltering
        ? {
            upcomingPage: 0,
            upcomingSize: SEARCH_ALL_PAGE_SIZE,
            completedPage: 0,
            completedSize: SEARCH_ALL_PAGE_SIZE,
            cancelledPage: 0,
            cancelledSize: SEARCH_ALL_PAGE_SIZE,
          }
        : {
            upcomingPage: pagination.upcoming.page - 1,
            upcomingSize: pagination.upcoming.perPage,
            completedPage: pagination.completed.page - 1,
            completedSize: pagination.completed.perPage,
            cancelledPage: pagination.cancelled.page - 1,
            cancelledSize: pagination.cancelled.perPage,
          };

      if (selectedMonth) params.month = selectedMonth;
      if (selectedYear) params.year = selectedYear;
      // 24-hour list page: filter at the source so pagination + totals
      // reflect 24-hour bookings only (backend ignores the param when omitted).
      if (force24HourOnly) params.is24HourCheckin = true;

      // Role-based filtering
      if (role === "agent" && userId) {
        params.agentId = userId;
      } else if (role === "staff" && userId) {
        params.staffId = userId;
      }

      console.log("API Request -> /api/bookings/list with params:", params);

      const response = await axiosInstance.get("/api/bookings/list", {
        params,
      });

      setApiData({
        upcomingBookings: response.data?.upcomingBookings || {
          content: [],
          totalElements: 0,
          totalPages: 0,
        },
        completedBookings: response.data?.completedBookings || {
          content: [],
          totalElements: 0,
          totalPages: 0,
        },
        cancelledBookings: response.data?.cancelledBookings || {
          content: [],
          totalElements: 0,
          totalPages: 0,
        },
      });
    } catch (err) {
      console.error("Error fetching bookings:", err);
      toast.error("Failed to load bookings");
    } finally {
      setLoading(false);
    }
  }, [pagination, isClientFiltering, selectedMonth, selectedYear, role, userId, force24HourOnly]);

  // Fetch On Request bookings from dedicated endpoint
  const fetchOnRequestBookings = useCallback(async () => {
    if (!role) return;
    if (
      (role === "agent" || role === "staff") &&
      (!userId || userId === "null")
    )
      return;
    try {
      setLoading(true);
      const params = isClientFiltering
        ? { page: 0, size: SEARCH_ALL_PAGE_SIZE }
        : {
            page: pagination.onrequest.page - 1,
            size: pagination.onrequest.perPage,
          };
      if (selectedMonth) params.month = selectedMonth;
      if (selectedYear) params.year = selectedYear;
      if (role === "agent" && userId) params.agentId = userId;
      else if (role === "staff" && userId) params.staffId = userId;
      // 24-hour list page: server-side filter so pagination/totals are correct.
      if (force24HourOnly) params.is24HourCheckin = true;
      const response = await axiosInstance.get(
        "/api/bookings/list/on-request",
        { params },
      );
      if (response.data?.success) {
        setOnRequestData(
          response.data.bookings || {
            content: [],
            totalElements: 0,
            totalPages: 0,
          },
        );
      }
    } catch (err) {
      console.error("Error fetching on-request bookings:", err);
      toast.error("Failed to load on-request bookings");
    } finally {
      setLoading(false);
    }
  }, [pagination.onrequest, isClientFiltering, selectedMonth, selectedYear, role, userId, force24HourOnly]);

  // Fetch Reconfirmed bookings from dedicated endpoint
  const fetchReconfirmedBookings = useCallback(async () => {
    if (!role) return;
    if (
      (role === "agent" || role === "staff") &&
      (!userId || userId === "null")
    )
      return;
    try {
      setLoading(true);
      const params = isClientFiltering
        ? { page: 0, size: SEARCH_ALL_PAGE_SIZE }
        : {
            page: pagination.reconfirmed.page - 1,
            size: pagination.reconfirmed.perPage,
          };
      if (selectedMonth) params.month = selectedMonth;
      if (selectedYear) params.year = selectedYear;
      if (role === "agent" && userId) params.agentId = userId;
      else if (role === "staff" && userId) params.staffId = userId;
      // 24-hour list page: server-side filter so pagination/totals are correct.
      if (force24HourOnly) params.is24HourCheckin = true;
      const response = await axiosInstance.get(
        "/api/bookings/list/reconfirmed",
        { params },
      );
      if (response.data?.success) {
        setReconfirmedData(
          response.data.bookings || {
            content: [],
            totalElements: 0,
            totalPages: 0,
          },
        );
      }
    } catch (err) {
      console.error("Error fetching reconfirmed bookings:", err);
      toast.error("Failed to load reconfirmed bookings");
    } finally {
      setLoading(false);
    }
  }, [pagination.reconfirmed, isClientFiltering, selectedMonth, selectedYear, role, userId, force24HourOnly]);

  // Fetch Confirmed bookings (intermediate "Confirmed" status, not yet
  // Reconfirmed). Mirrors the on-request / reconfirmed pattern so the new
  // dropdown option behaves identically to its siblings.
  const fetchConfirmedBookings = useCallback(async () => {
    if (!role) return;
    if (
      (role === "agent" || role === "staff") &&
      (!userId || userId === "null")
    )
      return;
    try {
      setLoading(true);
      const params = isClientFiltering
        ? { page: 0, size: SEARCH_ALL_PAGE_SIZE }
        : {
            page: pagination.confirmed.page - 1,
            size: pagination.confirmed.perPage,
          };
      if (selectedMonth) params.month = selectedMonth;
      if (selectedYear) params.year = selectedYear;
      if (role === "agent" && userId) params.agentId = userId;
      else if (role === "staff" && userId) params.staffId = userId;
      if (force24HourOnly) params.is24HourCheckin = true;
      const response = await axiosInstance.get(
        "/api/bookings/list/confirmed",
        { params },
      );
      if (response.data?.success) {
        setConfirmedData(
          response.data.bookings || {
            content: [],
            totalElements: 0,
            totalPages: 0,
          },
        );
      }
    } catch (err) {
      console.error("Error fetching confirmed bookings:", err);
      toast.error("Failed to load confirmed bookings");
    } finally {
      setLoading(false);
    }
  }, [pagination.confirmed, isClientFiltering, selectedMonth, selectedYear, role, userId, force24HourOnly]);

  // Fetch Invoiced bookings from dedicated endpoint
  const fetchInvoicedBookings = useCallback(async () => {
    if (!role) return;
    if (
      (role === "agent" || role === "staff") &&
      (!userId || userId === "null")
    )
      return;
    try {
      setLoading(true);
      const params = isClientFiltering
        ? { page: 0, size: SEARCH_ALL_PAGE_SIZE }
        : {
            page: pagination.invoiced.page - 1,
            size: pagination.invoiced.perPage,
          };
      if (selectedMonth) params.month = selectedMonth;
      if (selectedYear) params.year = selectedYear;
      if (role === "agent" && userId) params.agentId = userId;
      else if (role === "staff" && userId) params.staffId = userId;
      // 24-hour list page: server-side filter so pagination/totals are correct.
      if (force24HourOnly) params.is24HourCheckin = true;
      const response = await axiosInstance.get("/api/bookings/list/invoiced", {
        params,
      });
      if (response.data?.success) {
        setInvoicedData(
          response.data.bookings || {
            content: [],
            totalElements: 0,
            totalPages: 0,
          },
        );
      }
    } catch (err) {
      console.error("Error fetching invoiced bookings:", err);
      toast.error("Failed to load invoiced bookings");
    } finally {
      setLoading(false);
    }
  }, [pagination.invoiced, isClientFiltering, selectedMonth, selectedYear, role, userId, force24HourOnly]);

  // Fetch ALL bookings (every status) from dedicated endpoint
  const fetchAllBookings = useCallback(async () => {
    if (!role) return;
    if (
      (role === "agent" || role === "staff") &&
      (!userId || userId === "null")
    )
      return;
    try {
      setLoading(true);
      const params = isClientFiltering
        ? { page: 0, size: SEARCH_ALL_PAGE_SIZE }
        : {
            page: pagination.all.page - 1,
            size: pagination.all.perPage,
          };
      if (selectedMonth) params.month = selectedMonth;
      if (selectedYear) params.year = selectedYear;
      if (role === "agent" && userId) params.agentId = userId;
      else if (role === "staff" && userId) params.staffId = userId;
      // 24-hour list page: server-side filter so pagination/totals are correct.
      if (force24HourOnly) params.is24HourCheckin = true;
      const response = await axiosInstance.get("/api/bookings/list/all", {
        params,
      });
      if (response.data?.success) {
        setAllData(
          response.data.bookings || {
            content: [],
            totalElements: 0,
            totalPages: 0,
          },
        );
      }
    } catch (err) {
      console.error("Error fetching all bookings:", err);
      toast.error("Failed to load bookings");
    } finally {
      setLoading(false);
    }
  }, [pagination.all, isClientFiltering, selectedMonth, selectedYear, role, userId, force24HourOnly]);

  // Fetch booking details
  const fetchBookingDetails = async (bookingId) => {
    try {
      setLoadingBookingId(bookingId);
      const response = await axiosInstance.get(
        `/api/hotel-booking/details/${bookingId}`,
      );
      console.log("Booking Details Response:", response.data);

      if (response.data && response.data.success) {
        setBookingDetails(response.data);
        setShowDetailsModal(true);
      }
    } catch (error) {
      console.error("Error fetching booking details:", error);
      alert("Failed to fetch booking details. Please try again.");
    } finally {
      setLoadingBookingId(null);
    }
  };

  // Handle confirm booking click
  const handleConfirmBookingClick = (booking) => {
    setBookingToConfirm(booking);
    setShowConfirmModal(true);
  };

  // Open the "Customers (N)" modal for a booking row.
  const handleShowCustomers = (booking) => {
    setCustomersModalBooking(booking);
    setShowCustomersModal(true);
  };

  // Handle confirm status click - open modal
  const handleConfirmStatusClick = (booking) => {
    setBookingToUpdateStatus(booking);
    // Start each open with a clean LPO field — even if the user
    // typed something for a previous booking, we don't reuse it.
    setConfirmAgentLpo("");
    setConfirmAgentLpoError("");
    setShowConfirmStatusModal(true);
  };

  // Update confirmation status
  const updateConfirmationStatus = async () => {
    if (!bookingToUpdateStatus) return;

    // Agent LPO is required — show inline error, keep the modal open.
    const lpoTrimmed = (confirmAgentLpo || "").trim();
    if (!lpoTrimmed) {
      setConfirmAgentLpoError("Agent LPO is required");
      return;
    }
    setConfirmAgentLpoError("");

    try {
      setUpdatingConfirmationStatus(bookingToUpdateStatus.bookingId);
      const response = await axiosInstance.patch(
        `/api/booking-confirmation/${bookingToUpdateStatus.bookingId}/confirmation-status`,
        {
          confirmStatus: true,
          // Forwarded to the backend so it can be persisted on the
          // booking's hotel_customer row (column `agent_lpo` already
          // exists). Backend should pick this up and update the
          // associated HotelCustomer entity in the same transaction.
          agentLpo: lpoTrimmed,
        },
      );

      console.log("Confirmation Status Response:", response.data);
      if (response.data && response.data.success) {
        // Refresh bookings list to show updated status
        await fetchBookings();
        setShowConfirmStatusModal(false);
        setBookingToUpdateStatus(null);
        setConfirmAgentLpo("");
        setConfirmAgentLpoError("");
        toast.success(
          response.data.message || "Confirmation status updated successfully!",
        );
      } else {
        toast.error(
          response.data?.message || "Failed to update confirmation status.",
        );
      }
    } catch (error) {
      console.error("Error updating confirmation status:", error);
      toast.error(
        error.response?.data?.message ||
          "Failed to update confirmation status. Please try again.",
      );
    } finally {
      setUpdatingConfirmationStatus(null);
    }
  };

  // Confirm booking API call
  const confirmBooking = async () => {
    if (!bookingToConfirm) return;

    try {
      setConfirmingBooking(true);
      const response = await axiosInstance.put(
        `/api/hotel-booking/confirm/${bookingToConfirm.bookingId}`,
      );

      if (response.data && response.data.success) {
        // Refresh bookings list
        await fetchBookings();
        setShowConfirmModal(false);
        setBookingToConfirm(null);
        alert("Booking confirmed successfully!");
      } else {
        alert(response.data?.message || "Failed to confirm booking.");
      }
    } catch (error) {
      console.error("Error confirming booking:", error);
      alert(
        error.response?.data?.message ||
          "Failed to confirm booking. Please try again.",
      );
    } finally {
      setConfirmingBooking(false);
    }
  };

  // Fetch voucher details
  const fetchVoucherDetails = async (bookingId) => {
    try {
      setLoadingVoucherDetails(true);
      setVoucherDetails(null);
      const response = await axiosInstance.get(
        `/api/hotel-booking/confirmation-voucher/${bookingId}`,
      );

      if (response.data && response.data.success) {
        setVoucherDetails(response.data.voucherDetails);
      } else {
        toast.error(
          response.data?.message || "Failed to load voucher details.",
        );
      }
    } catch (error) {
      console.error("Error fetching voucher details:", error);
      toast.error(
        error.response?.data?.message ||
          "Failed to load voucher details. Please try again.",
      );
    } finally {
      setLoadingVoucherDetails(false);
    }
  };

  // Generate PDF (Request, Confirmation, or Voucher)
  const handleGeneratePdf = async (type) => {
    if (!selectedBooking) return;

    try {
      setGeneratingPdf(true);
      setPdfUrl(null);
      const response = await axiosInstance.get(
        `/api/bookings/${selectedBooking.bookingId}/pdf`,
        {
          params: { type: type.toUpperCase() },
        },
      );

      if (response.data && response.data.status === "SUCCESS") {
        setPdfUrl(response.data.pdfUrl);
        toast.success(
          response.data.message || `${type} Generated successfully!`,
        );
      } else {
        toast.error(response.data?.message || `Failed to generate ${type}.`);
      }
    } catch (error) {
      console.error(`Error generating ${type}:`, error);
      toast.error(
        error.response?.data?.message ||
          `Failed to generate ${type}. Please try again.`,
      );
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Download PDF directly
  const handleDownloadPdf = async (bookingId, type) => {
    try {
      setLoading(true);
      const response = await axiosInstance.get(
        `/api/bookings/${bookingId}/pdf`,
        {
          params: { type: type.toUpperCase() },
        },
      );

      if (
        response.data &&
        response.data.status === "SUCCESS" &&
        response.data.pdfUrl
      ) {
        // Trigger browser download
        const link = document.createElement("a");
        link.href = response.data.pdfUrl;
        link.download = `Booking_${bookingId}_${type}.pdf`;
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(`${type} PDF download started!`);
      } else {
        toast.error(
          response.data?.message || `Failed to generate ${type} PDF.`,
        );
      }
    } catch (error) {
      console.error(`Error downloading ${type} PDF:`, error);
      toast.error(`Error downloading ${type} PDF.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  useEffect(() => {
    if (status === "all") fetchAllBookings();
  }, [status, fetchAllBookings]);

  useEffect(() => {
    if (status === "onrequest") fetchOnRequestBookings();
  }, [status, fetchOnRequestBookings]);

  useEffect(() => {
    if (status === "reconfirmed") fetchReconfirmedBookings();
  }, [status, fetchReconfirmedBookings]);

  useEffect(() => {
    if (status === "confirmed") fetchConfirmedBookings();
  }, [status, fetchConfirmedBookings]);

  useEffect(() => {
    if (status === "invoiced") fetchInvoicedBookings();
  }, [status, fetchInvoicedBookings]);

  // Get bookings based on selected status
  useEffect(() => {
    let currentBookings = [];
    let paginationMeta = { totalPages: 0, totalElements: 0 };

    switch (status) {
      case "all":
        currentBookings = allData.content || [];
        paginationMeta.totalPages = allData.totalPages || 0;
        paginationMeta.totalElements = allData.totalElements || 0;
        break;
      case "upcoming":
        currentBookings = apiData.upcomingBookings.content || [];
        paginationMeta.totalPages = apiData.upcomingBookings.totalPages || 0;
        paginationMeta.totalElements =
          apiData.upcomingBookings.totalElements || 0;
        break;
      case "completed":
        currentBookings = apiData.completedBookings.content || [];
        paginationMeta.totalPages = apiData.completedBookings.totalPages || 0;
        paginationMeta.totalElements =
          apiData.completedBookings.totalElements || 0;
        break;
      case "cancelled":
        currentBookings = apiData.cancelledBookings.content || [];
        paginationMeta.totalPages = apiData.cancelledBookings.totalPages || 0;
        paginationMeta.totalElements =
          apiData.cancelledBookings.totalElements || 0;
        break;
      case "onrequest":
        currentBookings = onRequestData.content || [];
        paginationMeta.totalPages = onRequestData.totalPages || 0;
        paginationMeta.totalElements = onRequestData.totalElements || 0;
        break;
      case "reconfirmed":
        currentBookings = reconfirmedData.content || [];
        paginationMeta.totalPages = reconfirmedData.totalPages || 0;
        paginationMeta.totalElements = reconfirmedData.totalElements || 0;
        break;
      case "confirmed":
        currentBookings = confirmedData.content || [];
        paginationMeta.totalPages = confirmedData.totalPages || 0;
        paginationMeta.totalElements = confirmedData.totalElements || 0;
        break;
      case "invoiced":
        currentBookings = invoicedData.content || [];
        paginationMeta.totalPages = invoicedData.totalPages || 0;
        paginationMeta.totalElements = invoicedData.totalElements || 0;
        break;
      default:
        currentBookings = [];
    }

    // Small helpers keep the four presentation filters (24h/religious ×
    // in/out) readable. `is24H` / `isRel` guard against both camelCase
    // and PascalCase spellings some legacy list rows carried.
    const is24H = (b) => !!(b && (b.is24HourCheckin || b.Is24HourCheckin));
    // Jackson strips the "is" prefix from a `isReligiousBooking()` getter, so
    // list rows actually carry `religiousBooking: true` in the JSON — accept
    // that plus the historical camelCase / PascalCase spellings as safety.
    const isRel = (b) =>
      !!(b && (b.religiousBooking || b.isReligiousBooking || b.IsReligiousBooking));

    if (religiousOnly) {
      // Religious Booking List: keep ONLY religious rows. Pagination is
      // still server-side today (no is_religious_booking filter on the
      // API), so the client-side filter is both the primary gate and the
      // safety net. Totals reflect the filtered visible count.
      const filtered = (currentBookings || []).filter(isRel);
      setBookings(filtered);
      setTotalPages(paginationMeta.totalPages || 0);
      setTotalElements(filtered.length);
    } else if (force24HourOnly) {
      // 24-hour-only menu: the server now filters to 24-hour rows when
      // is24HourCheckin=true is passed, so pagination + totals are authoritative.
      // The client-side filter below is kept as a defensive safety net for the
      // unlikely case the server hasn't been upgraded; in the upgraded path it's
      // a no-op since every row already matches.
      const filtered = (currentBookings || []).filter(is24H);
      setBookings(filtered);
      setTotalPages(paginationMeta.totalPages || 0);
      setTotalElements(paginationMeta.totalElements || 0);
    } else {
      // Regular Hotel Bookings list: exclude 24-hour-checkin rows AND
      // religious rows — those belong to their dedicated list pages.
      // Presentational filter only (pagination stays server-side); totals
      // reflect the filtered count so the footer/empty-state match.
      const filtered = (currentBookings || []).filter(
        (b) => !is24H(b) && !isRel(b),
      );
      setBookings(filtered);
      setTotalPages(paginationMeta.totalPages || 0);
      setTotalElements(filtered.length);
    }

    setPagination((prev) => {
      const currentState = prev[status];
      // When a client-side filter is active, the server was called with
      // page=0, size=10000 so paginationMeta.totalPages is 1 regardless
      // of the filtered result size. Clamping against it here would snap
      // the page back to 1 on every re-fetch, breaking Next/prev during
      // search. Client-side pagination is bounded by the filtered set
      // (see safeTotalPages / displayedBookings) and resetAllPages()
      // already fires whenever the search or filter inputs change.
      if (isClientFiltering) return prev;
      const effectiveTotalPages = paginationMeta.totalPages || 1;
      const clampedPage = Math.min(
        currentState.page,
        Math.max(effectiveTotalPages, 1),
      );
      if (clampedPage === currentState.page) {
        return prev;
      }
      return {
        ...prev,
        [status]: { ...currentState, page: clampedPage },
      };
    });
  }, [status, apiData, onRequestData, reconfirmedData, confirmedData, invoicedData, allData, isClientFiltering]);

  const resetAllPages = useCallback(() => {
    setPagination((prev) => ({
      all: { ...prev.all, page: 1 },
      upcoming: { ...prev.upcoming, page: 1 },
      completed: { ...prev.completed, page: 1 },
      cancelled: { ...prev.cancelled, page: 1 },
      onrequest: { ...prev.onrequest, page: 1 },
      reconfirmed: { ...prev.reconfirmed, page: 1 },
      confirmed: { ...prev.confirmed, page: 1 },
      invoiced: { ...prev.invoiced, page: 1 },
    }));
  }, []);

  const handlePageChange = useCallback(
    (nextPage) => {
      setPagination((prev) => {
        if (prev[status].page === nextPage) {
          return prev;
        }
        return {
          ...prev,
          [status]: { ...prev[status], page: nextPage },
        };
      });
    },
    [status],
  );

  const handlePageSizeChange = useCallback(
    (nextSize) => {
      setPagination((prev) => {
        if (prev[status].perPage === nextSize && prev[status].page === 1) {
          return prev;
        }
        return {
          ...prev,
          [status]: { ...prev[status], perPage: nextSize, page: 1 },
        };
      });
    },
    [status],
  );

  const handleMonthChange = useCallback(
    (value) => {
      setSelectedMonth(value);
      resetAllPages();
    },
    [resetAllPages],
  );

  const handleYearChange = useCallback(
    (value) => {
      setSelectedYear(value);
      resetAllPages();
    },
    [resetAllPages],
  );

  // Filter bookings based on search term and Check-in Date filter.
  const filteredBookings = useMemo(() => {
    const query = search.trim().toLowerCase();
    const checkInPick = (checkInDateFilter || "").trim(); // YYYY-MM-DD from <input type="date">

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
      if (!dateString) return "";
      return dateString.split("T")[0];
    };

    // Normalise any booking-side date value to YYYY-MM-DD for an exact match
    // against the <input type="date"> value.
    const toIsoDay = (dateString) => {
      if (!dateString) return "";
      return String(dateString).split("T")[0].trim();
    };

    return bookings.filter((booking) => {
      if (checkInPick && toIsoDay(booking.checkInDate) !== checkInPick) {
        return false;
      }
      if (!query) return true;
      return [
        booking.bookingCode, // GLBIN11
        booking.agentName, // Agent Name
        booking.primaryGuestName, // Customer Name
        ...getGuestNames(booking), // any additional customer on the booking
        booking.referenceNumber, // Reference Code
        booking.hotelName, // Hotel Name
        formatDate(booking.bookingDate), // 24/04/2025
        // Stay dates — shown in the Booking Details column, so searching a
        // check-in / check-out date (e.g. "26/06/2026") must match. Both the
        // dd/mm/yyyy display form and the raw value are included.
        formatDate(booking.checkInDate),
        formatDate(booking.checkOutDate),
        booking.checkInDate,
        booking.checkOutDate,
        formatDeadlineDate(booking.deadlineDate), // 2025-11-04
        booking.confirmationStatus, // Confirmed / Not Confirmed
      ]
        .map((val) => String(val ?? "").toLowerCase())
        .some((val) => val.includes(query));
    });
  }, [bookings, search, checkInDateFilter]);

  const currentPaginationState = pagination[status] || { page: 1, perPage: 10 };
  const currentPage = currentPaginationState.page;
  const currentPerPage = currentPaginationState.perPage;
  // When a client-side filter is active the entire dataset was fetched, so
  // pagination and totals derive from the filtered set rather than the
  // server-side meta (which reflects the full unfiltered count).
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
  const displayEnd = hasResults
    ? Math.min(serialNumberBase + displayedBookings.length, totalEntries)
    : 0;
  const safeTotalPages = isClientFiltering
    ? Math.max(1, Math.ceil(filteredCount / currentPerPage))
    : totalPages > 0
      ? totalPages
      : Math.max(1, Math.ceil((totalEntries || 0) / currentPerPage));

  // Colour each "/"-separated segment of a confirmation status independently,
  // mirroring the booking detail view's StatusBadge so the list and the detail
  // page stay consistent: Confirmed / ReConfirmed → green, Cancelled → red,
  // On Request → orange. A combined label like "Confirmed/Cancelled" therefore
  // shows the confirmed part green and only the cancelled part red.
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

  const getStatusBadge = (s) => {
    switch (s?.toLowerCase()) {
      case "confirmed":
      case "completed":
        return "success";
      case "cancelled":
      case "cancelled":
        return "danger";
      case "pending":
      case "upcoming":
        return "warning";
      case "reconfirmed":
        return "success";
      case "invoiced":
        return "primary";
      case "onrequest":
        return "secondary";
      default:
        return "secondary";
    }
  };

  const handleDeleteBooking = (booking) => {
    setBookingToCancel(booking);
    setCancellationReason("");
    setShowCancelModal(true);
  };

  const cancelBooking = async () => {
    if (!bookingToCancel) return;

    try {
      setCancellingBooking(true);
      const params = cancellationReason.trim()
        ? { reason: cancellationReason.trim() }
        : undefined;

      const response = await axiosInstance.delete(
        `/api/hotel-booking/${bookingToCancel.bookingId}/cancel`,
        { params },
      );

      if (
        response.data &&
        response.data.success &&
        response.data.confirmationStatus === "Cancelled"
      ) {
        await fetchBookings();
        setShowCancelModal(false);
        setBookingToCancel(null);
        setCancellationReason("");
        // console.log("Booking cancelled successfully!");
        toast.success(response.data.message);
      } else {
        // alert(response.data?.message || "Failed to cancel booking.");
        toast.error(response.data.message);
      }
    } catch (error) {
      console.error("Error cancelling booking:", error);
    } finally {
      setCancellingBooking(false);
    }
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
                <h3 className="fw-bold text-dark mb-2">
                  {religiousOnly
                    ? "Religious Bookings"
                    : force24HourOnly
                      ? "24 Hour Check-In Bookings"
                      : "Hotel Bookings"}
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
                    onChange={(e) => {
                      setSearch(e.target.value);
                      // Reset to page 1 so the user always lands at the top
                      // of the search result set (especially important when
                      // the search expands the dataset client-side).
                      resetAllPages();
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
                            onChange={(e) => {
                              setCheckInDateFilter(e.target.value);
                              resetAllPages();
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
                              resetAllPages();
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
                    style={{
                      overflowX: "auto",
                      width: "100%",
                    }}
                  >
                    <Table
                      hover
                      size="sm"
                      className="mb-0 align-middle table-bordered hbl-table"
                      style={{
                        // Auto layout so the table fits the page width and
                        // column widths flex to content. Falls back to a
                        // horizontal scroll only on extremely narrow viewports.
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
                              padding: "0.45rem 0.6rem",
                              fontWeight: "600",
                              textTransform: "uppercase",
                              color: "#495057",
                              textAlign: "center",
                              border: "1px solid #dee2e6",
                              whiteSpace: "normal",
                              lineHeight: 1.2,
                              width: COLUMN_WIDTHS.sn,
                            }}
                          >
                            S.N
                          </th>
                          {role === "admin" && (
                            <th
                              style={{
                                padding: "0.45rem 0.6rem",
                                fontWeight: "600",
                                textTransform: "uppercase",
                                color: "#495057",
                                border: "1px solid #dee2e6",
                                whiteSpace: "normal",
                                lineHeight: 1.2,
                                width: COLUMN_WIDTHS.agentName,
                              }}
                            >
                              Agent Name
                            </th>
                          )}
                          <th
                            style={{
                              padding: "0.45rem 0.6rem",
                              fontWeight: "600",
                              textTransform: "uppercase",
                              color: "#495057",
                              border: "1px solid #dee2e6",
                              whiteSpace: "normal",
                              lineHeight: 1.2,
                              width: COLUMN_WIDTHS.customerName,
                            }}
                          >
                            Customer Name
                          </th>
                          <th
                            style={{
                              padding: "0.45rem 0.6rem",
                              fontWeight: "600",
                              textTransform: "uppercase",
                              color: "#495057",
                              border: "1px solid #dee2e6",
                              whiteSpace: "normal",
                              lineHeight: 1.2,
                              width: COLUMN_WIDTHS.bookingCode,
                            }}
                          >
                            Booking Code
                          </th>
                          {/* Confirmation No — supplier's confirmation number,
                              populated via the "CONFIRMATION NO." button on
                              the booking detail view (booking.confirmationNumber).
                              Cell renders blank on rows that don't have one.
                              wordBreak/overflowWrap are explicitly "normal" so
                              the two-word header wraps only at its space (like
                              PAYMENT MODE / BOOKING CODE / DEADLINE DATE) and
                              never splits "CONFIRMATION" mid-word if the
                              viewport briefly makes the column tight. */}
                          <th
                            style={{
                              padding: "0.45rem 0.6rem",
                              fontWeight: "600",
                              textTransform: "uppercase",
                              color: "#495057",
                              border: "1px solid #dee2e6",
                              whiteSpace: "normal",
                              wordBreak: "normal",
                              overflowWrap: "normal",
                              lineHeight: 1.2,
                              width: COLUMN_WIDTHS.confirmationNo,
                            }}
                          >
                            Confirmation No
                          </th>
                          {/* Reference Code column hidden by request. */}
                          <th
                            style={{
                              padding: "0.45rem 0.6rem",
                              fontWeight: "600",
                              textTransform: "uppercase",
                              color: "#495057",
                              textAlign: "center",
                              border: "1px solid #dee2e6",
                              whiteSpace: "normal",
                              lineHeight: 1.2,
                              width: COLUMN_WIDTHS.bookDate,
                            }}
                          >
                            Book Date
                          </th>
                          <th
                            style={{
                              padding: "0.45rem 0.6rem",
                              fontWeight: "600",
                              textTransform: "uppercase",
                              color: "#495057",
                              border: "1px solid #dee2e6",
                              whiteSpace: "normal",
                              lineHeight: 1.2,
                              width: COLUMN_WIDTHS.bookingDetails,
                            }}
                          >
                            Booking Details
                          </th>
                          <th
                            style={{
                              padding: "0.45rem 0.6rem",
                              fontWeight: "600",
                              textTransform: "uppercase",
                              color: "#495057",
                              textAlign: "center",
                              border: "1px solid #dee2e6",
                              whiteSpace: "normal",
                              lineHeight: 1.2,
                              width: COLUMN_WIDTHS.deadlineDate,
                            }}
                          >
                            Deadline Date
                          </th>
                          {/* New Payment Mode column — shows the
                              method used at booking time (credit
                              limit vs online payment). */}
                          <th
                            style={{
                              padding: "0.45rem 0.6rem",
                              fontWeight: "600",
                              textTransform: "uppercase",
                              color: "#495057",
                              textAlign: "center",
                              border: "1px solid #dee2e6",
                              whiteSpace: "normal",
                              lineHeight: 1.2,
                              width: COLUMN_WIDTHS.paymentMode,
                            }}
                          >
                            Payment Mode
                          </th>
                          {/* Payment Status column — placeholder for now;
                              the value shown per booking is still to be
                              specified. */}
                          <th
                            style={{
                              padding: "0.45rem 0.6rem",
                              fontWeight: "600",
                              textTransform: "uppercase",
                              color: "#495057",
                              textAlign: "center",
                              border: "1px solid #dee2e6",
                              whiteSpace: "normal",
                              lineHeight: 1.2,
                              width: COLUMN_WIDTHS.paymentStatus,
                            }}
                          >
                            Payment Status
                          </th>
                          <th
                            style={{
                              padding: "0.45rem 0.6rem",
                              fontWeight: "600",
                              textTransform: "uppercase",
                              color: "#495057",
                              textAlign: "center",
                              border: "1px solid #dee2e6",
                              whiteSpace: "normal",
                              lineHeight: 1.2,
                              width: COLUMN_WIDTHS.notification,
                            }}
                          >
                            Notification
                          </th>
                          <th
                            style={{
                              padding: "0.45rem 0.6rem",
                              fontWeight: "600",
                              textTransform: "uppercase",
                              color: "#495057",
                              textAlign: "center",
                              border: "1px solid #dee2e6",
                              whiteSpace: "normal",
                              lineHeight: 1.2,
                              width: COLUMN_WIDTHS.action,
                            }}
                          >
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedBookings.length === 0 ? (
                          <tr>
                            <td
                              colSpan={11}
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
                          displayedBookings.map((b, i) => {
                            // Format dates — handles both "YYYY-MM-DD" and "YYYY-MM-DDTHH:mm:ss"
                            const formatDate = (dateString) => {
                              if (!dateString) return "";
                              const normalized = String(dateString).includes("T")
                                ? dateString
                                : `${dateString}T00:00:00`;
                              const date = new Date(normalized);
                              if (isNaN(date.getTime())) return "";
                              const day = String(date.getDate()).padStart(2, "0");
                              const month = String(date.getMonth() + 1).padStart(2, "0");
                              return `${day}/${month}/${date.getFullYear()}`;
                            };

                            // Format deadlineDate to show only YYYY-MM-DD
                            const formatDeadlineDate = (dateString) => {
                              if (!dateString) return "-";
                              return dateString.split("T")[0] || "-";
                            };

                            // Cells now wrap instead of truncating so the
                            // Reference Code / Deadline Date / Payment Mode
                            // badge / Notification / Booking Details (hotel
                            // + dates) all render in full. Pair with the
                            // wider COLUMN_WIDTHS above; the table's
                            // minWidth ensures horizontal scroll on small
                            // screens rather than column-squash.
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
                                key={b.bookingId}
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
                                  >
                                    <span className="fw-medium text-dark">
                                      {b.agentName || "-"}
                                    </span>
                                  </td>
                                )}
                                {/* Customer Name — a booking can hold many
                                    guests. Show the first prominently and
                                    surface the rest behind a "+N more" badge
                                    that opens the Customers modal. */}
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
                                {/* Confirmation No cell — mirrors the detail
                                    view's field resolution (booking.confirmationNumber
                                    with a customer-nested fallback for older
                                    payload shapes). Renders blank when the
                                    supplier hasn't stamped a number yet, per
                                    the requirement that empty means "nothing
                                    shown here". */}
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    width: COLUMN_WIDTHS.confirmationNo,
                                    // Confirmation numbers are atomic identifiers —
                                    // never break them at arbitrary character
                                    // boundaries the way the base cell style would.
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {(() => {
                                    const confNo =
                                      b.confirmationNumber ||
                                      b.customer?.confirmationNumber ||
                                      "";
                                    return confNo ? (
                                      <span
                                        className="fw-semibold text-dark"
                                        style={{ fontSize: "0.85rem" }}
                                      >
                                        {confNo}
                                      </span>
                                    ) : (
                                      <span className="text-muted">-</span>
                                    );
                                  })()}
                                </td>
                                {/* Reference Code cell hidden by request. */}
                                <td
                                  className="text-muted"
                                  style={{
                                    ...baseCellStyle,
                                    textAlign: "center",
                                    width: COLUMN_WIDTHS.bookDate,
                                    // A date is atomic — "12/08/2026" must
                                    // never wrap to "12/08/202 6".
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {formatDate(b.bookingDate) || "-"}
                                </td>
                                <td
                                  style={{
                                    ...baseCellStyle,
                                    width: COLUMN_WIDTHS.bookingDetails,
                                  }}
                                >
                                  <div
                                    className="d-flex align-items-center"
                                    style={{ gap: "0.35rem", flexWrap: "wrap" }}
                                  >
                                    <span
                                      className="fw-semibold text-dark"
                                      style={{ fontSize: "0.875rem" }}
                                    >
                                      {b.hotelName || "-"}
                                    </span>
                                    {b.is24HourCheckin && (
                                      <span
                                        className="badge bg-warning-subtle text-warning border border-warning-subtle"
                                        style={{ fontSize: "0.65rem", padding: "2px 6px" }}
                                        title="24-hour check-in booking"
                                      >
                                        24H
                                      </span>
                                    )}
                                    {formatDate(b.checkInDate) &&
                                      formatDate(b.checkOutDate) && (
                                        <span
                                          className="text-muted"
                                          style={{ fontSize: "0.75rem" }}
                                        >
                                          ({formatDate(b.checkInDate)} -{" "}
                                          {formatDate(b.checkOutDate)})
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
                                  {formatDeadlineDate(b.deadlineDate)}
                                </td>
                                {/* Payment Mode cell — Credit Limit
                                    Payment vs Online Payment, rendered
                                    as plain black text (per spec — no
                                    coloured badge). */}
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
                                {/* Payment Status cell — derived from the
                                    booking's displayed Status: Confirmed →
                                    Payment Pending, ReConfirmed → Paid, a
                                    cancellation → Paid or Un-Paid depending
                                    on whether it had been reconfirmed. See
                                    getPaymentStatusLabel. */}
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
                                    const label = getPaymentStatusLabel(b);
                                    if (label === "-") {
                                      return (
                                        <span className="text-muted">-</span>
                                      );
                                    }
                                    // Same palette as the adjacent Status
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
                                    // Keep the "ReConfirmed" / "Confirmed" /
                                    // "On Request" / "Cancelled" pill on one
                                    // line — the widened column above already
                                    // has room; nowrap protects it against
                                    // any narrower viewport too.
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {(() => {
                                    const rawStatus = String(
                                      b.confirmationStatus || "",
                                    );
                                    // A confirm-history compound label (e.g.
                                    // "Confirmed / ReConfirmed", stamped when a
                                    // booking is reconfirmed after being
                                    // confirmed) should surface only the
                                    // LATEST state in the list — the full
                                    // history still shows on the booking
                                    // detail page. Other compounds (e.g. a
                                    // cancellation combined with a prior
                                    // confirmed state) are left untouched and
                                    // keep rendering in full below.
                                    const rawSegments = rawStatus
                                      .split("/")
                                      .map((seg) => seg.trim());
                                    const isConfirmHistoryCompound =
                                      rawSegments.length > 1 &&
                                      rawSegments.every((seg) =>
                                        ["confirmed", "reconfirmed"].includes(
                                          seg.replace(/\s+/g, "").toLowerCase(),
                                        ),
                                      );
                                    const effectiveStatus = isConfirmHistoryCompound
                                      ? rawSegments[rawSegments.length - 1]
                                      : rawStatus;
                                    const normalizedStatus = effectiveStatus
                                      .replace(/\s+/g, "")
                                      .toLowerCase();
                                    const isConfirmed =
                                      normalizedStatus === "confirmed";
                                    const isReconfirmed =
                                      normalizedStatus === "reconfirmed";
                                    const isNotConfirmed =
                                      normalizedStatus === "notconfirmed";
                                    const showConfirmIcon = isNotConfirmed;

                                    // "On Request" bookings are stamped
                                    // CONFIRMED by the status engine so they can
                                    // follow the reconfirm flow, but until Step-1
                                    // Confirm actually happens they must DISPLAY
                                    // as "On Request" (orange) — only genuinely
                                    // confirmed bookings show "Confirmed". This
                                    // is display-only; the underlying status that
                                    // drives confirm/voucher flows is unchanged.
                                    const isOnRequestRoom = /^on\s*request$/i.test(
                                      String(b.roomStatus || "").trim(),
                                    );
                                    const isOnRequestStillPending =
                                      isOnRequestRoom && !b.onRequestConfirmed;
                                    if (isOnRequestStillPending && isConfirmed) {
                                      return (
                                        <span
                                          style={{
                                            color: "#e67e22",
                                            padding: "0.32rem 0.6rem",
                                            fontSize: "0.82rem",
                                            fontWeight: "600",
                                            borderRadius: "0.375rem",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "0.35rem",
                                          }}
                                        >
                                          On Request
                                        </span>
                                      );
                                    }

                                    if (isConfirmed) {
                                      return (
                                        <span
                                          style={{
                                            color: "#06a301",
                                            padding: "0.32rem 0.6rem",
                                            fontSize: "0.82rem",
                                            fontWeight: "600",
                                            borderRadius: "0.375rem",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "0.35rem",
                                          }}
                                        >
                                          Confirmed
                                        </span>
                                      );
                                    }

                                    if (isReconfirmed) {
                                      return (
                                        <span
                                          style={{
                                            color: "#06a301",
                                            padding: "0.32rem 0.6rem",
                                            fontSize: "0.82rem",
                                            fontWeight: "600",
                                            borderRadius: "0.375rem",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "0.35rem",
                                          }}
                                        >
                                          ReConfirmed
                                        </span>
                                      );
                                    }

                                    const label = isNotConfirmed
                                      ? "Not Confirmed"
                                      : effectiveStatus || "-";
                                    const isUpdating =
                                      updatingConfirmationStatus ===
                                      b.bookingId;

                                    return (
                                      <div
                                        className="d-inline-flex align-items-center justify-content-center gap-2 setConfirmed "
                                        title="Click to confirm the booking."
                                        style={{
                                          padding: "0.32rem 0.6rem",
                                          borderRadius: "0.375rem",
                                          backgroundColor: "transparent",
                                          color: isNotConfirmed
                                            ? "#dc3545"
                                            : "#6c757d",
                                          fontSize: "0.72rem",
                                          fontWeight: "600",
                                          cursor: isUpdating
                                            ? "not-allowed"
                                            : "pointer",
                                          transition: "all 0.2s ease",
                                          opacity: isUpdating ? 0.6 : 1,
                                        }}
                                        // onClick={() => {
                                        //   if (isNotConfirmed && !isUpdating) {
                                        //      handleConfirmStatusClick(b);
                                        //   } else if (!isUpdating) {
                                        //      handleConfirmBookingClick(b);
                                        //   }
                                        // }}
                                      >
                                        {isUpdating ? (
                                          <Spinner
                                            animation="border"
                                            size="sm"
                                            style={{
                                              width: "12px",
                                              height: "12px",
                                              borderWidth: "2px",
                                            }}
                                          />
                                        ) : !isNotConfirmed ? (
                                          // Cancelled / combined statuses get the
                                          // same per-segment colouring as the
                                          // detail view (Cancelled red, Confirmed
                                          // green) instead of flat grey.
                                          renderColoredStatus(label)
                                        ) : (
                                          <>
                                            <span>{label}</span>
                                            {showConfirmIcon && (
                                              <FaExclamationCircle
                                                style={{
                                                  fontSize: "15px",
                                                  color: "#ff9800",
                                                  transition: "all 0.2s ease",
                                                }}
                                                title="Non-refundable booking. Click to confirm."
                                                onMouseEnter={(e) => {
                                                  e.currentTarget.style.color =
                                                    "#f57c00";
                                                  e.currentTarget.style.transform =
                                                    "scale(1.15)";
                                                }}
                                                onMouseLeave={(e) => {
                                                  e.currentTarget.style.color =
                                                    "#ff9800";
                                                  e.currentTarget.style.transform =
                                                    "scale(1)";
                                                }}
                                              />
                                            )}
                                          </>
                                        )}
                                      </div>
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
                                    {/* Single view action — opens the full
                                        booking details page. Plain eye icon
                                        per spec (no labelled button). */}
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
                                          `/booking-details/hotel-booking/${b.bookingId}`,
                                        )
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault();
                                          navigate(
                                            `/booking-details/hotel-booking/${b.bookingId}`,
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
            {!loading && displayedBookings.length > 0 && (
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
                      Showing {""}
                      <span className="fw-semibold text-dark">
                        {displayStart}
                      </span>{" "}
                      to {""}
                      <span className="fw-semibold text-dark">
                        {displayEnd}
                      </span>{" "}
                      of {""}
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
                        value={currentPerPage}
                        onChange={(e) =>
                          handlePageSizeChange(Number(e.target.value))
                        }
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
                      {(() => {
                        // Sliding window: show at most 5 page tabs at a time,
                        // centered on the current page. Prev/Next behavior is
                        // unchanged and continues to move one page at a time,
                        // shifting the window as needed (e.g. 1..5, 2..6, ...).
                        const windowSize = 5;
                        const startPage = Math.max(
                          1,
                          Math.min(
                            currentPage - Math.floor(windowSize / 2),
                            safeTotalPages - windowSize + 1,
                          ),
                        );
                        const endPage = Math.min(
                          safeTotalPages,
                          startPage + windowSize - 1,
                        );
                        return Array.from(
                          { length: endPage - startPage + 1 },
                          (_, i) => startPage + i,
                        ).map((pageNumber) => (
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
                        ));
                      })()}
                      <Pagination.Next
                        disabled={currentPage === safeTotalPages}
                        onClick={() =>
                          currentPage < safeTotalPages &&
                          handlePageChange(currentPage + 1)
                        }
                        style={{
                          cursor:
                            currentPage === safeTotalPages
                              ? "not-allowed"
                              : "pointer",
                          opacity: currentPage === safeTotalPages ? 0.5 : 1,
                        }}
                      />
                    </Pagination>
                  </div>
                </Card.Body>
              </Card>
            )}

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
                  <div
                    className="text-muted mb-2"
                    style={{ fontSize: "0.78rem" }}
                  >
                    Booking Code:{" "}
                    <span className="fw-semibold text-primary">
                      {customersModalBooking.bookingCode}
                    </span>
                  </div>
                )}
                <ul className="list-unstyled mb-0">
                  {getGuestNames(customersModalBooking).map((name, idx) => (
                    <li
                      key={idx}
                      className="d-flex align-items-center py-2"
                      style={{
                        gap: "0.5rem",
                        borderBottom: "1px solid #f1f3f5",
                      }}
                    >
                      <FaUser style={{ color: "#6c757d", flexShrink: 0 }} />
                      <span className="fw-medium text-dark">{name}</span>
                    </li>
                  ))}
                  {getGuestNames(customersModalBooking).length === 0 && (
                    <li className="text-muted py-2">No customers found.</li>
                  )}
                </ul>
              </Modal.Body>
            </Modal>

            {/* Booking Details Modal */}
            <Modal
              show={showDetailsModal}
              onHide={() => setShowDetailsModal(false)}
              size="lg"
              centered
              backdrop="static"
              keyboard={false}
            >
              <Modal.Header
                closeButton
                style={{
                  backgroundColor: "#fff",
                  borderBottom: "2px solid #e9ecef",
                }}
              >
                <Modal.Title className="fw-bold d-flex align-items-center">
                  <FaEye className="me-2 text-primary" />
                  <span>Booking Details</span>
                </Modal.Title>
              </Modal.Header>
              <Modal.Body style={{ padding: "1.5rem" }}>
                {loadingBookingId !== null ? (
                  <div className="text-center py-5">
                    <Spinner animation="border" variant="primary" />
                    <p className="mt-2 text-muted">
                      Loading booking details...
                    </p>
                  </div>
                ) : bookingDetails ? (
                  <div>
                    {/* Booking Header - Prominent */}
                    <div className="mb-4 p-3 bg-light rounded border">
                      <Row className="align-items-center">
                        <Col md={8}>
                          <div className="d-flex align-items-center gap-3 mb-2">
                            <h5 className="mb-0 fw-bold text-dark">
                              {bookingDetails.bookingHeader?.bookingCode ||
                                "N/A"}
                            </h5>
                            <Badge
                              // bg={
                              //   bookingDetails.bookingHeader?.bookingStatus ===
                              //   "UPCOMING"
                              //     ? "warning"
                              //     : bookingDetails.bookingHeader
                              //         ?.bookingStatus === "COMPLETED"
                              //     ? "success"
                              //     : "danger"
                              // }
                              bg={
                                bookingDetails.bookingHeader
                                  ?.confirmationStatus === "Confirmed" ||
                                bookingDetails.bookingHeader
                                  ?.confirmationStatus === "ReConfirmed"
                                  ? "success"
                                  : "danger"
                              }
                              style={{
                                fontSize: "0.75rem",
                                padding: "0.4rem 0.8rem",
                              }}
                            >
                              {bookingDetails.bookingHeader?.confirmationStatus
                                ? bookingDetails.bookingHeader.confirmationStatus.toUpperCase()
                                : "-"}
                            </Badge>
                          </div>
                          <div className="text-muted small">
                            <span className="me-3">
                              <strong>Booking ID:</strong>{" "}
                              {bookingDetails.bookingHeader?.bookingId || "-"}
                            </span>
                            <span>
                              <strong>Reference:</strong>{" "}
                              {bookingDetails.bookingHeader?.referenceNumber ||
                                "-"}
                            </span>
                          </div>
                        </Col>
                        <Col md={4} className="text-end">
                          <div className="text-muted small">
                            <div>
                              <strong>Booking Date:</strong>
                            </div>
                            <div>
                              {bookingDetails.bookingHeader?.bookingDate
                                ? new Date(
                                    bookingDetails.bookingHeader.bookingDate,
                                  ).toLocaleDateString("en-US", {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                  })
                                : "-"}
                            </div>
                            {bookingDetails.bookingHeader?.deadlineDate && (
                              <>
                                <div className="mt-2">
                                  <strong>Deadline:</strong>
                                </div>
                                <div>
                                  {new Date(
                                    bookingDetails.bookingHeader.deadlineDate,
                                  ).toLocaleDateString("en-US", {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </div>
                              </>
                            )}
                          </div>
                        </Col>
                      </Row>
                    </div>

                    <Row>
                      {/* Left Column */}
                      <Col md={7}>
                        {/* Guest Information */}
                        <Card className="mb-3 border-0 shadow-sm">
                          <Card.Header
                            className="bg-light border-bottom fw-semibold"
                            style={{
                              fontSize: "0.9rem",
                              padding: "0.75rem 1rem",
                            }}
                          >
                            Guest Information
                          </Card.Header>
                          <Card.Body>
                            <div className="mb-3">
                              <div className="text-muted small mb-1">
                                Guest Name
                              </div>
                              <div className="fw-semibold">
                                {bookingDetails.guestInformation?.guestName ||
                                  "-"}
                              </div>
                            </div>
                            <Row>
                              <Col md={6}>
                                <div className="mb-3">
                                  <div className="text-muted small mb-1">
                                    Email
                                  </div>
                                  <div>
                                    {bookingDetails.guestInformation?.email ||
                                      "-"}
                                  </div>
                                </div>
                              </Col>
                              <Col md={6}>
                                <div className="mb-3">
                                  <div className="text-muted small mb-1">
                                    Mobile Number
                                  </div>
                                  <div>
                                    {bookingDetails.guestInformation
                                      ?.mobileNumber || "-"}
                                  </div>
                                </div>
                              </Col>
                            </Row>
                            <div>
                              <div className="text-muted small mb-1">
                                Nationality
                              </div>
                              <div>
                                {bookingDetails.guestInformation
                                  ?.nativeCountry || "-"}
                              </div>
                            </div>
                          </Card.Body>
                        </Card>
                      </Col>

                      {/* Right Column - Pricing Summary */}
                      <Col md={5}>
                        <Card
                          className="border-0 shadow-sm"
                          style={{ position: "sticky", top: "1rem" }}
                        >
                          <Card.Header
                            className="bg-light border-bottom fw-semibold"
                            style={{
                              fontSize: "0.9rem",
                              padding: "0.75rem 1rem",
                            }}
                          >
                            Pricing Summary
                          </Card.Header>
                          <Card.Body>
                            <div className="mb-3">
                              <div className="d-flex justify-content-between mb-2">
                                <span className="text-muted">Room Rate</span>
                                <span className="fw-semibold">
                                  {console.log(
                                    "bookingDetails:::###::",
                                    bookingDetails,
                                  )}
                                  {bookingDetails?.bookingDetails?.currency ||
                                    ""}{" "}
                                  {bookingDetails?.bookingDetails?.total
                                    ? bookingDetails.bookingDetails.total.toFixed(
                                        2,
                                      )
                                    : "0.00"}
                                </span>
                              </div>

                              {/* {bookingDetails.bookingDetails?.taxDiscount !==
                                0 && (
                                <div className="d-flex justify-content-between mb-2">
                                  <span className="text-muted">
                                    {bookingDetails.bookingDetails.taxDiscount >
                                    0
                                      ? "Tax"
                                      : "Discount"}
                                  </span>
                                  <span
                                    className={
                                      bookingDetails.bookingDetails
                                        .taxDiscount > 0
                                        ? "text-danger"
                                        : "text-success"
                                    }
                                  >
                                    {bookingDetails.bookingDetails.taxDiscount >
                                    0
                                      ? "+"
                                      : "-"}{" "}
                                    {bookingDetails.bookingDetails?.currency ||
                                      "AED"}{" "}
                                    {Math.abs(
                                      bookingDetails.bookingDetails.taxDiscount
                                    ).toFixed(2)}
                                  </span>
                                </div>
                              )} */}
                            </div>
                            <hr className="my-3" />
                            <div className="d-flex justify-content-between align-items-center p-3 bg-light rounded">
                              <span className="fw-bold fs-5">Total Amount</span>
                              <span className="text-success fw-bold fs-4">
                                {bookingDetails.bookingDetails?.currency ||
                                  "AED"}{" "}
                                {bookingDetails.bookingDetails?.total?.toFixed(
                                  2,
                                ) || "0.00"}
                              </span>
                            </div>
                          </Card.Body>
                        </Card>
                      </Col>
                    </Row>

                    {/* Reservation Details - Full Width */}
                    <Card className="mb-3 border-0 shadow-sm">
                      <Card.Header
                        className="bg-light border-bottom fw-semibold"
                        style={{ fontSize: "0.9rem", padding: "0.75rem 1rem" }}
                      >
                        Reservation Details
                      </Card.Header>
                      <Card.Body>
                        <div className="mb-3">
                          <div className="text-muted small mb-1">
                            Hotel Name
                          </div>
                          <div className="fw-semibold">
                            {bookingDetails.bookingDetails?.hotelName || "-"}
                          </div>
                        </div>
                        <Row>
                          <Col md={6}>
                            <div className="mb-3">
                              <div className="text-muted small mb-1">
                                Check-In Date
                              </div>
                              <div>
                                {bookingDetails.bookingDetails?.checkInDate ||
                                  "-"}
                              </div>
                            </div>
                          </Col>
                          <Col md={6}>
                            <div className="mb-3">
                              <div className="text-muted small mb-1">
                                Check-Out Date
                              </div>
                              <div>
                                {bookingDetails.bookingDetails?.checkOutDate ||
                                  "-"}
                              </div>
                            </div>
                          </Col>
                        </Row>
                        <Row>
                          <Col md={4}>
                            <div className="mb-3">
                              <div className="text-muted small mb-1">
                                Duration
                              </div>
                              <div>
                                {bookingDetails.bookingDetails
                                  ?.numberOfNights || "0"}{" "}
                                Night(s)
                              </div>
                            </div>
                          </Col>
                          <Col md={4}>
                            <div className="mb-3">
                              <div className="text-muted small mb-1">
                                Number of Rooms
                              </div>
                              <div>
                                {bookingDetails.bookingDetails?.numberOfRooms ||
                                  "0"}
                              </div>
                            </div>
                          </Col>
                          <Col md={4}>
                            <div className="mb-3">
                              <div className="text-muted small mb-1">
                                Total Guests
                              </div>
                              <div>
                                {bookingDetails.bookingDetails
                                  ?.numberOfAdults || "0"}{" "}
                                Adults
                                {bookingDetails.bookingDetails
                                  ?.numberOfChildren > 0 &&
                                  `, ${bookingDetails.bookingDetails.numberOfChildren} Children`}
                              </div>
                            </div>
                          </Col>
                        </Row>
                      </Card.Body>
                    </Card>

                    {/* Rooms Information - Full Width */}
                    {bookingDetails.bookingDetails?.rooms &&
                      bookingDetails.bookingDetails.rooms.length > 0 && (
                        <div className="p-4 bg-light rounded border">
                          <div className="mb-3">
                            <h6 className="fw-bold text-dark mb-3">
                              Room Details
                            </h6>
                          </div>
                          <div className="table-responsive">
                            <Table bordered hover className="mb-0 bg-white">
                              <thead className="table-light">
                                <tr>
                                  <th
                                    style={{
                                      fontSize: "0.85rem",
                                      padding: "0.75rem",
                                      fontWeight: "600",
                                    }}
                                  >
                                    Room No
                                  </th>
                                  <th
                                    style={{
                                      fontSize: "0.85rem",
                                      padding: "0.75rem",
                                      fontWeight: "600",
                                    }}
                                  >
                                    Room Category
                                  </th>
                                  <th
                                    style={{
                                      fontSize: "0.85rem",
                                      padding: "0.75rem",
                                      fontWeight: "600",
                                    }}
                                  >
                                    Meal Plan
                                  </th>
                                  <th
                                    style={{
                                      fontSize: "0.85rem",
                                      padding: "0.75rem",
                                      fontWeight: "600",
                                    }}
                                  >
                                    Adults
                                  </th>
                                  <th
                                    style={{
                                      fontSize: "0.85rem",
                                      padding: "0.75rem",
                                      fontWeight: "600",
                                    }}
                                  >
                                    Children
                                  </th>
                                  <th
                                    style={{
                                      fontSize: "0.85rem",
                                      padding: "0.75rem",
                                      fontWeight: "600",
                                      textAlign: "right",
                                    }}
                                  >
                                    Rate
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {bookingDetails.bookingDetails.rooms.map(
                                  (room, index) => (
                                    <tr key={index}>
                                      <td
                                        style={{
                                          padding: "0.75rem",
                                          verticalAlign: "middle",
                                        }}
                                      >
                                        <span className="fw-bold text-primary">
                                          Room {room.roomNo || index + 1}
                                        </span>
                                      </td>
                                      <td
                                        style={{
                                          padding: "0.75rem",
                                          verticalAlign: "middle",
                                        }}
                                      >
                                        {room.roomCategory || "-"}
                                      </td>
                                      <td
                                        style={{
                                          padding: "0.75rem",
                                          verticalAlign: "middle",
                                        }}
                                      >
                                        {room.mealPlan || "-"}
                                      </td>
                                      <td
                                        style={{
                                          padding: "0.75rem",
                                          verticalAlign: "middle",
                                          textAlign: "center",
                                        }}
                                      >
                                        {room.adults || "0"}
                                      </td>
                                      <td
                                        style={{
                                          padding: "0.75rem",
                                          verticalAlign: "middle",
                                          textAlign: "center",
                                        }}
                                      >
                                        {room.children || "0"}
                                      </td>
                                      <td
                                        style={{
                                          padding: "0.75rem",
                                          verticalAlign: "middle",
                                          textAlign: "right",
                                        }}
                                      >
                                        {bookingDetails.bookingDetails
                                          ?.currency || "AED"}{" "}
                                        {room.rate?.toFixed(2) || "0.00"}
                                      </td>
                                    </tr>
                                  ),
                                )}
                              </tbody>
                            </Table>
                          </div>
                        </div>
                      )}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-muted">No booking details available.</p>
                  </div>
                )}
              </Modal.Body>
              <Modal.Footer
                style={{
                  backgroundColor: "#f8f9fa",
                  borderTop: "1px solid #dee2e6",
                }}
              >
                <Button
                  variant="secondary"
                  onClick={() => setShowDetailsModal(false)}
                >
                  Close
                </Button>
              </Modal.Footer>
            </Modal>

            {/* Request Confirmation Voucher Modal */}
            <Modal
              show={showVoucherModal}
              onHide={() => {
                setShowVoucherModal(false);
                setSelectedBooking(null);
                setSelectedVoucherType("Request");
                setPdfUrl(null);
                setVoucherDetails(null);
              }}
              size="xl"
              centered
              backdrop="static"
              keyboard={false}
            >
              <Modal.Header
                closeButton
                style={{ backgroundColor: "#0d6efd", color: "#fff" }}
              >
                <Modal.Title className="fw-bold">
                  Request Confirmation Voucher
                </Modal.Title>
              </Modal.Header>
              <Modal.Body style={{ padding: "1.5rem" }}>
                {selectedBooking && (
                  <>
                    {/* Radio Buttons */}
                    <div className="mb-4 d-flex gap-4">
                      <Form.Check
                        type="radio"
                        id="voucher-request"
                        name="voucherType"
                        label="Request"
                        checked={selectedVoucherType === "Request"}
                        onChange={() => {
                          setSelectedVoucherType("Request");
                          setPdfUrl(null);
                        }}
                        className="fw-semibold"
                      />
                      <Form.Check
                        type="radio"
                        id="voucher-confirmation"
                        name="voucherType"
                        label="Confirmation"
                        checked={selectedVoucherType === "Confirmation"}
                        onChange={() => {
                          setSelectedVoucherType("Confirmation");
                          setPdfUrl(null);
                        }}
                        className="fw-semibold"
                      />
                      <Form.Check
                        type="radio"
                        id="voucher-voucher"
                        name="voucherType"
                        label="Voucher"
                        checked={selectedVoucherType === "Voucher"}
                        onChange={() => {
                          setSelectedVoucherType("Voucher");
                          setPdfUrl(null);
                        }}
                        className="fw-semibold"
                      />
                    </div>

                    {/* PDF URL Display */}
                    {/* {pdfUrl && selectedVoucherType === "Confirmation" && (
                      <div
                        className="mb-3 p-3"
                        style={{
                          backgroundColor: "#e7f3ff",
                          borderRadius: "8px",
                          border: "1px solid #b3d9ff",
                        }}
                      >
                        <div className="d-flex align-items-center justify-content-between">
                          <div>
                            <strong style={{ color: "#0066cc" }}>
                              PDF Generated Successfully:
                            </strong>
                            <div className="mt-2">
                              <a
                                href={pdfUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  color: "#0066cc",
                                  textDecoration: "underline",
                                  wordBreak: "break-all",
                                }}
                              >
                                {pdfUrl}
                              </a>
                            </div>
                          </div>
                          <Button
                            variant="outline-primary"
                            size="sm"
                            onClick={() => window.open(pdfUrl, "_blank")}
                          >
                            Open PDF
                          </Button>
                        </div>
                      </div>
                    )} */}

                    {pdfUrl && (
                      <div
                        className="mb-3"
                        style={{
                          border: "1px solid #dee2e6",
                          borderRadius: "8px",
                          overflow: "hidden",
                          background: "#fff",
                        }}
                      >
                        <div
                          style={{
                            padding: "8px 12px",
                            background: "#f8f9fa",
                            borderBottom: "1px solid #dee2e6",
                            fontWeight: "600",
                            fontSize: "14px",
                          }}
                        >
                          {selectedVoucherType} PDF Preview
                        </div>

                        <iframe
                          src={pdfUrl}
                          title={`${selectedVoucherType} PDF`}
                          width="100%"
                          height="500px"
                          style={{
                            border: "none",
                          }}
                        />
                      </div>
                    )}

                    {/* Table */}
                    <div className="table-responsive">
                      <Table bordered hover className="mb-0">
                        <thead className="table-light">
                          <tr>
                            <th
                              style={{
                                fontSize: "0.85rem",
                                padding: "0.75rem",
                                fontWeight: "600",
                              }}
                            >
                              Hotel
                            </th>
                            <th
                              style={{
                                fontSize: "0.85rem",
                                padding: "0.75rem",
                                fontWeight: "600",
                              }}
                            >
                              Confirmation Status
                            </th>
                            {selectedVoucherType === "Request" && (
                              <>
                                <th
                                  style={{
                                    fontSize: "0.85rem",
                                    padding: "0.75rem",
                                    fontWeight: "600",
                                  }}
                                >
                                  Booking code
                                </th>
                                <th
                                  style={{
                                    fontSize: "0.85rem",
                                    padding: "0.75rem",
                                    fontWeight: "600",
                                  }}
                                >
                                  Confirmation Reference
                                </th>
                                <th
                                  style={{
                                    fontSize: "0.85rem",
                                    padding: "0.75rem",
                                    fontWeight: "600",
                                  }}
                                >
                                  Price Reference
                                </th>
                              </>
                            )}
                            {selectedVoucherType === "Confirmation" && (
                              <>
                                <th
                                  style={{
                                    fontSize: "0.85rem",
                                    padding: "0.75rem",
                                    fontWeight: "600",
                                  }}
                                >
                                  Confirmation Reference
                                </th>
                                <th
                                  style={{
                                    fontSize: "0.85rem",
                                    padding: "0.75rem",
                                    fontWeight: "600",
                                  }}
                                >
                                  Supplier Reference
                                </th>
                              </>
                            )}
                            {selectedVoucherType === "Voucher" && (
                              <>
                                <th
                                  style={{
                                    fontSize: "0.85rem",
                                    padding: "0.75rem",
                                    fontWeight: "600",
                                  }}
                                >
                                  Confirmation Reference
                                </th>
                                <th
                                  style={{
                                    fontSize: "0.85rem",
                                    padding: "0.75rem",
                                    fontWeight: "600",
                                  }}
                                >
                                  Supplier Reference
                                </th>
                              </>
                            )}
                            <th
                              style={{
                                fontSize: "0.85rem",
                                padding: "0.75rem",
                                fontWeight: "600",
                              }}
                            >
                              Check In
                            </th>
                            <th
                              style={{
                                fontSize: "0.85rem",
                                padding: "0.75rem",
                                fontWeight: "600",
                              }}
                            >
                              Check Out
                            </th>
                            <th
                              style={{
                                fontSize: "0.85rem",
                                padding: "0.75rem",
                                fontWeight: "600",
                              }}
                            >
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {loadingVoucherDetails ? (
                            <tr>
                              <td
                                colSpan={
                                  selectedVoucherType === "Request"
                                    ? 8
                                    : selectedVoucherType === "Confirmation"
                                      ? 7
                                      : 7
                                }
                                style={{
                                  padding: "2rem",
                                  textAlign: "center",
                                }}
                              >
                                <Spinner animation="border" size="sm" /> Loading
                                voucher details...
                              </td>
                            </tr>
                          ) : (
                            <tr>
                              <td
                                style={{
                                  padding: "0.75rem",
                                  verticalAlign: "middle",
                                }}
                              >
                                {voucherDetails?.hotelName ||
                                  selectedBooking?.hotelName ||
                                  "-"}
                              </td>
                              <td
                                style={{
                                  padding: "0.75rem",
                                  verticalAlign: "middle",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "0.75rem",
                                    padding: "0.4rem 0.6rem",
                                    fontWeight: "500",
                                    color: [
                                      "Confirmed",
                                      "ReConfirmed",
                                    ].includes(
                                      voucherDetails?.confirmationStatus,
                                    )
                                      ? "#28a745" // success green
                                      : "#dc3545", // danger red
                                    backgroundColor: [
                                      "Confirmed",
                                      "ReConfirmed",
                                    ].includes(
                                      voucherDetails?.confirmationStatus,
                                    )
                                      ? "#d4edda" // Light green
                                      : "#f8d7da", // Light red
                                    borderRadius: "0.375rem",
                                    display: "inline-block",
                                  }}
                                >
                                  {voucherDetails?.confirmationStatus ===
                                  "Confirmed"
                                    ? "CONFIRMED"
                                    : voucherDetails?.confirmationStatus ===
                                        "ReConfirmed"
                                      ? "ReConfirmed"
                                      : "NOT CONFIRMED"}
                                </span>
                              </td>

                              {selectedVoucherType === "Request" && (
                                <>
                                  <td
                                    style={{
                                      padding: "0.75rem",
                                      verticalAlign: "middle",
                                    }}
                                  >
                                    {voucherDetails?.bookingCode ||
                                      selectedBooking?.bookingCode ||
                                      "-"}
                                  </td>
                                  <td
                                    style={{
                                      padding: "0.75rem",
                                      verticalAlign: "middle",
                                    }}
                                  >
                                    {voucherDetails?.confirmationReference ||
                                      selectedBooking?.referenceNumber ||
                                      "null"}
                                  </td>
                                  <td
                                    style={{
                                      padding: "0.75rem",
                                      verticalAlign: "middle",
                                    }}
                                  >
                                    {voucherDetails?.priceReference || "null"}
                                  </td>
                                </>
                              )}
                              {selectedVoucherType === "Confirmation" && (
                                <>
                                  <td
                                    style={{
                                      padding: "0.75rem",
                                      verticalAlign: "middle",
                                    }}
                                  >
                                    {voucherDetails?.confirmationReference ||
                                      selectedBooking?.referenceNumber ||
                                      "null"}
                                  </td>
                                  <td
                                    style={{
                                      padding: "0.75rem",
                                      verticalAlign: "middle",
                                    }}
                                  >
                                    0
                                  </td>
                                </>
                              )}
                              {selectedVoucherType === "Voucher" && (
                                <>
                                  <td
                                    style={{
                                      padding: "0.75rem",
                                      verticalAlign: "middle",
                                    }}
                                  >
                                    {voucherDetails?.confirmationReference ||
                                      selectedBooking?.referenceNumber ||
                                      "null"}
                                  </td>
                                  <td
                                    style={{
                                      padding: "0.75rem",
                                      verticalAlign: "middle",
                                    }}
                                  >
                                    0
                                  </td>
                                </>
                              )}
                              <td
                                style={{
                                  padding: "0.75rem",
                                  verticalAlign: "middle",
                                }}
                              >
                                {voucherDetails?.checkIn
                                  ? new Date(
                                      voucherDetails.checkIn,
                                    ).toLocaleDateString("en-GB", {
                                      day: "2-digit",
                                      month: "short",
                                      year: "numeric",
                                    })
                                  : selectedBooking?.checkInDate
                                    ? new Date(
                                        selectedBooking.checkInDate,
                                      ).toLocaleDateString("en-GB", {
                                        day: "2-digit",
                                        month: "short",
                                        year: "numeric",
                                      })
                                    : "-"}
                              </td>
                              <td
                                style={{
                                  padding: "0.75rem",
                                  verticalAlign: "middle",
                                }}
                              >
                                {voucherDetails?.checkout
                                  ? new Date(
                                      voucherDetails.checkout,
                                    ).toLocaleDateString("en-GB", {
                                      day: "2-digit",
                                      month: "short",
                                      year: "numeric",
                                    })
                                  : selectedBooking?.checkOutDate
                                    ? new Date(
                                        selectedBooking.checkOutDate,
                                      ).toLocaleDateString("en-GB", {
                                        day: "2-digit",
                                        month: "short",
                                        year: "numeric",
                                      })
                                    : "-"}
                              </td>
                              <td
                                style={{
                                  padding: "0.75rem",
                                  verticalAlign: "middle",
                                  textAlign: "center",
                                }}
                              >
                                <Button
                                  variant="primary"
                                  size="sm"
                                  style={{
                                    width: "32px",
                                    height: "32px",
                                    padding: 0,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                  title="Send"
                                  onClick={() => {
                                    // Check if booking is confirmed for Confirmation and Voucher
                                    const isConfirmed =
                                      voucherDetails?.confirmationStatus ===
                                      "Confirmed";

                                    if (
                                      selectedVoucherType !== "Request" &&
                                      !isConfirmed
                                    ) {
                                      toast.error(
                                        `Confirm the booking then only ${selectedVoucherType} can be generated`,
                                      );
                                      return;
                                    }

                                    handleGeneratePdf(selectedVoucherType);
                                  }}
                                  disabled={generatingPdf}
                                >
                                  {generatingPdf ? (
                                    <Spinner
                                      animation="border"
                                      size="sm"
                                      style={{ width: "14px", height: "14px" }}
                                    />
                                  ) : (
                                    <FaPaperPlane
                                      style={{ fontSize: "14px" }}
                                    />
                                  )}
                                </Button>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </Table>
                    </div>
                  </>
                )}
              </Modal.Body>
              <Modal.Footer
                style={{
                  backgroundColor: "#f8f9fa",
                  borderTop: "1px solid #dee2e6",
                }}
              >
                <Button
                  variant="primary"
                  onClick={() => {
                    setShowVoucherModal(false);
                    setSelectedBooking(null);
                    setSelectedVoucherType("Request");
                    setPdfUrl(null);
                    setVoucherDetails(null);
                  }}
                >
                  <i className="bi bi-check-circle me-1"></i> Close
                </Button>
              </Modal.Footer>
            </Modal>

            {/* Confirm Booking Modal */}
            <Modal
              show={showConfirmModal}
              onHide={() => {
                if (!confirmingBooking) {
                  setShowConfirmModal(false);
                  setBookingToConfirm(null);
                }
              }}
              centered
              backdrop="static"
              keyboard={false}
            >
              <Modal.Header
                closeButton={!confirmingBooking}
                style={{
                  backgroundColor: "#fff",
                  borderBottom: "2px solid #e9ecef",
                }}
              >
                <Modal.Title className="fw-bold d-flex align-items-center">
                  <FaExclamationCircle className="me-2 text-warning" />
                  <span>Confirm Booking</span>
                </Modal.Title>
              </Modal.Header>
              <Modal.Body style={{ padding: "1.5rem" }}>
                <div className="text-center">
                  <p className="fs-5 mb-3">
                    Are you sure you want to confirm the booking?
                  </p>
                  {bookingToConfirm && (
                    <div className="text-muted small mb-3">
                      <div>
                        <strong>Booking Code:</strong>{" "}
                        {bookingToConfirm.bookingCode || "N/A"}
                      </div>
                      <div>
                        <strong>Customer:</strong>{" "}
                        {bookingToConfirm.primaryGuestName || "N/A"}
                      </div>
                      {bookingToConfirm.hotelName && (
                        <div>
                          <strong>Hotel:</strong> {bookingToConfirm.hotelName}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Modal.Body>
              <Modal.Footer
                style={{
                  backgroundColor: "#f8f9fa",
                  borderTop: "1px solid #dee2e6",
                }}
              >
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowConfirmModal(false);
                    setBookingToConfirm(null);
                  }}
                  disabled={confirmingBooking}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={confirmBooking}
                  disabled={confirmingBooking}
                >
                  {confirmingBooking ? (
                    <>
                      <Spinner animation="border" size="sm" className="me-2" />
                      Confirming...
                    </>
                  ) : (
                    "OK"
                  )}
                </Button>
              </Modal.Footer>
            </Modal>

            {/* Confirm Status Modal */}
            <Modal
              show={showConfirmStatusModal}
              onHide={() => {
                if (!updatingConfirmationStatus) {
                  setShowConfirmStatusModal(false);
                  setBookingToUpdateStatus(null);
                  setConfirmAgentLpo("");
                  setConfirmAgentLpoError("");
                }
              }}
              centered
              backdrop="static"
              keyboard={false}
              size="md"
            >
              <Modal.Header
                closeButton={!updatingConfirmationStatus}
                style={{
                  backgroundColor: "#fff",
                  borderBottom: "2px solid #e9ecef",
                }}
              >
                <Modal.Title className="fw-bold d-flex align-items-center">
                  <FaExclamationCircle className="me-2 text-warning" />
                  <span>Confirm Booking Status</span>
                </Modal.Title>
              </Modal.Header>
              <Modal.Body style={{ padding: "1.5rem" }}>
                <div className="text-center">
                  <p className="fs-6 mb-3">
                    Are you sure you want to confirm this booking?
                  </p>
                  {bookingToUpdateStatus && (
                    <div className="text-muted small mb-3">
                      <div>
                        <strong>Booking Code:</strong>{" "}
                        {bookingToUpdateStatus.bookingCode || "N/A"}
                      </div>
                      <div>
                        <strong>Customer:</strong>{" "}
                        {bookingToUpdateStatus.primaryGuestName || "N/A"}
                      </div>
                      {bookingToUpdateStatus.hotelName && (
                        <div>
                          <strong>Hotel:</strong>{" "}
                          {bookingToUpdateStatus.hotelName}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {/* Agent LPO — required before confirming. Backend
                    persists it on the booking's hotel_customer row
                    (column `agent_lpo` already exists there). */}
                <Form.Group controlId="confirmAgentLpoInput" className="text-start">
                  <Form.Label className="fw-semibold mb-1">
                    Agent LPO <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="Enter Agent LPO"
                    value={confirmAgentLpo}
                    onChange={(e) => {
                      setConfirmAgentLpo(e.target.value);
                      if (confirmAgentLpoError && e.target.value.trim()) {
                        setConfirmAgentLpoError("");
                      }
                    }}
                    isInvalid={!!confirmAgentLpoError}
                    disabled={!!updatingConfirmationStatus}
                  />
                  <Form.Control.Feedback type="invalid">
                    {confirmAgentLpoError}
                  </Form.Control.Feedback>
                </Form.Group>
              </Modal.Body>
              <Modal.Footer
                style={{
                  backgroundColor: "#f8f9fa",
                  borderTop: "1px solid #dee2e6",
                }}
              >
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowConfirmStatusModal(false);
                    setBookingToUpdateStatus(null);
                    setConfirmAgentLpo("");
                    setConfirmAgentLpoError("");
                  }}
                  disabled={updatingConfirmationStatus}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={updateConfirmationStatus}
                  disabled={updatingConfirmationStatus}
                >
                  {updatingConfirmationStatus ? (
                    <>
                      <Spinner animation="border" size="sm" className="me-2" />
                      Confirming...
                    </>
                  ) : (
                    "OK"
                  )}
                </Button>
              </Modal.Footer>
            </Modal>

            {/* Cancel Booking Modal */}
            <Modal
              show={showCancelModal}
              onHide={() => {
                if (!cancellingBooking) {
                  setShowCancelModal(false);
                  setBookingToCancel(null);
                  setCancellationReason("");
                }
              }}
              centered
              backdrop="static"
              keyboard={false}
            >
              <Modal.Header
                closeButton={!cancellingBooking}
                style={{
                  backgroundColor: "#fff",
                  borderBottom: "2px solid #e9ecef",
                }}
              >
                <Modal.Title className="fw-bold d-flex align-items-center">
                  <FaExclamationCircle className="me-2 text-danger" />
                  <span>Cancel Booking</span>
                </Modal.Title>
              </Modal.Header>
              <Modal.Body style={{ padding: "1.5rem" }}>
                <div className="text-center">
                  <p className="fs-5 mb-3">
                    Are you sure you want to cancel this booking?
                  </p>
                  {bookingToCancel && (
                    <div className="text-muted small mb-3">
                      <div>
                        <strong>Booking Code:</strong>{" "}
                        {bookingToCancel.bookingCode || "N/A"}
                      </div>
                      <div>
                        <strong>Customer:</strong>{" "}
                        {bookingToCancel.primaryGuestName || "N/A"}
                      </div>
                      {bookingToCancel.hotelName && (
                        <div>
                          <strong>Hotel:</strong> {bookingToCancel.hotelName}
                        </div>
                      )}
                    </div>
                  )}
                  <Form.Group controlId="cancellationReason">
                    <Form.Label className="fw-semibold">
                      Cancellation Reason{" "}
                      <span className="text-muted">(optional)</span>
                    </Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      placeholder="Add a reason for cancellation (optional)"
                      value={cancellationReason}
                      onChange={(e) => setCancellationReason(e.target.value)}
                      disabled={cancellingBooking}
                    />
                  </Form.Group>
                </div>
              </Modal.Body>
              <Modal.Footer
                style={{
                  backgroundColor: "#f8f9fa",
                  borderTop: "1px solid #dee2e6",
                }}
              >
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowCancelModal(false);
                    setBookingToCancel(null);
                    setCancellationReason("");
                  }}
                  disabled={cancellingBooking}
                >
                  No
                </Button>
                <Button
                  variant="danger"
                  onClick={cancelBooking}
                  disabled={cancellingBooking}
                >
                  {cancellingBooking ? (
                    <>
                      <Spinner animation="border" size="sm" className="me-2" />
                      Cancelling...
                    </>
                  ) : (
                    "Yes, Cancel"
                  )}
                </Button>
              </Modal.Footer>
            </Modal>
          </Container>
        </main>
      </div>
    </div>
  );
};

export default HotelBookingList;
