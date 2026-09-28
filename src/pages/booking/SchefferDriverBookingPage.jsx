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
import { FaCar, FaUserAlt, FaCheckCircle, FaCalendarAlt, FaMapMarkerAlt, FaArrowLeft } from "react-icons/fa";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import AgentBalanceDisplay from "../../components/AgentBalanceDisplay";
import QuotationPdfCard from "../../components/quotation/QuotationPdfCard";
import "../../styles/SchefferDriverBookingPage.css";

const formatDateToDDMMYYYY = (dateString) => {
  if (!dateString) return "";
  const [year, month, day] = dateString.split("-");
  return `${day}-${month}-${year}`;
};

const SchefferDriverBookingPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { cab, selectedOption, searchCriteria } = location.state || {};

  // If accessed directly without state, we should probably redirect or show an error
  const hasValidState = !!cab && !!selectedOption && !!searchCriteria;

  // Lead-passenger marker — index into the guests array of the single pax
  // flagged as Lead. Mirrors /hotel-booking-page: the Lead-marked adult
  // drives the primary guest name / salutation at submit time. Defaults
  // to the first adult so the radio always has one selection on first
  // render. Children cannot be flagged as Lead.
  const [leadIndex, setLeadIndex] = useState(0);

  // Contact Details — booking-level contact info collected in its own
  // card below the Passenger Details grid. Kept separate from the pax
  // manifest because these fields aren't per-traveller; they're the
  // single point of contact for the booking.
  const [contactDetails, setContactDetails] = useState({
    contactNumber: "",
    emailId: "",
    // Free-text landmark for the pickup location (e.g. "Near Al Wasl Mall,
    // behind the ADNOC station"). Optional. Kept alongside the other
    // contact-level fields so the same handleContactChange/validation
    // shape covers it — no separate state slice needed.
    pickupLandmark: "",
  });

  // Intercity surcharge disclosure — heads-up shown after Contact Details.
  // The card is only rendered when this cab provider actually has intercity
  // charges configured (managed in /scheffer-driver-rates → Supplementary
  // Charges); providers with no rows never see the section. Fetched eagerly
  // when the booking page mounts so the presence/absence is known before
  // first paint of the left column.
  //   intercityCharges  – the provider's active rows (used to decide whether
  //                       to render the card at all).
  //   intercityDeclared – "yes" / "no" radio state (default "no").
  //   selectedIntercityId – radio-selected route id (display-only, no payload).
  const [intercityDeclared, setIntercityDeclared] = useState("no");
  const [intercityCharges, setIntercityCharges] = useState([]);
  const [selectedIntercityId, setSelectedIntercityId] = useState("");

  useEffect(() => {
    const providerId = cab?.cabProviderId;
    if (!providerId) return;
    let cancelled = false;
    axiosInstance
      .get("/api/scheffer-rental-rates/intercity", { params: { providerId } })
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res?.data) ? res.data : [];
        // Only keep active rows — inactive rows exist for internal admin
        // use and shouldn't be quoted to guests.
        setIntercityCharges(list.filter((c) => c.isActive !== false));
      })
      .catch(() => {
        if (!cancelled) setIntercityCharges([]);
      });
    return () => {
      cancelled = true;
    };
  }, [cab]);

  // Payment mode selector — mirrors the /hotel-booking-page pattern.
  // Default keeps the legacy behaviour (CREDITLIMIT) so existing callers
  // that don't touch the selector keep working. Value is sent as the
  // `paymentMode` field on the /api/scheffer/book payload; backend
  // ignores unknown fields, so this stays backward-compatible.
  const [paymentMode, setPaymentMode] = useState("CREDITLIMIT");

  // Effective available credit for the currently-selected agent (regular
  // available + any active Temporary Credit Limit). Null while loading so
  // the UI doesn't flash the wrong scenario on first render. Fetched from
  // /api/agent-credit-limit/agent/{id} — same endpoint the hotel flow uses.
  const [agentAvailableBalance, setAgentAvailableBalance] = useState(null);
  // Per-agent Card-payment gate (AgentView toggle). Falls back to false on
  // any fetch failure so a network hiccup never silently exposes Card.
  const [agentCardPaymentEnabled, setAgentCardPaymentEnabled] = useState(false);

  // ── Full pax manifest (one row per adult + child) ────────────────────
  // Seeded from the searchCriteria counts so the operator can capture
  // names for every traveller. Adult 1 stays in lock-step with the
  // primary guest contact above — editing one updates the other.
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
      });
    }
    return out;
    // eslint-disable-next-line
  }, []);
  const [guests, setGuests] = useState(initialGuests);

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

  // Flip which pax is the Lead. Children can't be Lead — the caller is
  // expected to gate the radio's `disabled` on `g.isChild`, but we
  // double-check here so an accidental programmatic call is a no-op.
  const handleLeadSelect = (idx) => {
    const g = guests[idx];
    if (!g || g.isChild) return;
    setLeadIndex(idx);
  };

  const [validationErrors, setValidationErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Order Summary modal — mirrors HotelBookingPage.jsx pattern ─────
  // The "Confirm Booking" button now validates + builds the payload and
  // opens this modal. Only the modal's own confirm action actually POSTs
  // to /api/scheffer/book, giving the user a final review step before save.
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [pendingPayload, setPendingPayload] = useState(null);

  // ── Policies + T&C consent modal ─────────────────────────────────────
  // Mirrors the /hotel-booking-page pattern: Confirm Booking opens this
  // modal first, the operator ticks the accept box, then Proceed continues
  // to the Order Summary modal that already exists on this page. The two
  // arrays are fetched inline from /api/scheffer-rental-rates/{id} because
  // the search-result card doesn't carry them.
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [rateTerms, setRateTerms] = useState([]);
  const [rateCancellationPolicies, setRateCancellationPolicies] = useState([]);

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

  const selectedRoute = intercityCharges.find(
    (c) => String(c.intercityChargeId) === String(selectedIntercityId)
  );
  const intercitySurcharge =
    intercityDeclared === "yes" && selectedRoute
      ? parseFloat(selectedRoute.additionalCharge) || 0
      : 0;

  const [prices, setPrices] = useState({
    sellingPrice: initialTotalRate.toString(),
    totalPrice: initialTotalRate.toString(),
  });

  useEffect(() => {
    const baseSelling = parseFloat(selectedOption?.totalRate || selectedOption?.totalRateWithoutMrk || rate || 0);
    const baseTotal = parseFloat(selectedOption?.totalRate || selectedOption?.totalRateWithoutMrk || rate || 0);

    setPrices({
      sellingPrice: (baseSelling + intercitySurcharge).toString(),
      totalPrice: (baseTotal + intercitySurcharge).toString(),
    });
  }, [intercitySurcharge, selectedOption, rate]);

  const [tourismDirham, setTourismDirham] = useState("");

  // Resolved agent id used for the payment-gate fetches. Mirrors the
  // same-priority resolution used in the payload builder below (session →
  // localStorage → fallback "1"). Kept as a plain expression, not a hook,
  // so the effects below can read the current value on every render.
  const resolvedAgentId =
    sessionStorage.getItem("makeYourOwnPackageAgentId") ||
    localStorage.getItem("makeYourOwnPackageAgentId") ||
    "1";

  // ── Fetch the agent's effective available credit ──
  // Same endpoint + fallback shape as /hotel-booking-page. On any
  // network / 404 failure we treat balance as null (unknown) so the
  // credit-sufficiency check returns null and the UI keeps the default
  // Credit Limit option instead of flashing an empty state.
  useEffect(() => {
    if (!resolvedAgentId) {
      setAgentAvailableBalance(null);
      return;
    }
    let cancelled = false;
    axiosInstance
      .get(`/api/agent-credit-limit/agent/${resolvedAgentId}`)
      .then((res) => {
        if (cancelled) return;
        const combined =
          res?.data?.effectiveAvailableCreditLimit ??
          res?.data?.availableCreditLimit ??
          null;
        setAgentAvailableBalance(combined);
      })
      .catch(() => {
        if (!cancelled) setAgentAvailableBalance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [resolvedAgentId]);

  // ── Fetch the per-agent Card-payment gate ──
  useEffect(() => {
    if (!resolvedAgentId) {
      setAgentCardPaymentEnabled(false);
      return;
    }
    let cancelled = false;
    axiosInstance
      .get(`/api/agent/${resolvedAgentId}`)
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
  }, [resolvedAgentId]);

  // Total the agent owes for this booking (AED) — matches what the
  // Booking Summary displays as the Grand Total. Feeds the sufficiency
  // check that drives the payment-mode options.
  const bookingSellingPrice = useMemo(() => {
    const base = Number(prices.totalPrice) || 0;
    const td =
      tourismDirham !== "" && !isNaN(Number(tourismDirham))
        ? Number(tourismDirham)
        : 0;
    return base + td;
  }, [prices.totalPrice, tourismDirham]);

  // Client-side sufficiency flag. Null while balance is still loading so
  // the UI defaults to Credit Limit and doesn't flash the wrong scenario.
  const hasSufficientCredit = useMemo(() => {
    if (agentAvailableBalance == null) return null;
    return Number(agentAvailableBalance) >= bookingSellingPrice;
  }, [agentAvailableBalance, bookingSellingPrice]);

  // Hard-block scenario: no credit AND per-agent Card gate is off — the
  // agent has no viable path to complete the booking.
  const noPaymentPathAvailable =
    hasSufficientCredit === false && !agentCardPaymentEnabled;

  // Three-scenario option list, identical rules to /hotel-booking-page:
  //   1. Sufficient credit                    → Credit Limit only
  //   2. Insufficient credit + Card enabled   → Card only
  //   3. Insufficient credit + Card disabled  → no options, banner shown
  // While the balance is loading (null), fall back to Credit Limit so
  // the dropdown never renders empty on first paint.
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

  // Snap paymentMode to the first available option whenever the option
  // set changes so we never send a value the current scenario forbids.
  useEffect(() => {
    if (paymentModeOptions.length === 0) return;
    if (!paymentModeOptions.some((o) => o.value === paymentMode)) {
      setPaymentMode(paymentModeOptions[0].value);
    }
  }, [paymentModeOptions, paymentMode]);

  // If no state, show prompt
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
                <Button variant="primary" onClick={() => navigate("/new-booking/scheffer-driver")}>
                  Go to Cab Search
                </Button>
              </Card.Body>
            </Card>
          </main>
        </div>
      </div>
    );
  }

  const totalRate = parseFloat(prices.totalPrice) || initialTotalRate;

  const handleContactChange = (field, value) => {
    setContactDetails((prev) => ({ ...prev, [field]: value }));
    // Clear inline error as soon as the operator starts fixing it.
    if (validationErrors[field]) {
      setValidationErrors((prev) => {
        const updated = { ...prev };
        delete updated[field];
        return updated;
      });
    }
  };

  const validateForm = () => {
    const errors = {};
    let hasErrors = false;

    // Contact Details — required booking-level fields.
    if (!contactDetails.contactNumber || contactDetails.contactNumber.trim() === "") {
      errors.contactNumber = "Contact Number is required";
      hasErrors = true;
    }
    if (!contactDetails.emailId || contactDetails.emailId.trim() === "") {
      errors.emailId = "Email ID is required";
      hasErrors = true;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactDetails.emailId)) {
      errors.emailId = "Please enter a valid email address";
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

    return { errors, hasErrors };
  };

  // ── Step 1: validate + build payload + open Order Summary modal.
  // No backend call yet — the user must explicitly confirm in the modal.
  const handleConfirmClick = () => {
    // Belt-and-braces guard — the button is already disabled when this
    // is true, but a hard refusal here means a bypassed disable can't
    // still POST a booking the agent has no way to pay for.
    if (noPaymentPathAvailable) {
      toast.error(
        "No payment method available. Enable card payment or contact your admin."
      );
      return;
    }

    const { errors, hasErrors } = validateForm();

    if (hasErrors) {
      setValidationErrors(errors);
      toast.error("Please fill in all required fields correctly.");
      return;
    }

    const agentId = sessionStorage.getItem("makeYourOwnPackageAgentId")
                 || localStorage.getItem("makeYourOwnPackageAgentId")
                 || "1";

    const tdNumber =
      tourismDirham !== "" && !isNaN(Number(tourismDirham))
        ? Number(tourismDirham)
        : 0;
    const sellingWithTd = (parseFloat(prices.sellingPrice) || 0) + tdNumber;
    const totalWithTd = (parseFloat(prices.totalPrice) || totalRate) + tdNumber;

    const payload = {
      cabId: cab.cabid,
      noOfCabs: cab.noOfCabs || 1,
      pickupDate: formatDateToDDMMYYYY(searchCriteria.pickupDate),
      dropOffDate: formatDateToDDMMYYYY(searchCriteria.dropoffDate || searchCriteria.pickupDate),
      travelType: 2, // 2 = chauffeur rental
      locationId: parseInt(selectedOption.locationId) || 0,
      hourDetails: selectedOption.hoursIncluded != null ? parseInt(selectedOption.hoursIncluded) : null,
      // Implicit policy acceptance — the Confirm Booking button shows
      // "By confirming, you agree to the Terms and Conditions" right above
      // it, so clicking Confirm is the user's acceptance. The backend
      // (SchefferBookingService.save) rejects the request otherwise.
      policyAccepted: true,
      acceptedTermsAndConditions: true,
      acceptedCancellationPolicies: true,
      // ----- Chauffeur-rental package snapshot (frozen onto the booking) -----
      rentalRateId: selectedOption.rentalRateId || null,
      rentalPackageId: selectedOption.packageId || null,
      cityId: selectedOption.cityId || searchCriteria.cityId || null,
      cityName: selectedOption.cityName || searchCriteria.cityName || null,
      cabType: selectedOption.cabType || searchCriteria.cabType || null,
      packageName: selectedOption.packageName || null,
      includedHours: selectedOption.hoursIncluded != null ? parseInt(selectedOption.hoursIncluded) : null,
      includedKm: selectedOption.kmIncluded != null ? parseInt(selectedOption.kmIncluded) : null,
      basePrice: selectedOption.basePrice != null ? Number(selectedOption.basePrice) : null,
      extraHourRate: selectedOption.extraHourRate != null ? Number(selectedOption.extraHourRate) : null,
      extraKmRate: selectedOption.extraKmRate != null ? Number(selectedOption.extraKmRate) : null,
      nightCharge: selectedOption.nightCharge != null ? Number(selectedOption.nightCharge) : null,
      waitingCharge: selectedOption.waitingCharge != null ? Number(selectedOption.waitingCharge) : null,
      airportPickupCharge: selectedOption.airportPickupCharge != null ? Number(selectedOption.airportPickupCharge) : null,
      airportDropCharge: selectedOption.airportDropCharge != null ? Number(selectedOption.airportDropCharge) : null,
      noOfAdult: parseInt(searchCriteria.adults) || 1,
      noOfChild: parseInt(searchCriteria.children) || 0,
      childAgeArray: (searchCriteria.childAges || []).map(age => parseInt(age)),
      totalRate: totalWithTd,
      totalRateWithoutmrk: parseFloat(selectedOption.totalRateWithoutMrk || initialTotalRate) + intercitySurcharge,
      intercityChargeId: intercityDeclared === "yes" && selectedIntercityId ? parseInt(selectedIntercityId, 10) : null,
      intercitySurcharge: intercitySurcharge,
      intercityDeclared: intercityDeclared,
      tourismDirham: tdNumber > 0 ? tdNumber : null,
      agentId: parseInt(agentId),
      userId: parseInt(agentId),
      // Primary guest (customer) — name / salutation come from the pax
      // marked as Lead in the Passenger Details grid, matching the
      // /hotel-booking-page pattern. Contact Number + Email ID come
      // from the dedicated Contact Details card below the pax grid.
      // LPO is no longer collected here (Agent Reference is added later
      // via ADD AGENT REFERENCE on the booking detail view).
      customerDTO: (() => {
        const lead = guests[leadIndex] || {};
        return {
          salutation: lead.salutation || "",
          firstName: lead.firstName || "",
          lastName: lead.lastName || "",
          contactNumber: contactDetails.contactNumber,
          emailId: contactDetails.emailId,
        };
      })(),
      // Full pax manifest — backend persists each row into cab_guest.
      // `isLead` marks the single pax the operator flagged as Lead so the
      // booking-detail view can surface it, same shape as the Hotel
      // module. Backend ignores unknown fields, so this stays backward-
      // compatible with existing /api/scheffer/book callers.
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
        };
      }),
      // Transporter / driver fields removed from the UI — send empty
      // strings so the backend contract stays unchanged for legacy
      // consumers that still read these columns.
      transporter: "",
      contactNumber: "",
      driverName: "",
      driverContact: "",
      sellingPrice: String(sellingWithTd.toFixed(2)),
      totalPrice: String(totalWithTd.toFixed(2)),
      // Payment mode picked from the new selector (mirrors /hotel-booking-page).
      paymentMode,
      // Pickup / Drop-off details — prefer the zone-based search result row
      // (selectedOption.pickup / dropOff / pickupTime / dropoffTime), then
      // fall back to the search criteria's origin/destination location, then
      // finally the legacy hidden-form fields. Without this, all four
      // columns end up null in the DB because the modern search page no
      // longer populates the legacy pickupName / pickupType fields.
      // Operational pickup / dropoff captured on the search page (zone /
      // hotel / airport). Falls back to the city for rentals where the user
      // didn't specify anything — the package is still city-based so the
      // city is a sensible default.
      pickupType: searchCriteria.pickupType || "CITY",
      pickupName:
        searchCriteria.pickupName ||
        selectedOption.cityName ||
        searchCriteria.cityName ||
        null,
      pickupTime: searchCriteria.pickupTime || null,
      pickupLandmark: contactDetails.pickupLandmark || null,
      pickupLandmarkAddress: contactDetails.pickupLandmark || null,
      pickupAddress: contactDetails.pickupLandmark || null,
      landmark: contactDetails.pickupLandmark || null,
      dropoffType: searchCriteria.dropoffType || "CITY",
      dropoffName:
        searchCriteria.dropoffName ||
        selectedOption.cityName ||
        searchCriteria.cityName ||
        null,
      dropoffTime: searchCriteria.dropoffTime || null,
      // Max luggage capacity from the cab registration — snapshot at booking
      // time so the detail view can display it without a separate lookup.
      // Robust fallback chain mirrors what the search result card uses.
      maxLuggageCapacity:
        selectedOption.maxLuggageCapacity ??
        selectedOption.maxLuggage ??
        selectedOption.vehicleMaxLuggage ??
        selectedOption.luggageCapacity ??
        null,
    };

    setPendingPayload(payload);

    // Step 1a — open the Policies / T&C modal FIRST (mirrors Hotel).
    // Fetch the rate's saved policy lists inline so the modal renders the
    // real data. Any failure falls back to empty arrays; the modal still
    // opens with "No terms configured" placeholders so the flow isn't
    // blocked by a network hiccup — same behaviour Hotel shows.
    setPolicyAccepted(false);
    setShowPolicyModal(true);
    const rateId = selectedOption?.rentalRateId;
    if (rateId) {
      setPoliciesLoading(true);
      axiosInstance
        .get(`/api/scheffer-rental-rates/${rateId}`)
        .then((res) => {
          const d = res?.data || {};
          setRateTerms(Array.isArray(d.termsAndConditions) ? d.termsAndConditions : []);
          setRateCancellationPolicies(
            Array.isArray(d.cancellationPolicies) ? d.cancellationPolicies : []
          );
        })
        .catch(() => {
          setRateTerms([]);
          setRateCancellationPolicies([]);
        })
        .finally(() => setPoliciesLoading(false));
    } else {
      setRateTerms([]);
      setRateCancellationPolicies([]);
    }
  };

  // ── Step 1b: Policies modal → Proceed. Closes the policy modal and
  // hands off to the existing Order Summary modal (which owns the final
  // Confirm & Book step). Separated so we don't skip the T&C acceptance.
  const proceedFromPolicy = () => {
    if (!policyAccepted) return;
    setShowPolicyModal(false);
    setShowSummaryModal(true);
  };

  // ── Back button on the Booking Summary column → return to the search
  // page so the operator can revise cab / package selection.
  const handleBackToSearch = () => {
    // Preserve the current search context by passing state so the search
    // form doesn't reset (mirrors what the "Modify Search" collapse
    // already does on the search page).
    navigate("/new-booking/scheffer-driver", {
      state: searchCriteria || null,
    });
  };

  // ── Step 2: actually POST to /api/scheffer/book once the user confirms in
  // the Order Summary modal. Mirrors HotelBookingPage.jsx's confirmBooking.
  const submitBooking = async () => {
    if (!pendingPayload) return;
    setIsSubmitting(true);
    try {
      const response = await axiosInstance.post("/api/scheffer/book", pendingPayload);

      if (response && (response.data?.success !== false && response.status === 200)) {
        toast.success("Cab booked successfully!");
        setShowSummaryModal(false);
        navigate("/booking-details/scheffer-driver-booking-list");
      } else {
        toast.error(response.data?.message || "Failed to book cab.");
      }
    } catch (error) {
      console.error("Booking error:", error);
      // Surface the actual backend message so the operator can see WHY
      // the booking failed (e.g. insufficient credit, missing field).
      // The Spring ResponseStatusException reason lives on `error` or
      // in `error.response.data.message`; probe the common shapes.
      const backendMsg =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        (typeof error?.response?.data === "string" ? error.response.data : null) ||
        error?.message ||
        "An error occurred during booking. Please try again.";
      toast.error(backendMsg);
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

  // ── Quotation PDF ─────────────────────────────────────────────────────
  // Quotes what this page shows: the Booking Summary rows and the Price
  // Details (Package Fare, Intercity Surcharge, Tourism Dirham, New Total)
  // in AED, like formatPrice. The rate's cancellation policies / terms are
  // the ones the Policies modal shows — loaded here if Confirm hasn't
  // loaded them yet.
  const buildChauffeurQuotationPayload = async () => {
    if (!hasValidState) return null;
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    let cancellations = rateCancellationPolicies;
    let terms = rateTerms;
    const rateId = selectedOption?.rentalRateId;
    if (rateId && !cancellations.length && !terms.length) {
      try {
        const res = await axiosInstance.get(`/api/scheffer-rental-rates/${rateId}`);
        const d = res?.data || {};
        terms = Array.isArray(d.termsAndConditions) ? d.termsAndConditions : [];
        cancellations = Array.isArray(d.cancellationPolicies)
          ? d.cancellationPolicies
          : [];
      } catch {
        // Quote without the policy text rather than failing the quotation.
      }
    }
    const textLines = (list) =>
      (Array.isArray(list) ? list : []).filter(
        (t) => typeof t === "string" && t.trim(),
      );

    const tdNum =
      tourismDirham !== "" && !isNaN(Number(tourismDirham))
        ? Number(tourismDirham)
        : 0;
    const grandTotal = Number(totalRate || 0) + tdNum;
    const packageFare = totalRate - intercitySurcharge;
    const packageText = [
      selectedOption.packageName,
      selectedOption.hoursIncluded != null
        ? `${selectedOption.hoursIncluded} hrs`
        : "",
      selectedOption.kmIncluded != null
        ? `${selectedOption.kmIncluded} km included`
        : "",
    ]
      .filter(Boolean)
      .join(", ");
    const pickup =
      searchCriteria.pickupName ||
      selectedOption?.cityName ||
      searchCriteria.cityName ||
      "";
    const dropoff =
      searchCriteria.dropoffName ||
      searchCriteria.pickupName ||
      selectedOption?.cityName ||
      searchCriteria.cityName ||
      "";
    const adults = Number(searchCriteria.adults) || 0;
    const children = Number(searchCriteria.children) || 0;

    const lead = guests[leadIndex] || {};
    const leadNames = [lead.firstName, lead.middleName, lead.lastName]
      .map((p) => (p ? String(p).trim() : ""))
      .filter(Boolean);
    const leadName = leadNames.length
      ? [lead.salutation ? String(lead.salutation).trim() : "", ...leadNames]
          .filter(Boolean)
          .join(" ")
      : "";

    const priceItems = [
      {
        description: `Chauffeur - ${cab.cabname || "Vehicle"}`,
        details: packageText,
        amount: round2(packageFare),
      },
    ];
    if (intercitySurcharge > 0) {
      priceItems.push({
        description: "Intercity Surcharge",
        details: selectedRoute
          ? [selectedRoute.fromCityName, selectedRoute.toCityName]
              .filter(Boolean)
              .join(" to ")
          : "",
        amount: round2(intercitySurcharge),
      });
    }
    if (tdNum > 0) {
      priceItems.push({ description: "Tourism Dirham", details: "", amount: round2(tdNum) });
    }

    return {
      bookingType: "CHAUFFEUR",
      agentId: Number(resolvedAgentId) || null,
      currency: "AED",
      serviceName: cab.cabname || "Chauffeur Service",
      serviceSubtitle: [selectedOption.cabType, selectedOption.cityName]
        .filter(Boolean)
        .join(", "),
      customerName: leadName || null,
      customerEmail: leadName ? contactDetails.emailId || null : null,
      customerMobile: leadName ? contactDetails.contactNumber || null : null,
      details: [
        { label: "Pickup Date", value: searchCriteria.pickupDate || "" },
        { label: "Pickup Time", value: searchCriteria.pickupTime || "" },
        { label: "Rental Package", value: packageText },
        { label: "Pickup", value: pickup },
        { label: "Pickup Landmark", value: contactDetails.pickupLandmark || "" },
        {
          label: "Dropoff",
          value: `${dropoff}${
            searchCriteria.dropoffTime ? ` @ ${searchCriteria.dropoffTime}` : ""
          }`,
        },
        {
          label: "Passengers",
          value: `${adults} Adult${adults !== 1 ? "s" : ""}${
            children ? `, ${children} Child${children > 1 ? "ren" : ""}` : ""
          }`,
        },
      ],
      priceItems,
      totalAmount: round2(grandTotal),
      cancellationPolicy: textLines(cancellations),
      notes: textLines(terms),
    };
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <Container fluid className="px-0">
            <div className="d-flex justify-content-between align-items-center mb-2">
              {/* Top Back button — same handler as the Back button in the
                  Booking Summary column, so both do the exact same thing
                  (mirrors /hotel-booking-page's inline "← Back" next to
                  the section heading). */}
              <div className="d-flex align-items-center">
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={handleBackToSearch}
                  disabled={isSubmitting}
                  className="me-3"
                >
                  ← Back
                </Button>
                <h4 className="fw-bold mb-0 text-primary">Cab Booking Checkout</h4>
              </div>
              <AgentBalanceDisplay
                agentId={
                  sessionStorage.getItem("makeYourOwnPackageAgentId") ||
                  localStorage.getItem("makeYourOwnPackageAgentId")
                }
              />
            </div>

            <Row className="g-4">
              {/* Left Column: Guest Details */}
              <Col lg={8}>
                {/* Primary Guest Details card removed — the Passenger
                    Details grid below IS the guest details section for
                    chauffeur bookings, matching /hotel-booking-page where
                    the Guest Details grid is the single source of pax
                    data and the Lead-marked pax drives the customerDTO
                    at submit time. */}

                {/* ── Pax Manifest ─────────────────────────────────────
                     One compact row per traveller (Adult 1..N, Child
                     1..M). The pax marked as Lead via the last-column
                     radio drives the primary guest card / customerDTO
                     name fields at submit time — same pattern as
                     /hotel-booking-page. Children can't be Lead. */}
                {guests.length > 0 && (
                  <Card className="shadow border-0 rounded-4 mb-4">
                    <Card.Header className="bg-white border-0 pt-3 px-4 pb-2">
                      <h6 className="fw-semibold text-dark d-flex align-items-center mb-0">
                        <FaUserAlt className="me-2 text-primary" />
                        Passenger Details
                        <span className="text-muted small ms-2">
                          ({totalAdults} Adult{totalAdults !== 1 ? "s" : ""}
                          {totalChildren > 0 ? `, ${totalChildren} Child${totalChildren !== 1 ? "ren" : ""}` : ""})
                        </span>
                      </h6>
                    </Card.Header>
                    <Card.Body className="px-4 pt-2 pb-3">
                      {/* Column headers — mirrors the Hotel Booking grid. */}
                      <Row className="g-2 fw-semibold small text-muted d-none d-md-flex mb-1">
                        <Col md={2}>Passenger</Col>
                        <Col md={2}>Title</Col>
                        <Col md={3}>First Name</Col>
                        <Col md={4}>Last Name</Col>
                        <Col md={1} className="text-center">Lead</Col>
                      </Row>
                      {guests.map((g, idx) => {
                        const adultSeat = idx + 1;
                        const childSeat = idx - totalAdults + 1;
                        const label = g.isChild
                          ? `Child ${childSeat}${g.age != null ? ` (Age ${g.age})` : ""}`
                          : `Adult ${adultSeat}`;
                        const isLead = idx === leadIndex;
                        return (
                          <Row key={idx} className="g-2 align-items-center mb-2">
                            <Col xs={12} md={2}>
                              <span className="fw-semibold text-muted small">
                                {label}
                              </span>
                            </Col>
                            <Col xs={6} md={2}>
                              <Form.Select
                                size="sm"
                                value={g.salutation}
                                onChange={(e) =>
                                  handleGuestChange(idx, "salutation", e.target.value)
                                }
                                isInvalid={!!validationErrors[`guest_${idx}_salutation`]}
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
                                  handleGuestChange(idx, "firstName", e.target.value)
                                }
                                isInvalid={!!validationErrors[`guest_${idx}_firstName`]}
                              />
                            </Col>
                            <Col xs={6} md={4}>
                              <Form.Control
                                size="sm"
                                type="text"
                                placeholder="Last Name"
                                value={g.lastName}
                                onChange={(e) =>
                                  handleGuestChange(idx, "lastName", e.target.value)
                                }
                                isInvalid={!!validationErrors[`guest_${idx}_lastName`]}
                              />
                            </Col>
                            <Col xs={6} md={1} className="text-center">
                              <Form.Check
                                type="radio"
                                name="sdbp-lead-pax"
                                id={`sdbp-lead-${idx}`}
                                checked={isLead}
                                disabled={g.isChild}
                                onChange={() => handleLeadSelect(idx)}
                                title={
                                  g.isChild
                                    ? "Children cannot be Lead"
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

                {/* ── Contact Details ─────────────────────────────────
                     Booking-level contact info — sits directly below
                     Passenger Details. Two required fields: Contact
                     Number and Email ID. Persisted as the booking's
                     customer contact fields (customerDTO). */}
                <Card className="shadow border-0 rounded-4 mb-4">
                  <Card.Header className="bg-white border-0 pt-4 px-4">
                    <h5 className="fw-semibold text-dark d-flex align-items-center mb-0">
                      <FaUserAlt className="me-2 text-primary" />
                      Contact Details
                    </h5>
                  </Card.Header>
                  <Card.Body className="px-4 pb-4">
                    <Row className="g-3">
                      <Col xs={12} md={6}>
                        <Form.Group>
                          <Form.Label className="small text-muted fw-semibold">
                            Contact Number <span className="text-danger">*</span>
                          </Form.Label>
                          <Form.Control
                            type="text"
                            placeholder="Contact Number"
                            className="rounded-3 shadow-sm"
                            value={contactDetails.contactNumber}
                            onChange={(e) =>
                              handleContactChange("contactNumber", e.target.value)
                            }
                            isInvalid={!!validationErrors.contactNumber}
                          />
                          <Form.Control.Feedback type="invalid">
                            {validationErrors.contactNumber}
                          </Form.Control.Feedback>
                        </Form.Group>
                      </Col>
                      <Col xs={12} md={6}>
                        <Form.Group>
                          <Form.Label className="small text-muted fw-semibold">
                            Email ID <span className="text-danger">*</span>
                          </Form.Label>
                          <Form.Control
                            type="email"
                            placeholder="Email ID"
                            className="rounded-3 shadow-sm"
                            value={contactDetails.emailId}
                            onChange={(e) =>
                              handleContactChange("emailId", e.target.value)
                            }
                            isInvalid={!!validationErrors.emailId}
                          />
                          <Form.Control.Feedback type="invalid">
                            {validationErrors.emailId}
                          </Form.Control.Feedback>
                        </Form.Group>
                      </Col>
                      {/* Pickup Landmark — optional free-text address /
                          landmark for the pickup location (e.g. "Near Al Wasl
                          Mall, behind the ADNOC station"). Full-width row of
                          its own so long text stays readable. */}
                      <Col xs={12}>
                        <Form.Group>
                          <Form.Label className="small text-muted fw-semibold">
                            Pickup Landmark 
                          </Form.Label>
                          <Form.Control
                            as="textarea"
                            rows={2}
                            placeholder="e.g. Near Al Wasl Mall, behind the ADNOC station"
                            className="rounded-3 shadow-sm"
                            value={contactDetails.pickupLandmark}
                            onChange={(e) =>
                              handleContactChange("pickupLandmark", e.target.value)
                            }
                          />
                        </Form.Group>
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>

                {/* Transporter & Driver Details card removed — replaced
                    with the Payment Mode selector below. Price details
                    are now shown only in the Booking Summary. */}

                {/* ── Supplementary Charges Disclosure ─────────────────
                     Optional Yes / No prompt reminding the operator that
                     supplementary charges apply when the trip crosses into
                     another city. Choosing "Yes" surfaces the current cab
                     provider's intercity routes (managed in
                     /scheffer-driver-rates → Supplementary Charges) as a
                     radio list. The whole card is hidden when this cab
                     provider has no intercity charges configured, so the
                     section never appears empty. Display-only — no booking
                     payload change. */}
                {intercityCharges.length > 0 && (
                  <Card className="shadow border-0 rounded-4 mb-4">
                    <Card.Header className="bg-white border-0 pt-4 px-4">
                      <h5 className="fw-semibold text-dark d-flex align-items-center mb-0">
                        <FaMapMarkerAlt className="me-2 text-primary" />
                        Supplementary Charges
                      </h5>
                    </Card.Header>
                    <Card.Body className="px-4 pb-4">
                      <div className="small text-muted fw-semibold mb-2">
                        In case of travel to another city, supplementary
                        charges will apply.
                      </div>
                      <Form.Group>
                        <div className="d-flex gap-4 mt-1">
                          <Form.Check
                            type="radio"
                            id="sdbp-intercity-yes"
                            name="sdbp-intercity"
                            label="Yes"
                            value="yes"
                            checked={intercityDeclared === "yes"}
                            onChange={(e) =>
                              setIntercityDeclared(e.target.value)
                            }
                          />
                          <Form.Check
                            type="radio"
                            id="sdbp-intercity-no"
                            name="sdbp-intercity"
                            label="No"
                            value="no"
                            checked={intercityDeclared === "no"}
                            onChange={(e) => {
                              setIntercityDeclared(e.target.value);
                              // Reset selection when flipping back to No.
                              setSelectedIntercityId("");
                            }}
                          />
                        </div>
                      </Form.Group>

                      {intercityDeclared === "yes" && (
                        <div className="mt-3">
                          <Form.Group>
                            <Form.Label className="small text-muted fw-semibold d-block mb-2">
                              Select intercity route
                            </Form.Label>
                            {/* Grid of clickable radio "cards" — one per
                                intercity row, 3-up on desktop, 2-up on
                                tablets, stacked on mobile. Each card is a
                                labelled radio wrapping the whole tile so
                                clicking anywhere selects the route. */}
                            <Row className="g-2">
                              {intercityCharges.map((c) => {
                                const val = String(c.intercityChargeId);
                                const selected = selectedIntercityId === val;
                                return (
                                  <Col xs={12} key={val}>
                                    <label
                                      htmlFor={`sdbp-intercity-route-${val}`}
                                      className="w-100 h-100 d-flex align-items-center gap-2 p-2 rounded-3"
                                      style={{
                                        cursor: "pointer",
                                        border: `1px solid ${
                                          selected ? "#0d6efd" : "#dee2e6"
                                        }`,
                                        backgroundColor: selected
                                          ? "#eaf3ff"
                                          : "#fff",
                                        transition:
                                          "border-color 0.15s, background-color 0.15s",
                                      }}
                                    >
                                      <input
                                        type="radio"
                                        id={`sdbp-intercity-route-${val}`}
                                        name="sdbp-intercity-route"
                                        value={val}
                                        checked={selected}
                                        onChange={(e) =>
                                          setSelectedIntercityId(
                                            e.target.value,
                                          )
                                        }
                                        // Native radios can't be un-checked
                                        // by clicking the same option again;
                                        // this click-handler adds that
                                        // toggle behaviour so the operator
                                        // can clear their selection without
                                        // having to switch to another route
                                        // or flip the Yes/No radios above.
                                        onClick={(e) => {
                                          if (selected) {
                                            e.preventDefault();
                                            setSelectedIntercityId("");
                                          }
                                        }}
                                        className="form-check-input mt-1"
                                      />
                                      <div className="d-flex flex-grow-1 align-items-center justify-content-between gap-2">
                                        <span className="fw-semibold text-dark">
                                          {c.fromCityName || "-"} →{" "}
                                          {c.toCityName || "-"}
                                        </span>
                                        <span className="fw-semibold text-primary">
                                          AED {c.additionalCharge}
                                        </span>
                                      </div>
                                    </label>
                                  </Col>
                                );
                              })}
                            </Row>
                          </Form.Group>
                        </div>
                      )}
                    </Card.Body>
                  </Card>
                )}

                {/* ── Payment Mode ────────────────────────────────────
                     Mirrors /hotel-booking-page. Three-scenario UI:
                       1. Sufficient credit          → Credit Limit only
                       2. No credit + Card enabled   → Card only + note
                       3. No credit + Card disabled  → hard-block Alert
                     The selection rides on the create payload as
                     `paymentMode`. */}
                <Card className="shadow border-0 rounded-4 mb-4">
                  <Card.Header className="bg-white border-0 pt-4 px-4">
                    <h5 className="fw-semibold text-dark d-flex align-items-center mb-0">
                      <FaCar className="me-2 text-primary" />
                      Payment Mode
                    </h5>
                  </Card.Header>
                  <Card.Body className="px-4 pb-4">
                    {paymentModeOptions.length > 0 ? (
                      <>
                        <Row className="g-3">
                          <Col xs={12} md={6}>
                            <Form.Group>
                              <Form.Label className="small text-muted fw-semibold">
                                Mode
                              </Form.Label>
                              <Form.Select
                                className="rounded-3 shadow-sm"
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
                        {hasSufficientCredit === false && agentCardPaymentEnabled && (
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

              {/* Right Column: Booking Summary — mirrors the two-card
                  layout used on /hotel-booking-page (Booking Summary +
                  Price Details) so the two flows look uniform. The
                  .sdbp-sticky-summary wrapper (see SchefferDriverBookingPage.css)
                  pins this column while the left form scrolls, matching the
                  hotel page's .hbp-sticky-summary behaviour. */}
              <Col lg={4}>
                <div className="sdbp-sticky-summary">
                {/* ── Booking Summary card ─────────────────────────── */}
                <Card className="shadow-sm rounded-3 mb-3 border-0 overflow-hidden">
                  <Card.Header className="bg-primary text-white py-2 rounded-top">
                    <h6 className="mb-0 d-flex align-items-center">
                      <FaCar className="me-2" /> Booking Summary
                    </h6>
                  </Card.Header>
                  <Card.Body className="p-3">
                    {/* Cab identity block — mirrors Hotel's hotelName /
                        address / badges block at the top of its summary. */}
                    <div className="mb-3">
                      <div className="fw-bold text-primary mb-1">
                        {cab.cabname}
                      </div>
                      {selectedOption.cityName && (
                        <div className="text-muted small mb-2">
                          {selectedOption.cityName}
                        </div>
                      )}
                      <div className="d-flex flex-wrap align-items-center gap-2">
                        {selectedOption.cabType && (
                          <span className="badge bg-info text-dark">
                            {selectedOption.cabType}
                          </span>
                        )}
                        {selectedOption.packageName && (
                          <span className="badge bg-primary">
                            {selectedOption.packageName}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Detail rows — uses the same label/value split
                        Hotel uses in its .hbp-summary-row blocks. */}
                    <div className="sdbp-summary-row d-flex justify-content-between align-items-center py-2 border-bottom small">
                      <div className="text-muted fw-medium">
                        <FaCalendarAlt className="me-2 text-primary" />
                        Pickup Date
                      </div>
                      <div className="text-dark fw-semibold">
                        {searchCriteria.pickupDate || "—"}
                      </div>
                    </div>

                    {searchCriteria.pickupTime && (
                      <div className="sdbp-summary-row d-flex justify-content-between align-items-center py-2 border-bottom small">
                        <div className="text-muted fw-medium">
                          <FaCalendarAlt className="me-2 text-primary" />
                          Pickup Time
                        </div>
                        <div className="text-dark fw-semibold">
                          {searchCriteria.pickupTime}
                        </div>
                      </div>
                    )}

                    <div className="sdbp-summary-row d-flex justify-content-between align-items-start py-2 border-bottom small">
                      <div className="text-muted fw-medium">
                        <FaMapMarkerAlt className="me-2 text-danger" />
                        Rental Package
                      </div>
                      <div className="text-dark fw-semibold text-end">
                        {selectedOption.packageName || "—"}
                        <div className="text-muted small fw-normal">
                          {selectedOption.hoursIncluded != null
                            ? `${selectedOption.hoursIncluded} hrs`
                            : ""}
                          {selectedOption.kmIncluded != null
                            ? ` · ${selectedOption.kmIncluded} km included`
                            : ""}
                        </div>
                      </div>
                    </div>

                    {(searchCriteria.pickupName || searchCriteria.pickupType || selectedOption?.cityName) && (
                      <div className="sdbp-summary-row d-flex justify-content-between align-items-start py-2 border-bottom small">
                        <div className="text-muted fw-medium">
                          <FaMapMarkerAlt className="me-2 text-danger" />
                          Pickup
                        </div>
                        <div className="text-dark fw-semibold text-end">
                          {searchCriteria.pickupName || selectedOption?.cityName || searchCriteria.cityName || "—"}
                        </div>
                      </div>
                    )}

                    {contactDetails.pickupLandmark && (
                      <div className="sdbp-summary-row d-flex justify-content-between align-items-start py-2 border-bottom small">
                        <div className="text-muted fw-medium">
                          <FaMapMarkerAlt className="me-2 text-success" />
                          Pickup Landmark 
                        </div>
                        <div className="text-dark fw-semibold text-end">
                          {contactDetails.pickupLandmark}
                        </div>
                      </div>
                    )}

                    {(searchCriteria.dropoffName || searchCriteria.dropoffType || selectedOption?.cityName) && (
                      <div className="sdbp-summary-row d-flex justify-content-between align-items-start py-2 border-bottom small">
                        <div className="text-muted fw-medium">
                          <FaMapMarkerAlt className="me-2 text-danger" />
                          Dropoff
                        </div>
                        <div className="text-dark fw-semibold text-end">
                          {searchCriteria.dropoffName || searchCriteria.pickupName || selectedOption?.cityName || searchCriteria.cityName || "—"}
                          {searchCriteria.dropoffTime && (
                            <div className="text-muted small fw-normal">
                              @ {searchCriteria.dropoffTime}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="sdbp-summary-row d-flex justify-content-between align-items-center py-2 small">
                      <div className="text-muted fw-medium">
                        <FaUserAlt className="me-2 text-primary" />
                        Passengers
                      </div>
                      <div className="text-dark fw-semibold">
                        {searchCriteria.adults || 0} Adult
                        {(searchCriteria.adults || 0) !== 1 ? "s" : ""}
                        {searchCriteria.children
                          ? `, ${searchCriteria.children} Child${
                              searchCriteria.children > 1 ? "ren" : ""
                            }`
                          : ""}
                      </div>
                    </div>
                  </Card.Body>
                </Card>

                {/* ── Price Details card — mirrors Hotel's Price Details
                    (light header, small rows, red New Total). */}
                <Card className="shadow-sm rounded-3 border-0 mb-3">
                  <Card.Header className="bg-light py-2">
                    <h6 className="mb-0 fw-bold">Price Details</h6>
                  </Card.Header>
                  <Card.Body className="p-3">
                    {(() => {
                      const tdNum =
                        tourismDirham !== "" && !isNaN(Number(tourismDirham))
                          ? Number(tourismDirham)
                          : 0;
                      const grandTotal = Number(totalRate || 0) + tdNum;
                      const packageFare = totalRate - intercitySurcharge;
                      return (
                        <>
                          <div className="d-flex justify-content-between align-items-center py-2 border-bottom small">
                            <div className="text-muted fw-medium">Package Fare</div>
                            <div className="text-dark fw-semibold">
                              {formatPrice(packageFare)}
                            </div>
                          </div>
                          {intercitySurcharge > 0 && (
                            <div className="d-flex justify-content-between align-items-center py-2 border-bottom small">
                              <div className="text-muted fw-medium">Intercity Surcharge</div>
                              <div className="text-dark fw-semibold">
                                {formatPrice(intercitySurcharge)}
                              </div>
                            </div>
                          )}
                          {tdNum > 0 && (
                            <div className="d-flex justify-content-between align-items-center py-2 border-bottom small">
                              <div className="text-muted fw-medium">Tourism Dirham</div>
                              <div className="text-primary fw-semibold">
                                {formatPrice(tdNum)}
                              </div>
                            </div>
                          )}
                          <div className="d-flex justify-content-between align-items-center py-2 border-bottom small">
                            <div className="text-muted fw-medium">Taxes &amp; Fees</div>
                            <div className="text-dark fw-semibold">{formatPrice(0)}</div>
                          </div>
                          <hr className="my-2" />
                          <div className="d-flex justify-content-between align-items-center py-1">
                            <div className="text-danger fw-bold">New Total</div>
                            <div className="text-danger fw-bold fs-5">
                              {formatPrice(grandTotal)}
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </Card.Body>
                </Card>

                {/* Quotation — under the Price Details it quotes, above the
                    Back / Confirm buttons. */}
                <QuotationPdfCard
                  className="mt-0 mb-3"
                  buildPayload={buildChauffeurQuotationPayload}
                  disabled={isSubmitting}
                />

                {/* ── Back + Confirm Booking buttons ────────────────────
                     Back returns to the chauffeur search page; Confirm
                     opens the Policies / T&C modal (Step 1a) which then
                     hands off to the Order Summary modal (Step 2). */}
                <div className="mb-3 d-flex gap-2">
                  <Button
                    variant="outline-secondary"
                    className="flex-grow-1 d-flex align-items-center justify-content-center gap-2"
                    onClick={handleBackToSearch}
                    disabled={isSubmitting}
                  >
                    <FaArrowLeft />
                    Back
                  </Button>
                  <Button
                    variant="danger"
                    className="flex-grow-1 d-flex align-items-center justify-content-center gap-2"
                    onClick={handleConfirmClick}
                    disabled={isSubmitting || noPaymentPathAvailable}
                    title={
                      noPaymentPathAvailable
                        ? "No payment method available — enable card payment or contact your admin."
                        : undefined
                    }
                  >
                    {isSubmitting ? (
                      <>
                        <Spinner animation="border" size="sm" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <FaCheckCircle />
                        Confirm
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-center text-muted small mt-1 mb-3">
                  By confirming, you agree to the Terms and Conditions.
                </p>
                </div>
              </Col>
            </Row>
          </Container>
        </main>
      </div>

      {/* ── Policies + T&C modal ────────────────────────────────────
           Opens on Confirm Booking (Step 1a). Renders the rate's saved
           T&C and Cancellation Policies (fetched inline from
           /api/scheffer-rental-rates/{id}) plus an accept checkbox that
           gates the Proceed button. Proceed hands off to the existing
           Order Summary modal. Mirrors HotelBookingPage.jsx's policy
           modal so the two flows behave the same way. */}
      <Modal
        show={showPolicyModal}
        onHide={() => setShowPolicyModal(false)}
        centered
        backdrop="static"
        size="lg"
        scrollable
      >
        <Modal.Header closeButton>
          <Modal.Title>
            <FaCar className="me-2 text-primary" />
            Chauffeur Policies &amp; Terms
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {policiesLoading ? (
            <div className="text-center py-4">
              <Spinner animation="border" size="sm" />
              <div className="mt-2 text-muted small">
                Loading policies &amp; terms…
              </div>
            </div>
          ) : (
            <>
              {/* Cancellation Policies */}
              <section className="mb-4">
                <h6 className="fw-bold text-dark border-bottom pb-2 mb-2">
                  Cancellation Policies
                </h6>
                {rateCancellationPolicies.length > 0 ? (
                  <ul className="mb-0 ps-3">
                    {rateCancellationPolicies.map((p, idx) => (
                      <li key={idx} className="small mb-1">
                        {p}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-muted small">
                    No cancellation policy configured for this rate.
                  </div>
                )}
              </section>

              {/* Terms & Conditions */}
              <section className="mb-2">
                <h6 className="fw-bold text-dark border-bottom pb-2 mb-2">
                  Terms &amp; Conditions
                </h6>
                {rateTerms.length > 0 ? (
                  <ul className="mb-0 ps-3">
                    {rateTerms.map((t, idx) => (
                      <li key={idx} className="small mb-1">
                        {t}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-muted small">
                    No terms &amp; conditions configured for this rate.
                  </div>
                )}
              </section>
            </>
          )}
        </Modal.Body>
        <Modal.Footer className="d-flex align-items-center">
          <Form.Check
            type="checkbox"
            id="sdbp-policy-accept"
            className="me-auto"
            label="I have read and accept the policies and terms & conditions"
            checked={policyAccepted}
            onChange={(e) => setPolicyAccepted(e.target.checked)}
            disabled={policiesLoading}
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
            onClick={proceedFromPolicy}
            disabled={!policyAccepted || policiesLoading}
          >
            Proceed
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Order Summary modal (mirrors HotelBookingPage.jsx) ─────────
           Triggered by the page-level "Confirm Booking" button after
           validation passes. Lists everything the booking will save so
           the user can review before the actual POST. The "Confirm &
           Book" footer button is what calls /api/scheffer/book. */}
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
            Order Summary 
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
              {selectedOption?.cabType && (
                <Badge bg="info" className="text-dark me-1">{selectedOption.cabType}</Badge>
              )}
              {selectedOption?.packageName && (
                <Badge bg="primary">{selectedOption.packageName}</Badge>
              )}
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
                {searchCriteria.pickupName || selectedOption?.cityName || searchCriteria.cityName || "N/A"}
                {" → "}
                {searchCriteria.dropoffName || searchCriteria.pickupName || selectedOption?.cityName || searchCriteria.cityName || "N/A"}
              </span>
            </Col>
          </Row>

          {/* Pickup / Dropoff details — shown when location details are available */}
          {(searchCriteria.pickupType || searchCriteria.pickupName || searchCriteria.dropoffType || searchCriteria.dropoffName || selectedOption?.cityName) && (
            <>
              <h6 className="fw-bold mb-2">Pickup &amp; Dropoff</h6>
              <Table size="sm" bordered className="mb-3">
                <thead className="table-light">
                  <tr>
                    <th style={{ width: "25%" }}>Location</th>
                    <th>Name</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {(searchCriteria.pickupType || searchCriteria.pickupName || selectedOption?.cityName) && (
                    <tr>
                      <td className="fw-semibold">Pickup</td>
                      <td>
                        {searchCriteria.pickupName ||
                          selectedOption?.cityName ||
                          searchCriteria.cityName ||
                          "—"}
                      </td>
                      <td>{searchCriteria.pickupTime || "—"}</td>
                    </tr>
                  )}
                  {contactDetails.pickupLandmark && (
                    <tr>
                      <td className="fw-semibold">Pickup Landmark </td>
                      <td colSpan={2}>{contactDetails.pickupLandmark}</td>
                    </tr>
                  )}
                  {(searchCriteria.dropoffType || searchCriteria.dropoffName || selectedOption?.cityName) && (
                    <tr>
                      <td className="fw-semibold">Dropoff</td>
                      <td>
                        {searchCriteria.dropoffName ||
                          searchCriteria.pickupName ||
                          selectedOption?.cityName ||
                          searchCriteria.cityName ||
                          "—"}
                      </td>
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
              <Table size="sm" bordered className="mb-3">
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
                        {idx === leadIndex && !g.isChild && (
                          <Badge bg="primary" className="ms-2">Lead</Badge>
                        )}
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

          {/* Primary Guest section removed — the Passenger Details table
              above (with the Lead badge) is the single source of guest data. */}

          {/* Contact Details */}
          <h6 className="fw-bold mb-2">Contact Details</h6>
          <Row className="mb-3">
            <Col md={6}>
              <small className="text-muted d-block">Contact Number</small>
              <span>{contactDetails.contactNumber || "—"}</span>
            </Col>
            <Col md={6}>
              <small className="text-muted d-block">Email ID</small>
              <span>{contactDetails.emailId || "—"}</span>
            </Col>
          </Row>

          {/* Payment Mode */}
          <h6 className="fw-bold mb-2">Payment Mode</h6>
          <Row className="mb-3">
            <Col md={12}>
              <span>
                {paymentMode === "CREDITLIMIT"
                  ? "Credit Limit"
                  : paymentMode === "CARD"
                    ? "Card"
                    : paymentMode === "CASH"
                      ? "Cash"
                      : paymentMode || "—"}
              </span>
            </Col>
          </Row>

          <hr />

          {/* Transporter & Driver block removed — the card that carried
              those fields is gone. Pricing breakdown below stays as the
              price detail shown in the booking summary. */}

          {/* Pricing breakdown — selling, total, optional TD, grand total */}
          {(() => {
            const tdNum =
              tourismDirham !== "" && !isNaN(Number(tourismDirham))
                ? Number(tourismDirham)
                : 0;
            const sellingBase = Number(prices.sellingPrice) || 0;
            const totalBase = Number(prices.totalPrice) || 0;
            const baseSelling = sellingBase - intercitySurcharge;
            const baseTotal = totalBase - intercitySurcharge;
            return (
              <div className="p-3 bg-light rounded">
                <div className="d-flex justify-content-between mb-2 text-muted">
                  <span>Selling Price (Base)</span>
                  <span className="fw-medium">
                    AED {baseSelling.toFixed(2)}
                  </span>
                </div>
                {intercitySurcharge > 0 && (
                  <div className="d-flex justify-content-between mb-2 text-muted">
                    <span>Intercity Surcharge</span>
                    <span className="fw-medium">
                      + AED {intercitySurcharge.toFixed(2)}
                    </span>
                  </div>
                )}
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
                <hr className="my-2" />
                <div className="d-flex justify-content-between align-items-center">
                  <span className="fw-semibold">Total Payable Amount</span>
                  <span className="fs-4 fw-bold text-success">
                    AED {(totalBase + tdNum).toFixed(2)}
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

export default SchefferDriverBookingPage;