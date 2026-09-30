import React, { useState, useEffect, useRef } from "react";
import Select from "react-select";
import "../styles/Register.css";
import "../styles/RegisterModern.css";
import axios from "axios";
import axiosInstance from "../components/AxiosInstance";
import { toast } from "react-hot-toast";
import { Card, Form, Row, Col, Button, Container, Alert } from "react-bootstrap";
import { useNavigate } from "react-router-dom";

const formatMarkupOption = (m) => {
  if (!m) return "";
  const value = m.markup;
  if (value === null || value === undefined || String(value).trim() === "") {
    return m.name || "";
  }
  const isPercent = String(m.markupType || "").toLowerCase() === "percent";
  return `${m.name || ""} - ${value}${isPercent ? "%" : ""}`;
};

const sortMarkupTypesByPercentage = (items = []) => {
  return [...items].sort((a, b) => {
    const aMarkup = Number(a?.markup);
    const bMarkup = Number(b?.markup);
    const aValue = Number.isFinite(aMarkup) ? aMarkup : Number.POSITIVE_INFINITY;
    const bValue = Number.isFinite(bMarkup) ? bMarkup : Number.POSITIVE_INFINITY;

    if (aValue !== bValue) return aValue - bValue;
    return String(a?.name || "").localeCompare(String(b?.name || ""));
  });
};

// Full blank form. Shared by the initial state and the post-success reset so
// the reset can never drop a key (the old inline reset omitted the newer
// salutation / trade-licence / timezone / vatNumber fields).
const INITIAL_FORM = {
  companyName: "",
  businessType: "",
  agentCategoryId: "",
  firstName: "",
  lastName: "",
  mobileNumber: "",
  personalEmail: "",
  countryId: "",
  provinceId: "",
  placeId: "",
  address: "",
  agentClassification: "registered",
  agentGstIn: "",
  agentProvisionalGstno: "",
  agentCorrespondmail: "",
  agentRegisterstatus: "",
  agentHsncode: "",
  agentStatus: "yes",
  currency: "",
  // Agent-level markup — matches the admin AgentReg field. Was missing on
  // this public form so agents registered here landed with markup_id=null,
  // which then breaks their room-list search (some agent works / some
  // doesn't, depending on whether markup was set later via admin).
  markup: "",
  // Finance Manager + GM details (required by backend, mirrors AgentReg).
  financeManagerName: "",
  financeManagerContactNo: "",
  financeManagerEmail: "",
  gmName: "",
  gmContactNo: "",
  gmEmail: "",
  // Incentive claim preference: "" | "CREDIT_LIMIT" | "BANK_TRANSFER".
  preferredClaimMethod: "",
  // Self-service login credentials. Collected here now (previously admin
  // did this via the AgentView Login button). Backend creates a pending
  // agent_external_registration row that admin approves on
  // /admin/approval/agents to provision the AGENT UserAccount.
  username: "",
  password: "",
  repassword: "",
  // Extended public-registration fields (Contact Info step) — surfaced to
  // the admin on /admin/approval/agents/:id and on AgentView after approval.
  salutation: "",
  tradeLicenseNo: "",
  /** Base64 data URL of the uploaded trade-license file (PDF/image). */
  tradeLicenseFile: "",
  tradeLicenseFileName: "",
  tradeLicenseExpiry: "",
  timezone: "",
  // Optional VAT registration number (free text).
  vatNumber: "",
};

// Which wizard step renders each field. Used to jump the user to the first
// step that still has an error — previously a failed submit only set the
// error text on inputs living on a hidden step, so "Create Account"
// appeared to do nothing when the user had skipped ahead via the step
// indicator (it allows jumping to any step).
const FIELD_STEP = {
  companyName: 1, businessType: 1, agentCategoryId: 1, currency: 1, markup: 1,
  salutation: 2, firstName: 2, lastName: 2, mobileNumber: 2, personalEmail: 2,
  tradeLicenseNo: 2, tradeLicenseFile: 2, tradeLicenseExpiry: 2, vatNumber: 2, timezone: 2,
  countryId: 3, provinceId: 3, placeId: 3, address: 3,
  username: 4, password: 4, repassword: 4,
  financeManagerName: 5, financeManagerContactNo: 5, financeManagerEmail: 5,
  gmName: 5, gmContactNo: 5, gmEmail: 5, preferredClaimMethod: 5,
  agentClassification: 6, agentGstIn: 6, agentProvisionalGstno: 6,
  agentCorrespondmail: 6, agentRegisterstatus: 6, agentHsncode: 6, agentStatus: 6,
};

const firstStepWithErrors = (errs) => {
  const steps = Object.keys(errs || {})
    .filter((k) => errs[k])
    .map((k) => FIELD_STEP[k])
    .filter(Boolean);
  return steps.length ? Math.min(...steps) : null;
};

// Backend rule for every phone field is `\+?\d{6,15}` on the RAW value. The
// form lets people type "+971 50 123 4567" / "050-123-4567", so strip the
// separators before validating and before sending — otherwise a number the
// form accepted is rejected by the server.
const normalisePhone = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const plus = raw.startsWith("+") ? "+" : "";
  return plus + raw.replace(/[^\d]/g, "");
};
const PHONE_RE = /^\+?\d{6,15}$/;

// Map backend error-field names onto this form's keys. The backend reports
// GST fields as "agentGSTDetailsDTO.agentGstIn" (nested DTO) while this form
// keeps them flat.
const toFormFieldName = (name) => String(name || "").replace(/^agentGSTDetailsDTO\./, "");

/**
 * Turn an axios error into { message, fieldErrors } using every shape the
 * backend produces: ErrorResponse {message}, FieldErrorResponse {message,
 * errors:{field:msg}}, a plain-string body, the container's default error
 * page ({error, status} with no message), and transport failures.
 */
const describeServerError = (error) => {
  const res = error?.response;
  const data = res?.data;
  let message = "";
  let fieldErrors = null;

  if (typeof data === "string" && data.trim()) {
    message = data.trim();
  } else if (data && typeof data === "object") {
    if (data.errors && typeof data.errors === "object" && !Array.isArray(data.errors)) {
      fieldErrors = {};
      Object.entries(data.errors).forEach(([k, v]) => {
        if (v) fieldErrors[toFormFieldName(k)] = String(v);
      });
      if (!Object.keys(fieldErrors).length) fieldErrors = null;
    }
    if (data.message) message = String(data.message);
    else if (Array.isArray(data.errors) && data.errors.length) {
      message = data.errors
        .map((e) => (typeof e === "string" ? e : e?.defaultMessage || e?.message))
        .filter(Boolean)
        .join(", ");
    } else if (fieldErrors) {
      message = Object.values(fieldErrors).join(", ");
    } else if (data.error) {
      message = `${data.error}${data.status ? ` (HTTP ${data.status})` : ""}`;
    }
  }

  if (!message) {
    if (res) {
      if (res.status === 413) message = "The uploaded file is too large. Please choose a smaller file (max 10 MB).";
      else if (res.status === 401 || res.status === 403) message = "The registration service refused the request. Please reload the page and try again.";
      else if (res.status >= 500) message = `The server could not process the registration (HTTP ${res.status}). Please try again in a moment.`;
      else message = `Registration failed (HTTP ${res.status}).`;
    } else if (error?.code === "ECONNABORTED" || /timeout/i.test(error?.message || "")) {
      message = "The request timed out before the server replied. Please check your connection and try again.";
    } else if (error?.request) {
      message = "Could not reach the server. Please check your internet connection and try again.";
    } else {
      message = error?.message || "An unexpected error occurred.";
    }
  }
  return { message, fieldErrors };
};

