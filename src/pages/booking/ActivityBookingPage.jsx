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
} from "react-bootstrap";
import { FaTicketAlt, FaCheckCircle, FaCalendarAlt, FaMapMarkerAlt, FaUsers, FaClock, FaPlus, FaRoute } from "react-icons/fa";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import QuotationPdfCard from "../../components/quotation/QuotationPdfCard";
import "../../styles/HotelBookingPage.css";

const emptyActivityPolicies = {
  inclusions: [],
  terms: [],
  cancellations: [],
};

const normalizeActivityPolicies = (rows) => {
  const list = Array.isArray(rows) ? rows : [];
  return {
    inclusions: list.filter((x) => x.type === 1 && x.data).map((x) => x.data),
    terms: list.filter((x) => x.type === 2 && x.data).map((x) => x.data),
    cancellations: list.filter((x) => x.type === 3 && x.data).map((x) => x.data),
  };
};

const ActivityBookingPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Two entry points: in-tab navigate (Router state) or new-window
  // open via window.open (no Router state — payload arrived via
  // sessionStorage instead, see ActivitySearch.handleBookNow). We
  // read sessionStorage once, on mount, so the page survives a hard
  // refresh inside the booking tab too.
  const [{ activity, searchCriteria }] = useState(() => {
    if (location.state?.activity && location.state?.searchCriteria) {
      return location.state;
    }
    try {
      const raw = sessionStorage.getItem("activityBookingPayload");
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.error("Failed to parse activityBookingPayload:", e);
    }
    return {};
  });

  // If accessed directly without state, redirect or show an error
  const hasValidState = !!activity && !!searchCriteria;

  // Primary-guest contact card was removed per spec. The chosen lead
  // passenger row in the pax manifest below is now the "primary".
  // No standalone state needed.

  // ── Pax manifest (one row per adult + child) ─────────────────────
  // Pattern mirrors HotelBookingPage / CabBookingPage: seed the list
  // from the search counts, keep Adult 1 in lock-step with the primary
  // guest contact card above, and POST the full list as `guests` so
  // the backend can persist every traveller.
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

  // Primary-guest sync effect removed — there's no longer a separate
  // primary-guest state. The pax manifest IS the source of truth.

  const handleGuestChange = (index, field, value) => {
    setGuests((prev) => {
      const next = [...prev];
      if (!next[index]) return prev;
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    const key = `guest_${index}_${field}`;
    if (validationErrors[key]) {
      setValidationErrors((prev) => {
        const updated = { ...prev };
        delete updated[key];
        return updated;
      });
    }
  };

  const [validationErrors, setValidationErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [showBookingSummaryModal, setShowBookingSummaryModal] = useState(false);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const [activityPolicies, setActivityPolicies] = useState(emptyActivityPolicies);

  // ── Lead passenger + payment mode (refactor) ─────────────────────
  // Lead is picked by radio in the Passenger Details table; defaults
  // to the first adult. Payment mode drives the credit/online/cash
  // dropdown in the right-hand summary card — mirrors HotelBookingPage
  // patterns and gets forwarded to the backend as `paymentMode`.
  const [leadIndex, setLeadIndex] = useState(0);
  const [paymentMode, setPaymentMode] = useState("CREDIT");

  // Itinerary state
  const [itineraryList, setItineraryList] = useState([]);
  const [selectedItineraries, setSelectedItineraries] = useState([]);
  const [loadingItinerary, setLoadingItinerary] = useState(false);
  const [showItineraryModal, setShowItineraryModal] = useState(false);
  const [itinerarySearchTerm, setItinerarySearchTerm] = useState("");
  const [filteredItineraryList, setFilteredItineraryList] = useState([]);
  const [expandedDescriptions, setExpandedDescriptions] = useState({});

  // Fetch Itinerary details
  React.useEffect(() => {
    const fetchItineraryDetails = async () => {
      try {
        setLoadingItinerary(true);
        const response = await axiosInstance.get("/api/master/itenaryDetails");
        if (Array.isArray(response.data)) {
          setItineraryList(response.data);
          setFilteredItineraryList(response.data);
        } else {
          toast.error("Failed to load itinerary details.");
        }
      } catch (err) {
        console.error("Error fetching itinerary:", err);
        toast.error("Failed to load itinerary details.");
      } finally {
        setLoadingItinerary(false);
      }
    };

    fetchItineraryDetails();
  }, []);

  useEffect(() => {
    if (!activity?.activityRateId) {
      setActivityPolicies(emptyActivityPolicies);
      return;
    }
    let cancelled = false;
    setPolicyLoading(true);
    axiosInstance
      .get(`/api/activityRate/inclutionAndTerms/${activity.activityRateId}`)
      .then((res) => {
        if (cancelled) return;
        setActivityPolicies(normalizeActivityPolicies(res.data));
      })
      .catch((err) => {
        console.warn("Failed to load activity policies:", err);
        if (!cancelled) setActivityPolicies(emptyActivityPolicies);
      })
      .finally(() => {
        if (!cancelled) setPolicyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activity?.activityRateId]);

  // Filter itinerary list based on search term
  React.useEffect(() => {
    if (itinerarySearchTerm.trim().length >= 3) {
      const filtered = itineraryList.filter((item) => {
        const heading = (item.itineraryHeading || "").toLowerCase();
        const desc = (item.itineraryDesc || "").toLowerCase();
        const search = itinerarySearchTerm.toLowerCase();
        return heading.includes(search) || desc.includes(search);
      });
      setFilteredItineraryList(filtered);
    } else if (itinerarySearchTerm.trim().length === 0) {
      setFilteredItineraryList(itineraryList);
    } else {
      setFilteredItineraryList([]);
    }
  }, [itinerarySearchTerm, itineraryList]);

  // Handle Itinerary Modal
  const handleOpenItineraryModal = () => {
    setItinerarySearchTerm("");
    setFilteredItineraryList(itineraryList);
    setShowItineraryModal(true);
  };

  const handleCloseItineraryModal = () => {
    setShowItineraryModal(false);
    setItinerarySearchTerm("");
    setExpandedDescriptions({});
  };

  const handleItineraryToggle = (itineraryId) => {
    setSelectedItineraries((prev) => {
      if (prev.includes(itineraryId)) {
        return prev.filter((id) => id !== itineraryId);
      } else {
        return [...prev, itineraryId];
      }
    });
  };

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
                <FaTicketAlt className="display-4 text-warning mb-3" />
                <h4 className="fw-bold mb-3">No Activity Selected</h4>
                <p className="text-muted mb-4">Please select an activity from the search page first.</p>
                <Button variant="primary" onClick={() => navigate("/new-booking/tours-and-activities")}>
                  Go to Activity Search
                </Button>
              </Card.Body>
            </Card>
          </main>
        </div>
      </div>
    );
  }

  const totalRate = activity.totalRate || activity.totalRateWithoutMrk || 0;

  // handlePrimaryGuestChange removed with the Primary Guest card.

  const validateForm = () => {
    const errors = {};
    let hasErrors = false;

    // Each pax row needs salutation (adults), first name, surname,
    // gender. Lead passenger must reference a real row. Primary-guest
    // contact / email / LPO checks were removed along with the card.
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
      // Gender hidden from the form — no longer validated.
    });

    if (
      guests.length === 0 ||
      leadIndex == null ||
      leadIndex < 0 ||
      leadIndex >= guests.length
    ) {
      errors.lead = "Please pick a lead passenger.";
      hasErrors = true;
    }

    return { errors, hasErrors };
  };

  const formatDateToDDMMYYYY = (dateString) => {
    if (!dateString) return "";
    try {
      let date;
      if (dateString.includes("/")) {
        return dateString.replace(/\//g, "-");
      } else if (dateString.includes("-") && dateString.split("-")[0].length === 4) {
        // YYYY-MM-DD to DD-MM-YYYY
        const [y, m, d] = dateString.split("-");
        return `${d}-${m}-${y}`;
      } else {
        date = new Date(dateString);
      }
      if (isNaN(date.getTime())) return dateString;
      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    } catch {
      return dateString;
    }
  };

  const openPolicyReview = () => {
    const { errors, hasErrors } = validateForm();

    if (hasErrors) {
      setValidationErrors(errors);
      toast.error("Please fill in all required fields correctly.");
      return;
    }

    setValidationErrors({});
    setAcceptedPolicies(false);
    setShowPolicyModal(true);
  };

  const confirmBooking = async () => {
    const { errors, hasErrors } = validateForm();

    if (hasErrors) {
      setValidationErrors(errors);
      toast.error("Please fill in all required fields correctly.");
      setShowPolicyModal(false);
      return;
    }

    if (!acceptedPolicies) {
      toast.error("Please accept inclusions, terms and cancellation policies to continue booking.");
      return;
    }

    setIsSubmitting(true);
    try {
      const agentId = sessionStorage.getItem("makeYourOwnPackageAgentId") 
                   || localStorage.getItem("makeYourOwnPackageAgentId")
                   || "1";

      const userId = sessionStorage.getItem("userId") || localStorage.getItem("userId") || "1";

      // Build customerDTO from the chosen lead passenger row. Contact,
      // email, passport and LPO were dropped from the UI per spec, so
      // we send empty strings here (backend already tolerates these
      // being blank). paymentMode is forwarded so the backend can
      // route Credit / Online / Cash flows correctly.
      const lead =
        guests[leadIndex] || guests[0] || {
          salutation: "",
          firstName: "",
          lastName: "",
        };

      const payload = {
        activityId: activity.id || activity.activityId,
        tourDate: formatDateToDDMMYYYY(searchCriteria.tourDate),
        noOfAdult: parseInt(searchCriteria.adults),
        noOfChild: parseInt(searchCriteria.children),
        childAgeArray: (searchCriteria.childAges || []).map(age => String(age)),
        sellingPrice: String(totalRate),
        totalPrice: String(totalRate),
        agentId: parseInt(agentId),
        userId: parseInt(userId),
        paymentMode, // CREDIT | ONLINE | CASH
        leadPassengerIndex: leadIndex,
        customerDTO: {
          salutation: lead.salutation || "",
          firstName: lead.firstName || "",
          lastName: lead.lastName || "",
          contactNumber: "",
          emailId: "",
          passportNumber: "",
          lpo: "",
        },
        // Full pax manifest — backend can persist into activity_guest
        // once the schema lands. Today's backend ignores unknown
        // fields, so sending this is forward-compatible.
        guests: guests.map((g, idx) => ({
          salutation: g.salutation || null,
          firstName: g.firstName || null,
          middleName: g.middleName || null,
          lastName: g.lastName || null,
          gender: g.gender || null,
          isChild: !!g.isChild,
          age: g.age != null ? Number(g.age) : null,
          passportNo: g.passportNo || null,
          guestIndex: g.isChild ? idx - totalAdults + 1 : idx + 1,
        })),
        customBookingItinearyDTO: selectedItineraries.map(id => ({
          itinearyId: parseInt(id),
          days: 1
        })),
        policyAccepted: true,
        acceptedInclusions: true,
        acceptedTermsAndConditions: true,
        acceptedCancellationPolicies: true,
        inclusions: activityPolicies.inclusions,
        termsAndConditions: activityPolicies.terms,
        cancellationPolicies: activityPolicies.cancellations,
      };

      console.log("Activity Booking Payload:", payload);
      // New endpoint: persists every payload field into the dedicated
      // tourandactivity_* tables (booking + guests + policies +
      // itineraries) so the detail view + voucher can re-render
      // everything. The legacy /api/activity/book endpoint still
      // exists for the make-your-own-package flow and is unchanged.
      const response = await axiosInstance.post(
        "/api/tour-activity-booking/save",
        payload,
      );

      if (response && (response.data?.success !== false && response.status === 200)) {
        toast.success("Activity booked successfully!");
        setShowPolicyModal(false);
        setShowBookingSummaryModal(false);
        navigate("/booking-details/activity-booking-list"); // Or to a booking success list page
      } else {
        toast.error(response.data?.message || "Failed to book activity.");
      }
    } catch (error) {
      console.error("Booking error:", error);
      toast.error("An error occurred during booking. Please try again.");
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
  // Quotes what this page shows: the Booking Summary, the selected
  // itinerary add-ons and the Activity Fare / New Total in AED, like
  // formatPrice. Inclusions, terms and cancellation policies are the ones
  // this page loads for the rate. The agent is the one the search priced
  // the activity for.
  const buildActivityQuotationPayload = () => {
    if (!hasValidState) return null;
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const adults = Number(searchCriteria.adults) || 0;
    const children = Number(searchCriteria.children) || 0;
    const ages = (searchCriteria.childAges || []).filter(
      (a) => a !== "" && a != null,
    );
    const guestsText = `${adults} Adult${adults !== 1 ? "s" : ""}${
      children
        ? `, ${children} Child${children > 1 ? "ren" : ""}${
            ages.length ? ` (Ages ${ages.join(", ")})` : ""
          }`
        : ""
    }`;
    const agentId =
      (searchCriteria.agent && String(searchCriteria.agent)) ||
      sessionStorage.getItem("makeYourOwnPackageAgentId") ||
      localStorage.getItem("makeYourOwnPackageAgentId") ||
      "";

    const lead = guests[leadIndex] || guests[0] || {};
    const leadNames = [lead.firstName, lead.middleName, lead.lastName]
      .map((p) => (p ? String(p).trim() : ""))
      .filter(Boolean);
    const leadName = leadNames.length
      ? [lead.salutation ? String(lead.salutation).trim() : "", ...leadNames]
          .filter(Boolean)
          .join(" ")
      : "";

    const chosenItineraries = selectedItineraries
      .map((id) => itineraryList.find((item) => item.itineraryId === id))
      .filter(Boolean);

    return {
      bookingType: "TOUR_ACTIVITY",
      agentId: Number(agentId) || null,
      currency: "AED",
      serviceName: activity.activityName || "Activity",
      serviceSubtitle: searchCriteria.destination?.label || "",
      customerName: leadName || null,
      details: [
        { label: "Tour Date", value: searchCriteria.tourDate || "" },
        { label: "Destination", value: searchCriteria.destination?.label || "" },
        {
          label: "Duration",
          value: activity.duration ? `${activity.duration} hrs` : "",
        },
        { label: "Guests", value: guestsText },
      ],
      priceItems: [
        {
          description: activity.activityName || "Activity",
          details: [searchCriteria.tourDate, guestsText]
            .filter(Boolean)
            .join(", "),
          amount: round2(totalRate),
        },
      ],
      totalAmount: round2(totalRate),
      itineraryTitle: "Selected Itinerary",
      itineraryDayLabel: "#",
      itinerary: chosenItineraries.map((item, i) => ({
        day: i + 1,
        heading: item.itineraryHeading || "",
        place: "",
        activities: item.itineraryDesc || "",
      })),
      inclusions: activityPolicies.inclusions || [],
      cancellationPolicy: activityPolicies.cancellations || [],
      notes: activityPolicies.terms || [],
    };
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <Container fluid className="px-0">
            <h4 className="fw-bold mb-4 text-primary">Activity Booking Checkout</h4>
            
            <Row className="g-4">
              {/* Left Column: Guest Details */}
              <Col lg={8} className="hbp-left-col">
                {/* Itinerary Option Section */}
                <Card className="mb-2 shadow-sm border-0">
                  <Card.Header className="bg-light py-2 d-flex justify-content-between align-items-center">
                    <div>
                      <h5 className="fw-bold text-dark d-flex align-items-center m-0">
                        <FaRoute className="me-2 text-primary" />
                        Itinerary Option
                      </h5>
                      <small className="text-muted">Select additional plans for your activity on {searchCriteria.tourDate}</small>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      className="rounded-circle shadow-sm btn-add-itinerary"
                      onClick={handleOpenItineraryModal}
                    >
                      <FaPlus />
                    </Button>
                  </Card.Header>
                  <Card.Body className="px-4 pb-4 pt-2">
                    {/* Selected Itineraries Preview */}
                    {selectedItineraries.length > 0 ? (
                      <div className="selected-itineraries-list mt-2">
                        {selectedItineraries.map((itineraryId) => {
                          const itinerary = itineraryList.find((item) => item.itineraryId === itineraryId);
                          if (!itinerary) return null;
                          return (
                            <div key={itineraryId} className="itinerary-chip d-inline-flex align-items-center me-2 mb-2 px-3 py-2 bg-primary-subtle rounded-pill border border-primary border-opacity-10">
                              <FaCheckCircle className="text-primary me-2" size={14} />
                              <span className="small fw-semibold text-primary">{itinerary.itineraryHeading || "Untitled"}</span>
                              <Button
                                variant="link"
                                size="sm"
                                className="text-primary p-0 ms-2 text-decoration-none lh-1"
                                onClick={() => handleItineraryToggle(itineraryId)}
                                style={{ fontSize: '1.2rem' }}
                              >
                                &times;
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="empty-itinerary text-center py-3 bg-light rounded-4 border border-dashed">
                        <small className="text-muted">No itineraries selected. Click the add button to enhance your trip.</small>
                      </div>
                    )}
                  </Card.Body>
                </Card>

                {/* ── Pax Manifest ──────────────────────────────────
                     Trimmed per spec: only Salutation, First Name,
                     Surname, Gender, and a Lead Passenger radio per
                     traveller. The Primary Guest card was removed —
                     the lead row IS the primary contact, and its
                     name/salutation get forwarded to the backend as
                     `customerDTO` so the existing API contract still
                     works without changes. UI layout mirrors the
                     /senior-citizen-booking-page Guest Details grid. */}
                {guests.length > 0 && (
                  <Card className="mb-2 shadow-sm border-0">
                    <Card.Header className="bg-light py-2">
                      <div className="d-flex align-items-center">
                        <Button
                          variant="outline-secondary"
                          size="sm"
                          onClick={() =>
                            navigate("/new-booking/tours-and-activities")
                          }
                          className="me-3"
                        >
                          ← Back
                        </Button>
                        <h6 className="mb-0 fw-bold text-dark">
                          Guest Details
                          <span className="text-muted small ms-2 fw-normal">
                            ({totalAdults} Adult
                            {totalAdults !== 1 ? "s" : ""}
                            {totalChildren > 0
                              ? `, ${totalChildren} Child${totalChildren !== 1 ? "ren" : ""}`
                              : ""}
                            )
                          </span>
                        </h6>
                      </div>
                    </Card.Header>
                    <Card.Body className="px-4 pt-3 pb-3">
                      {/* Column header (md+) */}
                      <Row className="fw-semibold small text-muted px-2 mb-1 d-none d-md-flex">
                        <Col md={2}>Passenger</Col>
                        <Col md={2}>Title *</Col>
                        <Col md={3}>First Name *</Col>
                        <Col md={4}>Surname *</Col>
                        <Col md={1} className="text-center">Lead</Col>
                      </Row>
                      {guests.map((g, idx) => {
                        const adultSeat = idx + 1;
                        const childSeat = idx - totalAdults + 1;
                        const label = g.isChild
                          ? `Child ${childSeat}${g.age != null ? ` (Age ${g.age})` : ""}`
                          : `Adult ${adultSeat}`;
                        const isLead = leadIndex === idx;
                        return (
                          <Row key={idx} className="g-2 align-items-center mb-2">
                            <Col xs={12} md={2}>
                              <span className="fw-semibold text-muted small">
                                {label}
                                {isLead && (
                                  <Badge
                                    bg="primary-subtle"
                                    text="primary"
                                    className="ms-2"
                                    style={{ fontSize: "0.6rem" }}
                                  >
                                    Lead
                                  </Badge>
                                )}
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
                                placeholder="Surname"
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
                                name="lead-passenger"
                                id={`lead-${idx}`}
                                checked={isLead}
                                onChange={() => setLeadIndex(idx)}
                              />
                            </Col>
                          </Row>
                        );
                      })}
                    </Card.Body>
                  </Card>
                )}

                {/* Primary Guest Details card removed per spec —
                    the lead passenger row in the Passenger Details
                    grid above now carries that data. Contact / email /
                    LPO / passport are no longer captured here. */}
              </Col>

              {/* Right sticky column — Booking Summary + Price.
                  Styled to match HotelBookingPage (hbp-* classes
                  shared via HotelBookingPage.css). Three stacked
                  cards: Booking Summary (primary header), Payment
                  Mode (light header), Price Details (light header),
                  then an hbp-action-bar with Back + Confirm. */}
              <Col lg={4} className="hbp-right-col">
                <div className="hbp-sticky-summary">
                  {/* ── Booking Summary ─────────────────────────── */}
                  <Card className="shadow-sm rounded-3 mb-3 booking-summary-card border-0 overflow-hidden">
                    <Card.Header className="bg-primary text-white py-2 rounded-top">
                      <h6 className="mb-0 d-flex align-items-center">
                        <FaTicketAlt className="me-2" /> Booking Summary
                      </h6>
                    </Card.Header>
                    <Card.Body className="p-3">
                      <div className="mb-3 d-flex align-items-start gap-2">
                        <img
                          src={
                            activity.activityImage ||
                            "https://via.placeholder.com/56?text=Activity"
                          }
                          alt={activity.activityName}
                          style={{
                            width: 56,
                            height: 56,
                            objectFit: "cover",
                            borderRadius: 6,
                          }}
                        />
                        <div className="flex-grow-1">
                          <div className="fw-bold text-primary mb-1">
                            {activity.activityName}
                          </div>
                          <span className="badge bg-light text-dark border">
                            ID: {activity.id || activity.activityId}
                          </span>
                        </div>
                      </div>

                      <div className="hbp-summary-row">
                        <div className="hbp-summary-label">
                          <FaCalendarAlt className="me-2 text-primary" />
                          Tour Date
                        </div>
                        <div className="hbp-summary-value">
                          {searchCriteria.tourDate}
                        </div>
                      </div>
                      <div className="hbp-summary-row">
                        <div className="hbp-summary-label">
                          <FaMapMarkerAlt className="me-2 text-primary" />
                          Destination
                        </div>
                        <div className="hbp-summary-value text-end">
                          {searchCriteria.destination?.label || "N/A"}
                        </div>
                      </div>
                      {activity.duration && (
                        <div className="hbp-summary-row">
                          <div className="hbp-summary-label">
                            <FaClock className="me-2 text-primary" />
                            Duration
                          </div>
                          <div className="hbp-summary-value">
                            {activity.duration} hrs
                          </div>
                        </div>
                      )}
                      <div className="hbp-summary-row">
                        <div className="hbp-summary-label">
                          <FaUsers className="me-2 text-primary" />
                          Guests
                        </div>
                        <div className="hbp-summary-value text-end">
                          {searchCriteria.adults} Adult
                          {searchCriteria.adults > 1 ? "s" : ""}
                          {searchCriteria.children
                            ? `, ${searchCriteria.children} Child${
                                searchCriteria.children > 1 ? "ren" : ""
                              }`
                            : ""}
                        </div>
                      </div>
                    </Card.Body>
                  </Card>

                {/* ── Price Details ────────────────────────────── */}
                  <Card className="shadow-sm rounded-3 border-0 hbp-price-card">
                    <Card.Header className="bg-light py-2">
                      <h6 className="mb-0 fw-bold">Price Details</h6>
                    </Card.Header>
                    <Card.Body className="p-3">
                      <div className="hbp-summary-row">
                        <div className="hbp-summary-label">Activity Fare</div>
                        <div className="hbp-summary-value">
                          {formatPrice(totalRate)}
                        </div>
                      </div>
                      <div className="hbp-summary-row">
                        <div className="hbp-summary-label">Taxes &amp; Fees</div>
                        <div className="hbp-summary-value text-success">
                          FREE
                        </div>
                      </div>
                      <hr className="my-2" />
                      <div className="hbp-summary-row fw-bold">
                        <div className="hbp-summary-label text-danger">
                          New Total
                        </div>
                        <div className="hbp-summary-value text-danger">
                          {formatPrice(totalRate)}
                        </div>
                      </div>
                    </Card.Body>
                  </Card>

                  {/* Quotation — under the Price Details it quotes, above the
                      Payment card and Confirm Booking. */}
                  <QuotationPdfCard
                    className="mb-3"
                    buildPayload={buildActivityQuotationPayload}
                    disabled={isSubmitting}
                  />

                    {/* ── Payment Mode ─────────────────────────────── */}
                  <Card className="shadow-sm rounded-3 mb-3 border-0">
                    <Card.Header className="bg-light py-2">
                      <h6 className="mb-0 fw-bold">Payment</h6>
                    </Card.Header>
                    <Card.Body className="p-3">
                      <Form.Group>
                        <Form.Label className="small fw-semibold text-muted">
                          Mode of Payment{" "}
                          <span className="text-danger">*</span>
                        </Form.Label>
                        <Form.Select
                          value={paymentMode}
                          onChange={(e) => setPaymentMode(e.target.value)}
                        >
                          <option value="CREDIT">Credit Limit</option>
                          <option value="ONLINE">Online Payment</option>
                          <option value="CASH">Cash</option>
                        </Form.Select>
                      </Form.Group>
                    </Card.Body>
                  </Card>
                  
                  {/* ── Action bar ───────────────────────────────── */}
                  <div className="hbp-action-bar mt-3 d-flex gap-2">
                    <Button
                      variant="outline-secondary"
                      onClick={() =>
                        navigate("/new-booking/tours-and-activities")
                      }
                      className="flex-grow-1"
                      disabled={isSubmitting}
                    >
                      Back
                    </Button>
                    <Button
                      variant="primary"
                      type="button"
                      onClick={openPolicyReview}
                      disabled={isSubmitting}
                      className="flex-grow-1 d-flex justify-content-center align-items-center"
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
                          <FaCheckCircle className="me-2" /> Confirm Booking
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

      <Modal
        show={showPolicyModal}
        onHide={() => {
          if (!isSubmitting) {
            setShowPolicyModal(false);
            setAcceptedPolicies(false);
          }
        }}
        dialogClassName="policy-modal"
        centered
        backdrop="static"
      >
        <Modal.Header closeButton={!isSubmitting} className="policy-modal-header">
          <Modal.Title className="policy-modal-title">
            Activity Policies &amp; Terms
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="policy-modal-body" style={{ maxHeight: "65vh", overflowY: "auto" }}>
          {policyLoading ? (
            <div className="text-center py-5">
              <Spinner animation="border" variant="primary" />
              <p className="mt-3 text-muted">Loading policies...</p>
            </div>
          ) : (
            <>
              <section className="policy-section">
                <h6 className="policy-section-title">Inclusions</h6>
                {activityPolicies.inclusions.length > 0 ? (
                  activityPolicies.inclusions.map((item, idx) => (
                    <div key={`activity-inclusion-${idx}`} className="policy-item">
                      <div className="policy-text">{item}</div>
                    </div>
                  ))
                ) : (
                  <div className="policy-empty">No inclusions configured for this activity rate.</div>
                )}
              </section>

              <section className="policy-section">
                <h6 className="policy-section-title">Terms &amp; Conditions</h6>
                {activityPolicies.terms.length > 0 ? (
                  activityPolicies.terms.map((item, idx) => (
                    <div key={`activity-term-${idx}`} className="policy-item">
                      <div className="policy-text">{item}</div>
                    </div>
                  ))
                ) : (
                  <div className="policy-empty">No terms and conditions configured for this activity rate.</div>
                )}
              </section>

              <section className="policy-section policy-section-last">
                <h6 className="policy-section-title">Cancellation Policy</h6>
                {activityPolicies.cancellations.length > 0 ? (
                  activityPolicies.cancellations.map((item, idx) => (
                    <div key={`activity-cancellation-${idx}`} className="policy-item">
                      <div className="policy-text">{item}</div>
                    </div>
                  ))
                ) : (
                  <div className="policy-empty">No cancellation policy configured for this activity rate.</div>
                )}
              </section>

              <div className="p-3 rounded border mt-3" style={{ background: "#f8fafc" }}>
                <Form.Check
                  type="checkbox"
                  id="activity-policy-acceptance"
                  className="policy-accept-check"
                  checked={acceptedPolicies}
                  onChange={(e) => setAcceptedPolicies(e.target.checked)}
                  label="I have read and agree to the inclusions, terms and conditions, and cancellation policies."
                />
              </div>
            </>
          )}
        </Modal.Body>
        <Modal.Footer className="policy-modal-footer">
          <Button
            variant="outline-secondary"
            size="sm"
            disabled={isSubmitting}
            onClick={() => {
              setShowPolicyModal(false);
              setAcceptedPolicies(false);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={
              policyLoading ||
              isSubmitting ||
              !acceptedPolicies
            }
            onClick={() => {
              if (!acceptedPolicies) {
                toast.error("Please accept inclusions, terms and cancellation policies to continue booking.");
                return;
              }
              setShowPolicyModal(false);
              setShowBookingSummaryModal(true);
            }}
          >
            {isSubmitting ? (
              <>
                <Spinner size="sm" animation="border" className="me-2" />
                Processing...
              </>
            ) : (
              "Proceed to Booking"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Confirm Booking modal ──────────────────────────────────
          Styled to match HotelBookingPage's "Confirm Your Booking"
          modal: primary-blue header, light-grey body holding a
          single bordered white card with the activity name at top,
          a two-column key/value grid (Tour Date, Destination,
          Adults, Children, Lead Passenger, Payment Mode), a
          Payable row, a Rate Split panel, and a green-tick
          acceptance line. Footer mirrors HBP (Cancel + Confirm). */}
      <Modal
        show={showBookingSummaryModal}
        onHide={() => !isSubmitting && setShowBookingSummaryModal(false)}
        centered
        backdrop="static"
      >
        <Modal.Header
          closeButton={!isSubmitting}
          className="bg-primary text-white py-2"
          style={{ borderBottom: "none" }}
        >
          <Modal.Title className="fw-semibold d-flex align-items-center">
            <FaTicketAlt className="me-2" /> Confirm Your Booking
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="px-3 py-2 bg-light">
          <div className="border rounded-3 bg-white shadow-sm p-2">
            {/* Activity name + ID, matches HBP's hotelName+address row. */}
            <div className="mb-2">
              <p className="mb-0 d-flex align-items-center flex-wrap">
                <span className="fw-bold text-primary fs-5">
                  {activity.activityName}
                </span>
                {/* {(activity.id || activity.activityId) && (
                  <span className="text-muted small ms-2">
                    · ID: {activity.id || activity.activityId}
                  </span>
                )} */}
              </p>
              {searchCriteria.destination?.label && (
                <p className="text-muted small mb-0 mt-1">
                  <FaMapMarkerAlt className="me-1" />
                  {searchCriteria.destination.label}
                </p>
              )}
            </div>

            <hr className="my-2" />

            <Row className="gy-2">
              <Col xs={6}>
                <p className="mb-1">
                  <strong>Tour Date:</strong>
                  <br />
                  <span className="text-dark">
                    {searchCriteria.tourDate || "—"}
                  </span>
                </p>
              </Col>
              <Col xs={6}>
                <p className="mb-1">
                  <strong>Destination:</strong>
                  <br />
                  <span className="text-dark">
                    {searchCriteria.destination?.label || "—"}
                  </span>
                </p>
              </Col>
              <Col xs={6}>
                <p className="mb-1">
                  <strong>Adults:</strong> {searchCriteria.adults}
                </p>
              </Col>
              <Col xs={6}>
                <p className="mb-1">
                  <strong>Children:</strong> {searchCriteria.children || 0}
                </p>
              </Col>
              <Col xs={6}>
                <p className="mb-1">
                  <strong>Lead Passenger:</strong>
                  <br />
                  <span className="text-dark">
                    {(() => {
                      const lead = guests[leadIndex] || guests[0];
                      if (!lead) return "—";
                      const name = `${lead.salutation || ""} ${lead.firstName || ""} ${lead.lastName || ""}`.trim();
                      return name || "—";
                    })()}
                  </span>
                </p>
              </Col>
              <Col xs={6}>
                <p className="mb-1">
                  <strong>Payment Mode:</strong>
                  <br />
                  <span className="text-dark">
                    {paymentMode === "CREDIT"
                      ? "Credit Limit"
                      : paymentMode === "ONLINE"
                      ? "Online Payment"
                      : "Cash"}
                  </span>
                </p>
              </Col>
              {selectedItineraries.length > 0 && (
                <Col xs={12}>
                  <p className="mb-1">
                    <strong>Selected Itineraries:</strong>
                    <br />
                    <span className="text-dark small">
                      {selectedItineraries
                        .map(
                          (id) =>
                            itineraryList.find(
                              (item) => item.itineraryId === id,
                            )?.itineraryHeading,
                        )
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  </p>
                </Col>
              )}

              <Col xs={12}>
                {/* Payable row — same plain-border style as HBP. */}
                <div className="p-2 rounded bg-white border mt-2 d-flex justify-content-between align-items-center">
                  <h6 className="mb-0 fw-bold">Payable</h6>
                  <h5 className="mb-0 fw-bold">{formatPrice(totalRate)}</h5>
                </div>
              </Col>
            </Row>

            {/* Rate Split — fare + taxes breakdown. */}
            <div className="mt-2 p-2 bg-white border rounded">
              <h6 className="fw-bold mb-1">Rate Split</h6>
              <div className="d-flex justify-content-between">
                <span>Activity Fare</span>
                <span>{formatPrice(totalRate)}</span>
              </div>
              <div className="d-flex justify-content-between">
                <span>Taxes &amp; Fees</span>
                <span className="text-success">FREE</span>
              </div>
              <hr className="my-1" />
              <div className="d-flex justify-content-between fw-bold">
                <span>Total</span>
                <span>{formatPrice(totalRate)}</span>
              </div>
            </div>

            {/* Acceptance line — identical green tick + small text. */}
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
                aria-hidden="true"
              >
                ✓
              </span>
              <span className="small text-dark">
                Inclusions, terms and conditions, and cancellation policies
                accepted
              </span>
            </div>

            <div className="mt-2 text-center">
              <p className="text-muted small mb-0">
                Please review the booking details carefully before
                confirming.
              </p>
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer className="bg-light border-0 d-flex justify-content-between">
          <Button
            variant="outline-secondary"
            onClick={() => setShowBookingSummaryModal(false)}
            disabled={isSubmitting}
          >
            <i className="bi bi-x-circle me-1"></i> Cancel
          </Button>
          <Button
            variant="primary"
            onClick={confirmBooking}
            disabled={isSubmitting}
            className="px-4 fw-semibold"
          >
            {isSubmitting ? (
              <>
                <span
                  className="spinner-border spinner-border-sm me-2"
                  role="status"
                  aria-hidden="true"
                ></span>
                Processing...
              </>
            ) : (
              <>
                <FaCheckCircle className="me-2" /> Confirm &amp; Book
              </>
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Itinerary Modal */}
      <Modal show={showItineraryModal} onHide={handleCloseItineraryModal} size="lg" centered className="itinerary-modal">
        <Modal.Header closeButton className="border-0 pb-0 px-4 pt-4">
          <Modal.Title className="fw-bold">Select Itinerary</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-4">
          <Form.Group className="mb-4">
            <div className="position-relative">
              <Form.Control
                type="text"
                placeholder="Search itineraries..."
                className="rounded-pill px-4"
                value={itinerarySearchTerm}
                onChange={(e) => setItinerarySearchTerm(e.target.value)}
              />
            </div>
          </Form.Group>

          <div className="itinerary-list" style={{ maxHeight: "450px", overflowY: "auto" }}>
            {loadingItinerary ? (
              <div className="text-center py-5">
                <Spinner animation="border" variant="primary" />
                <p className="mt-3 text-muted">Loading itineraries...</p>
              </div>
            ) : filteredItineraryList.length > 0 ? (
              filteredItineraryList.map((item) => (
                <div 
                  key={item.itineraryId} 
                  className={`itinerary-item p-3 mb-2 rounded-4 border transition-all cursor-pointer ${selectedItineraries.includes(item.itineraryId) ? "border-primary bg-primary-subtle" : "border-light bg-white"}`}
                  onClick={() => handleItineraryToggle(item.itineraryId)}
                >
                  <div className="d-flex align-items-center">
                    <div className="form-check me-3">
                      <input 
                        type="checkbox" 
                        className="form-check-input mt-0" 
                        checked={selectedItineraries.includes(item.itineraryId)}
                        readOnly
                      />
                    </div>
                    <div className="flex-grow-1">
                      <h6 className="fw-bold mb-1">{item.itineraryHeading}</h6>
                      <div className={`small text-muted ${expandedDescriptions[item.itineraryId] ? "" : "text-truncate"}`} style={{ maxWidth: "600px" }}>
                        {item.itineraryDesc}
                      </div>
                      {item.itineraryDesc && item.itineraryDesc.length > 100 && (
                        <Button 
                          variant="link" 
                          size="sm" 
                          className="p-0 mt-1 text-primary text-decoration-none small"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedDescriptions(prev => ({ ...prev, [item.itineraryId]: !prev[item.itineraryId] }));
                          }}
                        >
                          {expandedDescriptions[item.itineraryId] ? "Show Less" : "Read More"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-5">
                <p className="text-muted">No itineraries found matching your search.</p>
              </div>
            )}
          </div>
        </Modal.Body>
        <Modal.Footer className="border-0 p-4">
          <Button variant="light" className="rounded-pill px-4" onClick={handleCloseItineraryModal}>
            Cancel
          </Button>
          <Button variant="primary" className="rounded-pill px-4 fw-bold" onClick={handleCloseItineraryModal}>
            Done
          </Button>
        </Modal.Footer>
      </Modal>

      <style dangerouslySetInnerHTML={{ __html: `
        :root {
          --primary-soft: rgba(13, 110, 253, 0.08);
          --primary-border: rgba(13, 110, 253, 0.15);
        }
        .cursor-pointer { cursor: pointer; }
        .itinerary-item:hover { border-color: #0d6efd !important; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .transition-all { transition: all 0.2s ease; }
        .bg-primary-subtle { background-color: var(--primary-soft) !important; }
        .border-dashed { border-style: dashed !important; border-width: 2px !important; }
        .itinerary-chip { transition: all 0.2s ease; }
        .itinerary-chip:hover { background-color: rgba(13, 110, 253, 0.12) !important; }
        .btn-add-itinerary {
          width: 32px;
          height: 32px;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s ease;
        }
        .btn-add-itinerary:hover { transform: scale(1.1); }
        .form-control, .form-select {
          border-color: #e9ecef;
          padding: 0.6rem 1rem;
          font-size: 0.95rem;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .form-control:focus, .form-select:focus {
          border-color: #0d6efd;
          box-shadow: 0 0 0 4px rgba(13, 110, 253, 0.1);
        }
        .itinerary-modal .modal-content {
          border-radius: 1.5rem;
          border: none;
        }
        .icon-box {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .btn-confirm {
          transition: all 0.3s ease;
          background: linear-gradient(135deg, #198754 0%, #146c43 100%);
          border: none;
        }
        .btn-confirm:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(25, 135, 84, 0.2) !important;
        }
        .gratuity-text {
          font-size: 0.8rem;
          letter-spacing: 1px;
        }
      `}} />
    </div>
  );
};

export default ActivityBookingPage;
