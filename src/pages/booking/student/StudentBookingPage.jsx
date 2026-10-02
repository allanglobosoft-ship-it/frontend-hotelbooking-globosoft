/**
 * StudentBookingPage.jsx
 *
 * Booking page for the student flow. Layout mirrors
 * /hotel-booking-page (HotelBookingPage.jsx) — same Booking Summary
 * card at top, per-room guest accordion, primary guest section,
 * remarks + special requests block, Confirm Booking button +
 * confirmation modal.
 *
 * Extra Student Verification block (above guest details):
 *   - Student ID Card Upload (required, jpg/png/pdf)
 *     → POST /api/student-id-upload
 *   - Institution Name (required)
 *   - Student ID Number (required)
 *   - Expiry / Validity Date (required, must be ≥ check-in date)
 *   - Optional Institutional Email (Method 3) + simulated OTP verify
 *
 * After successful submit the booking lands in
 * PENDING_STUDENT_VERIFICATION until an admin Approves/Rejects on
 * the Student Verification screen.
 *
 * Endpoint: POST /api/student-booking/create
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  FaHotel, FaCalendarAlt, FaUsers, FaUtensils,
  FaGraduationCap, FaFileUpload, FaEnvelope, FaCheckCircle, FaArrowLeft,
} from "react-icons/fa";
import {
  Row, Col, Card, Form, Button, Accordion, Badge,
  Modal, Spinner, Alert,
} from "react-bootstrap";
import Sidebar from "../../../components/Sidebar";
import TopBar from "../../../components/TopBar";
import axiosInstance from "../../../components/AxiosInstance";
import { createAmendmentLink } from "../../../utils/amendmentLink";
import toast from "react-hot-toast";
import QuotationPdfCard from "../../../components/quotation/QuotationPdfCard";
import "../../../styles/HotelBookingPage.css";

const SPECIAL_REQUEST_OPTIONS = [
  "Early Check-In", "Non-Smoking Rooms", "High Floor", "VIP Client",
  "Late Check-In", "Inter-connecting rooms", "Low Floor",
  "Room with Bathtub", "Late check-Out", "Smoking Room",
];

// Online-payment gateways — mirrors HotelBookingPage / DayStayBookingPage /
// GovEmployeeBookingPage / SeniorCitizenBookingPage. CCAvenue is the only
// real gateway wired; the dummy /payment/:gateway path is kept as a
// fallback for any future non-CCAvenue entry.
const PAYMENT_GATEWAYS = [
  { id: "ccavenue", name: "CC Avenue", desc: "Cards, UPI, Net Banking" },
];

// Verification-method enum values (mirror the backend column).
const METHOD_UPLOAD = "STUDENT_ID_UPLOAD";
const METHOD_MANUAL = "MANUAL_ADMIN_APPROVAL";
const METHOD_EMAIL  = "INSTITUTIONAL_EMAIL";

// Reverse-geocode browser coordinates to a readable address for the
// Booking History audit trail. Tries OpenStreetMap Nominatim first
// (street-level detail), then BigDataCloud (locality-level, keyless) —
// both free, CORS-enabled endpoints. Returns null when neither responds
// so the caller keeps its IP-derived fallback. Mirrors
// SeniorCitizenBookingPage.
async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1`,
      { headers: { Accept: "application/json" } }
    );
    if (res.ok) {
      const a = (await res.json())?.address || {};
      const parts = [
        a.road,
        a.neighbourhood || a.suburb,
        a.village || a.town || a.city || a.municipality,
        a.state,
        a.postcode,
        a.country,
      ].filter(Boolean);
      const line = parts.filter((p, i) => parts.indexOf(p) === i).join(", ");
      if (line) return line.slice(0, 255); // DB column is VARCHAR(255)
    }
  } catch {
    // fall through to BigDataCloud
  }
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
    );
    if (res.ok) {
      const d = await res.json();
      const parts = [d.locality, d.city, d.principalSubdivision, d.countryName].filter(Boolean);
      const line = parts.filter((p, i) => parts.indexOf(p) === i).join(", ");
      if (line) return line.slice(0, 255);
    }
  } catch {
    // give up — caller keeps the IP-based fallback
  }
  return null;
}

// Coarse IP-derived location ("City, Region, Country") — the fallback used
// when the browser's precise geolocation is blocked, denied or times out.
// ipapi.co is tried first; its free tier answers 429 "RateLimited" quite
// readily, which used to leave the booking with an empty Location, so
// BigDataCloud (the same keyless client endpoint reverseGeocode uses — called
// without coordinates it geolocates by IP) is the backup. Returns null when
// neither answers.
async function fetchIpLocation() {
  const toLine = (parts) => parts.filter(Boolean).join(", ").slice(0, 255) || null;
  try {
    const res = await fetch("https://ipapi.co/json/");
    if (res.ok) {
      const info = await res.json();
      const line = info?.error
        ? null
        : toLine([info.city, info.region, info.country_name]);
      if (line) return line;
    }
  } catch {
    // fall through to BigDataCloud
  }
  try {
    const res = await fetch(
      "https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en"
    );
    if (res.ok) {
      const d = await res.json();
      const line = toLine([d.city || d.locality, d.principalSubdivision, d.countryName]);
      if (line) return line;
    }
  } catch {
    // give up — Location stays empty
  }
  return null;
}

// Compact date label used by the right-column Booking Summary —
// mirrors the helper /gov-employee-booking-page uses so the two
// dedicated-flow booking pages render dates identically.
const formatDateTime = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};

export default function StudentBookingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeUserRole = localStorage.getItem("currentActiveRole");

  const [bookingData, setBookingData] = useState(null);
  const [agentAvailableBalance, setAgentAvailableBalance] = useState(null);
  // Hotel's max cancellation nights — fetched from the backend so the
  // on-screen deadline matches what the booking-create flow stores:
  //   deadline = checkInDate − maxCancellationNights. Mirrors HotelBookingPage.
  const [maxCancellationNights, setMaxCancellationNights] = useState(null);

  // Payment mode — mirrors HotelBookingPage. Default keeps the legacy
  // credit-limit behaviour. Sent on the /api/student-booking/create payload.
  const [paymentMode, setPaymentMode] = useState("CREDITLIMIT");

  // ── Payment-gate modals (mirrors HotelBookingPage / GovEmployeeBookingPage) ──
  // When the agent's credit is short at Confirm time:
  //   • Card disabled → "Booking Cannot Be Completed" blocks the booking.
  //   • Card enabled  → "Online Payment Required" → gateway picker.
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [showGatewayModal, setShowGatewayModal] = useState(false);
  const [insufficientAmount, setInsufficientAmount] = useState(0);
  const [selectedGateway, setSelectedGateway] = useState("");
  const [showNoPaymentPathModal, setShowNoPaymentPathModal] = useState(false);
  // Non-dismissable overlay shown between "CC Avenue payment succeeded"
  // and "booking created server-side" — mirrors HotelBookingPage /
  // DayStayBookingPage / GovEmployeeBookingPage / SeniorCitizenBookingPage.
  // Pairs with the beforeunload guard.
  const [isFinalizingPayment, setIsFinalizingPayment] = useState(false);
  // Per-agent "Card" payment-mode gate, toggled from AgentView. Also
  // filters the Card option out of the Payment Mode dropdown.
  const [agentCardPaymentEnabled, setAgentCardPaymentEnabled] = useState(false);

  // Booking-confirmation choice (Voucher Now / Voucher Later) — only shown
  // for refundable Available rates inside the cancellation window.
  const [bookingConfirmation, setBookingConfirmation] = useState("Book & Voucher");

  // Rooms (guest details per adult/child)
  const [rooms, setRooms] = useState([]);

  // ── Lead passenger marker — { roomIdx, guestIdx } pointing at the
  //    single guest the user has flagged as Lead. Mirrors the
  //    gov-employee booking page UX. Defaults to the very first guest
  //    (room 0, guest 0) so the column always has one selection on
  //    first render. Children can't be Lead. Each guest's `isLead`
  //    flag is added to the submitted `rooms[].guests` payload — the
  //    backend ignores unknown fields, so single-room / legacy flows
  //    are unaffected.
  const [leadIndex, setLeadIndex] = useState({ roomIdx: 0, guestIdx: 0 });

  const handleLeadSelect = (roomIdx, guestIdx) => {
    // Skip selection if the target is a child — the radio is already
    // disabled in the UI, this is a defensive guard.
    const g = rooms?.[roomIdx]?.guests?.[guestIdx];
    if (g?.isChild) return;
    setLeadIndex({ roomIdx, guestIdx });
  };

  // Primary guest
  const [primaryGuest, setPrimaryGuest] = useState({
    salutation: "", firstName: "", middleName: "", lastName: "",
    email: "", phone: "", passportNo: "", agentLpo: "",
  });

  const [remarks, setRemarks] = useState("");
  const [specialRequests, setSpecialRequests] = useState([]);
  // "Booking Done By Employee" was moved to StudentSearch — the chosen
  // employeeId arrives on bookingData.payload.employeeId.

  // ── Student verification state ─────────────────────────────────
  // Default to Method 1 (Student ID Upload) — Primary Method.
  const [verificationMethod, setVerificationMethod] = useState(METHOD_UPLOAD);
  const [studentName, setStudentName] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [studentIdNumber, setStudentIdNumber] = useState("");
  const [studentIdExpiry, setStudentIdExpiry] = useState("");
  const [idFile, setIdFile] = useState(null);
  const [uploadedFilePath, setUploadedFilePath] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [uploading, setUploading] = useState(false);

  // ── Method 3 — optional institutional email + OTP ──────────────
  const [institutionalEmail, setInstitutionalEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpInput, setOtpInput] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);

  // ── Submission state ───────────────────────────────────────────
  const [validationErrors, setValidationErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingPayload, setPendingPayload] = useState(null);
  // Pre-confirmation Policies & Terms gate — mirrors the hotel / long-stay
  // flow: Confirm Booking opens this modal; Proceed (after accepting) opens
  // the booking summary modal.
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("studentBookingData");
    if (!stored) return;
    const parsed = JSON.parse(stored);
    setBookingData(parsed);
    const payloadRooms = parsed?.payload?.rooms || [];
    setRooms(payloadRooms.map((room) => ({
      ...room,
      guests: Array.from(
        { length: (room.adults || 0) + (room.children || 0) },
        (_, i) => ({
          salutation: "", firstName: "", middleName: "", lastName: "",
          gender: "", isChild: i >= (room.adults || 0),
        })
      ),
    })));
  }, []);

  // Employee fetch removed — "Booking Done By Employee" is selected in
  // StudentSearch and arrives on bookingData.payload.employeeId.

  // Client location snapshot for the booking-history audit trail, resolved
  // once on page load and sent on the create payload:
  //   • Location — browser geolocation (GPS/WiFi) reverse-geocoded to a
  //     precise readable address; the coarse IP-derived city is only the
  //     fallback when the permission is denied or the lookup times out.
  // The IP Address column is NOT resolved here — browsers can only see the
  // shared public/NAT IP, so the backend stamps each system's unique IPv4
  // from the create request itself. Mirrors SeniorCitizenBookingPage.
  const [clientNetwork, setClientNetwork] = useState({
    bookingLocation: null,
  });
  useEffect(() => {
    let cancelled = false;

    fetchIpLocation().then((ipLocation) => {
      if (cancelled || !ipLocation) return;
      setClientNetwork((prev) => ({
        // Never clobber a precise geolocation result that already landed.
        bookingLocation: prev.bookingLocation || ipLocation,
      }));
    });

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
          const precise = await reverseGeocode(coords.latitude, coords.longitude);
          if (!cancelled && precise) {
            setClientNetwork({ bookingLocation: precise });
          }
        },
        () => {}, // denied / unavailable — keep the IP-derived fallback
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
      );
    }

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const aId = bookingData?.payload?.agentId;
    if (!aId) { setAgentAvailableBalance(null); return; }
    let cancelled = false;
    axiosInstance.get(`/api/agent-credit-limit/agent/${aId}`)
      .then((res) => { if (!cancelled) setAgentAvailableBalance(res?.data?.availableCreditLimit ?? null); })
      .catch(() => { if (!cancelled) setAgentAvailableBalance(null); });
    return () => { cancelled = true; };
  }, [bookingData]);

  // ── Agent card-payment flag — same gate as HotelBookingPage. Drives
  //    the Card option in the Payment Mode dropdown and the
  //    no-payment-path block when credit is short. Fail-safe default:
  //    card DISABLED.
  useEffect(() => {
    const aId = bookingData?.payload?.agentId;
    if (!aId) {
      setAgentCardPaymentEnabled(false);
      return;
    }
    let cancelled = false;
    axiosInstance
      .get(`/api/agent/${aId}`)
      .then((res) => {
        if (!cancelled) {
          setAgentCardPaymentEnabled(!!res?.data?.cardPaymentEnabled);
        }
      })
      .catch(() => {
        if (!cancelled) setAgentCardPaymentEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookingData]);

  // ── Payment-mode scenario derivation (mirrors HotelBookingPage) ────────
  const bookingSellingPrice = useMemo(() => {
    if (!bookingData) return 0;
    const { selectedRate, roomBreakdown, payload } = bookingData;
    if (roomBreakdown?.length) {
      return roomBreakdown.reduce((s, r) => s + Number(r.rate || 0), 0);
    }
    return (
      Number(selectedRate?.rate || 0) * (payload?.rooms?.length || 1)
    );
  }, [bookingData]);

  const hasSufficientCredit = useMemo(() => {
    if (agentAvailableBalance == null) return null;
    return Number(agentAvailableBalance) >= bookingSellingPrice;
  }, [agentAvailableBalance, bookingSellingPrice]);

  const noPaymentPathAvailable =
    hasSufficientCredit === false && !agentCardPaymentEnabled;

  const paymentModeOptions = useMemo(() => {
    if (hasSufficientCredit === true) {
      return [{ value: "CREDITLIMIT", label: "Credit Limit" }];
    }
    if (hasSufficientCredit === false && agentCardPaymentEnabled) {
      return [{ value: "CARD", label: "Card" }];
    }
    if (hasSufficientCredit === false && !agentCardPaymentEnabled) {
      return [];
    }
    return [{ value: "CREDITLIMIT", label: "Credit Limit" }];
  }, [hasSufficientCredit, agentCardPaymentEnabled]);

  useEffect(() => {
    if (paymentModeOptions.length === 0) return;
    if (!paymentModeOptions.some((o) => o.value === paymentMode)) {
      setPaymentMode(paymentModeOptions[0].value);
    }
  }, [paymentModeOptions, paymentMode]);

  // Post-payment resume — mirrors HotelBookingPage. DummyPaymentPage
  // returns us here with location.state.resumeCreate = true after the
  // dummy card charge succeeds. React state (rooms / pendingPayload)
  // is lost across the /payment detour, so we rebuild the create call
  // purely from the payload we persisted to sessionStorage under
  // "studentPendingCreatePayload" just before navigating away. On
  // success we go to the Student Booking List; the row surfaces on
  // whichever status the backend engine assigns (typically
  // RECONFIRMED for online-payment bookings).
  //
  // Guards:
  //   • The flag is stripped from history immediately so a reload /
  //     back doesn't re-fire the create.
  //   • sessionStorage is cleared right after read so a stray landing
  //     on this URL with a stale flag can't replay an old payload.
  //   • The credit-check step in confirmBooking() is skipped here — the
  //     operator has already paid via the gateway.
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const ccavenueOrderId = searchParams.get("ccavenueOrderId");
    const ccavenueStatus = searchParams.get("ccavenueStatus");

    const resumeFromState = !!location.state?.resumeCreate;
    const resumeFromCCAvenue = !!ccavenueOrderId;
    if (!resumeFromState && !resumeFromCCAvenue) return;

    navigate(location.pathname, { replace: true, state: {} });

    const readPendingPayload = () => {
      const stored = sessionStorage.getItem("studentPendingCreatePayload");
      sessionStorage.removeItem("studentPendingCreatePayload");
      if (!stored) return null;
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error("Malformed persisted student create payload", e);
        return null;
      }
    };

    // Dummy-gateway (local /payment/:gateway) path only. Real CC Avenue
    // uses finalizeAfterCCAvenue below.
    const finalizeDummyCreate = async (payload) => {
      try {
        setIsSubmitting(true);
        const { data } = await axiosInstance.post(
          "/api/student-booking/create",
          payload,
        );
        if (data?.success) {
          toast.success(
            data.message ||
              `Booking ${data.bookingCode || ""} created after payment.`,
          );
          setShowConfirmModal(false);
          navigate("/booking-details/student-booking-list");
        } else {
          toast.error(data?.message || "Booking submission failed. Please try again.");
        }
      } catch (err) {
        const beMsg =
          err?.response?.data?.message || err?.response?.data?.error || null;
        console.error("Error finalising student booking after payment:", err);
        toast.error(beMsg || "Booking submission failed. Please try again.");
      } finally {
        setIsSubmitting(false);
      }
    };

    // Real CC Avenue path — the backend owns the payload and the create
    // call. Idempotent.
    const finalizeAfterCCAvenue = async () => {
      try {
        setIsFinalizingPayment(true);
        setIsSubmitting(true);
        const { data } = await axiosInstance.post(
          `/api/payment/ccavenue/finalize-student/${ccavenueOrderId}`,
        );
        if (data?.success) {
          toast.success(
            data.message ||
              `Booking ${data.bookingCode || ""} created after payment.`,
          );
          setShowConfirmModal(false);
          navigate("/booking-details/student-booking-list");
        } else {
          toast.error(
            data?.message ||
              "Payment succeeded but booking could not be created. Please contact support with your payment reference.",
          );
        }
      } catch (err) {
        const beMsg =
          err?.response?.data?.message || err?.response?.data?.error || null;
        console.error("Post-payment student finalize failed:", err);
        toast.error(
          beMsg ||
            "Payment succeeded but booking could not be created. Please contact support with your payment reference.",
        );
      } finally {
        setIsSubmitting(false);
        setIsFinalizingPayment(false);
      }
    };

    if (resumeFromState) {
      const payload = readPendingPayload();
      if (!payload) return;
      finalizeDummyCreate(payload);
      return;
    }

    (async () => {
      if (ccavenueStatus !== "success") {
        toast.error("Payment was not completed. Please try again.");
        return;
      }
      try {
        const statusResponse = await axiosInstance.get(
          `/api/payment/ccavenue/status/${ccavenueOrderId}`,
        );
        if (statusResponse.data?.status !== "SUCCESS") {
          toast.error(
            statusResponse.data?.statusMessage ||
              "Payment was not successful. Please try again.",
          );
          return;
        }
      } catch (err) {
        console.error("Could not verify CC Avenue payment status:", err);
        toast.error(
          "Could not verify payment status. Please contact support if you were charged.",
        );
        return;
      }
      finalizeAfterCCAvenue();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.resumeCreate, location.search]);

  // Warn on close / navigate-away while the paid-for booking is still
  // being created server-side. Only attached during that window.
  useEffect(() => {
    if (!isFinalizingPayment) return;
    const beforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [isFinalizingPayment]);

  // Fetch the hotel's max cancellation nights so the deadline is computed
  // the same way HotelBookingPage does (deadline = checkIn − nights). The
  // student hotelId may carry a supplier prefix ("IN11"), so strip non-digits.
  useEffect(() => {
    const raw = bookingData?.selectedRate?.hotelId;
    const hotelId = raw != null ? String(raw).replace(/\D/g, "") : "";
    // Default to 0 nights when we can't resolve the hotel — a 0-night deadline
    // = "cancel until check-in", which keeps the Voucher Now / Voucher Later
    // choice visible for refundable Available rates instead of hiding it.
    if (!hotelId) { setMaxCancellationNights(0); return; }
    let cancelled = false;
    axiosInstance
      .get(`/api/hotels/${hotelId}/max-cancellation-nights`)
      .then((res) => {
        if (!cancelled) {
          const n = Number(res?.data);
          setMaxCancellationNights(Number.isFinite(n) ? n : 0);
        }
      })
      // On error, fall back to 0 (not null) so the deadline still computes and
      // the booking-flow choice stays available.
      .catch(() => { if (!cancelled) setMaxCancellationNights(0); });
    return () => { cancelled = true; };
  }, [bookingData]);

  // ────────────────────────────────────────────────────────────────
  // Core booking-flow derivation — ported from HotelBookingPage.jsx.
  //   • WITHIN DEADLINE  — Available → RECONFIRMED, On-Request → REQUESTED
  //   • OUTSIDE DEADLINE — Available + "Voucher Now"  → RECONFIRMED
  //                        Available + "Voucher Later" → CONFIRMED
  //   • Non-refundable rates always resolve to RECONFIRMED.
  // (No pending / admin-approval step — the student booking confirms
  //  straight away, exactly like the hotel flow.)
  // ────────────────────────────────────────────────────────────────
  const cancellationDeadline = (() => {
    if (maxCancellationNights == null) return null;
    const cinRaw = bookingData?.payload?.checkInDate;
    if (!cinRaw) return null;
    const cin = new Date(cinRaw);
    if (Number.isNaN(cin.getTime())) return null;
    const deadline = new Date(cin);
    deadline.setDate(deadline.getDate() - maxCancellationNights);
    deadline.setHours(0, 0, 0, 0);
    return deadline;
  })();

  const isOutsideDeadline = (() => {
    if (!cancellationDeadline) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today > cancellationDeadline;
  })();

  const isOnRequestRate =
    bookingData?.selectedRate?.roomStatus === "On Request";
  const isNonRefundableRate =
    bookingData?.selectedRate?.nonRefundable === true ||
    bookingData?.selectedRate?.nonRefundable === "true";

  // Show the Voucher Now / Voucher Later choice only for refundable
  // Available rates that still have free-cancellation time left.
  const showVoucherChoice =
    !isOnRequestRate &&
    !isNonRefundableRate &&
    !!cancellationDeadline &&
    !isOutsideDeadline;

  // Resolved status sent on payload.bookingFlowStatus.
  const resolvedBookingFlowStatus = (() => {
    if (isOnRequestRate) return "REQUESTED";
    if (isNonRefundableRate) return "RECONFIRMED";
    if (isOutsideDeadline) return "RECONFIRMED";
    return bookingConfirmation === "Book Now & Voucher later"
      ? "CONFIRMED"
      : "RECONFIRMED";
  })();

  // Reset the voucher choice whenever it no longer applies, so a stale
  // "Voucher Later" pick can't leak into the payload.
  useEffect(() => {
    if (!bookingData?.selectedRate) return;
    if (!showVoucherChoice && bookingConfirmation !== "Book & Voucher") {
      setBookingConfirmation("Book & Voucher");
    }
  }, [bookingData, bookingConfirmation, showVoucherChoice]);

  // ── Handlers ───────────────────────────────────────────────────
  const handleGuestChange = (ri, gi, field, value) => {
    setRooms((prev) => {
      const next = [...prev];
      next[ri].guests[gi][field] = value;
      return next;
    });
    if (ri === 0 && gi === 0 && ["salutation", "firstName", "lastName"].includes(field)) {
      setPrimaryGuest((p) => ({ ...p, [field]: value }));
    }
  };
  const handlePrimaryGuestChange = (field, value) => {
    setPrimaryGuest((p) => ({ ...p, [field]: value }));
    if (validationErrors[field]) {
      setValidationErrors((e) => { const n = { ...e }; delete n[field]; return n; });
    }
  };
  const toggleSpecialRequest = (req) => {
    setSpecialRequests((prev) =>
      prev.includes(req) ? prev.filter((r) => r !== req) : [...prev, req]
    );
  };

  // ── Student ID upload ──────────────────────────────────────────
  const onFileChange = (e) => {
    setIdFile(e.target.files?.[0] || null);
    setUploadedFilePath("");
    setUploadedFileName("");
  };
  const handleUpload = async () => {
    if (!idFile) { toast.error("Please choose a file first"); return; }
    // Quick client-side size guard (5 MB) so we don't waste a round-trip
    if (idFile.size > 5 * 1024 * 1024) {
      toast.error("File too large (max 5 MB)");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", idFile);
      const { data } = await axiosInstance.post("/api/student-id-upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (data?.success) {
        setUploadedFilePath(data.filePath);
        setUploadedFileName(data.fileName);
        toast.success("Student ID uploaded");
      } else {
        toast.error(data?.message || "Upload failed");
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || "Upload failed");
    } finally { setUploading(false); }
  };

  // ── Method 3 — simulated institutional email OTP ───────────────
  // (No real mail server is wired up — this is a UI-only stub that
  // accepts any 6-digit code so the team can demo the flow.)
  const handleSendOtp = () => {
    if (!institutionalEmail.trim() || !/.+@.+\..+/.test(institutionalEmail)) {
      toast.error("Enter a valid institutional email");
      return;
    }
    setOtpSent(true);
    toast.success("OTP sent (demo: enter any 6-digit code)");
  };
  const handleVerifyOtp = () => {
    if ((otpInput || "").length === 6) {
      setEmailVerified(true);
      toast.success("Email verified");
    } else {
      toast.error("OTP must be 6 digits");
    }
  };

  // ── Validation specific to the student step ────────────────────
  // Common fields the admin always needs to see (institution + ID
  // number + expiry); the file / email requirement is method-specific.
  const isCommonStudentInfoReady = () =>
    institutionName.trim().length > 0 &&
    studentIdNumber.trim().length > 0 &&
    !!studentIdExpiry &&
    !isExpiryBeforeCheckIn();

  const isStudentInfoReady = () => {
    if (!isCommonStudentInfoReady()) return false;
    if (verificationMethod === METHOD_UPLOAD) return !!uploadedFilePath;
    if (verificationMethod === METHOD_MANUAL) return true;       // admin verifies offline
    if (verificationMethod === METHOD_EMAIL)  return emailVerified;
    return false;
  };

  const isExpiryBeforeCheckIn = () => {
    if (!studentIdExpiry || !bookingData?.payload?.checkInDate) return false;
    return new Date(studentIdExpiry) < new Date(bookingData.payload.checkInDate);
  };

  // Display currency carried from the search/room-list (rates are AED; this
  // converts them for display only — the create payload stays AED). AED → 1.
  const formatPrice = (price) => {
    const cur = bookingData?.searchCtx?.currency || { code: "AED", factor: 1 };
    const code = cur.code || "AED";
    const factor = Number(cur.factor) > 0 ? Number(cur.factor) : 1;
    return `${code} ${((Number(price) || 0) * factor).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  // ── Form validation (mirrors HotelBookingPage) ────────────────
  const validateForm = () => {
    const errors = {};
    // Primary-guest validation removed — the Primary Guest Details
    // card has been hidden (the Guest Details grid above is the
    // single source of customer details, with the Lead radio marking
    // the head guest). The submit payload derives primaryGuest from
    // the lead row at build time.
    rooms.forEach((room, ri) => {
      room.guests.forEach((g, gi) => {
        const k = `room_${ri}_guest_${gi}`;
        if (!g.salutation) errors[`${k}_salutation`] = "Required";
        if (!g.firstName) errors[`${k}_firstName`] = "Required";
        if (!g.lastName) errors[`${k}_lastName`] = "Required";
       
      });
    });
    return { errors, hasErrors: Object.keys(errors).length > 0 };
  };

  // ── Build payload + show confirmation ─────────────────────────
  const handleSubmit = (e) => {
    e?.preventDefault?.();
    // Scenario 3 guard — no viable payment path (no credit AND Card
    // disabled). Blocks a form-submit via Enter key from bypassing the
    // disabled Confirm Booking button.
    if (noPaymentPathAvailable) {
      toast.error(
        "Booking cannot be completed — no payment method available for this agent.",
      );
      return;
    }
    if (!isStudentInfoReady()) {
      toast.error("Complete the student verification fields first");
      return;
    }
    const { errors, hasErrors } = validateForm();
    if (hasErrors) {
      setValidationErrors(errors);
      toast.error("Please complete the highlighted fields");
      return;
    }
    setValidationErrors({});

    const { selectedRate, hotelStaticData, payload, activePromotion, searchCtx } = bookingData;

    // Nights
    const ci = new Date(payload.checkInDate);
    const co = new Date(payload.checkOutDate);
    const nights = Math.max(1, Math.round((co - ci) / 86400000));

    // deadlineDate = checkInDate − maxCancellationNights, at midnight — the
    // same value the backend stores and the Booking List shows. Null until
    // the hotel's maxCancellationNights resolves.
    const deadlineDateStr = cancellationDeadline
      ? `${cancellationDeadline.getFullYear()}-${String(
          cancellationDeadline.getMonth() + 1,
        ).padStart(2, "0")}-${String(cancellationDeadline.getDate()).padStart(
          2,
          "0",
        )}T00:00:00`
      : null;

    // Multi-room aware: when StudentRoomList sent a per-room
    // `roomBreakdown` array (one entry per booked room), each room
    // pulls its OWN roomCategory / mealPlan / rate / etc. from that
    // slot. Without `roomBreakdown` (every legacy single-room flow),
    // `slot` falls back to the combined `selectedRate` and behaves
    // exactly as before — so no other flow is affected.
    const allRooms = (rooms || []).map((room, idx) => {
      const slot = bookingData.roomBreakdown?.[idx] || selectedRate;
      return {
        roomNo: idx + 1,
        roomCategory: slot.roomCategory,
        mealPlan: slot.mealPlan,
        nonRefundable: !!slot.nonRefundable,
        rate: Number(slot.rate || 0),
        rateBeforeDiscount: Number(slot.rateBeforeDiscount || slot.rate || 0),
        rateWithoutMarkup: Number(slot.rate || 0),
        adults: room.adults,
        children: room.children,
        childAges: room.childAges || [],
        currency: slot.currency || "AED",
        guests: (room.guests || []).map((g, gi) => ({
          salutation: g.salutation, firstName: g.firstName, lastName: g.lastName,
          gender: g.gender, isChild: !!g.isChild,
          // Lead flag mirrors /gov-employee-booking-page. Backend
          // ignores unknown fields, so adding this stays backward-
          // compatible with the existing /api/student-booking/create
          // contract.
          isLead: idx === leadIndex.roomIdx && gi === leadIndex.guestIdx,
        })),
      };
    });

    // Primary guest is now derived from the Lead-marked passenger in
    // the Guest Details grid (the Primary Guest Details card is
    // hidden). The contact fields the old card collected
    // (email / phone / passportNo / agentLpo) aren't captured on the
    // form any more, so they're left empty — the backend ignores
    // missing optional values, and the existing
    // /api/student-booking/create contract is preserved.
    const leadGuest =
      rooms[leadIndex.roomIdx]?.guests[leadIndex.guestIdx] || {};
    const derivedPrimaryGuest = {
      salutation: leadGuest.salutation || "",
      firstName: leadGuest.firstName || "",
      middleName: leadGuest.middleName || "",
      lastName: leadGuest.lastName || "",
      email: "",
      phone: "",
      passportNo: "",
      agentLpo: "",
      nativeCountry: "",
    };

    const built = {
      agentId: String(payload.agentId || searchCtx?.agentId || ""),
      apiId: String(payload.apiId || searchCtx?.apiId || 1),
      hotelId: String(selectedRate.hotelId || searchCtx?.hotelCode || ""),
      hotelName: hotelStaticData.hotelName,
      address: hotelStaticData.address,
      starRating: hotelStaticData.starRating,
      checkInDate: payload.checkInDate,
      checkOutDate: payload.checkOutDate,
      nights,
      // Core booking-flow fields (mirror HotelBookingPage). The backend
      // maps bookingFlowStatus → confirmationStatus directly (no admin
      // approval step). deadlineDate is what the Booking List shows.
      deadlineDate: deadlineDateStr,
      roomStatus: selectedRate.roomStatus || null,
      bookingFlowStatus: resolvedBookingFlowStatus,
      // "Add New Item" flow — when this booking was started from an existing
      // booking's ADD NEW ITEM button, the parent code threads through here so
      // the backend saves it as a child (STU7/1, STU7/2, …).
      parentBookingCode: bookingData?.payload?.parentBookingCode || null,
      isOutsideDeadline,
      isBookandVoucher:
        selectedRate.roomStatus === "Available"
          ? bookingConfirmation === "Book & Voucher"
          : false,
      bookingConfirmation: bookingConfirmation || "Book & Voucher",
      // Payment mode chosen below the Special Requests block.
      paymentMode,
      primaryGuest: derivedPrimaryGuest,
      rooms: allRooms,
      remarks,
      specialRequests,
      source: "WEB",
      createdByRole: activeUserRole || "agent",
      // Location column in the detail view's Booking History. The IP
      // Address column is stamped server-side from the create request
      // (each system's own IPv4), so it is not sent here.
      bookingLocation: clientNetwork.bookingLocation,
      // Student verification — the method drives which extra
      // fields are sent to the backend.
      verificationMethod,
      studentName:
        studentName.trim()
        || `${derivedPrimaryGuest.firstName} ${derivedPrimaryGuest.lastName}`.trim(),
      institutionName: institutionName.trim(),
      studentIdNumber: studentIdNumber.trim(),
      studentIdExpiry,
      // Only carry the upload path when Method 1 is chosen.
      studentIdFilePath: verificationMethod === METHOD_UPLOAD ? uploadedFilePath : null,
      studentIdFileName: verificationMethod === METHOD_UPLOAD ? uploadedFileName : null,
      // Only carry the email + OTP-verified flag when Method 3 is chosen.
      institutionalEmail: verificationMethod === METHOD_EMAIL ? (institutionalEmail.trim() || null) : null,
      emailVerified: verificationMethod === METHOD_EMAIL ? emailVerified : false,
      // Discount snapshot (server re-applies)
      discountPercent: activePromotion?.discountPercent ?? null,
      discountAmount: activePromotion?.discountAmount ?? null,
      totalRateBeforeDiscount: allRooms.reduce((s, r) => s + Number(r.rateBeforeDiscount || 0), 0),
      // employeeId is picked in StudentSearch and rides on bookingData.payload.
      employeeId: bookingData?.payload?.employeeId || null,
      // Display currency chosen on the search page. `displayCurrencyRate` is
      // the AED→target factor; the total stays AED and the backend stores the
      // code + converted amount. AED → factor 1.
      displayCurrencyCode: bookingData?.searchCtx?.currency?.code || "AED",
      displayCurrencyRate:
        Number(bookingData?.searchCtx?.currency?.factor) > 0
          ? Number(bookingData.searchCtx.currency.factor)
          : 1,
    };
    setPendingPayload(built);
    // Gate the booking summary behind the Policies & Terms modal.
    setPolicyAccepted(false);
    setShowPolicyModal(true);
  };

  const confirmBooking = async () => {
    if (!pendingPayload) return;
    setIsSubmitting(true);
    try {
      // ── Payment-gate pre-check (mirrors HotelBookingPage.confirmBooking) ──
      // Ask the BE whether the agent has enough credit for the (discounted)
      // total the create endpoint will debit. When credit is short:
      //   • On Request room OR Book Now & Voucher Later → proceed with the
      //     create call (payment-gate matrix: these flows always book; the
      //     BE skips their create-time debit and settles at Reconfirm).
      //   • Everything else → close the Order Summary modal, then:
      //       – Card disabled at the agent level → no viable payment path;
      //         block with the "Booking Cannot Be Completed" modal.
      //       – Card enabled → "Online Payment Required" → gateway picker.
      // The check itself fails OPEN (credit endpoint error → proceed; the
      // BE keeps its own check-and-reject backstop) so the operator is
      // never trapped by a flaky pre-check.
      const agentId = pendingPayload.agentId;
      const requiredAmount = (pendingPayload.rooms || []).reduce(
        (sum, r) => sum + (Number(r.rate) || 0),
        0,
      );
      if (agentId && requiredAmount > 0) {
        try {
          const creditRes = await axiosInstance.get(
            `/api/agent-credit-limit/check-sufficient-credit?agentId=${agentId}&requiredAmount=${requiredAmount}`,
          );
          if (creditRes.data === false) {
            const isVoucherLater =
              bookingConfirmation === "Book Now & Voucher later";
            const bypassPaymentModal = isVoucherLater || isOnRequestRate;
            if (!bypassPaymentModal) {
              setInsufficientAmount(requiredAmount);
              setShowConfirmModal(false);
              if (!agentCardPaymentEnabled) {
                setShowNoPaymentPathModal(true);
                return;
              }
              setShowInsufficientModal(true);
              return;
            }
            console.log(
              isOnRequestRate
                ? "[STUDENT] Insufficient credit but On Request rate — proceeding with create."
                : "[STUDENT] Insufficient credit but Voucher Later selected — proceeding with create; credit deducted at Reconfirm.",
            );
          }
        } catch (e) {
          /* non-fatal — backend create still enforces the credit check */
        }
      }

      const { data } = await axiosInstance.post("/api/student-booking/create", pendingPayload);
      if (data?.success) {
        setShowConfirmModal(false);
        toast.success(`Booking ${data.bookingCode} created successfully`);
        // "Add New Item" amendment flow: when launched from a hotel booking's
        // ADD NEW ITEM, link this child to that parent and return to the parent
        // detail page. Otherwise keep the normal list redirect. Create call
        // above is unchanged.
        if (pendingPayload.parentBookingCode) {
          const parentId = await createAmendmentLink({
            parentBookingCode: pendingPayload.parentBookingCode,
            childType: "STUDENT",
            childTypeLabel: "Student",
            childBookingId: data.bookingId,
            childBookingCode: data.bookingCode,
            childDetailRoutePrefix: "/booking-details/student-booking/",
            childReferenceNumber: data.referenceNumber || data.bookingCode,
            childStatus: data.confirmationStatus || data.status || "Confirmed",
            childHotelName: pendingPayload.hotelName,
            childCheckInDate: pendingPayload.checkInDate,
            childCheckOutDate: pendingPayload.checkOutDate,
            childTotalRate: pendingPayload.totalRateBeforeDiscount,
            childGuestName: `${pendingPayload.primaryGuest?.firstName || ""} ${
              pendingPayload.primaryGuest?.lastName || ""
            }`.trim(),
          });
          if (parentId) {
            navigate(`/booking-details/hotel-booking/${parentId}`);
            return;
          }
        }
        navigate("/booking-details/student-booking-list");
      } else {
        toast.error(data?.message || "Booking failed");
      }
    } catch (e) {
      console.error("[student] booking failed:", e);
      toast.error(e?.response?.data?.message || "Booking failed");
    } finally { setIsSubmitting(false); }
  };

  if (!bookingData) {
    return (
      <div className="min-vh-100 bg-light d-flex flex-column">
        <TopBar />
        <div className="d-flex flex-grow-1">
          <Sidebar />
          <main className="flex-grow-1 d-flex justify-content-center align-items-center">
            <div className="text-muted">Loading booking data…</div>
          </main>
        </div>
      </div>
    );
  }

  const { hotelStaticData, payload, selectedRate, activePromotion } = bookingData;
  // Multi-room aware: when `roomBreakdown` is present the combined
  // `selectedRate.rate` is ALREADY the sum across rooms; multiplying
  // again by `rooms.length` would double-count. Sum per-room values
  // directly instead. Legacy single-room flows keep
  // `selectedRate.X × rooms.length`, which equals `selectedRate.X`
  // when there is one room.
  const totalBefore = bookingData.roomBreakdown?.length
    ? bookingData.roomBreakdown.reduce(
        (s, r) => s + Number(r.rateBeforeDiscount || r.rate || 0),
        0,
      )
    : Number(selectedRate.rateBeforeDiscount || 0) * (rooms.length || 1);
  const totalAfter = bookingData.roomBreakdown?.length
    ? bookingData.roomBreakdown.reduce((s, r) => s + Number(r.rate || 0), 0)
    : Number(selectedRate.rate || 0) * (rooms.length || 1);

  // ── Quotation PDF ─────────────────────────────────────────────────────
  // Quotes what this page shows: the Booking Summary and Price Details in
  // the display currency (like formatPrice). When the Student discount
  // applies, rooms are listed at the Standard Total with a discount line,
  // so the lines add up to the New Total the page shows.
  const buildStudentQuotationPayload = () => {
    if (!selectedRate || !hotelStaticData || !payload) return null;
    const cur = bookingData?.searchCtx?.currency || { code: "AED", factor: 1 };
    const factor = Number(cur.factor) > 0 ? Number(cur.factor) : 1;
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const toDisplay = (aed) => round2((Number(aed) || 0) * factor);
    const ci = new Date(payload.checkInDate);
    const co = new Date(payload.checkOutDate);
    const nights =
      Number.isNaN(ci.getTime()) || Number.isNaN(co.getTime())
        ? null
        : Math.max(1, Math.round((co - ci) / 86400000));
    const nightsText = nights ? `${nights} Night${nights === 1 ? "" : "s"}` : "";
    const searchRooms = Array.isArray(payload.rooms) ? payload.rooms : [];
    const roomCount = rooms.length || 1;
    const describeGuests = (room) => {
      if (!room) return "";
      const adults = Number(room.adults) || 0;
      const children = Number(room.children) || 0;
      return `${adults} Adult${adults === 1 ? "" : "s"}${
        children ? `, ${children} Child${children === 1 ? "" : "ren"}` : ""
      }`;
    };
    const isNonRefundable =
      selectedRate.nonRefundable === true || selectedRate.nonRefundable === "true";
    const discountApplies = !!activePromotion && totalBefore > totalAfter;
    const promoText = activePromotion
      ? `Student Discount${
          activePromotion.discountPercent ? ` ${activePromotion.discountPercent}%` : ""
        }${activePromotion.discountAmount ? ` + ${activePromotion.discountAmount}` : ""}`
      : "";

    const breakdown = Array.isArray(bookingData.roomBreakdown)
      ? bookingData.roomBreakdown
      : [];
    const priceItems = breakdown.length
      ? breakdown.map((slot, i) => ({
          description: `Room ${slot.roomNo ?? i + 1} - ${
            slot.roomCategory || selectedRate.roomCategory || "Room"
          }`,
          details: [
            slot.mealPlan || selectedRate.mealPlan,
            describeGuests(searchRooms[i]),
            nightsText,
          ]
            .filter(Boolean)
            .join(", "),
          amount: toDisplay(
            discountApplies
              ? Number(slot.rateBeforeDiscount || slot.rate || 0)
              : Number(slot.rate || 0),
          ),
        }))
      : [
          {
            description: selectedRate.roomCategory || "Accommodation",
            details: [
              selectedRate.mealPlan,
              `${roomCount} Room${roomCount === 1 ? "" : "s"}`,
              nightsText,
            ]
              .filter(Boolean)
              .join(", "),
            amount: toDisplay(discountApplies ? totalBefore : totalAfter),
          },
        ];
    const totalAmount = toDisplay(totalAfter);
    if (discountApplies) {
      const linesSum = priceItems.reduce((s, item) => s + item.amount, 0);
      priceItems.push({
        description: "Student Discount",
        details: promoText,
        amount: round2(totalAmount - linesSum),
      });
    }

    const lead = rooms?.[leadIndex.roomIdx]?.guests?.[leadIndex.guestIdx];
    const leadNames = [lead?.firstName, lead?.middleName, lead?.lastName]
      .map((p) => (p ? String(p).trim() : ""))
      .filter(Boolean);
    const leadName = leadNames.length
      ? [lead?.salutation ? String(lead.salutation).trim() : "", ...leadNames]
          .filter(Boolean)
          .join(" ")
      : "";

    const cancellationPolicy = [];
    if (isNonRefundable) {
      cancellationPolicy.push("Non-refundable rate.");
    } else if (cancellationDeadline) {
      cancellationPolicy.push(
        `Cancellation deadline: ${cancellationDeadline.toLocaleDateString(
          "en-GB",
          { day: "2-digit", month: "short", year: "numeric" },
        )}.`,
      );
    }

    return {
      bookingType: "STUDENT",
      agentId: Number(payload.agentId || bookingData?.searchCtx?.agentId) || null,
      currency: cur.code || "AED",
      serviceName: hotelStaticData.hotelName || selectedRate.hotelName || "",
      serviceSubtitle: hotelStaticData.address || "",
      customerName: leadName || null,
      details: [
        { label: "Check-in", value: formatDateTime(payload.checkInDate) },
        { label: "Check-out", value: formatDateTime(payload.checkOutDate) },
        { label: "Nights", value: nights ? String(nights) : "" },
        { label: "Rooms", value: String(roomCount) },
        {
          label: "Guests",
          value: searchRooms
            .map((room, i) => `Room ${i + 1}: ${describeGuests(room)}`)
            .join("\n"),
        },
        { label: "Meal Plan", value: selectedRate.mealPlan || "" },
        {
          label: "Star Rating",
          value: hotelStaticData.starRating
            ? `${hotelStaticData.starRating} Star`
            : "",
        },
        { label: "Room Status", value: selectedRate.roomStatus || "Available" },
        {
          label: "Refund Status",
          value:
            selectedRate.nonRefundable !== undefined
              ? isNonRefundable
                ? "Non-Refundable"
                : "Flexible"
              : "",
        },
        { label: "Offer", value: promoText },
      ],
      priceItems,
      totalAmount,
      cancellationPolicy,
    };
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column hotel-booking-container">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-3" style={{ minWidth: 0, overflowX: "clip" }}>
          {/* Layout unified with /gov-employee-booking-page:
                - top bar with Back + Available Balance
                - left main column (lg=8): verification + guest details
                  + special requests + booking done by
                - right sticky column (lg=4): Booking Summary +
                  Price Details + Action bar
              Behavior (verification flow, validation, submit handler,
              modal, payload) is preserved bit-for-bit. */}
          {/* Student route heading — UI only, mirrors the heading shown
              on /new-booking/student once results arrive. */}
          <div className="hs-page-heading">
            <h3 className="hs-page-heading-title">Student</h3>
          </div>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => navigate(-1)}
              className="d-flex align-items-center"
            >
              <FaArrowLeft className="me-2" />
              Back to Room List
            </Button>
            {agentAvailableBalance != null && (
              <span
                className="fw-bold"
                style={{ color: "#dc3545", fontSize: "0.95rem" }}
              >
                Available Balance:{" "}
                {Number(agentAvailableBalance).toFixed(2)}
              </span>
            )}
          </div>

          <Form onSubmit={handleSubmit}>
            <Row>
              {/* ─────────── Left main column ─────────── */}
              <Col lg={8}>
              {/* ── Student Verification block ─────────────────────
                  The user must pick ONE of three verification methods.
                  Institution + ID number + expiry are common to all
                  three (admin always needs to identify the student).
                  The method picked here is saved on the booking row. */}
              <Card className="mb-2 shadow-sm border-0">
                <Card.Header className="bg-primary text-white py-2">
                  <h6 className="mb-0 fw-bold d-flex align-items-center">
                    <FaGraduationCap className="me-2" /> Student Verification
                  </h6>
                </Card.Header>
                <Card.Body className="p-3">
                  {/* <Alert variant="info" className="small mb-3">
                    Choose a verification method. The booking will be saved with status{" "}
                    <strong>PENDING_STUDENT_VERIFICATION</strong> until an admin Approves / Rejects
                    on the Student Verification screen.
                  </Alert> */}

                  {/* Single verification method — Student ID Upload. Shown as
                      a plain heading (no box / radio) since it's the only
                      option. "Manual Admin Approval" and "Institutional Email"
                      were hidden per request; verificationMethod stays
                      METHOD_UPLOAD. */}
                  {/* <div className="mb-3">
                    <h6 className="fw-bold mb-1 d-flex align-items-center">
                      Student ID Upload
                      <Badge bg="primary" className="ms-2">Primary</Badge>
                    </h6>
                    <div className="text-muted small">
                      Upload the Student ID Card (JPG/PNG/PDF).
                    </div>
                  </div> */}

                  {/* ── Common fields (always shown) ──────────────── */}
                  <Row className="g-3">
                    <Col md={4}>
                      <Form.Label>Institution Name *</Form.Label>
                      <Form.Control value={institutionName}
                                    onChange={(e) => setInstitutionName(e.target.value)}
                                    placeholder="e.g. ABC University" />
                    </Col>
                    <Col md={4}>
                      <Form.Label>Student ID Number *</Form.Label>
                      <Form.Control value={studentIdNumber}
                                    onChange={(e) => setStudentIdNumber(e.target.value)}
                                    placeholder="e.g. STU-2026-0042" />
                    </Col>
                    <Col md={4}>
                      <Form.Label>Expiry / Validity Date *</Form.Label>
                      <Form.Control type="date" value={studentIdExpiry}
                                    onChange={(e) => setStudentIdExpiry(e.target.value)} />
                      {isExpiryBeforeCheckIn() && (
                        <small className="text-danger">
                          ID expires before check-in — booking cannot proceed.
                        </small>
                      )}
                    </Col>
                    <Col md={6}>
                      <Form.Label>Student Full Name</Form.Label>
                      <Form.Control value={studentName}
                                    onChange={(e) => setStudentName(e.target.value)}
                                    placeholder="Enter name here" />
                    </Col>
                  </Row>

                  {/* ── Student ID Card Upload ──────────────────────
                      Simple 2-step panel: choose a file, then Upload.
                      The file input shows the chosen name natively and the
                      badge shows whether it's been saved. */}
                  {verificationMethod === METHOD_UPLOAD && (
                    <div className="mt-3 p-3 rounded border" style={{ background: "#f8fbff" }}>
                      <div className="d-flex align-items-center mb-2">
                        <FaFileUpload className="me-2 text-primary" />
                        <h6 className="mb-0 fw-bold">
                          Student ID Card Upload <span className="text-danger">*</span>
                        </h6>
                      </div>

                      <Row className="g-2 align-items-center">
                        <Col md={7}>
                          <Form.Control
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg"
                            onChange={onFileChange}
                            disabled={uploading}
                          />
                        </Col>
                        <Col md={3}>
                          <Button
                            variant={uploadedFilePath ? "outline-success" : "primary"}
                            className="w-100"
                            onClick={handleUpload}
                            disabled={!idFile || uploading}
                          >
                            {uploading ? (
                              <><Spinner size="sm" className="me-1" /> Uploading…</>
                            ) : uploadedFilePath ? (
                              <><FaCheckCircle className="me-1" /> Re-upload</>
                            ) : (
                              <><FaFileUpload className="me-1" /> Upload</>
                            )}
                          </Button>
                        </Col>
                        <Col md={2} className="text-md-center">
                          {uploadedFilePath ? (
                            <Badge bg="success" className="p-2">
                              <FaCheckCircle className="me-1" /> Uploaded
                            </Badge>
                          ) : (
                            <Badge bg="secondary" className="p-2">Pending</Badge>
                          )}
                        </Col>
                      </Row>
                    </div>
                  )}

                  {/* ── Method 2: Manual Admin Approval ─────────── */}
                  {verificationMethod === METHOD_MANUAL && (
                    <Alert variant="success" className="mt-3 mb-0">
                      <strong>Manual Admin Approval selected.</strong> No document upload is required
                      at booking time. The booking will appear in the
                      <em> Student Verification</em> screen as{" "}
                      <Badge bg="warning" text="dark">PENDING_STUDENT_VERIFICATION</Badge>. The admin can
                      <em> Approve</em>, <em>Reject</em> (refunds credit), or
                      <em> Request Re-upload</em>.
                    </Alert>
                  )}

                  {/* ── Method 3: Institutional Email Verification ── */}
                  {verificationMethod === METHOD_EMAIL && (
                    <div className="mt-3 p-3 bg-light rounded">
                      <h6 className="mb-3 d-flex align-items-center">
                        <FaEnvelope className="me-2 text-muted" /> Institutional Email Verification
                      </h6>
                      <Row className="g-3 align-items-end">
                        <Col md={6}>
                          <Form.Label>Email *</Form.Label>
                          <Form.Control type="email" placeholder="name@university.edu"
                                        value={institutionalEmail}
                                        onChange={(e) => { setInstitutionalEmail(e.target.value); setOtpSent(false); setEmailVerified(false); }}
                                        disabled={emailVerified} />
                        </Col>
                        <Col md={3}>
                          {!emailVerified && !otpSent && (
                            <Button variant="outline-secondary" onClick={handleSendOtp}>Send OTP</Button>
                          )}
                          {emailVerified && (
                            <Badge bg="success" className="p-2 d-flex align-items-center">
                              <FaCheckCircle className="me-1" /> Verified
                            </Badge>
                          )}
                        </Col>
                        {otpSent && !emailVerified && (
                          <Col md={12}>
                            <div className="d-flex gap-1">
                              <Form.Control placeholder="6-digit OTP" value={otpInput}
                                            onChange={(e) => setOtpInput(e.target.value)} maxLength={6} />
                              <Button variant="primary" size="sm" onClick={handleVerifyOtp}>Verify</Button>
                            </div>
                          </Col>
                        )}
                      </Row>
                      {!emailVerified && (
                        <div className="text-muted small mt-2">
                          Booking submit is disabled until the email is verified.
                        </div>
                      )}
                    </div>
                  )}
                </Card.Body>
              </Card>

              {/* Guest details — single consolidated card that mirrors
                  /gov-employee-booking-page:
                    - compact left-aligned header (bg-light py-2 + h6)
                    - alwaysOpen accordion so every room stays expanded
                      together instead of one-at-a-time
                    - column headers row (Passenger | Title | First Name
                      | Surname | Gender) above the per-guest rows
                  Field bindings + onChange handlers + validation keys
                  are untouched, so behavior is identical. */}
              <Card className="mb-2 shadow-sm border-0">
                <Card.Header className="bg-light py-2">
                  <h6 className="mb-0 fw-bold text-dark">Guest Details</h6>
                </Card.Header>
                <Card.Body className="p-0">
                  <Accordion defaultActiveKey="0" alwaysOpen>
                    {rooms.map((room, roomIndex) => (
                      <Accordion.Item key={roomIndex} eventKey={String(roomIndex)}>
                        <Accordion.Header>
                          <span className="fw-bold">
                            {/* Per-room label from roomBreakdown when present
                                (multi-room flow); else the combined
                                selectedRate (legacy single-room). Shows room
                                category + meal plan, matching the summary. */}
                            {(() => {
                              const slot =
                                bookingData.roomBreakdown?.[roomIndex] ||
                                selectedRate;
                              const cat = slot.roomCategory || "—";
                              const meal = slot.mealPlan;
                              return `Room ${roomIndex + 1} — ${cat}${
                                meal ? ` · ${meal}` : ""
                              }`;
                            })()}
                          </span>
                        </Accordion.Header>
                        <Accordion.Body className="p-3">
                          {/* Column headers — mirrors the
                              gov-employee booking page so the two
                              dedicated-flow forms look identical. */}
                          <Row className="fw-semibold small text-muted px-2 mb-1 d-none d-md-flex">
                            <Col md={2}>Passenger</Col>
                            <Col md={2}>Title *</Col>
                            <Col md={3}>First Name *</Col>
                            <Col md={3}>Surname *</Col>
                            <Col md={2} className="text-center">Lead</Col>
                          </Row>
                          {room.guests.map((guest, gi) => {
                            const k = `room_${roomIndex}_guest_${gi}`;
                            const isLead =
                              leadIndex.roomIdx === roomIndex &&
                              leadIndex.guestIdx === gi;
                            return (
                              <Row key={gi} className="align-items-center g-2 mb-2">
                                <Col md={2}>
                                  <span className="fw-semibold text-muted">
                                    {guest.isChild
                                      ? `Child ${gi - room.adults + 1}`
                                      : `Adult ${gi + 1}`}
                                  </span>
                                </Col>
                                <Col md={2}>
                                  <Form.Select isInvalid={!!validationErrors[`${k}_salutation`]}
                                               value={guest.salutation}
                                               onChange={(e) => handleGuestChange(roomIndex, gi, "salutation", e.target.value)}>
                                    <option value="">Title</option>
                                    <option>Mr</option><option>Mrs</option>
                                    <option>Ms</option><option>Dr</option>
                                  </Form.Select>
                                </Col>
                                <Col md={3}>
                                  <Form.Control placeholder="First Name"
                                                isInvalid={!!validationErrors[`${k}_firstName`]}
                                                value={guest.firstName}
                                                onChange={(e) => handleGuestChange(roomIndex, gi, "firstName", e.target.value)} />
                                </Col>
                                <Col md={3}>
                                  <Form.Control placeholder="Surname"
                                                isInvalid={!!validationErrors[`${k}_lastName`]}
                                                value={guest.lastName}
                                                onChange={(e) => handleGuestChange(roomIndex, gi, "lastName", e.target.value)} />
                                </Col>
                                {/* Gender column hidden by request.
                                    State `guest.gender` keeps its
                                    default empty string. */}
                                <Col md={2} className="text-center">
                                  {/* Lead radio — only adults can be
                                      lead. Disabled+greyed for children
                                      so the row still aligns. */}
                                  <Form.Check
                                    type="radio"
                                    name="student-lead-guest"
                                    id={`student-lead-${roomIndex}-${gi}`}
                                    checked={isLead}
                                    disabled={guest.isChild}
                                    onChange={() => handleLeadSelect(roomIndex, gi)}
                                    title={
                                      guest.isChild
                                        ? "Children cannot be the lead"
                                        : "Mark as Lead passenger"
                                    }
                                  />
                                </Col>
                              </Row>
                            );
                          })}
                        </Accordion.Body>
                      </Accordion.Item>
                    ))}
                  </Accordion>
                </Card.Body>
              </Card>

              {/* Primary Guest Details card hidden per spec — the
                  Guest Details grid above is the single source of
                  customer details, with the Lead radio marking the
                  head guest. The submit payload still carries a
                  `primaryGuest` object: it's derived from the lead
                  guest's name fields in buildPayloadAndShowOrderSummary
                  so the backend contract stays intact. */}

              {/* Special requests (Remarks textarea hidden by
                  request — state `remarks` keeps its default empty
                  string). */}
              <Card className="p-2 mb-2 shadow-sm border-0">
                <h6 className="mb-2 fw-bold text-primary">Special Requests</h6>
                <div className="mb-3 d-flex flex-wrap gap-2">
                  {SPECIAL_REQUEST_OPTIONS.map((req) => (
                    <Form.Check key={req} type="checkbox" id={`sr-${req}`} label={req}
                                checked={specialRequests.includes(req)}
                                onChange={() => toggleSpecialRequest(req)} />
                  ))}
                </div>
              </Card>

              {/* Payment Mode — mirrors HotelBookingPage's three-scenario UI:
                    1. Sufficient credit           → Credit Limit only
                    2. No credit + Card enabled    → Card only + note
                    3. No credit + Card disabled   → hard block banner */}
              <Card className="p-2 mb-2 shadow-sm border-0">
                <h6 className="mb-2 fw-bold text-primary">Payment Mode</h6>
                {paymentModeOptions.length > 0 ? (
                  <>
                    <Row className="g-3">
                      <Col md={6}>
                        <Form.Group>
                          <Form.Label className="fw-semibold mb-1">Mode</Form.Label>
                          <Form.Select
                            value={paymentMode}
                            onChange={(e) => setPaymentMode(e.target.value)}
                          >
                            {paymentModeOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </Form.Select>
                        </Form.Group>
                      </Col>
                    </Row>
                    {hasSufficientCredit === false &&
                      agentCardPaymentEnabled && (
                        <div className="text-danger small mt-2 fw-semibold">
                          Insufficient credit. Pay with credit card before
                          time limit and reconfirm.
                        </div>
                      )}
                  </>
                ) : (
                  <Alert variant="danger" className="mb-0">
                    You do not have sufficient credit limit, and online card
                    payment is not enabled for your account. Therefore, this
                    booking cannot be completed. Please contact your account
                    manager or administrator to enable a payment method.
                  </Alert>
                )}
              </Card>

              {/* "Booking Done By Employee" was moved into the
                  StudentSearch criteria (optional). employeeId rides on
                  bookingData.payload and is sent to
                  /api/student-booking/create from there. */}
              </Col>

              {/* ─────────── Right sticky summary column ─────────── */}
              <Col lg={4} className="hbp-right-col">
                <div className="hbp-sticky-summary">
                  <Card className="shadow-sm rounded-3 mb-2 booking-summary-card border-0 overflow-hidden">
                    <Card.Header className="bg-primary text-white py-2 rounded-top">
                      <h6 className="mb-0 d-flex align-items-center">
                        <FaHotel className="me-2" /> Booking Summary
                      </h6>
                    </Card.Header>
                    <Card.Body className="p-2">
                      <div className="mb-2">
                        <div className="fw-bold text-primary mb-1">
                          {hotelStaticData.hotelName}
                        </div>
                        <div className="text-muted small mb-2">
                          {hotelStaticData.address}
                        </div>
                        <div className="d-flex flex-wrap align-items-center gap-2">
                          <span className="badge bg-warning text-dark">
                            ⭐ {hotelStaticData.starRating} Star
                          </span>
                          {selectedRate?.nonRefundable !== undefined && (
                            <Badge
                              bg={
                                selectedRate.nonRefundable === true ||
                                selectedRate.nonRefundable === "true"
                                  ? "danger"
                                  : "success"
                              }
                            >
                              {selectedRate.nonRefundable === true ||
                              selectedRate.nonRefundable === "true"
                                ? "Non-Refundable"
                                : "Flexible"}
                            </Badge>
                          )}
                          {activePromotion && (
                            <Badge
                              bg="success"
                              className="d-inline-flex align-items-center"
                            >
                              <FaGraduationCap className="me-1" /> Student
                              Discount
                              {activePromotion.discountPercent
                                ? ` ${activePromotion.discountPercent}%`
                                : ""}
                              {activePromotion.discountAmount
                                ? ` + ${activePromotion.discountAmount}`
                                : ""}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="hbp-summary-row">
                        <div className="hbp-summary-label">
                          <FaCalendarAlt className="me-2 text-primary" />
                          Check-in
                        </div>
                        <div className="hbp-summary-value">
                          {formatDateTime(payload.checkInDate)}
                        </div>
                      </div>
                      <div className="hbp-summary-row">
                        <div className="hbp-summary-label">
                          <FaCalendarAlt className="me-2 text-primary" />
                          Check-out
                        </div>
                        <div className="hbp-summary-value">
                          {formatDateTime(payload.checkOutDate)}
                        </div>
                      </div>
                      <div className="hbp-summary-row align-items-start">
                        <div className="hbp-summary-label">
                          <FaUsers className="me-2 text-primary" />
                          Guests
                        </div>
                        <div className="hbp-summary-value text-end">
                          {payload.rooms.map((room, i) => (
                            <div key={i} className="small">
                              Room {i + 1}: {room.adults} Adult
                              {room.adults > 1 ? "s" : ""}
                              {room.children
                                ? `, ${room.children} Child${
                                    room.children > 1 ? "ren" : ""
                                  }`
                                : ""}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="hbp-summary-row">
                        <div className="hbp-summary-label">
                          <FaUtensils className="me-2 text-primary" />
                          Meal Plan
                        </div>
                        <div className="hbp-summary-value">
                          {selectedRate.mealPlan}
                        </div>
                      </div>
                      <div className="hbp-summary-row">
                        <div className="hbp-summary-label">
                          <FaUtensils className="me-2 text-primary" />
                          Room Status
                        </div>
                        {/* Availability of the selected rate — same field
                            isOnRequestRate and the create payload's
                            roomStatus derive from (mirrors HotelBookingPage
                            / GovEmployeeBookingPage). */}
                        <div className="hbp-summary-value">
                          {selectedRate?.roomStatus || "Available"}
                        </div>
                      </div>
                    </Card.Body>
                  </Card>

                  <Card className="shadow-sm rounded-3 border-0 hbp-price-card">
                    <Card.Header className="bg-light py-2">
                      <h6 className="mb-0 fw-bold">Price Details</h6>
                    </Card.Header>
                    <Card.Body className="p-2">
                      {activePromotion && totalBefore !== totalAfter && (
                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">
                            Standard Total
                          </div>
                          <div className="hbp-summary-value text-decoration-line-through text-muted">
                            {formatPrice(totalBefore)}
                          </div>
                        </div>
                      )}
                      <div className="hbp-summary-row">
                        <div className="hbp-summary-label">Rate</div>
                        <div className="hbp-summary-value">
                          {formatPrice(selectedRate.rate || 0)} ×{" "}
                          {rooms.length || 1}
                        </div>
                      </div>
                      <hr className="my-2" />
                      <div className="hbp-summary-row fw-bold">
                        <div className="hbp-summary-label text-danger">
                          New Total
                          {activePromotion ? " (after Student discount)" : ""}
                        </div>
                        <div className="hbp-summary-value text-danger">
                          {formatPrice(totalAfter)}
                        </div>
                      </div>
                    </Card.Body>
                  </Card>

                  {/* Quotation — under the Price Details it quotes, above
                      the booking decision and Confirm Booking (a
                      type="button", so it never submits this form). */}
                  <QuotationPdfCard
                    className="mt-2"
                    buildPayload={buildStudentQuotationPayload}
                  />

                  {/* Voucher Now / Voucher Later choice — shown above the
                      Confirm Booking button for refundable Available rates
                      inside the cancellation window (mirrors HotelBookingPage). */}
                  {showVoucherChoice && (
                    <Card className="shadow-sm rounded-3 border-0 mt-2">
                      <Card.Body className="p-3">
                        <Form.Group className="mb-0">
                          <Form.Label className="mb-2 fw-semibold">
                            Are you sure you want to continue with the booking?
                          </Form.Label>
                          <div className="d-flex flex-column gap-2 mt-1">
                            <Form.Check
                              type="radio"
                              id="student-book-voucher"
                              name="studentBookingConfirmation"
                              label="Book and Pay Now"
                              value="Book & Voucher"
                              checked={bookingConfirmation === "Book & Voucher"}
                              onChange={(e) => setBookingConfirmation(e.target.value)}
                            />
                            <Form.Check
                              type="radio"
                              id="student-book-now-voucher-later"
                              name="studentBookingConfirmation"
                              label="Hold Room and Pay Later"
                              value="Book Now & Voucher later"
                              checked={
                                bookingConfirmation === "Book Now & Voucher later"
                              }
                              onChange={(e) => setBookingConfirmation(e.target.value)}
                            />
                          </div>
                        </Form.Group>
                      </Card.Body>
                    </Card>
                  )}

                  <div className="hbp-action-bar mt-2 d-flex gap-2">
                    <Button
                      variant="outline-secondary"
                      onClick={() => navigate(-1)}
                      className="flex-grow-1"
                    >
                      Back
                    </Button>
                    <Button
                      variant="primary"
                      type="submit"
                      disabled={
                        !isStudentInfoReady() || noPaymentPathAvailable
                      }
                      title={
                        noPaymentPathAvailable
                          ? "Booking cannot be completed — no payment method available for this agent."
                          : !isStudentInfoReady()
                            ? "Complete student verification first"
                            : ""
                      }
                      className="flex-grow-1"
                    >
                      Confirm Booking
                    </Button>
                  </div>
                </div>
              </Col>
            </Row>

            {/* Confirmation modal */}
              {/* ── Policies & Terms Modal (pre-confirmation gate) ─────────
                  Shown when the operator clicks Confirm Booking; Proceed
                  (after accepting) opens the summary modal. Uses the same
                  .policy-modal-* CSS as the hotel / long-stay flows. */}
              <Modal
                show={showPolicyModal}
                onHide={() => setShowPolicyModal(false)}
                centered
                backdrop="static"
                size="lg"
                scrollable
                dialogClassName="policy-modal"
              >
                <Modal.Header closeButton className="policy-modal-header">
                  <Modal.Title className="policy-modal-title">
                    Hotel Policies &amp; Terms
                  </Modal.Title>
                </Modal.Header>
                <Modal.Body className="policy-modal-body">
                  <section className="policy-section">
                    <h6 className="policy-section-title">Cancellation Policy</h6>
                    <div className="policy-item">
                      <div className="policy-text">
                        {selectedRate?.nonRefundable === true ||
                        selectedRate?.nonRefundable === "true"
                          ? "Non-Refundable — once confirmed this booking cannot be cancelled for a refund."
                          : "Flexible — cancellation is allowed per the hotel's refund terms."}
                      </div>
                    </div>
                  </section>

                  <section className="policy-section policy-section-last">
                    <h6 className="policy-section-title">Terms &amp; Conditions</h6>
                    <div className="policy-item">
                      <div className="policy-text">
                        The student discount is applied subject to the uploaded
                        Student ID being valid. The uploaded ID is retained on the
                        booking record for audit purposes.
                      </div>
                    </div>
                    <div className="policy-item">
                      <div className="policy-text">
                        Rates, taxes and availability are confirmed at the time of
                        booking. By proceeding you accept the hotel's general
                        terms &amp; conditions.
                      </div>
                    </div>
                  </section>
                </Modal.Body>
                <Modal.Footer className="policy-modal-footer">
                  <Form.Check
                    type="checkbox"
                    id="student-policy-accept"
                    className="me-auto policy-accept-check"
                    label={
                      <span>
                        I have read and accept the{" "}
                        <span className="text-primary">policies</span> and{" "}
                        <span className="text-primary">terms &amp; conditions</span>
                      </span>
                    }
                    checked={policyAccepted}
                    onChange={(e) => setPolicyAccepted(e.target.checked)}
                  />
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={() => setShowPolicyModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!policyAccepted}
                    onClick={() => {
                      // Accept → close this modal, open the summary modal.
                      setShowPolicyModal(false);
                      setShowConfirmModal(true);
                    }}
                  >
                    Proceed
                  </Button>
                </Modal.Footer>
              </Modal>

              {/* Order-summary confirm modal — structure replicated from
                  /gov-employee-booking-page so the two flows look identical. */}
              <Modal
                show={showConfirmModal}
                onHide={() => !isSubmitting && setShowConfirmModal(false)}
                centered
                backdrop="static"
                size="lg"
                dialogClassName="confirm-booking-modal"
              >
                <Modal.Header
                  closeButton={!isSubmitting}
                  className="bg-primary text-white py-2"
                  style={{ borderBottom: "none" }}
                >
                  <Modal.Title className="fw-semibold d-flex align-items-center">
                    <FaHotel className="me-2" /> Confirm Your Booking
                  </Modal.Title>
                </Modal.Header>
                <Modal.Body className="px-3 py-2 bg-light">
                  {pendingPayload && (
                    <div className="border rounded-3 bg-white shadow-sm p-2">
                      <div className="mb-2">
                        <p className="mb-0 d-flex align-items-center flex-wrap">
                          <span className="fw-bold text-primary fs-5">
                            {pendingPayload.hotelName}
                          </span>
                          {pendingPayload.address && (
                            <span className="text-muted small ms-1">
                              , {pendingPayload.address}
                            </span>
                          )}
                        </p>
                      </div>
                      <hr className="my-2" />

                      <Row className="gy-2">
                        <Col xs={6}>
                          <p className="mb-1">
                            <strong>Check-In:</strong>
                            <br />
                            <span className="text-dark">
                              {formatDateTime(pendingPayload.checkInDate)}
                            </span>
                          </p>
                        </Col>
                        <Col xs={6}>
                          <p className="mb-1">
                            <strong>Check-Out:</strong>
                            <br />
                            <span className="text-dark">
                              {formatDateTime(pendingPayload.checkOutDate)}
                            </span>
                          </p>
                        </Col>
                        <Col xs={6}>
                          <p className="mb-1">
                            <strong>Rooms:</strong> {pendingPayload.rooms.length}
                          </p>
                        </Col>
                        <Col xs={6}>
                          <p className="mb-1">
                            <strong>Nights:</strong> {pendingPayload.nights}
                          </p>
                        </Col>
                        {/* Room category + meal plan per booked room — mirrors
                            the booking summary. */}
                        {(pendingPayload.rooms || []).map((rm, i) => (
                          <React.Fragment key={i}>
                            <Col xs={6}>
                              <p className="mb-1">
                                <strong>Room Category:</strong>
                                <br />
                                <span className="text-dark">
                                  {pendingPayload.rooms.length > 1
                                    ? `Room ${i + 1} - `
                                    : ""}
                                  {rm.roomCategory || "—"}
                                </span>
                              </p>
                            </Col>
                            <Col xs={6}>
                              <p className="mb-1">
                                <strong>Meal Plan:</strong>
                                <br />
                                <span className="text-dark">
                                  {rm.mealPlan || "—"}
                                </span>
                              </p>
                            </Col>
                          </React.Fragment>
                        ))}

                        <Col xs={12}>
                          <p className="mb-1">
                            <strong>Lead Passenger:</strong>{" "}
                            {[
                              pendingPayload.primaryGuest?.salutation,
                              pendingPayload.primaryGuest?.firstName,
                              pendingPayload.primaryGuest?.lastName,
                            ]
                              .filter(Boolean)
                              .join(" ") || "-"}
                          </p>
                          <p className="mb-1">
                            <strong>Verification:</strong> Student ID Upload
                            {pendingPayload.studentIdFileName
                              ? ` (${pendingPayload.studentIdFileName})`
                              : ""}
                          </p>
                          <p className="mb-0 small text-muted">
                            Institution: {pendingPayload.institutionName || "-"} ·
                            ID: {pendingPayload.studentIdNumber || "-"}
                          </p>
                        </Col>

                        {/* Cancellation block — Non-refundable → compact
                            label + badge + policy text. Refundable +
                            deadline → deadline + refundable badge. Paired
                            with a Payment Mode badge column below so the
                            two read as one row. */}
                        {isNonRefundableRate ? (
                          <Col xs={12} md={6}>
                            <p className="mb-1">
                              <strong>Cancellation Policy:</strong>
                              <br />
                              <span
                                className="badge bg-danger"
                                style={{ fontSize: "0.7rem" }}
                              >
                                Non-refundable
                              </span>
                            </p>
                            <p
                              className="mb-0 text-muted"
                              style={{ fontSize: "0.75rem", lineHeight: 1.35 }}
                            >
                              No refund will be provided if this booking is
                              cancelled. 100% cancellation charges apply from
                              the time of booking.
                            </p>
                          </Col>
                        ) : (
                          cancellationDeadline && (
                            <Col xs={12} md={6}>
                              <p className="mb-1">
                                <strong>Cancellation Deadline:</strong>
                                <br />
                                <span className="text-dark">
                                  {cancellationDeadline.toLocaleDateString(
                                    "en-GB",
                                    {
                                      day: "2-digit",
                                      month: "short",
                                      year: "numeric",
                                    },
                                  )}
                                </span>
                                {isOutsideDeadline ? (
                                  <span
                                    className="badge bg-danger ms-2"
                                    style={{ fontSize: "0.7rem" }}
                                  >
                                    Passed
                                  </span>
                                ) : (
                                  <span
                                    className="badge bg-success ms-2"
                                    style={{ fontSize: "0.7rem" }}
                                  >
                                    Refundable until this date
                                  </span>
                                )}
                              </p>
                            </Col>
                          )
                        )}

                        {/* Payment Mode — badge beside the cancellation block. */}
                        {(isNonRefundableRate || cancellationDeadline) && (
                          <Col
                            xs={12}
                            md={6}
                            className="d-flex align-items-start justify-content-md-end"
                          >
                            <p className="mb-1">
                              <strong>Payment Mode:</strong>
                              <br />
                              <span
                                className="badge bg-success"
                                style={{ fontSize: "0.75rem" }}
                              >
                                {paymentMode === "CREDITLIMIT"
                                  ? "Credit Limit"
                                  : paymentMode === "CARD"
                                    ? "Online Payment"
                                    : paymentMode === "CASH"
                                      ? "Cash"
                                      : paymentMode || "—"}
                              </span>
                            </p>
                          </Col>
                        )}
                      </Row>

                      <div className="mt-2 p-2 bg-white border rounded">
                        <h6 className="fw-bold mb-1">Rate Split</h6>
                        {pendingPayload.totalRateBeforeDiscount >
                          pendingPayload.rooms.reduce((s, r) => s + r.rate, 0) && (
                          <div className="d-flex justify-content-between">
                            <span>Standard Total</span>
                            <span className="text-decoration-line-through text-muted">
                              {formatPrice(pendingPayload.totalRateBeforeDiscount)}
                            </span>
                          </div>
                        )}
                        {(pendingPayload.discountPercent ||
                          pendingPayload.discountAmount) && (
                          <div className="d-flex justify-content-between text-success">
                            <span>Student Discount</span>
                            <span>
                              {pendingPayload.discountPercent
                                ? `${pendingPayload.discountPercent}%`
                                : ""}
                              {pendingPayload.discountAmount
                                ? ` + ${pendingPayload.discountAmount}`
                                : ""}
                            </span>
                          </div>
                        )}
                        <hr className="my-1" />
                        <div className="d-flex justify-content-between fw-bold">
                          <span>Total Payable</span>
                          <span>
                            {formatPrice(
                              pendingPayload.rooms.reduce((s, r) => s + r.rate, 0),
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2 p-2 bg-white border rounded d-flex align-items-center">
                        <span
                          className="me-2 d-inline-flex align-items-center justify-content-center"
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: "50%",
                            background: "#16a34a",
                            color: "#fff",
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            lineHeight: 1,
                          }}
                        >
                          ✓
                        </span>
                        <span className="small text-dark">
                          Hotel policies and terms &amp; conditions accepted
                        </span>
                      </div>

                      <div className="mt-2 text-center">
                        <p className="text-muted small mb-0">
                          Please review the booking details carefully before
                          confirming.
                        </p>
                      </div>
                    </div>
                  )}
                </Modal.Body>
                <Modal.Footer className="bg-light border-0 d-flex justify-content-between">
                  <Button
                    variant="outline-secondary"
                    onClick={() => setShowConfirmModal(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={confirmBooking}
                    disabled={isSubmitting}
                    className="px-4 fw-semibold"
                  >
                    {isSubmitting ? (
                      <>
                        <Spinner size="sm" className="me-2" /> Processing
                        booking…
                      </>
                    ) : (
                      "Confirm"
                    )}
                  </Button>
                </Modal.Footer>
              </Modal>

              {/* ─── Insufficient credit + card disabled → block booking ───
                  Shown when the agent has no available credit AND the
                  AgentView "Allow Card payment mode" toggle is off. No
                  payment path exists, so the booking is turned away. Same
                  shape as HotelBookingPage / GovEmployeeBookingPage. */}
              <Modal
                show={showNoPaymentPathModal}
                onHide={() => setShowNoPaymentPathModal(false)}
                centered
              >
                <Modal.Header closeButton>
                  <Modal.Title>Booking Cannot Be Completed</Modal.Title>
                </Modal.Header>
                <Modal.Body className="text-center py-4">
                  <p className="mb-2 text-dark">
                    Sorry — this booking can't be completed because the agent
                    has no available credit and{" "}
                    <strong>Card payment is not enabled</strong> for this
                    account.
                  </p>
                  <p className="mb-0 text-muted small">
                    Please top up the agent's credit limit, or ask an
                    administrator to enable Card payment on the agent's
                    profile, then try again.
                  </p>
                  <div className="mt-3">
                    <div className="text-muted small">Payable amount</div>
                    <div className="fs-4 fw-bold text-dark">
                      {formatPrice(insufficientAmount)}
                    </div>
                  </div>
                </Modal.Body>
                <Modal.Footer className="justify-content-center border-0">
                  <Button
                    variant="secondary"
                    onClick={() => setShowNoPaymentPathModal(false)}
                  >
                    OK
                  </Button>
                </Modal.Footer>
              </Modal>

              {/* ─── Insufficient Credit → online payment required ─── */}
              <Modal
                show={showInsufficientModal}
                onHide={() => setShowInsufficientModal(false)}
                centered
              >
                <Modal.Header closeButton>
                  <Modal.Title>Online Payment Required</Modal.Title>
                </Modal.Header>
                <Modal.Body className="text-center py-4">
                  <p className="mb-2 text-muted">
                    The agent's available credit is insufficient for this
                    booking. You need to proceed with{" "}
                    <strong>online payment</strong>.
                  </p>
                  <div className="mt-3">
                    <div className="text-muted small">Payable amount</div>
                    <div className="fs-4 fw-bold text-dark">
                      {formatPrice(insufficientAmount)}
                    </div>
                  </div>
                </Modal.Body>
                <Modal.Footer className="justify-content-center border-0">
                  <Button
                    variant="danger"
                    onClick={() => setShowInsufficientModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="success"
                    onClick={() => {
                      setShowInsufficientModal(false);
                      setSelectedGateway("");
                      setShowGatewayModal(true);
                    }}
                  >
                    Pay
                  </Button>
                </Modal.Footer>
              </Modal>

              {/* ─── Select Payment Gateway ───
                  CCAvenue is the only real gateway wired up — mirrors
                  HotelBookingPage / DayStayBookingPage /
                  GovEmployeeBookingPage / SeniorCitizenBookingPage. */}
              <Modal
                show={showGatewayModal}
                onHide={() => setShowGatewayModal(false)}
                centered
              >
                <Modal.Header closeButton>
                  <Modal.Title>Select Payment Gateway</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                  <p className="text-muted small mb-3">
                    Choose a gateway to enter your card details.
                  </p>
                  <div className="pg-option-list">
                    {PAYMENT_GATEWAYS.map((g) => {
                      const isSelected = selectedGateway === g.id;
                      return (
                        <label
                          key={g.id}
                          htmlFor={`student-gw-${g.id}`}
                          className={`pg-option${
                            isSelected ? " pg-option-selected" : ""
                          }`}
                        >
                          <input
                            type="radio"
                            name="student-payment-gateway"
                            id={`student-gw-${g.id}`}
                            className="pg-option-input"
                            checked={isSelected}
                            onChange={() => setSelectedGateway(g.id)}
                          />
                          <span className="pg-option-radio" aria-hidden="true" />
                          {g.id === "ccavenue" && (
                            <img
                              src={`${process.env.PUBLIC_URL}/ccavanue.png`}
                              alt="CC Avenue"
                              className="pg-option-logo"
                            />
                          )}
                        </label>
                      );
                    })}
                  </div>
                </Modal.Body>
                <Modal.Footer className="border-0">
                  <Button
                    variant="secondary"
                    onClick={() => setShowGatewayModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="success"
                    disabled={!selectedGateway}
                    onClick={() => {
                      const gw = PAYMENT_GATEWAYS.find(
                        (x) => x.id === selectedGateway,
                      );
                      setShowGatewayModal(false);
                      // paymentMode is flipped to "ONLINE" so the Booking
                      // List labels the row correctly.
                      const onlinePayload = {
                        ...pendingPayload,
                        paymentMode: "ONLINE",
                      };

                      // ── CC Avenue: real billing-page redirect ──
                      // Distinct from the dummy /payment/:gateway path below
                      // — the browser fully navigates away to CC Avenue's
                      // hosted page and back, so the resume signal has to
                      // travel as a URL query param. See the ccavenueOrderId
                      // branch in the resume effect above.
                      //
                      // For CC Avenue the backend's /initiate stores the
                      // payload alongside the transaction row and
                      // /finalize-student replays it after payment.
                      // flowType tells the shared CCAvenueCheckoutPage to
                      // ask the backend for the STUDENT_CREATE arm.
                      if (selectedGateway === "ccavenue") {
                        const guest = onlinePayload?.primaryGuest;
                        const billingName = guest
                          ? [guest.firstName, guest.lastName]
                              .filter(Boolean)
                              .join(" ")
                          : "";
                        navigate("/payment/ccavenue-redirect", {
                          state: {
                            amountLabel: formatPrice(insufficientAmount),
                            billingName,
                            returnTo: location.pathname,
                            flowType: "STUDENT_CREATE",
                            bookingPayload: onlinePayload,
                          },
                        });
                        return;
                      }

                      // Dummy /payment/:gateway flow (test/local only) —
                      // no gateway currently routes through it because
                      // CCAvenue is the only PAYMENT_GATEWAYS entry.
                      try {
                        sessionStorage.setItem(
                          "studentPendingCreatePayload",
                          JSON.stringify(onlinePayload),
                        );
                      } catch (e) {
                        console.error(
                          "Could not persist pending student create payload",
                          e,
                        );
                      }
                      navigate(`/payment/${selectedGateway}`, {
                        state: {
                          amountLabel: formatPrice(insufficientAmount),
                          gatewayName: gw ? gw.name : selectedGateway,
                          returnTo: location.pathname,
                          returnState: { resumeCreate: true },
                        },
                      });
                    }}
                  >
                    Proceed to Pay
                  </Button>
                </Modal.Footer>
              </Modal>
            </Form>
        </main>
      </div>

      {/* ── Post-payment finalize overlay ──
          Visible only while the backend is creating the paid-for booking
          after a successful CC Avenue return. Backdrop is fully opaque
          and non-dismissable so the operator physically cannot click on
          anything else, and the beforeunload effect above adds the
          browser's own confirm dialog if they try to close the tab or
          refresh. Cleared automatically in the finally block of
          finalizeAfterCCAvenue. */}
      {isFinalizingPayment && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-live="assertive"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 20000,
            background: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: "2rem 1.75rem",
              maxWidth: 440,
              width: "100%",
              textAlign: "center",
              boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
            }}
          >
            <Spinner
              animation="border"
              variant="success"
              role="status"
              style={{ width: 48, height: 48, marginBottom: 16 }}
            />
            <h5 className="fw-bold mb-2" style={{ color: "#0f172a" }}>
              Payment successful — creating your booking
            </h5>
            <p className="text-muted mb-3" style={{ fontSize: 14 }}>
              Please <strong>do not close this window, refresh the page, or
              press the back button</strong> until you see the confirmation.
            </p>
            <div
              className="small"
              style={{
                color: "#b45309",
                background: "#fef3c7",
                border: "1px solid #fde68a",
                borderRadius: 8,
                padding: "8px 12px",
              }}
            >
              This usually takes just a few seconds.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
