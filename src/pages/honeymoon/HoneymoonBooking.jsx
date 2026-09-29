import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Card,
  Form,
  Row,
  Col,
  Button,
  Badge,
  Spinner,
  Container,
  Modal,
  Table,
} from "react-bootstrap";
import {
  FaArrowLeft,
  FaSuitcaseRolling,
  FaSave,
  FaCheck,
  FaCheckCircle,
} from "react-icons/fa";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import QuotationPdfCard from "../../components/quotation/QuotationPdfCard";

const PAYMENT_MODES = ["Cash", "Card", "UPI", "Online", "Net Banking"];

const HoneymoonBooking = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const incoming = location.state || {};
  const pkg = incoming.pkg;
  const sf = incoming.searchForm || {};

  const [form, setForm] = useState({
    startingDate: sf.startingDate || new Date().toISOString().slice(0, 10),
    rooms: sf.rooms || 1,
    adults: sf.adults || 2,
    children: sf.children || 0,
    // Per-child ages carried forward from the search page. Used for
    // pax-aware pricing (children > 3 are charged, 0-3 ride free) and
    // persisted on the booking + voucher.
    childAges: Array.isArray(sf.childAges)
      ? sf.childAges.map((a) => Number(a) || 0)
      : [],
    salutation: "Mr",
    customerName: "",
    mobile: "",
    email: "",
    specialRequest: "",
    paymentMode: "Online",
    // Tourism Dirham — typed amount added on top of the package total. We
    // keep it as a string so the input behaves naturally.
    tourismDirham: "",
  });
  // Authoritative agent markup config — fetched on mount via the same
  // endpoint the backend uses (`/api/agents/{id}/markup`). Falls back to
  // the search-time copy when the endpoint isn't reachable.
  const [agentMarkup, setAgentMarkup] = useState({
    value: Number(pkg?.agentMarkupPercent ?? pkg?.markupPercent ?? 0),
    type: pkg?.agentMarkupType || "PERCENT",
  });
  useEffect(() => {
    if (!sf.agentId) return;
    let cancelled = false;
    axiosInstance
      .get(`/api/agents/${sf.agentId}/markup`)
      .then((res) => {
        if (cancelled) return;
        const cfg = res?.data;
        if (cfg && cfg.markupValue != null) {
          setAgentMarkup({
            value: Number(cfg.markupValue),
            type: cfg.markupType || "PERCENT",
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sf.agentId]);
  const [errors, setErrors] = useState({});
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [saving, setSaving] = useState(false);

  // Add-on services available with the booked package. Source of truth:
  // the package itself (defined on Registration, priced on the Package
  // Rates page). We only surface add-ons that have a non-zero rate —
  // unpriced entries are treated as "not offered with this package" and
  // simply omitted from the UI.
  const buildAddonsFromList = (list) =>
    (Array.isArray(list) ? list : [])
      .map((a) => {
        const label = String(a?.label || "").trim();
        if (!label) return null;
        const price = Number(a?.price) || 0;
        if (price <= 0) return null; // skip unpriced
        return {
          key: String(a?.key || label.toLowerCase().replace(/[^a-z0-9]+/g, "-")),
          label,
          price,
          checked: false,
        };
      })
      .filter(Boolean);
  const [addons, setAddons] = useState([]);
  // Free-form custom addons — agent can add any extra item with a label
  // and (optional) price; both are added on top of the package total.
  const [extraServices, setExtraServices] = useState([
    { label: "", price: "" },
  ]);

  // Rates + the hotels included in the selected package. Mirrors the
  // /new-booking/package-booking Hotels section: hotels added in
  // HoneyMoonPackageRates show up here, get displayed during booking, and
  // are sent on the save payload so the booking detail view can list them.
  const [rates, setRates] = useState([]);
  const [includedHotels, setIncludedHotels] = useState([]);
  const [selectedRate, setSelectedRate] = useState(pkg?.selectedRate || null);

  // Pull the package's add-on services + rates. localStorage cache
  // (written by Registration / Package Rates pages) wins because it
  // always holds the latest rates the agent set; API is consulted as a
  // backup. Only entries with a non-zero rate make it onto the booking
  // form.
  useEffect(() => {
    if (!pkg?.id) return;
    let cancelled = false;
    (async () => {
      // 1) localStorage cache — fastest + most up to date.
      let storedAddOns = null;
      try {
        const raw = localStorage.getItem(`honeymoon_addons_${pkg.id}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed?.addOns)) storedAddOns = parsed.addOns;
        }
      } catch {
        /* ignore */
      }
      if (storedAddOns && storedAddOns.length) {
        if (!cancelled) setAddons(buildAddonsFromList(storedAddOns));
      }
      // 2) Anything attached to `pkg` directly (search/list page).
      if ((!storedAddOns || !storedAddOns.length) && Array.isArray(pkg.addOns) && pkg.addOns.length) {
        if (!cancelled) setAddons(buildAddonsFromList(pkg.addOns));
      }
      // 3) Server is authoritative for the list, but only overrides when
      //    we don't already have something newer locally.
      try {
        const r = await axiosInstance.get(`/api/honeymoon/${pkg.id}`);
        if (!cancelled && Array.isArray(r?.data?.addOns) && (!storedAddOns || !storedAddOns.length)) {
          setAddons(buildAddonsFromList(r.data.addOns));
        }
      } catch {
        /* server might not have the field — that's fine */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pkg?.id]);

  useEffect(() => {
    if (!pkg) {
      toast.error("Please select a package first.");
      navigate("/new-booking/honeymoon");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await axiosInstance.get(
          `/api/honeymoon-package-rate?packageId=${pkg.id}`
        );
        const rows = Array.isArray(r.data) ? r.data : [];
        if (cancelled) return;
        setRates(rows);
        if (!selectedRate) {
          const match =
            rows.find(
              (rt) =>
                pkg?.noOfNights &&
                Number(rt.noOfNights) === Number(pkg.noOfNights)
            ) || rows[0] || null;
          setSelectedRate(match);
        }
        // Dedup hotels by hotelId — package-level inclusion list.
        const seen = new Map();
        rows.forEach((row) => {
          (row.hotels || []).forEach((h) => {
            if (!seen.has(h.hotelId)) {
              seen.set(h.hotelId, {
                hotelId: h.hotelId,
                hotelName: h.hotelName || `Hotel #${h.hotelId}`,
                placeName: row.placeName || "",
                countryName: row.countryName || "",
                noOfNights: row.noOfNights || null,
              });
            }
          });
        });
        setIncludedHotels(Array.from(seen.values()));
      } catch {
        if (!cancelled) {
          setRates([]);
          setIncludedHotels([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pkg, navigate]);

  if (!pkg) return null;

  const splitPolicyText = (value) => {
    if (Array.isArray(value)) {
      return value
        .map((item) => String(item || "").trim())
        .filter(Boolean);
    }
    const raw = String(value || "").trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item || "").trim())
          .filter(Boolean);
      }
    } catch {
      /* Plain text policy; split below. */
    }
    return raw
      .split(/\r?\n|;/)
      .map((item) => item.replace(/^\[?\s*"?|"?\s*\]?$/g, "").trim())
      .filter(Boolean);
  };

  const honeymoonPolicies = [
    { title: "Inclusions", items: splitPolicyText(pkg.inclusions) },
    { title: "Exclusions", items: splitPolicyText(pkg.exclusions) },
    { title: "Cancellation Policy", items: splitPolicyText(pkg.cancellationPolicy) },
    { title: "Date Change Policy", items: splitPolicyText(pkg.dateChangePolicy) },
    { title: "Terms & Conditions", items: splitPolicyText(pkg.termsAndConditions) },
  ];

  const acceptedPolicySnapshot = honeymoonPolicies.map((section) => ({
    title: section.title,
    items: section.items,
  }));

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: "" }));
  };

  const validate = () => {
    const e = {};
    if (!form.startingDate) e.startingDate = "Starting date is required";
    else if (form.startingDate < new Date().toISOString().slice(0, 10))
      e.startingDate = "Date cannot be in the past";
    if (!form.rooms || Number(form.rooms) < 1) e.rooms = "At least 1 room";
    if (!form.adults || Number(form.adults) < 1) e.adults = "At least 1 adult";
    if (!form.salutation) e.salutation = "Salutation is required";
    if (!form.customerName.trim()) e.customerName = "Customer name is required";
    if (!form.mobile.trim()) e.mobile = "Mobile is required";
    else if (!/^[0-9+\-\s]{7,15}$/.test(form.mobile)) e.mobile = "Invalid mobile";
    if (form.email && !/\S+@\S+\.\S+/.test(form.email)) e.email = "Invalid email";
    return e;
  };

  const computeTotals = () => {
    const adults = Number(form.adults) || 0;
    const childCount = Number(form.children) || 0;
    // Children > 3 are charged; 0-3 ride free (mirrors backend).
    const ages = Array.isArray(form.childAges) ? form.childAges : [];
    const payingChildren = childCount
      ? Array.from({ length: childCount }, (_, i) => Number(ages[i] ?? 0))
          .filter((a) => a > 3).length
      : 0;
    const billedPax = Math.max(1, adults + payingChildren);
    const pax = Math.max(1, adults + childCount);

    // Pricing comes from the package rate row (HoneymoonPackageRate). Fall
    // back to the legacy perPaxRate if no rate row is available. Only
    // `payingChildren` contribute to the base total — 0-3 ride free.
    let baseTotal;
    let perAdult = 0;
    let perChild = 0;
    let perPax;
    if (selectedRate) {
      perAdult = Number(selectedRate.perAdultRate || 0);
      const rawChild = Number(selectedRate.perChildWithBed || 0);
      // Default per-child to 50% of perAdult only when a paying child is
      // present but the rate row has none configured.
      perChild = rawChild > 0 ? rawChild : Math.round(perAdult * 0.5);
      baseTotal = perAdult * adults + perChild * payingChildren;
      perPax = baseTotal / billedPax;
    } else {
      perPax = Number(pkg.baseRate ?? pkg.perPaxRate ?? 0);
      perAdult = perPax;
      perChild = Math.round(perPax * 0.5);
      baseTotal = perAdult * adults + perChild * payingChildren;
    }

    // Markup (Issue 7) — authoritative source is `agentMarkup` state,
    // hydrated on mount from /api/agents/{agentId}/markup (same endpoint
    // the backend booking service uses). Search-time copy on `pkg` is the
    // fallback for when the endpoint isn't reachable.
    const markupPct =
      agentMarkup.type === "PERCENT" && agentMarkup.value > 0
        ? Number(agentMarkup.value)
        : Number(pkg.agentMarkupPercent ?? pkg.markupPercent ?? 0);
    const markupAmount = (baseTotal * markupPct) / 100;
    const taxPct = 5;
    const taxable = baseTotal + markupAmount;
    const taxAmount = (taxable * taxPct) / 100;

    // Add-on services
    const addonsTotal = addons
      .filter((a) => a.checked)
      .reduce((s, a) => s + (Number(a.price) || 0), 0);
    const extrasTotal = extraServices.reduce(
      (s, e) => s + (Number(e.price) || 0),
      0
    );
    const tourismDirham = Number(form.tourismDirham) || 0;
    const addonsGrand = addonsTotal + extrasTotal + tourismDirham;

    const grandTotal = taxable + taxAmount + addonsGrand;
    return {
      perPax,
      perAdult,
      perChild,
      adults,
      childCount,
      payingChildren,
      billedPax,
      pax,
      baseTotal,
      markupPct,
      markupAmount,
      taxPct,
      taxAmount,
      addonsTotal,
      extrasTotal,
      tourismDirham,
      addonsGrand,
      grandTotal,
    };
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const err = validate();
    setErrors(err);
    if (Object.keys(err).length) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    setPolicyAccepted(false);
    setPolicyOpen(true);
  };

  const confirmAndSave = async () => {
    if (!policyAccepted) {
      toast.error("Please accept Terms & Conditions and Cancellation Policies to continue booking.");
      return;
    }
    setSaving(true);
    try {
      const { perPax, markupPct, taxPct } = computeTotals();
      const payload = {
        packageId: pkg.id,
        startingDate: form.startingDate,
        noOfNights: pkg.noOfNights,
        rooms: Number(form.rooms),
        adults: Number(form.adults),
        children: Number(form.children),
        childAges: (form.childAges || []).map((a) => Number(a) || 0),
        salutation: form.salutation,
        customerName: form.customerName,
        mobile: form.mobile,
        email: form.email,
        agentId: sf.agentId ? Number(sf.agentId) : null,
        agentName: sf.agentName || null,
        specialRequest: form.specialRequest,
        baseRate: perPax,
        markupPercent: markupPct,
        taxPercent: taxPct,
        paymentMode: form.paymentMode,
        // Persisted on the booking so the detail view shows which hotels
        // were part of the package the agent booked.
        selectedHotels: includedHotels,
        // Add-on services + tourism dirham — added on top of the package
        // total on the server side too (see HoneymoonBookingServiceImpl).
        addons: addons
          .filter((a) => a.checked)
          .map((a) => ({ label: a.label, price: Number(a.price) || 0 })),
        extraServices: extraServices
          .filter((e) => (e.label || "").trim())
          .map((e) => ({ label: e.label.trim(), price: Number(e.price) || 0 })),
        tourismDirham: Number(form.tourismDirham) || 0,
        policyAccepted: true,
        acceptedPolicies: acceptedPolicySnapshot,
      };
      const res = await axiosInstance.post("/api/honeymoon/booking/save", payload);
      setSummaryOpen(false);
      await Swal.fire({
        icon: "success",
        title: "Booking Confirmed!",
        html: `<div>Your booking number is <strong>${res.data?.bookingNumber}</strong></div>`,
        confirmButtonText: "View Bookings",
      });
      navigate("/booking-details/honeymoon-booking-list");
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.message || "Failed to save booking");
    } finally {
      setSaving(false);
    }
  };

  const totals = computeTotals();

  // ── Quotation PDF ─────────────────────────────────────────────────────
  // Quotes what the Price Summary shows, in INR (the page's ₹). The agent
  // markup is folded into the per-person package price — the customer sees
  // selling prices, never "Markup" — so every line and the Total stay
  // identical in sum to the page's Total. Policies, hotels and the
  // itinerary come from the selected package.
  const buildHoneymoonQuotationPayload = () => {
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const markupFactor = 1 + (Number(totals.markupPct) || 0) / 100;
    const adultUnit = round2(totals.perAdult * markupFactor);
    const childUnit = round2(totals.perChild * markupFactor);
    const freeChildren = totals.childCount - totals.payingChildren;
    const ages = Array.isArray(form.childAges) ? form.childAges : [];

    const priceItems = [
      {
        description: "Package - Adults",
        details: `${totals.adults} x INR ${adultUnit.toFixed(2)}`,
        amount: round2(totals.perAdult * totals.adults * markupFactor),
      },
    ];
    if (totals.payingChildren > 0) {
      priceItems.push({
        description: "Package - Children",
        details: `${totals.payingChildren} x INR ${childUnit.toFixed(2)}`,
        amount: round2(totals.perChild * totals.payingChildren * markupFactor),
      });
    }
    if (freeChildren > 0) {
      priceItems.push({
        description: "Children up to 3 years",
        details: `${freeChildren} free`,
        amount: 0,
      });
    }
    const taxIndex = priceItems.length;
    priceItems.push({
      description: `Tax (${totals.taxPct}%)`,
      details: "",
      amount: round2(totals.taxAmount),
    });
    addons
      .filter((a) => a.checked)
      .forEach((a) =>
        priceItems.push({
          description: a.label,
          details: "Add-on",
          amount: round2(a.price),
        }),
      );
    // Same rows totals.extrasTotal sums: every extra service with a price.
    extraServices
      .filter((e) => (Number(e.price) || 0) !== 0)
      .forEach((e) =>
        priceItems.push({
          description: (e.label || "").trim() || "Extra service",
          details: "Extra service",
          amount: round2(e.price),
        }),
      );
    if (totals.tourismDirham > 0) {
      priceItems.push({
        description: "Tourism Dirham",
        details: "",
        amount: round2(totals.tourismDirham),
      });
    }
    // Absorb per-line rounding (at most a few paise) into the tax line so
    // the lines add up exactly to the Total.
    const totalAmount = round2(totals.grandTotal);
    const diff = round2(
      totalAmount - priceItems.reduce((s, item) => s + item.amount, 0),
    );
    if (diff !== 0 && Math.abs(diff) <= 0.05) {
      priceItems[taxIndex].amount = round2(priceItems[taxIndex].amount + diff);
    }

    const dateChange = splitPolicyText(pkg.dateChangePolicy).map(
      (line) => `Date change: ${line}`,
    );

    return {
      bookingType: "HONEYMOON",
      agentId: Number(sf.agentId) || null,
      currency: "INR",
      serviceName: pkg.packageName || "Honeymoon Package",
      serviceSubtitle: [
        [pkg.startingFrom, pkg.destination].filter(Boolean).join(" to "),
        pkg.noOfNights ? `${pkg.noOfNights}N/${pkg.noOfDays}D` : "",
      ]
        .filter(Boolean)
        .join(", "),
      customerName: form.customerName.trim()
        ? `${form.salutation ? `${form.salutation} ` : ""}${form.customerName.trim()}`
        : null,
      customerEmail: form.email.trim() || null,
      customerMobile: form.mobile.trim() || null,
      details: [
        { label: "Starting Date", value: form.startingDate || "" },
        {
          label: "Duration",
          value: pkg.noOfNights
            ? `${pkg.noOfNights} Nights / ${pkg.noOfDays} Days`
            : "",
        },
        { label: "Destination", value: pkg.destination || "" },
        { label: "Rooms", value: String(Number(form.rooms) || 0) },
        {
          label: "Guests",
          value: `${totals.adults} Adult${totals.adults === 1 ? "" : "s"}${
            totals.childCount
              ? `, ${totals.childCount} Child${totals.childCount === 1 ? "" : "ren"}${
                  ages.length ? ` (Ages ${ages.join(", ")})` : ""
                }`
              : ""
          }`,
        },
        { label: "Category", value: pkg.category || "" },
        { label: "Theme", value: pkg.theme || "" },
        { label: "Hotel Category", value: pkg.hotelCategory || "" },
        {
          label: "Hotels",
          value: includedHotels
            .map((h) =>
              [
                h.hotelName,
                [h.placeName, h.countryName].filter(Boolean).join(", "),
                h.noOfNights ? `${h.noOfNights} Night(s)` : "",
              ]
                .filter(Boolean)
                .join(" - "),
            )
            .join("\n"),
        },
      ],
      priceItems,
      totalAmount,
      itinerary: Array.isArray(pkg.itinerary)
        ? pkg.itinerary.map((it) => ({
            day: it?.dayNumber ?? it?.day ?? null,
            heading: it?.heading || "",
            place: it?.place || it?.placeName || "",
            activities: it?.activities || it?.dayActivities || "",
          }))
        : [],
      inclusions: splitPolicyText(pkg.inclusions),
      exclusions: splitPolicyText(pkg.exclusions),
      cancellationPolicy: splitPolicyText(pkg.cancellationPolicy),
      notes: [...dateChange, ...splitPolicyText(pkg.termsAndConditions)],
    };
  };

  return (
    <div
      className="min-vh-100 d-flex flex-column"
      style={{ background: "#f5f7fb" }}
    >
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <Container fluid>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h4 className="mb-0 text-primary">
                <FaSuitcaseRolling className="me-2" /> Honeymoon Booking
              </h4>
              <Button variant="outline-secondary" size="sm" onClick={() => navigate(-1)} className="rounded-pill">
                <FaArrowLeft className="me-1" /> Back
              </Button>
            </div>

            <Form onSubmit={handleSubmit} noValidate>
              <Row>
                <Col lg={8}>
                  <Card className="mb-3 shadow-sm">
                    <Card.Header className="bg-white fw-semibold">Selected Package</Card.Header>
                    <Card.Body>
                      <Row className="g-3 align-items-center">
                        <Col md={3}>
                          <img
                            src={pkg.images?.[0] || "/images/not-available.jpg"}
                            alt={pkg.packageName}
                            style={{
                              width: "100%",
                              height: 120,
                              objectFit: "cover",
                              borderRadius: 6,
                            }}
                          />
                        </Col>
                        <Col md={9}>
                          <h5 className="mb-1 text-primary">{pkg.packageName}</h5>
                          <div className="text-muted small">
                            {pkg.startingFrom} → {pkg.destination} · {pkg.noOfNights}N/{pkg.noOfDays}D
                          </div>
                          <div className="mt-1 d-flex flex-wrap gap-1">
                            {pkg.category && <Badge bg="light" text="dark" className="border">{pkg.category}</Badge>}
                            {pkg.theme && <Badge bg="light" text="dark" className="border">{pkg.theme}</Badge>}
                            {pkg.hotelCategory && <Badge bg="info">{pkg.hotelCategory}</Badge>}
                          </div>
                        </Col>
                      </Row>
                    </Card.Body>
                  </Card>

                  {/* Included hotels — mirror of /new-booking/package-booking Hotels section */}
                  <Card className="mb-3 shadow-sm">
                    <Card.Header className="bg-white fw-semibold">
                      Hotels Included in this Package
                    </Card.Header>
                    <Card.Body>
                      {includedHotels.length === 0 ? (
                        <div className="text-muted small">
                          No hotels have been added to this honeymoon package yet.
                          Configure them under Honeymoon → Add Rates.
                        </div>
                      ) : (
                        <Row className="g-3">
                          {includedHotels.map((h) => (
                            <Col key={h.hotelId} md={6}>
                              <div
                                style={{
                                  border: "1px solid #e9ecef",
                                  borderRadius: 8,
                                  padding: 12,
                                  background: "#fafbfd",
                                }}
                              >
                                <div className="d-flex justify-content-between align-items-start">
                                  <h6 className="mb-1">{h.hotelName}</h6>
                                  <Badge bg="success" style={{ fontSize: "0.65rem" }}>
                                    Included
                                  </Badge>
                                </div>
                                <div className="text-muted small">
                                  {[h.placeName, h.countryName]
                                    .filter(Boolean)
                                    .join(", ") || "—"}
                                </div>
                                {h.noOfNights ? (
                                  <Badge bg="light" text="dark" className="mt-2 border">
                                    {h.noOfNights} Night(s)
                                  </Badge>
                                ) : null}
                              </div>
                            </Col>
                          ))}
                        </Row>
                      )}
                    </Card.Body>
                  </Card>

                  <Card className="mb-3 shadow-sm">
                    <Card.Header className="bg-white fw-semibold">Travel Details</Card.Header>
                    <Card.Body>
                      <Row className="g-3">
                        <Col md={4}>
                          <div className="text-muted small mb-1">Starting Date</div>
                          <div className="fw-semibold">
                            {form.startingDate || "—"}
                          </div>
                        </Col>
                        <Col md={2}>
                          <div className="text-muted small mb-1">Rooms</div>
                          <div className="fw-semibold">{form.rooms}</div>
                        </Col>
                        <Col md={3}>
                          <div className="text-muted small mb-1">Adults</div>
                          <div className="fw-semibold">{form.adults}</div>
                        </Col>
                        <Col md={3}>
                          <div className="text-muted small mb-1">Children</div>
                          <div className="fw-semibold">{form.children}</div>
                        </Col>
                        {/* Child ages — display read-only chips when ages
                            came in from the search page; otherwise allow
                            the agent to enter them here so the booking +
                            voucher capture the manifest. */}
                        {Number(form.children) > 0 && (
                          <Col md={12}>
                            <div className="text-muted small mb-1">
                              Child Ages
                            </div>
                            <div className="d-flex flex-wrap gap-2">
                              {Array.from(
                                { length: Number(form.children) },
                                (_, i) => (
                                  <Form.Control
                                    key={i}
                                    type="number"
                                    min={0}
                                    max={17}
                                    placeholder={`Child ${i + 1}`}
                                    value={form.childAges[i] ?? ""}
                                    onChange={(e) => {
                                      const v =
                                        e.target.value === ""
                                          ? 0
                                          : Number(e.target.value);
                                      setForm((p) => {
                                        const next = [...(p.childAges || [])];
                                        next[i] = v;
                                        return { ...p, childAges: next };
                                      });
                                    }}
                                    style={{ width: 100, height: 38 }}
                                  />
                                )
                              )}
                            </div>
                            <small className="text-muted">
                              Ages 0–3 ride free; 4+ are charged the child rate.
                            </small>
                          </Col>
                        )}
                      </Row>
                    </Card.Body>
                  </Card>

                  <Card className="mb-3 shadow-sm">
                    <Card.Header className="bg-white fw-semibold">Customer Details</Card.Header>
                    <Card.Body>
                      <Row className="g-3">
                        <Col md={2}>
                          <Form.Label>Salutation *</Form.Label>
                          <Form.Select
                            name="salutation"
                            value={form.salutation}
                            onChange={handleChange}
                            isInvalid={!!errors.salutation}
                          >
                            <option value="Mr">Mr</option>
                            <option value="Mrs">Mrs</option>
                            <option value="Ms">Ms</option>
                            <option value="Miss">Miss</option>
                            <option value="Dr">Dr</option>
                            <option value="Mr & Mrs">Mr &amp; Mrs</option>
                          </Form.Select>
                          <Form.Control.Feedback type="invalid">{errors.salutation}</Form.Control.Feedback>
                        </Col>
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
                        <Col md={3}>
                          <Form.Label>Mobile *</Form.Label>
                          <Form.Control
                            name="mobile"
                            value={form.mobile}
                            onChange={handleChange}
                            isInvalid={!!errors.mobile}
                          />
                          <Form.Control.Feedback type="invalid">{errors.mobile}</Form.Control.Feedback>
                        </Col>
                        <Col md={3}>
                          <Form.Label>Email</Form.Label>
                          <Form.Control
                            type="email"
                            name="email"
                            value={form.email}
                            onChange={handleChange}
                            isInvalid={!!errors.email}
                          />
                          <Form.Control.Feedback type="invalid">{errors.email}</Form.Control.Feedback>
                        </Col>
                        <Col md={6}>
                          <Form.Label>Agent</Form.Label>
                          <Form.Control value={sf.agentName || "-"} readOnly disabled />
                        </Col>
                        <Col md={6}>
                          <Form.Label>Payment Mode</Form.Label>
                          <Form.Select name="paymentMode" value={form.paymentMode} onChange={handleChange}>
                            {PAYMENT_MODES.map((p) => <option key={p}>{p}</option>)}
                          </Form.Select>
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

                  {/* Add-on Services card — checkboxes for common honeymoon
                      addons (rates come from the package), free-form rows
                      for custom items, and Tourism Dirham. All three
                      contribute to the grand total. */}
                  <Card className="mb-3 shadow-sm">
                    <Card.Header className="bg-white fw-semibold d-flex align-items-center justify-content-between">
                      <span>Add-on Services</span>
                      <small className="text-muted fw-normal">
                        Rates are set on the package — tick what the guest wants
                      </small>
                    </Card.Header>
                    <Card.Body>
                      {/* Add-ons are populated from the package — the list
                          only contains items the agent priced on the
                          Package Rates page. If nothing was priced this
                          section just shows an empty hint. */}
                      {addons.length === 0 ? (
                        <div className="text-muted small fst-italic">
                          No add-on services available for this package.
                        </div>
                      ) : (
                        <Row className="g-3">
                          {addons.map((a, idx) => {
                            const rate = Number(a.price) || 0;
                            return (
                              <Col md={6} key={a.key}>
                                <div className="d-flex align-items-center justify-content-between gap-2 border rounded p-2">
                                  <Form.Check
                                    type="checkbox"
                                    id={`hm-addon-${a.key}`}
                                    label={
                                      <span className="d-inline-flex flex-column">
                                        <span className="fw-semibold">
                                          {a.label}
                                        </span>
                                        <small className="text-muted">
                                          Rate set by package
                                        </small>
                                      </span>
                                    }
                                    checked={a.checked}
                                    onChange={(e) =>
                                      setAddons((prev) =>
                                        prev.map((x, i) =>
                                          i === idx
                                            ? { ...x, checked: e.target.checked }
                                            : x
                                        )
                                      )
                                    }
                                  />
                                  <Badge
                                    bg="primary"
                                    className="px-2 py-2"
                                    style={{ minWidth: 90, textAlign: "right" }}
                                  >
                                    ₹ {rate.toLocaleString()}
                                  </Badge>
                                </div>
                              </Col>
                            );
                          })}
                        </Row>
                      )}

                      <hr />
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <div>
                          <strong>Additional Services</strong>
                          <div className="text-muted small">
                            Free-form notes — no extra charge added to the total.
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline-success"
                          onClick={() =>
                            setExtraServices((p) => [...p, { label: "", price: 0 }])
                          }
                        >
                          + Add Service
                        </Button>
                      </div>
                      {extraServices.map((row, i) => (
                        <Row className="g-2 mb-2 align-items-center" key={i}>
                          <Col md={11}>
                            <Form.Control
                              placeholder="Service name (e.g. Champagne welcome)"
                              value={row.label}
                              onChange={(e) =>
                                setExtraServices((p) =>
                                  p.map((x, idx) =>
                                    idx === i ? { ...x, label: e.target.value } : x
                                  )
                                )
                              }
                            />
                          </Col>
                          <Col md={1} className="text-end">
                            <Button
                              size="sm"
                              variant="outline-danger"
                              disabled={extraServices.length === 1}
                              onClick={() =>
                                setExtraServices((p) =>
                                  p.length === 1
                                    ? p
                                    : p.filter((_, idx) => idx !== i)
                                )
                              }
                            >
                              ×
                            </Button>
                          </Col>
                        </Row>
                      ))}

                      <hr />
                      <Row className="g-2 align-items-center">
                        <Col md={6}>
                          <Form.Label className="mb-0 fw-semibold">
                            Tourism Dirham
                          </Form.Label>
                          <div className="text-muted small">
                            Government tourism fee — added to the package total.
                          </div>
                        </Col>
                        <Col md={6}>
                          <Form.Control
                            type="number"
                            min={0}
                            step="0.01"
                            name="tourismDirham"
                            placeholder="0.00"
                            value={form.tourismDirham}
                            onChange={handleChange}
                          />
                        </Col>
                      </Row>
                    </Card.Body>
                  </Card>
                </Col>

                <Col lg={4}>
                  <div className="sticky-top" style={{ top: 80 }}>
                    <Card className="shadow-sm">
                      <Card.Header className="bg-danger text-white fw-semibold">
                        <FaSuitcaseRolling className="me-2" /> Price Summary
                      </Card.Header>
                      <Card.Body>
                        <h6 className="mb-2">{pkg.packageName}</h6>
                        <div className="small text-muted mb-3">{pkg.destination}</div>
                        <div className="d-flex justify-content-between small">
                          <span>Adult ({totals.adults} × ₹ {Math.round(totals.perAdult).toLocaleString()})</span>
                          <span>₹ {(totals.perAdult * totals.adults).toLocaleString()}</span>
                        </div>
                        {totals.payingChildren > 0 && (
                          <div className="d-flex justify-content-between small">
                            <span>
                              Child ({totals.payingChildren} × ₹ {Math.round(totals.perChild).toLocaleString()})
                            </span>
                            <span>₹ {(totals.perChild * totals.payingChildren).toLocaleString()}</span>
                          </div>
                        )}
                        {totals.childCount > totals.payingChildren && (
                          <div className="d-flex justify-content-between small text-success">
                            <span>
                              Children ≤3 (free)
                            </span>
                            <span>{totals.childCount - totals.payingChildren}</span>
                          </div>
                        )}
                        <hr />
                        <div className="d-flex justify-content-between">
                          <span>Base Total ({totals.billedPax} billed pax)</span>
                          <span>₹ {totals.baseTotal.toLocaleString()}</span>
                        </div>
                        {totals.markupPct > 0 && (
                          <div className="d-flex justify-content-between text-info small">
                            <span>Markup ({totals.markupPct}%)</span>
                            <span>+ ₹ {totals.markupAmount.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="d-flex justify-content-between text-muted small">
                          <span>Tax ({totals.taxPct}%)</span>
                          <span>₹ {totals.taxAmount.toFixed(2)}</span>
                        </div>
                        {(totals.addonsTotal > 0 ||
                          totals.extrasTotal > 0 ||
                          totals.tourismDirham > 0) && (
                          <>
                            {totals.addonsTotal > 0 && (
                              <div className="d-flex justify-content-between small text-primary">
                                <span>Add-ons</span>
                                <span>+ ₹ {totals.addonsTotal.toFixed(2)}</span>
                              </div>
                            )}
                            {totals.extrasTotal > 0 && (
                              <div className="d-flex justify-content-between small text-primary">
                                <span>Extra Services</span>
                                <span>+ ₹ {totals.extrasTotal.toFixed(2)}</span>
                              </div>
                            )}
                            {totals.tourismDirham > 0 && (
                              <div className="d-flex justify-content-between small text-primary">
                                <span>Tourism Dirham</span>
                                <span>+ ₹ {totals.tourismDirham.toFixed(2)}</span>
                              </div>
                            )}
                          </>
                        )}
                        <hr />
                        <div className="d-flex justify-content-between fs-5 fw-bold">
                          <span>Total</span>
                          <span className="text-success">₹ {totals.grandTotal.toFixed(2)}</span>
                        </div>
                      </Card.Body>
                    </Card>
                    {/* Quotation — under the Price Summary it quotes, above
                        Review & Submit (a type="button", so it never submits
                        this form). */}
                    <QuotationPdfCard
                      buildPayload={buildHoneymoonQuotationPayload}
                      disabled={saving}
                    />
                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      className="w-100 mt-3 rounded-pill"
                      disabled={saving}
                    >
                      <FaCheck className="me-2" /> Review &amp; Submit
                    </Button>
                  </div>
                </Col>
              </Row>
            </Form>
          </Container>
        </main>
      </div>

      <Modal show={summaryOpen} onHide={() => !saving && setSummaryOpen(false)} size="lg" centered backdrop="static">
        <Modal.Header closeButton={!saving}>
          <Modal.Title>
            <FaCheckCircle className="text-success me-2" /> Order Summary
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Row className="g-2 mb-3">
            <Col md={6}><strong>Package:</strong> {pkg.packageName}</Col>
            <Col md={6}><strong>Route:</strong> {pkg.startingFrom} → {pkg.destination}</Col>
            <Col md={6}><strong>Starting Date:</strong> {form.startingDate}</Col>
            <Col md={6}><strong>Nights / Days:</strong> {pkg.noOfNights} / {pkg.noOfDays}</Col>
            <Col md={6}><strong>Rooms:</strong> {form.rooms}</Col>
            <Col md={6}><strong>Pax:</strong> {form.adults} Adult{form.adults != 1 ? "s" : ""}{form.children > 0 ? `, ${form.children} Children` : ""}</Col>
            <Col md={6}><strong>Customer:</strong> {form.customerName} ({form.mobile})</Col>
            <Col md={6}><strong>Agent:</strong> {sf.agentName || "-"}</Col>
            <Col md={12}><strong>Special Request:</strong> {form.specialRequest || "-"}</Col>
            <Col md={12}>
              <Badge bg="success" className="px-3 py-2">
                Policies Accepted
              </Badge>
            </Col>
          </Row>
          <Table size="sm" bordered>
            <tbody>
              <tr><td>Per pax</td><td className="text-end">₹ {totals.perPax.toLocaleString()}</td></tr>
              <tr><td>Base Total ({totals.pax} pax)</td><td className="text-end">₹ {totals.baseTotal.toLocaleString()}</td></tr>
              {totals.markupPct > 0 && (
                <tr><td>Markup ({totals.markupPct}%)</td><td className="text-end">₹ {totals.markupAmount.toFixed(2)}</td></tr>
              )}
              <tr><td>Tax ({totals.taxPct}%)</td><td className="text-end">₹ {totals.taxAmount.toFixed(2)}</td></tr>
              <tr className="table-light fw-bold">
                <td>Grand Total</td>
                <td className="text-end text-success">₹ {totals.grandTotal.toFixed(2)}</td>
              </tr>
            </tbody>
          </Table>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" disabled={saving} onClick={() => setSummaryOpen(false)}>
            Edit
          </Button>
          <Button variant="primary" disabled={saving} onClick={confirmAndSave}>
            {saving ? <><Spinner size="sm" animation="border" className="me-2" /> Saving...</> : <><FaSave className="me-2" /> Confirm Booking</>}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={policyOpen}
        onHide={() => !saving && setPolicyOpen(false)}
        size="lg"
        centered
        backdrop="static"
        dialogClassName="policy-modal"
      >
        <Modal.Header closeButton={!saving} className="policy-modal-header">
          <Modal.Title className="policy-modal-title">Honeymoon Policies &amp; Terms</Modal.Title>
        </Modal.Header>
        <Modal.Body className="policy-modal-body" style={{ maxHeight: "65vh", overflowY: "auto" }}>
          {honeymoonPolicies.map((section, index) => (
            <section
              key={section.title}
              className={`policy-section ${
                index === honeymoonPolicies.length - 1 ? "policy-section-last" : ""
              }`}
            >
              <h6 className="policy-section-title">{section.title}</h6>
              {section.items.length > 0 ? (
                section.items.map((item, idx) => (
                  <div key={`${section.title}-${idx}`} className="policy-item">
                    <div className="policy-text">{item}</div>
                  </div>
                ))
              ) : (
                <div className="policy-empty">
                  No {section.title} configured for this honeymoon package.
                </div>
              )}
            </section>
          ))}
        </Modal.Body>
        <Modal.Footer className="policy-modal-footer">
          <Form.Check
            type="checkbox"
            id="honeymoon-policy-acceptance"
            className="me-auto policy-accept-check"
            checked={policyAccepted}
            onChange={(e) => setPolicyAccepted(e.target.checked)}
            label="I have read and accept the policies and terms & conditions"
          />
          <Button
            variant="outline-secondary"
            size="sm"
            disabled={saving}
            onClick={() => setPolicyOpen(false)}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!policyAccepted || saving}
            onClick={() => {
              if (!policyAccepted) {
                toast.error("Please accept Terms & Conditions and Cancellation Policies to continue booking.");
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
    </div>
  );
};

export default HoneymoonBooking;
