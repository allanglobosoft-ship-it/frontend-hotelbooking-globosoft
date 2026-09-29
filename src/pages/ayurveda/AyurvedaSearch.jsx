import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Container,
  Row,
  Col,
  Card,
  Button,
  Form,
  Tabs,
  Tab,
  Badge,
  Modal,
  Spinner,
  InputGroup,
} from "react-bootstrap";
import {
  FaLeaf,
  FaSpa,
  FaUserMd,
  FaBookOpen,
  FaSearch,
  FaCalendarAlt,
  FaCheckCircle,
  FaInfoCircle,
  FaPlus,
  FaTimes,
  FaShoppingBag,
  FaEnvelopeOpenText,
  FaEye,
  FaUser,
  FaPhone,
  FaEnvelope,
  FaVenusMars,
  FaBirthdayCake,
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import AgentSelect from "../../components/AgentSelect";
import toast from "react-hot-toast";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import QuotationPdfCard from "../../components/quotation/QuotationPdfCard";
import "../../styles/Ayurveda.css";

const AYURVEDA_API = "/api/v1/ayurveda";

const getUserId = () => {
  const raw = localStorage.getItem("userId");
  const parsed = raw && raw !== "null" ? Number(raw) : null;
  return Number.isFinite(parsed) ? parsed : 1; // fallback dev default
};

const tomorrowISO = () =>
  new Date(Date.now() + 86400000).toISOString().slice(0, 10);

// Image URL fields on package/course are stored as comma-separated lists.
// These helpers normalize the value so the rest of the UI can stay simple.
const splitImageUrls = (raw) =>
  (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const firstImageUrl = (raw) => splitImageUrls(raw)[0] || "";

// Renders price block. When the backend has applied an agent markup
// it returns `displayPrice` and `markupAmount` alongside the base
// price; we show both so the agent knows their take-home margin.
const PriceBlock = ({ item }) => {
  const base = item.price;
  const display = item.displayPrice;
  if (display != null && Number(display) !== Number(base)) {
    return (
      <span className="ayurveda-card-price">
        ₹{display}
        <div className="ayurveda-card-base-price">
          base ₹{base}
          {item.markupAmount != null && <> · markup ₹{item.markupAmount}</>}
          {item.markupType === "PERCENT" && item.markupValue != null && (
            <> ({item.markupValue}%)</>
          )}
        </div>
      </span>
    );
  }
  return <span className="ayurveda-card-price">₹{base}</span>;
};

const EMPTY_CUSTOMER = {
  customerName: "",
  customerAge: "",
  customerPhone: "",
  customerEmail: "",
  customerGender: "",
};

const sanitizeCustomer = (c) => ({
  customerName: c.customerName?.trim() || null,
  customerAge: c.customerAge ? Number(c.customerAge) : null,
  customerPhone: c.customerPhone?.trim() || null,
  customerEmail: c.customerEmail?.trim() || null,
  customerGender: c.customerGender || null,
});

// ----- Quotation PDF helpers -----
// Quotes are priced like the booking modals' "Estimated Total": price per
// person x participants, the amount the booking is created at.
const QUOTE_TYPE_LABELS = {
  package: "Ayurveda Package",
  consultation: "Doctor Consultation",
  course: "Course",
};

const quoteText = (v) =>
  typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();

// "2026-10-01" -> "1 Oct 2026"; anything else is shown as given.
const quoteDate = (value) => {
  const s = quoteText(value);
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
  const d = new Date(`${s.slice(0, 10)}T00:00:00`);
  return isNaN(d.getTime())
    ? s
    : d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
};

// "09:00:00" -> "09:00"
const quoteTime = (value) => {
  const s = quoteText(value);
  return /^\d{2}:\d{2}:\d{2}$/.test(s) ? s.slice(0, 5) : s;
};

// Participants as the booking will use them: blank means 1; anything else
// must be a whole number of at least 1 (null otherwise).
const quoteParticipants = (value) => {
  const n = value === "" || value == null ? 1 : Number(value);
  return Number.isInteger(n) && n >= 1 ? n : null;
};

const quoteItemName = (type, item) =>
  quoteText(
    type === "package"
      ? item.packageName
      : type === "consultation"
      ? item.doctorName
      : item.courseName
  ) || QUOTE_TYPE_LABELS[type];

// Key facts of a package / consultation / course, as on View Details.
const quoteItemDetails = (type, item) => {
  if (type === "package") {
    return [
      { label: "Category", value: quoteText(item.category) },
      {
        label: "Duration",
        value: item.durationDays ? `${item.durationDays} days` : "",
      },
    ];
  }
  if (type === "consultation") {
    return [
      { label: "Specialization", value: quoteText(item.specialization) },
      { label: "Qualification", value: quoteText(item.qualification) },
      {
        label: "Experience",
        value:
          item.experienceYears != null ? `${item.experienceYears} years` : "",
      },
    ];
  }
  return [
    { label: "Instructor", value: quoteText(item.instructorName) },
    {
      label: "Duration",
      value: item.durationWeeks ? `${item.durationWeeks} weeks` : "",
    },
    { label: "Course Level", value: quoteText(item.courseLevel) },
    { label: "Course Start Date", value: quoteDate(item.startDate) },
    { label: "Course End Date", value: quoteDate(item.endDate) },
  ];
};

const quoteItemInclusions = (type, item) => {
  if (type === "package") {
    return [
      item.isAllInclusive ? "All-inclusive package" : "",
      quoteText(item.treatmentsIncluded)
        ? `Treatments: ${quoteText(item.treatmentsIncluded)}`
        : "",
      item.includesYoga ? "Yoga" : "",
      item.includesMeditation ? "Meditation" : "",
      item.includesDining ? "Dining" : "",
    ].filter(Boolean);
  }
  if (type === "course" && item.certificationIncluded) {
    return ["Course certification"];
  }
  return [];
};

// Price lines at 2 decimals plus their total; a rounding cent, if any, goes
// on the largest line so the lines add up to the total.
const quoteLinesAndTotal = (rawItems) => {
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const totalAmount = round2(rawItems.reduce((sum, it) => sum + it.amount, 0));
  const priceItems = rawItems.map((it) => ({ ...it, amount: round2(it.amount) }));
  const residue = round2(
    totalAmount - priceItems.reduce((sum, it) => sum + it.amount, 0)
  );
  if (residue !== 0 && priceItems.length > 0) {
    let largest = 0;
    priceItems.forEach((it, i) => {
      if (it.amount > priceItems[largest].amount) largest = i;
    });
    priceItems[largest] = {
      ...priceItems[largest],
      amount: round2(priceItems[largest].amount + residue),
    };
  }
  return { priceItems, totalAmount };
};

const AyurvedaSearch = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("packages");

  // Listings
  const [packages, setPackages] = useState([]);
  const [consultations, setConsultations] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [packageCategory, setPackageCategory] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [keyword, setKeyword] = useState("");
  const [allInclusiveOnly, setAllInclusiveOnly] = useState(false);

  const [courseLevel, setCourseLevel] = useState("");
  const [consultationStartDate, setConsultationStartDate] = useState("");
  const [consultationEndDate, setConsultationEndDate] = useState("");

  // Destination (city) filter — shared across all 3 tabs
  const [destinationCityId, setDestinationCityId] = useState("");
  const [cityOptions, setCityOptions] = useState([]);

  // Agent — when set, the backend applies the agent's markup to every
  // listed price and we display both the original and marked-up rate.
  const [agentId, setAgentId] = useState("");
  const [agents, setAgents] = useState([]);

  // Single booking modal
  const [bookingTarget, setBookingTarget] = useState(null);
  const [bookingForm, setBookingForm] = useState({});
  const [bookingCustomer, setBookingCustomer] = useState({ ...EMPTY_CUSTOMER });
  const [submitting, setSubmitting] = useState(false);

  // View details modal
  const [viewTarget, setViewTarget] = useState(null); // { type, item }

  // ===== Combo cart =====
  // Holds at most one of each type: { package, consultation, course }
  const [combo, setCombo] = useState({
    package: null,
    consultation: null,
    course: null,
  });
  const [showComboModal, setShowComboModal] = useState(false);
  const [comboForm, setComboForm] = useState({
    numberOfParticipants: 1,
    packageStartDate: tomorrowISO(),
    consultationPreferredDate: "",
    consultationPreferredTime: "",
    symptoms: "",
    specialRequests: "",
    previousExperience: "",
  });
  const [comboCustomer, setComboCustomer] = useState({ ...EMPTY_CUSTOMER });
  const [comboSubmitting, setComboSubmitting] = useState(false);

  // ===== Enquiry =====
  const [showEnquiryModal, setShowEnquiryModal] = useState(false);
  const [enquiryForm, setEnquiryForm] = useState({
    name: "",
    email: "",
    phone: "",
    healthConcern: "",
    preferredTreatment: "",
    travelStartDate: "",
    travelEndDate: "",
    numberOfPersons: 1,
    notes: "",
  });
  const [enquirySubmitting, setEnquirySubmitting] = useState(false);

  // ----- Loaders -----
  const loadPackages = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (packageCategory) params.category = packageCategory;
      if (minPrice) params.minPrice = minPrice;
      if (maxPrice) params.maxPrice = maxPrice;
      if (destinationCityId) params.cityId = destinationCityId;
      if (agentId) params.agentId = agentId;

      const url = allInclusiveOnly
        ? `${AYURVEDA_API}/packages/all-inclusive`
        : `${AYURVEDA_API}/packages`;
      const res = await axiosInstance.get(url, { params });
      let data = Array.isArray(res.data) ? res.data : [];
      if (keyword.trim()) {
        const q = keyword.trim().toLowerCase();
        data = data.filter(
          (p) =>
            p.packageName?.toLowerCase().includes(q) ||
            p.description?.toLowerCase().includes(q) ||
            p.treatmentsIncluded?.toLowerCase().includes(q)
        );
      }
      setPackages(data);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load packages");
    } finally {
      setLoading(false);
    }
  }, [packageCategory, minPrice, maxPrice, keyword, allInclusiveOnly, destinationCityId, agentId]);

  const loadConsultations = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (consultationStartDate) params.startDate = consultationStartDate;
      if (consultationEndDate) params.endDate = consultationEndDate;
      if (destinationCityId) params.cityId = destinationCityId;
      if (agentId) params.agentId = agentId;
      const res = await axiosInstance.get(`${AYURVEDA_API}/consultations/available`, {
        params,
      });
      let data = Array.isArray(res.data) ? res.data : [];
      if (keyword.trim()) {
        const q = keyword.trim().toLowerCase();
        data = data.filter(
          (c) =>
            c.doctorName?.toLowerCase().includes(q) ||
            c.specialization?.toLowerCase().includes(q)
        );
      }
      setConsultations(data);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load consultations");
    } finally {
      setLoading(false);
    }
  }, [consultationStartDate, consultationEndDate, keyword, destinationCityId, agentId]);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (courseLevel) params.courseLevel = courseLevel;
      if (minPrice) params.minPrice = minPrice;
      if (maxPrice) params.maxPrice = maxPrice;
      if (destinationCityId) params.cityId = destinationCityId;
      if (agentId) params.agentId = agentId;
      const res = await axiosInstance.get(`${AYURVEDA_API}/courses`, { params });
      let data = Array.isArray(res.data) ? res.data : [];
      if (keyword.trim()) {
        const q = keyword.trim().toLowerCase();
        data = data.filter(
          (c) =>
            c.courseName?.toLowerCase().includes(q) ||
            c.description?.toLowerCase().includes(q) ||
            c.instructorName?.toLowerCase().includes(q)
        );
      }
      setCourses(data);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load courses");
    } finally {
      setLoading(false);
    }
  }, [courseLevel, minPrice, maxPrice, keyword, destinationCityId, agentId]);

  useEffect(() => {
    if (activeTab === "packages") loadPackages();
    else if (activeTab === "consultations") loadConsultations();
    else if (activeTab === "courses") loadCourses();
  }, [activeTab, loadPackages, loadConsultations, loadCourses]);

  // Load the agent list once — used for the agent dropdown so the
  // search results can be priced with the agent's markup applied.
  useEffect(() => {
    axiosInstance
      .get("/api/agent?activeOnly=true")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : res.data?.content || [];
        setAgents(list);
      })
      .catch((e) => console.error("Failed to load agents", e));
  }, []);

  // Load destination (city/province) list once for the search dropdown.
  // `limit=10000` so the dropdown shows the full list instead of being
  // capped at the API's default page size.
  useEffect(() => {
    axiosInstance
      .get("/api/province?limit=10000")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setCityOptions(
          list
            .filter((c) => !c.isDeleted)
            .map((c) => ({
              id: c.id,
              label: c.country ? `${c.stateName}, ${c.country}` : c.stateName,
            }))
        );
      })
      .catch((e) => {
        console.error("Failed to load destinations", e);
      });
  }, []);

  // ----- Single booking modal -----
  const openBooking = (type, item) => {
    setBookingTarget({ type, item });
    setBookingCustomer({ ...EMPTY_CUSTOMER });
    if (type === "package") {
      setBookingForm({
        startDate: tomorrowISO(),
        numberOfParticipants: 1,
        specialRequests: "",
      });
    } else if (type === "consultation") {
      setBookingForm({
        preferredDate: item.consultationDate,
        preferredTimeSlot: item.startTime,
        numberOfParticipants: 1,
        symptoms: "",
      });
    } else if (type === "course") {
      setBookingForm({
        numberOfParticipants: 1,
        previousExperience: "",
      });
    }
  };

  const closeBooking = () => {
    setBookingTarget(null);
    setBookingForm({});
    setBookingCustomer({ ...EMPTY_CUSTOMER });
  };

  const setBookingField = (k, v) =>
    setBookingForm((prev) => ({ ...prev, [k]: v }));

  const setBookingCustomerField = (k, v) =>
    setBookingCustomer((prev) => ({ ...prev, [k]: v }));

  const setComboCustomerField = (k, v) =>
    setComboCustomer((prev) => ({ ...prev, [k]: v }));

  const validateCustomer = (c) => {
    if (!c.customerName?.trim()) {
      toast.error("Customer name is required");
      return false;
    }
    if (!c.customerPhone?.trim() && !c.customerEmail?.trim()) {
      toast.error("Provide phone or email for the customer");
      return false;
    }
    if (c.customerEmail?.trim() && !/^\S+@\S+\.\S+$/.test(c.customerEmail.trim())) {
      toast.error("Customer email is invalid");
      return false;
    }
    if (c.customerAge !== "" && c.customerAge != null) {
      const ageNum = Number(c.customerAge);
      if (!Number.isFinite(ageNum) || ageNum < 0 || ageNum > 130) {
        toast.error("Customer age looks invalid");
        return false;
      }
    }
    return true;
  };

  const submitBooking = async () => {
    if (!bookingTarget) return;
    const userId = getUserId();
    if (!userId) {
      toast.error("Please log in to book");
      return;
    }
    if (!validateCustomer(bookingCustomer)) return;

    setSubmitting(true);
    try {
      const customerPayload = sanitizeCustomer(bookingCustomer);
      let url = "";
      let payload = {};
      if (bookingTarget.type === "package") {
        url = `${AYURVEDA_API}/bookings/package`;
        payload = {
          packageId: bookingTarget.item.id,
          userId,
          startDate: bookingForm.startDate,
          numberOfParticipants: Number(bookingForm.numberOfParticipants) || 1,
          specialRequests: bookingForm.specialRequests || "",
          ...customerPayload,
        };
      } else if (bookingTarget.type === "consultation") {
        url = `${AYURVEDA_API}/consultations/book`;
        payload = {
          consultationId: bookingTarget.item.id,
          userId,
          symptoms: bookingForm.symptoms || "",
          preferredDate: bookingForm.preferredDate,
          preferredTimeSlot: bookingForm.preferredTimeSlot,
          numberOfParticipants: Number(bookingForm.numberOfParticipants) || 1,
          ...customerPayload,
        };
      } else if (bookingTarget.type === "course") {
        url = `${AYURVEDA_API}/courses/enroll`;
        payload = {
          courseId: bookingTarget.item.id,
          userId,
          previousExperience: bookingForm.previousExperience || "",
          numberOfParticipants: Number(bookingForm.numberOfParticipants) || 1,
          ...customerPayload,
        };
      }

      const res = await axiosInstance.post(url, payload);
      const booking = res.data;
      toast.success(`Booking confirmed! Ref: ${booking?.bookingReference || ""}`);
      closeBooking();
      navigate("/booking-details/ayurveda-booking-list");
    } catch (e) {
      console.error(e);
      const msg =
        e?.response?.data?.message ||
        e?.response?.data ||
        "Booking failed. Please verify the details.";
      toast.error(typeof msg === "string" ? msg : "Booking failed");
    } finally {
      setSubmitting(false);
    }
  };

  // ----- Combo helpers -----
  const isInCombo = (type, id) => combo[type]?.id === id;

  const toggleCombo = (type, item) => {
    setCombo((prev) => ({
      ...prev,
      [type]: prev[type]?.id === item.id ? null : item,
    }));
  };

  const removeFromCombo = (type) => {
    setCombo((prev) => ({ ...prev, [type]: null }));
  };

  const comboCount = useMemo(
    () => Object.values(combo).filter(Boolean).length,
    [combo]
  );

  // The centreId of the first item added to the combo "locks" the combo
  // to that centre. Subsequent cards from other centres still show the
  // "+ Combo" button but it's disabled with an explanatory tooltip.
  const lockedCentreId = useMemo(() => {
    const first =
      combo.package?.centreId ??
      combo.consultation?.centreId ??
      combo.course?.centreId ??
      null;
    return first ?? null;
  }, [combo]);

  // True if a card from the given centreId is allowed into the current
  // combo. Always true when no combo item is selected yet or when the
  // card itself has no centreId set (legacy data).
  const isAllowedInCombo = (cardCentreId) => {
    if (lockedCentreId == null) return true;
    if (cardCentreId == null) return false;
    return Number(cardCentreId) === Number(lockedCentreId);
  };

  const comboBaseTotal = useMemo(() => {
    const pkg = combo.package?.price ? Number(combo.package.price) : 0;
    const con = combo.consultation?.price
      ? Number(combo.consultation.price)
      : 0;
    const cur = combo.course?.price ? Number(combo.course.price) : 0;
    return pkg + con + cur;
  }, [combo]);

  const openComboModal = () => {
    if (comboCount < 2) {
      toast.error("Select at least 2 items to create a combo");
      return;
    }
    setComboForm((f) => ({
      ...f,
      numberOfParticipants: 1,
      packageStartDate: tomorrowISO(),
      consultationPreferredDate: combo.consultation?.consultationDate || "",
      consultationPreferredTime: combo.consultation?.startTime || "",
    }));
    setComboCustomer({ ...EMPTY_CUSTOMER });
    setShowComboModal(true);
  };

  const setComboField = (k, v) =>
    setComboForm((prev) => ({ ...prev, [k]: v }));

  const submitCombo = async () => {
    const userId = getUserId();
    if (!userId) {
      toast.error("Please log in to book");
      return;
    }
    const pax = Number(comboForm.numberOfParticipants) || 1;
    if (pax <= 0) {
      toast.error("Number of participants must be positive");
      return;
    }
    if (!validateCustomer(comboCustomer)) return;

    const payload = {
      userId,
      numberOfParticipants: pax,
      ...sanitizeCustomer(comboCustomer),
    };

    if (combo.package) {
      if (!comboForm.packageStartDate) {
        toast.error("Package start date is required");
        return;
      }
      payload.packageId = combo.package.id;
      payload.packageStartDate = comboForm.packageStartDate;
      payload.specialRequests = comboForm.specialRequests || "";
    }

    if (combo.consultation) {
      if (
        !comboForm.consultationPreferredDate ||
        !comboForm.consultationPreferredTime
      ) {
        toast.error("Consultation preferred date and time are required");
        return;
      }
      payload.consultationId = combo.consultation.id;
      payload.consultationPreferredDate = comboForm.consultationPreferredDate;
      payload.consultationPreferredTime = comboForm.consultationPreferredTime;
      payload.symptoms = comboForm.symptoms || "";
    }

    if (combo.course) {
      payload.courseId = combo.course.id;
      payload.previousExperience = comboForm.previousExperience || "";
    }

    setComboSubmitting(true);
    try {
      const res = await axiosInstance.post(
        `${AYURVEDA_API}/bookings/combo`,
        payload
      );
      const data = res.data;
      toast.success(
        `Combo booking confirmed! Ref: ${data?.comboReference || ""}`
      );
      setShowComboModal(false);
      setCombo({ package: null, consultation: null, course: null });
      setComboCustomer({ ...EMPTY_CUSTOMER });
      navigate("/booking-details/ayurveda-booking-list");
    } catch (e) {
      console.error(e);
      const msg =
        e?.response?.data?.message ||
        e?.response?.data ||
        "Combo booking failed.";
      toast.error(typeof msg === "string" ? msg : "Combo booking failed");
    } finally {
      setComboSubmitting(false);
    }
  };

  // ----- Quotation PDF -----
  // Customer-facing quote of the booking open in the Single Booking modal,
  // at its Estimated Total. Nothing is saved or booked.
  const buildAyurvedaQuotationPayload = () => {
    if (!bookingTarget?.item) return null;
    const { type, item } = bookingTarget;
    const pax = quoteParticipants(bookingForm.numberOfParticipants);
    const unit = Number(item.price || 0);
    if (!pax || !Number.isFinite(unit)) return null;
    const name = quoteItemName(type, item);
    const { priceItems, totalAmount } = quoteLinesAndTotal([
      {
        description: name,
        details: `${QUOTE_TYPE_LABELS[type]} · ${pax} x INR ${unit.toFixed(2)}`,
        amount: unit * pax,
      },
    ]);
    const bookingDetails =
      type === "package"
        ? [{ label: "Start Date", value: quoteDate(bookingForm.startDate) }]
        : type === "consultation"
        ? [
            {
              label: "Preferred Date",
              value: quoteDate(bookingForm.preferredDate),
            },
            {
              label: "Preferred Time",
              value: quoteTime(bookingForm.preferredTimeSlot),
            },
          ]
        : [];
    const specialRequests =
      type === "package" ? quoteText(bookingForm.specialRequests) : "";
    return {
      bookingType: "AYURVEDA",
      agentId: agentId || null,
      currency: "INR",
      serviceName: name,
      serviceSubtitle: [QUOTE_TYPE_LABELS[type], quoteText(item.centreName)]
        .filter(Boolean)
        .join(" · "),
      customerName: quoteText(bookingCustomer.customerName),
      customerEmail: quoteText(bookingCustomer.customerEmail),
      customerMobile: quoteText(bookingCustomer.customerPhone),
      details: [
        ...bookingDetails,
        { label: "Participants", value: String(pax) },
        ...quoteItemDetails(type, item),
      ],
      priceItems,
      totalAmount,
      inclusions: quoteItemInclusions(type, item),
      notes: specialRequests ? [`Special requests: ${specialRequests}`] : [],
    };
  };

  // Quote of the Combo Booking modal: one line per selected item, adding up
  // to its Estimated Total (each item's price x participants).
  const buildAyurvedaComboQuotationPayload = () => {
    const entries = ["package", "consultation", "course"]
      .filter((type) => combo[type])
      .map((type) => ({ type, item: combo[type] }));
    const pax = quoteParticipants(comboForm.numberOfParticipants);
    if (entries.length === 0 || !pax) return null;
    const rawItems = entries.map(({ type, item }) => {
      const unit = item.price ? Number(item.price) : 0;
      return {
        description: quoteItemName(type, item),
        details: `${QUOTE_TYPE_LABELS[type]} · ${pax} x INR ${unit.toFixed(2)}`,
        amount: unit * pax,
      };
    });
    if (rawItems.some((it) => !Number.isFinite(it.amount))) return null;
    const { priceItems, totalAmount } = quoteLinesAndTotal(rawItems);
    const specialRequests = combo.package
      ? quoteText(comboForm.specialRequests)
      : "";
    return {
      bookingType: "AYURVEDA",
      agentId: agentId || null,
      currency: "INR",
      serviceName: entries
        .map(({ type, item }) => quoteItemName(type, item))
        .join(" + "),
      serviceSubtitle: ["Combo booking", quoteText(entries[0].item.centreName)]
        .filter(Boolean)
        .join(" · "),
      customerName: quoteText(comboCustomer.customerName),
      customerEmail: quoteText(comboCustomer.customerEmail),
      customerMobile: quoteText(comboCustomer.customerPhone),
      details: [
        { label: "Participants", value: String(pax) },
        ...(combo.package
          ? [
              {
                label: "Package Start Date",
                value: quoteDate(comboForm.packageStartDate),
              },
              {
                label: "Package Duration",
                value: combo.package.durationDays
                  ? `${combo.package.durationDays} days`
                  : "",
              },
            ]
          : []),
        ...(combo.consultation
          ? [
              {
                label: "Consultation Date",
                value: quoteDate(comboForm.consultationPreferredDate),
              },
              {
                label: "Consultation Time",
                value: quoteTime(comboForm.consultationPreferredTime),
              },
            ]
          : []),
        ...(combo.course
          ? [
              {
                label: "Course Duration",
                value: combo.course.durationWeeks
                  ? `${combo.course.durationWeeks} weeks`
                  : "",
              },
              {
                label: "Course Level",
                value: quoteText(combo.course.courseLevel),
              },
            ]
          : []),
      ],
      priceItems,
      totalAmount,
      inclusions: entries.flatMap(({ type, item }) =>
        quoteItemInclusions(type, item)
      ),
      notes: specialRequests ? [`Special requests: ${specialRequests}`] : [],
    };
  };

  // ----- Enquiry -----
  const openEnquiry = () => {
    setEnquiryForm({
      name: "",
      email: "",
      phone: "",
      healthConcern: "",
      preferredTreatment: "",
      travelStartDate: "",
      travelEndDate: "",
      numberOfPersons: 1,
      notes: "",
    });
    setShowEnquiryModal(true);
  };

  const setEnquiryField = (k, v) =>
    setEnquiryForm((prev) => ({ ...prev, [k]: v }));

  const submitEnquiry = async () => {
    if (!enquiryForm.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!enquiryForm.email.trim() && !enquiryForm.phone.trim()) {
      toast.error("Provide email or phone so we can reach you");
      return;
    }
    setEnquirySubmitting(true);
    try {
      const payload = {
        ...enquiryForm,
        numberOfPersons: Number(enquiryForm.numberOfPersons) || 1,
        travelStartDate: enquiryForm.travelStartDate || null,
        travelEndDate: enquiryForm.travelEndDate || null,
      };
      const res = await axiosInstance.post(
        `${AYURVEDA_API}/enquiries`,
        payload
      );
      toast.success(
        `Enquiry received! Reference: ${res.data?.enquiryReference || ""}`
      );
      setShowEnquiryModal(false);
    } catch (e) {
      console.error(e);
      const msg =
        e?.response?.data?.message ||
        e?.response?.data ||
        "Enquiry submission failed.";
      toast.error(typeof msg === "string" ? msg : "Enquiry submission failed");
    } finally {
      setEnquirySubmitting(false);
    }
  };

  // ----- Renderers -----
  const renderPackages = () => {
    // While a combo is being built we only want to show items from the
    // locked centre — the user can't combine across centres so showing
    // off-centre items just clutters the list. Items already in the
    // combo are always kept so the user can see / remove them.
    const visible = packages.filter(
      (p) => isInCombo("package", p.id) || isAllowedInCombo(p.centreId)
    );
    return (
    <Row className="g-3">
      {visible.length === 0 ? (
        <Col xs={12}>
          <div className="ayurveda-empty">
            {lockedCentreId && packages.length > 0
              ? "No matching packages for the selected combo centre."
              : "No matching packages found."}
          </div>
        </Col>
      ) : (
        visible.map((p) => (
          <Col md={6} lg={4} key={p.id}>
            <Card className="ayurveda-card">
              <div className="ayurveda-card-img">
                {firstImageUrl(p.imageUrl) ? (
                  <img src={firstImageUrl(p.imageUrl)} alt={p.packageName} />
                ) : (
                  <FaSpa />
                )}
              </div>
              <Card.Body className="ayurveda-card-body">
                <div className="d-flex justify-content-between align-items-start">
                  <h6 className="ayurveda-card-title">{p.packageName}</h6>
                  {p.isAllInclusive && <Badge bg="success">All-Inclusive</Badge>}
                </div>
                <div className="ayurveda-card-desc">{p.description}</div>
                <div className="ayurveda-card-meta">
                  <span>
                    <FaCalendarAlt /> {p.durationDays} days
                  </span>
                  {p.category && <span>• {p.category}</span>}
                  {p.maxCapacity && <span>• Capacity: {p.maxCapacity}</span>}
                </div>
                <div className="mb-2">
                  {p.includesYoga && (
                    <span className="ayurveda-feature-chip">🧘 Yoga</span>
                  )}
                  {p.includesMeditation && (
                    <span className="ayurveda-feature-chip">🌿 Meditation</span>
                  )}
                  {p.includesDining && (
                    <span className="ayurveda-feature-chip">🍽 Dining</span>
                  )}
                </div>
                {p.treatmentsIncluded && (
                  <div className="ayurveda-card-meta">
                    <FaInfoCircle /> {p.treatmentsIncluded}
                  </div>
                )}
                {p.centreName && (
                  <div>
                    <span className="ayurveda-card-centre">🏛 {p.centreName}</span>
                  </div>
                )}
                <div className="d-flex justify-content-between align-items-center mt-2 flex-wrap gap-2">
                  <PriceBlock item={p} />
                  <div className="d-flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline-success"
                      onClick={() => setViewTarget({ type: "package", item: p })}
                      title="View full details"
                    >
                      <FaEye className="me-1" /> View
                    </Button>
                    {(() => {
                      const inCombo = isInCombo("package", p.id);
                      const allowed = inCombo || isAllowedInCombo(p.centreId);
                      return (
                        <button
                          type="button"
                          className={
                            inCombo
                              ? "ayurveda-combo-added-btn"
                              : "ayurveda-combo-add-btn"
                          }
                          onClick={() => allowed && toggleCombo("package", p)}
                          disabled={!allowed}
                          style={!allowed ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                          title={
                            allowed
                              ? "Add to combo (book with other items together)"
                              : "Different centre — clear combo to switch"
                          }
                        >
                          {inCombo ? (
                            <>
                              <FaCheckCircle /> Added
                            </>
                          ) : (
                            <>
                              <FaPlus /> Combo
                            </>
                          )}
                        </button>
                      );
                    })()}
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() => openBooking("package", p)}
                    >
                      Book Now
                    </Button>
                  </div>
                </div>
              </Card.Body>
            </Card>
          </Col>
        ))
      )}
    </Row>
    );
  };

  const renderConsultations = () => {
    const visible = consultations.filter(
      (c) => isInCombo("consultation", c.id) || isAllowedInCombo(c.centreId)
    );
    return (
    <Row className="g-3">
      {visible.length === 0 ? (
        <Col xs={12}>
          <div className="ayurveda-empty">
            {lockedCentreId && consultations.length > 0
              ? "No available consultation slots for the selected combo centre."
              : "No available consultation slots."}
          </div>
        </Col>
      ) : (
        visible.map((c) => (
          <Col md={6} lg={4} key={c.id}>
            <Card className="ayurveda-card">
              <div className="ayurveda-card-img">
                {firstImageUrl(c.doctorImageUrl) ? (
                  <img src={firstImageUrl(c.doctorImageUrl)} alt={c.doctorName} />
                ) : (
                  <FaUserMd />
                )}
              </div>
              <Card.Body className="ayurveda-card-body">
                <h6 className="ayurveda-card-title">{c.doctorName}</h6>
                <div className="ayurveda-card-desc">
                  {c.specialization} • {c.qualification}
                </div>
                <div className="ayurveda-card-meta">
                  <span>
                    <FaCalendarAlt /> {c.consultationDate}
                  </span>
                  <span>
                    🕒 {c.startTime} - {c.endTime}
                  </span>
                  {c.experienceYears != null && (
                    <span>• {c.experienceYears} yrs exp</span>
                  )}
                </div>
                <div className="ayurveda-card-meta">
                  Slots available:{" "}
                  <b>{(c.maxPatientsPerSlot || 0) - (c.currentBookings || 0)}</b>
                </div>
                {c.centreName && (
                  <div>
                    <span className="ayurveda-card-centre">🏛 {c.centreName}</span>
                  </div>
                )}
                <div className="d-flex justify-content-between align-items-center mt-2 flex-wrap gap-2">
                  <PriceBlock item={c} />
                  <div className="d-flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline-success"
                      onClick={() => setViewTarget({ type: "consultation", item: c })}
                      title="View full details"
                    >
                      <FaEye className="me-1" /> View
                    </Button>
                    {(() => {
                      const inCombo = isInCombo("consultation", c.id);
                      const allowed = inCombo || isAllowedInCombo(c.centreId);
                      return (
                        <button
                          type="button"
                          className={
                            inCombo
                              ? "ayurveda-combo-added-btn"
                              : "ayurveda-combo-add-btn"
                          }
                          onClick={() => allowed && toggleCombo("consultation", c)}
                          disabled={!allowed}
                          style={!allowed ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                          title={
                            allowed
                              ? "Add to combo"
                              : "Different centre — clear combo to switch"
                          }
                        >
                          {inCombo ? (
                            <>
                              <FaCheckCircle /> Added
                            </>
                          ) : (
                            <>
                              <FaPlus /> Combo
                            </>
                          )}
                        </button>
                      );
                    })()}
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() => openBooking("consultation", c)}
                    >
                      Book Slot
                    </Button>
                  </div>
                </div>
              </Card.Body>
            </Card>
          </Col>
        ))
      )}
    </Row>
    );
  };

  const renderCourses = () => {
    const visible = courses.filter(
      (c) => isInCombo("course", c.id) || isAllowedInCombo(c.centreId)
    );
    return (
    <Row className="g-3">
      {visible.length === 0 ? (
        <Col xs={12}>
          <div className="ayurveda-empty">
            {lockedCentreId && courses.length > 0
              ? "No matching courses for the selected combo centre."
              : "No matching courses found."}
          </div>
        </Col>
      ) : (
        visible.map((c) => (
          <Col md={6} lg={4} key={c.id}>
            <Card className="ayurveda-card">
              <div className="ayurveda-card-img">
                {firstImageUrl(c.courseImageUrl) ? (
                  <img src={firstImageUrl(c.courseImageUrl)} alt={c.courseName} />
                ) : (
                  <FaBookOpen />
                )}
              </div>
              <Card.Body className="ayurveda-card-body">
                <div className="d-flex justify-content-between align-items-start">
                  <h6 className="ayurveda-card-title">{c.courseName}</h6>
                  {c.courseLevel && <Badge bg="info">{c.courseLevel}</Badge>}
                </div>
                <div className="ayurveda-card-desc">{c.description}</div>
                <div className="ayurveda-card-meta">
                  <span>
                    <FaCalendarAlt /> {c.durationWeeks} weeks
                  </span>
                  {c.instructorName && <span>• by {c.instructorName}</span>}
                </div>
                <div className="ayurveda-card-meta">
                  <span>
                    {c.startDate} → {c.endDate}
                  </span>
                </div>
                <div className="ayurveda-card-meta">
                  Seats available:{" "}
                  <b>{(c.maxStudents || 0) - (c.currentEnrollments || 0)}</b>
                  {c.certificationIncluded && (
                    <span className="ayurveda-feature-chip ms-2">
                      <FaCheckCircle /> Certified
                    </span>
                  )}
                </div>
                {c.prerequisites && (
                  <div className="ayurveda-card-meta">
                    Prerequisites: {c.prerequisites}
                  </div>
                )}
                {c.centreName && (
                  <div>
                    <span className="ayurveda-card-centre">🏛 {c.centreName}</span>
                  </div>
                )}
                <div className="d-flex justify-content-between align-items-center mt-2 flex-wrap gap-2">
                  <PriceBlock item={c} />
                  <div className="d-flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline-success"
                      onClick={() => setViewTarget({ type: "course", item: c })}
                      title="View full details"
                    >
                      <FaEye className="me-1" /> View
                    </Button>
                    {(() => {
                      const inCombo = isInCombo("course", c.id);
                      const allowed = inCombo || isAllowedInCombo(c.centreId);
                      return (
                        <button
                          type="button"
                          className={
                            inCombo
                              ? "ayurveda-combo-added-btn"
                              : "ayurveda-combo-add-btn"
                          }
                          onClick={() => allowed && toggleCombo("course", c)}
                          disabled={!allowed}
                          style={!allowed ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                          title={
                            allowed
                              ? "Add to combo"
                              : "Different centre — clear combo to switch"
                          }
                        >
                          {inCombo ? (
                            <>
                              <FaCheckCircle /> Added
                            </>
                          ) : (
                            <>
                              <FaPlus /> Combo
                            </>
                          )}
                        </button>
                      );
                    })()}
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() => openBooking("course", c)}
                    >
                      Enroll
                    </Button>
                  </div>
                </div>
              </Card.Body>
            </Card>
          </Col>
        ))
      )}
    </Row>
    );
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1" style={{ minWidth: 0, overflowX: "hidden" }}>
        <div className="ayurveda-page">
          <Container fluid className="p-3">
            <div className="ayurveda-main-grid">
              <div className="ayurveda-main-col">
            <div className="ayurveda-header">
              <div>
                <h2 className="ayurveda-title">
                  <FaLeaf /> Ayurveda Booking
                </h2>
                <p className="ayurveda-subtitle">
                  Browse packages, doctor consultations & courses — book them
                  individually or as a combo
                </p>
              </div>
              <div>
                <Button
                  variant="warning"
                  size="sm"
                  onClick={openEnquiry}
                  className="text-dark"
                >
                  <FaEnvelopeOpenText className="me-1" /> Send Enquiry
                </Button>
              </div>
            </div>

            <div className="ayurveda-enquiry-banner">
              <div className="ayurveda-enquiry-banner-text">
                <FaInfoCircle /> Not sure what suits you? Fill a quick enquiry
                with your health concern & travel dates — we'll get back to you
                with a curated recommendation.
              </div>
              <Button
                size="sm"
                variant="outline-warning"
                onClick={openEnquiry}
                className="text-dark"
              >
                Send Enquiry
              </Button>
            </div>

            <div className="ayurveda-filter-bar">
              <InputGroup style={{ maxWidth: 340 }}>
                <InputGroup.Text>
                  <FaSearch />
                </InputGroup.Text>
                <Form.Control
                  placeholder="Search by name, description..."
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                />
              </InputGroup>

              <Form.Select
                style={{ maxWidth: 240 }}
                value={destinationCityId}
                onChange={(e) => setDestinationCityId(e.target.value)}
                title="Filter by destination city"
              >
                <option value="">All Destinations</option>
                {cityOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Form.Select>

              <div style={{ minWidth: 240, maxWidth: 320 }}
                   title="Select an agent to apply their markup to displayed prices">
                <AgentSelect
                  agents={agents}
                  value={agentId}
                  placeholder="No Agent (base price)"
                  onChange={(v) => setAgentId(v)}
                />
              </div>

              {activeTab === "packages" && (
                <>
                  <Form.Select
                    style={{ maxWidth: 200 }}
                    value={packageCategory}
                    onChange={(e) => setPackageCategory(e.target.value)}
                  >
                    <option value="">All Categories</option>
                    <option>Detox</option>
                    <option>Panchakarma</option>
                    <option>Rejuvenation</option>
                    <option>Wellness</option>
                    <option>Weight Management</option>
                    <option>Stress Relief</option>
                  </Form.Select>
                  <Form.Check
                    type="switch"
                    label="All-Inclusive Only"
                    checked={allInclusiveOnly}
                    onChange={(e) => setAllInclusiveOnly(e.target.checked)}
                    className="align-self-center"
                  />
                </>
              )}

              {activeTab === "courses" && (
                <Form.Select
                  style={{ maxWidth: 200 }}
                  value={courseLevel}
                  onChange={(e) => setCourseLevel(e.target.value)}
                >
                  <option value="">All Levels</option>
                  <option>Beginner</option>
                  <option>Intermediate</option>
                  <option>Advanced</option>
                </Form.Select>
              )}

              {activeTab === "consultations" && (
                <>
                  <Form.Control
                    type="date"
                    style={{ maxWidth: 180 }}
                    value={consultationStartDate}
                    onChange={(e) => setConsultationStartDate(e.target.value)}
                  />
                  <Form.Control
                    type="date"
                    style={{ maxWidth: 180 }}
                    value={consultationEndDate}
                    onChange={(e) => setConsultationEndDate(e.target.value)}
                  />
                </>
              )}

              {(activeTab === "packages" || activeTab === "courses") && (
                <>
                  <Form.Control
                    type="number"
                    placeholder="Min price"
                    style={{ maxWidth: 140 }}
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                  />
                  <Form.Control
                    type="number"
                    placeholder="Max price"
                    style={{ maxWidth: 140 }}
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                  />
                </>
              )}

              <Button
                variant="success"
                onClick={() => {
                  if (activeTab === "packages") loadPackages();
                  if (activeTab === "consultations") loadConsultations();
                  if (activeTab === "courses") loadCourses();
                }}
              >
                <FaSearch className="me-1" /> Search
              </Button>
            </div>

            <Tabs
              activeKey={activeTab}
              onSelect={(k) => setActiveTab(k)}
              className="ayurveda-tabs"
              fill
            >
              <Tab
                eventKey="packages"
                title={
                  <span>
                    <FaSpa className="me-2" />
                    Packages
                  </span>
                }
              >
                {loading ? (
                  <div className="text-center py-5">
                    <Spinner animation="border" variant="success" />
                  </div>
                ) : (
                  renderPackages()
                )}
              </Tab>
              <Tab
                eventKey="consultations"
                title={
                  <span>
                    <FaUserMd className="me-2" />
                    Doctor Consultation
                  </span>
                }
              >
                {loading ? (
                  <div className="text-center py-5">
                    <Spinner animation="border" variant="success" />
                  </div>
                ) : (
                  renderConsultations()
                )}
              </Tab>
              <Tab
                eventKey="courses"
                title={
                  <span>
                    <FaBookOpen className="me-2" />
                    Courses
                  </span>
                }
              >
                {loading ? (
                  <div className="text-center py-5">
                    <Spinner animation="border" variant="success" />
                  </div>
                ) : (
                  renderCourses()
                )}
              </Tab>
            </Tabs>
              </div>

              {/* ===== Combo Items side panel (right column) ===== */}
              {comboCount > 0 && (
                <aside className="ayurveda-combo-panel">
                  <div className="ayurveda-combo-panel-header">
                    <span>
                      <FaShoppingBag className="me-2" /> Combo Items ({comboCount})
                    </span>
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 text-danger"
                      onClick={() =>
                        setCombo({ package: null, consultation: null, course: null })
                      }
                      title="Clear all combo items"
                    >
                      <FaTimes />
                    </Button>
                  </div>
                  <div className="ayurveda-combo-panel-subtitle">
                    Pick one item from each category, then book them together as a combo.
                  </div>

                  {combo.package && (
                    <div className="ayurveda-combo-item">
                      <div>
                        <span className="ayurveda-combo-item-type">Package</span>
                        <div className="ayurveda-combo-item-name">
                          <FaSpa className="me-1" />
                          {combo.package.packageName}
                        </div>
                        <div className="ayurveda-combo-item-meta">
                          ₹{combo.package.price} • {combo.package.durationDays} days
                        </div>
                      </div>
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 text-danger"
                        onClick={() => removeFromCombo("package")}
                        title="Remove"
                      >
                        <FaTimes />
                      </Button>
                    </div>
                  )}
                  {combo.consultation && (
                    <div className="ayurveda-combo-item">
                      <div>
                        <span className="ayurveda-combo-item-type">Consultation</span>
                        <div className="ayurveda-combo-item-name">
                          <FaUserMd className="me-1" />
                          {combo.consultation.doctorName}
                        </div>
                        <div className="ayurveda-combo-item-meta">
                          ₹{combo.consultation.price} •{" "}
                          {combo.consultation.consultationDate}
                        </div>
                      </div>
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 text-danger"
                        onClick={() => removeFromCombo("consultation")}
                        title="Remove"
                      >
                        <FaTimes />
                      </Button>
                    </div>
                  )}
                  {combo.course && (
                    <div className="ayurveda-combo-item">
                      <div>
                        <span className="ayurveda-combo-item-type">Course</span>
                        <div className="ayurveda-combo-item-name">
                          <FaBookOpen className="me-1" />
                          {combo.course.courseName}
                        </div>
                        <div className="ayurveda-combo-item-meta">
                          ₹{combo.course.price} • {combo.course.durationWeeks} weeks
                        </div>
                      </div>
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 text-danger"
                        onClick={() => removeFromCombo("course")}
                        title="Remove"
                      >
                        <FaTimes />
                      </Button>
                    </div>
                  )}

                  <div className="ayurveda-combo-total">
                    Subtotal: ₹{comboBaseTotal.toFixed(2)}
                    <div className="text-muted small fw-normal">
                      × participants applied at checkout
                    </div>
                  </div>

                  <Button
                    variant="success"
                    size="sm"
                    className="w-100"
                    disabled={comboCount < 2}
                    onClick={openComboModal}
                  >
                    {comboCount < 2
                      ? "Add at least 2 items"
                      : `Book Combo (${comboCount} items)`}
                  </Button>
                </aside>
              )}
            </div>
          </Container>
        </div>
        </main>
      </div>

      {/* ===== Single Booking Modal ===== */}
      <Modal show={!!bookingTarget} onHide={closeBooking} centered>
        <Modal.Header closeButton>
          <Modal.Title>
            {bookingTarget?.type === "package" && "Book Ayurveda Package"}
            {bookingTarget?.type === "consultation" && "Book Doctor Consultation"}
            {bookingTarget?.type === "course" && "Enroll in Course"}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {bookingTarget && (
            <>
              <div className="ayurveda-summary-card">
                <strong>
                  {bookingTarget.item.packageName ||
                    bookingTarget.item.doctorName ||
                    bookingTarget.item.courseName}
                </strong>
                <div className="small text-muted">
                  Price per person: ₹{bookingTarget.item.price}
                </div>
              </div>

              {bookingTarget.type === "package" && (
                <Form>
                  <Form.Group className="mb-2">
                    <Form.Label>Start Date *</Form.Label>
                    <Form.Control
                      type="date"
                      min={tomorrowISO()}
                      value={bookingForm.startDate || ""}
                      onChange={(e) => setBookingField("startDate", e.target.value)}
                    />
                    <Form.Text className="text-muted">
                      Backend requires a future date.
                    </Form.Text>
                  </Form.Group>
                  <Form.Group className="mb-2">
                    <Form.Label>Number of Participants *</Form.Label>
                    <Form.Control
                      type="number"
                      min={1}
                      value={bookingForm.numberOfParticipants || 1}
                      onChange={(e) =>
                        setBookingField("numberOfParticipants", e.target.value)
                      }
                    />
                  </Form.Group>
                  <Form.Group className="mb-2">
                    <Form.Label>Special Requests</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={2}
                      value={bookingForm.specialRequests || ""}
                      onChange={(e) =>
                        setBookingField("specialRequests", e.target.value)
                      }
                    />
                  </Form.Group>
                </Form>
              )}

              {bookingTarget.type === "consultation" && (
                <Form>
                  <Form.Group className="mb-2">
                    <Form.Label>Preferred Date *</Form.Label>
                    <Form.Control
                      type="date"
                      value={bookingForm.preferredDate || ""}
                      onChange={(e) =>
                        setBookingField("preferredDate", e.target.value)
                      }
                    />
                    <Form.Text className="text-muted">
                      Must match the doctor's slot date.
                    </Form.Text>
                  </Form.Group>
                  <Form.Group className="mb-2">
                    <Form.Label>Preferred Time *</Form.Label>
                    <Form.Control
                      type="time"
                      value={bookingForm.preferredTimeSlot || ""}
                      onChange={(e) =>
                        setBookingField("preferredTimeSlot", e.target.value)
                      }
                    />
                  </Form.Group>
                  <Form.Group className="mb-2">
                    <Form.Label>Number of Participants *</Form.Label>
                    <Form.Control
                      type="number"
                      min={1}
                      value={bookingForm.numberOfParticipants || 1}
                      onChange={(e) =>
                        setBookingField("numberOfParticipants", e.target.value)
                      }
                    />
                  </Form.Group>
                  <Form.Group className="mb-2">
                    <Form.Label>Symptoms / Health Concerns</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={2}
                      value={bookingForm.symptoms || ""}
                      onChange={(e) => setBookingField("symptoms", e.target.value)}
                    />
                  </Form.Group>
                </Form>
              )}

              {bookingTarget.type === "course" && (
                <Form>
                  <Form.Group className="mb-2">
                    <Form.Label>Number of Participants *</Form.Label>
                    <Form.Control
                      type="number"
                      min={1}
                      value={bookingForm.numberOfParticipants || 1}
                      onChange={(e) =>
                        setBookingField("numberOfParticipants", e.target.value)
                      }
                    />
                  </Form.Group>
                  <Form.Group className="mb-2">
                    <Form.Label>Previous Experience</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={2}
                      value={bookingForm.previousExperience || ""}
                      onChange={(e) =>
                        setBookingField("previousExperience", e.target.value)
                      }
                    />
                  </Form.Group>
                </Form>
              )}

              <div className="ayurveda-customer-section">
                <h6>
                  <FaUser className="me-2" /> Customer Details
                </h6>
                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-2">
                      <Form.Label>
                        <FaUser className="me-1" /> Name *
                      </Form.Label>
                      <Form.Control
                        value={bookingCustomer.customerName}
                        onChange={(e) =>
                          setBookingCustomerField("customerName", e.target.value)
                        }
                        placeholder="Full name"
                      />
                    </Form.Group>
                  </Col>
                  <Col md={3}>
                    <Form.Group className="mb-2">
                      <Form.Label>
                        <FaBirthdayCake className="me-1" /> Age
                      </Form.Label>
                      <Form.Control
                        type="number"
                        min={0}
                        max={130}
                        value={bookingCustomer.customerAge}
                        onChange={(e) =>
                          setBookingCustomerField("customerAge", e.target.value)
                        }
                      />
                    </Form.Group>
                  </Col>
                  <Col md={3}>
                    <Form.Group className="mb-2">
                      <Form.Label>
                        <FaVenusMars className="me-1" /> Gender
                      </Form.Label>
                      <Form.Select
                        value={bookingCustomer.customerGender}
                        onChange={(e) =>
                          setBookingCustomerField("customerGender", e.target.value)
                        }
                      >
                        <option value="">-- Select --</option>
                        <option value="MALE">Male</option>
                        <option value="FEMALE">Female</option>
                        <option value="OTHER">Other</option>
                      </Form.Select>
                    </Form.Group>
                  </Col>
                </Row>
                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-2">
                      <Form.Label>
                        <FaPhone className="me-1" /> Phone
                      </Form.Label>
                      <Form.Control
                        value={bookingCustomer.customerPhone}
                        onChange={(e) =>
                          setBookingCustomerField("customerPhone", e.target.value)
                        }
                        placeholder="e.g. +91 98765 43210"
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-2">
                      <Form.Label>
                        <FaEnvelope className="me-1" /> Email
                      </Form.Label>
                      <Form.Control
                        type="email"
                        value={bookingCustomer.customerEmail}
                        onChange={(e) =>
                          setBookingCustomerField("customerEmail", e.target.value)
                        }
                        placeholder="customer@example.com"
                      />
                    </Form.Group>
                  </Col>
                </Row>
                <div className="text-muted small">
                  Phone or email is required so we can reach the guest.
                </div>
              </div>

              <div className="mt-2">
                <strong>Estimated Total:</strong>{" "}
                ₹
                {(
                  Number(bookingTarget.item.price || 0) *
                  Number(bookingForm.numberOfParticipants || 1)
                ).toFixed(2)}
              </div>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <QuotationPdfCard
            variant="button"
            className="me-auto"
            buildPayload={buildAyurvedaQuotationPayload}
            disabled={submitting}
          />
          <Button variant="secondary" onClick={closeBooking} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="success" onClick={submitBooking} disabled={submitting}>
            {submitting ? <Spinner size="sm" animation="border" /> : "Confirm Booking"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ===== Combo Booking Modal ===== */}
      <Modal show={showComboModal} onHide={() => setShowComboModal(false)} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            <FaShoppingBag className="me-2" /> Combo Booking
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="ayurveda-summary-card">
            <div className="d-flex flex-wrap gap-2">
              {combo.package && (
                <span className="ayurveda-feature-chip">
                  <FaSpa /> {combo.package.packageName} · ₹{combo.package.price}
                </span>
              )}
              {combo.consultation && (
                <span className="ayurveda-feature-chip">
                  <FaUserMd /> {combo.consultation.doctorName} · ₹
                  {combo.consultation.price}
                </span>
              )}
              {combo.course && (
                <span className="ayurveda-feature-chip">
                  <FaBookOpen /> {combo.course.courseName} · ₹{combo.course.price}
                </span>
              )}
            </div>
            <div className="mt-2 small text-muted">
              All selected items will share one combo reference and be created
              together. If any single leg fails, the whole combo is rolled back.
            </div>
          </div>

          <Form>
            <Form.Group className="mb-2">
              <Form.Label>Number of Participants *</Form.Label>
              <Form.Control
                type="number"
                min={1}
                value={comboForm.numberOfParticipants}
                onChange={(e) =>
                  setComboField("numberOfParticipants", e.target.value)
                }
              />
              <Form.Text className="text-muted">
                Applied to every leg of the combo.
              </Form.Text>
            </Form.Group>

            {combo.package && (
              <Card className="p-2 mb-2 border-success">
                <h6 className="text-success">
                  <FaSpa className="me-1" /> Package Details
                </h6>
                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-2">
                      <Form.Label>Start Date *</Form.Label>
                      <Form.Control
                        type="date"
                        min={tomorrowISO()}
                        value={comboForm.packageStartDate || ""}
                        onChange={(e) =>
                          setComboField("packageStartDate", e.target.value)
                        }
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-2">
                      <Form.Label>Special Requests</Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={1}
                        value={comboForm.specialRequests || ""}
                        onChange={(e) =>
                          setComboField("specialRequests", e.target.value)
                        }
                      />
                    </Form.Group>
                  </Col>
                </Row>
              </Card>
            )}

            {combo.consultation && (
              <Card className="p-2 mb-2 border-info">
                <h6 className="text-info">
                  <FaUserMd className="me-1" /> Consultation Details
                </h6>
                <Row>
                  <Col md={4}>
                    <Form.Group className="mb-2">
                      <Form.Label>Preferred Date *</Form.Label>
                      <Form.Control
                        type="date"
                        value={comboForm.consultationPreferredDate || ""}
                        onChange={(e) =>
                          setComboField(
                            "consultationPreferredDate",
                            e.target.value
                          )
                        }
                      />
                      <Form.Text className="text-muted">
                        Must match the doctor's slot date.
                      </Form.Text>
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group className="mb-2">
                      <Form.Label>Preferred Time *</Form.Label>
                      <Form.Control
                        type="time"
                        value={comboForm.consultationPreferredTime || ""}
                        onChange={(e) =>
                          setComboField(
                            "consultationPreferredTime",
                            e.target.value
                          )
                        }
                      />
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group className="mb-2">
                      <Form.Label>Symptoms</Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={1}
                        value={comboForm.symptoms || ""}
                        onChange={(e) =>
                          setComboField("symptoms", e.target.value)
                        }
                      />
                    </Form.Group>
                  </Col>
                </Row>
              </Card>
            )}

            {combo.course && (
              <Card className="p-2 mb-2 border-warning">
                <h6 className="text-warning">
                  <FaBookOpen className="me-1" /> Course Details
                </h6>
                <Form.Group className="mb-2">
                  <Form.Label>Previous Experience</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={1}
                    value={comboForm.previousExperience || ""}
                    onChange={(e) =>
                      setComboField("previousExperience", e.target.value)
                    }
                  />
                </Form.Group>
              </Card>
            )}

            <div className="ayurveda-customer-section">
              <h6>
                <FaUser className="me-2" /> Customer Details
              </h6>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-2">
                    <Form.Label>
                      <FaUser className="me-1" /> Name *
                    </Form.Label>
                    <Form.Control
                      value={comboCustomer.customerName}
                      onChange={(e) =>
                        setComboCustomerField("customerName", e.target.value)
                      }
                      placeholder="Full name"
                    />
                  </Form.Group>
                </Col>
                <Col md={3}>
                  <Form.Group className="mb-2">
                    <Form.Label>
                      <FaBirthdayCake className="me-1" /> Age
                    </Form.Label>
                    <Form.Control
                      type="number"
                      min={0}
                      max={130}
                      value={comboCustomer.customerAge}
                      onChange={(e) =>
                        setComboCustomerField("customerAge", e.target.value)
                      }
                    />
                  </Form.Group>
                </Col>
                <Col md={3}>
                  <Form.Group className="mb-2">
                    <Form.Label>
                      <FaVenusMars className="me-1" /> Gender
                    </Form.Label>
                    <Form.Select
                      value={comboCustomer.customerGender}
                      onChange={(e) =>
                        setComboCustomerField("customerGender", e.target.value)
                      }
                    >
                      <option value="">-- Select --</option>
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
              </Row>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-2">
                    <Form.Label>
                      <FaPhone className="me-1" /> Phone
                    </Form.Label>
                    <Form.Control
                      value={comboCustomer.customerPhone}
                      onChange={(e) =>
                        setComboCustomerField("customerPhone", e.target.value)
                      }
                      placeholder="e.g. +91 98765 43210"
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-2">
                    <Form.Label>
                      <FaEnvelope className="me-1" /> Email
                    </Form.Label>
                    <Form.Control
                      type="email"
                      value={comboCustomer.customerEmail}
                      onChange={(e) =>
                        setComboCustomerField("customerEmail", e.target.value)
                      }
                      placeholder="customer@example.com"
                    />
                  </Form.Group>
                </Col>
              </Row>
              <div className="text-muted small">
                Phone or email is required so we can reach the guest.
              </div>
            </div>

            <div className="mt-2">
              <strong>Estimated Total:</strong> ₹
              {(
                comboBaseTotal *
                (Number(comboForm.numberOfParticipants) || 1)
              ).toFixed(2)}
            </div>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <QuotationPdfCard
            variant="button"
            className="me-auto"
            buildPayload={buildAyurvedaComboQuotationPayload}
            disabled={comboSubmitting}
          />
          <Button
            variant="secondary"
            onClick={() => setShowComboModal(false)}
            disabled={comboSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="success"
            onClick={submitCombo}
            disabled={comboSubmitting}
          >
            {comboSubmitting ? (
              <Spinner size="sm" animation="border" />
            ) : (
              "Confirm Combo Booking"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ===== Enquiry Modal ===== */}
      <Modal
        show={showEnquiryModal}
        onHide={() => setShowEnquiryModal(false)}
        centered
        size="lg"
      >
        <Modal.Header closeButton>
          <Modal.Title>
            <FaEnvelopeOpenText className="me-2" /> Send Ayurveda Enquiry
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-2">
                  <Form.Label>Name *</Form.Label>
                  <Form.Control
                    value={enquiryForm.name}
                    onChange={(e) => setEnquiryField("name", e.target.value)}
                  />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group className="mb-2">
                  <Form.Label>Number of Persons</Form.Label>
                  <Form.Control
                    type="number"
                    min={1}
                    value={enquiryForm.numberOfPersons}
                    onChange={(e) =>
                      setEnquiryField("numberOfPersons", e.target.value)
                    }
                  />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group className="mb-2">
                  <Form.Label>Preferred Treatment</Form.Label>
                  <Form.Select
                    value={enquiryForm.preferredTreatment}
                    onChange={(e) =>
                      setEnquiryField("preferredTreatment", e.target.value)
                    }
                  >
                    <option value="">-- Any --</option>
                    <option>Detox</option>
                    <option>Panchakarma</option>
                    <option>Rejuvenation</option>
                    <option>Wellness</option>
                    <option>Weight Management</option>
                    <option>Stress Relief</option>
                    <option>Doctor Consultation</option>
                    <option>Ayurveda Course</option>
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-2">
                  <Form.Label>Email</Form.Label>
                  <Form.Control
                    type="email"
                    value={enquiryForm.email}
                    onChange={(e) => setEnquiryField("email", e.target.value)}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-2">
                  <Form.Label>Phone</Form.Label>
                  <Form.Control
                    value={enquiryForm.phone}
                    onChange={(e) => setEnquiryField("phone", e.target.value)}
                  />
                </Form.Group>
              </Col>
            </Row>
            <Form.Group className="mb-2">
              <Form.Label>Health Concern</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                value={enquiryForm.healthConcern}
                onChange={(e) =>
                  setEnquiryField("healthConcern", e.target.value)
                }
                placeholder="e.g. chronic back pain, post-surgery rehab, stress management..."
              />
            </Form.Group>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-2">
                  <Form.Label>Travel Start Date</Form.Label>
                  <Form.Control
                    type="date"
                    value={enquiryForm.travelStartDate}
                    onChange={(e) =>
                      setEnquiryField("travelStartDate", e.target.value)
                    }
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-2">
                  <Form.Label>Travel End Date</Form.Label>
                  <Form.Control
                    type="date"
                    value={enquiryForm.travelEndDate}
                    onChange={(e) =>
                      setEnquiryField("travelEndDate", e.target.value)
                    }
                  />
                </Form.Group>
              </Col>
            </Row>
            <Form.Group className="mb-2">
              <Form.Label>Notes</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                value={enquiryForm.notes}
                onChange={(e) => setEnquiryField("notes", e.target.value)}
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowEnquiryModal(false)}
            disabled={enquirySubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="warning"
            className="text-dark"
            onClick={submitEnquiry}
            disabled={enquirySubmitting}
          >
            {enquirySubmitting ? (
              <Spinner size="sm" animation="border" />
            ) : (
              "Submit Enquiry"
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ===== View Details Modal ===== */}
      <Modal
        show={!!viewTarget}
        onHide={() => setViewTarget(null)}
        centered
        size="lg"
        scrollable
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {viewTarget?.type === "package" && (
              <>
                <FaSpa className="me-2" /> Package Details
              </>
            )}
            {viewTarget?.type === "consultation" && (
              <>
                <FaUserMd className="me-2" /> Doctor Details
              </>
            )}
            {viewTarget?.type === "course" && (
              <>
                <FaBookOpen className="me-2" /> Course Details
              </>
            )}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {viewTarget?.type === "package" && (
            <ViewPackageDetails item={viewTarget.item} />
          )}
          {viewTarget?.type === "consultation" && (
            <ViewConsultationDetails item={viewTarget.item} />
          )}
          {viewTarget?.type === "course" && (
            <ViewCourseDetails item={viewTarget.item} />
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setViewTarget(null)}>
            Close
          </Button>
          {viewTarget?.type === "package" && (
            <Button
              variant="success"
              onClick={() => {
                const it = viewTarget.item;
                setViewTarget(null);
                openBooking("package", it);
              }}
            >
              Book Now
            </Button>
          )}
          {viewTarget?.type === "consultation" && (
            <Button
              variant="success"
              onClick={() => {
                const it = viewTarget.item;
                setViewTarget(null);
                openBooking("consultation", it);
              }}
            >
              Book Slot
            </Button>
          )}
          {viewTarget?.type === "course" && (
            <Button
              variant="success"
              onClick={() => {
                const it = viewTarget.item;
                setViewTarget(null);
                openBooking("course", it);
              }}
            >
              Enroll
            </Button>
          )}
        </Modal.Footer>
      </Modal>
    </div>
  );
};

// ===== View Details sub-components =====

const DetailsRow = ({ label, value }) =>
  value === null || value === undefined || value === "" ? null : (
    <div className="ayurveda-details-row">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );

/**
 * Renders a single image, an auto-rotating slideshow for multiple images,
 * or a placeholder icon. The slideshow advances every 2 seconds. Dots
 * underneath let the user jump between slides manually.
 */
const ImageSlideshow = ({ images, alt, placeholderIcon, intervalMs = 2000 }) => {
  const [index, setIndex] = useState(0);
  const safeImages = Array.isArray(images) ? images.filter(Boolean) : [];

  useEffect(() => {
    setIndex(0);
  }, [alt]);

  useEffect(() => {
    if (safeImages.length <= 1) return undefined;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % safeImages.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [safeImages.length, intervalMs]);

  if (safeImages.length === 0) {
    return <div className="ayurveda-details-placeholder">{placeholderIcon}</div>;
  }

  return (
    <div className="ayurveda-details-slideshow">
      <img
        src={safeImages[index]}
        alt={`${alt} ${index + 1}`}
        className="ayurveda-details-image"
      />
      {safeImages.length > 1 && (
        <div className="ayurveda-details-dots">
          {safeImages.map((_, i) => (
            <button
              key={i}
              type="button"
              className={
                "ayurveda-details-dot" + (i === index ? " active" : "")
              }
              onClick={() => setIndex(i)}
              aria-label={`Show image ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const ViewPackageDetails = ({ item }) => (
  <>
    <ImageSlideshow
      images={splitImageUrls(item.imageUrl)}
      alt={item.packageName}
      placeholderIcon={<FaSpa />}
    />
    <h5 className="mb-2" style={{ color: "#1b5e20" }}>
      {item.packageName}
      {item.isAllInclusive && (
        <Badge bg="success" className="ms-2">
          All-Inclusive
        </Badge>
      )}
    </h5>
    {item.description && <p className="text-muted">{item.description}</p>}
    <DetailsRow label="Category" value={item.category} />
    <DetailsRow label="Price" value={`₹${item.price}`} />
    <DetailsRow
      label="Duration"
      value={item.durationDays ? `${item.durationDays} days` : null}
    />
    <DetailsRow label="Max Capacity" value={item.maxCapacity} />
    <DetailsRow label="Treatments Included" value={item.treatmentsIncluded} />
    <DetailsRow label="Includes Yoga" value={item.includesYoga ? "Yes" : "No"} />
    <DetailsRow
      label="Includes Meditation"
      value={item.includesMeditation ? "Yes" : "No"}
    />
    <DetailsRow
      label="Includes Dining"
      value={item.includesDining ? "Yes" : "No"}
    />
    <DetailsRow label="Valid From" value={item.validFrom} />
    <DetailsRow label="Valid Till" value={item.validTo} />
    <DetailsRow
      label="Status"
      value={item.isActive ? "Active" : "Inactive"}
    />
  </>
);

const ViewConsultationDetails = ({ item }) => {
  const available =
    (item.maxPatientsPerSlot || 0) - (item.currentBookings || 0);
  return (
    <>
      <ImageSlideshow
        images={splitImageUrls(item.doctorImageUrl)}
        alt={item.doctorName}
        placeholderIcon={<FaUserMd />}
      />
      <h5 className="mb-2" style={{ color: "#1b5e20" }}>
        {item.doctorName}
      </h5>
      <DetailsRow label="Specialization" value={item.specialization} />
      <DetailsRow label="Qualification" value={item.qualification} />
      <DetailsRow
        label="Experience"
        value={
          item.experienceYears != null ? `${item.experienceYears} years` : null
        }
      />
      <DetailsRow label="Consultation Date" value={item.consultationDate} />
      <DetailsRow
        label="Slot Time"
        value={
          item.startTime && item.endTime
            ? `${item.startTime} - ${item.endTime}`
            : null
        }
      />
      <DetailsRow label="Fees" value={`₹${item.price}`} />
      <DetailsRow
        label="Slots Per Session"
        value={item.maxPatientsPerSlot}
      />
      <DetailsRow label="Booked" value={item.currentBookings ?? 0} />
      <DetailsRow label="Slots Available" value={available} />
      <DetailsRow
        label="Status"
        value={
          item.isBooked
            ? "Fully Booked"
            : item.isActive
            ? "Available"
            : "Inactive"
        }
      />
    </>
  );
};

const ViewCourseDetails = ({ item }) => {
  const seatsAvailable =
    (item.maxStudents || 0) - (item.currentEnrollments || 0);
  return (
    <>
      <ImageSlideshow
        images={splitImageUrls(item.courseImageUrl)}
        alt={item.courseName}
        placeholderIcon={<FaBookOpen />}
      />
      <h5 className="mb-2" style={{ color: "#1b5e20" }}>
        {item.courseName}
        {item.courseLevel && (
          <Badge bg="info" className="ms-2">
            {item.courseLevel}
          </Badge>
        )}
      </h5>
      {item.description && <p className="text-muted">{item.description}</p>}
      <DetailsRow label="Instructor" value={item.instructorName} />
      <DetailsRow
        label="Duration"
        value={item.durationWeeks ? `${item.durationWeeks} weeks` : null}
      />
      <DetailsRow label="Course Level" value={item.courseLevel} />
      <DetailsRow label="Start Date" value={item.startDate} />
      <DetailsRow label="End Date" value={item.endDate} />
      <DetailsRow label="Fee" value={`₹${item.price}`} />
      <DetailsRow label="Max Students" value={item.maxStudents} />
      <DetailsRow label="Currently Enrolled" value={item.currentEnrollments ?? 0} />
      <DetailsRow label="Seats Available" value={seatsAvailable} />
      <DetailsRow
        label="Certification"
        value={item.certificationIncluded ? "Included" : "Not Included"}
      />
      <DetailsRow label="Prerequisites" value={item.prerequisites} />
      <DetailsRow
        label="Status"
        value={item.isActive ? "Active" : "Inactive"}
      />
    </>
  );
};

export default AyurvedaSearch;
