import React, { useEffect, useMemo, useRef, useState } from "react";
import Select from "react-select";
import "../styles/Register.css";
import "../styles/RegisterModern.css";
import axiosInstance from "../components/AxiosInstance";
import { toast } from "react-hot-toast";
import { Card, Form, Row, Col, Button, Container } from "react-bootstrap";
import { useNavigate } from "react-router-dom";

// Shared react-select styling — same as /hotel-register and /register.
const selectStyles = (hasError) => ({
  control: (base, state) => ({
    ...base,
    minHeight: 44,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: hasError ? "#EC0B43" : state.isFocused ? "#EC0B43" : "#E5E5E1",
    backgroundColor: state.isFocused ? "#fff" : "#FAFAF8",
    boxShadow: state.isFocused ? "0 0 0 4px rgba(236, 11, 67, .12)" : "none",
    fontSize: "0.92rem",
    fontFamily: "inherit",
  }),
  placeholder: (b) => ({ ...b, color: "#A8A8A3", fontWeight: 400 }),
  menu: (b) => ({ ...b, borderRadius: 11, overflow: "hidden", zIndex: 30 }),
  option: (b, s) => ({
    ...b,
    backgroundColor: s.isSelected ? "#EC0B43" : s.isFocused ? "#FDE7ED" : "#fff",
    color: s.isSelected ? "#fff" : "#15171C",
    fontSize: "0.92rem",
  }),
});

const TYPE_COPY = {
  SUPPLIER: {
    title: "Register as a Supplier",
    subtitle: "Partner with us — request access to the Supplier portal",
    noun: "supplier",
  },
  DMC: {
    title: "Register as a DMC",
    subtitle: "Partner with us — request access to the DMC (Destination Management Company) portal",
    noun: "DMC",
  },
};

/**
 * Public "Create Account → Supplier / DMC" form (Login page modal →
 * /supplier-register or /dmc-register). Mirrors HotelRegisterFromOut.jsx
 * and adds the "Services you want to offer" checkbox list, fed by the
 * partner_feature master (GET /api/partner-features). The ticked codes are
 * stored as the REQUESTED features; the admin decides the approved set on
 * /admin/approval/partners/:id.
 */
