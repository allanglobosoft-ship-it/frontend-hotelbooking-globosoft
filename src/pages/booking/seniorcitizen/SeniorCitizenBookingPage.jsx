/**
 * SeniorCitizenBookingPage.jsx
 *
 * Booking page for the Senior Citizen flow.
 *
 * Layout mirrors /hotel-booking-page (HotelBookingPage.jsx):
 *   - Two-column layout: left = guest details / verification, right
 *     = sticky Booking Summary + Price card
 *   - "Confirm Booking" opens the Policies & T&C modal
 *   - "Proceed" inside that modal builds the payload and opens the
 *     Order Summary modal
 *   - "Confirm" inside that modal posts to
 *     POST /api/senior-citizen-booking/create
 *
 * Extras vs HotelBookingPage:
 *   - Optional Senior Citizen proof upload (POST /api/senior-citizen-id-upload).
 *     The booking is allowed without a proof — the senior-citizen
 *     markup is driven by the adult ages captured on the search page —
 *     but uploading one keeps a record for admin reporting.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  FaHotel, FaCalendarAlt, FaUsers, FaUtensils,
  FaUserClock, FaFileUpload,
} from "react-icons/fa";
import {
  Container, Row, Col, Card, Form, Button, Accordion, Badge,
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
  "Early Check-In", "Non-Smoking Rooms", "Ground Floor", "Wheelchair Access",
  "Late Check-In", "Inter-connecting rooms", "Low Floor",
  "Room with Bathtub", "Late check-Out", "Quiet Room",
];

// Online-payment gateways — mirrors HotelBookingPage / DayStayBookingPage /
// GovEmployeeBookingPage. CCAvenue is the only real gateway wired; the
// dummy /payment/:gateway path is kept as a fallback for any future
// non-CCAvenue entry.
const PAYMENT_GATEWAYS = [
  { id: "ccavenue", name: "CC Avenue", desc: "Cards, UPI, Net Banking" },
];

// Reverse-geocode browser coordinates to a readable address for the
// Booking History audit trail. Tries OpenStreetMap Nominatim first
// (street-level detail), then BigDataCloud (locality-level, keyless) —
// both free, CORS-enabled endpoints. Returns null when neither responds
// so the caller keeps its IP-derived fallback.
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

export default function SeniorCitizenBookingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeUserRole = localStorage.getItem("currentActiveRole");

  const [bookingData, setBookingData] = useState(null);
  const [agentAvailableBalance, setAgentAvailableBalance] = useState(null);

  const [rooms, setRooms] = useState([]);
  const [primaryGuest, setPrimaryGuest] = useState({
    salutation: "", firstName: "", middleName: "", lastName: "",
    email: "", nativeCountry: "IN",
  });

  // ── Lead passenger marker — { roomIdx, guestIdx } pointing at the
  //    single guest the user has flagged as Lead. Mirrors
  //    /gov-employee-booking-page. Defaults to the first guest
  //    (room 0, guest 0) so the column has a selection on first
  //    render. Children can't be Lead. The submitted booking now
  //    derives primaryGuest's name fields from this entry, replacing
  //    the (now hidden) Primary Guest Details card.
  const [leadIndex, setLeadIndex] = useState({ roomIdx: 0, guestIdx: 0 });

  const handleLeadSelect = (roomIdx, guestIdx) => {
    const g = rooms?.[roomIdx]?.guests?.[guestIdx];
    if (g?.isChild) return;
    setLeadIndex({ roomIdx, guestIdx });
  };

  const [remarks, setRemarks] = useState("");
  const [specialRequests, setSpecialRequests] = useState([]);
  // "Booking Done By Employee" moved to SeniorCitizenSearch — the
  // chosen employeeId arrives on bookingData.payload.employeeId.

  // Tourism Dirhams — flat add-on to the room total. Mirrors
  // HotelBookingPage where it's editable per booking.
  // Setter dropped — the Tourism Dirhams input is hidden; value stays "0".
  const [tourismDirhams] = useState("0");

  // ── Senior-citizen proof upload (required) ────────────────────
  const [proofFile, setProofFile] = useState(null);
  const [uploadedFilePath, setUploadedFilePath] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [uploading, setUploading] = useState(false);

  // ── Core booking flow — Book Now & Voucher Now / Later ────────
  // Mirrors RoomList.jsx + HotelBookingPage.jsx: the room's roomStatus
  // (from POST /api/hotel-rooms/search) drives which voucher options are
  // offered, and the choice resolves to bookingFlowStatus which the backend
  // maps to confirmationStatus ("CONFIRMED" → Confirmed; else → ReConfirmed).
  const [bookingConfirmation, setBookingConfirmation] = useState("Book & Voucher");

  // Payment mode picked on the booking page — mirrors HotelBookingPage.
  // Sent on the create payload and persisted on the booking. CREDITLIMIT
  // keeps the legacy default.
  const [paymentMode, setPaymentMode] = useState("CREDITLIMIT");

  // ── Payment-gate modals (mirrors HotelBookingPage / StudentBookingPage) ──
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
  // DayStayBookingPage / GovEmployeeBookingPage. Pairs with the
  // beforeunload guard.
  const [isFinalizingPayment, setIsFinalizingPayment] = useState(false);
  // Per-agent "Card" payment-mode gate, toggled from AgentView. Also
  // filters the Card option out of the Payment Mode dropdown.
  const [agentCardPaymentEnabled, setAgentCardPaymentEnabled] = useState(false);

  // ── Two-step confirm flow state ─────────────────────────────
  const [validationErrors, setValidationErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1 — policies & T&C modal
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [policyData, setPolicyData] = useState(null);
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);

  // Step 2 — order summary modal (built payload waits for Confirm)
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingPayload, setPendingPayload] = useState(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("seniorCitizenBookingData");
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
          age: i < (room.adults || 0)
            ? (room.adultAges?.[i] ?? null)
            : (room.childAges?.[i - (room.adults || 0)] ?? null),
        })
      ),
    })));
  }, []);

  // Employee fetch removed — selected in SeniorCitizenSearch now.

  // Client location snapshot for the booking-history audit trail, resolved
  // once on page load and sent on the create payload:
  //   • Location — browser geolocation (GPS/WiFi) reverse-geocoded to a
  //     precise readable address; the coarse IP-derived city is only the
  //     fallback when the permission is denied or the lookup times out.
  // The IP Address column is NOT resolved here — browsers can only see the
  // shared public/NAT IP, so the backend stamps each system's unique IPv4
  // from the create request itself.
  const [clientNetwork, setClientNetwork] = useState({
    bookingLocation: null,
  });
  useEffect(() => {
    let cancelled = false;

    fetch("https://ipapi.co/json/")
      .then((res) => (res.ok ? res.json() : null))
      .then((info) => {
        if (cancelled || !info) return;
        setClientNetwork((prev) => ({
          // Never clobber a precise geolocation result that already landed.
          bookingLocation:
            prev.bookingLocation ||
            [info.city, info.region, info.country_name].filter(Boolean).join(", ") ||
            null,
        }));
      })
      .catch(() => {});

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
          const precise = await reverseGeocode(coords.latitude, coords.longitude);
          if (!cancelled && precise) {
            setClientNetwork((prev) => ({ ...prev, bookingLocation: precise }));
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
    if (!aId) { setAgentCardPaymentEnabled(false); return; }
    let cancelled = false;
    axiosInstance.get(`/api/agent/${aId}`)
      .then((res) => { if (!cancelled) setAgentCardPaymentEnabled(!!res?.data?.cardPaymentEnabled); })
      .catch(() => { if (!cancelled) setAgentCardPaymentEnabled(false); });
    return () => { cancelled = true; };
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

  // Post-payment resume — mirrors HotelBookingPage / StudentBookingPage.
  // DummyPaymentPage returns us here with location.state.resumeCreate =
  // true after the dummy card charge succeeds. React state (rooms /
  // pendingPayload) is lost across the /payment detour, so we rebuild
  // the create call purely from the payload persisted under
  // "seniorCitizenPendingCreatePayload" just before navigating away.
  // On success we go to the Senior Citizen Booking List; the row
  // surfaces on whichever status the backend engine assigns.
  //
  // Guards:
  //   • The flag is stripped from history immediately so a reload /
  //     back doesn't re-fire the create.
  //   • sessionStorage is cleared right after read so a stray landing
  //     on this URL with a stale flag can't replay an old payload.
  //   • The credit-check step in confirmBooking() is skipped here —
  //     the operator has already paid via the gateway.
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const ccavenueOrderId = searchParams.get("ccavenueOrderId");
    const ccavenueStatus = searchParams.get("ccavenueStatus");

    const resumeFromState = !!location.state?.resumeCreate;
    const resumeFromCCAvenue = !!ccavenueOrderId;
    if (!resumeFromState && !resumeFromCCAvenue) return;

    // Strip the resume signal from history right away so remounts /
    // reloads don't re-trigger. Do it before the async work so a fast
    // re-render can't race the effect.
    navigate(location.pathname, { replace: true, state: {} });

    const readPendingPayload = () => {
      const stored = sessionStorage.getItem("seniorCitizenPendingCreatePayload");
      sessionStorage.removeItem("seniorCitizenPendingCreatePayload");
      if (!stored) return null;
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error("Malformed persisted senior-citizen create payload", e);
        return null;
      }
    };

    // Dummy-gateway (local /payment/:gateway) path only. Real CC Avenue
    // uses finalizeAfterCCAvenue below, which asks the backend to create
    // the booking from the payload it persisted at /initiate time —
    // sessionStorage isn't the source of truth there.
    const finalizeDummyCreate = async (payload) => {
      try {
        setIsSubmitting(true);
        const { data } = await axiosInstance.post(
          "/api/senior-citizen-booking/create",
          payload,
        );
        if (data?.success) {
          toast.success(
            data.message ||
              `Booking ${data.bookingCode || ""} created after payment.`,
          );
          setShowConfirmModal(false);
          navigate("/booking-details/senior-citizen-booking-list");
        } else {
          toast.error(data?.message || "Booking submission failed. Please try again.");
        }
      } catch (err) {
        const beMsg =
          err?.response?.data?.message || err?.response?.data?.error || null;
        console.error("Error finalising senior-citizen booking after payment:", err);
        toast.error(beMsg || "Booking submission failed. Please try again.");
      } finally {
        setIsSubmitting(false);
      }
    };

    // Real CC Avenue path — the backend owns the payload and the create
    // call. We just ask it to finalize. Idempotent.
    const finalizeAfterCCAvenue = async () => {
      try {
        setIsFinalizingPayment(true);
        setIsSubmitting(true);
        const { data } = await axiosInstance.post(
          `/api/payment/ccavenue/finalize-seniorcitizen/${ccavenueOrderId}`,
        );
        if (data?.success) {
          toast.success(
            data.message ||
              `Booking ${data.bookingCode || ""} created after payment.`,
          );
          setShowConfirmModal(false);
          navigate("/booking-details/senior-citizen-booking-list");
        } else {
          toast.error(
            data?.message ||
              "Payment succeeded but booking could not be created. Please contact support with your payment reference.",
          );
        }
      } catch (err) {
        const beMsg =
          err?.response?.data?.message || err?.response?.data?.error || null;
        console.error("Post-payment senior-citizen finalize failed:", err);
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

    // CC Avenue path — verify server-side, then let the backend finalize.
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
  // being created server-side. Only attached during that window so it
  // never fires on the normal flow.
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

  // ── Optional proof upload ──────────────────────────────────
  const onProofChange = (e) => {
    setProofFile(e.target.files?.[0] || null);
    setUploadedFilePath("");
    setUploadedFileName("");
    if (validationErrors.document) {
      setValidationErrors((er) => { const n = { ...er }; delete n.document; return n; });
    }
  };
  const handleUploadProof = async () => {
    if (!proofFile) { toast.error("Choose a file first"); return; }
    if (proofFile.size > 5 * 1024 * 1024) {
      toast.error("File too large (max 5 MB)"); return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", proofFile);
      const { data } = await axiosInstance.post(
        "/api/senior-citizen-id-upload", fd,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      if (data?.success) {
        setUploadedFilePath(data.filePath);
        setUploadedFileName(data.fileName);
        setValidationErrors((er) => { const n = { ...er }; delete n.document; return n; });
        toast.success("Proof uploaded");
      } else {
        toast.error(data?.message || "Upload failed");
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || "Upload failed");
    } finally { setUploading(false); }
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

  // ── Booking-flow derivation (mirrors HotelBookingPage / StudentBookingPage) ──
  const isOnRequestRate = bookingData?.selectedRate?.roomStatus === "On Request";
  const isNonRefundableRate =
    bookingData?.selectedRate?.nonRefundable === true ||
    bookingData?.selectedRate?.nonRefundable === "true";
  // Cancellation deadline for display — end of the check-in day, mirrors
  // how the create payload stores deadlineDate (`${checkInDate}T23:59:59`).
  // Powers the "Refundable until this date" / "Passed" badge on the
  // confirm modal.
  const cancellationDeadline = (() => {
    const cinRaw = bookingData?.payload?.checkInDate;
    if (!cinRaw) return null;
    const cin = new Date(cinRaw);
    if (isNaN(cin.getTime())) return null;
    const deadline = new Date(cin);
    deadline.setHours(0, 0, 0, 0);
    return deadline;
  })();
  const isOutsideDeadline = (() => {
    if (!cancellationDeadline) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today > cancellationDeadline;
  })();
  // Offer the Voucher Now / Voucher Later choice only for refundable,
  // Available rates. On-request / non-refundable rates skip the choice.
  const showVoucherChoice = !isOnRequestRate && !isNonRefundableRate;
  // Resolved status sent on payload.bookingFlowStatus.
  const resolvedBookingFlowStatus = (() => {
    if (isOnRequestRate) return "REQUESTED";
    if (isNonRefundableRate) return "RECONFIRMED";
    return bookingConfirmation === "Book Now & Voucher later"
      ? "CONFIRMED"
      : "RECONFIRMED";
  })();
  // Reset a stale "Voucher Later" pick when the choice no longer applies.
  useEffect(() => {
    if (!bookingData?.selectedRate) return;
    if (!showVoucherChoice && bookingConfirmation !== "Book & Voucher") {
      setBookingConfirmation("Book & Voucher");
    }
  }, [bookingData, bookingConfirmation, showVoucherChoice]);

  const validateForm = () => {
    const errors = {};
    // Senior Citizen proof document is required.
    if (!uploadedFilePath) {
      errors.document = "Please upload the Senior Citizen proof document";
    }
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

  // ── Step 1 of the confirm flow — validate, fetch policies + T&C,
  //     open the policy modal. Mirrors HotelBookingPage.openPolicyConsent.
  const openPolicyConsent = async () => {
    // Scenario 3 guard — no viable payment path (no credit AND Card
    // disabled). Blocks a form-submit via Enter key from bypassing the
    // disabled Confirm Booking button.
    if (noPaymentPathAvailable) {
      toast.error(
        "Booking cannot be completed — no payment method available for this agent.",
      );
      return;
    }
    const { errors, hasErrors } = validateForm();
    if (hasErrors) {
      setValidationErrors(errors);
      toast.error("Please complete the highlighted fields");
      return;
    }
    setValidationErrors({});

    const hotelId = bookingData?.selectedRate?.hotelId;
    if (!hotelId) {
      toast.error("Hotel reference missing — cannot fetch policies.");
      return;
    }

    setPolicyAccepted(false);
    setShowPolicyModal(true);
    setPoliciesLoading(true);
    try {
      const [policiesRes, termsRes] = await Promise.allSettled([
        axiosInstance.get(`/api/hotels/${hotelId}/policies`),
        axiosInstance.get(`/api/hotels/${hotelId}/terms-and-conditions`),
      ]);
      setPolicyData(policiesRes.status === "fulfilled" ? (policiesRes.value?.data || null) : null);

      let tc = "";
      if (termsRes.status === "fulfilled") {
        const d = termsRes.value?.data;
        if (Array.isArray(d)) {
          tc = d.map((row) =>
            typeof row === "string" ? row : row?.description || ""
          ).filter(Boolean).join("\n\n");
        } else if (typeof d === "string") {
          tc = d;
        } else {
          tc = d?.termsAndConditions || d?.terms || d?.data || d?.message || "";
        }
      }
      setTermsAndConditions(tc);
    } catch (err) {
      console.error("policies/T&C fetch error", err);
    } finally {
      setPoliciesLoading(false);
    }
  };

  // ── Step 2 — build the booking payload and open the Order Summary
  //     modal. Triggered from the "Proceed" button inside the policy
  //     modal once the consent checkbox is ticked.
  const buildPayloadAndShowOrderSummary = () => {
    const { selectedRate, hotelStaticData, payload, activePromotion, searchCtx } = bookingData;
    const ci = new Date(payload.checkInDate);
    const co = new Date(payload.checkOutDate);
    const nights = Math.max(1, Math.round((co - ci) / 86400000));

    // Multi-room aware: when SeniorCitizenRoomList sent a per-room
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
        rateWithoutMarkup: Number(slot.rate || 0),
        rateBeforeDiscount: Number(slot.rateBeforeDiscount || slot.rate || 0),
        adults: room.adults,
        children: room.children,
        childAges: room.childAges || [],
        adultAges: room.adultAges || [],
        currency: slot.currency || "INR",
        guests: (room.guests || []).map((g) => ({
          salutation: g.salutation, firstName: g.firstName, lastName: g.lastName,
          gender: g.gender, isChild: !!g.isChild, age: g.age,
        })),
      };
    });

    const promoType = activePromotion?.discountType
      || (activePromotion?.discountPercent != null ? "PERCENTAGE"
       : activePromotion?.discountAmount  != null ? "AMOUNT" : null);
    const promoValue = activePromotion?.discountValue
      ?? activePromotion?.discountPercent ?? activePromotion?.discountAmount ?? null;

    const built = {
      agentId: String(payload.agentId || searchCtx?.agentId || ""),
      apiId: String(payload.apiId || searchCtx?.apiId || 1),
      hotelId: String(selectedRate.hotelId || searchCtx?.hotelCode || ""),
      hotelName: hotelStaticData.hotelName,
      address: hotelStaticData.address,
      starRating: hotelStaticData.starRating,
      checkInDate: `${payload.checkInDate}T14:00:00`,
      checkOutDate: `${payload.checkOutDate}T11:00:00`,
      nights,
      // Senior-citizen markup snapshot — server re-applies authoritatively.
      discountType: promoType,
      discountValue: promoValue != null ? Number(promoValue) : null,
      discountPercent: promoType === "PERCENTAGE" ? Number(promoValue) : null,
      discountAmount:  promoType === "AMOUNT"     ? Number(promoValue) : null,
      totalRateBeforeDiscount: allRooms.reduce((s, r) => s + Number(r.rateBeforeDiscount || 0), 0),
      // Primary guest is now derived from the Lead-marked passenger
      // in the Guest Details grid (the Primary Guest Details card is
      // hidden). Email / nativeCountry aren't captured on the form
      // any more, so they're left empty — the backend ignores
      // missing optional values, and the existing
      // /api/senior-citizen-booking/create contract is preserved.
      primaryGuest: (() => {
        const lead = rooms[leadIndex.roomIdx]?.guests?.[leadIndex.guestIdx] || {};
        return {
          salutation: lead.salutation || "",
          firstName: lead.firstName || "",
          middleName: lead.middleName || "",
          lastName: lead.lastName || "",
          email: "",
          nativeCountry: "",
        };
      })(),
      rooms: allRooms,
      remarks,
      specialRequests,
      tourismDirhams: tdAmount,
      // Optional proof — null when the user didn't upload anything.
      seniorCitizenIdFilePath: uploadedFilePath || null,
      seniorCitizenIdFileName: uploadedFileName || null,
      // Backend still requires one of EMPLOYEE_CODE / GOVT_ID_UPLOAD
      // even though the senior-citizen flow is now age-based. We send
      // GOVT_ID_UPLOAD (the closer match — proof is the optional govt
      // ID we accept on this page) so the API stops rejecting the
      // request. Once the backend is updated to make this field
      // optional, this line can be removed.
      verificationMethod: "GOVT_ID_UPLOAD",
      // Mirror the proof name into the legacy "senior citizen name"
      // field so any backend validator that expects a value gets one.
      // Source is the Lead-marked guest in the Guest Details grid.
      seniorCitizenName: (() => {
        const lead = rooms[leadIndex.roomIdx]?.guests?.[leadIndex.guestIdx] || {};
        const full = `${lead.firstName || ""} ${lead.lastName || ""}`.trim();
        return full || null;
      })(),
      source: "B2B_PORTAL",
      createdByRole: (activeUserRole || "AGENT").toUpperCase(),
      // Location column in the detail view's Booking History. The IP
      // Address column is stamped server-side from the create request
      // (each system's own IPv4), so it is not sent here.
      bookingLocation: clientNetwork.bookingLocation,
      // bookingDate is deliberately NOT sent — the backend stamps it with its
      // own clock, same as the reconfirm / cancel timestamps. (Sending
      // toISOString() here stored the UTC time as if it were local.)
      deadlineDate: `${payload.checkInDate}T23:59:59`,
      // Carry the real room availability + the resolved booking-flow status so
      // the backend maps it to confirmationStatus (Confirmed / ReConfirmed).
      roomStatus: selectedRate?.roomStatus || "Available",
      bookingFlowStatus: resolvedBookingFlowStatus,
      bookingConfirmation: bookingConfirmation || "Book & Voucher",
      // Payment mode chosen on the booking page — persisted on the booking.
      paymentMode,
      // "Add New Item" flow — child of an existing booking (SNCIT7/1, …).
      parentBookingCode: bookingData?.payload?.parentBookingCode || null,
      // employeeId is picked in SeniorCitizenSearch and rides on bookingData.payload.
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
    setShowConfirmModal(true);
  };

  // ── Step 3 — actually post the booking. Triggered from the
  //     "Confirm" button inside the order-summary modal.
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
      //   • Everything else → keep the Order Summary modal closed, then:
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
              setIsSubmitting(false);
              if (!agentCardPaymentEnabled) {
                setShowNoPaymentPathModal(true);
                return;
              }
              setShowInsufficientModal(true);
              return;
            }
            console.log(
              isOnRequestRate
                ? "[SENIOR_CITIZEN] Insufficient credit but On Request rate — proceeding with create."
                : "[SENIOR_CITIZEN] Insufficient credit but Voucher Later selected — proceeding with create; credit deducted at Reconfirm.",
            );
          }
        } catch (e) {
          /* non-fatal — backend create still enforces the credit check */
        }
      }

      setShowConfirmModal(false);
      const { data } = await axiosInstance.post(
        "/api/senior-citizen-booking/create", pendingPayload
      );
      if (data?.success !== false) {
        toast.success(`Booking ${data?.bookingCode || ""} created successfully`);
        // "Add New Item" amendment flow: link to the parent hotel booking and
        // return to its detail page; otherwise keep the normal list redirect.
        if (pendingPayload.parentBookingCode) {
          const parentId = await createAmendmentLink({
            parentBookingCode: pendingPayload.parentBookingCode,
            childType: "SENIOR_CITIZEN",
            childTypeLabel: "Senior Citizen",
            childBookingId: data.bookingId,
            childBookingCode: data.bookingCode,
            childDetailRoutePrefix: "/booking-details/senior-citizen-booking/",
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
        navigate("/booking-details/senior-citizen-booking-list");
      } else {
        toast.error(data?.message || "Booking failed");
      }
    } catch (e) {
      console.error("[senior-citizen] booking failed:", e);
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
  const tdAmount = parseFloat(tourismDirhams) || 0;
  // Multi-room aware: when `roomBreakdown` is present the combined
  // `selectedRate.rate` is ALREADY the sum across all rooms (each
  // slot contributes its own rate). Multiplying again by `rooms.length`
  // would double-count. Sum the per-room values directly instead.
  // Legacy single-room flows keep `selectedRate.rate × rooms.length`,
  // which equals `selectedRate.rate` when there is one room.
  const totalBefore = bookingData.roomBreakdown?.length
    ? bookingData.roomBreakdown.reduce(
        (s, r) => s + Number(r.rateBeforeDiscount || r.rate || 0),
        0,
      )
    : Number(selectedRate.rateBeforeDiscount || 0) * (rooms.length || 1);
  // New Total includes Tourism Dirhams as a flat add-on. The room-rate
  // subtotal is the senior-citizen-discounted rate × number of rooms.
  const roomSubtotal = bookingData.roomBreakdown?.length
    ? bookingData.roomBreakdown.reduce((s, r) => s + Number(r.rate || 0), 0)
    : Number(selectedRate.rate || 0) * (rooms.length || 1);
  const totalAfter = roomSubtotal + tdAmount;

  const promoSummary = (() => {
    if (!activePromotion) return null;
    const t = activePromotion.discountType;
    const v = activePromotion.discountValue;
    if (t === "PERCENTAGE") return `${v}% off`;
    if (t === "AMOUNT") return `flat ${v}`;
    const out = [];
    if (activePromotion.discountPercent) out.push(`${activePromotion.discountPercent}% off`);
    if (activePromotion.discountAmount) out.push(`+ flat ${activePromotion.discountAmount}`);
    return out.join(" ");
  })();

  // ── Quotation PDF ─────────────────────────────────────────────────────
  // Quotes what this page shows: the Booking Summary and Price Details in
  // the display currency (like formatPrice). When the Senior discount
  // applies, rooms are listed at the Standard Total with a discount line, so
  // the lines add up to the New Total (room subtotal + tourism dirhams).
  const buildSeniorCitizenQuotationPayload = () => {
    if (!selectedRate || !hotelStaticData || !payload) return null;
    const cur = bookingData?.searchCtx?.currency || { code: "AED", factor: 1 };
    const factor = Number(cur.factor) > 0 ? Number(cur.factor) : 1;
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const toDisplay = (aed) => round2((Number(aed) || 0) * factor);
    const ci = new Date(payload.checkInDate);
    const co = new Date(payload.checkOutDate);
    const nights =
      isNaN(ci.getTime()) || isNaN(co.getTime())
        ? null
        : Math.max(1, Math.round((co - ci) / 86400000));
    const nightsText = nights ? `${nights} Night${nights === 1 ? "" : "s"}` : "";
    const searchRooms = Array.isArray(payload.rooms) ? payload.rooms : [];
    const roomCount = rooms.length || 1;
    const describeGuests = (room) => {
      if (!room) return "";
      const adults = Number(room.adults) || 0;
      const children = Number(room.children) || 0;
      const senior =
        Array.isArray(room.adultAges) &&
        room.adultAges.some((a) => Number(a) >= 60);
      return `${adults} Adult${adults === 1 ? "" : "s"}${
        children ? `, ${children} Child${children === 1 ? "" : "ren"}` : ""
      }${senior ? " (Senior)" : ""}`;
    };
    const discountApplies = !!promoSummary && totalBefore > roomSubtotal;

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
            amount: toDisplay(discountApplies ? totalBefore : roomSubtotal),
          },
        ];
    const tdLine = tdAmount > 0 ? toDisplay(tdAmount) : 0;
    const totalAmount = toDisplay(totalAfter);
    if (discountApplies) {
      const linesSum = priceItems.reduce((s, item) => s + item.amount, 0);
      priceItems.push({
        description: "Senior Discount",
        details: promoSummary,
        amount: round2(totalAmount - tdLine - linesSum),
      });
    }
    if (tdLine > 0) {
      priceItems.push({ description: "Tourism Dirhams", details: "", amount: tdLine });
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
    if (isNonRefundableRate) {
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
      bookingType: "SENIOR_CITIZEN",
      agentId: Number(payload.agentId || bookingData?.searchCtx?.agentId) || null,
      currency: cur.code || "AED",
      serviceName: hotelStaticData.hotelName || selectedRate.hotelName || "",
      serviceSubtitle: hotelStaticData.address || "",
      customerName: leadName || null,
      details: [
        { label: "Check-in", value: payload.checkInDate || "" },
        { label: "Check-out", value: payload.checkOutDate || "" },
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
          value: isNonRefundableRate ? "Non-Refundable" : "Flexible",
        },
        { label: "Offer", value: promoSummary ? `Senior ${promoSummary}` : "" },
      ],
      priceItems,
      totalAmount,
      cancellationPolicy,
    };
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column hotel-booking-container">
      <TopBar />
      <div className="main-content">
        <Sidebar />
        <main className="content-wrapper py-4">
          <Container fluid="xl">
            {/* Senior Citizen route heading — UI only, mirrors the heading
                shown on /new-booking/senior-citizen once results arrive. */}
            <div className="hs-page-heading">
              <h3 className="hs-page-heading-title">Senior Citizen</h3>
            </div>
            {agentAvailableBalance != null && (
              <div className="d-flex justify-content-end mb-2">
                <span className="fw-bold" style={{ color: "#dc3545", fontSize: "0.95rem" }}>
                  Available Balance: {Number(agentAvailableBalance).toFixed(2)}
                </span>
              </div>
            )}

            <Form onSubmit={(e) => { e.preventDefault(); openPolicyConsent(); }}>
              <Row className="g-3">
                {/* ── LEFT COLUMN — Guest + verification + proof ─────────── */}
                <Col lg={8} className="hbp-left-col">
                  {/* Guest Details — unified with
                      /gov-employee-booking-page:
                        - compact left-aligned Card.Header (bg-light
                          py-2 + h6) with a small Back button
                        - per-room accordion (alwaysOpen) so every
                          room stays expanded together
                        - column headers row (Passenger | Title |
                          First Name | Surname | Gender | Lead)
                        - Lead radio per guest row, disabled for
                          children (mirrors the gov flow). The lead
                          drives `primaryGuest` in the submit payload
                          (the Primary Guest Details card is hidden). */}
                  <Card className="mb-2 shadow-sm border-0">
                    <Card.Header className="bg-light py-2">
                      <div className="d-flex align-items-center">
                        <Button variant="outline-secondary" size="sm"
                                onClick={() => navigate(-1)}
                                className="me-3">← Back</Button>
                        <h6 className="mb-0 fw-bold text-dark">Guest Details</h6>
                      </div>
                    </Card.Header>
                    <Card.Body className="p-0">
                      <Accordion alwaysOpen
                        defaultActiveKey={rooms.map((_, i) => i.toString())}
                        className="guest-details-accordion">
                        {rooms.map((room, roomIndex) => (
                          <Accordion.Item key={roomIndex}
                                          eventKey={roomIndex.toString()}
                                          className="mb-2 guest-room-item">
                            <Accordion.Header className="bg-primary text-white">
                              <h6 className="mb-0 fw-bold w-100 d-flex flex-wrap align-items-center gap-2">
                                <span>
                                  {/* Per-room label when roomBreakdown is
                                      present; otherwise the combined
                                      selectedRate (legacy single-room). Shows
                                      room category + meal plan. */}
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
                                {Array.isArray(room.adultAges) && room.adultAges.some((a) => Number(a) >= 60) && (
                                  <Badge bg="success" className="ms-2">Senior Citizen Room</Badge>
                                )}
                              </h6>
                            </Accordion.Header>
                            <Accordion.Body className="p-3">
                              {/* Column headers — mirrors the gov
                                  flow so the two dedicated-flow
                                  booking pages render identically. */}
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
                                          : `Adult ${gi + 1}${guest.age != null ? ` · ${guest.age} yrs` : ""}`}
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
                                    {/* Gender column hidden by
                                        request. State `guest.gender`
                                        keeps its default empty
                                        string. */}
                                    <Col md={2} className="text-center">
                                      {/* Lead radio — only adults can
                                          be lead. Disabled+greyed for
                                          children so the row still
                                          aligns. */}
                                      <Form.Check
                                        type="radio"
                                        name="sc-lead-guest"
                                        id={`sc-lead-${roomIndex}-${gi}`}
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

                  {/* Primary Guest Details card hidden per spec —
                      the Guest Details grid above is the single
                      source of customer details, with the Lead radio
                      marking the head guest. The submit payload still
                      carries a `primaryGuest` object derived from
                      the lead in buildPayloadAndShowOrderSummary, so
                      the backend contract stays intact. Tourism
                      Dirhams (an agent-entered flat add-on) remains
                      below as a compact standalone card since the
                      total payable depends on it. */}
                  {/* Tourism Dirhams (AED) input hidden per request. The
                      `tourismDirhams` state stays "0" so totals are unaffected. */}

                  {/* {isOnRequestRate && (
                    <Alert variant="warning" className="py-2 mb-2">
                      This rate is <strong>On Request</strong> — the booking will be
                      placed and confirmed with the supplier before the voucher is issued.
                    </Alert>
                  )} */}

                  {/* Senior Citizen proof upload (required) — simple 2-step
                      panel: choose a file, then Upload. */}
                  <Card className="p-3 mb-2 shadow-sm border-0"
                        style={{ background: "#f8fbff" }}>
                    <h6 className="mb-2 fw-bold d-flex align-items-center">
                      <FaUserClock className="me-2 text-primary" /> Senior Citizen Proof Upload
                      <span className="text-danger ms-1">*</span>
                    </h6>
                    <Row className="g-2 align-items-center">
                      <Col md={7}>
                        <Form.Control type="file" accept=".pdf,.png,.jpg,.jpeg"
                                      onChange={onProofChange}
                                      disabled={uploading}
                                      isInvalid={!!validationErrors.document} />
                        <Form.Control.Feedback type="invalid">
                          {validationErrors.document}
                        </Form.Control.Feedback>
                      </Col>
                      <Col md={3}>
                        <Button
                          variant={uploadedFilePath ? "outline-success" : "primary"}
                          className="w-100"
                          onClick={handleUploadProof}
                          disabled={!proofFile || uploading}>
                          {uploading ? (
                            <><Spinner size="sm" className="me-1" /> Uploading…</>
                          ) : uploadedFilePath ? (
                            <><FaFileUpload className="me-1" /> Re-upload</>
                          ) : (
                            <><FaFileUpload className="me-1" /> Upload</>
                          )}
                        </Button>
                      </Col>
                      <Col md={2} className="text-md-center">
                        {uploadedFilePath
                          ? <Badge bg="success" className="p-2">✓ Uploaded</Badge>
                          : <Badge bg="secondary" className="p-2">Pending</Badge>}
                      </Col>
                    </Row>
                  </Card>

                  {/* Special requests (Remarks textarea hidden by
                      request — state `remarks` keeps its default
                      empty string). */}
                  <Card className="p-3 mb-2 shadow-sm border-0">
                    <h6 className="mb-2 fw-bold text-primary">Special Requests</h6>
                    <div className="mb-2 d-flex flex-wrap gap-2">
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
                  <Card className="p-3 mb-2 shadow-sm border-0">
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
                        You do not have sufficient credit limit, and online
                        card payment is not enabled for your account.
                        Therefore, this booking cannot be completed. Please
                        contact your account manager or administrator to
                        enable a payment method.
                      </Alert>
                    )}
                  </Card>

                  {/* "Booking Done By Employee" was moved into the
                      SeniorCitizenSearch criteria (optional). employeeId
                      rides on bookingData.payload and is sent to
                      /api/senior-citizen-booking/create from there. */}
                </Col>

                {/* ── RIGHT COLUMN — Sticky Booking Summary + Price ──────── */}
                <Col lg={4} className="hbp-right-col">
                  <div className="hbp-sticky-summary">
                    <Card className="shadow-sm rounded-3 mb-3 booking-summary-card border-0 overflow-hidden">
                      <Card.Header className="bg-primary text-white py-2 rounded-top">
                        <h6 className="mb-0 d-flex align-items-center">
                          <FaHotel className="me-2" /> Booking Summary
                        </h6>
                      </Card.Header>
                      <Card.Body className="p-3">
                        <div className="mb-3">
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
                            {promoSummary && (
                              <Badge bg="success" className="d-inline-flex align-items-center">
                                <FaUserClock className="me-1" /> Senior {promoSummary}
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">
                            <FaCalendarAlt className="me-2 text-primary" />Check-in
                          </div>
                          <div className="hbp-summary-value">{payload.checkInDate}</div>
                        </div>
                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">
                            <FaCalendarAlt className="me-2 text-primary" />Check-out
                          </div>
                          <div className="hbp-summary-value">{payload.checkOutDate}</div>
                        </div>
                        <div className="hbp-summary-row align-items-start">
                          <div className="hbp-summary-label">
                            <FaUsers className="me-2 text-primary" />Guests
                          </div>
                          <div className="hbp-summary-value text-end">
                            {payload.rooms.map((room, i) => (
                              <div key={i} className="small">
                                Room {i + 1}: {room.adults} Adult{room.adults > 1 ? "s" : ""}
                                {room.children
                                  ? `, ${room.children} Child${room.children > 1 ? "ren" : ""}`
                                  : ""}
                                {Array.isArray(room.adultAges) && room.adultAges.some((a) => Number(a) >= 60) && (
                                  <Badge bg="success" pill className="ms-1" style={{ fontSize: "0.6rem" }}>
                                    Senior
                                  </Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">
                            <FaUtensils className="me-2 text-primary" />Meal Plan
                          </div>
                          <div className="hbp-summary-value">{selectedRate.mealPlan}</div>
                        </div>
                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">
                            <FaUtensils className="me-2 text-primary" />Room Status
                          </div>
                          {/* Availability of the selected rate — same field
                              isOnRequestRate and the create payload's
                              roomStatus derive from (mirrors HotelBookingPage
                              / StudentBookingPage). */}
                          <div className="hbp-summary-value">
                            {selectedRate?.roomStatus || "Available"}
                          </div>
                        </div>
                        {/* Native Country row removed — the Primary
                            Guest Details card was hidden and the field
                            is no longer collected on this page. */}
                      </Card.Body>
                    </Card>

                    <Card className="shadow-sm rounded-3 border-0 hbp-price-card">
                      <Card.Header className="bg-light py-2">
                        <h6 className="mb-0 fw-bold">Price Details</h6>
                      </Card.Header>
                      <Card.Body className="p-3">
                        {promoSummary && totalBefore !== roomSubtotal && (
                          <div className="hbp-summary-row">
                            <div className="hbp-summary-label text-muted">Standard Total</div>
                            <div className="hbp-summary-value text-decoration-line-through text-muted">
                              {formatPrice(totalBefore)}
                            </div>
                          </div>
                        )}
                        {promoSummary && (
                          <div className="hbp-summary-row">
                            <div className="hbp-summary-label text-success">Senior Discount</div>
                            <div className="hbp-summary-value text-success">{promoSummary}</div>
                          </div>
                        )}
                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">Room Subtotal</div>
                          <div className="hbp-summary-value">{formatPrice(roomSubtotal)}</div>
                        </div>
                        {/* Tourism Dirhams summary row hidden per request. */}
                        <hr className="my-2" />
                        <div className="hbp-summary-row fw-bold">
                          <div className="hbp-summary-label text-danger">New Total</div>
                          <div className="hbp-summary-value text-danger">
                            {formatPrice(totalAfter)}
                          </div>
                        </div>
                      </Card.Body>
                    </Card>

                    {/* Quotation — under the Price Details it quotes, above
                        the booking decision and Confirm Booking. */}
                    <QuotationPdfCard buildPayload={buildSeniorCitizenQuotationPayload} />

                    {/* Booking Confirmation — Book Now & Voucher Now / Later.
                        Placed directly above Confirm Booking. Shown only for
                        refundable, Available rates. */}
                    {showVoucherChoice && (
                      <Card className="p-3 mt-3 shadow-sm border-0">
                        <h6 className="mb-2 fw-bold text-primary">Booking Confirmation</h6>
                        <Form.Check
                          type="radio"
                          id="sc-book-voucher-now"
                          name="scBookingConfirmation"
                          label="Book and Pay Now"
                          value="Book & Voucher"
                          checked={bookingConfirmation === "Book & Voucher"}
                          onChange={(e) => setBookingConfirmation(e.target.value)}
                        />
                        <Form.Check
                          type="radio"
                          id="sc-book-voucher-later"
                          name="scBookingConfirmation"
                          label="Hold Room and Pay Later"
                          value="Book Now & Voucher later"
                          checked={bookingConfirmation === "Book Now & Voucher later"}
                          onChange={(e) => setBookingConfirmation(e.target.value)}
                        />
                      </Card>
                    )}

                    <div className="hbp-action-bar mt-3 d-flex gap-2">
                      <Button variant="outline-secondary"
                              onClick={() => navigate(-1)}
                              className="flex-grow-1">Back</Button>
                      <Button
                        variant="primary"
                        type="button"
                        onClick={openPolicyConsent}
                        disabled={noPaymentPathAvailable}
                        title={
                          noPaymentPathAvailable
                            ? "Booking cannot be completed — no payment method available for this agent."
                            : undefined
                        }
                        className="flex-grow-1"
                      >
                        Confirm Booking
                      </Button>
                    </div>
                  </div>
                </Col>
              </Row>

              {/* ── Step 1 — Policies + T&C consent modal ─────────────── */}
              <Modal show={showPolicyModal}
                     onHide={() => setShowPolicyModal(false)}
                     centered backdrop="static" size="lg" scrollable
                     dialogClassName="policy-modal">
                <Modal.Header closeButton className="policy-modal-header">
                  <Modal.Title className="policy-modal-title">
                    Hotel Policies &amp; Terms
                  </Modal.Title>
                </Modal.Header>
                <Modal.Body className="policy-modal-body">
                  {policiesLoading ? (
                    <div className="text-center py-4">
                      <Spinner size="sm" />
                      <div className="mt-2 text-muted small">Loading policies &amp; terms…</div>
                    </div>
                  ) : (
                    <>
                      <section className="policy-section">
                        <h6 className="policy-section-title">Cancellation Policy</h6>
                        {policyData?.policies?.cancellationPolicy?.length ? (
                          policyData.policies.cancellationPolicy.map((p, idx) => (
                            <div key={idx} className="policy-item">
                              <div className="policy-text">{p.policyText || "—"}</div>
                              {(p.fromDate || p.toDate) && (
                                <div className="policy-meta">
                                  Valid{" "}
                                  {p.fromDate ? new Date(p.fromDate).toLocaleDateString() : "—"}
                                  {" – "}
                                  {p.toDate ? new Date(p.toDate).toLocaleDateString() : "—"}
                                </div>
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="policy-empty">No cancellation policy specified.</div>
                        )}
                      </section>

                      <section className="policy-section">
                        <h6 className="policy-section-title">Amendment Policy</h6>
                        {policyData?.policies?.amendmentPolicy?.length ? (
                          policyData.policies.amendmentPolicy.map((p, idx) => (
                            <div key={idx} className="policy-item">
                              <div className="policy-text">{p.policyText || "—"}</div>
                              {(p.fromDate || p.toDate) && (
                                <div className="policy-meta">
                                  Valid{" "}
                                  {p.fromDate ? new Date(p.fromDate).toLocaleDateString() : "—"}
                                  {" – "}
                                  {p.toDate ? new Date(p.toDate).toLocaleDateString() : "—"}
                                </div>
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="policy-empty">No amendment policy specified.</div>
                        )}
                      </section>

                      <section className="policy-section">
                        <h6 className="policy-section-title">Child Policy</h6>
                        {policyData?.policies?.childPolicy?.length &&
                         policyData.policies.childPolicy.some((p) => p.policyText) ? (
                          policyData.policies.childPolicy.map((p, idx) => (
                            <div key={idx} className="policy-item">
                              <div className="policy-text">{p.policyText || "—"}</div>
                            </div>
                          ))
                        ) : (
                          <div className="policy-empty">No child policy specified.</div>
                        )}
                      </section>

                      <section className="policy-section policy-section-last">
                        <h6 className="policy-section-title">Terms &amp; Conditions</h6>
                        {termsAndConditions ? (
                          <div className="terms-content"
                               dangerouslySetInnerHTML={{ __html: termsAndConditions }} />
                        ) : (
                          <div className="policy-empty">
                            No terms &amp; conditions configured for this hotel.
                          </div>
                        )}
                      </section>
                    </>
                  )}
                </Modal.Body>
                <Modal.Footer className="policy-modal-footer">
                  <Form.Check type="checkbox" id="sc-policy-accept"
                              className="me-auto policy-accept-check"
                              label="I have read and accept the policies and terms & conditions"
                              checked={policyAccepted}
                              onChange={(e) => setPolicyAccepted(e.target.checked)} />
                  <Button variant="outline-secondary" size="sm"
                          onClick={() => setShowPolicyModal(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm"
                          disabled={!policyAccepted || policiesLoading}
                          onClick={() => {
                            setShowPolicyModal(false);
                            buildPayloadAndShowOrderSummary();
                          }}>
                    Proceed
                  </Button>
                </Modal.Footer>
              </Modal>

              {/* ── Step 2 — Order Summary modal ──────────────────────── */}
              <Modal show={showConfirmModal}
                     onHide={() => setShowConfirmModal(false)}
                     centered backdrop="static" size="lg"
                     dialogClassName="confirm-booking-modal">
                <Modal.Header closeButton className="bg-primary text-white py-2"
                              style={{ borderBottom: "none" }}>
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
                            <span className="text-dark">{pendingPayload.checkInDate}</span>
                          </p>
                        </Col>
                        <Col xs={6}>
                          <p className="mb-1">
                            <strong>Check-Out:</strong>
                            <br />
                            <span className="text-dark">{pendingPayload.checkOutDate}</span>
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
                            <strong>Verification:</strong> Senior Citizen (age 60+)
                            {pendingPayload.seniorCitizenIdFileName
                              ? ` — Proof: ${pendingPayload.seniorCitizenIdFileName}`
                              : ""}
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
                        {(() => {
                          const roomSub = pendingPayload.rooms.reduce((s, r) => s + r.rate, 0);
                          const td = Number(pendingPayload.tourismDirhams || 0);
                          const total = roomSub + td;
                          return (
                            <>
                              {pendingPayload.totalRateBeforeDiscount > roomSub && (
                                <div className="d-flex justify-content-between">
                                  <span>Standard Total</span>
                                  <span className="text-decoration-line-through text-muted">
                                    {formatPrice(pendingPayload.totalRateBeforeDiscount)}
                                  </span>
                                </div>
                              )}
                              {promoSummary && (
                                <div className="d-flex justify-content-between text-success">
                                  <span>Senior Citizen Discount</span>
                                  <span>{promoSummary}</span>
                                </div>
                              )}
                              <hr className="my-1" />
                              <div className="d-flex justify-content-between fw-bold">
                                <span>Total Payable</span>
                                <span>{formatPrice(total)}</span>
                              </div>
                            </>
                          );
                        })()}
                      </div>

                      <div className="mt-2 p-2 bg-white border rounded d-flex align-items-center">
                        <span className="me-2 d-inline-flex align-items-center justify-content-center"
                              style={{ width: 18, height: 18, borderRadius: "50%",
                                       background: "#16a34a", color: "#fff",
                                       fontSize: "0.7rem", fontWeight: 700, lineHeight: 1 }}
                              aria-hidden="true">✓</span>
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
                  <Button variant="outline-secondary"
                          onClick={() => setShowConfirmModal(false)}
                          disabled={isSubmitting}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={confirmBooking}
                          disabled={isSubmitting} className="px-4 fw-semibold">
                    {isSubmitting
                      ? <><Spinner size="sm" className="me-2" /> Processing…</>
                      : "Confirm"}
                  </Button>
                </Modal.Footer>
              </Modal>

              {/* ─── Insufficient credit + card disabled → block booking ───
                  Shown when the agent has no available credit AND the
                  AgentView "Allow Card payment mode" toggle is off. No
                  payment path exists, so the booking is turned away. Same
                  shape as HotelBookingPage / StudentBookingPage. */}
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
                  GovEmployeeBookingPage. The card renders the CC Avenue
                  logo from /public/ccavanue.png. */}
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
                          htmlFor={`senior-gw-${g.id}`}
                          className={`pg-option${
                            isSelected ? " pg-option-selected" : ""
                          }`}
                        >
                          <input
                            type="radio"
                            name="senior-payment-gateway"
                            id={`senior-gw-${g.id}`}
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
                      // Distinct from the dummy /payment/:gateway flow below
                      // — the browser fully navigates away to CC Avenue's
                      // hosted page and back, so the resume signal has to
                      // travel as a URL query param (React Router state
                      // doesn't survive a real cross-origin redirect). See
                      // the ccavenueOrderId branch in the resume effect
                      // above.
                      //
                      // For CC Avenue we DON'T rely on sessionStorage to
                      // reach the create call — the backend's /initiate
                      // stores the payload alongside the transaction row
                      // and /finalize-seniorcitizen replays it after
                      // payment. flowType tells the shared
                      // CCAvenueCheckoutPage to ask the backend for the
                      // SRCITIZEN_CREATE arm.
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
                            flowType: "SRCITIZEN_CREATE",
                            bookingPayload: onlinePayload,
                          },
                        });
                        return;
                      }

                      // Dummy /payment/:gateway flow (test/local only) —
                      // kept for parity with the other booking pages;
                      // no gateway currently routes through it because
                      // CCAvenue is the only PAYMENT_GATEWAYS entry.
                      try {
                        sessionStorage.setItem(
                          "seniorCitizenPendingCreatePayload",
                          JSON.stringify(onlinePayload),
                        );
                      } catch (e) {
                        console.error(
                          "Could not persist pending senior-citizen create payload",
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
          </Container>
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
