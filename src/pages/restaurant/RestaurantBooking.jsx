import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Card,
  Form,
  Row,
  Col,
  Button,
  Badge,
  Spinner,
  Alert,
  Modal,
  Table,
} from "react-bootstrap";
import { FaArrowLeft, FaUtensils, FaCheckCircle, FaSave, FaCheck, FaFilePdf, FaExternalLinkAlt } from "react-icons/fa";
import { toast } from "react-hot-toast";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import QuotationPdfCard from "../../components/quotation/QuotationPdfCard";
import "../../styles/HotelBookingPage.css";
// RestaurantSummary is no longer imported — we now render a lightweight
// recap inline (no prices/rates on the booking page).

const SEATING_PREFERENCES = ["Indoor", "Outdoor", "AC", "Non-AC", "Smoking", "Non-Smoking"];
const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Brunch", "High Tea"];
const OCCASIONS = ["None", "Birthday", "Anniversary", "Business Meeting", "Family Gathering", "Date"];

const normalizePolicyRows = (rows, legacyText = "", includeCancellationMeta = false) => {
  const list = Array.isArray(rows) ? rows : [];
  const normalized = list
    .filter((p) => p && p.isActive !== false && (p.policyText || "").trim())
    .map((p) => ({
      title: p.title || "",
      policyText: p.policyText,
      daysBeforeBooking: includeCancellationMeta ? p.daysBeforeBooking : null,
      chargePercent: includeCancellationMeta ? p.chargePercent : null,
    }));
  if (normalized.length) return normalized;
  return legacyText && legacyText.trim()
    ? [{ title: "", policyText: legacyText.trim(), daysBeforeBooking: null, chargePercent: null }]
    : [];
};

