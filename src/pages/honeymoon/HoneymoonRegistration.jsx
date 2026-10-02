import React, { useEffect, useRef, useState } from "react";
import {
  Card,
  Button,
  Form,
  Row,
  Col,
  Table,
  Modal,
  Image,
  Container,
  InputGroup,
} from "react-bootstrap";
import {
  FaPlus,
  FaTrash,
  FaSave,
  FaArrowLeft,
  FaImages,
  FaRoute,
  FaSuitcaseRolling,
  FaCheck,
  FaTimes,
} from "react-icons/fa";
import Select from "react-select";
import AsyncSelect from "react-select/async";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";

const CATEGORIES = ["Luxury", "Romantic", "Cultural", "Adventure", "Budget", "Standard"];
const THEMES = ["Beach", "Mountain", "Backwaters", "Heritage", "Wildlife", "Beach + Culture"];

const emptyDay = (day) => ({
  dayNumber: day,
  heading: "",
  placeOption: null,  // { value: provinceId, label, stateName }
  place: "",          // backing string (state name) — populated from option
  placeId: null,      // numeric placeId sent to backend
  activities: "",
  imageFile: null,
  imagePreview: "",
  imagePath: "",
});

/**
 * Tries to parse a JSON-encoded list of strings out of a stored text column.
 * Falls back to a single-element array if the column contains plain text.
 */
const parseList = (raw) => {
  if (!raw) return [""];
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v) && v.length) return v.map(String);
  } catch {}
  return [String(raw)];
};

// Honeymoon add-on services are now FREE-FORM per package — the agent
// declares the list of add-ons offered with this package right here
// (just the names). Prices are set later on the Package Rates page,
// and the Booking page only surfaces add-ons that ended up with a
// non-zero rate.
//
// Each entry has a stable `key` (slug) plus a human label. Storage key
// per package: `honeymoon_addons_<packageId>` → { addOns: [{key,label,price}] }.