const PartnerRegisterFromOut = ({ partnerType = "SUPPLIER" }) => {
  const type = String(partnerType).toUpperCase() === "DMC" ? "DMC" : "SUPPLIER";
  const copy = TYPE_COPY[type];
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    companyName: "",
    contactPerson: "",
    email: "",
    phone: "",
    website: "",
    registrationNumber: "",
    address: "",
    countryId: "",
    provinceId: "",
    placeId: "",
    username: "",
    password: "",
    confirmPassword: "",
  });
  const [selectedFeatures, setSelectedFeatures] = useState(() => new Set());

  const [features, setFeatures] = useState([]);
  const [featuresLoading, setFeaturesLoading] = useState(true);
  // Country → City (province) → Location (place): same masters, same
  // endpoints and the same search-and-select controls as the agent /register
  // form, so a partner sees exactly what an agent sees.
  const [countries, setCountries] = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [places, setPlaces] = useState([]);
  // Debounce timer for the server-side country search (/api/country?search=).
  const countrySearchTimer = useRef(null);

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [redirectCountdown, setRedirectCountdown] = useState(5);

  // ── Masters (all public endpoints) ──
  useEffect(() => {
    let alive = true;
    axiosInstance
      .get("/api/partner-features")
      .then((res) => alive && setFeatures(Array.isArray(res.data) ? res.data : []))
      .catch((err) => {
        console.error("Error loading partner features:", err);
        if (alive) toast.error("Could not load the list of services. Please refresh the page.");
      })
      .finally(() => alive && setFeaturesLoading(false));
    countryList();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Same as /register: /api/country with an optional `search` term so the
  // BACKEND filters (CountryController supports ?search=...); without a term
  // the default first page is loaded.
  const countryList = async (search = "") => {
    try {
      const params = {};
      if (search && search.trim()) params.search = search.trim();
      const response = await axiosInstance.get("/api/country", { params });
      setCountries(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.log("error for country list :", error);
    }
  };

  const provinceList = async (countryId) => {
    try {
      const response = await axiosInstance.get(`/api/province/getByCountryId/${countryId}`);
      setProvinces(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.log("axios call error for province list : ", error);
    }
  };

  const cityList = async (provinceId) => {
    try {
      const response = await axiosInstance.get(`/api/destination/getplaces/${provinceId}`);
      setPlaces(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.log("axios call error for city list : ", error);
    }
  };

  useEffect(() => {
    if (formData.countryId) provinceList(formData.countryId);
  }, [formData.countryId]);

  useEffect(() => {
    if (formData.provinceId) cityList(formData.provinceId);
  }, [formData.provinceId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  // Geo dropdown change — resets the dependent fields down the chain.
  const handleGeoChange = (name, value) => {
    setFormData((prev) => {
      const updated = { ...prev, [name]: value };
      if (name === "countryId") {
        updated.provinceId = "";
        updated.placeId = "";
        setProvinces([]);
        setPlaces([]);
      } else if (name === "provinceId") {
        updated.placeId = "";
        setPlaces([]);
      }
      return updated;
    });
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const toggleFeature = (code) => {
    setSelectedFeatures((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
    setErrors((prev) => ({ ...prev, features: "" }));
  };

  const allSelected = features.length > 0 && features.every((f) => selectedFeatures.has(f.code));
  const toggleAll = () => {
    setSelectedFeatures(allSelected ? new Set() : new Set(features.map((f) => f.code)));
    setErrors((prev) => ({ ...prev, features: "" }));
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.companyName.trim()) newErrors.companyName = "Company name is required";
    if (!formData.contactPerson.trim()) newErrors.contactPerson = "Contact person is required";
    if (!formData.email.trim()) newErrors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email))
      newErrors.email = "Invalid email format";
    if (!formData.phone.trim()) newErrors.phone = "Phone is required";
    else if (!/^\+?\d{7,15}$/.test(formData.phone.replace(/\s/g, "")))
      newErrors.phone = "Phone must be 7-15 digits";
    if (!formData.countryId) newErrors.countryId = "Country is required";
    if (!formData.provinceId) newErrors.provinceId = "City is required";
    if (!formData.placeId) newErrors.placeId = "Location is required";
    if (!formData.address.trim()) newErrors.address = "Address is required";
    if (selectedFeatures.size === 0) newErrors.features = "Select at least one service you want to offer";
    if (!formData.username.trim()) newErrors.username = "Username is required";
    else if (!/^[A-Za-z0-9._@-]{3,50}$/.test(formData.username.trim()))
      newErrors.username = "3-50 characters: letters, digits, . _ @ - (no spaces)";
    if (!formData.password) newErrors.password = "Password is required";
    else if (formData.password.length < 6)
      newErrors.password = "Password must be at least 6 characters";
    if (!formData.confirmPassword) newErrors.confirmPassword = "Please confirm your password";
    else if (formData.password !== formData.confirmPassword)
      newErrors.confirmPassword = "Passwords do not match";
    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    const formErrors = validateForm();
    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors);
      setIsSubmitting(false);
      if (formErrors.features) toast.error(formErrors.features);
      return;
    }

    const countryName = countries.find((c) => String(c.id) === String(formData.countryId))?.name || "";
    const cityName = provinces.find((p) => String(p.id) === String(formData.provinceId))?.stateName || "";
    const locationName = places.find((pl) => String(pl.id) === String(formData.placeId))?.name || "";

    try {
      const res = await axiosInstance.post("/api/partner-external-register", {
        partnerType: type,
        companyName: formData.companyName,
        contactPerson: formData.contactPerson,
        email: formData.email,
        phone: formData.phone,
        website: formData.website,
        registrationNumber: formData.registrationNumber,
        address: formData.address,
        countryId: Number(formData.countryId),
        country: countryName,
        provinceId: Number(formData.provinceId),
        city: cityName,
        placeId: Number(formData.placeId),
        location: locationName,
        username: formData.username.trim(),
        password: formData.password,
        // Order follows the master list so the admin sees them in menu order.
        requestedFeatureCodes: features
          .map((f) => f.code)
          .filter((code) => selectedFeatures.has(code)),
      });

      setSuccessMsg(
        res.data?.message ||
          "Registration submitted. An administrator will review your request and enable the services for your account.",
      );
      setShowSuccess(true);
      setRedirectCountdown(5);

      const countdownInterval = setInterval(() => {
        setRedirectCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            navigate("/");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (error) {
      if (error.response) {
        toast.error(error.response.data?.message || "An error occurred during registration");
        if (error.response.data?.errors) setErrors(error.response.data.errors);
      } else if (error.request) {
        toast.error("Network error - please try again");
      } else {
        toast.error("An unexpected error occurred");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const countryOptions = useMemo(
    () => countries.map((c) => ({ value: c.id, label: c.name })),
    [countries],
  );
  const provinceOptions = useMemo(
    () => provinces.map((p) => ({ value: p.id, label: p.stateName })),
    [provinces],
  );

  return (
    <div className="register-page">
      <Container fluid className="px-0">
        <div className="register-container">
          {/* Header */}
          <div className="register-header">
            <div className="header-content">
              <div className="header-left">
                <h1 className="register-title">{copy.title}</h1>
                <p className="register-subtitle">{copy.subtitle}</p>
              </div>
              <div className="header-right">
                <img
                  className="register-logo"
                  src={`${process.env.PUBLIC_URL}/images/logo-1.jpg`}
                  alt="Logo"
                />
              </div>
            </div>
            <div className="back-to-login">
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => navigate("/")}
                className="back-button"
              >
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20" className="me-2">
                  <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Back to Home
              </Button>
            </div>
          </div>

          {showSuccess ? (
            <div className="register-form-container">
              <Card className="form-card">
                <Card.Body className="p-4 text-center">
                  <div className="success-content">
                    <div className="success-icon">
                      <svg width="80" height="80" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <h2 className="success-title">Registration Submitted!</h2>
                    <p className="success-message">{successMsg}</p>
                    <p className="success-message" style={{ fontSize: "0.9rem" }}>
                      Your account stays in <strong>Pending Approval</strong> until an administrator
                      reviews it. You will receive an email once it is approved.
                    </p>
                    <div className="success-actions">
                      <Button variant="primary" size="lg" onClick={() => navigate("/")} className="login-now-button">
                        Go to Home
                      </Button>
                      <p className="redirect-message">
                        Redirecting to home page in <strong>{redirectCountdown}</strong> seconds...
                      </p>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </div>
          ) : (
            <div className="register-form-container">
              <Form onSubmit={handleSubmit} className="register-form" noValidate autoComplete="off">
                <Card className="form-card">
                  <Card.Body className="p-4">
                    {/* Section: Company Information */}
                    <div className="form-step active">
                      <div className="step-header">
                        <h3 className="step-title">
                          <svg width="24" height="24" fill="currentColor" viewBox="0 0 20 20" className="step-icon">
                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
                          </svg>
                          Company Information
                        </h3>
                        <p className="step-description">Tell us about your {copy.noun} business</p>
                      </div>

                      <Row className="g-3">
                        <Col md={6}>
                          <Form.Group>
                            <Form.Label className="form-label">
                              Company Name <span className="required">*</span>
                            </Form.Label>
                            <Form.Control
                              type="text"
                              name="companyName"
                              value={formData.companyName}
                              onChange={handleChange}
                              placeholder="Registered company name"
                              className={`form-input ${errors.companyName ? "is-invalid" : ""}`}
                            />
                            {errors.companyName && (
                              <Form.Control.Feedback type="invalid">{errors.companyName}</Form.Control.Feedback>
                            )}
                          </Form.Group>
                        </Col>

                        <Col md={6}>
                          <Form.Group>
                            <Form.Label className="form-label">
                              Contact Person <span className="required">*</span>
                            </Form.Label>
                            <Form.Control
                              type="text"
                              name="contactPerson"
                              value={formData.contactPerson}
                              onChange={handleChange}
                              placeholder="Full name"
                              className={`form-input ${errors.contactPerson ? "is-invalid" : ""}`}
                            />
                            {errors.contactPerson && (
                              <Form.Control.Feedback type="invalid">{errors.contactPerson}</Form.Control.Feedback>
                            )}
                          </Form.Group>
                        </Col>

                        <Col md={6}>
                          <Form.Group>
                            <Form.Label className="form-label">
                              Email Address <span className="required">*</span>
                            </Form.Label>
                            <Form.Control
                              type="email"
                              name="email"
                              value={formData.email}
                              onChange={handleChange}
                              placeholder="company@example.com"
                              className={`form-input ${errors.email ? "is-invalid" : ""}`}
                            />
                            {errors.email && (
                              <Form.Control.Feedback type="invalid">{errors.email}</Form.Control.Feedback>
                            )}
                          </Form.Group>
                        </Col>

                        <Col md={6}>
                          <Form.Group>
                            <Form.Label className="form-label">
                              Phone <span className="required">*</span>
                            </Form.Label>
                            <Form.Control
                              type="tel"
                              name="phone"
                              value={formData.phone}
                              onChange={handleChange}
                              placeholder="+1 000 000 0000"
                              className={`form-input ${errors.phone ? "is-invalid" : ""}`}
                              maxLength={15}
                            />
                            {errors.phone && (
                              <Form.Control.Feedback type="invalid">{errors.phone}</Form.Control.Feedback>
                            )}
                          </Form.Group>
                        </Col>

                        <Col md={6}>
                          <Form.Group>
                            <Form.Label className="form-label">Website</Form.Label>
                            <Form.Control
                              type="text"
                              name="website"
                              value={formData.website}
                              onChange={handleChange}
                              placeholder="www.example.com"
                              className="form-input"
                            />
                          </Form.Group>
                        </Col>

                        <Col md={6}>
                          <Form.Group>
                            <Form.Label className="form-label">Trade Licence / Registration No.</Form.Label>
                            <Form.Control
                              type="text"
                              name="registrationNumber"
                              value={formData.registrationNumber}
                              onChange={handleChange}
                              placeholder="Optional"
                              className="form-input"
                              maxLength={100}
                            />
                          </Form.Group>
                        </Col>

                        <Col md={4}>
                          <Form.Group>
                            <Form.Label className="form-label">
                              Country <span className="required">*</span>
                            </Form.Label>
                            {/* Searchable country dropdown — same as /register: the
                                BACKEND filters via /api/country?search=..., so
                                react-select's local filter is disabled and the
                                server's results are shown verbatim. */}
                            <Select
                              inputId="countryId"
                              name="countryId"
                              classNamePrefix="reg-select"
                              isSearchable
                              isClearable
                              placeholder="Search country..."
                              filterOption={null}
                              options={countryOptions}
                              value={countryOptions.find((o) => String(o.value) === String(formData.countryId)) || null}
                              /* Refetch on every keystroke, debounced 300ms; ignore
                                 'menu-close' / 'set-value' so a pick doesn't refetch. */
                              onInputChange={(value, meta) => {
                                if (meta.action !== "input-change") return value;
                                if (countrySearchTimer.current) clearTimeout(countrySearchTimer.current);
                                countrySearchTimer.current = setTimeout(() => {
                                  countryList(value);
                                }, 300);
                                return value;
                              }}
                              onMenuOpen={() => {
                                // Reload the unfiltered list when the menu opens
                                // (helps after a previous filtered search).
                                if (countrySearchTimer.current) clearTimeout(countrySearchTimer.current);
                                countryList("");
                              }}
                              onChange={(opt) => handleGeoChange("countryId", opt ? String(opt.value) : "")}
                              className={errors.countryId ? "is-invalid" : ""}
                              styles={selectStyles(!!errors.countryId)}
                            />
                            {errors.countryId && <div className="invalid-feedback d-block">{errors.countryId}</div>}
                          </Form.Group>
                        </Col>

                        <Col md={4}>
                          <Form.Group>
                            <Form.Label className="form-label">
                              City <span className="required">*</span>
                            </Form.Label>
                            {/* Searchable city dropdown — provinces are preloaded
                                for the chosen country, so react-select filters
                                locally by typed text (same as /register). */}
                            <Select
                              inputId="provinceId"
                              name="provinceId"
                              classNamePrefix="reg-select"
                              isSearchable
                              isClearable
                              isDisabled={!formData.countryId}
                              placeholder="Search city..."
                              options={provinceOptions}
                              value={provinceOptions.find((o) => String(o.value) === String(formData.provinceId)) || null}
                              onChange={(opt) => handleGeoChange("provinceId", opt ? String(opt.value) : "")}
                              className={errors.provinceId ? "is-invalid" : ""}
                              styles={selectStyles(!!errors.provinceId)}
                            />
                            {errors.provinceId && <div className="invalid-feedback d-block">{errors.provinceId}</div>}
                          </Form.Group>
                        </Col>

                        <Col md={4}>
                          <Form.Group>
                            <Form.Label className="form-label">
                              Location <span className="required">*</span>
                            </Form.Label>
                            <Form.Select
                              name="placeId"
                              value={formData.placeId}
                              onChange={(e) => handleGeoChange("placeId", e.target.value)}
                              disabled={!formData.provinceId}
                              className={`form-input ${errors.placeId ? "is-invalid" : ""}`}
                            >
                              <option value="">Select location</option>
                              {places.map((place) => (
                                <option key={place.id} value={place.id}>
                                  {place.name}
                                </option>
                              ))}
                            </Form.Select>
                            {errors.placeId && (
                              <Form.Control.Feedback type="invalid">{errors.placeId}</Form.Control.Feedback>
                            )}
                          </Form.Group>
                        </Col>

                        <Col xs={12}>
                          <Form.Group>
                            <Form.Label className="form-label">
                              Address <span className="required">*</span>
                            </Form.Label>
                            <Form.Control
                              as="textarea"
                              rows={3}
                              name="address"
                              value={formData.address}
                              onChange={handleChange}
                              placeholder="Enter your complete address"
                              className={`form-input ${errors.address ? "is-invalid" : ""}`}
                            />
                            {errors.address && (
                              <Form.Control.Feedback type="invalid">{errors.address}</Form.Control.Feedback>
                            )}
                          </Form.Group>
                        </Col>
                      </Row>

                      {/* Section: Services */}
                      <div className="step-header" style={{ marginTop: "2rem" }}>
                        <h3 className="step-title">
                          <svg width="24" height="24" fill="currentColor" viewBox="0 0 20 20" className="step-icon">
                            <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clipRule="evenodd" />
                          </svg>
                          Services You Want to Offer <span className="required">*</span>
                        </h3>
                        <p className="step-description">
                          Tick every module you would like access to. The administrator reviews your
                          request and confirms which services are enabled on your account.
                        </p>
                      </div>

                      {featuresLoading ? (
                        <p className="text-muted mb-0">Loading services…</p>
                      ) : (
                        <>
                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <span className="text-muted" style={{ fontSize: "0.85rem" }}>
                              {selectedFeatures.size} of {features.length} selected
                            </span>
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              className="p-0"
                              onClick={toggleAll}
                              style={{ color: "#EC0B43", fontWeight: 600, textDecoration: "none" }}
                            >
                              {allSelected ? "Clear all" : "Select all"}
                            </Button>
                          </div>
                          <Row className="g-2">
                            {features.map((f) => {
                              const checked = selectedFeatures.has(f.code);
                              return (
                                <Col md={6} lg={4} key={f.code}>
                                  <label
                                    htmlFor={`feature-${f.code}`}
                                    title={f.description || ""}
                                    style={{
                                      display: "flex",
                                      alignItems: "flex-start",
                                      gap: 10,
                                      width: "100%",
                                      padding: "10px 12px",
                                      borderRadius: 11,
                                      border: `1.5px solid ${checked ? "#EC0B43" : errors.features ? "#EC0B43" : "#E5E5E1"}`,
                                      background: checked ? "#FFF3F5" : "#FAFAF8",
                                      cursor: "pointer",
                                      transition: "all .15s",
                                    }}
                                  >
                                    <input
                                      id={`feature-${f.code}`}
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleFeature(f.code)}
                                      style={{ accentColor: "#EC0B43", width: 17, height: 17, marginTop: 2, flexShrink: 0 }}
                                    />
                                    <span style={{ fontSize: "0.9rem", fontWeight: checked ? 600 : 500, color: "#15171C", lineHeight: 1.3 }}>
                                      {f.label}
                                    </span>
                                  </label>
                                </Col>
                              );
                            })}
                          </Row>
                          {errors.features && (
                            <div className="invalid-feedback d-block mt-2">{errors.features}</div>
                          )}
                        </>
                      )}

                      {/* Section: Login Credentials */}
                      <div className="step-header" style={{ marginTop: "2rem" }}>
                        <h3 className="step-title">
                          <svg width="24" height="24" fill="currentColor" viewBox="0 0 20 20" className="step-icon">
                            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                          </svg>
                          Login Credentials
                        </h3>
                        <p className="step-description">
                          Choose the username and password you will use to sign in once your account is approved
                        </p>
                      </div>

                      <Row className="g-3">
                        <Col md={4}>
                          <Form.Group>
                            <Form.Label className="form-label">
                              Username <span className="required">*</span>
                            </Form.Label>
                            <Form.Control
                              type="text"
                              name="username"
                              value={formData.username}
                              onChange={handleChange}
                              placeholder="Choose a username"
                              className={`form-input ${errors.username ? "is-invalid" : ""}`}
                              autoComplete="off"
                            />
                            {errors.username && (
                              <Form.Control.Feedback type="invalid">{errors.username}</Form.Control.Feedback>
                            )}
                          </Form.Group>
                        </Col>

                        <Col md={4}>
                          <Form.Group>
                            <Form.Label className="form-label">
                              Password <span className="required">*</span>
                            </Form.Label>
                            <Form.Control
                              type="password"
                              name="password"
                              value={formData.password}
                              onChange={handleChange}
                              placeholder="Choose a password"
                              className={`form-input ${errors.password ? "is-invalid" : ""}`}
                              autoComplete="new-password"
                            />
                            {errors.password && (
                              <Form.Control.Feedback type="invalid">{errors.password}</Form.Control.Feedback>
                            )}
                          </Form.Group>
                        </Col>

                        <Col md={4}>
                          <Form.Group>
                            <Form.Label className="form-label">
                              Confirm Password <span className="required">*</span>
                            </Form.Label>
                            <Form.Control
                              type="password"
                              name="confirmPassword"
                              value={formData.confirmPassword}
                              onChange={handleChange}
                              placeholder="Repeat your password"
                              className={`form-input ${errors.confirmPassword ? "is-invalid" : ""}`}
                              autoComplete="new-password"
                            />
                            {errors.confirmPassword && (
                              <Form.Control.Feedback type="invalid">{errors.confirmPassword}</Form.Control.Feedback>
                            )}
                          </Form.Group>
                        </Col>
                      </Row>
                    </div>

                    {/* Form Actions */}
                    <div className="form-actions">
                      <div className="d-flex justify-content-between align-items-center">
                        <div className="form-info">
                          <span className="required">*</span> Required fields
                        </div>
                        <div className="d-flex gap-3">
                          <Button
                            type="button"
                            variant="outline-secondary"
                            size="lg"
                            onClick={() => navigate("/")}
                            className="nav-button"
                          >
                            Back to Login
                          </Button>
                          <Button
                            type="submit"
                            variant="primary"
                            size="lg"
                            disabled={isSubmitting}
                            className="submit-button"
                          >
                            {isSubmitting ? "Submitting..." : "Submit Registration"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card.Body>
                </Card>
              </Form>
            </div>
          )}
        </div>
      </Container>
    </div>
  );
};

export default PartnerRegisterFromOut;
