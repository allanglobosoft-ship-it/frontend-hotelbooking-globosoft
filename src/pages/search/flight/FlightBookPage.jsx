import React, { useEffect, useMemo, useState } from "react";
import {
  Card,
  Row,
  Col,
  Form,
  Button,
  Badge,
  Spinner,
  Alert,
  Modal,
} from "react-bootstrap";
import {
  FaUsers,
  FaPlaneDeparture,
  FaSuitcase,
  FaCheckCircle,
  FaShoppingCart,
  FaArrowLeft,
  FaInfoCircle,
  FaUserTie,
  FaCalendarAlt,
} from "react-icons/fa";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import Sidebar from "../../../components/Sidebar";
import TopBar from "../../../components/TopBar";
import axiosInstance from "../../../components/AxiosInstance";
import QuotationPdfCard from "../../../components/quotation/QuotationPdfCard";
// Reuses HotelBookingPage's right-sidebar classes (.hbp-sticky-summary,
// .hbp-summary-row/-label/-value, .hbp-price-card, .hbp-action-bar) so the
// flight and hotel booking pages' summary sidebars look like one product —
// same pattern FlightSearch.jsx already uses for HotelSearch.css.
import "../../../styles/HotelBookingPage.css";

// Fixed localStorage key used by FlightBestPriceCheck to hand off the
// selected fare payload across the new-tab boundary. MUST match the
// constant of the same name in FlightBestPriceCheck.jsx.
const FBP_PAYLOAD_STORAGE_KEY = "fbp:pendingPayload";

/*
 * FlightBookPage — /new-booking/flightBookPage
 *
 * Reached from the "Book Now" button on /new-booking/flightBestPriceCheck.
 * The selected fare, flight recommendation and passenger counts arrive via
 * React Router state.
 *
 * Layout mirrors HotelBookingPage's shape (two-column with a sticky Trip
 * Total on the right) so the two flows feel coherent, but the passenger
 * card is closer to the reference screenshot the user shared: one card per
 * passenger, Salutation / First / Middle / Last / Contact / Email / Gender
 * / DOB / Address per adult. Children and infants get the same card minus
 * the contact/email fields — those are always collected on the primary
 * (first adult) guest per booking convention.
 *
 * Submit → POST /api/amadeus/bookFlight. On success: modal shows the
 * PNR record locator. On failure: inline alert with the Amadeus error.
 */

const SALUTATIONS = ["Mr", "Mrs", "Ms", "Miss", "Master", "Dr"];
const GENDERS = ["Male", "Female", "Other"];

const emptyPassenger = (type) => ({
  salutation: "",
  firstName: "",
  middleName: "",
  lastName: "",
  contactNumber: "",
  email: "",
  gender: "",
  dateOfBirth: "",
  address: "",
  type, // ADT / CHD / INF
});

/** Amadeus PTC → human label used in card headings. */
const paxLabel = (type, ordinal) => {
  if (type === "CHD") return `Child (Passenger ${ordinal})`;
  if (type === "INF") return `Infant (Passenger ${ordinal})`;
  return `Adult (Passenger ${ordinal})`;
};

/** Amadeus salutation → PNR-title (2-4 upper-case letters). */
const salutationToTitle = (s) => {
  if (!s) return "";
  const m = String(s).trim().toUpperCase();
  if (m === "MASTER") return "MSTR";
  return m;
};