// Lowercase-slug from a label, used as a stable key. Falls back to a
// timestamp if the label is empty so collisions don't break list keys.
const slugifyAddOn = (label) => {
  const s = String(label || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || `addon-${Date.now().toString(36)}`;
};

// Ensure unique keys in case two labels slugify to the same thing.
const uniquifyKey = (key, used) => {
  if (!used.has(key)) {
    used.add(key);
    return key;
  }
  let i = 2;
  while (used.has(`${key}-${i}`)) i++;
  const k = `${key}-${i}`;
  used.add(k);
  return k;
};

// localStorage key per package — client-side fallback so the rates
// survive across pages even if the backend hasn't been extended to
// persist the `addOns` payload yet.
const addonsStorageKey = (packageId) =>
  packageId ? `honeymoon_addons_${packageId}` : null;

// Normalise an incoming list into [{key,label,price}] with unique keys.
const normaliseAddOns = (incoming) => {
  if (!Array.isArray(incoming)) return [];
  const used = new Set();
  return incoming
    .map((a) => {
      const label = String(a?.label || "").trim();
      if (!label) return null;
      const baseKey = a?.key && String(a.key).trim()
        ? String(a.key).trim()
        : slugifyAddOn(label);
      return {
        key: uniquifyKey(baseKey, used),
        label,
        price: Number(a?.price) || 0,
      };
    })
    .filter(Boolean);
};

const initialState = {
  packageName: "",
  packageCode: "",
  // NOTE: legacy fields (startingFrom, destination, country, totalRate,
  // perPaxRate) removed per spec — Honeymoon now uses arriveCountry +
  // arrivePlace and the per-package rate rows from HoneyMoonPackageRates.
  // We keep `country` so the day-wise itinerary place lookup still works.
  country: null, // react-select option (used only by day place lookup)
  // Arriving country + place (replaces the old startingFrom/destination).
  arriveCountry: null,
  arrivePlace: null,
  // Inclusion checkboxes — what the package contains.
  includeHotel: false,
  includeCab: false,
  includeActivity: false,
  noOfNights: 5,
  noOfDays: 6,
  currencyId: "",
  currencyCode: "INR",
  overview: "",
  highlights: "",
  category: "Romantic",
  theme: "Beach",
  rating: "",
  validityFrom: "",
  validityTo: "",
  hotelCategoryId: "",
  hotelCategoryLabel: "",
  mealPlanId: "",
  mealPlanLabel: "",
  // Multi-select meal plans — list of plan labels (e.g. ["Breakfast",
  // "Half Board"]). The legacy single-select fields above are kept so
  // older view-pages that read mealPlanLabel keep rendering something.
  mealPlans: [],
  status: "Active",
};

const HoneymoonRegistration = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [formData, setFormData] = useState(initialState);
  const [images, setImages] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [existingImages, setExistingImages] = useState([]);
  const [days, setDays] = useState([emptyDay(1)]);

  // Repeatable lists — start with a single empty row each.
  const [inclusions, setInclusions] = useState([""]);
  const [exclusions, setExclusions] = useState([""]);
  const [cancellationPolicies, setCancellationPolicies] = useState([""]);
  const [dateChangePolicies, setDateChangePolicies] = useState([""]);
  const [termsAndConditions, setTermsAndConditions] = useState([""]);

  // Per-package add-on services (free-form names). Agent types whatever
  // add-on names this package offers. Prices are set later on the
  // Package Rates page (/honeymoon/package-rates/:id) and only those
  // with a non-zero rate appear at booking time.
  // Stored shape: [{ key, label, price }]. price stays 0 here.
  const [addOns, setAddOns] = useState([{ key: slugifyAddOn(""), label: "", price: 0 }]);

  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);

  // Dropdown sources loaded from API
  const [countries, setCountries] = useState([]);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [destOptions, setDestOptions] = useState([]);
  const [destLoading, setDestLoading] = useState(false);
  // Starting From uses the same /api/province lookup as Destination, but its
  // own debounce + options state so the two typeaheads don't share results.
  const [fromOptions, setFromOptions] = useState([]);
  const [fromLoading, setFromLoading] = useState(false);
  const [currencies, setCurrencies] = useState([]);
  const [hotelCategories, setHotelCategories] = useState([]);
  const [mealPlans, setMealPlans] = useState([]);
  // Arrive-place options loaded from /api/province?countryId=… once an
  // Arrive Country is picked. Mirrors PackageReg behaviour.
  const [arrivePlaceOptions, setArrivePlaceOptions] = useState([]);
  const [arrivePlaceLoading, setArrivePlaceLoading] = useState(false);
  const arrivePlaceDebounceRef = useRef(null);

  // Load reference data on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCountriesLoading(true);
      try {
        const r = await axiosInstance.get("/api/country?limit=300");
        if (!cancelled)
          setCountries(
            (Array.isArray(r.data) ? r.data : []).map((c) => ({
              value: c.id,
              label: c.name,
              code: c.countryCode,
            }))
          );
      } catch {
        if (!cancelled) setCountries([]);
      } finally {
        if (!cancelled) setCountriesLoading(false);
      }
    })();
    (async () => {
      try {
        const r = await axiosInstance.get("/api/currency?page=0&limit=50");
        if (!cancelled) setCurrencies(Array.isArray(r.data) ? r.data : []);
      } catch {
        if (!cancelled) setCurrencies([]);
      }
    })();
    (async () => {
      try {
        const r = await axiosInstance.get("/api/hotelcategory?page=0&limit=50");
        if (!cancelled) setHotelCategories(Array.isArray(r.data) ? r.data : []);
      } catch {
        if (!cancelled) setHotelCategories([]);
      }
    })();
    (async () => {
      try {
        const r = await axiosInstance.get("/api/mealplan?page=0&limit=50");
        if (!cancelled) setMealPlans(Array.isArray(r.data) ? r.data : []);
      } catch {
        if (!cancelled) setMealPlans([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced /api/province?search= lookup, shared by Starting From + Destination.
  const provinceSearch = (input, setOptions, setLoading, debounceRef) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!input || input.length < 2) {
      setOptions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await axiosInstance.get(`/api/province?search=${encodeURIComponent(input)}`);
        const rows = Array.isArray(r.data) ? r.data : [];
        setOptions(
          rows.slice(0, 50).map((p) => ({
            value: p.id,
            label: `${p.stateName}${p.country ? ", " + p.country : ""}`,
            stateName: p.stateName,
            country: p.country,
            countryId: p.countryId,
          }))
        );
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const destDebounceRef = useRef(null);
  const searchDestinations = (input) =>
    provinceSearch(input, setDestOptions, setDestLoading, destDebounceRef);

  const fromDebounceRef = useRef(null);
  const searchStartingFrom = (input) =>
    provinceSearch(input, setFromOptions, setFromLoading, fromDebounceRef);

  // Preload package for edit mode.
  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const res = await axiosInstance.get(`/api/honeymoon/${id}`);
        const d = res.data;
        setFormData((p) => ({
          ...p,
          packageName: d.packageName || "",
          packageCode: d.packageCode || "",
          // legacy `country` field still used by the day-wise itinerary
          // place lookup — fall back to arriveCountryName.
          country: d.country
            ? { value: 0, label: d.country, code: "" }
            : d.arriveCountryName
            ? { value: d.arriveCountryId || 0, label: d.arriveCountryName, code: "" }
            : null,
          arriveCountry: d.arriveCountryId
            ? { value: d.arriveCountryId, label: d.arriveCountryName || "" }
            : null,
          arrivePlace: d.arrivePlaceId
            ? { value: d.arrivePlaceId, label: d.arrivePlaceName || "" }
            : null,
          includeHotel: !!d.containHotel,
          includeCab: !!d.containCab,
          includeActivity: !!d.containActivity,
          noOfNights: d.noOfNights || 5,
          noOfDays: d.noOfDays || 6,
          currencyCode: d.currency || "INR",
          overview: d.overview || "",
          highlights: d.highlights || "",
          category: d.category || "Romantic",
          theme: d.theme || "Beach",
          rating: d.rating || "",
          validityFrom: d.validityFrom ? d.validityFrom.slice(0, 16) : "",
          validityTo: d.validityTo ? d.validityTo.slice(0, 16) : "",
          hotelCategoryLabel: d.hotelCategory || "",
          mealPlanLabel: d.mealPlan || "",
          // Server returns the multi-select list in `mealPlans` (array of
          // labels). Older rows only have the single `mealPlan` CSV — fall
          // back to splitting that.
          mealPlans: Array.isArray(d.mealPlans) && d.mealPlans.length
            ? d.mealPlans
            : (typeof d.mealPlan === "string" && d.mealPlan
                ? d.mealPlan.split(",").map((s) => s.trim()).filter(Boolean)
                : []),
          status: d.status || "Active",
        }));
        setExistingImages(d.images || []);
        setDays(
          (d.itinerary || []).length
            ? d.itinerary.map((it, i) => ({
                dayNumber: it.dayNumber || i + 1,
                heading: it.heading || "",
                placeOption: it.place
                  ? { value: it.placeId || 0, label: it.place, stateName: it.place }
                  : null,
                place: it.place || "",
                placeId: it.placeId || null,
                activities: it.activities || "",
                imageFile: null,
                imagePreview: it.imagePath || "",
                imagePath: it.imagePath || "",
              }))
            : [emptyDay(1)]
        );
        setInclusions(parseList(d.inclusions));
        setExclusions(parseList(d.exclusions));
        setCancellationPolicies(parseList(d.cancellationPolicy));
        setDateChangePolicies(parseList(d.dateChangePolicy));
        setTermsAndConditions(parseList(d.termsAndConditions));

        // Add-on services (free-form). Prefer the server-side `addOns`,
        // fall back to a localStorage cache, finally fall back to a
        // single empty row so the agent can type.
        let storedAddOns = null;
        try {
          const raw = localStorage.getItem(addonsStorageKey(id));
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed?.addOns)) storedAddOns = parsed.addOns;
          }
        } catch {
          /* ignore — quota / private-mode */
        }
        const source = Array.isArray(d.addOns) && d.addOns.length
          ? d.addOns
          : storedAddOns;
        const normalised = normaliseAddOns(source);
        setAddOns(
          normalised.length
            ? normalised
            : [{ key: slugifyAddOn(""), label: "", price: 0 }]
        );
      } catch {
        toast.error("Failed to load package");
      }
    })();
  }, [id, isEdit]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((p) => ({ ...p, [name]: value }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: "" }));
  };

  const setField = (name, value) => {
    setFormData((p) => ({ ...p, [name]: value }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: "" }));
  };

  const handleImages = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setImages((p) => [...p, ...files]);
    setImagePreviews((p) => [...p, ...files.map((f) => URL.createObjectURL(f))]);
  };

  const removeNewImage = (idx) => {
    setImages((p) => p.filter((_, i) => i !== idx));
    setImagePreviews((p) => p.filter((_, i) => i !== idx));
  };

  const removeExistingImage = (idx) => setExistingImages((p) => p.filter((_, i) => i !== idx));

  const addDay = () => setDays((p) => [...p, emptyDay(p.length + 1)]);
  const removeDay = (idx) => setDays((p) => (p.length === 1 ? p : p.filter((_, i) => i !== idx)));
  const updateDay = (idx, field, value) =>
    setDays((p) => p.map((d, i) => (i === idx ? { ...d, [field]: value } : d)));
  const handleDayImage = (idx, file) => {
    if (!file) return;
    updateDay(idx, "imageFile", file);
    updateDay(idx, "imagePreview", URL.createObjectURL(file));
  };

  /** AsyncSelect loader for the day-wise Place column — the same
   *  country-scoped City list the "City" dropdown on Hotel Registration
   *  shows (HotelReg.jsx → loadProvinces, /api/province/getByCountryId/{id}),
   *  for the selected Arrive Country. The `search` param narrows by city
   *  name/code. Backend stores the selected option's id under placeId and
   *  its name under place. Arrive Country is read first because on edit the
   *  legacy `country` mirror is rebuilt with value 0. */
  const loadDayPlaceOptions = async (inputValue) => {
    const cId = formData.arriveCountry?.value || formData.country?.value;
    if (!cId) return [];
    try {
      const r = await axiosInstance.get(
        `/api/province/getByCountryId/${cId}?search=${encodeURIComponent(
          inputValue || ""
        )}`
      );
      const rows = Array.isArray(r.data) ? r.data : [];
      return rows
        .filter((p) => !p.isDeleted)
        .map((p) => ({
          // Option value keeps its existing "p_" prefix; the numeric id
          // sent to the backend travels in rawId (see onChange / submit).
          value: `p_${p.id}`,
          rawId: p.id,
          kind: "province",
          label: p.stateName || p.name,
          stateName: p.stateName || p.name,
        }));
    } catch {
      return [];
    }
  };

  // Helpers for repeatable rows.
  const addRow = (setter) => setter((p) => [...p, ""]);
  const removeRow = (setter, i) =>
    setter((p) => (p.length === 1 ? p : p.filter((_, idx) => idx !== i)));
  const updateRow = (setter, i, val) =>
    setter((p) => p.map((row, idx) => (idx === i ? val : row)));

  // Load places for the selected Arrive Country (used by the new Arrive
  // Place dropdown) — the same country-scoped City list the "City"
  // dropdown on Hotel Registration shows (HotelReg.jsx → loadProvinces,
  // /api/province/getByCountryId/{id}). The `search` param narrows by
  // city name/code.
  const loadArrivePlaces = async (countryId, search = "") => {
    if (!countryId) {
      setArrivePlaceOptions([]);
      return;
    }
    setArrivePlaceLoading(true);
    try {
      const r = await axiosInstance.get(
        `/api/province/getByCountryId/${countryId}?search=${encodeURIComponent(
          search
        )}`
      );
      const rows = Array.isArray(r.data) ? r.data : [];
      setArrivePlaceOptions(
        rows
          .filter((p) => !p.isDeleted)
          .map((p) => ({
            value: p.id,
            label: p.stateName || p.name,
          }))
      );
    } catch {
      setArrivePlaceOptions([]);
    } finally {
      setArrivePlaceLoading(false);
    }
  };

  const handleArriveCountryChange = (opt) => {
    setField("arriveCountry", opt);
    setField("arrivePlace", null);
    // Keep `country` mirrored so day-wise place lookup keeps working.
    setField("country", opt ? { value: opt.value, label: opt.label, code: "" } : null);
    setArrivePlaceOptions([]);
    if (opt?.value) loadArrivePlaces(opt.value);
  };

  const validate = () => {
    const err = {};
    if (!formData.packageName.trim()) err.packageName = "Package name is required";
    if (!formData.arriveCountry) err.arriveCountry = "Arrive Country is required";
    if (!formData.arrivePlace) err.arrivePlace = "Arrive Place is required";
    if (!formData.noOfNights || Number(formData.noOfNights) < 1)
      err.noOfNights = "At least 1 night";
    if (!isEdit && !images.length) err.images = "Upload at least 1 image";
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  /** Strips empty rows and serialises to JSON for the text column. */
  const serialiseList = (rows) => {
    const cleaned = (rows || []).map((s) => (s || "").trim()).filter(Boolean);
    if (!cleaned.length) return null;
    return JSON.stringify(cleaned);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      const data = {
        packageName: formData.packageName,
        packageCode: formData.packageCode,
        // legacy text fields removed from the form — leave blank.
        startingFrom: "",
        destination: "",
        country: formData.country?.label || formData.arriveCountry?.label || "",
        // New: arriveCountry + arrivePlace + include flags.
        arriveCountryId: formData.arriveCountry?.value || null,
        arriveCountryName: formData.arriveCountry?.label || null,
        arrivePlaceId: formData.arrivePlace?.value || null,
        arrivePlaceName: formData.arrivePlace?.label || null,
        containHotel: !!formData.includeHotel,
        containCab: !!formData.includeCab,
        containActivity: !!formData.includeActivity,
        noOfNights: Number(formData.noOfNights) || null,
        noOfDays: Number(formData.noOfDays) || null,
        currency: formData.currencyCode || "INR",
        overview: formData.overview,
        highlights: formData.highlights,
        category: formData.category,
        theme: formData.theme,
        rating: formData.rating || null,
        validityFrom: formData.validityFrom || null,
        validityTo: formData.validityTo || null,
        hotelCategory: formData.hotelCategoryLabel || null,
        // Multi-select list — server joins it into the legacy `meal_plan`
        // CSV column. Keep `mealPlan` populated with the first item so
        // older read paths still find a non-empty single value.
        mealPlans: Array.isArray(formData.mealPlans) ? formData.mealPlans : [],
        mealPlan: (formData.mealPlans && formData.mealPlans[0]) || formData.mealPlanLabel || null,
        inclusions: serialiseList(inclusions),
        exclusions: serialiseList(exclusions),
        cancellationPolicy: serialiseList(cancellationPolicies),
        dateChangePolicy: serialiseList(dateChangePolicies),
        termsAndConditions: serialiseList(termsAndConditions),
        // Per-package add-on service NAMES (free-form). Rates aren't set
        // here — they're entered on the Package Rates page and the
        // Booking screen only surfaces add-ons whose rate ends up
        // non-zero. We still ship a `price: 0` placeholder so the
        // shape stays stable for the rates page that reads this list.
        addOns: normaliseAddOns(
          addOns.filter((a) => (a.label || "").trim())
        ),
        status: formData.status,
        itinerary: days
          .filter((d) => d.heading || d.activities || d.place || d.placeOption)
          .map((d, i) => ({
            // Day number is always derived from the filtered row index so
            // the saved sequence stays 1, 2, 3, ... regardless of what
            // stale `dayNumber` may have been on the in-memory row.
            dayNumber: i + 1,
            heading: d.heading || "",
            // rawId carries the actual numeric id (province or destination).
            // placeOption.value is prefixed "p_…" / "d_…" purely to keep the
            // react-select option list collision-free.
            placeId: d.placeOption?.rawId ?? d.placeId ?? null,
            place: d.placeOption?.stateName || d.placeOption?.label || d.place || "",
            activities: d.activities || "",
            imagePath: d.imagePath || null,
          })),
      };
      fd.append("data", JSON.stringify(data));
      images.forEach((f) => fd.append("images", f));
      const filteredDays = days.filter(
        (d) => d.heading || d.activities || d.place || d.placeOption
      );
      filteredDays.forEach((d, i) => {
        if (d.imageFile instanceof File) fd.append(`dayImage_${i}`, d.imageFile);
      });

      const url = isEdit ? `/api/honeymoon/${id}` : "/api/honeymoon/save";
      const method = isEdit ? "put" : "post";
      const saveRes = await axiosInstance({ method, url, data: fd });

      // Mirror the add-on rates to localStorage keyed by package id so
      // the Booking screen can read them even if the backend hasn't been
      // extended yet to round-trip the `addOns` field.
      const savedId =
        id ||
        saveRes?.data?.id ||
        saveRes?.data?.packageId ||
        saveRes?.data?.honeymoonPackageId ||
        saveRes?.data?.data?.id ||
        null;
      if (savedId) {
        try {
          localStorage.setItem(
            addonsStorageKey(savedId),
            JSON.stringify({ addOns: data.addOns })
          );
        } catch {
          /* ignore — quota / private-mode */
        }
      }

      await Swal.fire({
        icon: "success",
        title: isEdit ? "Package Updated" : "Package Registered",
        timer: 1600,
        showConfirmButton: false,
      });
      navigate("/honeymoon/list");
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const rsStyles = (isInvalid) => ({
    control: (b, s) => ({
      ...b,
      minHeight: 38,
      borderColor: isInvalid ? "#dc3545" : s.isFocused ? "#86b7fe" : "#ced4da",
      boxShadow: s.isFocused
        ? isInvalid
          ? "0 0 0 .25rem rgba(220,53,69,.25)"
          : "0 0 0 .25rem rgba(13,110,253,.25)"
        : "none",
    }),
    menu: (b) => ({ ...b, zIndex: 5 }),
  });

  return (
    <div className="min-vh-100 d-flex flex-column" style={{ background: "#f5f7fb" }}>
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <Container fluid>
            <div className="d-flex justify-content-between align-items-center mb-4">
              <div>
                <h2 className="text-primary mb-1">
                  <FaSuitcaseRolling className="me-2" />
                  {isEdit ? "Edit Honeymoon Package" : "Register Honeymoon Package"}
                </h2>
                <p className="text-muted mb-0">
                  Curate a romantic getaway with itinerary, rates and policies.
                </p>
              </div>
              <Button
                variant="outline-secondary"
                onClick={() => navigate("/honeymoon/list")}
                className="rounded-pill"
              >
                <FaArrowLeft className="me-1" /> Back to List
              </Button>
            </div>

            <Form onSubmit={handleSubmit} noValidate>
              {/* Basic Details */}
              <Card className="mb-3 shadow-sm">
                <Card.Header className="bg-white fw-semibold">Basic Details</Card.Header>
                <Card.Body>
                  <Row className="g-3">
                    <Col md={4}>
                      <Form.Label>Package Name *</Form.Label>
                      <Form.Control
                        name="packageName"
                        value={formData.packageName}
                        onChange={handleChange}
                        isInvalid={!!errors.packageName}
                        placeholder="e.g. Maldives Bliss"
                      />
                      <Form.Control.Feedback type="invalid">{errors.packageName}</Form.Control.Feedback>
                    </Col>
                    <Col md={4}>
                      <Form.Label>Package Code</Form.Label>
                      <Form.Control name="packageCode" value={formData.packageCode} onChange={handleChange} />
                    </Col>
                    <Col md={4}>
                      <Form.Label>Status</Form.Label>
                      <Form.Select name="status" value={formData.status} onChange={handleChange}>
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                      </Form.Select>
                    </Col>

                    <Col md={4}>
                      <Form.Label>Arrive Country *</Form.Label>
                      <Select
                        options={countries}
                        value={formData.arriveCountry}
                        onChange={handleArriveCountryChange}
                        isLoading={countriesLoading}
                        isClearable
                        placeholder="Select arriving country"
                        styles={rsStyles(!!errors.arriveCountry)}
                      />
                      {errors.arriveCountry && (
                        <div className="text-danger small mt-1">{errors.arriveCountry}</div>
                      )}
                    </Col>
                    <Col md={4}>
                      <Form.Label>Arrive Place *</Form.Label>
                      <Select
                        options={arrivePlaceOptions}
                        value={formData.arrivePlace}
                        onChange={(opt) => setField("arrivePlace", opt)}
                        onInputChange={(input, meta) => {
                          if (meta.action !== "input-change") return;
                          if (arrivePlaceDebounceRef.current)
                            clearTimeout(arrivePlaceDebounceRef.current);
                          arrivePlaceDebounceRef.current = setTimeout(() => {
                            if (formData.arriveCountry?.value)
                              loadArrivePlaces(formData.arriveCountry.value, input);
                          }, 400);
                        }}
                        isLoading={arrivePlaceLoading}
                        isClearable
                        isDisabled={!formData.arriveCountry}
                        placeholder={
                          !formData.arriveCountry
                            ? "Select arrive country first"
                            : "Search and select place"
                        }
                        styles={rsStyles(!!errors.arrivePlace)}
                      />
                      {errors.arrivePlace && (
                        <div className="text-danger small mt-1">{errors.arrivePlace}</div>
                      )}
                    </Col>
                    <Col md={4}>
                      <Form.Label>Include</Form.Label>
                      <div className="d-flex gap-3 align-items-center pt-2">
                        <Form.Check
                          type="checkbox"
                          id="hm-incl-hotel"
                          label="Hotel"
                          checked={!!formData.includeHotel}
                          onChange={(e) => setField("includeHotel", e.target.checked)}
                        />
                        <Form.Check
                          type="checkbox"
                          id="hm-incl-cab"
                          label="Cab"
                          checked={!!formData.includeCab}
                          onChange={(e) => setField("includeCab", e.target.checked)}
                        />
                        <Form.Check
                          type="checkbox"
                          id="hm-incl-activity"
                          label="Activity"
                          checked={!!formData.includeActivity}
                          onChange={(e) => setField("includeActivity", e.target.checked)}
                        />
                      </div>
                    </Col>

                    <Col md={3}>
                      <Form.Label>Nights *</Form.Label>
                      <Form.Control
                        type="number"
                        min={1}
                        name="noOfNights"
                        value={formData.noOfNights}
                        onChange={handleChange}
                        isInvalid={!!errors.noOfNights}
                      />
                      <Form.Control.Feedback type="invalid">{errors.noOfNights}</Form.Control.Feedback>
                    </Col>
                    <Col md={3}>
                      <Form.Label>Days</Form.Label>
                      <Form.Control
                        type="number"
                        min={1}
                        name="noOfDays"
                        value={formData.noOfDays}
                        onChange={handleChange}
                      />
                    </Col>

                    <Col md={3}>
                      <Form.Label>Currency</Form.Label>
                      <Form.Select
                        value={formData.currencyCode}
                        onChange={(e) => {
                          const code = e.target.value;
                          const c = currencies.find((x) => x.currencyCode === code);
                          setField("currencyCode", code);
                          setField("currencyId", c?.currencyId || "");
                        }}
                      >
                        <option value="">Select currency</option>
                        {currencies.map((c) => (
                          <option key={c.currencyId} value={c.currencyCode}>
                            {c.currencyCode} — {String(c.name || "").trim()}
                          </option>
                        ))}
                      </Form.Select>
                    </Col>
                    <Col md={3}>
                      <Form.Label>Category</Form.Label>
                      <Form.Select name="category" value={formData.category} onChange={handleChange}>
                        {CATEGORIES.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </Form.Select>
                    </Col>
                    <Col md={3}>
                      <Form.Label>Theme</Form.Label>
                      <Form.Select name="theme" value={formData.theme} onChange={handleChange}>
                        {THEMES.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </Form.Select>
                    </Col>
                    <Col md={3}>
                      <Form.Label>Rating (0-5)</Form.Label>
                      <Form.Control
                        type="number"
                        step="0.1"
                        max="5"
                        min="0"
                        name="rating"
                        value={formData.rating}
                        onChange={handleChange}
                      />
                    </Col>

                    <Col md={3}>
                      <Form.Label>Validity From</Form.Label>
                      <Form.Control
                        type="datetime-local"
                        name="validityFrom"
                        value={formData.validityFrom}
                        onChange={handleChange}
                      />
                    </Col>
                    <Col md={3}>
                      <Form.Label>Validity To</Form.Label>
                      <Form.Control
                        type="datetime-local"
                        name="validityTo"
                        value={formData.validityTo}
                        onChange={handleChange}
                        min={formData.validityFrom}
                      />
                    </Col>
                    <Col md={3}>
                      <Form.Label>Hotel Category</Form.Label>
                      <Form.Select
                        value={formData.hotelCategoryId}
                        onChange={(e) => {
                          const idStr = e.target.value;
                          const h = hotelCategories.find((x) => String(x.hotelCategoryId) === idStr);
                          setField("hotelCategoryId", idStr);
                          setField("hotelCategoryLabel", h?.tagLine || h?.hotelCategory || "");
                        }}
                      >
                        <option value="">Select hotel category</option>
                        {hotelCategories.map((h) => (
                          <option key={h.hotelCategoryId} value={h.hotelCategoryId}>
                            {h.tagLine || h.hotelCategory}
                          </option>
                        ))}
                      </Form.Select>
                    </Col>
                    <Col md={3}>
                      <Form.Label>Meal Plan</Form.Label>
                      {/* Multi-select — the package may offer more than one
                          meal plan. Stored on the server as a comma-separated
                          string under `mealPlan`; the FE works with a plain
                          array of labels in `formData.mealPlans`. */}
                      <Select
                        isMulti
                        options={mealPlans.map((m) => ({
                          value: m.name,
                          label: m.name,
                          mealPlanId: m.mealPlanId,
                        }))}
                        value={(formData.mealPlans || []).map((name) => ({
                          value: name,
                          label: name,
                        }))}
                        onChange={(opts) => {
                          const list = Array.isArray(opts)
                            ? opts.map((o) => o.value).filter(Boolean)
                            : [];
                          setField("mealPlans", list);
                          // Keep the legacy single fields in sync with the
                          // first picked plan so existing read sites still
                          // render a label.
                          setField("mealPlanLabel", list[0] || "");
                          const firstOpt = Array.isArray(opts) ? opts[0] : null;
                          setField(
                            "mealPlanId",
                            firstOpt?.mealPlanId ? String(firstOpt.mealPlanId) : ""
                          );
                        }}
                        placeholder="Select meal plans..."
                        menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                        styles={{
                          menuPortal: (b) => ({ ...b, zIndex: 9999 }),
                          menu: (b) => ({ ...b, zIndex: 9999 }),
                        }}
                      />
                    </Col>

                    <Col md={12}>
                      <Form.Label>Overview</Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={3}
                        name="overview"
                        value={formData.overview}
                        onChange={handleChange}
                      />
                    </Col>
                    <Col md={12}>
                      <Form.Label>Highlights</Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={2}
                        name="highlights"
                        value={formData.highlights}
                        onChange={handleChange}
                        placeholder="• Sunset cruise • Private dinner • Couples spa"
                      />
                    </Col>
                  </Row>
                </Card.Body>
              </Card>

              {/* Images */}
              <Card className="mb-3 shadow-sm">
                <Card.Header className="bg-white fw-semibold">
                  <FaImages className="me-2 text-info" /> Package Images {!isEdit && "*"}
                </Card.Header>
                <Card.Body>
                  <Form.Control type="file" multiple accept="image/*" onChange={handleImages} />
                  {errors.images && <div className="text-danger small mt-1">{errors.images}</div>}
                  {(existingImages.length > 0 || imagePreviews.length > 0) && (
                    <div className="d-flex flex-wrap gap-2 mt-3">
                      {existingImages.map((src, i) => (
                        <div key={`e-${i}`} className="position-relative" style={{ width: 120, height: 90 }}>
                          <Image
                            src={src}
                            alt={`existing-${i}`}
                            style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 6, cursor: "pointer" }}
                            onClick={() => setPreviewImage(src)}
                          />
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => removeExistingImage(i)}
                            style={{ position: "absolute", top: 2, right: 2, padding: "0 6px", lineHeight: 1.1 }}
                          >
                            ×
                          </Button>
                        </div>
                      ))}
                      {imagePreviews.map((src, i) => (
                        <div key={i} className="position-relative" style={{ width: 120, height: 90 }}>
                          <Image
                            src={src}
                            alt={`img-${i}`}
                            style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 6, cursor: "pointer" }}
                            onClick={() => setPreviewImage(src)}
                          />
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => removeNewImage(i)}
                            style={{ position: "absolute", top: 2, right: 2, padding: "0 6px", lineHeight: 1.1 }}
                          >
                            ×
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </Card.Body>
              </Card>

              {/* Itinerary */}
              <Card className="mb-3 shadow-sm">
                <Card.Header className="bg-white d-flex justify-content-between align-items-center fw-semibold">
                  <span>
                    <FaRoute className="me-2 text-success" /> Day-wise Itinerary
                  </span>
                  <Button size="sm" variant="success" onClick={addDay}>
                    <FaPlus className="me-1" /> Add Day
                  </Button>
                </Card.Header>
                <Card.Body className="p-0">
                  <Table responsive bordered hover className="mb-0 align-middle">
                    <thead className="table-light">
                      <tr>
                        <th style={{ width: 60 }}>Day</th>
                        <th>Heading</th>
                        <th>Place</th>
                        <th>Activities</th>
                        <th style={{ width: 130 }}>Image</th>
                        <th style={{ width: 60 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {days.map((d, idx) => (
                        <tr key={idx}>
                          {/* Day number is purely a serial — always shows
                              the row's index + 1 and isn't user-editable.
                              Reordering / removing rows keeps the
                              sequence contiguous (Day 1, 2, 3, ...).
                              Rendered as plain text: a read-only
                              <Form.Control> in this 60px column was blank,
                              because the global .form-control padding
                              (Login.css) and the number spinner left no room
                              for the digit. */}
                          <td className="text-center fw-semibold">{idx + 1}</td>
                          <td>
                            <Form.Control
                              value={d.heading}
                              onChange={(e) => updateDay(idx, "heading", e.target.value)}
                              placeholder="Day heading"
                            />
                          </td>
                          <td style={{ minWidth: 220 }}>
                            <AsyncSelect
                              // Remount per Arrive Country so the default
                              // (pre-typed) City list and the option cache
                              // reload for the newly picked country —
                              // otherwise the list stays empty until typing.
                              key={`day-place-${idx}-${
                                formData.arriveCountry?.value ||
                                formData.country?.value ||
                                "none"
                              }`}
                              cacheOptions
                              defaultOptions
                              value={d.placeOption}
                              onChange={(opt) => {
                                updateDay(idx, "placeOption", opt);
                                // Use rawId — the prefixed `value` is just to
                                // keep province + destination ids unique in
                                // the option list, not what we send to the BE.
                                updateDay(idx, "placeId", opt?.rawId || null);
                                updateDay(idx, "place", opt?.stateName || opt?.label || "");
                              }}
                              loadOptions={loadDayPlaceOptions}
                              isClearable
                              placeholder={
                                formData.country ? "Search place..." : "Select country first"
                              }
                              isDisabled={!formData.country}
                              noOptionsMessage={({ inputValue }) =>
                                !formData.country
                                  ? "Select country first"
                                  : inputValue && inputValue.length < 1
                                  ? "Type to search"
                                  : "No matches"
                              }
                              // Portal the dropdown menu out of the table so
                              // it doesn't get clipped by the table's
                              // overflow / scroll container.
                              menuPortalTarget={document.body}
                              menuPosition="fixed"
                              styles={{
                                ...rsStyles(false),
                                menuPortal: (base) => ({ ...base, zIndex: 2000 }),
                              }}
                            />
                          </td>
                          <td>
                            <Form.Control
                              as="textarea"
                              rows={2}
                              value={d.activities}
                              onChange={(e) => updateDay(idx, "activities", e.target.value)}
                              placeholder="Day activities"
                            />
                          </td>
                          <td>
                            {d.imagePreview ? (
                              <Image
                                src={d.imagePreview}
                                style={{ width: 80, height: 50, objectFit: "cover", cursor: "pointer" }}
                                onClick={() => setPreviewImage(d.imagePreview)}
                              />
                            ) : (
                              <Form.Control
                                type="file"
                                size="sm"
                                accept="image/*"
                                onChange={(e) => handleDayImage(idx, e.target.files[0])}
                              />
                            )}
                          </td>
                          <td className="text-center">
                            <Button
                              variant="outline-danger"
                              size="sm"
                              disabled={days.length === 1}
                              onClick={() => removeDay(idx)}
                            >
                              <FaTrash />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Card.Body>
              </Card>

              {/* Add-on Services — free-form list. Agent enters the names
                  of add-ons offered with this package (e.g. "Candle Light
                  Dinner", "Sunset Cruise"). Rates are set later on the
                  Package Rates page, and the Booking screen only shows
                  add-ons that ended up with a non-zero rate. */}
              <Card className="shadow-sm mb-3">
                <Card.Header className="bg-white fw-semibold d-flex align-items-center justify-content-between">
                  <span>Add-on Services</span>
                  <div className="d-flex align-items-center gap-2">
                    <small className="text-muted fw-normal">
                      Add the names; rates are set in Package Rates.
                    </small>
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() =>
                        setAddOns((p) => [
                          ...p,
                          { key: slugifyAddOn("") + "-" + (p.length + 1), label: "", price: 0 },
                        ])
                      }
                    >
                      <FaPlus className="me-1" /> Add
                    </Button>
                  </div>
                </Card.Header>
                <Card.Body>
                  {addOns.length === 0 && (
                    <div className="text-muted small fst-italic">
                      No add-ons yet — click <strong>Add</strong> to list a service.
                    </div>
                  )}
                  {addOns.map((a, idx) => (
                    <InputGroup key={a.key} className="mb-2">
                      <InputGroup.Text style={{ minWidth: 50, justifyContent: "center" }}>
                        {idx + 1}
                      </InputGroup.Text>
                      <Form.Control
                        value={a.label}
                        placeholder="e.g. Candle Light Dinner"
                        onChange={(e) => {
                          const v = e.target.value;
                          setAddOns((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, label: v } : x
                            )
                          );
                        }}
                      />
                      <Button
                        variant="outline-danger"
                        disabled={addOns.length === 1}
                        onClick={() =>
                          setAddOns((p) =>
                            p.length === 1 ? p : p.filter((_, i) => i !== idx)
                          )
                        }
                      >
                        <FaTrash />
                      </Button>
                    </InputGroup>
                  ))}
                </Card.Body>
              </Card>

              {/* Inclusions / Exclusions */}
              <Row className="g-3">
                <Col md={6}>
                  <RepeatableList
                    title="Inclusions"
                    icon={<FaCheck className="text-success me-2" />}
                    items={inclusions}
                    onAdd={() => addRow(setInclusions)}
                    onRemove={(i) => removeRow(setInclusions, i)}
                    onChange={(i, v) => updateRow(setInclusions, i, v)}
                    placeholder="e.g. Return flights"
                  />
                </Col>
                <Col md={6}>
                  <RepeatableList
                    title="Exclusions"
                    icon={<FaTimes className="text-danger me-2" />}
                    items={exclusions}
                    onAdd={() => addRow(setExclusions)}
                    onRemove={(i) => removeRow(setExclusions, i)}
                    onChange={(i, v) => updateRow(setExclusions, i, v)}
                    placeholder="e.g. Travel insurance"
                  />
                </Col>
              </Row>

              {/* Policies */}
              <Row className="g-3 mt-0">
                <Col md={6}>
                  <RepeatableList
                    title="Cancellation Policy"
                    items={cancellationPolicies}
                    onAdd={() => addRow(setCancellationPolicies)}
                    onRemove={(i) => removeRow(setCancellationPolicies, i)}
                    onChange={(i, v) => updateRow(setCancellationPolicies, i, v)}
                    asTextarea
                    placeholder="e.g. Free cancellation up to 30 days before departure"
                  />
                </Col>
                <Col md={6}>
                  <RepeatableList
                    title="Date Change Policy"
                    items={dateChangePolicies}
                    onAdd={() => addRow(setDateChangePolicies)}
                    onRemove={(i) => removeRow(setDateChangePolicies, i)}
                    onChange={(i, v) => updateRow(setDateChangePolicies, i, v)}
                    asTextarea
                    placeholder="e.g. Date change allowed up to 15 days before"
                  />
                </Col>
                <Col md={12}>
                  <RepeatableList
                    title="Terms and Conditions"
                    items={termsAndConditions}
                    onAdd={() => addRow(setTermsAndConditions)}
                    onRemove={(i) => removeRow(setTermsAndConditions, i)}
                    onChange={(i, v) => updateRow(setTermsAndConditions, i, v)}
                    asTextarea
                    placeholder="e.g. Valid passport required (min 6 months validity)"
                  />
                </Col>
              </Row>

              <div className="d-flex justify-content-end gap-2 py-4">
                <Button variant="outline-secondary" type="button" onClick={() => navigate("/honeymoon/list")}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={saving}>
                  <FaSave className="me-1" /> {saving ? "Saving..." : "Save Package"}
                </Button>
              </div>
            </Form>
          </Container>
        </main>
      </div>

      <Modal show={!!previewImage} onHide={() => setPreviewImage(null)} centered size="lg">
        <Modal.Body className="p-0">
          {previewImage && <img src={previewImage} alt="preview" style={{ width: "100%" }} />}
        </Modal.Body>
      </Modal>
    </div>
  );
};

/** Dynamic list of text rows with add/remove buttons. */
const RepeatableList = ({
  title,
  icon,
  items,
  onAdd,
  onRemove,
  onChange,
  placeholder,
  asTextarea,
}) => (
  <Card className="shadow-sm h-100">
    <Card.Header className="bg-white d-flex justify-content-between align-items-center fw-semibold">
      <span>
        {icon}
        {title}
      </span>
      <Button size="sm" variant="success" onClick={onAdd}>
        <FaPlus className="me-1" /> Add
      </Button>
    </Card.Header>
    <Card.Body>
      {items.map((value, i) => (
        <InputGroup key={i} className="mb-2">
          {asTextarea ? (
            <Form.Control
              as="textarea"
              rows={2}
              value={value}
              onChange={(e) => onChange(i, e.target.value)}
              placeholder={placeholder}
            />
          ) : (
            <Form.Control
              value={value}
              onChange={(e) => onChange(i, e.target.value)}
              placeholder={placeholder}
            />
          )}
          <Button
            variant="outline-danger"
            disabled={items.length === 1}
            onClick={() => onRemove(i)}
          >
            <FaTrash />
          </Button>
        </InputGroup>
      ))}
    </Card.Body>
  </Card>
);

export default HoneymoonRegistration;