const RestaurantBooking = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const incoming = location.state || {};
  const restaurant = incoming.restaurant;

  // Booking no longer captures per-item selections OR rates — operators
  // upload menu PDFs on registration, the customer orders at the venue,
  // and the price is added later on the booking list. We keep
  // selectedItems = [] so the existing payload shape (items: []) keeps
  // working until the backend stops expecting that field.
  const selectedItems = [];
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [restaurantPolicies, setRestaurantPolicies] = useState({
    reservation: normalizePolicyRows(restaurant?.reservationPolicies, restaurant?.reservationPolicy),
    cancellation: normalizePolicyRows(
      restaurant?.cancellationPoliciesList || restaurant?.cancellationPolicies,
      restaurant?.cancellationPolicy,
      true
    ),
  });

  // Availability info — read-only display only. The agent doesn't pick
  // a mode here; whichever modes the restaurant supports are shown as
  // badges so the agent / customer know what's possible at this venue.
  // Possible values for restaurant.bookingModes: "Advance", "Walk-in",
  // "Both" (default).
  const offeredModes = restaurant?.bookingModes || "Both";
  const supportsAdvance = offeredModes === "Both" || offeredModes === "Advance";
  const supportsWalkIn  = offeredModes === "Both" || offeredModes === "Walk-in";

  const [form, setForm] = useState({
    // These three are pre-filled from the search criteria and rendered as
    // read-only fields below (the user already picked them upstream — no
    // reason to let them drift on the booking page).
    bookingDate: incoming.bookingDate || incoming.checkIn || "",
    bookingTime: incoming.bookingTime || "",
    memberCount: incoming.memberCount || 2,
    customerName: "",
    customerMobile: "",
    customerEmail: "",
    specialRequest: "",
    agentId: incoming.agentId || "",
    agentName: incoming.agentName || "",
    seatingPreference: "Indoor",
    mealType: incoming.mealType && incoming.mealType !== "Any" ? incoming.mealType : "Dinner",
    occasion: "None",
    dietaryNotes: "",
  });

  // Redirect back if user lands here directly without a restaurant context.
  useEffect(() => {
    if (!restaurant) {
      toast.error("Please select a restaurant first.");
      navigate("/new-booking/restaurant");
    }
  }, [restaurant, navigate]);

  useEffect(() => {
    if (!restaurant?.id) return;
    let cancelled = false;
    axiosInstance
      .get(`/api/restaurant/${restaurant.id}`)
      .then((res) => {
        if (cancelled) return;
        const d = res.data || {};
        setRestaurantPolicies({
          reservation: normalizePolicyRows(d.reservationPolicies, d.reservationPolicy),
          cancellation: normalizePolicyRows(
            d.cancellationPoliciesList || d.cancellationPolicies,
            d.cancellationPolicy,
            true
          ),
        });
      })
      .catch(() => {
        if (cancelled) return;
        setRestaurantPolicies({
          reservation: normalizePolicyRows(restaurant?.reservationPolicies, restaurant?.reservationPolicy),
          cancellation: normalizePolicyRows(
            restaurant?.cancellationPoliciesList || restaurant?.cancellationPolicies,
            restaurant?.cancellationPolicy,
            true
          ),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [restaurant]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  /** Returns an errors object, empty when the form is valid.
   *  Rate validation is gone — the operator sets the price later on the
   *  booking list. Booking time is only required when the venue
   *  doesn't accept walk-ins. */
  const validate = () => {
    const err = {};
    if (!form.bookingDate) err.bookingDate = "Booking date is required";
    // Time is required only when the venue supports Advance bookings
    // and not walk-ins. If it supports walk-ins, the agent can leave
    // time blank — guest arrives anytime during open hours.
    if (supportsAdvance && !supportsWalkIn && !form.bookingTime) {
      err.bookingTime = "Booking time is required";
    }
    // Enforce the venue's advance-booking lead time when a time is set.
    if (form.bookingDate && form.bookingTime && supportsAdvance) {
      const slot = new Date(`${form.bookingDate}T${form.bookingTime}`);
      const minHours = Number(restaurant?.advanceBookingMinHours) || 0;
      const earliest = new Date(Date.now() + minHours * 3600 * 1000);
      if (!isNaN(slot.getTime()) && slot < earliest && minHours > 0) {
        const hhmm = `${String(earliest.getHours()).padStart(2, "0")}:${String(
          earliest.getMinutes()
        ).padStart(2, "0")}`;
        const dateStr = earliest.toLocaleDateString();
        err.bookingTime =
          `Advance bookings need at least ${minHours} hour(s) notice. ` +
          `Earliest valid slot is ${hhmm} on ${dateStr}.`;
      }
    }
    if (!form.memberCount || Number(form.memberCount) < 1)
      err.memberCount = "At least 1 member";
    if (!form.customerName.trim()) err.customerName = "Customer name is required";
    if (!form.customerMobile.trim()) err.customerMobile = "Mobile is required";
    else if (!/^[0-9+\-\s]{7,15}$/.test(form.customerMobile))
      err.customerMobile = "Invalid mobile number";
    if (form.customerEmail && !/\S+@\S+\.\S+/.test(form.customerEmail))
      err.customerEmail = "Invalid email";
    return err;
  };

  /** Submit handler — validates then opens the order summary modal.
   *  The actual API call happens only when the user clicks "Confirm Booking"
   *  inside the modal.
   *
   *  When paymentMode === "Cash" we also pre-check the agent's credit
   *  limit against the computed grand total and, if it's insufficient,
   *  pop up a SweetAlert instead of opening the summary. This keeps
   *  the same UX the backend enforces (which throws 400 when credit is
   *  short).
   */
  /** Friendly label → field-key map so the toast can name the missing
   *  inputs instead of saying "Please fix the highlighted fields". */
  const FIELD_LABELS = {
    bookingDate: "Booking Date",
    bookingTime: "Booking Time",
    memberCount: "Members",
    customerName: "Customer Name",
    customerMobile: "Mobile",
    customerEmail: "Email",
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const err = validate();
    setErrors(err);
    if (Object.keys(err).length) {
      const labels = Object.keys(err).map((k) => FIELD_LABELS[k] || k);
      const head = labels.slice(0, 3).join(", ");
      const more = labels.length > 3 ? ` (+${labels.length - 3} more)` : "";
      toast.error(`Please fill: ${head}${more}`);
      // Scroll the first inline error into view so the user can see it.
      setTimeout(() => {
        const first = document.querySelector(".is-invalid, .text-danger");
        first?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
      return;
    }
    setPolicyAccepted(false);
    setPolicyOpen(true);
  };

  /**
   * Earliest acceptable HH:MM for the picked booking date, given the
   * venue's advance-booking lead time. When the date is today, the time
   * picker can only allow now + leadHours. For any future date the venue
   * is wide open (00:00). When the date is in the past nothing's valid;
   * we still return "00:00" so the picker doesn't refuse to render.
   *
   * Used both as the `min` attribute on the time input (so the browser
   * picker visually grays out impossible slots) and to drive the helper
   * text below the input.
   */
  const earliestSlot = useMemo(() => {
    const leadHours = Number(restaurant?.advanceBookingMinHours) || 0;
    if (!form.bookingDate) return null;
    const earliest = new Date(Date.now() + leadHours * 3600 * 1000);
    const picked = new Date(`${form.bookingDate}T00:00:00`);
    // If the picked date is later than today, any time of day is fine.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (picked.getTime() > today.getTime()) return { hhmm: "00:00", date: picked };
    // Same day or past: enforce now + leadHours.
    const hh = String(earliest.getHours()).padStart(2, "0");
    const mm = String(earliest.getMinutes()).padStart(2, "0");
    return { hhmm: `${hh}:${mm}`, date: earliest, sameDay: true };
  }, [form.bookingDate, restaurant?.advanceBookingMinHours]);

  if (!restaurant) return null;

  /** Final commit — POST to backend, then redirect to bookings list.
   *  No rate / tax / totals are computed here anymore. The operator
   *  enters the price later on the booking list. The backend sends
   *  notification emails to the hotel/restaurant and the agent on save. */
  const confirmAndSave = async () => {
    setSaving(true);
    try {
      const payload = {
        restaurantId: restaurant.id,
        restaurantName: restaurant.restaurantName,
        ...form,
        // Booking is created without a price; the operator adds the
        // total in the booking list afterwards.
        items: [],
        pricePerPerson: 0,
        subTotal: 0,
        taxPercent: 0,
        taxAmount: 0,
        totalAmount: 0,
        policyAccepted: true,
        acceptedReservationPolicies: true,
        acceptedCancellationPolicies: true,
        reservationPolicies: restaurantPolicies.reservation.map((p) => p.policyText),
        cancellationPolicies: restaurantPolicies.cancellation.map((p) => p.policyText),
        // Default status — backend should also flip to whichever its
        // workflow expects.
        bookingStatus: "Pending Approval",
        paymentStatus: "Not Paid",
      };

      await axiosInstance.post("/api/restaurant/booking/save", payload);

      setSummaryOpen(false);
      // Per spec: no post-save confirmation popup. The request email is
      // already on its way; the bookings list is the source of truth for
      // status. Redirect there directly.
      navigate("/booking-details/restaurant-booking-list");
    } catch (er) {
      console.error(er);
      toast.error(er?.response?.data?.message || "Failed to save booking");
    } finally {
      setSaving(false);
    }
  };

  // ── Quotation PDF ─────────────────────────────────────────────────────
  // Quotes what this page shows: the restaurant and the Booking Recap plus
  // the entered seating / occasion. The page carries no price (the operator
  // adds it later), so the quotation prints the price as "On request".
  // Policy lines use the Policies modal's own wording.
  const buildRestaurantQuotationPayload = () => {
    if (!restaurant) return null;
    const members = Number(form.memberCount) || 0;
    const cuisines = Array.isArray(restaurant.cuisineTypes)
      ? restaurant.cuisineTypes.filter(Boolean).join(", ")
      : "";
    const cancellationLine = (policy) => {
      const hasDays =
        policy.daysBeforeBooking !== null &&
        policy.daysBeforeBooking !== undefined;
      const hasCharge =
        policy.chargePercent !== null && policy.chargePercent !== undefined;
      const meta = [
        hasDays ? `${policy.daysBeforeBooking} day(s) before booking` : "",
        hasCharge ? `${policy.chargePercent}% charge` : "",
      ]
        .filter(Boolean)
        .join(" - ");
      return `${policy.title ? `${policy.title}: ` : ""}${policy.policyText}${
        meta ? ` (${meta})` : ""
      }`;
    };

    return {
      bookingType: "RESTAURANT",
      agentId: Number(form.agentId) || null,
      currency: "AED",
      serviceName: restaurant.restaurantName || "Restaurant",
      serviceSubtitle: [
        restaurant.place,
        restaurant.isInsideHotel && restaurant.hotelName
          ? `Hotel: ${restaurant.hotelName}`
          : "",
      ]
        .filter(Boolean)
        .join(", "),
      customerName: form.customerName.trim() || null,
      customerEmail: form.customerEmail.trim() || null,
      customerMobile: form.customerMobile.trim() || null,
      details: [
        { label: "Date", value: form.bookingDate || "" },
        {
          label: "Time",
          value: form.bookingTime || (supportsWalkIn ? "Anytime" : ""),
        },
        { label: "Members", value: String(members) },
        { label: "Meal", value: form.mealType || "" },
        { label: "Seating", value: form.seatingPreference || "" },
        {
          label: "Occasion",
          value: form.occasion && form.occasion !== "None" ? form.occasion : "",
        },
        { label: "Cuisine", value: cuisines },
        {
          label: "Opening Hours",
          value:
            restaurant.openTime && restaurant.closeTime
              ? `${restaurant.openTime} - ${restaurant.closeTime}`
              : "",
        },
      ],
      priceItems: [
        {
          description: "Table reservation",
          details: [
            `${members} Member${members === 1 ? "" : "s"}`,
            form.mealType,
            "Food and beverages as per the restaurant menu",
          ]
            .filter(Boolean)
            .join(", "),
          amount: null,
        },
      ],
      totalAmount: null,
      cancellationPolicy: restaurantPolicies.cancellation.map(cancellationLine),
      notes: restaurantPolicies.reservation.map(
        (policy) =>
          `${policy.title ? `${policy.title}: ` : ""}${policy.policyText}`,
      ),
    };
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1" style={{ minWidth: 0, overflowX: "hidden" }}>
        <div className="p-3 p-md-4" style={{ background: "#f5f7fb", minHeight: "calc(100vh - 60px)" }}>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h4 className="mb-0">
              <FaUtensils className="me-2 text-warning" />
              Book a Table
            </h4>
            {/* Back to search — uses an explicit route + replace so the
                search page reads the persisted sessionStorage criteria. */}
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() =>
                navigate("/new-booking/restaurant", { replace: true })
              }
            >
              <FaArrowLeft className="me-1" /> Back
            </Button>
          </div>

          <Form onSubmit={handleSubmit}>
            <Row>
              <Col lg={8}>
                <Card className="mb-3 shadow-sm">
                  <Card.Header className="bg-white fw-semibold">Restaurant</Card.Header>
                  <Card.Body>
                    <Row className="g-3 align-items-center">
                      <Col md={3}>
                        <img
                          src={
                            restaurant.images?.[0] ||
                            "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&q=60"
                          }
                          alt="r"
                          style={{
                            width: "100%",
                            height: 120,
                            objectFit: "cover",
                            borderRadius: 6,
                          }}
                        />
                      </Col>
                      <Col md={9}>
                        <h5 className="mb-1">{restaurant.restaurantName}</h5>
                        <div className="text-muted small">{restaurant.place}</div>
                        <div className="small">
                          {restaurant.openTime} - {restaurant.closeTime}
                        </div>
                        <div className="mt-1 d-flex flex-wrap gap-1">
                          {(restaurant.cuisineTypes || []).slice(0, 4).map((c) => (
                            <Badge key={c} bg="light" text="dark" className="border">
                              {c}
                            </Badge>
                          ))}
                        </div>
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>

                <Card className="mb-3 shadow-sm">
                  <Card.Header className="bg-white fw-semibold">Booking Details</Card.Header>
                  <Card.Body>
                    {/* Availability info — read-only. Only the modes the
                        restaurant actually supports are shown; missing
                        ones are simply omitted (no "not available"
                        clutter on the page). */}
                    <Row className="g-3 mb-2">
                      <Col md={12}>
                        <Form.Label className="fw-semibold mb-2">Availability</Form.Label>
                        <div className="d-flex flex-wrap gap-2">
                          {supportsAdvance && (
                            <Badge
                              bg="success"
                              className="px-3 py-2 border"
                              style={{ fontSize: "0.85rem" }}
                            >
                              <FaCheckCircle className="me-1" />
                              Advance Booking
                              {restaurant?.advanceBookingMinHours
                                ? ` (min ${restaurant.advanceBookingMinHours}h notice)`
                                : ""}
                            </Badge>
                          )}
                          {supportsWalkIn && (
                            <Badge
                              bg="info"
                              className="px-3 py-2 border"
                              style={{ fontSize: "0.85rem" }}
                            >
                              <FaCheckCircle className="me-1" />
                              Free to Available (Walk-in)
                            </Badge>
                          )}
                        </div>
                        <Form.Text muted>
                          The restaurant will be notified by email once you
                          confirm — they'll send back a confirmation that
                          the operator can mark in the bookings list.
                        </Form.Text>
                      </Col>
                    </Row>

                    <Row className="g-3">
                      {/* These three fields are read-only — already captured on
                          the search page. The "Back" button lets the user go
                          edit them upstream. */}
                      <Col md={4}>
                        <Form.Label>Booking Date *</Form.Label>
                        <Form.Control
                          type="date"
                          name="bookingDate"
                          value={form.bookingDate}
                          readOnly
                          plaintext={false}
                          className="bg-light"
                        />
                        <Form.Text muted>From search — go back to change.</Form.Text>
                      </Col>
                      <Col md={4}>
                        <Form.Label>
                          Booking Time {supportsAdvance && !supportsWalkIn ? "*" : ""}
                        </Form.Label>
                        <Form.Control
                          type="time"
                          name="bookingTime"
                          value={form.bookingTime}
                          onChange={handleChange}
                          isInvalid={!!errors.bookingTime}
                          // When the booking date is today and the venue
                          // requires advance notice, refuse times before
                          // now+leadHours so the user can't pick a slot
                          // that will then fail validation.
                          min={
                            supportsAdvance && earliestSlot?.sameDay
                              ? earliestSlot.hhmm
                              : undefined
                          }
                          placeholder={
                            supportsWalkIn && !supportsAdvance ? "Anytime during open hours" : ""
                          }
                        />
                        <Form.Control.Feedback type="invalid">
                          {errors.bookingTime}
                        </Form.Control.Feedback>
                        <Form.Text muted className="d-block">
                          {restaurant?.openTime && restaurant?.closeTime && (
                            <>
                              Open {String(restaurant.openTime).slice(0, 5)} –{" "}
                              {String(restaurant.closeTime).slice(0, 5)}
                              {earliestSlot?.sameDay && " · "}
                            </>
                          )}
                          {supportsAdvance && earliestSlot?.sameDay && (
                            <span className="text-danger">
                              Earliest today: {earliestSlot.hhmm} (
                              {Number(restaurant?.advanceBookingMinHours) || 0}h notice)
                            </span>
                          )}
                          {supportsWalkIn && !supportsAdvance && (
                            "Walk-in — guest can arrive any time during open hours."
                          )}
                        </Form.Text>
                      </Col>
                      <Col md={4}>
                        <Form.Label>Members *</Form.Label>
                        <Form.Control
                          type="number"
                          min={1}
                          name="memberCount"
                          value={form.memberCount}
                          readOnly
                          plaintext={false}
                          className="bg-light"
                        />
                        <Form.Text muted>From search — go back to change.</Form.Text>
                      </Col>
                      <Col md={4}>
                        <Form.Label>Meal Type</Form.Label>
                        <Form.Select name="mealType" value={form.mealType} onChange={handleChange}>
                          {MEAL_TYPES.map((m) => (
                            <option key={m}>{m}</option>
                          ))}
                        </Form.Select>
                      </Col>
                      <Col md={4}>
                        <Form.Label>Seating Preference</Form.Label>
                        <Form.Select
                          name="seatingPreference"
                          value={form.seatingPreference}
                          onChange={handleChange}
                        >
                          {SEATING_PREFERENCES.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </Form.Select>
                      </Col>
                      <Col md={4}>
                        <Form.Label>Occasion</Form.Label>
                        <Form.Select name="occasion" value={form.occasion} onChange={handleChange}>
                          {OCCASIONS.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </Form.Select>
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>

                <Card className="mb-3 shadow-sm">
                  <Card.Header className="bg-white fw-semibold">Customer Details</Card.Header>
                  <Card.Body>
                    <Row className="g-3">
                      <Col md={4}>
                        <Form.Label>Customer Name *</Form.Label>
                        <Form.Control
                          name="customerName"
                          value={form.customerName}
                          onChange={handleChange}
                          isInvalid={!!errors.customerName}
                        />
                        <Form.Control.Feedback type="invalid">{errors.customerName}</Form.Control.Feedback>
                      </Col>
                      <Col md={4}>
                        <Form.Label>Mobile *</Form.Label>
                        <Form.Control
                          name="customerMobile"
                          value={form.customerMobile}
                          onChange={handleChange}
                          isInvalid={!!errors.customerMobile}
                        />
                        <Form.Control.Feedback type="invalid">{errors.customerMobile}</Form.Control.Feedback>
                      </Col>
                      <Col md={4}>
                        <Form.Label>Email</Form.Label>
                        <Form.Control
                          type="email"
                          name="customerEmail"
                          value={form.customerEmail}
                          onChange={handleChange}
                          isInvalid={!!errors.customerEmail}
                        />
                        <Form.Control.Feedback type="invalid">{errors.customerEmail}</Form.Control.Feedback>
                      </Col>
                      {/* Payment mode removed — the booking is created
                          without a price; the operator adds the rate
                          later on the booking list. */}
                      <Col md={12}>
                        <Form.Label>Dietary Notes / Allergies</Form.Label>
                        <Form.Control
                          name="dietaryNotes"
                          value={form.dietaryNotes}
                          onChange={handleChange}
                          placeholder="e.g. Nut allergy, Jain food"
                        />
                      </Col>
                      <Col md={12}>
                        <Form.Label>Special Request</Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={2}
                          name="specialRequest"
                          value={form.specialRequest}
                          onChange={handleChange}
                        />
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>

                {/* Menu PDFs — the operator uploads one or more menu PDFs on
                    the registration page; we just surface them here so the
                    customer / agent can browse them while booking. No pre-
                    selection of items happens on this page anymore. */}
                <Card className="mb-3 shadow-sm">
                  <Card.Header className="bg-white fw-semibold">
                    <FaFilePdf className="me-2 text-danger" /> Menu PDFs
                  </Card.Header>
                  <Card.Body>
                    {Array.isArray(restaurant.menuPdfs) &&
                    restaurant.menuPdfs.length > 0 ? (
                      <ul className="list-unstyled mb-0">
                        {restaurant.menuPdfs.map((p, i) => (
                          <li
                            key={p.id || i}
                            className="d-flex align-items-center justify-content-between border rounded px-2 py-1 mb-1"
                          >
                            <span className="text-truncate" style={{ maxWidth: 380 }}>
                              <FaFilePdf className="text-danger me-2" />
                              {p.displayName ||
                                (p.fileUrl ? p.fileUrl.split("/").pop() : `Menu ${i + 1}`)}
                            </span>
                            {p.fileUrl && (
                              <a
                                href={p.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-sm btn-outline-primary"
                              >
                                <FaExternalLinkAlt className="me-1" /> View
                              </a>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Alert variant="light" className="mb-0 text-muted">
                        No menu PDFs uploaded for this restaurant yet.
                      </Alert>
                    )}
                  </Card.Body>
                </Card>
              </Col>

              {/* Sticky right column — lightweight recap (no prices)
                  and the Review & Submit button. RestaurantSummary
                  (which showed rate/tax/total) is no longer used here
                  because the operator sets the price on the list. */}
              <Col lg={4}>
                <div
                  className="restaurant-booking-summary-sticky"
                  style={{
                    position: "sticky",
                    top: 80,
                    zIndex: 2,
                    maxHeight: "calc(100vh - 100px)",
                    overflowY: "auto",
                  }}
                >
                  <Card className="shadow-sm">
                    <Card.Header className="bg-warning text-dark fw-semibold">
                      <FaUtensils className="me-2" /> Booking Recap
                    </Card.Header>
                    <Card.Body>
                      <div className="fw-semibold">{restaurant.restaurantName}</div>
                      <div className="small text-muted">{restaurant.place}</div>
                      {restaurant.isInsideHotel && restaurant.hotelName && (
                        <div className="small text-muted mb-3">
                          Hotel: <span className="fw-semibold">{restaurant.hotelName}</span>
                        </div>
                      )}
                      {!(restaurant.isInsideHotel && restaurant.hotelName) && (
                        <div className="mb-3"></div>
                      )}
                      <div className="d-flex justify-content-between small mb-1">
                        <span className="text-muted">Date</span>
                        <span className="fw-semibold">{form.bookingDate || "—"}</span>
                      </div>
                      <div className="d-flex justify-content-between small mb-1">
                        <span className="text-muted">Time</span>
                        <span className="fw-semibold">
                          {form.bookingTime || (supportsWalkIn ? "Anytime" : "—")}
                        </span>
                      </div>
                      <div className="d-flex justify-content-between small mb-1">
                        <span className="text-muted">Members</span>
                        <span className="fw-semibold">{form.memberCount || 0}</span>
                      </div>
                      <div className="d-flex justify-content-between small mb-1">
                        <span className="text-muted">Meal</span>
                        <span className="fw-semibold">{form.mealType}</span>
                      </div>
                      <div className="d-flex justify-content-between small mb-1">
                        <span className="text-muted">Agent</span>
                        <span className="fw-semibold">{form.agentName || "—"}</span>
                      </div>
                    </Card.Body>
                  </Card>
                  {/* Quotation — under the Booking Recap it quotes, above
                      Submit (a type="button", so it never submits this
                      form). */}
                  <QuotationPdfCard
                    buildPayload={buildRestaurantQuotationPayload}
                    disabled={saving}
                    note="Share this reservation with your customer before submitting. No booking is made."
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="w-100 mt-3"
                    disabled={saving}
                  >
                    <FaCheck className="me-2" />{" "}
                    {saving ? "Saving..." : "Submit"}
                  </Button>
                </div>
              </Col>
            </Row>
          </Form>
        </div>
        </main>
      </div>

      {/* Confirm modal — no totals shown (price is added on the list).
       *  Validation has already passed by the time this opens. */}
      <Modal
        show={policyOpen}
        onHide={() => {
          setPolicyOpen(false);
          setPolicyAccepted(false);
        }}
        dialogClassName="policy-modal"
        centered
        backdrop="static"
      >
        <Modal.Header closeButton className="policy-modal-header">
          <Modal.Title className="policy-modal-title">
            Restaurant Policies
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="policy-modal-body" style={{ maxHeight: "65vh", overflowY: "auto" }}>
          <section className="policy-section">
            <h6 className="policy-section-title">Reservation Policy</h6>
            {restaurantPolicies.reservation.length > 0 ? (
              restaurantPolicies.reservation.map((policy, idx) => (
                <div key={`reservation-policy-${idx}`} className="policy-item">
                  <div className="policy-text">
                    {policy.title && <strong>{policy.title}: </strong>}
                    {policy.policyText}
                  </div>
                </div>
              ))
            ) : (
              <div className="policy-empty">
                No reservation policy configured for this restaurant.
              </div>
            )}
          </section>

          <section className="policy-section policy-section-last">
            <h6 className="policy-section-title">Cancellation Policy</h6>
            {restaurantPolicies.cancellation.length > 0 ? (
              restaurantPolicies.cancellation.map((policy, idx) => (
                <div key={`cancellation-policy-${idx}`} className="policy-item">
                  <div className="policy-text">
                    {policy.title && <strong>{policy.title}: </strong>}
                    {policy.policyText}
                    {(policy.daysBeforeBooking !== null ||
                      policy.chargePercent !== null) && (
                      <div className="policy-meta">
                        {policy.daysBeforeBooking !== null &&
                          policy.daysBeforeBooking !== undefined &&
                          `${policy.daysBeforeBooking} day(s) before booking`}
                        {policy.daysBeforeBooking !== null &&
                          policy.daysBeforeBooking !== undefined &&
                          policy.chargePercent !== null &&
                          policy.chargePercent !== undefined
                          ? " - "
                          : ""}
                        {policy.chargePercent !== null &&
                          policy.chargePercent !== undefined &&
                          `${policy.chargePercent}% charge`}
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="policy-empty">
                No cancellation policy configured for this restaurant.
              </div>
            )}
          </section>
        </Modal.Body>
        <Modal.Footer className="policy-modal-footer">
          <Form.Check
            type="checkbox"
            id="restaurant-policy-acceptance"
            className="me-auto policy-accept-check"
            checked={policyAccepted}
            onChange={(e) => setPolicyAccepted(e.target.checked)}
            label="I have read and accept the reservation and cancellation policies"
          />
          <Button
            variant="outline-secondary"
            size="sm"
            disabled={saving}
            onClick={() => {
              setPolicyOpen(false);
              setPolicyAccepted(false);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!policyAccepted || saving}
            onClick={() => {
              if (!policyAccepted) {
                toast.error("Please accept the restaurant policies to continue booking.");
                return;
              }
              setPolicyOpen(false);
              setSummaryOpen(true);
            }}
          >
            Proceed
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={summaryOpen}
        onHide={() => !saving && setSummaryOpen(false)}
        size="lg"
        centered
        backdrop="static"
      >
        <Modal.Header closeButton={!saving}>
          <Modal.Title>
            <FaCheckCircle className="text-success me-2" />
            Request Booking
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Row className="g-2 mb-3">
            <Col md={6}><strong>Restaurant:</strong> {restaurant.restaurantName}</Col>
            {restaurant.isInsideHotel && restaurant.hotelName && (
              <Col md={6}><strong>Hotel:</strong> {restaurant.hotelName}</Col>
            )}
            <Col md={6}><strong>Place:</strong> {restaurant.place}</Col>
            <Col md={6}>
              <strong>Date / Time:</strong>{" "}
              {form.bookingDate}
              {form.bookingTime ? ` ${form.bookingTime}` : supportsWalkIn ? " (Walk-in — anytime)" : ""}
            </Col>
            <Col md={6}><strong>Members:</strong> {form.memberCount}</Col>
            <Col md={6}><strong>Meal Type:</strong> {form.mealType}</Col>
            <Col md={6}><strong>Seating:</strong> {form.seatingPreference}</Col>
            <Col md={6}>
              <strong>Customer:</strong> {form.customerName} ({form.customerMobile})
            </Col>
            <Col md={6}><strong>Agent:</strong> {form.agentName || "-"}</Col>
            <Col md={12}>
              <strong>Special Request:</strong> {form.specialRequest || "-"}
            </Col>
          </Row>
          <Alert variant="info" className="mb-0 small">
            <strong>What happens next?</strong>
            <ul className="mb-0 mt-1">
              <li>A request email is sent to <strong>{restaurant.restaurantName || "Green Leaf"}</strong>.</li>
              <li>A copy is sent to the agent ({form.agentName || "Globo"}).</li>
              <li>The restaurant will acknowledge by email.</li>
            </ul>
          </Alert>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" disabled={saving} onClick={() => setSummaryOpen(false)}>
            Edit
          </Button>
          <Button variant="primary" disabled={saving} onClick={confirmAndSave}>
            {saving ? (
              <>
                <Spinner size="sm" animation="border" className="me-2" />
                Saving...
              </>
            ) : (
              <>
                <FaSave className="me-2" /> Request Booking
              </>
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default RestaurantBooking;