const fmtAmount = (v) => {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const parseIso = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

const fmtWeekdayDate = (iso) => {
  const d = parseIso(iso);
  if (!d) return "—";
  return d.toLocaleDateString([], {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const fmtTime = (iso) => {
  const d = parseIso(iso);
  if (!d) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
};

const durationText = (fromIso, toIso) => {
  const a = parseIso(fromIso);
  const b = parseIso(toIso);
  if (!a || !b) return "—";
  const mins = Math.max(0, Math.round((b - a) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
};

const FlightBookPage = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // "Book Now" now opens this page in a NEW tab (see FlightBestPriceCheck),
  // so the fare payload can't travel via React Router in-memory state —
  // a fresh tab has no access to it. It's stashed in localStorage under a
  // fixed key by the opener; we read it once on mount as a fallback for
  // whichever field location.state doesn't have. The useEffect below
  // removes the entry once so it doesn't leak into an unrelated visit.
  const storedPayload = useMemo(() => {
    try {
      const raw = localStorage.getItem(FBP_PAYLOAD_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.removeItem(FBP_PAYLOAD_STORAGE_KEY);
    } catch (e) {
      /* ignore — nothing to clean up if storage is unavailable */
    }
  }, []);

  const rec = location.state?.rec || storedPayload?.rec || null;
  const fare = location.state?.fare || storedPayload?.fare || null;
  const selectedFamily = location.state?.selectedFamily || storedPayload?.selectedFamily || null;
  const pax = location.state?.pax || storedPayload?.pax || { adult: 1, children: 0, infant: 0 };
  // agentId flows in via router state or the URL query — used to stamp
  // the persisted flight_booking row for the agent booking list.
  const searchParams = new URLSearchParams(location.search);
  const agentId = location.state?.agentId
    || storedPayload?.agentId
    || searchParams.get("agentId")
    || "";

  const adultCount = Math.max(1, Number(pax.adult ?? 1) || 1);
  const childrenCount = Math.max(0, Number(pax.children ?? 0) || 0);
  const infantCount = Math.max(0, Number(pax.infant ?? 0) || 0);
  const totalPax = adultCount + childrenCount + infantCount;

  // ── Passenger form state ─────────────────────────────────────────────
  const [passengers, setPassengers] = useState(() => {
    const list = [];
    for (let i = 0; i < adultCount; i++) list.push(emptyPassenger("ADT"));
    for (let i = 0; i < childrenCount; i++) list.push(emptyPassenger("CHD"));
    for (let i = 0; i < infantCount; i++) list.push(emptyPassenger("INF"));
    return list;
  });

  // ── Customer form state ──────────────────────────────────────────────
  // The customer is who's BOOKING the flight — may differ from the
  // travellers themselves (common when an agent books for a client).
  // When "sameAsPrimary" is true, the fields are grayed out and the
  // primary passenger's contact + name are used for the booking record.
  const [customer, setCustomer] = useState({
    sameAsPrimary: true,
    firstName: "",
    lastName: "",
    email: "",
    contactNumber: "",
    address: "",
    company: "",
    taxId: "",
  });

  // ── Payment form state ───────────────────────────────────────────────
  // Card details are NEVER stored client-side beyond this component's
  // lifetime — we send them to the backend on submit and rely on the
  // browser to garbage-collect the form state. The backend forwards
  // card + CVV to Amadeus's FOP call, wipes them from its DTO, and
  // persists only PCI-safe metadata (card type + last 4 digits + expiry).
  const [payment, setPayment] = useState({
    mode: "CREDITLIMIT",
    cardType: "",
    cardNumber: "",
    securityId: "",
    cardholderName: "",
    expiryMonth: "",
    expiryYear: "",
    transactionReference: "",
  });
  const setPaymentField = (key, value) =>
    setPayment((p) => ({ ...p, [key]: value }));

  // ── Agent payment-eligibility state ──────────────────────────────────
  // Mirrors HotelBookingPage's rule set — payment mode is driven by
  //   1) whether the agent has sufficient credit for this fare, AND
   // 2) whether the agent's profile has Card payment enabled.
  // Both are fetched from the same /api/agent-credit-limit + /api/agent
  // endpoints the hotel page uses, so a single agent config drives both
  // product types consistently.
  const [agentAvailableBalance, setAgentAvailableBalance] = useState(null);
  const [agentCardPaymentEnabled, setAgentCardPaymentEnabled] =
    useState(false);

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [confirmation, setConfirmation] = useState(null); // { pnr, warnings[] }

  // If the router state is missing (e.g. direct visit), send the user back
  // to the search page — the booking is anchored to the just-priced fare.
  useEffect(() => {
    if (!rec || !fare) {
      toast.error(
        "No flight in progress. Please pick a flight from search first.",
      );
      const t = setTimeout(() => navigate("/new-booking/flight"), 1500);
      return () => clearTimeout(t);
    }
  }, [rec, fare, navigate]);

  // Auto-redirect to the Flight Bookings list once a confirmation lands,
  // mirroring the hotel booking flow (HotelBookingPage → hotel-booking-list).
  // Short delay so the agent still sees the PNR + e-ticket numbers in the
  // success modal; the "View All Bookings" button remains for an immediate
  // jump, and "New Search" cancels the pending navigation.
  useEffect(() => {
    if (!confirmation) return;
    const t = setTimeout(
      () => navigate("/booking-details/flight-booking-list"),
      3500,
    );
    return () => clearTimeout(t);
  }, [confirmation, navigate]);

  // ── Trip Summary helpers (from rec / selectedFamily / fare) ──────────
  const summary = useMemo(() => {
    if (!rec?.legs?.length) return null;
    const flat = rec.legs.flatMap((l) => l.segments || []);
    if (!flat.length) return null;
    const first = flat[0];
    const last = flat[flat.length - 1];
    const stops = flat.length - 1;
    const carrier = first.marketingCarrier || rec.validatingCarrier || "";
    const airline = first.airLineName || carrier;
    return {
      fromCity: first.departureCityName,
      fromCode: first.departureAirportCode || first.from,
      fromAirport: first.airportName, // if backend enriches later
      fromTerminal: first.departureTerminal,
      toCity: last.arrivalCityName,
      toCode: last.arrivalAirportCode || last.to,
      toTerminal: last.arrivalTerminal,
      departure: first.departureDateTime,
      arrival: last.arrivalDateTime,
      duration: durationText(first.departureDateTime, last.arrivalDateTime),
      stopsLabel: stops === 0 ? "Nonstop" : stops === 1 ? "1 stop" : `${stops} stops`,
      airline,
      carrier,
      flightNumber: first.flightNumber,
      equipment: first.aircraft,
      cabinBaggage:
        selectedFamily?.baggage?.cabin ||
        fare?.baggageDetails?.cabinBaggage ||
        "7 Kgs / Adult",
      checkinBaggage:
        selectedFamily?.baggage?.checkin ||
        fare?.baggageDetails?.checkinBaggage ||
        "As per airline",
      refundable:
        (fare?.refundable === false ||
          /non-?refundable/i.test(fare?.fareType || "")) === true
          ? false
          : true,
      allSegments: flat,
    };
  }, [rec, fare, selectedFamily]);

  const currency = fare?.currency || selectedFamily?.currency || "AED";
  // Sell price (marked-up) is what the agent is actually charged — matches
  // the price shown as "Total Price" on Best Price Check. Falls back to the
  // raw totalFare only if the backend didn't compute markup.
  const total =
    Number(
      fare?.totalRateWithMarkup ?? fare?.totalFare ?? selectedFamily?.price ?? 0,
    ) * (Number.isFinite(totalPax) && totalPax > 0 ? 1 : 1);
  // Note: fare.totalFare is already the total for all passengers on TIPNR
  // (Amadeus totals per recommendation), so we do NOT multiply by pax count.

  // ── Agent balance + card-eligibility fetch (matches HotelBookingPage) ──
  // Effective available credit = regular available balance + any Temporary
  // Credit currently active. Same endpoint the hotel booking page uses so
  // the two flows agree on the agent's spending power.
  useEffect(() => {
    if (!agentId) {
      setAgentAvailableBalance(null);
      return;
    }
    let cancelled = false;
    axiosInstance
      .get(`/api/agent-credit-limit/agent/${agentId}`)
      .then((res) => {
        if (cancelled) return;
        const combined =
          res?.data?.effectiveAvailableCreditLimit ??
          res?.data?.availableCreditLimit ??
          null;
        setAgentAvailableBalance(combined);
      })
      .catch(() => {
        // 404 (no credit-limit row for the agent) → treat as Cash Agent
        // by leaving the balance at null, which fails the sufficient-credit
        // check and pushes the UI onto the Card path (if enabled).
        if (!cancelled) setAgentAvailableBalance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  useEffect(() => {
    if (!agentId) {
      setAgentCardPaymentEnabled(false);
      return;
    }
    let cancelled = false;
    axiosInstance
      .get(`/api/agent/${agentId}`)
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
  }, [agentId]);

  // Sufficient credit = agent's available balance covers the fare total.
  // Null while loading so the UI doesn't flash the wrong scenario.
  const hasSufficientCredit = useMemo(() => {
    if (agentAvailableBalance == null) return null;
    return Number(agentAvailableBalance) >= Number(total || 0);
  }, [agentAvailableBalance, total]);

  // Payment mode options — three scenarios per client spec (identical to
  // HotelBookingPage): sufficient credit → Credit Limit only; insufficient
  // + card enabled → Card only; insufficient + card disabled → no options
  // (booking blocked). While balance is loading (null) fall back to Credit
  // Limit so nothing flashes empty.
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

  const noPaymentPathAvailable =
    hasSufficientCredit === false && !agentCardPaymentEnabled;

  // Keep the selected mode valid as the options change (e.g. balance
  // loads and reveals the agent is on Card-only).
  useEffect(() => {
    if (paymentModeOptions.length === 0) return;
    if (!paymentModeOptions.some((o) => o.value === payment.mode)) {
      setPayment((p) => ({ ...p, mode: paymentModeOptions[0].value }));
    }
  }, [paymentModeOptions, payment.mode]);

  // ── Handlers ─────────────────────────────────────────────────────────
  const setField = (idx, key, value) => {
    setPassengers((prev) => {
      const next = prev.slice();
      next[idx] = { ...next[idx], [key]: value };
      return next;
    });
    // Clear the field's error the moment the user starts typing.
    setErrors((prev) => {
      const k = `${idx}.${key}`;
      if (!(k in prev)) return prev;
      const clone = { ...prev };
      delete clone[k];
      return clone;
    });
  };

  const setCustomerField = (key, value) => {
    setCustomer((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const k = `customer.${key}`;
      if (!(k in prev)) return prev;
      const clone = { ...prev };
      delete clone[k];
      return clone;
    });
  };

  const validate = () => {
    const errs = {};
    passengers.forEach((p, i) => {
      const isAdult = p.type === "ADT";
      const isPrimary = i === 0;

      if (!p.salutation) errs[`${i}.salutation`] = "Required";
      if (!p.firstName?.trim()) errs[`${i}.firstName`] = "Required";
      if (!p.lastName?.trim()) errs[`${i}.lastName`] = "Required";
      if (!p.gender) errs[`${i}.gender`] = "Required";
      if (!p.dateOfBirth) {
        // DOB is truly Amadeus-mandatory for CHD/INF; recommended for ADT
        // so we can compute age for pricing sanity checks.
        errs[`${i}.dateOfBirth`] = "Required";
      }
      // Contact + email required on the primary passenger ONLY when the
      // customer section is set to "same as primary" — otherwise the
      // customer section carries them.
      if (isPrimary && customer.sameAsPrimary) {
        if (!p.contactNumber?.trim()) {
          errs[`${i}.contactNumber`] = "Contact required on primary passenger";
        }
        if (!p.email?.trim()) {
          errs[`${i}.email`] = "Email required on primary passenger";
        } else if (!/^\S+@\S+\.\S+$/.test(p.email.trim())) {
          errs[`${i}.email`] = "Enter a valid email";
        }
      }
      // Basic DOB sanity — infants under 2, children 2-11, adults 12+
      if (p.dateOfBirth) {
        const dob = new Date(p.dateOfBirth);
        const now = new Date();
        const ageYears = (now - dob) / (365.25 * 24 * 3600 * 1000);
        if (Number.isFinite(ageYears)) {
          if (p.type === "INF" && ageYears >= 2) {
            errs[`${i}.dateOfBirth`] = "Infant must be under 2 years";
          } else if (p.type === "CHD" && (ageYears < 2 || ageYears >= 12)) {
            errs[`${i}.dateOfBirth`] = "Child must be 2–11 years";
          } else if (isAdult && ageYears < 12) {
            errs[`${i}.dateOfBirth`] = "Adult must be 12+ years";
          }
        }
      }
    });

    // Customer section — only validate when NOT using primary passenger.
    if (!customer.sameAsPrimary) {
      if (!customer.firstName?.trim()) {
        errs["customer.firstName"] = "Customer first name is required";
      }
      if (!customer.lastName?.trim()) {
        errs["customer.lastName"] = "Customer last name is required";
      }
      if (!customer.email?.trim()) {
        errs["customer.email"] = "Customer email is required";
      } else if (!/^\S+@\S+\.\S+$/.test(customer.email.trim())) {
        errs["customer.email"] = "Enter a valid email";
      }
      if (!customer.contactNumber?.trim()) {
        errs["customer.contactNumber"] = "Customer contact number is required";
      }
    }

    // Payment section — always required; card fields required only for CARD mode.
    if (!payment.mode) {
      errs["payment.mode"] = "Select a payment mode";
    } else if (payment.mode === "CARD") {
      if (!payment.cardType) errs["payment.cardType"] = "Card type is required";
      const pan = (payment.cardNumber || "").replace(/\D/g, "");
      if (!pan) errs["payment.cardNumber"] = "Card number is required";
      else if (pan.length < 13 || pan.length > 19) {
        errs["payment.cardNumber"] = "Card number must be 13–19 digits";
      }
      if (!payment.securityId?.trim()) {
        errs["payment.securityId"] = "CVV is required";
      } else if (!/^\d{3,4}$/.test(payment.securityId.trim())) {
        errs["payment.securityId"] = "CVV must be 3–4 digits";
      }
      if (!payment.cardholderName?.trim()) {
        errs["payment.cardholderName"] = "Cardholder name is required";
      }
      const mm = parseInt(payment.expiryMonth, 10);
      const yy = parseInt(payment.expiryYear, 10);
      if (!mm || mm < 1 || mm > 12) errs["payment.expiryMonth"] = "MM 1–12";
      if (!yy) errs["payment.expiryYear"] = "YYYY required";
      else if (yy < new Date().getFullYear() || yy > new Date().getFullYear() + 20) {
        errs["payment.expiryYear"] = "Expiry year out of range";
      } else if (mm && yy === new Date().getFullYear() && mm < new Date().getMonth() + 1) {
        errs["payment.expiryMonth"] = "Card is expired";
      }
    }
    return errs;
  };

  const buildPayload = () => {
    // The backend re-computes segments from rec.legs; we mirror the same
    // shape FlightBestPriceCheck used to build the pricing request, plus
    // the extra display/persistence fields (fromCity/toCity/arrival/cabin/
    // fareBasis) that the backend writes verbatim onto flight_booking_segment.
    const legs = (rec?.legs || []).map((leg) => ({
      origin: leg.from || leg.segments?.[0]?.departureAirportCode,
      destination:
        leg.to ||
        leg.segments?.[leg.segments.length - 1]?.arrivalAirportCode,
      segments: (leg.segments || []).map((s) => {
        // bookingClass fallback — same convention as the pricing call.
        const bookingClassFallback =
          s.bookingClass ||
          (s.fareBasis && s.fareBasis.length > 0 ? s.fareBasis.charAt(0) : "Y");
        return {
          from: s.departureAirportCode || s.from,
          to: s.arrivalAirportCode || s.to,
          fromCity: s.departureCity || s.fromCity || null,
          toCity: s.arrivalCity || s.toCity || null,
          departureDateTime: s.departureDateTime,
          arrivalDateTime: s.arrivalDateTime || null,
          marketingCarrier: s.marketingCarrier,
          operatingCarrier: s.operatingCarrier || s.marketingCarrier,
          flightNumber: s.flightNumber,
          bookingClass: bookingClassFallback,
          cabin: s.cabin || null,
          fareBasis: s.fareBasis || null,
        };
      }),
    }));

    const primary = passengers[0];
    // Contact + receivedFrom come from the customer section when the
    // booker is a separate entity; otherwise fall back to the primary
    // passenger's own details. Whichever source we use is what Amadeus
    // stores on the AP + RF elements of the PNR.
    const useCustomer = !customer.sameAsPrimary;
    const contactEmail = useCustomer
      ? customer.email?.trim()
      : primary?.email?.trim();
    const contactPhone = useCustomer
      ? customer.contactNumber?.trim()
      : primary?.contactNumber?.trim();
    const receivedFromRaw = useCustomer
      ? [customer.firstName, customer.lastName].filter(Boolean).join(" ")
      : [primary?.firstName, primary?.lastName].filter(Boolean).join(" ");

    // Trip type inferred from leg count — matches how the search page
    // classifies journeys so the persisted flight_booking.trip_type is
    // consistent with the original search.
    const tripType =
      legs.length <= 1 ? "ONE_WAY" : legs.length === 2 ? "ROUND_TRIP" : "MULTI_CITY";

    // Fare snapshot — the customer-facing amount the user agreed to on
    // Best Price Check. The backend writes this verbatim onto
    // flight_booking_fare so the agent view can show the quoted price
    // until Fare_PricePNRWithBookingClass is wired for authoritative amounts.
    const fareSnapshot = fare
      ? {
          fareFamily:
            selectedFamily?.name || fare.fareFamily || fare.fareBasis || null,
          currency: fare.currency || selectedFamily?.currency || null,
          baseFare:
            fare.baseFare ?? fare.base ?? selectedFamily?.baseFare ?? null,
          taxAmount:
            fare.taxAmount ?? fare.tax ?? selectedFamily?.taxAmount ?? null,
          // Sell price (marked-up) — the amount the customer actually
          // agreed to pay, matching the "Total Price" shown on Best Price
          // Check and the Trip Total on this page.
          totalFare:
            fare.totalRateWithMarkup ??
            fare.totalFare ??
            fare.total ??
            selectedFamily?.price ??
            null,
          refundable:
            selectedFamily?.refundable ??
            fare.refundable ??
            null,
          fareBasis: fare.fareBasis || selectedFamily?.fareBasis || null,
        }
      : null;

    // Payment — only include card fields when the mode is CARD, so we
    // don't accidentally send PAN/CVV keys for cash/credit-limit bookings.
    const paymentInfo =
      payment.mode === "CARD"
        ? {
            mode: "CARD",
            cardType: payment.cardType,
            cardNumber: (payment.cardNumber || "").replace(/\s+/g, ""),
            securityId: payment.securityId?.trim(),
            cardholderName: payment.cardholderName?.trim(),
            expiryMonth: payment.expiryMonth,
            expiryYear: payment.expiryYear,
          }
        : {
            mode: payment.mode,
            transactionReference:
              payment.transactionReference?.trim() || null,
          };

    return {
      agentId: agentId || null,
      tripType,
      adult: adultCount,
      children: childrenCount,
      infant: infantCount,
      legs,
      passengers: passengers.map((p) => ({
        title: salutationToTitle(p.salutation),
        firstName: p.firstName?.trim(),
        middleName: p.middleName?.trim() || null,
        lastName: p.lastName?.trim(),
        type: p.type,
        dateOfBirth: p.dateOfBirth || null,
        gender: p.gender || null,
        address: p.address?.trim() || null,
        contactNumber: p.contactNumber?.trim() || null,
        email: p.email?.trim() || null,
      })),
      contactEmail: contactEmail || null,
      contactPhone: contactPhone || null,
      receivedFrom: receivedFromRaw.trim().toUpperCase() || "PASSENGER",
      fareSnapshot,
      paymentInfo,
    };
  };

  const onConfirm = async (e) => {
    e?.preventDefault();
    setServerError(null);
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.error("Please fill in the highlighted fields.");
      // Scroll to the first invalid field for accessibility.
      const firstKey = Object.keys(errs)[0];
      const el = document.querySelector(`[data-field='${firstKey}']`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSubmitting(true);
    try {
      const payload = buildPayload();
      // Override AxiosInstance's global 30s timeout — bookFlight chains 6
      // sequential Amadeus SOAP calls server-side (Sell, PNR Add, Price
      // PNR, Create TST, Issue Ticket, End Transact) behind one HTTP
      // request, so it needs the longest ceiling of any Amadeus call here.
      const res = await axiosInstance.post(
        "/api/amadeus/bookFlight",
        payload,
        { timeout: 120000 },
      );
      const data = res?.data || {};
      if (data.success && data.pnrRecordLocator) {
        // Wipe sensitive card fields from local state as soon as the
        // booking succeeds — no reason for the PAN/CVV to sit in React
        // memory after the FOP call is done.
        setPayment((p) => ({ ...p, cardNumber: "", securityId: "" }));
        setConfirmation({
          pnr: data.pnrRecordLocator,
          bookingId: data.bookingId || null,
          persistenceStatus: data.persistenceStatus || null,
          ticketNumbers: data.ticketNumbers || [],
          warnings: data.warnings || [],
        });
      } else {
        // Business failure — server returned 200 with success=false.
        setServerError(
          data.errorMessage ||
            "Booking failed. Please try again or pick another fare.",
        );
        toast.error("Booking failed");
      }
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Booking failed — please try again.";
      setServerError(msg);
      toast.error("Booking failed");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Quotation PDF ────────────────────────────────────────────────────
  // Quotes what the Flight Summary and Price Details cards show: the route,
  // every segment of the selected recommendation, passengers, baggage and
  // the sell-price Total (the net fare is never put on the quotation).
  const buildFlightQuotationPayload = () => {
    if (!rec || !fare) return null;
    const legs = Array.isArray(rec.legs) ? rec.legs : [];
    const legEnds = legs
      .map((leg) => {
        const segs = Array.isArray(leg?.segments) ? leg.segments : [];
        if (!segs.length) return null;
        const first = segs[0];
        const last = segs[segs.length - 1];
        return {
          from: first.departureAirportCode || first.from || "",
          to: last.arrivalAirportCode || last.to || "",
        };
      })
      .filter(Boolean);
    const tripType =
      legEnds.length <= 1
        ? "One way"
        : legEnds.length === 2 && legEnds[1].to === legEnds[0].from
          ? "Return"
          : "Multi-city";
    const paxSummary = `${adultCount} Adult${adultCount !== 1 ? "s" : ""}${
      childrenCount
        ? `, ${childrenCount} Child${childrenCount !== 1 ? "ren" : ""}`
        : ""
    }${infantCount ? `, ${infantCount} Infant${infantCount !== 1 ? "s" : ""}` : ""}`;

    // Prepared For: the separate booker when "Same as Primary" is unticked,
    // otherwise the primary passenger — only once a name has been typed.
    const primary = passengers[0] || {};
    const useCustomer = !customer.sameAsPrimary;
    const names = (
      useCustomer
        ? [customer.firstName, customer.lastName]
        : [primary.firstName, primary.middleName, primary.lastName]
    )
      .map((p) => (p ? String(p).trim() : ""))
      .filter(Boolean);
    const customerName = names.length
      ? [useCustomer ? "" : primary.salutation || "", ...names]
          .filter(Boolean)
          .join(" ")
      : "";

    const segments = legs.flatMap((leg) =>
      Array.isArray(leg?.segments) ? leg.segments : [],
    );
    const flexibility = selectedFamily?.flexibility || fare.flexibility || {};
    const cancellationPolicy = [
      typeof flexibility.cancellation === "string" && flexibility.cancellation
        ? `Cancellation: ${flexibility.cancellation}`
        : "",
      typeof flexibility.dateChange === "string" && flexibility.dateChange
        ? `Date change: ${flexibility.dateChange}`
        : "",
    ].filter(Boolean);
    if (!cancellationPolicy.length && summary) {
      cancellationPolicy.push(
        summary.refundable
          ? "Refundable fare - cancellation charges as per the airline fare rules."
          : "Non-refundable fare.",
      );
    }

    return {
      bookingType: "FLIGHT",
      agentId: Number(agentId) || null,
      currency,
      serviceName:
        legEnds.map((l) => `${l.from} to ${l.to}`).join(", ") || "Flight",
      serviceSubtitle: [summary?.airline, tripType].filter(Boolean).join(", "),
      customerName: customerName || null,
      customerEmail: customerName
        ? ((useCustomer ? customer.email : primary.email) || "").trim() || null
        : null,
      customerMobile: customerName
        ? ((useCustomer ? customer.contactNumber : primary.contactNumber) || "").trim() ||
          null
        : null,
      details: [
        { label: "Trip", value: tripType },
        { label: "Airline", value: summary?.airline || "" },
        {
          label: "Departure",
          value: summary
            ? `${fmtWeekdayDate(summary.departure)}, ${fmtTime(summary.departure)}`
            : "",
        },
        { label: "Passengers", value: paxSummary },
        { label: "Cabin Baggage", value: summary?.cabinBaggage || "" },
        { label: "Check-In Baggage", value: summary?.checkinBaggage || "" },
        { label: "Fare Family", value: fare.fareFamily || "" },
        {
          label: "Fare Type",
          value: summary ? (summary.refundable ? "Refundable" : "Non-Refundable") : "",
        },
      ],
      priceItems: [
        {
          description: "Airfare",
          details: `${paxSummary}${fare.fareFamily ? `, ${fare.fareFamily} fare` : ""}`,
          amount: total,
        },
      ],
      totalAmount: total,
      itineraryTitle: "Flight Itinerary",
      itineraryDayLabel: "#",
      itinerary: segments.map((seg, i) => ({
        day: i + 1,
        heading: `${seg.airLineName ? `${seg.airLineName} ` : ""}${
          seg.marketingCarrier || ""
        }${seg.flightNumber || ""}`.trim(),
        place: `${seg.departureAirportCode || seg.from || ""} to ${
          seg.arrivalAirportCode || seg.to || ""
        }`,
        activities: [
          `Departs ${fmtWeekdayDate(seg.departureDateTime)}, ${fmtTime(seg.departureDateTime)}${
            seg.departureTerminal ? ` (Terminal ${seg.departureTerminal})` : ""
          }`,
          `Arrives ${fmtWeekdayDate(seg.arrivalDateTime)}, ${fmtTime(seg.arrivalDateTime)}${
            seg.arrivalTerminal ? ` (Terminal ${seg.arrivalTerminal})` : ""
          }`,
          seg.cabin ? `Cabin: ${seg.cabin}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      })),
      cancellationPolicy,
      notes:
        typeof fare.lastTicketingDate === "string" && fare.lastTicketingDate
          ? [`Last ticketing date: ${fare.lastTicketingDate}`]
          : [],
    };
  };

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div>
      <TopBar />
      <div style={{ display: "flex", minHeight: "calc(100vh - 60px)" }}>
        <Sidebar />
        <main style={{ flex: 1, padding: "24px", background: "#f7f8fa" }}>
          <div className="d-flex align-items-center gap-3 mb-3">
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => navigate(-1)}
              disabled={submitting}
            >
              <FaArrowLeft style={{ marginRight: 6 }} />
              Back
            </Button>
            <h4 style={{ margin: 0 }}>
              <FaShoppingCart style={{ marginRight: 8, color: "#e11d48" }} />
              Flight Booking
            </h4>
          </div>

          <Form onSubmit={onConfirm}>
            <Row className="g-4">
              {/* ── Left column: Passenger Details ──
                  Trip Summary lives only in the right-side "Flight Summary"
                  card now (see below) — no need to show the same itinerary
                  twice on this page. */}
              <Col lg={8}>
                {/* Passenger Details */}
                <Card className="shadow-sm" style={{ borderRadius: 12 }}>
                  <Card.Body>
                    <div className="d-flex align-items-center mb-3">
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 8,
                          background: "#e11d48",
                          color: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          marginRight: 10,
                        }}
                      >
                        <FaUsers />
                      </div>
                      <h5 className="mb-0">Passenger Details</h5>
                    </div>

                    {serverError && (
                      <Alert
                        variant="danger"
                        className="mb-3"
                        onClose={() => setServerError(null)}
                        dismissible
                      >
                        <strong>Booking failed.</strong> {serverError}
                      </Alert>
                    )}

                    {/* One PassengerCard per traveller — ADT counted first, then CHD, then INF */}
                    {passengers.map((p, idx) => (
                      <PassengerCard
                        key={idx}
                        idx={idx}
                        p={p}
                        errors={errors}
                        setField={setField}
                        ordinal={
                          // Ordinal within its own type — Adult 1..N, Child 1..N, Infant 1..N
                          passengers
                            .slice(0, idx + 1)
                            .filter((q) => q.type === p.type).length
                        }
                        isPrimary={idx === 0}
                      />
                    ))}
                  </Card.Body>
                </Card>

                {/* Customer Details — sits BELOW Passenger Details per
                    user preference. When "Same as Primary Passenger" is
                    ticked (the default), the fields collapse and the
                    booking uses the primary passenger's email + phone +
                    name for the AP + RF elements on the PNR. Untick to
                    capture a separate booker identity. */}
                <div className="mt-4">
                  <CustomerDetailsCard
                    customer={customer}
                    setCustomerField={setCustomerField}
                    errors={errors}
                  />
                </div>

                {/* Payment — mode picker + card fields. Rendered after
                    Customer Details so the agent reviews traveller info
                    before entering payment. Card fields autoComplete=off
                    and never persist beyond this component. */}
                <div className="mt-4">
                  <PaymentSection
                    payment={payment}
                    setPaymentField={setPaymentField}
                    errors={errors}
                    paymentModeOptions={paymentModeOptions}
                    noPaymentPathAvailable={noPaymentPathAvailable}
                    agentAvailableBalance={agentAvailableBalance}
                    currency={currency}
                  />
                </div>
              </Col>

              {/* ── Right column: Flight Summary + Price Details (sticky) ──
                  Mirrors HotelBookingPage's right sidebar layout exactly:
                  a "Booking Summary"-style card with a colored header bar
                  and icon+label detail rows, a separate "Price Details"
                  card with the total, then a sticky action bar — reusing
                  HotelBookingPage.css's .hbp-* classes so both booking
                  flows look like one product. */}
              <Col lg={4}>
                <div className="hbp-sticky-summary">
                  <Card className="shadow-sm rounded-3 mb-3 booking-summary-card border-0 overflow-hidden">
                    <Card.Header className="bg-primary text-white py-2 rounded-top">
                      <h6 className="mb-0 d-flex align-items-center">
                        <FaPlaneDeparture className="me-2" /> Flight Summary
                      </h6>
                    </Card.Header>
                    <Card.Body className="p-3">
                      {summary && (
                        <div className="mb-3">
                          <div className="fw-bold text-primary mb-1">
                            {summary.fromCity ? `${summary.fromCity} ` : ""}
                            ({summary.fromCode}) → {summary.toCity ? `${summary.toCity} ` : ""}
                            ({summary.toCode})
                          </div>
                          <div className="text-muted small mb-2">
                            {summary.airline}
                            {summary.carrier
                              ? ` · ${summary.carrier}${summary.flightNumber || ""}`
                              : ""}
                            {summary.equipment ? ` · ${summary.equipment}` : ""}
                          </div>
                          <div className="d-flex flex-wrap align-items-center gap-2">
                            <span className="badge bg-light text-dark border">
                              {summary.stopsLabel}
                            </span>
                            <span className="badge bg-light text-dark border">
                              {summary.duration}
                            </span>
                            <span
                              className={`badge ${summary.refundable ? "bg-success" : "bg-danger"}`}
                            >
                              {summary.refundable ? "Refundable" : "Non-Refundable"}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="hbp-summary-row align-items-start">
                        <div className="hbp-summary-label">
                          <FaCalendarAlt className="me-2 text-primary" />
                          Departure
                        </div>
                        <div className="hbp-summary-value text-end">
                          {summary
                            ? `${fmtWeekdayDate(summary.departure)}, ${fmtTime(summary.departure)}`
                            : "—"}
                          {summary?.fromTerminal && (
                            <div className="text-muted" style={{ fontSize: 11, fontWeight: 400 }}>
                              {summary.fromCode}, Terminal {summary.fromTerminal}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="hbp-summary-row align-items-start">
                        <div className="hbp-summary-label">
                          <FaCalendarAlt className="me-2 text-primary" />
                          Arrival
                        </div>
                        <div className="hbp-summary-value text-end">
                          {summary
                            ? `${fmtWeekdayDate(summary.arrival)}, ${fmtTime(summary.arrival)}`
                            : "—"}
                          {summary?.toTerminal && (
                            <div className="text-muted" style={{ fontSize: 11, fontWeight: 400 }}>
                              {summary.toCode}, Terminal {summary.toTerminal}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="hbp-summary-row align-items-start">
                        <div className="hbp-summary-label">
                          <FaUsers className="me-2 text-primary" />
                          Passengers
                        </div>
                        <div className="hbp-summary-value text-end">
                          {adultCount} Adult{adultCount !== 1 ? "s" : ""}
                          {childrenCount
                            ? `, ${childrenCount} Child${childrenCount !== 1 ? "ren" : ""}`
                            : ""}
                          {infantCount
                            ? `, ${infantCount} Infant${infantCount !== 1 ? "s" : ""}`
                            : ""}
                        </div>
                      </div>
                      <div className="hbp-summary-row">
                        <div className="hbp-summary-label">
                          <FaSuitcase className="me-2 text-primary" />
                          Cabin Baggage
                        </div>
                        <div className="hbp-summary-value text-end" style={{ fontSize: 12 }}>
                          {summary?.cabinBaggage || "As per airline"}
                        </div>
                      </div>
                      <div className="hbp-summary-row">
                        <div className="hbp-summary-label">
                          <FaSuitcase className="me-2 text-primary" />
                          Check-In Baggage
                        </div>
                        <div className="hbp-summary-value text-end" style={{ fontSize: 12 }}>
                          {summary?.checkinBaggage || "As per airline"}
                        </div>
                      </div>
                    </Card.Body>
                  </Card>

                  <Card className="shadow-sm rounded-3 border-0 hbp-price-card">
                    <Card.Header className="bg-light py-2">
                      <h6 className="mb-0 fw-bold">Price Details</h6>
                    </Card.Header>
                    <Card.Body className="p-3">
                      {fare?.totalFare != null && (
                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">Net Fare</div>
                          <div className="hbp-summary-value">
                            {currency} {fmtAmount(fare.totalFare)}
                          </div>
                        </div>
                      )}
                      {fare?.fareFamily && (
                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">Fare Family</div>
                          <div className="hbp-summary-value">{fare.fareFamily}</div>
                        </div>
                      )}
                      <hr className="my-2" />
                      <div className="hbp-summary-row fw-bold">
                        <div className="hbp-summary-label text-danger">Total</div>
                        <div className="hbp-summary-value text-danger" style={{ fontSize: 20 }}>
                          {currency} {fmtAmount(total)}
                        </div>
                      </div>
                    </Card.Body>
                  </Card>

                  {/* Quotation — under the Price Details it quotes, above the
                      Confirm Booking bar (a type="button", so it never
                      submits this form). */}
                  <QuotationPdfCard
                    buildPayload={buildFlightQuotationPayload}
                    disabled={!rec || !fare || submitting}
                  />

                  <div className="hbp-action-bar mt-3">
                    <Button
                      type="submit"
                      disabled={submitting || noPaymentPathAvailable}
                      className="w-100"
                      style={{
                        background: "#e11d48",
                        border: "none",
                        color: "#fff",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        padding: "12px",
                        fontSize: 15,
                        boxShadow: "0 4px 12px rgba(225, 29, 72, 0.35)",
                      }}
                      title={
                        noPaymentPathAvailable
                          ? "No payment path available for this agent"
                          : undefined
                      }
                    >
                      {submitting ? (
                        <>
                          <Spinner size="sm" animation="border" className="me-2" />
                          Booking…
                        </>
                      ) : (
                        "Confirm Booking"
                      )}
                    </Button>

                    <div
                      className="text-muted text-center mt-2"
                      style={{ fontSize: 11 }}
                    >
                      <FaInfoCircle className="me-1" />
                      By confirming you agree to the fare rules of the selected fare.
                    </div>
                  </div>
                </div>
              </Col>
            </Row>
          </Form>
        </main>
      </div>

      {/* Success modal — shows the PNR record locator */}
      <Modal
        show={!!confirmation}
        onHide={() => {}}
        centered
        backdrop="static"
      >
        <Modal.Header
          style={{
            background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
            color: "#fff",
          }}
        >
          <Modal.Title>
            <FaCheckCircle className="me-2" />
            Booking Confirmed
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-2">Your flight has been booked successfully.</p>
          <div
            style={{
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: 8,
              padding: 16,
              textAlign: "center",
              margin: "16px 0",
            }}
          >
            <div className="text-muted" style={{ fontSize: 12 }}>
              PNR RECORD LOCATOR
            </div>
            <div
              style={{
                fontSize: 30,
                fontWeight: 700,
                color: "#15803d",
                letterSpacing: 2,
                marginTop: 4,
              }}
            >
              {confirmation?.pnr}
            </div>
          </div>
          <div className="text-muted small">
            Please note your PNR number — you'll need it to view, modify, or
            cancel this booking.
          </div>
          {confirmation?.bookingId && (
            <div
              className="text-muted small mt-2"
              style={{ textAlign: "center" }}
            >
              Booking reference:{" "}
              <strong style={{ color: "#111" }}>
                #{confirmation.bookingId}
              </strong>
            </div>
          )}
          {confirmation?.ticketNumbers?.length > 0 && (
            <div
              className="mt-3"
              style={{
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                borderRadius: 8,
                padding: 12,
              }}
            >
              <div
                className="text-muted"
                style={{ fontSize: 11, marginBottom: 6 }}
              >
                E-TICKET NUMBER{confirmation.ticketNumbers.length > 1 ? "S" : ""}
              </div>
              {confirmation.ticketNumbers.map((tn, i) => (
                <div
                  key={i}
                  style={{
                    fontFamily: "monospace",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#1e40af",
                  }}
                >
                  {tn}
                </div>
              ))}
            </div>
          )}
          {confirmation?.persistenceStatus === "PENDING_SAVE" && (
            <Alert
              variant="warning"
              className="mt-3 mb-0"
              style={{ fontSize: 12 }}
            >
              <strong>Heads up:</strong> Your booking is confirmed with the
              airline but the local record needs manual reconciliation. Our
              team has been notified.
            </Alert>
          )}
          {confirmation?.warnings?.length > 0 && (
            <Alert variant="warning" className="mt-3 mb-0" style={{ fontSize: 12 }}>
              <strong>Please note:</strong>
              <ul className="mb-0 mt-1" style={{ paddingLeft: 18 }}>
                {confirmation.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Alert>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="outline-secondary"
            onClick={() => navigate("/new-booking/flight")}
          >
            New Search
          </Button>
          <Button
            variant="primary"
            onClick={() => navigate("/booking-details/flight-booking-list")}
          >
            View All Bookings
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

/* ── CustomerDetailsCard — booker's info (may differ from passengers) ─ */
const CustomerDetailsCard = ({ customer, setCustomerField, errors }) => {
  const err = (key) => errors[`customer.${key}`];
  const disabled = customer.sameAsPrimary;

  return (
    <Card
      className="mb-4 shadow-sm"
      style={{ borderRadius: 12 }}
    >
      <Card.Body>
        <div className="d-flex align-items-center justify-content-between flex-wrap mb-3">
          <div className="d-flex align-items-center">
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "#e11d48",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginRight: 10,
              }}
            >
              <FaUserTie />
            </div>
            <h5 className="mb-0">Customer Details</h5>
          </div>
          <Form.Check
            type="checkbox"
            id="customer-same-as-primary"
            label="Same as Primary Passenger"
            checked={customer.sameAsPrimary}
            onChange={(e) =>
              setCustomerField("sameAsPrimary", e.target.checked)
            }
            className="fw-semibold"
          />
        </div>

        <div
          className="text-muted mb-3"
          style={{ fontSize: 12, lineHeight: 1.5 }}
        >
          <FaInfoCircle className="me-1" />
          Customer is the person <strong>making the booking</strong>. Their
          email and contact number are used for booking confirmation and any
          follow-up communication — the passenger's own details go on the
          ticket. Tick the box above when the booker is the primary
          passenger travelling.
        </div>

        {!disabled && (
          <>
            <Row className="g-3 mb-2">
              <Col md={6}>
                <Form.Label className="small fw-semibold">
                  First Name <span className="text-danger">*</span>
                </Form.Label>
                <Form.Control
                  data-field="customer.firstName"
                  type="text"
                  placeholder="Customer first name"
                  value={customer.firstName}
                  onChange={(e) =>
                    setCustomerField("firstName", e.target.value)
                  }
                  isInvalid={!!err("firstName")}
                />
                <Form.Control.Feedback type="invalid">
                  {err("firstName")}
                </Form.Control.Feedback>
              </Col>
              <Col md={6}>
                <Form.Label className="small fw-semibold">
                  Last Name <span className="text-danger">*</span>
                </Form.Label>
                <Form.Control
                  data-field="customer.lastName"
                  type="text"
                  placeholder="Customer last name"
                  value={customer.lastName}
                  onChange={(e) =>
                    setCustomerField("lastName", e.target.value)
                  }
                  isInvalid={!!err("lastName")}
                />
                <Form.Control.Feedback type="invalid">
                  {err("lastName")}
                </Form.Control.Feedback>
              </Col>
            </Row>

            <Row className="g-3 mb-2">
              <Col md={6}>
                <Form.Label className="small fw-semibold">
                  Email <span className="text-danger">*</span>
                </Form.Label>
                <Form.Control
                  data-field="customer.email"
                  type="email"
                  placeholder="Customer email address"
                  value={customer.email}
                  onChange={(e) => setCustomerField("email", e.target.value)}
                  isInvalid={!!err("email")}
                />
                <Form.Control.Feedback type="invalid">
                  {err("email")}
                </Form.Control.Feedback>
              </Col>
              <Col md={6}>
                <Form.Label className="small fw-semibold">
                  Contact Number <span className="text-danger">*</span>
                </Form.Label>
                <Form.Control
                  data-field="customer.contactNumber"
                  type="tel"
                  placeholder="Customer contact number"
                  value={customer.contactNumber}
                  onChange={(e) =>
                    setCustomerField("contactNumber", e.target.value)
                  }
                  isInvalid={!!err("contactNumber")}
                />
                <Form.Control.Feedback type="invalid">
                  {err("contactNumber")}
                </Form.Control.Feedback>
              </Col>
            </Row>

            <Row className="g-3 mb-2">
              <Col md={12}>
                <Form.Label className="small fw-semibold">Address</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={1}
                  placeholder="Customer full address (optional)"
                  value={customer.address}
                  onChange={(e) =>
                    setCustomerField("address", e.target.value)
                  }
                />
              </Col>
            </Row>

            <Row className="g-3">
              <Col md={6}>
                <Form.Label className="small fw-semibold">
                  Company{" "}
                  <span className="text-muted small">(optional)</span>
                </Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Company / organisation name"
                  value={customer.company}
                  onChange={(e) =>
                    setCustomerField("company", e.target.value)
                  }
                />
              </Col>
              <Col md={6}>
                <Form.Label className="small fw-semibold">
                  Tax ID / GSTIN{" "}
                  <span className="text-muted small">(optional)</span>
                </Form.Label>
                <Form.Control
                  type="text"
                  placeholder="For invoice — GSTIN, VAT, etc."
                  value={customer.taxId}
                  onChange={(e) =>
                    setCustomerField("taxId", e.target.value)
                  }
                />
              </Col>
            </Row>
          </>
        )}
      </Card.Body>
    </Card>
  );
};

/* ── PassengerCard — one card per traveller ─────────────────────────── */
const PassengerCard = ({ idx, p, errors, setField, ordinal, isPrimary }) => {
  const isAdult = p.type === "ADT";
  const showContact = isPrimary; // primary guest carries booking contact
  const err = (key) => errors[`${idx}.${key}`];

  const typeBadge = p.type === "CHD" ? "CHD" : p.type === "INF" ? "INF" : "ADT";
  const badgeBg = p.type === "CHD" ? "info" : p.type === "INF" ? "warning" : "primary";

  return (
    <Card
      className="mb-3"
      style={{
        border: `1px solid ${isPrimary ? "#fecdd3" : "#e5e7eb"}`,
        borderLeftWidth: 4,
        borderLeftColor: isPrimary ? "#e11d48" : "#fecdd3",
        borderRadius: 10,
      }}
    >
      <Card.Body>
        <div className="d-flex justify-content-between align-items-center flex-wrap mb-3">
          <h6 className="mb-0" style={{ fontSize: 16, fontWeight: 600 }}>
            <FaUsers className="me-2" style={{ color: "#e11d48" }} />
            {paxLabel(p.type, ordinal)}
            <Badge bg={badgeBg} className="ms-2" style={{ fontSize: 10 }}>
              {typeBadge}
            </Badge>
          </h6>
          {isPrimary && (
            <Badge
              style={{
                background: "#e11d48",
                fontSize: 10,
                padding: "6px 10px",
                letterSpacing: 0.5,
              }}
            >
              PRIMARY GUEST
            </Badge>
          )}
        </div>

        {/* Row 1 — Salutation / First / Middle / Last */}
        <Row className="g-3 mb-2">
          <Col md={3}>
            <Form.Label className="small fw-semibold">
              Salutation <span className="text-danger">*</span>
            </Form.Label>
            <Form.Select
              data-field={`${idx}.salutation`}
              value={p.salutation}
              onChange={(e) => setField(idx, "salutation", e.target.value)}
              isInvalid={!!err("salutation")}
            >
              <option value="">Select</option>
              {SALUTATIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Form.Select>
            <Form.Control.Feedback type="invalid">
              {err("salutation")}
            </Form.Control.Feedback>
          </Col>
          <Col md={3}>
            <Form.Label className="small fw-semibold">
              First Name <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              data-field={`${idx}.firstName`}
              type="text"
              placeholder="Enter first name"
              value={p.firstName}
              onChange={(e) => setField(idx, "firstName", e.target.value)}
              isInvalid={!!err("firstName")}
            />
            <Form.Control.Feedback type="invalid">
              {err("firstName")}
            </Form.Control.Feedback>
          </Col>
          <Col md={3}>
            <Form.Label className="small fw-semibold">Middle Name</Form.Label>
            <Form.Control
              type="text"
              placeholder="Enter middle name"
              value={p.middleName}
              onChange={(e) => setField(idx, "middleName", e.target.value)}
            />
          </Col>
          <Col md={3}>
            <Form.Label className="small fw-semibold">
              Last Name <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              data-field={`${idx}.lastName`}
              type="text"
              placeholder="Enter last name"
              value={p.lastName}
              onChange={(e) => setField(idx, "lastName", e.target.value)}
              isInvalid={!!err("lastName")}
            />
            <Form.Control.Feedback type="invalid">
              {err("lastName")}
            </Form.Control.Feedback>
          </Col>
        </Row>

        {/* Row 2 — Contact + Email (primary passenger only) */}
        {showContact && (
          <Row className="g-3 mb-2">
            <Col md={6}>
              <Form.Label className="small fw-semibold">
                Contact Number <span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                data-field={`${idx}.contactNumber`}
                type="tel"
                placeholder="Enter contact number"
                value={p.contactNumber}
                onChange={(e) => setField(idx, "contactNumber", e.target.value)}
                isInvalid={!!err("contactNumber")}
              />
              <Form.Control.Feedback type="invalid">
                {err("contactNumber")}
              </Form.Control.Feedback>
            </Col>
            <Col md={6}>
              <Form.Label className="small fw-semibold">
                Email <span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                data-field={`${idx}.email`}
                type="email"
                placeholder="Enter email address"
                value={p.email}
                onChange={(e) => setField(idx, "email", e.target.value)}
                isInvalid={!!err("email")}
              />
              <Form.Control.Feedback type="invalid">
                {err("email")}
              </Form.Control.Feedback>
            </Col>
          </Row>
        )}

        {/* Row 3 — DOB + Gender (gender gets 8 cols so 3 radios always fit) */}
        <Row className="g-3 mb-2">
          <Col md={4}>
            <Form.Label className="small fw-semibold">
              Date of Birth <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              data-field={`${idx}.dateOfBirth`}
              type="date"
              value={p.dateOfBirth}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setField(idx, "dateOfBirth", e.target.value)}
              isInvalid={!!err("dateOfBirth")}
            />
            <Form.Control.Feedback type="invalid">
              {err("dateOfBirth")}
            </Form.Control.Feedback>
          </Col>
          <Col md={8}>
            <Form.Label className="small fw-semibold">
              Gender <span className="text-danger">*</span>
            </Form.Label>
            <div
              data-field={`${idx}.gender`}
              className="d-flex flex-wrap align-items-center"
              style={{ gap: 20, paddingTop: 6 }}
            >
              {GENDERS.map((g) => (
                <Form.Check
                  key={g}
                  type="radio"
                  id={`gender-${idx}-${g}`}
                  name={`gender-${idx}`}
                  label={g}
                  value={g}
                  checked={p.gender === g}
                  onChange={(e) => setField(idx, "gender", e.target.value)}
                  isInvalid={!!err("gender")}
                  style={{ whiteSpace: "nowrap" }}
                />
              ))}
            </div>
            {err("gender") && (
              <div className="text-danger small mt-1">{err("gender")}</div>
            )}
          </Col>
        </Row>

        {/* Row 4 — Address (full width so long addresses don't wrap awkwardly) */}
        <Row className="g-3">
          <Col md={12}>
            <Form.Label className="small fw-semibold">Address</Form.Label>
            <Form.Control
              as="textarea"
              rows={1}
              placeholder="Enter full address"
              value={p.address}
              onChange={(e) => setField(idx, "address", e.target.value)}
            />
          </Col>
        </Row>
      </Card.Body>
    </Card>
  );
};

/* ── PaymentSection — payment mode picker + card fields ─────────────
 * PCI note: this component is the ONLY place PAN + CVV live client-side.
 * They're sent to the backend on submit and wiped from state right after
 * a successful booking (see onConfirm). Nothing sensitive is persisted
 * in this file or the DTO chain.
 *
 * The available modes are computed on the parent from the agent's
 * credit balance + cardPaymentEnabled flag and injected as
 * paymentModeOptions — matches the HotelBookingPage rule set exactly
 * (sufficient credit → Credit Limit only, insufficient + card enabled
 * → Card only, otherwise no options / booking blocked).
 */

const CARD_TYPES = [
  { code: "VI", label: "Visa" },
  { code: "CA", label: "MasterCard" },
  { code: "AX", label: "American Express" },
  { code: "DC", label: "Diners Club" },
  { code: "JC", label: "JCB" },
];

const PaymentSection = ({
  payment,
  setPaymentField,
  errors,
  paymentModeOptions = [],
  noPaymentPathAvailable = false,
  agentAvailableBalance = null,
  currency = "AED",
}) => {
  const err = (k) => errors[`payment.${k}`];
  const isCard = payment.mode === "CARD";

  // Group digits for readability without touching the underlying value's
  // spacing — the backend strips whitespace before sending to Amadeus.
  const formatCardNumber = (raw) =>
    (raw || "").replace(/\D/g, "").replace(/(.{4})/g, "$1 ").trim();

  return (
    <Card className="shadow-sm" style={{ borderRadius: 10 }}>
      <Card.Body>
        <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap">
          <h5 className="mb-0">Payment</h5>
          {agentAvailableBalance != null && (
            <div className="text-muted small">
              Available Balance:{" "}
              <strong style={{ color: "#111" }}>
                {currency} {Number(agentAvailableBalance).toFixed(2)}
              </strong>
            </div>
          )}
        </div>

        {/* Blocking banner — insufficient credit AND card disabled means
            the agent has no way to pay for this booking. */}
        {noPaymentPathAvailable && (
          <Alert variant="danger" className="mb-3" style={{ fontSize: 13 }}>
            <strong>Booking cannot be completed:</strong> the selected agent
            has insufficient credit for this fare and Card payment is not
            enabled on their profile. Contact administration to top up the
            credit limit or enable Card payment.
          </Alert>
        )}

        {/* Mode picker — options are agent-scoped and injected by the
            parent (see paymentModeOptions computation on FlightBookPage). */}
        <div className="mb-3" data-field="payment.mode">
          <Form.Label className="small fw-semibold">
            Payment Mode <span className="text-danger">*</span>
          </Form.Label>
          <div
            className="d-flex flex-wrap"
            style={{ gap: 10, marginTop: 4 }}
          >
            {paymentModeOptions.length === 0 && (
              <div
                className="text-muted small fst-italic"
                style={{ paddingTop: 8 }}
              >
                No payment options available for this agent.
              </div>
            )}
            {paymentModeOptions.map((m) => {
              const active = payment.mode === m.value;
              return (
                <label
                  key={m.value}
                  style={{
                    cursor: "pointer",
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: active
                      ? "2px solid #e11d48"
                      : "1px solid #d1d5db",
                    background: active ? "#fff1f2" : "#fff",
                    fontSize: 13,
                    fontWeight: active ? 600 : 500,
                    color: active ? "#e11d48" : "#374151",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    userSelect: "none",
                  }}
                >
                  <input
                    type="radio"
                    name="paymentMode"
                    value={m.value}
                    checked={active}
                    onChange={(e) => setPaymentField("mode", e.target.value)}
                    style={{ display: "none" }}
                  />
                  {m.label}
                </label>
              );
            })}
          </div>
          {err("mode") && (
            <div className="text-danger small mt-1">{err("mode")}</div>
          )}
        </div>

        {/* Card fields — only when mode = CARD */}
        {isCard && (
          <>
            <Row className="g-3 mb-2">
              <Col md={4}>
                <Form.Label className="small fw-semibold">
                  Card Type <span className="text-danger">*</span>
                </Form.Label>
                <Form.Select
                  data-field="payment.cardType"
                  value={payment.cardType}
                  onChange={(e) => setPaymentField("cardType", e.target.value)}
                  isInvalid={!!err("cardType")}
                  autoComplete="off"
                >
                  <option value="">Select</option>
                  {CARD_TYPES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </Form.Select>
                <Form.Control.Feedback type="invalid">
                  {err("cardType")}
                </Form.Control.Feedback>
              </Col>
              <Col md={8}>
                <Form.Label className="small fw-semibold">
                  Card Number <span className="text-danger">*</span>
                </Form.Label>
                <Form.Control
                  data-field="payment.cardNumber"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="1234 5678 9012 3456"
                  value={formatCardNumber(payment.cardNumber)}
                  onChange={(e) =>
                    setPaymentField(
                      "cardNumber",
                      e.target.value.replace(/\D/g, "").slice(0, 19),
                    )
                  }
                  isInvalid={!!err("cardNumber")}
                  maxLength={23} /* 19 digits + 4 spaces */
                />
                <Form.Control.Feedback type="invalid">
                  {err("cardNumber")}
                </Form.Control.Feedback>
              </Col>
            </Row>

            <Row className="g-3 mb-2">
              <Col md={6}>
                <Form.Label className="small fw-semibold">
                  Cardholder Name <span className="text-danger">*</span>
                </Form.Label>
                <Form.Control
                  data-field="payment.cardholderName"
                  type="text"
                  autoComplete="off"
                  placeholder="Name as on card"
                  value={payment.cardholderName}
                  onChange={(e) =>
                    setPaymentField("cardholderName", e.target.value)
                  }
                  isInvalid={!!err("cardholderName")}
                />
                <Form.Control.Feedback type="invalid">
                  {err("cardholderName")}
                </Form.Control.Feedback>
              </Col>
              <Col md={3}>
                <Form.Label className="small fw-semibold">
                  Expiry <span className="text-danger">*</span>
                </Form.Label>
                <div className="d-flex" style={{ gap: 6 }}>
                  <Form.Control
                    data-field="payment.expiryMonth"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="MM"
                    value={payment.expiryMonth}
                    onChange={(e) =>
                      setPaymentField(
                        "expiryMonth",
                        e.target.value.replace(/\D/g, "").slice(0, 2),
                      )
                    }
                    isInvalid={!!err("expiryMonth")}
                    style={{ maxWidth: 60 }}
                    maxLength={2}
                  />
                  <span style={{ alignSelf: "center", color: "#6b7280" }}>
                    /
                  </span>
                  <Form.Control
                    data-field="payment.expiryYear"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="YYYY"
                    value={payment.expiryYear}
                    onChange={(e) =>
                      setPaymentField(
                        "expiryYear",
                        e.target.value.replace(/\D/g, "").slice(0, 4),
                      )
                    }
                    isInvalid={!!err("expiryYear")}
                    style={{ maxWidth: 80 }}
                    maxLength={4}
                  />
                </div>
                {(err("expiryMonth") || err("expiryYear")) && (
                  <div className="text-danger small mt-1">
                    {err("expiryMonth") || err("expiryYear")}
                  </div>
                )}
              </Col>
              <Col md={3}>
                <Form.Label className="small fw-semibold">
                  CVV <span className="text-danger">*</span>
                </Form.Label>
                <Form.Control
                  data-field="payment.securityId"
                  type="password" /* mask CVV visually */
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="•••"
                  value={payment.securityId}
                  onChange={(e) =>
                    setPaymentField(
                      "securityId",
                      e.target.value.replace(/\D/g, "").slice(0, 4),
                    )
                  }
                  isInvalid={!!err("securityId")}
                  maxLength={4}
                />
                <Form.Control.Feedback type="invalid">
                  {err("securityId")}
                </Form.Control.Feedback>
              </Col>
            </Row>

            <div
              className="text-muted small mt-2"
              style={{ fontSize: 11 }}
            >
              Card details are transmitted directly to Amadeus for ticket
              issuance. We store only the card type + last 4 digits + expiry
              for your records.
            </div>
          </>
        )}

        {/* Non-card modes — optional transaction reference */}
        {!isCard && (
          <Row className="g-3">
            <Col md={12}>
              <Form.Label className="small fw-semibold">
                Transaction Reference
              </Form.Label>
              <Form.Control
                type="text"
                placeholder="Receipt number, transfer id, credit limit draw reference…"
                value={payment.transactionReference}
                onChange={(e) =>
                  setPaymentField("transactionReference", e.target.value)
                }
              />
              <div className="text-muted small mt-1" style={{ fontSize: 11 }}>
                Optional. Used for reconciliation once the payment is
                confirmed out-of-band.
              </div>
            </Col>
          </Row>
        )}
      </Card.Body>
    </Card>
  );
};

export default FlightBookPage;
