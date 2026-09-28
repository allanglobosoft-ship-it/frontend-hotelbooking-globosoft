import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Container,
  Row,
  Col,
  Card,
  Form,
  Button,
  Badge,
  Spinner,
  Modal,
  Table,
  Alert,
} from "react-bootstrap";
import {
  FaCar,
  FaCheckCircle,
  FaMapMarkerAlt,
  FaArrowLeft,
  FaUsers,
  FaCreditCard,
  FaInfoCircle,
  FaClock,
} from "react-icons/fa";
import axiosInstance from "../../components/AxiosInstance";
import Select from "react-select";
import { toast } from "react-hot-toast";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import AgentBalanceDisplay from "../../components/AgentBalanceDisplay";
import QuotationPdfCard from "../../components/quotation/QuotationPdfCard";
import "../../styles/HotelBookingPage.css";

const emptyCabPolicies = {
  terms: [],
  cancellations: [],
  specialRequirements: [],
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Payment Method label lookup — mirrors hotel-booking-page's Payment Mode
// vocabulary. Only "CREDIT" (agent wallet) and "CARD" (online) are exposed
// on the UI now; older backend rows using BANK_TRANSFER / CASH still fall
// through the lookup as their raw value so the Order Summary label stays
// readable rather than empty.
const PAYMENT_MODE_LABELS = {
  CREDIT: "Credit Limit",
  CARD: "Card",
};

const paymentModeLabel = (value) =>
  PAYMENT_MODE_LABELS[value] || value || "—";

const formatDateToDDMMYYYY = (dateString) => {
  if (!dateString) return "";
  const [year, month, day] = dateString.split("-");
  return `${day}-${month}-${year}`;
};

// "2026-07-22" → "22 Jul 2026" for the Booking Summary strip. Falls back to
// the raw value when the string isn't the expected ISO shape.
const formatTransferDate = (dateString) => {
  if (!dateString) return "—";
  const parts = String(dateString).split("-");
  if (parts.length !== 3) return dateString;
  const [y, m, d] = parts;
  const mi = parseInt(m, 10) - 1;
  if (Number.isNaN(mi) || mi < 0 || mi > 11) return dateString;
  return `${parseInt(d, 10)} ${MONTHS[mi]} ${y}`;
};

// Reverse-geocode browser coordinates to a readable address for the Booking
// History audit trail. Tries OpenStreetMap Nominatim first (street-level),
// then BigDataCloud (locality-level, keyless) — both free, CORS-enabled.
// Returns null when neither responds so the caller keeps its IP-derived
// fallback. Mirrors the other dedicated-flow booking pages (Long Stay etc.).
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

// ── New-tab booking hand-off ─────────────────────────────────────────────
// The cab search "Select" button opens this page in a new browser tab. Router
// state can't cross tabs, so the payload is stashed in localStorage under a
// one-time `cabBookingDraft:<id>` key. The URL stays clean (/cab-booking-page
// with no query params) — instead the opener passes the id via the new tab's
// `window.name` (set by `window.open(url, name)`), which we read below.
// Parsed drafts are cached in-module so a React StrictMode double-mount (dev)
// still resolves the payload after the localStorage key has been cleared.
const cabBookingDraftCache = new Map();

function readCabBookingDraft(draftId) {
  if (!draftId) return null;
  if (cabBookingDraftCache.has(draftId)) return cabBookingDraftCache.get(draftId);
  try {
    const raw = localStorage.getItem(`cabBookingDraft:${draftId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      cabBookingDraftCache.set(draftId, parsed);
      return parsed;
    }
  } catch {
    // corrupt or unavailable draft — fall through to null
  }
  return null;
}

const CabBookingPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // Resolve the incoming booking payload. In-app navigation delivers it via
  // router state; when the "Select" button opens this page in a NEW TAB the
  // payload is instead handed off through localStorage under a one-time
  // `cabBookingDraft:<id>` key. The id normally arrives via `window.name`
  // (set by the opener's `window.open(url, name)`) so the address bar stays
  // clean as /cab-booking-page. We also fall back to a `?draft=<id>` query
  // param — a tolerance for older opener bundles that still use the URL
  // form; new opens never populate it.
  const draftId = useMemo(() => {
    if (typeof window !== "undefined") {
      const name = window.name || "";
      if (name.startsWith("cabBookingDraft:")) {
        return name.slice("cabBookingDraft:".length);
      }
    }
    return new URLSearchParams(location.search).get("draft");
  }, [location.search]);
  const { cab, selectedOption, searchCriteria } = useMemo(
    () => location.state || readCabBookingDraft(draftId) || {},
    [location.state, draftId],
  );

  // Clear the one-time draft hand-off once consumed so it can't leak into a
  // later booking or accumulate in localStorage / window.name. The in-module
  // cache still holds the parsed payload, so this is safe to run after the
  // first render.
  useEffect(() => {
    if (draftId) {
      localStorage.removeItem(`cabBookingDraft:${draftId}`);
      if (typeof window !== "undefined") window.name = "";
    }
  }, [draftId]);
  // Agent-role logins have no explicit Agent picker on the search page
  // (they ARE the agent), so makeYourOwnPackageAgentId is never populated
  // for them. Detect that case here so we can fall back to the logged-in
  // user's own userId — same resolution the search page's build now does.
  const activeRoleOnLoad = (localStorage.getItem("currentActiveRole") || "")
    .trim()
    .toUpperCase();
  const storedRolesOnLoad = (localStorage.getItem("userRole") || "").toUpperCase();
  const isAgentRoleOnLoad = activeRoleOnLoad
    ? activeRoleOnLoad === "AGENT"
    : storedRolesOnLoad.includes("AGENT") && !storedRolesOnLoad.includes("ADMIN");
  const selectedAgentId =
    searchCriteria?.agentId != null && searchCriteria.agentId !== ""
      ? String(searchCriteria.agentId)
      : sessionStorage.getItem("makeYourOwnPackageAgentId") ||
        localStorage.getItem("makeYourOwnPackageAgentId") ||
        (isAgentRoleOnLoad ? localStorage.getItem("userId") || "" : "") ||
        "";

  // If accessed directly without state, we should probably redirect or show an error
  const hasValidState = !!cab && !!selectedOption && !!searchCriteria;

  // i'way rows carry no in-house cabId (cab.cabid is a synthetic string like
  // "iway-12345"), so every branch below that assumes a real Cab row needs
  // to check this first.
  const isIway = cab?.channelType === "iway" || cab?.source === "IWAY";

  // Airport detection needs both signals because i'way-native airports come
  // back tagged source="IWAY" (not "AIRPORT") from /transport-nodes — only
  // the IATA code on the location object identifies them as airports. Used
  // by the flight-number input render / validation / payload branches below.
  const pickupIsAirport =
    searchCriteria?.pickupType === "AIRPORT" ||
    !!searchCriteria?.originLocation?.code;
  const dropoffIsAirport =
    searchCriteria?.dropoffType === "AIRPORT" ||
    !!searchCriteria?.destinationLocation?.code;

  // Whether to surface the Pick-Up / Drop-Off Flight Number inputs on the
  // Contact Details card. Mirrors the exact same branching the create-booking
  // payload already uses (see pickupFlightNo / dropoffFlightNo below) so the
  // input only appears when the payload would actually forward it: i'way uses
  // the widened detection (covers i'way-native airports whose source is
  // "IWAY" but whose location carries an IATA code); in-house keeps the
  // strict AIRPORT pickupType/dropoffType check so non-airport in-house
  // pickups don't grow a new input.
  const showPickupFlightField =
    isIway ? pickupIsAirport : searchCriteria?.pickupType === "AIRPORT";
  const showDropoffFlightField =
    isIway ? dropoffIsAirport : searchCriteria?.dropoffType === "AIRPORT";

  // Client location snapshot for the booking-history audit trail, resolved
  // once on page load and sent on the create payload. Location — browser
  // geolocation (GPS/WiFi) reverse-geocoded to a precise readable address;
  // the coarse IP-derived city is only the fallback when the permission is
  // denied or the lookup times out. The IP Address column is stamped
  // server-side from the create request (browsers can't read their own
  // public IP reliably), so it is not resolved here. Mirrors the other
  // dedicated-flow booking pages.
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
            setClientNetwork({ bookingLocation: precise });
          }
        },
        () => {}, // denied / unavailable — keep the IP-derived fallback
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
      );
    }

    return () => { cancelled = true; };
  }, []);

  // ── Full pax manifest (one row per adult + child) ────────────────────
  // Seeded from the searchCriteria counts so the operator can capture
  // names for every traveller. The Lead radio (one per row) picks which
  // pax becomes the primary/lead — that row's contact + LPO fields are
  // captured inline and persisted to the customer/lead-passenger table,
  // while the other rows are persisted to the guest table as-is.
  const totalAdults = Math.max(0, Number(searchCriteria?.adults) || 0);
  const totalChildren = Math.max(0, Number(searchCriteria?.children) || 0);
  const childAges = Array.isArray(searchCriteria?.childAges)
    ? searchCriteria.childAges
    : [];
  const initialGuests = useMemo(() => {
    const out = [];
    for (let i = 0; i < totalAdults; i++) {
      out.push({
        salutation: i === 0 ? "Mr" : "",
        firstName: "",
        middleName: "",
        lastName: "",
        gender: "",
        isChild: false,
        age: null,
        passportNo: "",
        // Lead-only contact fields. Captured inline when the row is
        // marked as Lead and forwarded as the customer/primary record.
        contactNumber: "",
        emailId: "",
        lpo: "",
      });
    }
    for (let i = 0; i < totalChildren; i++) {
      out.push({
        salutation: "",
        firstName: "",
        middleName: "",
        lastName: "",
        gender: "",
        isChild: true,
        age: childAges[i] != null ? Number(childAges[i]) : null,
        passportNo: "",
        contactNumber: "",
        emailId: "",
        lpo: "",
      });
    }
    return out;
    // eslint-disable-next-line
  }, []);
  const [guests, setGuests] = useState(initialGuests);

  // Lead-passenger index — points at the row whose details build the
  // primary customer record. Defaults to the first adult; children are
  // never allowed to be the lead (the radio is disabled for them).
  const [leadIndex, setLeadIndex] = useState(0);

  // Derived "primary guest" — exposed under the same shape the rest of
  // this file already consumes (Order Summary modal, payload), so we
  // didn't have to rename references. Always reflects whichever row is
  // currently flagged as Lead.
  const leadGuest = guests[leadIndex] || {};
  const primaryGuest = {
    salutation: leadGuest.salutation || "",
    firstName: leadGuest.firstName || "",
    lastName: leadGuest.lastName || "",
    contactNumber: leadGuest.contactNumber || "",
    emailId: leadGuest.emailId || "",
    passportNumber: leadGuest.passportNo || "",
    lpo: leadGuest.lpo || "",
  };

  const handleGuestChange = (index, field, value) => {
    setGuests((prev) => {
      const next = [...prev];
      if (!next[index]) return prev;
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    // Clear inline error if any.
    const key = `guest_${index}_${field}`;
    if (validationErrors[key]) {
      setValidationErrors((prev) => {
        const updated = { ...prev };
        delete updated[key];
        return updated;
      });
    }
  };

  const handleLeadSelect = (index) => {
    if (guests[index]?.isChild) return;
    setLeadIndex(index);
    // Lead changed → clear any errors that were attached to the old lead's
    // contact/email/lpo so they don't keep showing on the new lead's row.
    setValidationErrors((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (
          k === "contactNumber" ||
          k === "emailId" ||
          k === "lpo" ||
          k === "lead"
        ) {
          delete next[k];
        }
      });
      return next;
    });
  };

  // Transporter & driver details were removed from the booking form, but the
  // booking payload still carries these (empty) fields so the backend contract
  // is unchanged. They're assigned on the backend / a later workflow stage.
  const transporterDetails = {
    transporter: "",
    contactNumber: "",
    driverName: "",
    driverContact: "",
  };

  const [validationErrors, setValidationErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const [cabPolicies, setCabPolicies] = useState(emptyCabPolicies);

  // ── Order Summary modal — mirrors HotelBookingPage.jsx pattern ─────
  // The "Confirm Booking" button now validates + builds the payload and
  // opens this modal. Only the modal's own confirm action actually POSTs
  // to /api/cab/book, giving the user a final review step before save.
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [pendingPayload, setPendingPayload] = useState(null);

  // Settlement mode — same value set the cab backend already accepts:
  // "CREDIT" (agent wallet) or "CARD" (online). Kept blank until the
  // three-scenario picker below seeds it.
  const [paymentMode, setPaymentMode] = useState("");

  // Agent's available credit balance + per-agent Card payment permission.
  // Mirrors HotelBookingPage's Payment Mode wiring so the two flows show
  // the same "Credit Limit vs Card" rules against the same rate.
  const [agentAvailableBalance, setAgentAvailableBalance] = useState(null);
  const [agentCardPaymentEnabled, setAgentCardPaymentEnabled] = useState(false);

  useEffect(() => {
    if (!selectedAgentId) {
      setAgentAvailableBalance(null);
      return;
    }
    let cancelled = false;
    axiosInstance
      .get(`/api/agent-credit-limit/agent/${selectedAgentId}`)
      .then((res) => {
        if (cancelled) return;
        const avail =
          res?.data?.effectiveAvailableCreditLimit ??
          res?.data?.availableCreditLimit ??
          null;
        setAgentAvailableBalance(avail != null ? Number(avail) : null);
      })
      .catch(() => {
        if (!cancelled) setAgentAvailableBalance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAgentId]);

  useEffect(() => {
    if (!selectedAgentId) {
      setAgentCardPaymentEnabled(false);
      return;
    }
    let cancelled = false;
    axiosInstance
      .get(`/api/agent/${selectedAgentId}`)
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
  }, [selectedAgentId]);

  // Free-text additional notes (baby seat, wheelchair, extra luggage …).
  // Persisted on the cab booking via the specialRequirements field —
  // preserved for anything the provider hasn't advertised in their
  // configured catalog.
  const [specialRequirements, setSpecialRequirements] = useState("");

  // Multi-select the customer picks from the provider's configured catalog
  // (cabPolicies.specialRequirements). Held as react-select `{value,label}[]`;
  // flattened to string[] on the booking payload as selectedSpecialRequirements.
  // Auto-resets when the source list changes (e.g. a different cab picked).
  const [selectedSpecialRequirements, setSelectedSpecialRequirements] = useState(
    [],
  );

  // Options built from the fetched catalog. Kept as {value,label} so the
  // rendered picker doesn't need to reshape on every render.
  const specialRequirementOptions = useMemo(
    () =>
      (cabPolicies.specialRequirements || [])
        .filter(Boolean)
        .map((v) => ({ value: v, label: v })),
    [cabPolicies.specialRequirements],
  );

  // If the provider's catalog changes (different cab picked) drop any
  // previous customer picks that are no longer on offer — otherwise we'd
  // send stale strings the operator hasn't advertised.
  useEffect(() => {
    setSelectedSpecialRequirements((prev) =>
      prev.filter((opt) =>
        specialRequirementOptions.some((o) => o.value === opt?.value),
      ),
    );
  }, [specialRequirementOptions]);

  // ── Per-leg pickup / dropoff details ────────────────────────────────
  // Only the fields relevant to the chosen leg type are surfaced on the
  // UI; the others stay null in the payload. The full set is persisted
  // on the cab booking entity (backend additive change), so the booking
  // detail view + voucher can render either flavour.
  // Note: Estimated Arrival Time is NOT in this state — it now comes from
  // the airport master (searchCriteria.pickupEstimatedArrivalTime) and is
  // rendered read-only on the page.
  const [pickupDetails, setPickupDetails] = useState({
    arrivingFrom: "",
    flightNo: "",
    greetingSign: "",
  });

  // HQ amount — operator-side adjustment to the supplier-side total.
  // Sent to the backend as `adjustmentAmount` on the booking payload.
  // Free-form string in state so the user can type the value naturally;
  // converted to a Number at submit time. Blank → null (no adjustment).
  const [hqAmount, setHqAmount] = useState("");
  const [dropoffDetails, setDropoffDetails] = useState({
    departingTo: "",
    flightNo: "",
    terminal: "",
    departureTime: searchCriteria.dropoffTime || "",
  });

  // i'way Toll Road opt-in (guide §12.3 / AIT §8.5). Boolean, i'way rows
  // only. When true, the backend's IwayTollRoadResolver picks the offer's
  // tollroad additional_service and appends it to POST /orders; when false
  // (default) the payload is byte-identical to before this checkbox
  // existed — so in-house bookings and un-ticked i'way bookings are
  // completely unaffected. Silently no-ops on the backend when the class
  // does not expose a tollroad entry (e.g. Business on CDG→Disneyland).
  const [iwayIncludeTollRoad, setIwayIncludeTollRoad] = useState(false);
  // Hotel addresses auto-fetched from /api/hotels/lookup when the leg
  // type is HOTEL. We resolve by matching hotelName (case-insensitive),
  // scoped by destination cityId when known. Empty string falls back to
  // "—" on the UI; the resolved value is also forwarded in the booking
  // payload so the voucher PDF doesn't need a second lookup.
  const [pickupHotelAddress, setPickupHotelAddress] = useState("");
  const [dropoffHotelAddress, setDropoffHotelAddress] = useState("");

  // Default the greeting sign to the lead passenger's full name once the
  // operator fills it in. Only seeds when the field is still blank so an
  // explicitly entered sign isn't clobbered.
  useEffect(() => {
    if (
      searchCriteria.pickupType === "AIRPORT" &&
      !pickupDetails.greetingSign
    ) {
      const leadName = [
        leadGuest?.salutation,
        leadGuest?.firstName,
        leadGuest?.lastName,
      ]
        .filter(Boolean)
        .join(" ")
        .trim();
      if (leadName) {
        setPickupDetails((prev) =>
          prev.greetingSign ? prev : { ...prev, greetingSign: leadName },
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    leadGuest?.firstName,
    leadGuest?.lastName,
    leadGuest?.salutation,
    searchCriteria.pickupType,
  ]);

  // Lookup hotel addresses whenever a leg is HOTEL. /api/hotels/lookup
  // returns rows with `hotelName` + `address`; we filter by name. The
  // lookup is keyed by (cityId, hotelName) so it only fires once.
  useEffect(() => {
    const cityId = searchCriteria.city?.value || searchCriteria.destination?.value;
    const fetchAddr = async (name, setter) => {
      if (!name) {
        setter("");
        return;
      }
      try {
        const params = { search: name, limit: 50 };
        if (cityId) params.cityId = cityId;
        const res = await axiosInstance.get("/api/hotels/lookup", { params });
        const arr = Array.isArray(res.data) ? res.data : [];
        const hit = arr.find(
          (h) =>
            (h.hotelName || "").trim().toLowerCase() ===
            name.trim().toLowerCase(),
        ) || arr[0];
        setter(hit?.address || "");
      } catch (err) {
        console.warn("Hotel address lookup failed:", err);
        setter("");
      }
    };
    if (searchCriteria.pickupType === "HOTEL") {
      fetchAddr(searchCriteria.pickupName, setPickupHotelAddress);
    } else {
      setPickupHotelAddress("");
    }
    if (searchCriteria.dropoffType === "HOTEL") {
      fetchAddr(searchCriteria.dropoffName, setDropoffHotelAddress);
    } else {
      setDropoffHotelAddress("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    searchCriteria.pickupType,
    searchCriteria.pickupName,
    searchCriteria.dropoffType,
    searchCriteria.dropoffName,
  ]);

  useEffect(() => {
    const cabId = cab?.cabid || cab?.cabId;
    // i'way rows have no in-house Cab row to fetch policies for — cabId is a
    // synthetic "iway-<priceId>" string, not a real PK.
    if (!cabId || isIway) {
      setCabPolicies(emptyCabPolicies);
      return;
    }
    let cancelled = false;
    setPolicyLoading(true);
    axiosInstance
      .get(`/api/cabRates/cab/${cabId}/policies`)
      .then((res) => {
        if (cancelled) return;
        setCabPolicies({
          terms: Array.isArray(res.data?.termsAndConditions)
            ? res.data.termsAndConditions.filter(Boolean)
            : [],
          cancellations: Array.isArray(res.data?.cancellationPolicies)
            ? res.data.cancellationPolicies.filter(Boolean)
            : [],
          // Provider's configured special-requirements catalog for this
          // cab — the customer picker below only shows these values.
          specialRequirements: Array.isArray(res.data?.specialRequirements)
            ? res.data.specialRequirements.filter(Boolean)
            : [],
        });
      })
      .catch((err) => {
        console.warn("Failed to load cab policies:", err);
        if (!cancelled) setCabPolicies(emptyCabPolicies);
      })
      .finally(() => {
        if (!cancelled) setPolicyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cab?.cabid, cab?.cabId]);

  const rate = selectedOption?.types === "SIC" ? selectedOption.sicRate : selectedOption?.privateRate;
  // Prefer the new markup-applied total (`totalRate`) from the search
  // result so the price shown here matches what the operator clicked.
  // Fall back to the legacy `totalRateWithoutMrk` for older responses
  // and finally to the per-row rate. The supplier-base (no markup)
  // amount is still kept on `selectedOption.totalRateWithoutMrk` and
  // sent as `totalRateWithoutmrk` in the booking POST below.
  const initialTotalRate =
    selectedOption?.totalRate ||
    selectedOption?.totalRateWithoutMrk ||
    rate ||
    0;

  const [prices, setPrices] = useState({
    sellingPrice: initialTotalRate.toString(),
    totalPrice: initialTotalRate.toString(),
  });
  const [tourismDirham, setTourismDirham] = useState("");

  // ── ALL HOOKS BELOW MUST RUN BEFORE THE EARLY RETURN ────────────────
  // Rules of Hooks: every hook must be called in the same order on every
  // render, so any useMemo / useEffect that used to sit after the
  // `if (!hasValidState) return …` block has been hoisted here. The
  // derived value `totalRate` moved up with them because bookingPayable
  // depends on it. All computations tolerate `hasValidState === false`
  // (initialTotalRate is 0 in that case, so the numbers just cascade
  // as 0 without crashing).
  const totalRate = parseFloat(prices.totalPrice) || initialTotalRate;

  // Payable used for the sufficiency check — matches the amount that
  // will actually be charged on Confirm (base + tourism dirham + HQ).
  // Declared unconditionally (before the !hasValidState early return below)
  // — React Hooks must run in the same order on every render, so useMemo /
  // useEffect can never sit after a conditional return.
  const bookingPayable = useMemo(() => {
    const tdNum =
      tourismDirham !== "" && !isNaN(Number(tourismDirham))
        ? Number(tourismDirham)
        : 0;
    const hqNum =
      hqAmount !== "" && !isNaN(Number(hqAmount))
        ? Number(hqAmount)
        : 0;
    return Number(totalRate || 0) + tdNum + hqNum;
  }, [totalRate, tourismDirham, hqAmount]);

  // Three scenarios (same rule the hotel checkout uses):
  //   1. Sufficient credit                    → Credit Limit only
  //   2. Insufficient credit + Card enabled   → Card only (+ note below)
  //   3. Insufficient credit + Card disabled  → no options; booking blocked
  // Null while the balance is still loading so nothing flashes empty.
  const hasSufficientCredit = useMemo(() => {
    if (agentAvailableBalance == null) return null;
    return agentAvailableBalance >= bookingPayable;
  }, [agentAvailableBalance, bookingPayable]);

  const paymentModeOptions = useMemo(() => {
    if (hasSufficientCredit === true) {
      return [{ value: "CREDIT", label: "Credit Limit" }];
    }
    if (hasSufficientCredit === false && agentCardPaymentEnabled) {
      return [{ value: "CARD", label: "Card" }];
    }
    if (hasSufficientCredit === false && !agentCardPaymentEnabled) {
      return [];
    }
    return [{ value: "CREDIT", label: "Credit Limit" }];
  }, [hasSufficientCredit, agentCardPaymentEnabled]);

  // Keep paymentMode valid for whatever option set is currently active —
  // when the sufficiency flips (e.g. HQ amount pushes the total past the
  // available credit) auto-select the first remaining option, which also
  // satisfies the "single option → pre-selected" rule.
  useEffect(() => {
    if (paymentModeOptions.length === 0) return;
    if (!paymentModeOptions.some((o) => o.value === paymentMode)) {
      setPaymentMode(paymentModeOptions[0].value);
    }
  }, [paymentModeOptions, paymentMode]);

  // If no state, show prompt. All hooks above run first so the render
  // order stays consistent whether we return early here or continue.
  if (!hasValidState) {
    return (
      <div className="min-vh-100 bg-light d-flex flex-column">
        <TopBar />
        <div className="d-flex flex-grow-1">
          <Sidebar />
          <main className="flex-grow-1 p-4 d-flex justify-content-center align-items-center">
            <Card className="text-center p-5 shadow-sm border-0 rounded-4">
              <Card.Body>
                <FaCar className="display-4 text-warning mb-3" />
                <h4 className="fw-bold mb-3">No Transfer Selected</h4>
                <p className="text-muted mb-4">Please select a transfer from the search page first.</p>
                <Button variant="primary" onClick={() => navigate("/new-booking/cab")}>
                  Go to Cab Search
                </Button>
              </Card.Body>
            </Card>
          </main>
        </div>
      </div>
    );
  }

  const noPaymentPathAvailable =
    hasSufficientCredit === false && !agentCardPaymentEnabled;

  const handlePriceChange = (field, value) => {
    setPrices((prev) => ({ ...prev, [field]: value }));
  };

  const validateForm = () => {
    const errors = {};
    let hasErrors = false;

    const lead = guests[leadIndex];
    if (!lead) {
      errors.lead = "Please mark a passenger as Lead";
      hasErrors = true;
    } else if (lead.isChild) {
      errors.lead = "The lead must be an adult passenger";
      hasErrors = true;
    }

    // Each pax row needs at least a first + last name. Salutation is
    // required for adults; children can leave it blank.
    guests.forEach((g, idx) => {
      if (!g.firstName || !g.firstName.trim()) {
        errors[`guest_${idx}_firstName`] = "Required";
        hasErrors = true;
      }
      if (!g.lastName || !g.lastName.trim()) {
        errors[`guest_${idx}_lastName`] = "Required";
        hasErrors = true;
      }
      if (!g.isChild && (!g.salutation || !g.salutation.trim())) {
        errors[`guest_${idx}_salutation`] = "Required";
        hasErrors = true;
      }
    });

    // Contact Details — only phone is mandatory now (email field removed).
    // The phone doubles as the lead row's Contact No. in the passenger
    // table, so the error key matches.
    if (lead) {
      if (!lead.contactNumber || !lead.contactNumber.trim()) {
        errors[`guest_${leadIndex}_contactNumber`] = "Phone is required";
        hasErrors = true;
      } else if (isIway) {
        // i'way rejects anything that isn't strict E.164 (guide §12.4.2),
        // and the backend normalizer refuses to guess a missing country
        // code — so bar submit here rather than let the operator hit the
        // "Check your phone number" 400 after the wallet is deducted.
        const raw = lead.contactNumber.trim();
        const hasIntlPrefix = raw.startsWith("+") || raw.startsWith("00");
        const digits = raw.replace(/[^0-9]/g, "");
        if (!hasIntlPrefix) {
          errors[`guest_${leadIndex}_contactNumber`] =
            "Include the country code (e.g. +971501234567) — i'way requires international format.";
          hasErrors = true;
        } else if (digits.length < 8 || digits.length > 15) {
          errors[`guest_${leadIndex}_contactNumber`] =
            "Phone number must be 8–15 digits including the country code.";
          hasErrors = true;
        }
      }
      // i'way's passengers[] entries require an email; the in-house flow
      // never collected one, so this only applies to i'way bookings.
      if (isIway && (!lead.emailId || !lead.emailId.trim())) {
        errors[`guest_${leadIndex}_emailId`] = "Email is required for i'way bookings";
        hasErrors = true;
      }
    }

    // i'way's start_location.flight_number is mandatory when the pickup
    // point is an airport (guide §12.4.5). pickupIsAirport also covers
    // i'way-native airports whose pickupType arrived as "IWAY" but whose
    // originLocation.code carries the IATA.
    if (
      isIway &&
      pickupIsAirport &&
      (!pickupDetails.flightNo || !pickupDetails.flightNo.trim())
    ) {
      errors.pickupFlightNo = "Flight number is required for an airport pickup";
      hasErrors = true;
    }

    return { errors, hasErrors };
  };

  // ── Step 1: validate the form, then gate on Terms acceptance. If the user
  // hasn't accepted the policies yet, open the Terms pop-up (the first modal
  // in the confirm flow) and stop; once accepted we hand off to
  // proceedToOrderSummary(). No backend call happens until the user confirms
  // in the Order Summary modal.
  const handleConfirmClick = () => {
    const { errors, hasErrors } = validateForm();

    if (hasErrors) {
      setValidationErrors(errors);
      toast.error("Please fill in all required fields correctly.");
      return;
    }

    if (!selectedAgentId) {
      toast.error("Agent is required for cab booking.");
      return;
    }

    if (!paymentMode) {
      toast.error("Please select a payment method.");
      return;
    }

    proceedToOrderSummary();
  };

  // Builds the booking payload from the current form state and opens the
  // Order Summary review modal. Split out of handleConfirmClick so the Terms
  // pop-up's "Agree & Continue" action can resume the flow after acceptance.
  const proceedToOrderSummary = () => {
    const tdNumber =
      tourismDirham !== "" && !isNaN(Number(tourismDirham))
        ? Number(tourismDirham)
        : 0;
    const hqNumber =
      hqAmount !== "" && !isNaN(Number(hqAmount))
        ? Number(hqAmount)
        : 0;
    const sellingWithTd = (parseFloat(prices.sellingPrice) || 0) + tdNumber;
    // Grand total shown on the Price Details card = base total + Tourism
    // Dirham + HQ adjustment. This is the amount saved against the booking
    // and (for CREDIT mode) deducted from the agent wallet, so the HQ
    // amount is rolled into the saved total here — not just displayed.
    const grandTotal =
      (parseFloat(prices.totalPrice) || totalRate) + tdNumber + hqNumber;

    const payload = {
      // i'way offers have no in-house Cab row — cab.cabid is a synthetic
      // "iway-<priceId>" string that would fail Jackson's Long binding on
      // the backend, so send null and rely on apiType/iwayPriceId instead.
      cabId: isIway ? null : cab.cabid,
      // i'way booking fields — all null for in-house rows, so that payload
      // is byte-for-byte unchanged from before this change.
      apiType: isIway ? "IWAY" : null,
      iwayPriceId: isIway ? (searchCriteria.iwayPriceId ?? null) : null,
      iwayPriceUid: isIway ? (searchCriteria.iwayPriceUid ?? null) : null,
      originLocation: isIway ? (searchCriteria.originLocation ?? null) : null,
      destinationLocation: isIway ? (searchCriteria.destinationLocation ?? null) : null,
      // Vehicle snapshot — captured now so the local voucher (which reads
      // Vehicle / Vehicle Image / Transporter from the in-house Cab FK for
      // in-house rows) can render the same slots for i'way rows without
      // hitting i'way at voucher-generation time. In-house payloads leave
      // these null and continue to render from the Cab entity as before.
      iwayVehicleName: isIway ? (cab?.cabname ?? null) : null,
      iwayVehicleImage: isIway ? (cab?.cabpic ?? null) : null,
      iwayProviderName: isIway ? (cab?.cabProviderName ?? null) : null,
      // flexible_tariff flag of the picked i'way offer (guide §11.6.2).
      // The backend uses this to gate text_tablet on create-order — sent
      // only when M&G is included in the price (flexible_tariff=false).
      // Null on in-house rows.
      iwayFlexibleTariff: isIway ? (cab?.iwayFlexibleTariff ?? null) : null,
      // AIT §8.5 opt-in — sends the toll_road additional_service ref only
      // when the operator ticks the "Include Toll Road" checkbox above.
      // Null on in-house rows and false on un-ticked i'way rows, both of
      // which the backend treats as "don't add the ref" (payload wire
      // shape unchanged from before this field existed).
      iwayIncludeTollRoad: isIway ? Boolean(iwayIncludeTollRoad) : null,
      // allowable_time (seconds) from the picked i'way offer. Forwarded
      // for TripServiceImpl.checkTimeForMeetAndGreet (guide §11.10) so
      // the backend can short-circuit obviously-too-soon pickups before
      // touching the wallet. Prefer the value carried on searchCriteria
      // (set on the search page); fall back to the cab row for older
      // hand-offs that only stamped it there. Null on in-house rows.
      iwayAllowableTime: isIway
        ? (searchCriteria.iwayAllowableTime ?? cab?.iwayAllowableTime ?? null)
        : null,
      // Guide §11.6.2 Meet & Greet sign text. Only forwarded when the
      // pickup is an airport (backend gates the write on that anyway); a
      // blank value tells the backend to auto-fill with the lead
      // passenger's name — which matches today's behaviour, so bookings
      // whose operator doesn't touch the Greeting Sign input send the
      // same text_tablet as before. Null on in-house rows and on i'way
      // rows whose pickup isn't an airport.
      iwayMeetGreetSign:
        isIway && pickupIsAirport
          ? ((pickupDetails.greetingSign || "").trim() || null)
          : null,
      noOfCabs: cab.noOfCabs || 1,
      pickupDate: formatDateToDDMMYYYY(searchCriteria.pickupDate),
      dropOffDate: formatDateToDDMMYYYY(searchCriteria.dropoffDate || searchCriteria.pickupDate),
      travelType: parseInt(selectedOption.travelType) || 1,
      locationId: parseInt(selectedOption.locationId) || 0,
      noOfAdult: parseInt(searchCriteria.adults) || 1,
      noOfChild: parseInt(searchCriteria.children) || 0,
      childAgeArray: (searchCriteria.childAges || []).map(age => parseInt(age)),
      totalRate: grandTotal,
      totalRateWithoutmrk: parseFloat(selectedOption.totalRateWithoutMrk || totalRate),
      tourismDirham: tdNumber > 0 ? tdNumber : null,
      agentId: parseInt(selectedAgentId),
      userId: parseInt(selectedAgentId),
      customerDTO: {
        salutation: primaryGuest.salutation,
        firstName: primaryGuest.firstName,
        lastName: primaryGuest.lastName,
        contactNumber: primaryGuest.contactNumber,
        emailId: primaryGuest.emailId,
        passportNumber: primaryGuest.passportNumber,
        lpo: primaryGuest.lpo
      },
      // Full pax manifest — backend persists each row into cab_guest. The
      // row marked as Lead also has its name/contact data forwarded into
      // customerDTO above, so the backend can split lead-vs-guest rows.
      guests: guests.map((g, idx) => {
        const adultsBefore = totalAdults;
        const seatNumber = g.isChild
          ? idx - adultsBefore + 1
          : idx + 1;
        return {
          salutation: g.salutation || null,
          firstName: g.firstName || null,
          middleName: g.middleName || null,
          lastName: g.lastName || null,
          gender: g.gender || null,
          isChild: !!g.isChild,
          age: g.age != null ? Number(g.age) : null,
          passportNo: g.passportNo || null,
          guestIndex: seatNumber,
          isLead: idx === leadIndex,
          // Per-guest contact for i'way's passengers[] payload (guide §12.4.2).
          // The Contact Details card writes the lead's values into
          // guests[leadIndex], so today only the lead row carries these;
          // non-lead rows send null and the backend falls back to the lead
          // contact. If per-guest inputs are later added to the passenger
          // table, no wiring change is needed here.
          contactNumber: g.contactNumber || null,
          emailId: g.emailId || null,
        };
      }),
      transporter: transporterDetails.transporter,
      contactNumber: transporterDetails.contactNumber,
      driverName: transporterDetails.driverName,
      driverContact: transporterDetails.driverContact,
      sellingPrice: String(sellingWithTd.toFixed(2)),
      totalPrice: String(grandTotal.toFixed(2)),
      // Pickup / Drop-off details forwarded from the search page. The
      // per-leg fields (arrivingFrom / flightNo / greetingSign /
      // departingTo / terminal / hotelAddress) are entered on the new
      // Pick Up Details / Drop Off Details cards above; for legs that
      // don't apply the field stays null so the entity row keeps a
      // clean NULL instead of an empty-string artefact.
      pickupType: searchCriteria.pickupType || null,
      pickupName: searchCriteria.pickupName || null,
      // i'way's start_location.time is required for EVERY route (not just
      // airport pickups — e.g. a Hotel → Airport transfer still needs a car
      // pickup time), unlike the in-house pickupTime column which the
      // booking-detail view only ever renders for airport pickups. Source
      // the always-collected search-time value for i'way instead of the
      // in-house AIRPORT-only conditional below.
      pickupTime: isIway
        ? searchCriteria.arrivalTime || searchCriteria.pickupTime || null
        : searchCriteria.pickupType === "AIRPORT"
          ? searchCriteria.pickupEstimatedArrivalTime ||
            searchCriteria.pickupTime ||
            null
          : null,
      pickupArrivingFrom:
        searchCriteria.pickupType === "AIRPORT"
          ? pickupDetails.arrivingFrom || null
          : null,
      pickupFlightNo:
        // i'way-native airports arrive as pickupType="IWAY" + originLocation.code=IATA,
        // so gate on pickupIsAirport (broader) for i'way and keep the existing
        // strict AIRPORT check for the in-house flow.
        (isIway ? pickupIsAirport : searchCriteria.pickupType === "AIRPORT")
          ? pickupDetails.flightNo || null
          : null,
      pickupGreetingSign:
        searchCriteria.pickupType === "AIRPORT"
          ? pickupDetails.greetingSign || null
          : null,
      pickupHotelAddress:
        searchCriteria.pickupType === "HOTEL"
          ? pickupHotelAddress || null
          : null,
      dropoffType: searchCriteria.dropoffType || null,
      dropoffName: searchCriteria.dropoffName || null,
      dropoffTime:
        searchCriteria.dropoffType === "AIRPORT"
          ? dropoffDetails.departureTime ||
            searchCriteria.dropoffTime ||
            null
          : null,
      dropoffDepartingTo:
        searchCriteria.dropoffType === "AIRPORT"
          ? dropoffDetails.departingTo || null
          : null,
      dropoffFlightNo:
        // Same widened check as pickup — i'way-native airport drops arrive
        // as dropoffType="IWAY" + destinationLocation.code=IATA.
        (isIway ? dropoffIsAirport : searchCriteria.dropoffType === "AIRPORT")
          ? dropoffDetails.flightNo || null
          : null,
      dropoffTerminal:
        searchCriteria.dropoffType === "AIRPORT"
          ? dropoffDetails.terminal || null
          : null,
      dropoffHotelAddress:
        searchCriteria.dropoffType === "HOTEL"
          ? dropoffHotelAddress || null
          : null,
      // HQ amount (operator-side Adjustment Amt). Blank → null so the
      // backend stores SQL NULL instead of 0 (lets reports tell apart
      // "no adjustment" from "zero adjustment").
      adjustmentAmount:
        hqAmount !== "" && !isNaN(Number(hqAmount))
          ? Number(hqAmount)
          : null,
      // Payment mode chosen on the Payment Method dropdown. Only "CREDIT"
      // (Agent credit limit) deducts the agent wallet; CARD / BANK_TRANSFER
      // / CASH are settled out-of-band and skip the deduction server-side.
      paymentMode,
      // Free-text additional notes captured on the checkout page.
      specialRequirements: specialRequirements.trim() || null,
      // Multi-select picks from the provider's configured catalog. Kept
      // separate from the free-text field above so the two roles are
      // preserved end-to-end (structured picks + free-form notes).
      selectedSpecialRequirements: (selectedSpecialRequirements || [])
        .map((opt) => (opt?.value || "").trim())
        .filter((v) => v.length > 0),
      // Lead passenger email — the voucher/updates recipient.
      sendEmailTo: primaryGuest.emailId || null,
      policyAccepted: true,
      acceptedTermsAndConditions: true,
      acceptedCancellationPolicies: true,
      termsAndConditions: cabPolicies.terms,
      cancellationPolicies: cabPolicies.cancellations,
      // Reverse-geocoded client location for the Booking History audit trail's
      // Location column. The IP Address column is stamped server-side from the
      // create request, so it is not sent here.
      bookingLocation: clientNetwork.bookingLocation,
    };

    setPendingPayload(payload);
    setShowSummaryModal(true);
  };

  // ── Step 2: actually POST to /api/cab/book once the user confirms in
  // the Order Summary modal. Mirrors HotelBookingPage.jsx's confirmBooking.
  const submitBooking = async () => {
    if (!pendingPayload) return;
    setIsSubmitting(true);
    try {
      const response = await axiosInstance.post("/api/cab/book", pendingPayload);

      if (response && (response.data?.success !== false && response.status === 200)) {
        if (isIway) {
          // No orders/approve call is wired up yet — the order exists on
          // i'way's side but isn't paid/confirmed there, so say so rather
          // than implying it's fully done.
          toast.success(
            "Booking received — pending confirmation with i'way.",
            { duration: 6000 },
          );
        } else {
          toast.success("Cab booked successfully!");
        }
        setShowSummaryModal(false);
        navigate("/booking-details/cab-booking-list");
      } else {
        toast.error(response.data?.message || "Failed to book cab.");
      }
    } catch (error) {
      console.error("Booking error:", error);
      // Surface the backend's actual message when available (e.g. an i'way
      // order-creation failure via IwayOrderCreationException) instead of a
      // generic message.
      toast.error(
        error?.response?.data?.message ||
          "An error occurred during booking. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat("en-AE", {
      style: "currency",
      currency: "AED",
    }).format(price || 0);
  };

  // Shared card-header style so every section reads as one system.
  const cardHeaderStyle = { backgroundColor: "#ffffff" };
  const routeArrow = " → ";

  // ── Quotation PDF ─────────────────────────────────────────────────────
  // Quotes what this page shows: the vehicle and trip rows of the Booking
  // Summary and the Price Details (Selling Price, Tourism Dirhams, the HQ
  // adjustment, Total) in AED, like formatPrice. Policy lines are the
  // cab's own cancellations / terms loaded on this page.
  const buildTransferQuotationPayload = () => {
    if (!hasValidState) return null;
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const tdNum =
      tourismDirham !== "" && !isNaN(Number(tourismDirham))
        ? Number(tourismDirham)
        : 0;
    const hqNum =
      hqAmount !== "" && !isNaN(Number(hqAmount)) ? Number(hqAmount) : 0;
    const grandTotal = Number(totalRate || 0) + tdNum + hqNum;
    const typeLabel =
      selectedOption.types === "SIC"
        ? "Shared (SIC)"
        : selectedOption.types === "Private"
          ? "Private Transfer"
          : selectedOption.types || "";
    const adults = Number(searchCriteria.adults) || 0;
    const children = Number(searchCriteria.children) || 0;
    const ages = Array.isArray(searchCriteria.childAges)
      ? searchCriteria.childAges.filter((a) => a !== "" && a != null)
      : [];
    const route = [searchCriteria.pickupName, searchCriteria.dropoffName]
      .filter(Boolean)
      .join(" to ");

    const leadNames = [leadGuest.firstName, leadGuest.middleName, leadGuest.lastName]
      .map((p) => (p ? String(p).trim() : ""))
      .filter(Boolean);
    const leadName = leadNames.length
      ? [leadGuest.salutation ? String(leadGuest.salutation).trim() : "", ...leadNames]
          .filter(Boolean)
          .join(" ")
      : "";

    const priceItems = [
      {
        description: `Transfer - ${cab.cabname || "Vehicle"}`,
        details: [route, typeLabel].filter(Boolean).join(", "),
        amount: round2(totalRate),
      },
    ];
    if (tdNum > 0) {
      priceItems.push({ description: "Tourism Dirhams", details: "", amount: round2(tdNum) });
    }
    if (hqNum !== 0) {
      priceItems.push({ description: "Adjustment", details: "", amount: round2(hqNum) });
    }

    return {
      bookingType: "TRANSFER",
      agentId: Number(selectedAgentId) || null,
      currency: "AED",
      serviceName: cab.cabname || "Transfer",
      serviceSubtitle: [
        typeLabel,
        cab.capacityMax != null ? `${cab.capacityMax} Seats` : "",
      ]
        .filter(Boolean)
        .join(", "),
      customerName: leadName || null,
      customerEmail: leadName ? leadGuest.emailId || null : null,
      customerMobile: leadName ? leadGuest.contactNumber || null : null,
      details: [
        { label: "Pickup", value: searchCriteria.pickupName || "" },
        { label: "Drop Off", value: searchCriteria.dropoffName || "" },
        {
          label: "Transfer Date",
          value: searchCriteria.pickupDate
            ? formatTransferDate(searchCriteria.pickupDate)
            : "",
        },
        {
          label: "Pickup Time",
          value: searchCriteria.pickupTime || searchCriteria.arrivalTime || "",
        },
        {
          label: "Drop Time",
          value: searchCriteria.dropoffTime
            ? `${searchCriteria.dropoffTime} (Est.)`
            : "",
        },
        { label: "Vehicle Type", value: typeLabel },
        { label: "Adults", value: String(adults) },
        {
          label: "Children",
          value: children
            ? `${children}${ages.length ? ` (Ages ${ages.join(", ")})` : ""}`
            : "0",
        },
        { label: "Nationality", value: searchCriteria.nationality?.label || "" },
        { label: "Arrival Flight", value: pickupDetails.flightNo || "" },
        { label: "Departure Flight", value: dropoffDetails.flightNo || "" },
      ],
      priceItems,
      totalAmount: round2(grandTotal),
      cancellationPolicy: Array.isArray(cabPolicies.cancellations)
        ? cabPolicies.cancellations
        : [],
      notes: [
        "Please arrive at the pickup point 10 minutes before the scheduled time.",
        ...(Array.isArray(cabPolicies.terms) ? cabPolicies.terms : []),
      ],
    };
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <Container fluid className="px-0">
            {/* ── Page heading (mirrors hotel-booking-page .hs-page-heading)
                 with the agent balance chip right-aligned above the form.
                 The Back button lives inside the Passenger Details card
                 header, matching HotelBookingPage's Guest Details card. */}
            <div className="hs-page-heading">
              <h3 className="hs-page-heading-title mb-0">Transfer Booking</h3>
            </div>
            <div className="d-flex justify-content-end mb-2">
              <AgentBalanceDisplay agentId={selectedAgentId} />
            </div>

            <Row className="g-4">
              {/* ── Left column — trip + traveller data ─────────────── */}
              <Col lg={8}>
                {/* ── Passenger Details — single source of truth for
                     traveller data. The row marked "Lead" is also
                     persisted as the customer/lead-passenger record;
                     all other rows go to the guest table. */}
                {guests.length > 0 && (
                  <Card className="border rounded-3 mb-4 overflow-hidden shadow-sm">
                    <Card.Header
                      className="py-3 px-4 text-dark border-bottom"
                      style={cardHeaderStyle}
                    >
                      <div className="d-flex align-items-center">
                        <Button
                          variant="outline-secondary"
                          size="sm"
                          onClick={() => navigate("/new-booking/cab")}
                          className="me-3 d-flex align-items-center gap-1"
                        >
                          <FaArrowLeft /> Back
                        </Button>
                        <FaUsers className="me-2" style={{ color: "#EC0B43" }} />
                        <span className="fw-bold text-dark">Passenger Details</span>
                        <span className="text-muted small ms-2">
                          ({totalAdults} Adult{totalAdults !== 1 ? "s" : ""}
                          {totalChildren > 0
                            ? `, ${totalChildren} Child${
                                totalChildren !== 1 ? "ren" : ""
                              }`
                            : ""}
                          )
                        </span>
                      </div>
                      {validationErrors.lead && (
                        <small className="text-danger d-block mt-1">
                          {validationErrors.lead}
                        </small>
                      )}
                    </Card.Header>
                    <Card.Body className="px-4 pt-3 pb-3">
                      <Row className="small text-muted px-2 mb-2 d-none d-md-flex fw-semibold text-uppercase">
                        <Col md={2}>Passenger Type</Col>
                        <Col md={2}>Title</Col>
                        <Col md={3}>
                          First Name <span className="text-danger">*</span>
                        </Col>
                        <Col md={3}>
                          Last Name <span className="text-danger">*</span>
                        </Col>
                        <Col md={2} className="text-center">
                          Lead
                        </Col>
                      </Row>
                      {guests.map((g, idx) => {
                        const adultSeat = idx + 1;
                        const childSeat = idx - totalAdults + 1;
                        const label = g.isChild
                          ? `Child ${childSeat}${
                              g.age != null ? ` (Age ${g.age})` : ""
                            }`
                          : `Adult ${adultSeat}`;
                        const isLead = leadIndex === idx;
                        return (
                          <Row
                            key={idx}
                            className="g-2 align-items-center mb-2"
                          >
                            <Col xs={12} md={2}>
                              <span className="text-dark small fw-semibold">
                                {label}
                              </span>
                            </Col>
                            <Col xs={6} md={2}>
                              <Form.Select
                                size="sm"
                                value={g.salutation}
                                onChange={(e) =>
                                  handleGuestChange(
                                    idx,
                                    "salutation",
                                    e.target.value,
                                  )
                                }
                                isInvalid={
                                  !!validationErrors[`guest_${idx}_salutation`]
                                }
                              >
                                <option value="">Title</option>
                                {g.isChild ? (
                                  <>
                                    <option value="Mstr">Mstr</option>
                                    <option value="Miss">Miss</option>
                                  </>
                                ) : (
                                  <>
                                    <option value="Mr">Mr</option>
                                    <option value="Mrs">Mrs</option>
                                    <option value="Ms">Ms</option>
                                  </>
                                )}
                              </Form.Select>
                            </Col>
                            <Col xs={6} md={3}>
                              <Form.Control
                                size="sm"
                                type="text"
                                placeholder="First Name"
                                value={g.firstName}
                                onChange={(e) =>
                                  handleGuestChange(
                                    idx,
                                    "firstName",
                                    e.target.value,
                                  )
                                }
                                isInvalid={
                                  !!validationErrors[`guest_${idx}_firstName`]
                                }
                              />
                            </Col>
                            <Col xs={6} md={3}>
                              <Form.Control
                                size="sm"
                                type="text"
                                placeholder="Last Name"
                                value={g.lastName}
                                onChange={(e) =>
                                  handleGuestChange(
                                    idx,
                                    "lastName",
                                    e.target.value,
                                  )
                                }
                                isInvalid={
                                  !!validationErrors[`guest_${idx}_lastName`]
                                }
                              />
                            </Col>
                            {/* Contact No. column hidden from the passenger
                                grid per request. The lead passenger's phone
                                is still captured (and required) in the
                                Contact Details card below, which is what
                                flows into customerDTO.contactNumber on save. */}
                            <Col xs={6} md={2} className="text-center">
                              <Form.Check
                                type="radio"
                                name="lead-guest"
                                id={`lead-${idx}`}
                                checked={isLead}
                                disabled={g.isChild}
                                onChange={() => handleLeadSelect(idx)}
                                title={
                                  g.isChild
                                    ? "Children cannot be the lead"
                                    : "Mark as Lead passenger"
                                }
                              />
                            </Col>
                          </Row>
                        );
                      })}
                    </Card.Body>
                  </Card>
                )}

                {/* ── Contact Details — lead passenger's phone.
                     Same value as the Lead row's Contact No.
                     Placed above Special Requirements so operators fill
                     the required contact fields before the optional notes. */}
                <Card className="border rounded-3 mb-4 overflow-hidden shadow-sm">
                  <Card.Header
                    className="py-3 px-4 text-dark border-bottom"
                    style={cardHeaderStyle}
                  >
                    <span className="fw-bold text-dark">Contact Details</span>
                  </Card.Header>
                  <Card.Body className="px-4 pt-3 pb-3">
                    <Row className="g-3">
                      <Col md={6}>
                        <Form.Label className="small text-muted fw-semibold mb-1">
                          Phone <span className="text-danger">*</span>
                        </Form.Label>
                        <Form.Control
                          size="sm"
                          type="text"
                          placeholder={
                            isIway
                              ? "e.g. +971501234567 (include country code)"
                              : "Please enter phone number"
                          }
                          value={leadGuest.contactNumber || ""}
                          onChange={(e) =>
                            handleGuestChange(
                              leadIndex,
                              "contactNumber",
                              e.target.value,
                            )
                          }
                          isInvalid={
                            !!validationErrors[`guest_${leadIndex}_contactNumber`]
                          }
                        />
                        <Form.Control.Feedback type="invalid">
                          {validationErrors[`guest_${leadIndex}_contactNumber`]}
                        </Form.Control.Feedback>
                      </Col>
                      {/* Email column — shown for BOTH in-house and i'way
                          rows so operators can capture a contact address on
                          every booking. Only i'way makes it required (guide
                          §11.9 needs it in passengers[]); in-house keeps it
                          optional so pre-existing flows without email don't
                          suddenly fail validation. */}
                      <Col md={6}>
                        <Form.Label className="small text-muted fw-semibold mb-1">
                          Email
                          {isIway && <span className="text-danger"> *</span>}
                        </Form.Label>
                        <Form.Control
                          size="sm"
                          type="email"
                          placeholder="Please enter email address"
                          value={leadGuest.emailId || ""}
                          onChange={(e) =>
                            handleGuestChange(leadIndex, "emailId", e.target.value)
                          }
                          isInvalid={!!validationErrors[`guest_${leadIndex}_emailId`]}
                        />
                        <Form.Control.Feedback type="invalid">
                          {validationErrors[`guest_${leadIndex}_emailId`]}
                        </Form.Control.Feedback>
                      </Col>
                      {/* Pick Up Flight Number — surfaced whenever the search's
                          pickup point is an airport, regardless of i'way vs
                          in-house (Airport → Hotel, Airport → City, etc.).
                          i'way requires start_location.flight_number when the
                          pickup is an airport (guide §12.4.5); the in-house
                          side keeps it optional so pre-existing in-house
                          Airport bookings that never captured a flight number
                          continue to submit exactly as before. */}
                      {showPickupFlightField && (
                        <Col md={6}>
                          <Form.Label className="small text-muted fw-semibold mb-1">
                            Pickup Flight Number
                            {isIway && (
                              <>
                                {" "}
                                <span className="text-danger">*</span>
                              </>
                            )}
                          </Form.Label>
                          <Form.Control
                            size="sm"
                            type="text"
                            placeholder="Please enter pickup flight number"
                            value={pickupDetails.flightNo || ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setPickupDetails((prev) => ({ ...prev, flightNo: v }));
                              if (validationErrors.pickupFlightNo) {
                                setValidationErrors((prev) => {
                                  const next = { ...prev };
                                  delete next.pickupFlightNo;
                                  return next;
                                });
                              }
                            }}
                            isInvalid={!!validationErrors.pickupFlightNo}
                          />
                          <Form.Control.Feedback type="invalid">
                            {validationErrors.pickupFlightNo}
                          </Form.Control.Feedback>
                        </Col>
                      )}
                      {showDropoffFlightField && (
                        <Col md={6}>
                          <Form.Label className="small text-muted fw-semibold mb-1">
                            Drop-off Flight Number
                          </Form.Label>
                          <Form.Control
                            size="sm"
                            type="text"
                            placeholder="e.g. EK456 (optional)"
                            value={dropoffDetails.flightNo || ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setDropoffDetails((prev) => ({ ...prev, flightNo: v }));
                            }}
                          />
                        </Col>
                      )}
                      {/* Guide §11.6.2 — Meet & Greet Sign text.
                          Shown only for i'way airport-pickup offers whose
                          selected class actually includes M&G in the price
                          (iwayFlexibleTariff !== true). The useEffect at the
                          top of the file pre-seeds greetingSign with the
                          lead passenger's full name, so leaving this input
                          untouched sends today's value; editing it forwards
                          the operator's custom text, and clearing it lets
                          the backend re-fall-back to the lead name. */}
                      {isIway && pickupIsAirport && cab?.iwayFlexibleTariff !== true && (
                        <Col md={6}>
                          <Form.Label className="small text-muted fw-semibold mb-1">
                            Meet &amp; Greet Sign{" "}
                            <span className="text-muted small">(optional)</span>
                          </Form.Label>
                          <Form.Control
                            size="sm"
                            type="text"
                            maxLength={60}
                            placeholder="Leave empty to use lead passenger's name"
                            value={pickupDetails.greetingSign || ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setPickupDetails((prev) => ({ ...prev, greetingSign: v }));
                            }}
                          />
                        </Col>
                      )}
                      {/* AIT §8.5 — Toll Road opt-in.
                          i'way rows only; leaves the in-house booking card
                          untouched. Extra fare (e.g. 29.93 AED on the CDG →
                          Disneyland route) is added by i'way to the trip
                          total; if the selected class doesn't offer toll
                          road (e.g. Business on that route) the backend
                          silently drops the ref so the booking still
                          succeeds without it. */}
                      {isIway && (
                        <Col md={12}>
                          <div className="d-flex align-items-start gap-2 p-2 border rounded-2 bg-light">
                            <Form.Check
                              type="checkbox"
                              id="iway-include-toll-road"
                              className="mt-0"
                              checked={iwayIncludeTollRoad}
                              onChange={(e) =>
                                setIwayIncludeTollRoad(e.target.checked)
                              }
                              label={
                                <span>
                                  <span className="fw-semibold">
                                    Include Toll Road
                                  </span>
                                  <span className="text-muted small ms-2">
                                    Adds the route's toll fee to the trip
                                    total (charged by i'way). Skipped
                                    automatically if the selected vehicle
                                    class doesn't offer it on this route.
                                  </span>
                                </span>
                              }
                            />
                          </div>
                        </Col>
                      )}
                    </Row>
                  </Card.Body>
                </Card>

                {/* ── Special Requirements ──────────────────────────────
                     Provider-configured multi-select up top (only what the
                     operator advertised for this rate) + a free-text
                     Additional Notes field below for anything outside that
                     catalog. Both are persisted separately on the booking. */}
                <Card className="border rounded-3 mb-4 overflow-hidden shadow-sm">
                  <Card.Header
                    className="py-3 px-4 text-dark border-bottom"
                    style={cardHeaderStyle}
                  >
                    <span className="fw-bold text-dark">Special Requirements</span>
                    <span className="text-muted small ms-2">(Optional)</span>
                  </Card.Header>
                  <Card.Body className="px-4 pt-3 pb-3">
                    {specialRequirementOptions.length > 0 ? (
                      <div className="mb-3">
                        <Form.Label className="fw-semibold mb-1 text-dark">
                          Available Services
                        </Form.Label>
                        <Select
                          isMulti
                          isClearable
                          closeMenuOnSelect={false}
                          placeholder="Pick any services you'd like…"
                          options={specialRequirementOptions}
                          value={selectedSpecialRequirements}
                          onChange={(vals) =>
                            setSelectedSpecialRequirements(vals || [])
                          }
                          classNamePrefix="cab-special-req"
                        />
                        <Form.Text className="text-muted">
                          Only services the provider offers for this cab are
                          shown here.
                        </Form.Text>
                      </div>
                    ) : (
                      <div className="text-muted small mb-3">
                        This provider has not advertised any add-on services
                        for this cab. Use the notes field below for any
                        requests.
                      </div>
                    )}

                    <Form.Label className="fw-semibold mb-1 text-dark">
                      Additional Notes
                    </Form.Label>
                    <div className="position-relative">
                      <Form.Control
                        as="textarea"
                        rows={2}
                        maxLength={200}
                        placeholder="Anything not in the list above…"
                        value={specialRequirements}
                        onChange={(e) => setSpecialRequirements(e.target.value)}
                      />
                      <span
                        className="text-muted small position-absolute"
                        style={{ right: 10, bottom: 6 }}
                      >
                        {specialRequirements.length}/200
                      </span>
                    </div>
                  </Card.Body>
                </Card>

                {/* ── HQ amount — operator-side Adjustment Amt persisted
                     to cab booking's adjustmentAmount column. The value
                     rolls into the Total on the right-hand Price Details
                     card. */}
                <Card className="border rounded-3 mb-4 overflow-hidden shadow-sm">
                  <Card.Header
                    className="py-3 px-4 text-dark border-bottom"
                    style={cardHeaderStyle}
                  >
                    <span className="fw-bold text-dark">HQ Amount</span>
                  </Card.Header>
                  <Card.Body className="px-4 pt-3 pb-3">
                    <Row className="g-3 align-items-center">
                      <Col md={4}>
                        <Form.Label className="small text-muted fw-semibold mb-1">
                          HQ amount
                        </Form.Label>
                        <Form.Control
                          size="sm"
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={hqAmount}
                          onChange={(e) => setHqAmount(e.target.value)}
                        />
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>

                {/* ── Important note banner */}
                <div
                  className="d-flex align-items-start gap-2 p-3 mb-4 rounded-3"
                  style={{ background: "#FFF8E1", border: "1px solid #FFECB3" }}
                >
                  <FaInfoCircle className="mt-1" style={{ color: "#B7791F" }} />
                  <div className="small text-dark">
                    <strong>Important Note:</strong> Please arrive at the pickup
                    point 10 minutes before the scheduled time.
                  </div>
                </div>

                {/* ── Payment Mode — mirrors HotelBookingPage.jsx.
                     Three scenarios:
                       1. Sufficient credit           → Credit Limit only
                       2. No credit + Card enabled    → Card only + note
                       3. No credit + Card disabled   → hard-block Alert
                     driven by hasSufficientCredit + agentCardPaymentEnabled. */}
                <Card className="border rounded-3 mb-4 shadow-sm">
                  <Card.Header
                    className="py-3 px-4 border-bottom d-flex align-items-center"
                    style={cardHeaderStyle}
                  >
                    <FaCreditCard className="me-2" style={{ color: "#EC0B43" }} />
                    <span className="fw-bold text-dark">Payment Mode</span>
                    <span className="text-danger ms-2">*</span>
                  </Card.Header>
                  <Card.Body className="p-4">
                    {paymentModeOptions.length > 0 ? (
                      <>
                        <Row className="g-3">
                          <Col md={6}>
                            <Form.Group>
                              <Form.Label className="fw-semibold mb-1 text-dark">
                                Mode
                              </Form.Label>
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
                  </Card.Body>
                </Card>

              </Col>

              {/* ── Right sticky column — mirrors HotelBookingPage layout.
                   Booking Summary carries the vehicle info + trip context,
                   Price Details underneath, sticky action bar at bottom. */}
              <Col lg={4} className="hbp-right-col">
                <div className="hbp-sticky-summary">
                  {/* Booking Summary — vehicle image/name at top,
                       trip context (route, date, times, pax) as
                       hbp-summary-row label/value pairs. */}
                  <Card className="shadow-sm rounded-3 mb-3 booking-summary-card border-0 overflow-hidden">
                    <Card.Header className="bg-primary text-white py-2 rounded-top">
                      <h6 className="mb-0 fw-bold text-white d-flex align-items-center">
                        <FaCar className="me-2" />
                        Booking Summary
                      </h6>
                    </Card.Header>
                    <Card.Body className="p-3">
                      {/* Vehicle info — image + name + seats + type + provider */}
                      <div className="d-flex gap-3 mb-3">
                        {cab.cabpic ? (
                          <img
                            src={cab.cabpic}
                            alt={cab.cabname}
                            style={{
                              width: 96,
                              height: 68,
                              objectFit: "cover",
                              borderRadius: 8,
                              flexShrink: 0,
                            }}
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: 96,
                              height: 68,
                              borderRadius: 8,
                              background: "#f1f3f5",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            <FaCar style={{ color: "#adb5bd", fontSize: 24 }} />
                          </div>
                        )}
                        <div className="flex-grow-1">
                          <div className="fw-bold text-dark">{cab.cabname}</div>
                          <div className="d-flex flex-wrap gap-3 mt-1 text-muted small">
                            {cab.capacityMax != null && (
                              <span className="d-flex align-items-center gap-1">
                                <FaUsers /> {cab.capacityMax} Seats
                              </span>
                            )}
                            <span className="d-flex align-items-center gap-1">
                              <FaCar /> {selectedOption.types}
                            </span>
                          </div>
                          {cab.cabProviderName && (
                            <div className="text-muted small mt-1">
                              {cab.cabProviderName}
                            </div>
                          )}
                        </div>
                      </div>
                      {cab.cabdetails && (
                        <div className="text-muted small mb-3">
                          {cab.cabdetails}
                        </div>
                      )}

                      {/* Trip info — hbp-summary-row pattern from hotel page.
                           Pickup / dropoff names come from what the user
                           actually picked on the search screen, not from the
                           selected offer's zone label (which is already a
                           pre-joined route string and would render doubled). */}
                      <div className="hbp-summary-row">
                        <div className="hbp-summary-label">
                          <FaMapMarkerAlt className="me-2 text-primary" />
                          Pickup
                        </div>
                        <div className="hbp-summary-value text-end">
                          {searchCriteria.pickupName || "—"}
                        </div>
                      </div>
                      <div className="hbp-summary-row">
                        <div className="hbp-summary-label">
                          <FaMapMarkerAlt className="me-2 text-primary" />
                          Drop Off
                        </div>
                        <div className="hbp-summary-value text-end">
                          {searchCriteria.dropoffName || "—"}
                        </div>
                      </div>
                      <div className="hbp-summary-row">
                        <div className="hbp-summary-label">
                          <FaClock className="me-2 text-primary" />
                          Transfer Date
                        </div>
                        <div className="hbp-summary-value">
                          {formatTransferDate(searchCriteria.pickupDate)}
                        </div>
                      </div>
                      <div className="hbp-summary-row">
                        <div className="hbp-summary-label">
                          <FaClock className="me-2 text-primary" />
                          Pickup Time
                        </div>
                        <div className="hbp-summary-value">
                          {searchCriteria.pickupTime ||
                            searchCriteria.arrivalTime ||
                            "—"}
                        </div>
                      </div>
                      <div className="hbp-summary-row">
                        <div className="hbp-summary-label">
                          <FaClock className="me-2 text-primary" />
                          Drop Time
                        </div>
                        <div className="hbp-summary-value">
                          {searchCriteria.dropoffTime
                            ? `${searchCriteria.dropoffTime} (Est.)`
                            : "—"}
                        </div>
                      </div>
                      <div className="hbp-summary-row">
                        <div className="hbp-summary-label">
                          <FaUsers className="me-2 text-primary" />
                          Adults
                        </div>
                        <div className="hbp-summary-value">
                          {searchCriteria.adults || 0}
                        </div>
                      </div>
                      <div className="hbp-summary-row">
                        <div className="hbp-summary-label">
                          <FaUsers className="me-2 text-primary" />
                          Children
                        </div>
                        <div className="hbp-summary-value">
                          {searchCriteria.children || 0}
                        </div>
                      </div>
                      {searchCriteria.nationality?.label && (
                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">
                            <FaInfoCircle className="me-2 text-primary" />
                            Nationality
                          </div>
                          <div className="hbp-summary-value">
                            {searchCriteria.nationality.label}
                          </div>
                        </div>
                      )}
                    </Card.Body>
                  </Card>

                  {/* Price Details */}
                  <Card className="rounded-3 border hbp-price-card shadow-sm">
                    <Card.Header
                      className="py-3 text-dark border-bottom fw-bold"
                      style={cardHeaderStyle}
                    >
                      Price Details
                    </Card.Header>
                    <Card.Body className="p-3">
                      {(() => {
                        const tdNum =
                          tourismDirham !== "" && !isNaN(Number(tourismDirham))
                            ? Number(tourismDirham)
                            : 0;
                        const hqNum =
                          hqAmount !== "" && !isNaN(Number(hqAmount))
                            ? Number(hqAmount)
                            : 0;
                        const grandTotal =
                          Number(totalRate || 0) + tdNum + hqNum;
                        return (
                          <>
                            <div className="hbp-summary-row">
                              <div className="hbp-summary-label text-muted">
                                Selling Price
                              </div>
                              <div className="hbp-summary-value">
                                {formatPrice(totalRate)}
                              </div>
                            </div>
                            <div className="hbp-summary-row">
                              <div className="hbp-summary-label text-muted">
                                Tourism Dirhams
                              </div>
                              <div className="hbp-summary-value">
                                {formatPrice(tdNum)}
                              </div>
                            </div>
                            {hqNum > 0 && (
                              <div className="hbp-summary-row">
                                <div className="hbp-summary-label text-muted">
                                  HQ Amount
                                </div>
                                <div className="hbp-summary-value">
                                  {formatPrice(hqNum)}
                                </div>
                              </div>
                            )}
                            <hr className="my-2" />
                            <div className="hbp-summary-row">
                              <div className="hbp-summary-label fw-bold text-dark">
                                Total
                              </div>
                              <div
                                className="fw-bold"
                                style={{ color: "#EC0B43", fontSize: "1.1rem" }}
                              >
                                {formatPrice(grandTotal)}
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </Card.Body>
                  </Card>

                  {/* Quotation — under the Price Details it quotes, above
                      the Confirm action bar. */}
                  <QuotationPdfCard
                    buildPayload={buildTransferQuotationPayload}
                    disabled={isSubmitting}
                  />

                  <div className="hbp-action-bar mt-3 d-flex gap-2">
                    <Button
                      variant="outline-secondary"
                      onClick={() => navigate(-1)}
                      className="flex-grow-1"
                      disabled={isSubmitting}
                    >
                      Back
                    </Button>
                    <Button
                      variant="primary"
                      type="button"
                      onClick={handleConfirmClick}
                      disabled={isSubmitting || noPaymentPathAvailable}
                      className="flex-grow-1"
                    >
                      {isSubmitting ? (
                        <>
                          <Spinner
                            animation="border"
                            size="sm"
                            className="me-2"
                          />
                          Processing...
                        </>
                      ) : (
                        <>
                          <FaCheckCircle className="me-1" />
                          Confirm
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </Col>
            </Row>
          </Container>
        </main>
      </div>

      {/* ── Transfer Policies & Terms modal — shown as the FIRST pop-up when
           the user clicks "Confirm Booking" (see handleConfirmClick). It lists
           the Terms & Conditions + Cancellation Policy and requires the
           mandatory acceptance checkbox in the footer to be ticked before the
           flow continues to the Order Summary modal. Dismissing it without
           agreeing clears the acceptance so the gate re-shows next time. */}
      <Modal
        show={showPolicyModal}
        onHide={() => {
          setShowPolicyModal(false);
          setAcceptedPolicies(false);
        }}
        dialogClassName="policy-modal"
        size="lg"
        centered
      >
        <Modal.Header closeButton className="policy-modal-header">
          <Modal.Title className="policy-modal-title">
            Transfer Policies &amp; Terms
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="policy-modal-body">
          {policyLoading ? (
            <div className="text-center py-5">
              <Spinner animation="border" variant="primary" />
              <p className="mt-3 text-muted">Loading policies...</p>
            </div>
          ) : (
            <>
              <section className="policy-section">
                <h6 className="policy-section-title">Terms &amp; Conditions</h6>
                {cabPolicies.terms.length > 0 ? (
                  cabPolicies.terms.map((item, idx) => (
                    <div key={`cab-term-${idx}`} className="policy-item">
                      <div className="policy-text">{item}</div>
                    </div>
                  ))
                ) : (
                  <div className="policy-empty">No terms and conditions configured for this cab rate.</div>
                )}
              </section>

              <section className="policy-section policy-section-last">
                <h6 className="policy-section-title">Cancellation Policy</h6>
                {cabPolicies.cancellations.length > 0 ? (
                  cabPolicies.cancellations.map((item, idx) => (
                    <div key={`cab-cancellation-${idx}`} className="policy-item">
                      <div className="policy-text">{item}</div>
                    </div>
                  ))
                ) : (
                  <div className="policy-empty">No cancellation policy configured for this cab rate.</div>
                )}
              </section>
            </>
          )}
        </Modal.Body>
        <Modal.Footer className="policy-modal-footer d-flex justify-content-between align-items-center flex-wrap gap-2">
          {/* Mandatory acceptance — "Agree & Continue" stays disabled until
               this box is ticked, so the booking cannot proceed without the
               user accepting the Terms & Conditions and Cancellation Policy. */}
          <Form.Check
            type="checkbox"
            id="cab-modal-accept-terms"
            checked={acceptedPolicies}
            onChange={(e) => setAcceptedPolicies(e.target.checked)}
            label={
              <span className="small">
                I have read and agree to the Terms &amp; Conditions and
                Cancellation Policy.
              </span>
            }
          />
          <div className="d-flex gap-2">
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => {
                setShowPolicyModal(false);
                setAcceptedPolicies(false);
              }}
            >
              Close
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={policyLoading || !acceptedPolicies}
              onClick={() => {
                setShowPolicyModal(false);
                proceedToOrderSummary();
              }}
            >
              Agree &amp; Continue
            </Button>
          </div>
        </Modal.Footer>
      </Modal>

      <Modal
        show={showSummaryModal}
        onHide={() => !isSubmitting && setShowSummaryModal(false)}
        size="lg"
        centered
        backdrop="static"
      >
        <Modal.Header closeButton={!isSubmitting}>
          <Modal.Title>
            <FaCar className="me-2 text-primary" />
            Order Summary — please review
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {/* Vehicle */}
          <Row className="mb-3">
            <Col md={2}>
              <img
                src={cab.cabpic || "https://via.placeholder.com/80?text=Cab"}
                alt={cab.cabname}
                style={{ width: "100%", height: 70, objectFit: "cover", borderRadius: 8 }}
              />
            </Col>
            <Col md={10}>
              <h6 className="fw-bold mb-1">{cab.cabname}</h6>
              <Badge bg={selectedOption?.types === "Private" ? "success" : "info"}>
                {selectedOption?.types === "Private"
                  ? "Private Transfer"
                  : "Shared (SIC)"}
              </Badge>
              {cab.cabProviderName && (
                <span className="text-muted small ms-2">
                  by {cab.cabProviderName}
                </span>
              )}
              <div className="text-muted small mt-1">
                Max Pax: {cab.vehicleMaxCapacity ?? cab.capacityMax ?? "—"}
                {"  ·  "}
                Max Luggage: {cab.vehicleMaxLuggage ?? cab.capacityMax ?? "—"}
                {cab.noOfCabs > 1 ? `  ·  ${cab.noOfCabs} Cabs` : ""}
              </div>
              {cab.cabdetails && (
                <div className="text-muted small mt-1">{cab.cabdetails}</div>
              )}
            </Col>
          </Row>

          <hr />

          {/* Trip */}
          <h6 className="fw-bold mb-2">Trip</h6>
          <Row className="mb-3">
            <Col md={4}>
              <small className="text-muted d-block">Pickup Date</small>
              <span>{searchCriteria.pickupDate || "—"}</span>
            </Col>
            <Col md={4}>
              <small className="text-muted d-block">Dropoff Date</small>
              <span>{searchCriteria.dropoffDate || searchCriteria.pickupDate || "—"}</span>
            </Col>
            <Col md={4}>
              <small className="text-muted d-block">Route</small>
              <span>
                {selectedOption?.location || "N/A"} → {selectedOption?.dropOff || "N/A"}
              </span>
            </Col>
          </Row>

          {/* Transfer details — city, nationality and the rate's service info
              (duration / distance / driver waiting time / currency) so the
              operator can verify the whole transfer before confirming. */}
          <Row className="mb-3">
            <Col md={4}>
              <small className="text-muted d-block">City</small>
              <span>
                {searchCriteria.city?.label ||
                  searchCriteria.destination?.label ||
                  "—"}
              </span>
            </Col>
            <Col md={4}>
              <small className="text-muted d-block">Nationality</small>
              <span>{searchCriteria.nationality?.label || "—"}</span>
            </Col>
            <Col md={4}>
              <small className="text-muted d-block">Duration</small>
              <span>{selectedOption?.hourDetails || "NA"}</span>
            </Col>
            <Col md={4} className="mt-2">
              <small className="text-muted d-block">Distance</small>
              <span>
                {selectedOption?.distance != null
                  ? `${Number(selectedOption.distance).toFixed(1)} Km`
                  : "—"}
              </span>
            </Col>
            <Col md={4} className="mt-2">
              <small className="text-muted d-block">Driver Waiting Time</small>
              <span>{selectedOption?.driverWaitingTime || "—"}</span>
            </Col>
            <Col md={4} className="mt-2">
              <small className="text-muted d-block">Currency</small>
              <span>{searchCriteria.currencyCode || "AED"}</span>
            </Col>
          </Row>

          {/* Pickup / Dropoff details — only shown when chosen upstream */}
          {(searchCriteria.pickupType || searchCriteria.dropoffType) && (
            <>
              <h6 className="fw-bold mb-2">Pickup &amp; Dropoff</h6>
              <Table responsive size="sm" bordered className="mb-3">
                <thead className="table-light">
                  <tr>
                    <th style={{ width: "20%" }}></th>
                    <th>Type</th>
                    <th>Name</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {searchCriteria.pickupType && (
                    <tr>
                      <td className="fw-semibold">Pickup</td>
                      <td>
                        <Badge bg="success-subtle" text="success">
                          {searchCriteria.pickupType}
                        </Badge>
                      </td>
                      <td>{searchCriteria.pickupName || "—"}</td>
                      <td>
                        {searchCriteria.pickupType === "AIRPORT" && searchCriteria.pickupTime
                          ? searchCriteria.pickupTime
                          : "—"}
                      </td>
                    </tr>
                  )}
                  {searchCriteria.dropoffType && (
                    <tr>
                      <td className="fw-semibold">Dropoff</td>
                      <td>
                        <Badge bg="warning-subtle" text="warning">
                          {searchCriteria.dropoffType}
                        </Badge>
                      </td>
                      <td>{searchCriteria.dropoffName || "—"}</td>
                      <td>{searchCriteria.dropoffTime || "—"}</td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </>
          )}

          {/* Passengers */}
          <h6 className="fw-bold mb-2">Passengers</h6>
          <Row className="mb-3">
            <Col md={6}>
              <small className="text-muted d-block">Adults</small>
              <span>{searchCriteria.adults || 0}</span>
            </Col>
            <Col md={6}>
              <small className="text-muted d-block">Children</small>
              <span>{searchCriteria.children || 0}</span>
            </Col>
          </Row>

          <hr />

          {/* Pax manifest in the order summary so the operator can
              double-check every traveller before confirming. */}
          {guests.length > 0 && (
            <>
              <h6 className="fw-bold mb-2">Passengers ({guests.length})</h6>
              <Table responsive size="sm" bordered className="mb-3">
                <thead className="table-light">
                  <tr>
                    <th>#</th>
                    <th>Type</th>
                    <th>Name</th>
                  </tr>
                </thead>
                <tbody>
                  {guests.map((g, idx) => (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      <td>
                        {g.isChild
                          ? `Child${g.age != null ? ` (${g.age})` : ""}`
                          : "Adult"}
                      </td>
                      <td>
                        {[g.salutation, g.firstName, g.lastName]
                          .filter(Boolean).join(" ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          )}

          {/* Primary guest */}
          <h6 className="fw-bold mb-2">Primary Guest</h6>
          <Row className="mb-3">
            <Col md={6}>
              <small className="text-muted d-block">Name</small>
              <span>
                {[primaryGuest.salutation, primaryGuest.firstName, primaryGuest.lastName]
                  .filter(Boolean).join(" ") || "—"}
              </span>
            </Col>
            <Col md={6}>
              <small className="text-muted d-block">Phone</small>
              <span>{primaryGuest.contactNumber || "—"}</span>
            </Col>
            <Col md={6} className="mt-2">
              <small className="text-muted d-block">Email</small>
              <span>{primaryGuest.emailId || "—"}</span>
            </Col>
          </Row>

          {/* Settlement mode + special requirements */}
          <Row className="mb-3">
            <Col md={6}>
              <small className="text-muted d-block">Payment Method</small>
              <span>
                {paymentModeLabel(pendingPayload?.paymentMode || paymentMode)}
              </span>
            </Col>
            {selectedSpecialRequirements.length > 0 && (
              <Col md={6}>
                <small className="text-muted d-block">Special Requirements</small>
                <span>
                  {selectedSpecialRequirements.map((o) => o.label).join(", ")}
                </span>
              </Col>
            )}
            {specialRequirements.trim() && (
              <Col md={6}>
                <small className="text-muted d-block">Additional Notes</small>
                <span>{specialRequirements.trim()}</span>
              </Col>
            )}
          </Row>

          <hr />

          {/* Pricing breakdown — selling, total, optional TD + HQ, grand
              total. HQ Amount must roll into the Grand Total so the modal
              matches the right-hand Price Details card + the saved amount. */}
          {(() => {
            const tdNum =
              tourismDirham !== "" && !isNaN(Number(tourismDirham))
                ? Number(tourismDirham)
                : 0;
            const hqNum =
              hqAmount !== "" && !isNaN(Number(hqAmount))
                ? Number(hqAmount)
                : 0;
            const sellingBase = Number(prices.sellingPrice) || 0;
            const totalBase = Number(prices.totalPrice) || 0;
            const grand = totalBase + tdNum + hqNum;
            return (
              <div className="p-3 bg-light rounded">
                <div className="d-flex justify-content-between mb-2 text-muted">
                  <span>Selling Price</span>
                  <span className="fw-medium">
                    AED {sellingBase.toFixed(2)}
                  </span>
                </div>
                <div className="d-flex justify-content-between mb-2 text-muted">
                  <span>Total Price</span>
                  <span className="fw-medium">
                    AED {totalBase.toFixed(2)}
                  </span>
                </div>
                {tdNum > 0 && (
                  <div className="d-flex justify-content-between mb-2 text-primary">
                    <span>Tourism Dirham</span>
                    <span className="fw-medium">+ AED {tdNum.toFixed(2)}</span>
                  </div>
                )}
                {hqNum > 0 && (
                  <div className="d-flex justify-content-between mb-2 text-primary">
                    <span>HQ Amount</span>
                    <span className="fw-medium">+ AED {hqNum.toFixed(2)}</span>
                  </div>
                )}
                <hr className="my-2" />
                <div className="d-flex justify-content-between align-items-center">
                  <span className="fw-semibold">Grand Total</span>
                  <span className="fs-4 fw-bold text-success">
                    AED {grand.toFixed(2)}
                  </span>
                </div>
                <small className="text-muted d-block mt-1">
                  This is the amount that will be saved against the booking.
                </small>
              </div>
            );
          })()}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowSummaryModal(false)}
            disabled={isSubmitting}
          >
            Edit Details
          </Button>
          <Button
            variant="success"
            onClick={submitBooking}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Booking…
              </>
            ) : (
              <>
                <FaCheckCircle className="me-2" />
                Confirm
              </>
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default CabBookingPage;