const Register = () => {
  const [formData, setFormData] = useState({ ...INITIAL_FORM });

  const [showPassword, setShowPassword] = useState(false);
  const [showRePassword, setShowRePassword] = useState(false);

  const SALUTATIONS = ["Mr", "Mrs", "Ms", "Dr", "Prof"];
  // Timezones now come from the master_timezone table (seeded by
  // MasterTimezoneSeeder). Kept in state so the dropdown reflects whatever
  // the backend currently exposes without an app redeploy.
  const [timezones, setTimezones] = useState([]);

  /**
   * Keep the raw File object in state — on submit we pipe it into a
   * FormData multipart request so the backend can save it via
   * FileStorageService (same pattern HotelReg.jsx uses for image360)
   * and only the resulting URL lands on the agent row.
   */
  const handleTradeLicenseFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      setFormData((prev) => ({ ...prev, tradeLicenseFile: "", tradeLicenseFileName: "" }));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrors((prev) => ({
        ...prev,
        tradeLicenseFile: "File too large (max 10 MB).",
      }));
      return;
    }
    setFormData((prev) => ({
      ...prev,
      tradeLicenseFile: file,
      tradeLicenseFileName: file.name,
    }));
    setErrors((prev) => ({ ...prev, tradeLicenseFile: "" }));
  };

  const [errors, setErrors] = useState({});
  // Tracks whether the user picked "Others" in the Business Type dropdown,
  // which then reveals a free-text box (still bound to formData.businessType).
  const FIXED_BUSINESS_TYPES = ["Tour Operator", "Travel Agency", "Event Company", "Airline"];
  const [businessTypeOther, setBusinessTypeOther] = useState(false);
  // Holds the timer for debounced country search so we don't hammer /api/country
  // on every keystroke.
  const countrySearchTimer = useRef(null);
  // Text currently typed into the country box (see onInputChange/onMenuOpen).
  const countrySearchText = useRef("");
  // Debounced agent-email availability check (table agent.personal_email).
  const emailCheckTimer = useRef(null);
  const [emailExists, setEmailExists] = useState(false);
  const [emailChecking, setEmailChecking] = useState(false);
  const [countries, setCountries] = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [places, setPlaces] = useState("");
  const [agentCategoryies, setAgentCategoryies] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [markupList, setMarkupList] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [showSuccess, setShowSuccess] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(5);

  const navigate = useNavigate();

  const agentCategoryList = async () => {
    try {
      const agentCatResponse = await axiosInstance.get("/api/agentCategory");
      setAgentCategoryies(agentCatResponse.data);
    } catch (error) {
      console.log("agent category api call error::", error);
    }
  };

  // Calls the /api/country endpoint. If a `search` term is provided it's
  // passed as a query param so the BACKEND filters (CountryController already
  // supports `?search=...`); otherwise the full list is loaded as before.
  // Sequence guard: onMenuOpen fires the UNFILTERED fetch and typing fires the
  // filtered one 300ms later. The full list is ~250 rows and often arrives
  // after the 1-row search result, overwriting it — so typing "United Arab"
  // showed India/Afghanistan/... and the agent had to scroll for their
  // country. Only the newest request may update the list.
  const countryReqSeq = useRef(0);
  const countryList = async (search = "") => {
    const seq = ++countryReqSeq.current;
    try {
      const params = {};
      if (search && search.trim()) params.search = search.trim();
      const response = await axiosInstance.get("/api/country", { params });
      if (seq !== countryReqSeq.current) return; // a newer request superseded this one
      setCountries(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.log("error for country list :", error);
    }
  };

  useEffect(() => {
    countryList();
    agentCategoryList();
    // Timezones come from the public /api/timezone master. Silent on
    // failure — the dropdown just shows the placeholder if the backend
    // is unreachable, matching the other master lookups on this page.
    (async () => {
      try {
        const res = await axiosInstance.get("/api/timezone");
        setTimezones(Array.isArray(res.data) ? res.data : []);
      } catch (_) {
        setTimezones([]);
      }
    })();
  }, []);

  const provinceList = async (countryId) => {
    try {
      const response = await axiosInstance.get(
        `/api/province/getByCountryId/${countryId}`
      );

      setProvinces(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.log("axios call error for province list : ", error);
    }
  };

  const cityList = async (stateId) => {
    try {
      const response = await axiosInstance.get(`/api/destination/getplaces/${stateId}`);
      setPlaces(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.log("axios call error for city list : ", error);
    }
  };

  const currencyList = async () => {
    try {
      const response = await axiosInstance.get("/api/currency?page=0&limit=100");
      console.log("Currency API Response:", response.data);

      const currencyData = Array.isArray(response.data) ? response.data : [];
      setCurrencies(currencyData);

      // Auto-select first currency if none selected
      if (currencyData.length > 0 && !formData.currency) {
        console.log("Auto-selecting currency:", currencyData[0].currencyId);
        setFormData(prev => ({
          ...prev,
          currency: currencyData[0].currencyId
        }));
      }
    } catch (error) {
      console.log("axios call error for currency list : ", error);
    }
  };

  useEffect(() => {
    currencyList(); // Call currencyList on component mount
  }, []);

  // Public markup master. Same shape as the admin AgentReg fetch — silent
  // on failure so the field simply shows the placeholder if the backend
  // is unreachable (mirrors the other public master lookups here).
  const markupTypeList = async () => {
    try {
      const response = await axiosInstance.get("/api/markupType");
      setMarkupList(sortMarkupTypesByPercentage(Array.isArray(response.data) ? response.data : []));
    } catch (error) {
      console.log("axios call error for markup list : ", error);
    }
  };

  useEffect(() => {
    markupTypeList();
  }, []);

  useEffect(() => {
    if (formData.countryId) {
      setProvinces([]); // Reset states when country changes
      setPlaces([]); // Reset cities when country changes
      provinceList(formData.countryId);
    }
  }, [formData.countryId]);

  useEffect(() => {
    if (formData.provinceId) {
      setPlaces([]); // Reset cities when state changes
      cityList(formData.provinceId);
    }
  }, [formData.provinceId]);

  // Debounced email-availability check. Only fires for well-formed
  // addresses; hits the public /api/agent/check-email endpoint and
  // flags duplicates so the field can warn inline before submit. A
  // failed check never blocks the user (server still validates on save).
  // Disabled per requirement — the /register page no longer enforces
  // email uniqueness (frontend + backend duplicate checks are commented).
  // useEffect(() => {
  //   const email = (formData.personalEmail || "").trim();
  //   if (emailCheckTimer.current) clearTimeout(emailCheckTimer.current);
  //   if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  //     setEmailExists(false);
  //     setEmailChecking(false);
  //     return undefined;
  //   }
  //   setEmailChecking(true);
  //   emailCheckTimer.current = setTimeout(() => {
  //     axiosInstance
  //       .get("/api/agent/check-email", { params: { email } })
  //       .then((res) => setEmailExists(Boolean(res.data?.exists)))
  //       .catch(() => setEmailExists(false))
  //       .finally(() => setEmailChecking(false));
  //   }, 500);
  //   return () => {
  //     if (emailCheckTimer.current) clearTimeout(emailCheckTimer.current);
  //   };
  // }, [formData.personalEmail]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevData) => {
      if (name === "agentCategoryId") {
        return {
          ...prevData,
          agentCategoryId: value,
        };
      }

      if (name === "countryId") {
        return {
          ...prevData,
          countryId: value,
          provinceId: "",
          placeId: "",
        };
      }
      if (name === "provinceId") {
        return {
          ...prevData,
          provinceId: value,
          placeId: "",
        };
      }
      if (name === "placeId") {
        return {
          ...prevData,
          placeId: value,
        };
      }
      return {
        ...prevData,
        [name]: value,
      };
    });
    setErrors((prevErrors) => ({
      ...prevErrors,
      [name]: "",
    }));
  };

  const validateCurrentStep = () => {
    const newErrors = {};

    if (currentStep === 1) {
      if (!formData.companyName.trim()) newErrors.companyName = "Company Name is required";
      if (!formData.businessType.trim()) newErrors.businessType = "Business Type is required";
      if (!formData.agentCategoryId) newErrors.agentCategoryId = "Company Type is required";
      if (!formData.currency) newErrors.currency = "Currency is required";
      // if (!formData.markup) newErrors.markup = "Markup is required";

    } else if (currentStep === 2) {
      if (!formData.firstName.trim()) newErrors.firstName = "First Name is required";
      if (!formData.lastName.trim()) newErrors.lastName = "Last Name is required";
      if (!formData.mobileNumber.trim()) newErrors.mobileNumber = "Mobile Number is required";
      if (!formData.personalEmail.trim()) newErrors.personalEmail = "Email ID is required";
      if (formData.personalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.personalEmail)) {
        newErrors.personalEmail = "Invalid email format";
      }
      // Duplicate-email guard removed per requirement.
      // else if (emailExists) {
      //   newErrors.personalEmail = "An agent with this email already exists";
      // }
      if (formData.mobileNumber && !/^\+?\d{10,15}$/.test(normalisePhone(formData.mobileNumber))) {
        newErrors.mobileNumber = "Mobile Number must be 10-15 digits";
      }
      if (!formData.timezone) newErrors.timezone = "Timezone is required.";
    } else if (currentStep === 3) {
      if (!formData.countryId) newErrors.countryId = "Country is required";
      if (!formData.provinceId) newErrors.provinceId = "City is required";
      if (!formData.address.trim()) newErrors.address = "Address is required";
    } else if (currentStep === 4) {
      // Step 4 — Login credentials (used to provision the AGENT UserAccount
      // once an admin approves this request from /admin/approval/agents).
      if (!formData.username.trim()) {
        newErrors.username = "Username is required";
      } else if (formData.username.length < 4) {
        newErrors.username = "Username must be at least 4 characters long";
      } else if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
        newErrors.username =
          "Username can only contain letters, numbers, and underscores";
      }
      if (!formData.password) {
        newErrors.password = "Password is required";
      } else if (formData.password.length < 8) {
        newErrors.password = "Password must be at least 8 characters long";
      } else if (!/(?=.*[A-Z])(?=.*[0-9])/.test(formData.password)) {
        newErrors.password =
          "Password must contain at least one uppercase letter and one number";
      }
      if (!formData.repassword) {
        newErrors.repassword = "Please confirm your password";
      } else if (formData.password !== formData.repassword) {
        newErrors.repassword = "Passwords do not match";
      }
    } else if (currentStep === 5) {
      // Step 5 — Finance Manager + GM details (always required to match backend)
      if (!formData.financeManagerName.trim())
        newErrors.financeManagerName = "Finance Manager name is required";
      if (!formData.financeManagerContactNo.trim())
        newErrors.financeManagerContactNo = "Finance Manager mobile number is required";
      else if (!PHONE_RE.test(normalisePhone(formData.financeManagerContactNo)))
        newErrors.financeManagerContactNo = "Finance Manager mobile number must be 6-15 digits (optional leading +)";
      if (!formData.financeManagerEmail.trim())
        newErrors.financeManagerEmail = "Finance Manager email is required";
      if (formData.financeManagerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.financeManagerEmail))
        newErrors.financeManagerEmail = "Invalid Finance Manager email format";
      if (!formData.gmName.trim())
        newErrors.gmName = "GM name is required";
      if (!formData.gmContactNo.trim())
        newErrors.gmContactNo = "GM mobile number is required";
      else if (!PHONE_RE.test(normalisePhone(formData.gmContactNo)))
        newErrors.gmContactNo = "GM mobile number must be 6-15 digits (optional leading +)";
      if (!formData.gmEmail.trim())
        newErrors.gmEmail = "GM email is required";
      if (formData.gmEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.gmEmail))
        newErrors.gmEmail = "Invalid GM email format";
    } else if (currentStep === 6 && formData.countryId === "1") {
      if (formData.agentClassification === "registered" && !formData.agentGstIn.trim()) {
        newErrors.agentGstIn = "GSTIN is required for registered agencies";
      }
      if (formData.agentGstIn && !/^[A-Z0-9]{15}$/.test(formData.agentGstIn.trim())) {
        newErrors.agentGstIn = "GSTIN must be 15 alphanumeric characters";
      }
      if (formData.agentCorrespondmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.agentCorrespondmail)) {
        newErrors.agentCorrespondmail = "Invalid correspondence email format";
      }
    }

    return newErrors;
  };

  const handleNextStep = () => {
    const stepErrors = validateCurrentStep();
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }
    setCurrentStep(currentStep + 1);
  };

  const validateForm = () => {
    const newErrors = {};

    // Required field validations
    if (!formData.companyName.trim())
      newErrors.companyName = "Company Name is required";
    if (!formData.businessType.trim())
      newErrors.businessType = "Business Type is required";
    if (!formData.agentCategoryId)
      newErrors.agentCategoryId = "Company Type or Agent category is required";
    if (!formData.currency) newErrors.currency = "Currency is required";
    // if (!formData.markup) newErrors.markup = "Markup is required";
    if (!formData.firstName.trim())
      newErrors.firstName = "First Name is required";
    if (!formData.lastName.trim()) newErrors.lastName = "Last Name is required";
    if (!formData.mobileNumber.trim())
      newErrors.mobileNumber = "Mobile Number is required";
    if (!formData.personalEmail.trim())
      newErrors.personalEmail = "Email ID is required";
    if (!formData.timezone) newErrors.timezone = "Timezone is required.";
    if (!formData.countryId) newErrors.countryId = "Country is required";
    if (!formData.provinceId) newErrors.provinceId = "Province is required";
    if (!formData.address.trim()) newErrors.address = "Address is required";

    // Additional format validations
    if (
      formData.personalEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.personalEmail)
    )
      newErrors.personalEmail = "Invalid email format";
    // Duplicate-email guard removed per requirement.
    // else if (emailExists)
    //   newErrors.personalEmail = "An agent with this email already exists";
    if (
      formData.mobileNumber &&
      !/^\+?\d{10,15}$/.test(normalisePhone(formData.mobileNumber))
    )
      newErrors.mobileNumber = "Mobile Number must be 10-15 digits";

    // Login credentials (Step 4). Backend uses these to create the
    // agent_external_registration pending row.
    if (!formData.username.trim()) {
      newErrors.username = "Username is required";
    } else if (formData.username.length < 4) {
      newErrors.username = "Username must be at least 4 characters long";
    } else if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
      newErrors.username =
        "Username can only contain letters, numbers, and underscores";
    }
    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters long";
    } else if (!/(?=.*[A-Z])(?=.*[0-9])/.test(formData.password)) {
      newErrors.password =
        "Password must contain at least one uppercase letter and one number";
    }
    if (!formData.repassword) {
      newErrors.repassword = "Please confirm your password";
    } else if (formData.password !== formData.repassword) {
      newErrors.repassword = "Passwords do not match";
    }

    // Finance Manager + GM details (required by backend)
    if (!formData.financeManagerName.trim())
      newErrors.financeManagerName = "Finance Manager name is required";
    if (!formData.financeManagerContactNo.trim())
      newErrors.financeManagerContactNo = "Finance Manager mobile number is required";
    else if (!PHONE_RE.test(normalisePhone(formData.financeManagerContactNo)))
      newErrors.financeManagerContactNo = "Finance Manager mobile number must be 6-15 digits (optional leading +)";
    if (!formData.financeManagerEmail.trim())
      newErrors.financeManagerEmail = "Finance Manager email is required";
    if (formData.financeManagerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.financeManagerEmail))
      newErrors.financeManagerEmail = "Invalid Finance Manager email format";
    if (!formData.gmName.trim())
      newErrors.gmName = "GM name is required";
    if (!formData.gmContactNo.trim())
      newErrors.gmContactNo = "GM mobile number is required";
    else if (!PHONE_RE.test(normalisePhone(formData.gmContactNo)))
      newErrors.gmContactNo = "GM mobile number must be 6-15 digits (optional leading +)";
    if (!formData.gmEmail.trim())
      newErrors.gmEmail = "GM email is required";
    if (formData.gmEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.gmEmail))
      newErrors.gmEmail = "Invalid GM email format";

    // GST fields validation (only if companyType is 3 or 5)
    if (formData.countryId === "1") {
      if (
        formData.agentClassification === "registered" &&
        !formData.agentGstIn.trim()
      )
        newErrors.agentGstIn = "GSTIN is required for registered agencies";
      if (
        formData.agentGstIn &&
        !/^[A-Z0-9]{15}$/.test(formData.agentGstIn.trim())
      )
        newErrors.agentGstIn = "GSTIN must be 15 alphanumeric characters";
      if (
        formData.agentCorrespondmail &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.agentCorrespondmail)
      )
        newErrors.agentCorrespondmail = "Invalid correspondence email format";
    }

    return newErrors;
  };

  // Last wizard step: the GST step only exists for India (countryId "1").
  const isFinalStep = (step) =>
    formData.countryId === "1" ? step === 6 : step === 5;

  // Show the errors AND move to the first step that has one, so a failed
  // submit never leaves the user staring at a step with no visible problem.
  const showErrorsAndJump = (errs, summary) => {
    setErrors(errs);
    const step = firstStepWithErrors(errs);
    if (step && step !== currentStep) setCurrentStep(step);
    if (summary) toast.error(summary, { duration: 6000 });
  };

  // Enter inside a text input submits the <form>. On a non-final step that
  // used to run the FULL validation and silently mark fields on later,
  // hidden steps; treat it like the Next button instead.
  const handleFormKeyDown = (e) => {
    if (e.key !== "Enter") return;
    const target = e.target;
    const tag = (target?.tagName || "").toLowerCase();
    if (tag !== "input" || target?.type === "file") return;
    // react-select (Country / City / Timezone) already consumed this Enter to
    // pick the highlighted option — leave it alone.
    if (e.isDefaultPrevented?.() || e.nativeEvent?.defaultPrevented) return;
    // Enter on a dropdown's search box with its menu closed: neither submit
    // nor advance, it is not a text field.
    if (target.getAttribute("role") === "combobox") {
      e.preventDefault();
      return;
    }
    if (!isFinalStep(currentStep)) {
      e.preventDefault();
      handleNextStep();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return; // guard against a double click / double Enter
    setIsSubmitting(true);

    const formErrors = validateForm();

    if (Object.keys(formErrors).length > 0) {
      showErrorsAndJump(formErrors, "Please fix the highlighted fields before submitting.");
      setIsSubmitting(false);
      return;
    }

    try {
      /* GM / Finance Manager fields are now collected in Step 5 of the form
         (matches the Agent admin registration). The form validation guarantees
         non-empty values; the `|| ""` here is just a defensive no-op.
         Strip `repassword` — client-side confirmation only, backend doesn't
         accept it. */
      const { repassword: _rp, ...payload } = formData;

      // Send phone numbers exactly the way the backend validates them
      // (`\+?\d{6,15}`, no spaces/dashes). The inputs accept separators for
      // readability; the server pattern does not.
      payload.mobileNumber = normalisePhone(payload.mobileNumber);
      payload.financeManagerContactNo = normalisePhone(payload.financeManagerContactNo);
      payload.gmContactNo = normalisePhone(payload.gmContactNo);

      // Trim free-text identity fields so "john " / " Acme Ltd" don't land in
      // the DB with stray whitespace (the username is also what the agent
      // will type at login).
      ["companyName", "firstName", "lastName", "personalEmail", "username",
        "financeManagerName", "financeManagerEmail", "gmName", "gmEmail",
        "agentCorrespondmail"].forEach((k) => {
        if (typeof payload[k] === "string") payload[k] = payload[k].trim();
      });

      // Trim the password too. The user's client-side validator enforces
      // length + character rules on the raw value, so a pasted "Passw0rd "
      // passes here but gets BCrypt-hashed WITH the trailing space on the
      // server — the agent's login page later sends "Passw0rd" (no space)
      // and BCrypt.matches returns false. Trimming here mirrors what
      // AgentView's admin credentials modal now does, and the backend also
      // trims defensively in AgentExternalRegistrationService.
      if (typeof payload.password === "string") {
        payload.password = payload.password.trim();
      }

      // Coerce markup to a plain integer (matches the admin AgentReg
      // submit — line 880 there. Backend AgentServiceImpl.registerAgent
      // calls Long.parseLong on request.getMarkup() and Jackson coerces
      // the number-shaped value to the String DTO field.)
      if (payload.markup) {
        payload.markup = parseInt(payload.markup, 10);
      }

      // Location is optional. When the user doesn't pick one the state
      // value is "" — send null so Jackson doesn't fail to coerce an
      // empty string into the Long placeId field on the backend DTO.
      if (payload.placeId === "" || payload.placeId === undefined) {
        payload.placeId = null;
      }

      // GST details: the backend DTO only knows the nested
      // `agentGSTDetailsDTO` object (what the admin AgentReg form sends).
      // This form kept the fields flat, so everything typed on the GST step
      // was silently discarded. Nest them — India only, where the step is
      // shown; other countries keep sending no GST block, as before.
      const gstKeys = ["agentClassification", "agentGstIn", "agentProvisionalGstno",
        "agentCorrespondmail", "agentRegisterstatus", "agentHsncode", "agentStatus"];
      const gstBlock = {};
      gstKeys.forEach((k) => {
        gstBlock[k] = typeof payload[k] === "string" ? payload[k].trim() : payload[k];
        delete payload[k];
      });
      if (formData.countryId === "1") {
        payload.agentGSTDetailsDTO = gstBlock;
      }

      // When the operator picked a trade-license file, upgrade the request to
      // multipart so the backend can save the raw bytes via
      // FileStorageService (same route HotelReg.jsx image360 uses). Otherwise
      // stay on the JSON path — nothing else about the request changes.
      const hasTradeLicense =
        payload.tradeLicenseFile && typeof payload.tradeLicenseFile !== "string";
      let registerResponse;
      if (hasTradeLicense) {
        const fd = new FormData();
        Object.entries(payload).forEach(([k, v]) => {
          if (k === "tradeLicenseFile" || k === "tradeLicenseFileName") return;
          if (v === undefined || v === null) return;
          if (k === "agentGSTDetailsDTO") {
            // Spring's @ModelAttribute binds nested properties by dotted name.
            Object.entries(v).forEach(([gk, gv]) => {
              if (gv !== undefined && gv !== null) fd.append(`agentGSTDetailsDTO.${gk}`, gv);
            });
            return;
          }
          fd.append(k, v);
        });
        // Distinct form-field name so Spring's @ModelAttribute doesn't try to
        // bind the MultipartFile onto the DTO's String `tradeLicenseFile`
        // field. The controller reads this under @RequestParam
        // "tradeLicenseFileUpload" and pipes it through FileStorageService
        // before setting the resulting URL on the DTO.
        fd.append("tradeLicenseFileUpload", payload.tradeLicenseFile);
        registerResponse = await axiosInstance.post(
          "/api/agent/register",
          fd,
          {
            headers: { "Content-Type": "multipart/form-data" },
            // The shared instance times out at 30s, which a 10 MB licence on
            // a slow link can exceed — the server would then finish the
            // registration while the browser reports a network error and
            // the agent retries into a "username already taken".
            timeout: 180000,
          },
        );
      } else {
        // No file — send flat JSON as before (the tradeLicenseFile field is
        // either "" or a string URL and can ride the JSON body).
        const { tradeLicenseFileName: _fn, ...jsonPayload } = payload;
        if (typeof jsonPayload.tradeLicenseFile !== "string") {
          jsonPayload.tradeLicenseFile = "";
        }
        registerResponse = await axiosInstance.post(
          "/api/agent/register",
          jsonPayload,
        );
      }
      console.log("registerResponse::", registerResponse);

      // Show success state
      setShowSuccess(true);
      setRedirectCountdown(5);

      // Start countdown for auto-redirect
      const countdownInterval = setInterval(() => {
        setRedirectCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            navigate('/');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Reset form on success
      setFormData({ ...INITIAL_FORM });
      setBusinessTypeOther(false);
      setErrors({});
      setCurrentStep(1);
    } catch (error) {
      // Surface the server's exact reason (status-aware fallbacks when it
      // sent none) and highlight the field(s) it named, jumping to their
      // step — e.g. a taken username lands the user back on step 4 with the
      // message under the Username input.
      const { message, fieldErrors } = describeServerError(error);
      console.error("Agent registration failed:", error?.response?.status, error?.response?.data || error?.message);
      if (fieldErrors) {
        showErrorsAndJump(fieldErrors, message);
      } else {
        toast.error(message, { duration: 8000 });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepIndicator = () => (
    <div className="step-indicator mb-4">
      <div className="step-item" onClick={() => setCurrentStep(1)} style={{ cursor: 'pointer' }}>
        <div className={`step-circle ${currentStep >= 1 ? 'active' : ''}`}>1</div>
        <div className="step-label">Company Details</div>
      </div>
      <div className={`step-connector ${currentStep >= 2 ? 'active' : ''}`}></div>
      <div className="step-item" onClick={() => setCurrentStep(2)} style={{ cursor: 'pointer' }}>
        <div className={`step-circle ${currentStep >= 2 ? 'active' : ''}`}>2</div>
        <div className="step-label">Contact Info</div>
      </div>
      <div className={`step-connector ${currentStep >= 3 ? 'active' : ''}`}></div>
      <div className="step-item" onClick={() => setCurrentStep(3)} style={{ cursor: 'pointer' }}>
        <div className={`step-circle ${currentStep >= 3 ? 'active' : ''}`}>3</div>
        <div className="step-label">Location</div>
      </div>
      <div className={`step-connector ${currentStep >= 4 ? 'active' : ''}`}></div>
      <div className="step-item" onClick={() => setCurrentStep(4)} style={{ cursor: 'pointer' }}>
        <div className={`step-circle ${currentStep >= 4 ? 'active' : ''}`}>4</div>
        <div className="step-label">Account</div>
      </div>
      <div className={`step-connector ${currentStep >= 5 ? 'active' : ''}`}></div>
      <div className="step-item" onClick={() => setCurrentStep(5)} style={{ cursor: 'pointer' }}>
        <div className={`step-circle ${currentStep >= 5 ? 'active' : ''}`}>5</div>
        <div className="step-label">Finance & GM</div>
      </div>
      {formData.countryId === "1" && (
        <>
          <div className={`step-connector ${currentStep >= 6 ? 'active' : ''}`}></div>
          <div className="step-item" onClick={() => setCurrentStep(6)} style={{ cursor: 'pointer' }}>
            <div className={`step-circle ${currentStep >= 6 ? 'active' : ''}`}>6</div>
            <div className="step-label">GST Details</div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="register-page">
      <Container fluid className="px-0">
        <div className="register-container">
          {/* Header */}
          <div className="register-header">
            <div className="header-content">
              <div className="header-left">
                <h1 className="register-title">Create Your Account</h1>
                <p className="register-subtitle">Join our network of travel professionals</p>
              </div>
              <div className="header-right">
                <img
                  className="register-logo"
                  src={`${process.env.PUBLIC_URL}/images/logo-1.jpg`}
                  alt="Logo"
                />
              </div>
            </div>
            {/* Back to Login Button */}
            <div className="back-to-login">
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => navigate('/')}
                className="back-button"
              >
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20" className="me-2">
                  <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Back to Home
              </Button>
            </div>
          </div>

          {/* Success Screen */}
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
                    <p className="success-message">
                      Your registration has been submitted for review. An administrator
                      will verify your details, and you'll be able to log in with your
                      chosen username and password once your account is approved.
                    </p>
                    <div className="success-actions">
                      <Button
                        variant="primary"
                        size="lg"
                        onClick={() => navigate('/')}
                        className="login-now-button"
                      >
                        <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20" className="me-2">
                          <path fillRule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l1.293 1.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
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
            <>
              {/* Progress Indicator */}
              {renderStepIndicator()}

              {/* Form */}
              <div className="register-form-container">
                <Form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="register-form" noValidate autoComplete="off">
                  <Card className="form-card">
                    <Card.Body className="p-4">

                      {/* Step 1: Company Details */}
                      <div className={`form-step ${currentStep === 1 ? 'active' : ''}`}>
                        <div className="step-header">
                          <h3 className="step-title">
                            <svg width="24" height="24" fill="currentColor" viewBox="0 0 20 20" className="step-icon">
                              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
                            </svg>
                            Company Information
                          </h3>
                          <p className="step-description">Tell us about your business</p>
                          {/* Pre-submit notice — company fields are immutable
                              post-registration, so we surface this at the top
                              of the Company Information step. */}
                          <div
                            role="note"
                            style={{
                              marginTop: "10px",
                              padding: "10px 14px",
                              border: "1px solid #ffe69c",
                              borderLeft: "4px solid #f0ad4e",
                              backgroundColor: "#fff8e1",
                              color: "#664d03",
                              borderRadius: "4px",
                              fontSize: "0.88rem",
                              lineHeight: 1.4,
                            }}
                          >
                            <strong>Important:</strong> Please verify your
                            company details before submitting, as they cannot
                            be modified after registration.
                          </div>
                        </div>

                        <Row className="g-3">
                          <Col xs={12}>
                            <Form.Group>
                              <Form.Label className="form-label">
                                Company Name <span className="required">*</span>
                              </Form.Label>
                              <Form.Control
                                type="text"
                                name="companyName"
                                value={formData.companyName}
                                onChange={handleChange}
                                placeholder="Enter your company name"
                                className={`form-input ${errors.companyName ? 'is-invalid' : ''}`}
                              />
                              {errors.companyName && (
                                <Form.Control.Feedback type="invalid">
                                  {errors.companyName}
                                </Form.Control.Feedback>
                              )}
                            </Form.Group>
                          </Col>

                          <Col md={6}>
                            <Form.Group>
                              <Form.Label className="form-label">
                                Business Type <span className="required">*</span>
                              </Form.Label>
                              {/* Fixed-option dropdown; "Others" reveals a free-text input.
                                  The same `businessType` form field is preserved so submit /
                                  validation logic is untouched. */}
                              <Form.Select
                                name="businessTypeSelect"
                                value={
                                  businessTypeOther
                                    ? "Others"
                                    : (FIXED_BUSINESS_TYPES.includes(formData.businessType)
                                        ? formData.businessType
                                        : "")
                                }
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === "Others") {
                                    setBusinessTypeOther(true);
                                    setFormData((prev) => ({ ...prev, businessType: "" }));
                                  } else {
                                    setBusinessTypeOther(false);
                                    setFormData((prev) => ({ ...prev, businessType: v }));
                                  }
                                  setErrors((prev) => ({ ...prev, businessType: "" }));
                                }}
                                className={`form-input ${errors.businessType && !businessTypeOther ? 'is-invalid' : ''}`}
                              >
                                <option value="">Select business type</option>
                                <option value="Tour Operator">Tour Operator</option>
                                <option value="Travel Agency">Travel Agency</option>
                                <option value="Event Company">Event Company</option>
                                <option value="Airline">Airline</option>
                                <option value="Others">Others</option>
                              </Form.Select>
                              {businessTypeOther && (
                                <Form.Control
                                  type="text"
                                  name="businessType"
                                  value={formData.businessType}
                                  onChange={handleChange}
                                  placeholder="Please specify your business type"
                                  className={`form-input mt-2 ${errors.businessType ? 'is-invalid' : ''}`}
                                  maxLength={30}
                                />
                              )}
                              {errors.businessType && (
                                <Form.Control.Feedback type="invalid">
                                  {errors.businessType}
                                </Form.Control.Feedback>
                              )}
                            </Form.Group>
                          </Col>

                          <Col md={6}>
                            <Form.Group>
                              <Form.Label className="form-label">
                                Company Type <span className="required">*</span>
                              </Form.Label>
                              <Form.Select
                                name="agentCategoryId"
                                value={formData.agentCategoryId}
                                onChange={handleChange}
                                className={`form-input ${errors.agentCategoryId ? 'is-invalid' : ''}`}
                              >
                                <option value="">Select company type</option>
                                {agentCategoryies.map((agent) => (
                                  <option key={agent.agentCategoryId} value={agent.agentCategoryId}>
                                    {agent.name}
                                  </option>
                                ))}
                              </Form.Select>
                              {errors.agentCategoryId && (
                                <Form.Control.Feedback type="invalid">
                                  {errors.agentCategoryId}
                                </Form.Control.Feedback>
                              )}
                            </Form.Group>
                          </Col>
                        </Row>

                        {/* Currency + Markup — mirrors the admin AgentReg
                            layout. Both were previously loaded silently but
                            never rendered, leaving new agents with
                            currency_id/markup_id null on the DB row, which
                            broke downstream room-list searches for anyone
                            registered through this page. */}
                        <Row>
                          <Col md={6}>
                            <Form.Group>
                              <Form.Label className="form-label">
                                Currency <span className="required">*</span>
                              </Form.Label>
                              <Form.Select
                                name="currency"
                                value={formData.currency}
                                onChange={handleChange}
                                className={`form-input ${errors.currency ? 'is-invalid' : ''}`}
                              >
                                <option value="">Select currency</option>
                                {Array.isArray(currencies) && currencies.map((c) => (
                                  <option key={c.currencyId} value={c.currencyId}>
                                    {c.currencyCode ? `${c.currencyCode} — ${c.name || ''}`.trim() : c.name}
                                  </option>
                                ))}
                              </Form.Select>
                              {errors.currency && (
                                <Form.Control.Feedback type="invalid">
                                  {errors.currency}
                                </Form.Control.Feedback>
                              )}
                            </Form.Group>
                          </Col>

                          {/*
                          <Col md={6}>
                            <Form.Group>
                              <Form.Label className="form-label">
                                Markup <span className="required">*</span>
                              </Form.Label>
                              <Form.Select
                                name="markup"
                                value={formData.markup}
                                onChange={handleChange}
                                className={`form-input ${errors.markup ? 'is-invalid' : ''}`}
                              >
                                <option value="">Select markup</option>
                                {Array.isArray(markupList) && markupList.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {formatMarkupOption(m)}
                                  </option>
                                ))}
                              </Form.Select>
                              {errors.markup && (
                                <Form.Control.Feedback type="invalid">
                                  {errors.markup}
                                </Form.Control.Feedback>
                              )}
                            </Form.Group>
                          </Col>
                          */}
                        </Row>
                      </div>

                      {/* Step 2: Contact Information */}
                      <div className={`form-step ${currentStep === 2 ? 'active' : ''}`}>
                        <div className="step-header">
                          <h3 className="step-title">
                            <svg width="24" height="24" fill="currentColor" viewBox="0 0 20 20" className="step-icon">
                              <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                              <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                            </svg>
                            Contact Information
                          </h3>
                          <p className="step-description">How can we reach you?</p>
                        </div>

                        <Row className="g-3">
                          <Col md={2}>
                            <Form.Group>
                              <Form.Label className="form-label">Salutation</Form.Label>
                              <Form.Select
                                name="salutation"
                                value={formData.salutation}
                                onChange={handleChange}
                                className="form-input"
                              >
                                <option value="">Select</option>
                                {SALUTATIONS.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </Form.Select>
                            </Form.Group>
                          </Col>

                          <Col md={5}>
                            <Form.Group>
                              <Form.Label className="form-label">
                                First Name <span className="required">*</span>
                              </Form.Label>
                              <Form.Control
                                type="text"
                                name="firstName"
                                value={formData.firstName}
                                onChange={handleChange}
                                placeholder="Enter first name"
                                className={`form-input ${errors.firstName ? 'is-invalid' : ''}`}
                                maxLength={15}
                              />
                              {errors.firstName && (
                                <Form.Control.Feedback type="invalid">
                                  {errors.firstName}
                                </Form.Control.Feedback>
                              )}
                            </Form.Group>
                          </Col>

                          <Col md={5}>
                            <Form.Group>
                              <Form.Label className="form-label">
                                Last Name <span className="required">*</span>
                              </Form.Label>
                              <Form.Control
                                type="text"
                                name="lastName"
                                value={formData.lastName}
                                onChange={handleChange}
                                placeholder="Enter last name"
                                className={`form-input ${errors.lastName ? 'is-invalid' : ''}`}
                                maxLength={15}
                              />
                              {errors.lastName && (
                                <Form.Control.Feedback type="invalid">
                                  {errors.lastName}
                                </Form.Control.Feedback>
                              )}
                            </Form.Group>
                          </Col>

                          <Col md={6}>
                            <Form.Group>
                              <Form.Label className="form-label">
                                Mobile Number <span className="required">*</span>
                              </Form.Label>
                              <Form.Control
                                type="tel"
                                name="mobileNumber"
                                value={formData.mobileNumber}
                                onChange={handleChange}
                                placeholder="Enter mobile number"
                                className={`form-input ${errors.mobileNumber ? 'is-invalid' : ''}`}
                                maxLength={15}
                              />
                              {errors.mobileNumber && (
                                <Form.Control.Feedback type="invalid">
                                  {errors.mobileNumber}
                                </Form.Control.Feedback>
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
                                name="personalEmail"
                                value={formData.personalEmail}
                                onChange={handleChange}
                                placeholder="Enter email address"
                                className={`form-input ${errors.personalEmail ? 'is-invalid' : ''}`}
                              />
                              {errors.personalEmail && (
                                <Form.Control.Feedback type="invalid">
                                  {errors.personalEmail}
                                </Form.Control.Feedback>
                              )}
                              {/* Live availability hint (agent.personal_email) — disabled per requirement. */}
                              {/*
                              {!errors.personalEmail && emailChecking && (
                                <div className="text-muted small mt-1">
                                  Checking availability…
                                </div>
                              )}
                              */}
                              {/*
                              {!errors.personalEmail &&
                                !emailChecking &&
                                emailExists && (
                                  <div className="text-danger small mt-1">
                                    An agent with this email already exists.
                                  </div>
                                )}
                              */}
                              {/*
                              {!errors.personalEmail &&
                                !emailChecking &&
                                !emailExists &&
                                /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
                                  (formData.personalEmail || "").trim(),
                                ) && (
                                  <div className="text-success small mt-1">
                                    Email is available.
                                  </div>
                                )}
                              */}
                            </Form.Group>
                          </Col>

                          {/* ── Trade License + Timezone ── */}
                          <Col md={4}>
                            <Form.Group>
                              <Form.Label className="form-label">Trade License No</Form.Label>
                              <Form.Control
                                type="text"
                                name="tradeLicenseNo"
                                value={formData.tradeLicenseNo}
                                onChange={handleChange}
                                placeholder="Enter trade license number"
                                className="form-input"
                                maxLength={80}
                              />
                            </Form.Group>
                          </Col>

                          <Col md={4}>
                            <Form.Group>
                              <Form.Label className="form-label">Trade License File</Form.Label>
                              <Form.Control
                                type="file"
                                accept="application/pdf,image/*"
                                onChange={handleTradeLicenseFile}
                                className={`form-input ${errors.tradeLicenseFile ? 'is-invalid' : ''}`}
                              />
                              {formData.tradeLicenseFileName && (
                                <div className="text-muted small mt-1">
                                  Selected: {formData.tradeLicenseFileName}
                                </div>
                              )}
                              {errors.tradeLicenseFile && (
                                <div className="text-danger small mt-1">
                                  {errors.tradeLicenseFile}
                                </div>
                              )}
                            </Form.Group>
                          </Col>

                          <Col md={4}>
                            <Form.Group>
                              <Form.Label className="form-label">Trade License Expiry</Form.Label>
                              <Form.Control
                                type="date"
                                name="tradeLicenseExpiry"
                                value={formData.tradeLicenseExpiry}
                                onChange={handleChange}
                                className="form-input"
                              />
                            </Form.Group>
                          </Col>

                          <Col md={6}>
                            <Form.Group>
                              <Form.Label className="form-label">VAT Number</Form.Label>
                              <Form.Control
                                type="text"
                                name="vatNumber"
                                value={formData.vatNumber}
                                onChange={handleChange}
                                placeholder="Enter VAT number"
                                className="form-input"
                                maxLength={80}
                              />
                            </Form.Group>
                          </Col>

                          <Col md={6}>
                            <Form.Group>
                              <Form.Label className="form-label">
                                Timezone <span className="required">*</span>
                              </Form.Label>
                              {/* Searchable timezone dropdown. react-select's
                                  built-in filter matches on the visible label
                                  (display name / IANA id / offset), so a user
                                  can type "IST", "kolkata", or "+05:30" and
                                  find the same row. Selection updates the
                                  same `timezone` form field with the IANA
                                  zoneId, so the backend contract is unchanged. */}
                              <Select
                                inputId="timezone"
                                name="timezone"
                                classNamePrefix="reg-select"
                                isSearchable
                                isClearable
                                placeholder="Search timezone..."
                                /* Render the menu into <body> so it isn't
                                   clipped by the card / step's overflow. Fixed
                                   position lets it float freely, and the high
                                   z-index keeps it above the sticky header. */
                                menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                                menuPosition="fixed"
                                menuPlacement="auto"
                                maxMenuHeight={280}
                                options={timezones.map((tz) => ({
                                  value: tz.zoneId,
                                  label: tz.displayName
                                    ? `${tz.displayName} (${tz.utcOffset || tz.zoneId})`
                                    : tz.zoneId,
                                }))}
                                value={
                                  timezones
                                    .map((tz) => ({
                                      value: tz.zoneId,
                                      label: tz.displayName
                                        ? `${tz.displayName} (${tz.utcOffset || tz.zoneId})`
                                        : tz.zoneId,
                                    }))
                                    .find(
                                      (opt) => String(opt.value) === String(formData.timezone),
                                    ) || null
                                }
                                onChange={(opt) =>
                                  handleChange({
                                    target: { name: "timezone", value: opt ? String(opt.value) : "" },
                                  })
                                }
                                className={errors.timezone ? "is-invalid" : ""}
                                styles={{
                                  control: (base, state) => ({
                                    ...base,
                                    minHeight: 44,
                                    borderRadius: 11,
                                    borderWidth: 1.5,
                                    borderColor: errors.timezone ? "#EC0B43" : (state.isFocused ? "#EC0B43" : "#E5E5E1"),
                                    backgroundColor: state.isFocused ? "#fff" : "#FAFAF8",
                                    boxShadow: state.isFocused
                                      ? "0 0 0 4px rgba(236, 11, 67, .12)"
                                      : "none",
                                    fontSize: "0.92rem",
                                    fontFamily: "inherit",
                                  }),
                                  placeholder: (b) => ({ ...b, color: "#A8A8A3", fontWeight: 400 }),
                                  menu: (b) => ({ ...b, borderRadius: 11, overflow: "hidden" }),
                                  menuPortal: (b) => ({ ...b, zIndex: 9999 }),
                                  option: (b, s) => ({
                                    ...b,
                                    backgroundColor: s.isSelected
                                      ? "#EC0B43"
                                      : s.isFocused
                                        ? "#FDE7ED"
                                        : "#fff",
                                    color: s.isSelected ? "#fff" : "#15171C",
                                    fontSize: "0.92rem",
                                  }),
                                }}
                              />
                              {errors.timezone && (
                                <div className="invalid-feedback d-block">{errors.timezone}</div>
                              )}
                            </Form.Group>
                          </Col>
                        </Row>
                      </div>

                      {/* Step 3: Location */}
                      <div className={`form-step ${currentStep === 3 ? 'active' : ''}`}>
                        <div className="step-header">
                          <h3 className="step-title">
                            <svg width="24" height="24" fill="currentColor" viewBox="0 0 20 20" className="step-icon">
                              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                            </svg>
                            Location Details
                          </h3>
                          <p className="step-description">Where are you located?</p>
                        </div>

                        <Row className="g-3">
                          <Col md={4}>
                            <Form.Group>
                              <Form.Label className="form-label">
                                Country <span className="required">*</span>
                              </Form.Label>
                              {/* Searchable country dropdown — uses the existing /api/country data
                                  (loaded into `countries`). react-select's built-in filter searches
                                  by typed terms; selection still updates `countryId` via handleChange,
                                  so cascading province/city logic is unchanged. */}
                              <Select
                                inputId="countryId"
                                name="countryId"
                                classNamePrefix="reg-select"
                                isSearchable
                                isClearable
                                placeholder="Search country..."
                                /* Backend handles filtering via /api/country?search=...
                                   so we disable react-select's local filter to show the
                                   server's results verbatim. */
                                filterOption={null}
                                options={countries.map((c) => ({ value: c.id, label: c.name }))}
                                value={
                                  countries
                                    .map((c) => ({ value: c.id, label: c.name }))
                                    .find((opt) => String(opt.value) === String(formData.countryId)) || null
                                }
                                /* Refetch on every keystroke, debounced 300ms.
                                   `action` is 'input-change' when the user types;
                                   ignore 'menu-close'/'set-value' so the list isn't
                                   refetched when the dropdown closes after a pick. */
                                onInputChange={(value, meta) => {
                                  // Whatever we return becomes the input text —
                                  // remember it so onMenuOpen can re-query for
                                  // the SAME text instead of the full list.
                                  countrySearchText.current = value || "";
                                  if (meta.action !== "input-change") return value;
                                  if (countrySearchTimer.current) clearTimeout(countrySearchTimer.current);
                                  countrySearchTimer.current = setTimeout(() => {
                                    countryList(value);
                                  }, 300);
                                  return value;
                                }}
                                onMenuOpen={() => {
                                  // Refresh the list when the menu opens (helps
                                  // after a previous filtered search). Query
                                  // for the text currently typed, if any: a
                                  // blank query here used to wipe the filtered
                                  // results while "United Arab" was still in
                                  // the box, so the agent saw the whole list.
                                  if (countrySearchTimer.current) clearTimeout(countrySearchTimer.current);
                                  countryList(countrySearchText.current);
                                }}
                                onChange={(opt) =>
                                  handleChange({
                                    target: { name: "countryId", value: opt ? String(opt.value) : "" },
                                  })
                                }
                                className={errors.countryId ? "is-invalid" : ""}
                                styles={{
                                  control: (base, state) => ({
                                    ...base,
                                    minHeight: 44,
                                    borderRadius: 11,
                                    borderWidth: 1.5,
                                    borderColor: errors.countryId ? "#EC0B43" : (state.isFocused ? "#EC0B43" : "#E5E5E1"),
                                    backgroundColor: state.isFocused ? "#fff" : "#FAFAF8",
                                    boxShadow: state.isFocused ? "0 0 0 4px rgba(236, 11, 67, .12)" : "none",
                                    fontSize: "0.92rem",
                                    fontFamily: "inherit",
                                  }),
                                  placeholder: (b) => ({ ...b, color: "#A8A8A3", fontWeight: 400 }),
                                  menu: (b) => ({ ...b, borderRadius: 11, overflow: "hidden", zIndex: 30 }),
                                  option: (b, s) => ({
                                    ...b,
                                    backgroundColor: s.isSelected ? "#EC0B43" : (s.isFocused ? "#FDE7ED" : "#fff"),
                                    color: s.isSelected ? "#fff" : "#15171C",
                                    fontSize: "0.92rem",
                                  }),
                                }}
                              />
                              {errors.countryId && (
                                <div className="invalid-feedback d-block">{errors.countryId}</div>
                              )}
                            </Form.Group>
                          </Col>

                          <Col md={4}>
                            <Form.Group>
                              <Form.Label className="form-label">
                                City <span className="required">*</span>
                              </Form.Label>
                              {/* Searchable city dropdown — provinces are
                                  preloaded for the chosen country, so we let
                                  react-select filter locally by typed text.
                                  Selection still updates `provinceId` via
                                  handleChange so the cascading place logic is
                                  unchanged. */}
                              <Select
                                inputId="provinceId"
                                name="provinceId"
                                classNamePrefix="reg-select"
                                isSearchable
                                isClearable
                                isDisabled={!formData.countryId}
                                placeholder="Search city..."
                                options={
                                  Array.isArray(provinces)
                                    ? provinces.map((p) => ({
                                        value: p.id,
                                        label: p.stateName,
                                      }))
                                    : []
                                }
                                value={
                                  (Array.isArray(provinces) ? provinces : [])
                                    .map((p) => ({ value: p.id, label: p.stateName }))
                                    .find(
                                      (opt) =>
                                        String(opt.value) ===
                                        String(formData.provinceId),
                                    ) || null
                                }
                                onChange={(opt) =>
                                  handleChange({
                                    target: {
                                      name: "provinceId",
                                      value: opt ? String(opt.value) : "",
                                    },
                                  })
                                }
                                className={errors.provinceId ? "is-invalid" : ""}
                                styles={{
                                  control: (base, state) => ({
                                    ...base,
                                    minHeight: 44,
                                    borderRadius: 11,
                                    borderWidth: 1.5,
                                    borderColor: errors.provinceId
                                      ? "#EC0B43"
                                      : state.isFocused
                                      ? "#EC0B43"
                                      : "#E5E5E1",
                                    backgroundColor: state.isFocused ? "#fff" : "#FAFAF8",
                                    boxShadow: state.isFocused
                                      ? "0 0 0 4px rgba(236, 11, 67, .12)"
                                      : "none",
                                    fontSize: "0.92rem",
                                    fontFamily: "inherit",
                                  }),
                                  placeholder: (b) => ({
                                    ...b,
                                    color: "#A8A8A3",
                                    fontWeight: 400,
                                  }),
                                  menu: (b) => ({
                                    ...b,
                                    borderRadius: 11,
                                    overflow: "hidden",
                                    zIndex: 30,
                                  }),
                                  option: (b, s) => ({
                                    ...b,
                                    backgroundColor: s.isSelected
                                      ? "#EC0B43"
                                      : s.isFocused
                                      ? "#FDE7ED"
                                      : "#fff",
                                    color: s.isSelected ? "#fff" : "#15171C",
                                    fontSize: "0.92rem",
                                  }),
                                }}
                              />
                              {errors.provinceId && (
                                <div className="invalid-feedback d-block">
                                  {errors.provinceId}
                                </div>
                              )}
                            </Form.Group>
                          </Col>

                          <Col md={4}>
                            <Form.Group>
                              <Form.Label className="form-label">
                                Location
                              </Form.Label>
                              <Form.Select
                                name="placeId"
                                value={formData.placeId}
                                onChange={handleChange}
                                disabled={!formData.provinceId}
                                className={`form-input ${errors.placeId ? 'is-invalid' : ''}`}
                              >
                                <option value="">Select location</option>
                                {Array.isArray(places) &&
                                  places.map((place) => (
                                    <option key={place.id} value={place.id}>
                                      {place.name}
                                    </option>
                                  ))}
                              </Form.Select>
                              {errors.placeId && (
                                <Form.Control.Feedback type="invalid">
                                  {errors.placeId}
                                </Form.Control.Feedback>
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
                                className={`form-input ${errors.address ? 'is-invalid' : ''}`}
                              />
                              {errors.address && (
                                <Form.Control.Feedback type="invalid">
                                  {errors.address}
                                </Form.Control.Feedback>
                              )}
                            </Form.Group>
                          </Col>
                        </Row>
                      </div>

                      {/* Step 4: Account — login credentials for the agent portal.
                          Backend creates a pending agent_external_registration
                          record; an admin approves it on /admin/approval/agents. */}
                      <div className={`form-step ${currentStep === 4 ? 'active' : ''}`}>
                        <div className="step-header">
                          <h3 className="step-title">
                            <svg width="24" height="24" fill="currentColor" viewBox="0 0 20 20" className="step-icon">
                              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                            </svg>
                            Account Credentials
                          </h3>
                          <p className="step-description">Choose the username and password you will use to sign in once your account is approved.</p>
                        </div>
                        <Row className="g-3">
                          <Col xs={12}>
                            <Form.Group>
                              <Form.Label className="form-label">
                                Username <span className="required">*</span>
                              </Form.Label>
                              <Form.Control
                                type="text"
                                name="username"
                                value={formData.username}
                                onChange={handleChange}
                                placeholder="Enter a username (min 4 chars, letters/digits/underscore)"
                                className={`form-input ${errors.username ? 'is-invalid' : ''}`}
                                autoComplete="new-password"
                                maxLength={30}
                              />
                              {errors.username && (
                                <Form.Control.Feedback type="invalid">
                                  {errors.username}
                                </Form.Control.Feedback>
                              )}
                            </Form.Group>
                          </Col>
                          <Col md={6}>
                            <Form.Group>
                              <Form.Label className="form-label">
                                Password <span className="required">*</span>
                              </Form.Label>
                              <div className="position-relative">
                                <Form.Control
                                  type={showPassword ? "text" : "password"}
                                  name="password"
                                  value={formData.password}
                                  onChange={handleChange}
                                  placeholder="Min 8 chars, 1 uppercase, 1 number"
                                  className={`form-input ${errors.password ? 'is-invalid' : ''}`}
                                  autoComplete="new-password"
                                  style={{ paddingRight: 40 }}
                                />
                                <button
                                  type="button"
                                  className="btn btn-link position-absolute top-50 end-0 translate-middle-y"
                                  style={{ border: "none", background: "none", color: "#6c757d", padding: "0 12px", zIndex: 10 }}
                                  onClick={() => setShowPassword((s) => !s)}
                                  tabIndex={-1}
                                >
                                  {showPassword ? (
                                    <i className="fas fa-eye-slash"></i>
                                  ) : (
                                    <i className="fas fa-eye"></i>
                                  )}
                                </button>
                              </div>
                              {errors.password && (
                                <div className="text-danger small mt-1">{errors.password}</div>
                              )}
                            </Form.Group>
                          </Col>
                          <Col md={6}>
                            <Form.Group>
                              <Form.Label className="form-label">
                                Re-enter Password <span className="required">*</span>
                              </Form.Label>
                              <div className="position-relative">
                                <Form.Control
                                  type={showRePassword ? "text" : "password"}
                                  name="repassword"
                                  value={formData.repassword}
                                  onChange={handleChange}
                                  placeholder="Confirm password"
                                  className={`form-input ${errors.repassword ? 'is-invalid' : ''}`}
                                  autoComplete="new-password"
                                  style={{ paddingRight: 40 }}
                                />
                                <button
                                  type="button"
                                  className="btn btn-link position-absolute top-50 end-0 translate-middle-y"
                                  style={{ border: "none", background: "none", color: "#6c757d", padding: "0 12px", zIndex: 10 }}
                                  onClick={() => setShowRePassword((s) => !s)}
                                  tabIndex={-1}
                                >
                                  {showRePassword ? (
                                    <i className="fas fa-eye-slash"></i>
                                  ) : (
                                    <i className="fas fa-eye"></i>
                                  )}
                                </button>
                              </div>
                              {errors.repassword && (
                                <div className="text-danger small mt-1">{errors.repassword}</div>
                              )}
                            </Form.Group>
                          </Col>
                        </Row>
                        <div className="alert alert-info mt-3 mb-0" style={{ fontSize: "0.85rem" }}>
                          After you submit, an administrator will review your registration. Once approved, you can sign in using the credentials chosen above.
                        </div>
                      </div>

                      {/* Step 5: Finance Manager & GM Details + Incentive Claim Preferences */}
                      <div className={`form-step ${currentStep === 5 ? 'active' : ''}`}>
                        <div className="step-header">
                          <h3 className="step-title">
                            <svg width="24" height="24" fill="currentColor" viewBox="0 0 20 20" className="step-icon">
                              <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                            </svg>
                            Finance Manager &amp; GM Details
                          </h3>
                          <p className="step-description">Add the contacts the backend needs for incentives, finance and management communication.</p>
                        </div>

                        {/* ── Finance Manager ── */}
                        <h5 className="mt-2 mb-3" style={{ fontSize: "1rem", fontWeight: 600, color: "#3E3E3B", letterSpacing: "-0.01em" }}>Finance Manager</h5>
                        <Row className="g-3">
                          <Col md={4}>
                            <Form.Group>
                              <Form.Label className="form-label">
                                Name <span className="required">*</span>
                              </Form.Label>
                              <Form.Control
                                type="text"
                                name="financeManagerName"
                                value={formData.financeManagerName}
                                onChange={handleChange}
                                placeholder="Enter finance manager name"
                                className={`form-input ${errors.financeManagerName ? 'is-invalid' : ''}`}
                              />
                              {errors.financeManagerName && (
                                <Form.Control.Feedback type="invalid">{errors.financeManagerName}</Form.Control.Feedback>
                              )}
                            </Form.Group>
                          </Col>
                          <Col md={4}>
                            <Form.Group>
                              <Form.Label className="form-label">
                                Contact No <span className="required">*</span>
                              </Form.Label>
                              <Form.Control
                                type="tel"
                                name="financeManagerContactNo"
                                value={formData.financeManagerContactNo}
                                onChange={handleChange}
                                placeholder="Enter contact number"
                                className={`form-input ${errors.financeManagerContactNo ? 'is-invalid' : ''}`}
                              />
                              {errors.financeManagerContactNo && (
                                <Form.Control.Feedback type="invalid">{errors.financeManagerContactNo}</Form.Control.Feedback>
                              )}
                            </Form.Group>
                          </Col>
                          <Col md={4}>
                            <Form.Group>
                              <Form.Label className="form-label">
                                Email <span className="required">*</span>
                              </Form.Label>
                              <Form.Control
                                type="email"
                                name="financeManagerEmail"
                                value={formData.financeManagerEmail}
                                onChange={handleChange}
                                placeholder="Enter finance manager email"
                                className={`form-input ${errors.financeManagerEmail ? 'is-invalid' : ''}`}
                              />
                              {errors.financeManagerEmail && (
                                <Form.Control.Feedback type="invalid">{errors.financeManagerEmail}</Form.Control.Feedback>
                              )}
                            </Form.Group>
                          </Col>
                        </Row>

                        {/* ── General Manager ── */}
                        <h5 className="mt-4 mb-3" style={{ fontSize: "1rem", fontWeight: 600, color: "#3E3E3B", letterSpacing: "-0.01em" }}>GM (General Manager)</h5>
                        <Row className="g-3">
                          <Col md={4}>
                            <Form.Group>
                              <Form.Label className="form-label">
                                Name <span className="required">*</span>
                              </Form.Label>
                              <Form.Control
                                type="text"
                                name="gmName"
                                value={formData.gmName}
                                onChange={handleChange}
                                placeholder="Enter GM name"
                                className={`form-input ${errors.gmName ? 'is-invalid' : ''}`}
                              />
                              {errors.gmName && (
                                <Form.Control.Feedback type="invalid">{errors.gmName}</Form.Control.Feedback>
                              )}
                            </Form.Group>
                          </Col>
                          <Col md={4}>
                            <Form.Group>
                              <Form.Label className="form-label">
                                Contact No <span className="required">*</span>
                              </Form.Label>
                              <Form.Control
                                type="tel"
                                name="gmContactNo"
                                value={formData.gmContactNo}
                                onChange={handleChange}
                                placeholder="Enter GM contact number"
                                className={`form-input ${errors.gmContactNo ? 'is-invalid' : ''}`}
                              />
                              {errors.gmContactNo && (
                                <Form.Control.Feedback type="invalid">{errors.gmContactNo}</Form.Control.Feedback>
                              )}
                            </Form.Group>
                          </Col>
                          <Col md={4}>
                            <Form.Group>
                              <Form.Label className="form-label">
                                Email <span className="required">*</span>
                              </Form.Label>
                              <Form.Control
                                type="email"
                                name="gmEmail"
                                value={formData.gmEmail}
                                onChange={handleChange}
                                placeholder="Enter GM email"
                                className={`form-input ${errors.gmEmail ? 'is-invalid' : ''}`}
                              />
                              {errors.gmEmail && (
                                <Form.Control.Feedback type="invalid">{errors.gmEmail}</Form.Control.Feedback>
                              )}
                            </Form.Group>
                          </Col>
                        </Row>

                        {/* ── Incentive Claim Preferences — hidden by request
                             (code retained; field stays empty). ── */}
                        {false && (
                          <>
                            <h5 className="mt-4 mb-3" style={{ fontSize: "1rem", fontWeight: 600, color: "#3E3E3B", letterSpacing: "-0.01em" }}>Incentive Claim Preferences</h5>
                            <Row className="g-3">
                              <Col md={6}>
                                <Form.Group>
                                  <Form.Label className="form-label">Preferred Incentive Claim Method</Form.Label>
                                  <Form.Select
                                    name="preferredClaimMethod"
                                    value={formData.preferredClaimMethod}
                                    onChange={handleChange}
                                    className="form-input"
                                  >
                                    <option value="">Select method</option>
                                    <option value="CREDIT_LIMIT">Add to Credit Limit</option>
                                    <option value="BANK_TRANSFER">Transfer to Bank Account</option>
                                  </Form.Select>
                                </Form.Group>
                              </Col>
                            </Row>
                          </>
                        )}
                      </div>

                      {/* Step 6: GST Details (India only) */}
                      {formData.countryId === "1" && (
                        <div className={`form-step ${currentStep === 6 ? 'active' : ''}`}>
                          <div className="step-header">
                            <h3 className="step-title">
                              <svg width="24" height="24" fill="currentColor" viewBox="0 0 20 20" className="step-icon">
                                <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                              </svg>
                              GST Information
                            </h3>
                            <p className="step-description">Tax registration details for Indian businesses</p>
                          </div>

                          <Row className="g-3">
                            <Col md={6}>
                              <Form.Group>
                                <Form.Label className="form-label">
                                  Agency Classification
                                </Form.Label>
                                <Form.Select
                                  name="agentClassification"
                                  value={formData.agentClassification}
                                  onChange={handleChange}
                                  className="form-input"
                                >
                                  <option value="registered">Registered</option>
                                  <option value="unregistered">Unregistered</option>
                                </Form.Select>
                              </Form.Group>
                            </Col>

                            <Col md={6}>
                              <Form.Group>
                                <Form.Label className="form-label">
                                  GSTIN <span className="required">*</span>
                                </Form.Label>
                                <Form.Control
                                  type="text"
                                  name="agentGstIn"
                                  value={formData.agentGstIn}
                                  onChange={handleChange}
                                  placeholder="Enter 15-digit GSTIN"
                                  className={`form-input ${errors.agentGstIn ? 'is-invalid' : ''}`}
                                  maxLength={15}
                                />
                                {errors.agentGstIn && (
                                  <Form.Control.Feedback type="invalid">
                                    {errors.agentGstIn}
                                  </Form.Control.Feedback>
                                )}
                              </Form.Group>
                            </Col>

                            <Col md={6}>
                              <Form.Group>
                                <Form.Label className="form-label">
                                  Provisional GST Number
                                </Form.Label>
                                <Form.Control
                                  type="text"
                                  name="agentProvisionalGstno"
                                  value={formData.agentProvisionalGstno}
                                  onChange={handleChange}
                                  placeholder="Enter provisional GST number"
                                  className="form-input"
                                  maxLength={30}
                                />
                              </Form.Group>
                            </Col>

                            <Col md={6}>
                              <Form.Group>
                                <Form.Label className="form-label">
                                  Correspondence Email
                                </Form.Label>
                                <Form.Control
                                  type="email"
                                  name="agentCorrespondmail"
                                  value={formData.agentCorrespondmail}
                                  onChange={handleChange}
                                  placeholder="Enter correspondence email"
                                  className={`form-input ${errors.agentCorrespondmail ? 'is-invalid' : ''}`}
                                />
                                {errors.agentCorrespondmail && (
                                  <Form.Control.Feedback type="invalid">
                                    {errors.agentCorrespondmail}
                                  </Form.Control.Feedback>
                                )}
                              </Form.Group>
                            </Col>

                            <Col md={6}>
                              <Form.Group>
                                <Form.Label className="form-label">
                                  GST Registration Status
                                </Form.Label>
                                <Form.Control
                                  type="text"
                                  name="agentRegisterstatus"
                                  value={formData.agentRegisterstatus}
                                  onChange={handleChange}
                                  placeholder="Enter registration status"
                                  className="form-input"
                                  maxLength={30}
                                />
                              </Form.Group>
                            </Col>

                            <Col md={6}>
                              <Form.Group>
                                <Form.Label className="form-label">
                                  HSN/SAC Code
                                </Form.Label>
                                <Form.Control
                                  type="text"
                                  name="agentHsncode"
                                  value={formData.agentHsncode}
                                  onChange={handleChange}
                                  placeholder="Enter HSN/SAC code"
                                  className="form-input"
                                  maxLength={30}
                                />
                              </Form.Group>
                            </Col>
                          </Row>
                        </div>
                      )}

                      {/* Form Actions */}
                      <div className="form-actions">
                        <div className="d-flex justify-content-between align-items-center">
                          <div className="form-info">
                            <span className="required">*</span> Required fields
                          </div>
                          <div className="d-flex gap-3">
                            {currentStep > 1 && (
                              <Button
                                type="button"
                                variant="outline-secondary"
                                size="lg"
                                onClick={() => setCurrentStep(currentStep - 1)}
                                className="nav-button"
                              >
                                <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20" className="me-2">
                                  <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                                Previous
                              </Button>
                            )}
                            {currentStep < 5 && (
                              <Button
                                type="button"
                                variant="outline-primary"
                                size="lg"
                                onClick={handleNextStep}
                                className="nav-button"
                              >
                                Next
                                <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20" className="ms-2">
                                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                </svg>
                              </Button>
                            )}
                            {currentStep === 5 && formData.countryId === "1" && (
                              <Button
                                type="button"
                                variant="outline-primary"
                                size="lg"
                                onClick={handleNextStep}
                                className="nav-button"
                              >
                                Next
                                <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20" className="ms-2">
                                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                </svg>
                              </Button>
                            )}
                            {currentStep === 5 && formData.countryId !== "1" && (
                              <Button
                                type="submit"
                                variant="primary"
                                size="lg"
                                disabled={isSubmitting}
                                className="submit-button"
                              >
                                {isSubmitting ? (
                                  <>
                                    <svg className="spinner me-2" width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                                    </svg>
                                    Creating Account...
                                  </>
                                ) : (
                                  <>
                                    <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20" className="me-2">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                    Create Account
                                  </>
                                )}
                              </Button>
                            )}
                            {currentStep === 6 && formData.countryId === "1" && (
                              <Button
                                type="submit"
                                variant="primary"
                                size="lg"
                                disabled={isSubmitting}
                                className="submit-button"
                              >
                                {isSubmitting ? (
                                  <>
                                    <svg className="spinner me-2" width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                                    </svg>
                                    Creating Account...
                                  </>
                                ) : (
                                  <>
                                    <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20" className="me-2">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                    Create Account
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card.Body>
                  </Card>
                </Form>
              </div>
            </>
          )}
        </div>
      </Container >
    </div >
  );
};

export default Register;
