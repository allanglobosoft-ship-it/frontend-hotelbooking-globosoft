import React, { useEffect, useRef, useState } from "react";
import {
  Card,
  Button,
  Form,
  Row,
  Col,
  Table,
  Modal,
  Badge,
  Image,
} from "react-bootstrap";
import {
  FaPlus,
  FaTrash,
  FaEdit,
  FaUtensils,
  FaMapMarkerAlt,
  FaImages,
  FaSave,
  FaArrowLeft,
  FaFilePdf,
  FaExternalLinkAlt,
} from "react-icons/fa";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import Select from "react-select";

/**
 * Restaurant Registration Form.
 * Backend contract (expected):
 *   POST /api/restaurant/save  (multipart/form-data)
 *     - JSON fields for restaurant, menu list
 *     - "images" : File[]      (multiple restaurant images)
 *     - "menuImage_<index>" : File   (per-menu image)
 *   GET  /api/restaurant/{id}
 */
const CUISINE_OPTIONS = [
  "Indian",
  "Chinese",
  "Italian",
  "Continental",
  "Arabic",
  "Mughlai",
  "South Indian",
  "North Indian",
  "Thai",
  "Japanese",
  "Mexican",
  "Fast Food",
  "Seafood",
  "BBQ",
  "Bakery",
];

const FOOD_TYPES = ["Veg", "Non-Veg", "Both", "Vegan"];
const DRESS_CODES = ["Casual", "Smart Casual", "Formal", "Beach Wear"];
const MEAL_CATEGORIES = [
  "Starter",
  "Main Course",
  "Snacks",
  "Soup",
  "Salad",
  "Dessert",
  "Beverage",
  "Breakfast",
  "Special",
];

const initialState = {
  // Basic details
  restaurantName: "",
  place: "",
  address: "",
  locationUrl: "",
  latitude: "",
  longitude: "",
  contactNumber: "",
  alternateNumber: "",
  email: "",
  website: "",
  openTime: "",
  closeTime: "",
  description: "",
  status: "Active",

  // Extra useful fields
  cuisineTypes: [],
  foodType: "Both",
  averageCostForTwo: "",
  pricePerPerson: "",
  seatingCapacity: "",
  numberOfTables: "",
  dressCode: "Casual",
  // Legacy single-text fields — kept so older flows don't break. The new
  // UI writes into reservationPolicies / cancellationPolicies (lists)
  // below; the single fields are populated with the first row on save
  // for backwards compatibility.
  reservationPolicy: "",
  cancellationPolicy: "",
  // Multi-row reservation policies — persisted as RestaurantReservationPolicy
  // rows on the backend (restaurant_book_reservation_policy table).
  reservationPolicies: [],
  // Multi-row cancellation policies — persisted as RestaurantCancellationPolicy
  // rows (restaurant_book_cancellation_policy table).
  cancellationPolicies: [],

  // Amenities (boolean toggles)
  hasParking: false,
  hasWifi: false,
  hasAc: true,
  hasOutdoorSeating: false,
  hasLiveMusic: false,
  servesAlcohol: false,
  isPureVeg: false,
  isFamilyFriendly: true,
  petFriendly: false,
  homeDelivery: false,
  takeAway: true,

  // Booking modes — which reservation flow this restaurant offers.
  // "Walk-in" = free to available, "Advance" = reserved slot, "Both" = either.
  bookingModes: "Both",
  // Minimum lead time (hours) for an Advance booking.
  advanceBookingMinHours: 2,

  // Social
  facebookUrl: "",
  instagramUrl: "",

  // Tax
  gstNumber: "",
  taxPercent: "",

  // Inside-a-hotel flag + hotel reference. When isInsideHotel is true the
  // operator picks a hotel from /api/hotels?search=... and we capture both
  // the id and the display name. Defaults to NO.
  isInsideHotel: false,
  hotelId: null,
  hotelName: "",

  // Destination / Province FK (from /api/destination + /api/province) —
  // drives the Place dropdown. placeSource indicates which master table
  // destinationId points at. The denormalised destinationName is also
  // kept in sync so the list / search pages can render the city without
  // an extra join.
  destinationId: null,
  destinationName: "",
  placeSource: "",
  // Country FK + denormalised name. REQUIRED on the form — it scopes the
  // Place/City dropdown and is persisted so the restaurant search's
  // country filter can match this restaurant (register → search → booking).
  countryId: null,
  countryName: "",
  // Currency (from /api/currency) — persisted as currencyId on the entity.
  // We also store the human-readable currencyCode for fast list rendering.
  currencyId: null,
  currencyCode: "",
  // Star rating from /api/hotelCategory — same scale that hotels use.
  // Drives the restaurant list & search rating filter.
  hotelCategoryId: null,
  starRating: null,

  // Weekday Offers + Special Promotions — repeater rows. Persisted as
  // RestaurantPromotion rows on save (one row per item).
  promotions: [], // each item: { promotionType, name, description,
                   //              discountPercent, validFrom, validTo,
                   //              dayMask, appliesAllDays, isActive }
};

/** Days of the week used by the WEEKDAY promotion picker. */
const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const emptyMenuRow = () => ({
  menuName: "",
  category: "Main Course",
  price: "",
  description: "",
  isVeg: true,
  isAvailable: true,
  image: null,
  imagePreview: "",
});

const RestaurantRegistration = () => {
  const navigate = useNavigate();
  // /restaurant/edit/:id mounts this same component; presence of :id ⇒ edit mode.
  const { id } = useParams();
  const isEdit = !!id;

  const [formData, setFormData] = useState(initialState);
  const [images, setImages] = useState([]); // File[]  — newly uploaded files
  const [imagePreviews, setImagePreviews] = useState([]);
  // When editing, the existing image URLs come back from the server; keep
  // them separate so the user can delete individual ones.
  const [existingImages, setExistingImages] = useState([]);
  const [menuList, setMenuList] = useState([emptyMenuRow()]);
  // Menu PDFs — newly uploaded File objects this session
  const [menuPdfFiles, setMenuPdfFiles] = useState([]);
  // Already-saved menu PDFs returned by the backend in edit mode (kept
  // separate so the user can delete individual ones without re-uploading).
  // Each item: { id?, fileUrl, displayName, displayOrder? }
  const [existingMenuPdfs, setExistingMenuPdfs] = useState([]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(isEdit);
  const [previewImage, setPreviewImage] = useState(null);

  // ── Currency + star-rating + destination dropdown data ────────────────
  // Loaded once on mount. Currency from /api/currency, star ratings from
  // /api/hotelcategory, destinations from /api/destination.
  const [currencyOptions, setCurrencyOptions] = useState([]);
  const [starOptions, setStarOptions] = useState([]);
  const [destinationOptions, setDestinationOptions] = useState([]);
  const [destinationLoading, setDestinationLoading] = useState(false);
  // Country dropdown — REQUIRED, and drives the Place/City list.
  const [countryOptions, setCountryOptions] = useState([]);
  const [countriesLoading, setCountriesLoading] = useState(false);

  /** Debounced /api/country lookup so the country dropdown narrows as the
   *  user types over a large country list. */
  const countryDebounceRef = useRef(null);
  const searchCountries = (input) => {
    if (countryDebounceRef.current) clearTimeout(countryDebounceRef.current);
    countryDebounceRef.current = setTimeout(async () => {
      setCountriesLoading(true);
      try {
        const q = input ? `?search=${encodeURIComponent(input)}` : "";
        const res = await axiosInstance.get(`/api/country${q}`);
        const list = Array.isArray(res.data) ? res.data : res.data?.content || [];
        setCountryOptions(list);
      } catch {
        setCountryOptions([]);
      } finally {
        setCountriesLoading(false);
      }
    }, 300);
  };

  /** Load the Place/City options for ONE country. The picker is
   *  country-scoped — it never loads the full master list. Sourced from
   *  GET /api/province/getByCountryId/{id}, the same list the "City"
   *  dropdown on Hotel Registration (HotelReg.jsx → loadProvinces) shows,
   *  rendered by `stateName`. Each option keeps its
   *  (destinationId, placeSource = PROVINCE) so the save / search payload
   *  contract is unchanged and matches RestaurantSearch.jsx. */
  const loadPlacesByCountry = async (countryId) => {
    if (!countryId) {
      setDestinationOptions([]);
      return;
    }
    setDestinationLoading(true);
    try {
      const res = await axiosInstance.get(
        `/api/province/getByCountryId/${countryId}`
      );
      const cityRows = Array.isArray(res.data) ? res.data : [];
      const cityOpts = cityRows
        .filter((s) => !s.isDeleted)
        .map((s) => {
          const name = s.stateName || s.name || `City #${s.id}`;
          return {
            value: `PROVINCE:${s.id}`,
            id: s.id,
            source: "PROVINCE",
            label: name,
          };
        });
      setDestinationOptions(cityOpts);
    } catch {
      // keep last good options on failure
    } finally {
      setDestinationLoading(false);
    }
  };

  // Hotel autocomplete (only used when isInsideHotel === true). We hit
  // /api/hotels?search=<text> on every keystroke (debounced) and surface
  // the suggestions in a dropdown. If the endpoint isn't available the
  // UI gracefully falls back to a plain text input.
  const [hotelSuggestions, setHotelSuggestions] = useState([]);
  const [hotelSearchText, setHotelSearchText] = useState("");
  const [hotelLookupAvailable, setHotelLookupAvailable] = useState(true);
  const [showHotelSuggestions, setShowHotelSuggestions] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // /api/currency returns { currencyId, name, currencyCode, isDeleted }
      try {
        const res = await axiosInstance.get("/api/currency?page=0&limit=50");
        const list = Array.isArray(res.data) ? res.data : res.data?.content || [];
        if (!cancelled) {
          setCurrencyOptions(
            list
              .filter((c) => !c.isDeleted)
              .map((c) => ({
                value: c.currencyId,
                label: `${c.currencyCode} — ${(c.name || "").trim()}`,
                currencyCode: c.currencyCode,
              }))
          );
        }
      } catch {
        if (!cancelled) setCurrencyOptions([]);
      }
      // /api/hotelcategory shape (per spec):
      //   [{ hotelCategoryId, hotelCategory: "3", tagLine: "3 Star", isDeleted }]
      // The dropdown displays `tagLine`; the save payload carries
      // `hotelCategoryId` (DB FK). `starRating` is parsed from the
      // numeric `hotelCategory` field so the search filter can still
      // match by numeric stars.
      try {
        const res = await axiosInstance.get("/api/hotelcategory?page=0&limit=10");
        const list = Array.isArray(res.data) ? res.data : res.data?.content || [];
        if (!cancelled) {
          setStarOptions(
            list
              // Skip soft-deleted categories so the dropdown stays clean.
              .filter((c) => !c.isDeleted)
              .map((c) => {
                // hotelCategory is the raw star count as a string ("3"),
                // tagLine is the user-facing label ("3 Star"). Fall back to
                // tagLine parsing if the API ever returns a non-numeric
                // value in hotelCategory.
                const parsedStars = parseInt(c.hotelCategory, 10);
                return {
                  value: c.hotelCategoryId,
                  label: c.tagLine || `${c.hotelCategory} Star`,
                  starRating: Number.isFinite(parsedStars) ? parsedStars : null,
                };
              })
          );
        }
      } catch {
        if (!cancelled) setStarOptions([]);
      }
      // Country list for the (required) Country dropdown. The Place / City
      // options are NOT pre-loaded here anymore — they load on demand once
      // a country is picked (see loadPlacesByCountry), so the dropdown only
      // ever shows cities/places belonging to the chosen country.
      try {
        const res = await axiosInstance.get("/api/country");
        const list = Array.isArray(res.data) ? res.data : res.data?.content || [];
        if (!cancelled) setCountryOptions(list);
      } catch {
        if (!cancelled) setCountryOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Hotel autocomplete (debounced) ──────────────────────────────────
  // Triggered while the user types in the Hotel Name field after toggling
  // "Is Restaurant Inside Hotel?" -> Yes. Falls back to plain text input
  // if /api/hotels?search=... isn't reachable.
  useEffect(() => {
    if (!formData.isInsideHotel) return;
    if (!hotelLookupAvailable) return;
    const q = (hotelSearchText || "").trim();
    if (q.length < 2) {
      setHotelSuggestions([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await axiosInstance.get(
          `/api/hotels?search=${encodeURIComponent(q)}`
        );
        const list = Array.isArray(res.data) ? res.data : res.data?.content || [];
        if (!cancelled) {
          setHotelSuggestions(
            list.slice(0, 10).map((h) => ({
              id: h.id ?? h.hotelId,
              name: h.name ?? h.hotelName ?? h.title ?? `Hotel #${h.id ?? h.hotelId}`,
            }))
          );
        }
      } catch {
        if (!cancelled) {
          // Endpoint not wired — disable lookup so we don't keep retrying
          // on every keystroke. UI degrades to a plain text input.
          setHotelSuggestions([]);
          setHotelLookupAvailable(false);
        }
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [hotelSearchText, formData.isInsideHotel, hotelLookupAvailable]);

  // Prefill form when in edit mode.
  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await axiosInstance.get(`/api/restaurant/${id}`);
        const d = res.data;
        if (cancelled) return;
        setFormData({
          restaurantName: d.restaurantName || "",
          place: d.place || "",
          address: d.address || "",
          locationUrl: d.locationUrl || "",
          latitude: d.latitude || "",
          longitude: d.longitude || "",
          contactNumber: d.contactNumber || "",
          alternateNumber: d.alternateNumber || "",
          email: d.email || "",
          website: d.website || "",
          openTime: (d.openTime || "").slice(0, 5),
          closeTime: (d.closeTime || "").slice(0, 5),
          description: d.description || "",
          status: d.status || "Active",
          cuisineTypes: Array.isArray(d.cuisineTypes) ? d.cuisineTypes : [],
          foodType: d.foodType || "Both",
          averageCostForTwo: d.averageCostForTwo ?? "",
          pricePerPerson: d.pricePerPerson ?? "",
          seatingCapacity: d.seatingCapacity ?? "",
          numberOfTables: d.numberOfTables ?? "",
          dressCode: d.dressCode || "Casual",
          reservationPolicy: d.reservationPolicy || "",
          cancellationPolicy: d.cancellationPolicy || "",
          // New multi-row lists. Backend returns them as
          // d.reservationPolicies + d.cancellationPoliciesList; if a row
          // has only the legacy single text we seed one row from it.
          reservationPolicies: Array.isArray(d.reservationPolicies) && d.reservationPolicies.length
            ? d.reservationPolicies.map((p) => ({
                title: p.title || "",
                policyText: p.policyText || "",
                isActive: p.isActive !== false,
              }))
            : (d.reservationPolicy ? [{ title: "", policyText: d.reservationPolicy, isActive: true }] : []),
          cancellationPolicies: Array.isArray(d.cancellationPoliciesList) && d.cancellationPoliciesList.length
            ? d.cancellationPoliciesList.map((p) => ({
                title: p.title || "",
                policyText: p.policyText || "",
                daysBeforeBooking: p.daysBeforeBooking ?? "",
                chargePercent: p.chargePercent ?? "",
                isActive: p.isActive !== false,
              }))
            : (d.cancellationPolicy ? [{ title: "", policyText: d.cancellationPolicy, daysBeforeBooking: "", chargePercent: "", isActive: true }] : []),
          hasParking: !!d.hasParking,
          hasWifi: !!d.hasWifi,
          hasAc: d.hasAc ?? true,
          hasOutdoorSeating: !!d.hasOutdoorSeating,
          hasLiveMusic: !!d.hasLiveMusic,
          servesAlcohol: !!d.servesAlcohol,
          isPureVeg: !!d.isPureVeg,
          isFamilyFriendly: d.isFamilyFriendly ?? true,
          petFriendly: !!d.petFriendly,
          homeDelivery: !!d.homeDelivery,
          takeAway: d.takeAway ?? true,
          bookingModes: d.bookingModes || "Both",
          advanceBookingMinHours: d.advanceBookingMinHours ?? 2,
          facebookUrl: d.facebookUrl || "",
          instagramUrl: d.instagramUrl || "",
          gstNumber: d.gstNumber || "",
          taxPercent: d.taxPercent ?? "",
          // Destination / Province + country + currency + star rating
          destinationId: d.destinationId || null,
          destinationName: d.destinationName || d.place || "",
          placeSource: d.placeSource || "",
          countryId: d.countryId || null,
          countryName: d.countryName || "",
          currencyId: d.currencyId || null,
          currencyCode: d.currencyCode || "",
          hotelCategoryId: d.hotelCategoryId || null,
          starRating: d.starRating ?? null,
          // Inside-hotel fields. Backend may not have them on legacy
          // rows — fall back to blank/false so the form still loads cleanly.
          isInsideHotel: !!d.isInsideHotel,
          hotelId: d.hotelId ?? null,
          hotelName: d.hotelName || "",
          // Promotions — saved as RestaurantPromotion rows. Normalise the
          // dayMask back into an array for the multi-select UI; the save
          // path re-joins it before sending.
          promotions: Array.isArray(d.promotions)
            ? d.promotions.map((p) => ({
                promotionType: p.promotionType || "SPECIAL",
                name: p.name || "",
                description: p.description || "",
                discountPercent: p.discountPercent ?? "",
                validFrom: p.validFrom || "",
                validTo: p.validTo || "",
                dayMaskList: p.dayMask
                  ? p.dayMask.split(",").filter(Boolean)
                  : [],
                appliesAllDays: !!p.appliesAllDays,
                isActive: p.isActive !== false,
              }))
            : [],
        });
        // Pre-load the saved country's Place/City options so the restored
        // city/place selection resolves to a real option on edit.
        if (d.countryId) loadPlacesByCountry(d.countryId);
        // Seed the hotel autocomplete textbox so edit mode shows the saved
        // hotel name without forcing the operator to re-search.
        if (d.isInsideHotel && d.hotelName) {
          setHotelSearchText(d.hotelName);
        }
        setExistingImages(Array.isArray(d.images) ? d.images : []);
        setExistingMenuPdfs(
          Array.isArray(d.menuPdfs)
            ? d.menuPdfs.filter((p) => p && p.fileUrl)
            : []
        );
        const menus = Array.isArray(d.menuList) && d.menuList.length
          ? d.menuList.map((m) => ({
              menuName: m.menuName || "",
              category: m.category || "Main Course",
              price: m.price ?? "",
              description: m.description || "",
              isVeg: m.isVeg ?? true,
              isAvailable: m.isAvailable ?? true,
              image: null,
              imagePreview: m.image || "",
            }))
          : [emptyMenuRow()];
        setMenuList(menus);
      } catch (e) {
        console.error(e);
        toast.error("Failed to load restaurant");
      } finally {
        if (!cancelled) setLoadingExisting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isEdit]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const toggleCuisine = (c) => {
    setFormData((prev) => {
      const has = prev.cuisineTypes.includes(c);
      return {
        ...prev,
        cuisineTypes: has
          ? prev.cuisineTypes.filter((x) => x !== c)
          : [...prev.cuisineTypes, c],
      };
    });
  };

  const handleImagesUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const newPreviews = files.map((f) => URL.createObjectURL(f));
    setImages((prev) => [...prev, ...files]);
    setImagePreviews((prev) => [...prev, ...newPreviews]);
  };

  const removeImage = (idx) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
    setImagePreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  /* ---------- menu rows ---------- */
  const addMenuRow = () =>
    setMenuList((prev) => [...prev, emptyMenuRow()]);

  const removeMenuRow = (idx) =>
    setMenuList((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));

  const updateMenuRow = (idx, field, value) =>
    setMenuList((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row))
    );

  const handleMenuImage = (idx, file) => {
    if (!file) return;
    updateMenuRow(idx, "image", file);
    updateMenuRow(idx, "imagePreview", URL.createObjectURL(file));
  };

  /* ---------- menu PDF uploads ---------- */
  const handleMenuPdfsUpload = (e) => {
    const picked = Array.from(e.target.files || []);
    // Accept PDFs only — quietly drop anything else and inform the user.
    const pdfs = picked.filter(
      (f) => f && (f.type === "application/pdf" || /\.pdf$/i.test(f.name))
    );
    const rejected = picked.length - pdfs.length;
    if (rejected > 0) {
      toast.error(`Skipped ${rejected} non-PDF file(s).`);
    }
    if (!pdfs.length) {
      // Reset the input so picking the same file again still fires change.
      e.target.value = "";
      return;
    }
    setMenuPdfFiles((prev) => [...prev, ...pdfs]);
    if (errors.menuPdfs) setErrors((p) => ({ ...p, menuPdfs: "" }));
    // Clear the input so a re-pick of the same file fires change again.
    e.target.value = "";
  };

  const removeNewMenuPdf = (idx) =>
    setMenuPdfFiles((prev) => prev.filter((_, i) => i !== idx));

  const removeExistingMenuPdf = (idx) =>
    setExistingMenuPdfs((prev) => prev.filter((_, i) => i !== idx));

  /* ---------- promotion rows (weekday offers + special promotions) ----- */
  /** Append a new promotion row. `type` distinguishes WEEKDAY from SPECIAL —
   *  the UI is largely the same but WEEKDAY surfaces day-of-week checkboxes
   *  while SPECIAL surfaces a date range + "applies all days" toggle. */
  const addPromotion = (type) =>
    setFormData((prev) => ({
      ...prev,
      promotions: [
        ...prev.promotions,
        {
          promotionType: type,
          name: "",
          description: "",
          discountPercent: "",
          validFrom: "",
          validTo: "",
          dayMaskList: type === "WEEKDAY" ? [] : [],
          appliesAllDays: type === "SPECIAL",
          isActive: true,
        },
      ],
    }));

  const removePromotion = (idx) =>
    setFormData((prev) => ({
      ...prev,
      promotions: prev.promotions.filter((_, i) => i !== idx),
    }));

  const updatePromotion = (idx, field, value) =>
    setFormData((prev) => ({
      ...prev,
      promotions: prev.promotions.map((p, i) =>
        i === idx ? { ...p, [field]: value } : p
      ),
    }));

  const toggleWeekdayInPromotion = (idx, day) =>
    setFormData((prev) => ({
      ...prev,
      promotions: prev.promotions.map((p, i) => {
        if (i !== idx) return p;
        const has = p.dayMaskList.includes(day);
        return {
          ...p,
          dayMaskList: has
            ? p.dayMaskList.filter((d) => d !== day)
            : [...p.dayMaskList, day],
        };
      }),
    }));

  /* ---------- reservation + cancellation policy repeaters --------------
   * Each clause becomes a row on the backend (restaurant_book_*_policy).
   * Helpers below are mirrors of the promotion repeater pattern. */
  const addReservationPolicy = () =>
    setFormData((prev) => ({
      ...prev,
      reservationPolicies: [
        ...prev.reservationPolicies,
        { title: "", policyText: "", isActive: true },
      ],
    }));
  const removeReservationPolicy = (idx) =>
    setFormData((prev) => ({
      ...prev,
      reservationPolicies: prev.reservationPolicies.filter((_, i) => i !== idx),
    }));
  const updateReservationPolicy = (idx, field, value) =>
    setFormData((prev) => ({
      ...prev,
      reservationPolicies: prev.reservationPolicies.map((p, i) =>
        i === idx ? { ...p, [field]: value } : p
      ),
    }));

  const addCancellationPolicy = () =>
    setFormData((prev) => ({
      ...prev,
      cancellationPolicies: [
        ...prev.cancellationPolicies,
        {
          title: "",
          policyText: "",
          daysBeforeBooking: "",
          chargePercent: "",
          isActive: true,
        },
      ],
    }));
  const removeCancellationPolicy = (idx) =>
    setFormData((prev) => ({
      ...prev,
      cancellationPolicies: prev.cancellationPolicies.filter((_, i) => i !== idx),
    }));
  const updateCancellationPolicy = (idx, field, value) =>
    setFormData((prev) => ({
      ...prev,
      cancellationPolicies: prev.cancellationPolicies.map((p, i) =>
        i === idx ? { ...p, [field]: value } : p
      ),
    }));

  /* ---------- validation ----------
   * Always-required (both create + edit): name, place, address, contact,
   * email, and basic contact / email shape. These are also enforced
   * server-side in RestaurantServiceImpl#validate.
   *
   * Create-only requirements: at least one image, at least one menu
   * PDF, and timings. Restaurants that pre-date these UX additions can
   * be edited without forcing the operator to re-supply files / times
   * that aren't part of the change they're making. Validation here
   * always uses `?.trim() ||` so a null field from the API response
   * doesn't crash with "cannot read properties of null".
   */
  const validate = () => {
    const err = {};
    const trimOr = (v) => (typeof v === "string" ? v.trim() : "");

    if (!trimOr(formData.restaurantName))
      err.restaurantName = "Restaurant name is required";
    // Country is required and scopes the Place/City list.
    if (!formData.countryId) err.country = "Country is required";
    // Place now lives in the destination dropdown — accept either the
    // FK (destinationId) or the legacy free-text place for older flows.
    if (!formData.destinationId && !trimOr(formData.place))
      err.place = "Place is required";
    if (!trimOr(formData.address)) err.address = "Address is required";

    if (!trimOr(formData.contactNumber)) err.contactNumber = "Contact number is required";
    else if (!/^[0-9+\-\s]{7,15}$/.test(formData.contactNumber))
      err.contactNumber = "Invalid contact number";

    if (!trimOr(formData.email)) err.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(formData.email)) err.email = "Invalid email";

    if (!isEdit) {
      // Create-only requirements — relaxed in edit mode so legacy
      // restaurant rows without timings / menus / images can still be
      // updated without forcing the operator to re-supply unrelated
      // fields just to save a name change.
      if (!formData.openTime) err.openTime = "Open time is required";
      if (!formData.closeTime) err.closeTime = "Close time is required";
      if (!images.length && !existingImages.length)
        err.images = "Please upload at least 1 image";
      if (menuPdfFiles.length === 0 && existingMenuPdfs.length === 0)
        err.menuPdfs = "Upload at least 1 menu PDF";
    }

    setErrors(err);
    return Object.keys(err).length === 0;
  };

  /**
   * Builds the toast message the operator sees when validation fails.
   * Listing the specific failing fields turns the previous opaque
   * "fix the errors in the form" into something actionable — useful
   * for fields outside the current scroll position (e.g. menu PDFs at
   * the bottom of a long form).
   */
  const summariseErrors = (errMap) => {
    const labels = {
      restaurantName: "Restaurant name",
      country: "Country",
      place: "Place / destination",
      address: "Address",
      contactNumber: "Contact number",
      email: "Email",
      openTime: "Open time",
      closeTime: "Close time",
      images: "Restaurant images",
      menuPdfs: "Menu PDF",
    };
    const missing = Object.keys(errMap)
      .map((k) => labels[k] || k)
      .filter(Boolean);
    if (missing.length === 0) return "Please fix the errors in the form";
    if (missing.length === 1) return `Please fix: ${missing[0]}`;
    return `Please fix: ${missing.slice(0, 3).join(", ")}${
      missing.length > 3 ? ` and ${missing.length - 3} more` : ""
    }`;
  };

  /* ---------- submit ---------- */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      // Pull the latest error map out of state via the same validate
      // call so we can show the operator EXACTLY which fields are
      // failing — opaque "fix the errors" toasts are the #1 complaint
      // on long forms because the missing field can be off-screen.
      const errSnapshot = {};
      const trimOr = (v) => (typeof v === "string" ? v.trim() : "");
      if (!trimOr(formData.restaurantName)) errSnapshot.restaurantName = 1;
      if (!formData.countryId) errSnapshot.country = 1;
      if (!formData.destinationId && !trimOr(formData.place)) errSnapshot.place = 1;
      if (!trimOr(formData.address)) errSnapshot.address = 1;
      if (!trimOr(formData.contactNumber)) errSnapshot.contactNumber = 1;
      else if (!/^[0-9+\-\s]{7,15}$/.test(formData.contactNumber)) errSnapshot.contactNumber = 1;
      if (!trimOr(formData.email)) errSnapshot.email = 1;
      else if (!/\S+@\S+\.\S+/.test(formData.email)) errSnapshot.email = 1;
      if (!isEdit) {
        if (!formData.openTime) errSnapshot.openTime = 1;
        if (!formData.closeTime) errSnapshot.closeTime = 1;
        if (!images.length && !existingImages.length) errSnapshot.images = 1;
        if (menuPdfFiles.length === 0 && existingMenuPdfs.length === 0) errSnapshot.menuPdfs = 1;
      }
      toast.error(summariseErrors(errSnapshot));
      // Best-effort scroll to the first invalid input so it lands in
      // the viewport.
      setTimeout(() => {
        const firstInvalid = document.querySelector(".is-invalid, [aria-invalid='true']");
        if (firstInvalid && typeof firstInvalid.scrollIntoView === "function") {
          firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 60);
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();

      // Build a single JSON-encoded "data" part — the backend deserialises
      // this into RestaurantDTO. Images travel as separate file parts.
      const data = {
        ...formData,
        // Send back the existing image URLs the user kept so the backend
        // retains them; new uploads are appended via the "images" file parts.
        images: existingImages,
        // Menu rows are no longer captured on the registration form — the
        // operator uploads menu PDFs instead. Send an empty array so older
        // backend code paths that read this field continue to work.
        menuList: [],
        // Existing PDFs the user kept (no new file attached). New uploads
        // travel as separate "menuPdf" file parts below.
        menuPdfs: existingMenuPdfs.map((p, idx) => ({
          id: p.id || null,
          fileUrl: p.fileUrl,
          displayName: p.displayName || "",
          displayOrder: idx,
        })),
        // Promotions — flatten the dayMaskList back into the comma string the
        // RestaurantPromotion entity stores. Skip blank rows.
        promotions: (formData.promotions || [])
          .filter((p) => p.name && p.name.trim())
          .map((p, idx) => ({
            promotionType: p.promotionType || "SPECIAL",
            name: p.name,
            description: p.description || "",
            discountPercent: p.discountPercent
              ? Number(p.discountPercent)
              : null,
            validFrom: p.validFrom || null,
            validTo: p.validTo || null,
            dayMask: Array.isArray(p.dayMaskList) ? p.dayMaskList.join(",") : "",
            appliesAllDays: !!p.appliesAllDays,
            isActive: p.isActive !== false,
            displayOrder: idx,
          })),
        // Multi-row policies → restaurant_book_reservation_policy /
        // restaurant_book_cancellation_policy. Skip blank rows.
        reservationPolicies: (formData.reservationPolicies || [])
          .filter((p) => p.policyText && p.policyText.trim())
          .map((p, idx) => ({
            title: p.title || "",
            policyText: p.policyText,
            isActive: p.isActive !== false,
            displayOrder: idx,
          })),
        cancellationPoliciesList: (formData.cancellationPolicies || [])
          .filter((p) => p.policyText && p.policyText.trim())
          .map((p, idx) => ({
            title: p.title || "",
            policyText: p.policyText,
            daysBeforeBooking: p.daysBeforeBooking
              ? Number(p.daysBeforeBooking)
              : null,
            chargePercent: p.chargePercent ? Number(p.chargePercent) : null,
            isActive: p.isActive !== false,
            displayOrder: idx,
          })),
        // Legacy mirror — first row goes into the single text fields so
        // older code paths that read `reservationPolicy` / `cancellationPolicy`
        // (search summaries, etc.) keep working.
        reservationPolicy:
          (formData.reservationPolicies || [])
            .map((p) => p.policyText)
            .filter((t) => t && t.trim())[0] ||
          formData.reservationPolicy ||
          "",
        cancellationPolicy:
          (formData.cancellationPolicies || [])
            .map((p) => p.policyText)
            .filter((t) => t && t.trim())[0] ||
          formData.cancellationPolicy ||
          "",
      };
      // Send as a plain string field — wrapping in Blob would make Spring
      // bind this part as a MultipartFile instead of a String.
      fd.append("data", JSON.stringify(data));

      // Restaurant images (multi-file)
      images.forEach((file) => fd.append("images", file));

      // Per-menu image — index aligned with the filtered menuList sent in "data"
      const filtered = menuList.filter((m) => m.menuName && m.price);
      filtered.forEach((row, idx) => {
        if (row.image instanceof File) fd.append(`menuImage_${idx}`, row.image);
      });

      // Newly uploaded menu PDFs — backend reads from "menuPdf" multi-value
      // and any "menuPdf_<idx>" keys, so either works. We use the multi-value
      // form so all PDFs share a single field name.
      menuPdfFiles.forEach((file) => {
        if (file instanceof File) fd.append("menuPdf", file);
      });

      if (isEdit) {
        await axiosInstance.put(`/api/restaurant/${id}`, fd);
      } else {
        await axiosInstance.post("/api/restaurant/save", fd);
      }

      Swal.fire({
        icon: "success",
        title: isEdit ? "Restaurant Updated" : "Restaurant Registered",
        text: isEdit ? "Changes saved successfully." : "Restaurant saved successfully.",
        timer: 1800,
        showConfirmButton: false,
      });
      navigate("/restaurant/list");
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.message || "Failed to save restaurant");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData(initialState);
    setImages([]);
    setImagePreviews([]);
    setMenuList([emptyMenuRow()]);
    setMenuPdfFiles([]);
    setExistingMenuPdfs([]);
    setErrors({});
    // Clear the hotel autocomplete so the form returns to a true blank
    // state when the operator hits Reset.
    setHotelSearchText("");
    setHotelSuggestions([]);
    setShowHotelSuggestions(false);
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
              {isEdit ? "Edit Restaurant" : "Register Restaurant"}
            </h4>
            <div>
              <Button variant="outline-secondary" size="sm" className="me-2" onClick={() => navigate("/restaurant/list")}>
                <FaArrowLeft className="me-1" /> Back to List
              </Button>
              <Button variant="outline-danger" size="sm" onClick={resetForm}>
                Reset
              </Button>
            </div>
          </div>

          <Form onSubmit={handleSubmit} noValidate>
            {/* Basic Details */}
            <Card className="mb-3 shadow-sm">
              <Card.Header className="bg-white fw-semibold">Basic Details</Card.Header>
              <Card.Body>
                <Row className="g-3">
                  <Col md={4}>
                    <Form.Label>Restaurant Name *</Form.Label>
                    <Form.Control
                      name="restaurantName"
                      value={formData.restaurantName}
                      onChange={handleChange}
                      isInvalid={!!errors.restaurantName}
                      placeholder="e.g. Spice Garden"
                    />
                    <Form.Control.Feedback type="invalid">{errors.restaurantName}</Form.Control.Feedback>
                  </Col>
                  {/* Country — REQUIRED. Drives the Place/City list: picking
                      a country loads only that country's cities/places and
                      clears any prior Place/City pick. Persisted as
                      countryId/countryName so the restaurant search's country
                      filter can match this restaurant. */}
                  <Col md={4}>
                    <Form.Label>Country *</Form.Label>
                    <Select
                      placeholder={countriesLoading ? "Loading countries..." : "Select Country"}
                      isClearable
                      isSearchable
                      isLoading={countriesLoading}
                      options={countryOptions.map((c) => ({
                        value: c.id,
                        label: c.name || c.countryName || `Country #${c.id}`,
                      }))}
                      value={
                        formData.countryId
                          ? {
                              value: formData.countryId,
                              label:
                                formData.countryName ||
                                countryOptions.find(
                                  (c) => String(c.id) === String(formData.countryId)
                                )?.name ||
                                `Country #${formData.countryId}`,
                            }
                          : null
                      }
                      onInputChange={(input, meta) => {
                        if (meta?.action === "input-change") searchCountries(input);
                      }}
                      onChange={(opt) => {
                        const nextId = opt?.value || null;
                        setFormData((prev) => ({
                          ...prev,
                          countryId: nextId,
                          countryName: opt?.label || "",
                          // Country drives the Place/City list — clear the
                          // prior city/place pick whenever the country changes.
                          destinationId: null,
                          destinationName: "",
                          placeSource: "",
                          place: "",
                        }));
                        setErrors((prev) => ({ ...prev, country: "", place: "" }));
                        loadPlacesByCountry(nextId);
                      }}
                      menuPortalTarget={document.body}
                      styles={{
                        menuPortal: (b) => ({ ...b, zIndex: 9999 }),
                        control: (b) => ({
                          ...b,
                          borderColor: errors.country ? "#dc3545" : b.borderColor,
                        }),
                      }}
                    />
                    {errors.country && (
                      <div className="invalid-feedback d-block">{errors.country}</div>
                    )}
                  </Col>
                  {/* Place / City — country-scoped City list (same source as
                      the Hotel Registration "City" dropdown). Disabled until a
                      country is chosen. The picked option carries an explicit
                      `source` ("PROVINCE") saved as placeSource so the backend
                      resolves the FK against the correct master table. The
                      same label is mirrored into the legacy `place` text
                      column. */}
                  <Col md={4}>
                    <Form.Label>Place / City *</Form.Label>
                    <Select
                      placeholder={
                        !formData.countryId
                          ? "Select a country first"
                          : destinationLoading
                          ? "Loading cities..."
                          : "Search city..."
                      }
                      isClearable
                      isSearchable
                      isDisabled={!formData.countryId}
                      isLoading={destinationLoading}
                      options={destinationOptions}
                      // Resolve the saved (destinationId, placeSource) back
                      // to its option so the field shows the picked label
                      // on edit. Falls back to a synthetic option if the
                      // dropdown hasn't loaded yet.
                      value={(() => {
                        if (!formData.destinationId || !formData.placeSource) {
                          return formData.destinationName
                            ? {
                                value: `legacy:${formData.destinationName}`,
                                label: formData.destinationName,
                              }
                            : null;
                        }
                        const wantedValue = `${formData.placeSource}:${formData.destinationId}`;
                        const hit = destinationOptions.find(
                          (o) => o.value === wantedValue
                        );
                        if (hit) return hit;
                        return {
                          value: wantedValue,
                          label: formData.destinationName,
                          source: formData.placeSource,
                          id: formData.destinationId,
                        };
                      })()}
                      onChange={(opt) => {
                        setFormData((prev) => ({
                          ...prev,
                          destinationId: opt?.id || null,
                          destinationName: opt?.label || "",
                          placeSource: opt?.source || "",
                          // Mirror the picked label into `place` so legacy
                          // text-matching keeps working.
                          place: opt?.label || "",
                        }));
                        if (errors.place)
                          setErrors((prev) => ({ ...prev, place: "" }));
                      }}
                      menuPortalTarget={document.body}
                      styles={{
                        menuPortal: (b) => ({ ...b, zIndex: 9999 }),
                        control: (b) => ({
                          ...b,
                          borderColor: errors.place ? "#dc3545" : b.borderColor,
                        }),
                      }}
                    />
                    {errors.place && (
                      <div className="invalid-feedback d-block">{errors.place}</div>
                    )}
                  </Col>
                  <Col md={4}>
                    <Form.Label>Status</Form.Label>
                    <Form.Select name="status" value={formData.status} onChange={handleChange}>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </Form.Select>
                  </Col>

                  <Col md={4}>
                    <Form.Label>Is Restaurant Inside Hotel? *</Form.Label>
                    <div className="d-flex gap-3 align-items-center pt-2">
                      <Form.Check
                        type="radio"
                        inline
                        id="insideHotel-no"
                        name="isInsideHotel"
                        label="No"
                        checked={!formData.isInsideHotel}
                        onChange={() =>
                          setFormData((prev) => ({
                            ...prev,
                            isInsideHotel: false,
                            // Clear hotel reference when switching back to No
                            hotelId: null,
                            hotelName: "",
                          }))
                        }
                      />
                      <Form.Check
                        type="radio"
                        inline
                        id="insideHotel-yes"
                        name="isInsideHotel"
                        label="Yes"
                        checked={!!formData.isInsideHotel}
                        onChange={() =>
                          setFormData((prev) => ({
                            ...prev,
                            isInsideHotel: true,
                          }))
                        }
                      />
                    </div>
                  </Col>

                  {/* ── Hotel Name autocomplete (conditional) ──────────
                      Only rendered when isInsideHotel = Yes. Hits
                      /api/hotels?search=<text> on debounced keystrokes;
                      gracefully degrades to a plain text input if the
                      lookup endpoint isn't available. */}
                  {formData.isInsideHotel && (
                    <Col md={12}>
                      <Form.Label>Hotel Name</Form.Label>
                      <div style={{ position: "relative" }}>
                        <Form.Control
                          type="text"
                          placeholder={
                            hotelLookupAvailable
                              ? "Start typing hotel name..."
                              : "Enter hotel name"
                          }
                          value={hotelSearchText}
                          onChange={(e) => {
                            const v = e.target.value;
                            setHotelSearchText(v);
                            setShowHotelSuggestions(true);
                            // Keep formData.hotelName in sync; clear hotelId
                            // until the user picks a suggestion.
                            setFormData((prev) => ({
                              ...prev,
                              hotelName: v,
                              hotelId: prev.hotelName === v ? prev.hotelId : null,
                            }));
                          }}
                          onFocus={() => setShowHotelSuggestions(true)}
                          onBlur={() => {
                            // Delay so a click on a suggestion still
                            // registers before the dropdown closes.
                            setTimeout(() => setShowHotelSuggestions(false), 150);
                          }}
                          autoComplete="off"
                        />
                        {hotelLookupAvailable &&
                          showHotelSuggestions &&
                          hotelSuggestions.length > 0 && (
                            <ul
                              className="list-group position-absolute w-100 shadow-sm"
                              style={{
                                top: "100%",
                                left: 0,
                                zIndex: 1050,
                                maxHeight: 220,
                                overflowY: "auto",
                              }}
                            >
                              {hotelSuggestions.map((h) => (
                                <li
                                  key={h.id}
                                  className="list-group-item list-group-item-action py-1"
                                  style={{ cursor: "pointer" }}
                                  onMouseDown={(e) => {
                                    // Use onMouseDown so the click fires
                                    // before the input's onBlur clears the
                                    // suggestion list.
                                    e.preventDefault();
                                    setFormData((prev) => ({
                                      ...prev,
                                      hotelId: h.id,
                                      hotelName: h.name,
                                    }));
                                    setHotelSearchText(h.name);
                                    setShowHotelSuggestions(false);
                                  }}
                                >
                                  {h.name}
                                </li>
                              ))}
                            </ul>
                          )}
                      </div>
                      <Form.Text muted>
                        {hotelLookupAvailable
                          ? "Pick from suggestions to link this restaurant to a registered hotel."
                          : "Hotel lookup unavailable — name will be saved as plain text."}
                      </Form.Text>
                    </Col>
                  )}

                  <Col md={6}>
                    <Form.Label>Address *</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={2}
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      isInvalid={!!errors.address}
                    />
                    <Form.Control.Feedback type="invalid">{errors.address}</Form.Control.Feedback>
                  </Col>
                  <Col md={6}>
                    <Form.Label>
                      <FaMapMarkerAlt className="me-1 text-danger" />
                      Location URL (Google Maps)
                    </Form.Label>
                    <Form.Control
                      name="locationUrl"
                      value={formData.locationUrl}
                      onChange={handleChange}
                      placeholder="https://maps.google.com/..."
                    />
                    <Row className="mt-2 g-2">
                      <Col>
                        <Form.Control
                          name="latitude"
                          value={formData.latitude}
                          onChange={handleChange}
                          placeholder="Latitude"
                        />
                      </Col>
                      <Col>
                        <Form.Control
                          name="longitude"
                          value={formData.longitude}
                          onChange={handleChange}
                          placeholder="Longitude"
                        />
                      </Col>
                    </Row>
                  </Col>

                  <Col md={3}>
                    <Form.Label>Contact Number *</Form.Label>
                    <Form.Control
                      name="contactNumber"
                      value={formData.contactNumber}
                      onChange={handleChange}
                      isInvalid={!!errors.contactNumber}
                    />
                    <Form.Control.Feedback type="invalid">{errors.contactNumber}</Form.Control.Feedback>
                  </Col>
                  <Col md={3}>
                    <Form.Label>Alternate Number</Form.Label>
                    <Form.Control
                      name="alternateNumber"
                      value={formData.alternateNumber}
                      onChange={handleChange}
                    />
                  </Col>
                  <Col md={3}>
                    <Form.Label>Email *</Form.Label>
                    <Form.Control
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      isInvalid={!!errors.email}
                    />
                    <Form.Control.Feedback type="invalid">{errors.email}</Form.Control.Feedback>
                  </Col>
                  <Col md={3}>
                    <Form.Label>Website</Form.Label>
                    <Form.Control name="website" value={formData.website} onChange={handleChange} />
                  </Col>

                  <Col md={3}>
                    <Form.Label>Open Time *</Form.Label>
                    <Form.Control
                      type="time"
                      name="openTime"
                      value={formData.openTime}
                      onChange={handleChange}
                      isInvalid={!!errors.openTime}
                    />
                    <Form.Control.Feedback type="invalid">{errors.openTime}</Form.Control.Feedback>
                  </Col>
                  <Col md={3}>
                    <Form.Label>Close Time *</Form.Label>
                    <Form.Control
                      type="time"
                      name="closeTime"
                      value={formData.closeTime}
                      onChange={handleChange}
                      isInvalid={!!errors.closeTime}
                    />
                    <Form.Control.Feedback type="invalid">{errors.closeTime}</Form.Control.Feedback>
                  </Col>
                  <Col md={3}>
                    <Form.Label>Avg. Cost For Two</Form.Label>
                    <Form.Control
                      type="number"
                      name="averageCostForTwo"
                      value={formData.averageCostForTwo}
                      onChange={handleChange}
                    />
                  </Col>
                  <Col md={3}>
                    <Form.Label>Rate Per Person</Form.Label>
                    <Form.Control
                      type="number"
                      min={0}
                      step="0.01"
                      name="pricePerPerson"
                      value={formData.pricePerPerson}
                      onChange={handleChange}
                    />
                    <Form.Text muted>
                      Used at booking time as the per-cover billing rate
                      (subtotal = rate × members).
                    </Form.Text>
                  </Col>
                  <Col md={3}>
                    <Form.Label>Food Type</Form.Label>
                    <Form.Select name="foodType" value={formData.foodType} onChange={handleChange}>
                      {FOOD_TYPES.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </Form.Select>
                  </Col>

                  <Col md={12}>
                    <Form.Label>Description</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      name="description"
                      value={formData.description}
                      onChange={handleChange}
                      placeholder="Brief about the restaurant, ambience, specialties..."
                    />
                  </Col>
                </Row>
              </Card.Body>
            </Card>

            {/* Additional Details */}
            <Card className="mb-3 shadow-sm">
              <Card.Header className="bg-white fw-semibold">Additional Details</Card.Header>
              <Card.Body>
                <Row className="g-3">
                  <Col md={12}>
                    <Form.Label>Cuisine Types</Form.Label>
                    <div className="d-flex flex-wrap gap-2">
                      {CUISINE_OPTIONS.map((c) => {
                        const active = formData.cuisineTypes.includes(c);
                        return (
                          <Badge
                            key={c}
                            bg={active ? "warning" : "light"}
                            text={active ? "dark" : "dark"}
                            className="py-2 px-3 border"
                            style={{ cursor: "pointer", fontWeight: 500 }}
                            onClick={() => toggleCuisine(c)}
                          >
                            {c}
                          </Badge>
                        );
                      })}
                    </div>
                  </Col>

                  <Col md={3}>
                    <Form.Label>Seating Capacity</Form.Label>
                    <Form.Control
                      type="number"
                      name="seatingCapacity"
                      value={formData.seatingCapacity}
                      onChange={handleChange}
                    />
                  </Col>
                  <Col md={3}>
                    <Form.Label>Number Of Tables</Form.Label>
                    <Form.Control
                      type="number"
                      name="numberOfTables"
                      value={formData.numberOfTables}
                      onChange={handleChange}
                    />
                  </Col>
                  <Col md={3}>
                    <Form.Label>Dress Code</Form.Label>
                    <Form.Select name="dressCode" value={formData.dressCode} onChange={handleChange}>
                      {DRESS_CODES.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </Form.Select>
                  </Col>
                  <Col md={3}>
                    <Form.Label>Tax %</Form.Label>
                    <Form.Control
                      type="number"
                      name="taxPercent"
                      value={formData.taxPercent}
                      onChange={handleChange}
                      placeholder="e.g. 5"
                    />
                  </Col>

                  <Col md={3}>
                    <Form.Label>Booking Modes Offered *</Form.Label>
                    <Form.Select
                      name="bookingModes"
                      value={formData.bookingModes}
                      onChange={handleChange}
                    >
                      <option value="Walk-in">Walk-in only (Free to Available)</option>
                      <option value="Advance">Advance booking only</option>
                      <option value="Both">Both</option>
                    </Form.Select>
                    <Form.Text muted>
                      Walk-in = first-come basis · Advance = reserved table for a slot
                    </Form.Text>
                  </Col>
                  <Col md={3}>
                    <Form.Label>Advance Booking Lead Time (hours)</Form.Label>
                    <Form.Control
                      type="number"
                      min={0}
                      name="advanceBookingMinHours"
                      value={formData.advanceBookingMinHours}
                      onChange={handleChange}
                      disabled={formData.bookingModes === "Walk-in"}
                      placeholder="e.g. 2"
                    />
                    <Form.Text muted>Minimum hours notice for advance bookings.</Form.Text>
                  </Col>

                  {/* ── Reservation Policies (multi-row repeater) ─────
                      Each row becomes a restaurant_book_reservation_policy
                      record. Use the "+ Add" button to capture deposit
                      rules, lead time, group size policies, etc. */}
                  <Col md={6}>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <Form.Label className="mb-0">
                        Reservation Policies
                      </Form.Label>
                      <Button
                        size="sm"
                        variant="outline-info"
                        onClick={addReservationPolicy}
                      >
                        + Add Reservation Policy
                      </Button>
                    </div>
                    {formData.reservationPolicies.length === 0 ? (
                      <div className="text-muted small mb-2">
                        No reservation policies yet. Click "+ Add" to capture
                        deposit rules, lead time, group size etc.
                      </div>
                    ) : (
                      formData.reservationPolicies.map((p, idx) => (
                        <Card key={idx} className="mb-2 border-info">
                          <Card.Body className="p-2">
                            <Row className="g-2 align-items-end">
                              <Col md={5}>
                                <Form.Label className="small mb-1">Title</Form.Label>
                                <Form.Control
                                  size="sm"
                                  value={p.title}
                                  onChange={(e) =>
                                    updateReservationPolicy(idx, "title", e.target.value)
                                  }
                                  placeholder="e.g. Deposit"
                                />
                              </Col>
                              <Col md={5}>
                                <Form.Label className="small mb-1">Policy *</Form.Label>
                                <Form.Control
                                  size="sm"
                                  as="textarea"
                                  rows={2}
                                  value={p.policyText}
                                  onChange={(e) =>
                                    updateReservationPolicy(idx, "policyText", e.target.value)
                                  }
                                  placeholder="Free-form clause text..."
                                />
                              </Col>
                              <Col md={2} className="text-end">
                                <Button
                                  size="sm"
                                  variant="outline-danger"
                                  onClick={() => removeReservationPolicy(idx)}
                                  className="w-100"
                                >
                                  <FaTrash /> Remove
                                </Button>
                              </Col>
                            </Row>
                          </Card.Body>
                        </Card>
                      ))
                    )}
                  </Col>

                  {/* ── Cancellation Policies (multi-row repeater) ────
                      Each row becomes a restaurant_book_cancellation_policy
                      record. Includes optional days-before-booking + charge%
                      slabs so refund rules can be structured. */}
                  <Col md={6}>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <Form.Label className="mb-0">
                        Cancellation Policies
                      </Form.Label>
                      <Button
                        size="sm"
                        variant="outline-danger"
                        onClick={addCancellationPolicy}
                      >
                        + Add Cancellation Policy
                      </Button>
                    </div>
                    {formData.cancellationPolicies.length === 0 ? (
                      <div className="text-muted small mb-2">
                        No cancellation policies yet. Click "+ Add" to
                        define refund slabs by lead time.
                      </div>
                    ) : (
                      formData.cancellationPolicies.map((p, idx) => (
                        <Card key={idx} className="mb-2 border-danger">
                          <Card.Body className="p-2">
                            <Row className="g-2 align-items-end">
                              <Col md={4}>
                                <Form.Label className="small mb-1">Title</Form.Label>
                                <Form.Control
                                  size="sm"
                                  value={p.title}
                                  onChange={(e) =>
                                    updateCancellationPolicy(idx, "title", e.target.value)
                                  }
                                  placeholder="e.g. Within 24 hours"
                                />
                              </Col>
                              <Col md={2}>
                                <Form.Label className="small mb-1">
                                  Days Before
                                </Form.Label>
                                <Form.Control
                                  size="sm"
                                  type="number"
                                  value={p.daysBeforeBooking}
                                  onChange={(e) =>
                                    updateCancellationPolicy(idx, "daysBeforeBooking", e.target.value)
                                  }
                                />
                              </Col>
                              <Col md={2}>
                                <Form.Label className="small mb-1">Charge %</Form.Label>
                                <Form.Control
                                  size="sm"
                                  type="number"
                                  value={p.chargePercent}
                                  onChange={(e) =>
                                    updateCancellationPolicy(idx, "chargePercent", e.target.value)
                                  }
                                />
                              </Col>
                              <Col md={2} className="text-end">
                                <Button
                                  size="sm"
                                  variant="outline-danger"
                                  onClick={() => removeCancellationPolicy(idx)}
                                  className="w-100"
                                >
                                  <FaTrash /> Remove
                                </Button>
                              </Col>
                              <Col md={12}>
                                <Form.Label className="small mb-1">Policy *</Form.Label>
                                <Form.Control
                                  size="sm"
                                  as="textarea"
                                  rows={2}
                                  value={p.policyText}
                                  onChange={(e) =>
                                    updateCancellationPolicy(idx, "policyText", e.target.value)
                                  }
                                  placeholder="e.g. 100% charge for cancellations within 24 hours"
                                />
                              </Col>
                            </Row>
                          </Card.Body>
                        </Card>
                      ))
                    )}
                  </Col>

                  <Col md={12}>
                    <Form.Label>Facilities</Form.Label>
                    <Row className="g-2">
                      {[
                        ["hasParking", "Parking"],
                        ["hasWifi", "WiFi"],
                        ["hasAc", "AC"],
                        ["hasOutdoorSeating", "Outdoor Seating"],
                        ["hasLiveMusic", "Live Music"],
                        ["servesAlcohol", "Bar / Alcohol"],
                        ["isPureVeg", "Pure Veg"],
                        ["isFamilyFriendly", "Family Friendly"],
                        ["petFriendly", "Pet Friendly"],
                        ["homeDelivery", "Home Delivery"],
                        ["takeAway", "Take Away"],
                      ].map(([key, label]) => (
                        <Col md={3} sm={4} xs={6} key={key}>
                          <Form.Check
                            type="switch"
                            id={`f-${key}`}
                            name={key}
                            checked={formData[key]}
                            onChange={handleChange}
                            label={label}
                          />
                        </Col>
                      ))}
                    </Row>
                  </Col>

                  <Col md={4}>
                    <Form.Label>Facebook URL</Form.Label>
                    <Form.Control name="facebookUrl" value={formData.facebookUrl} onChange={handleChange} />
                  </Col>
                  <Col md={4}>
                    <Form.Label>Instagram URL</Form.Label>
                    <Form.Control name="instagramUrl" value={formData.instagramUrl} onChange={handleChange} />
                  </Col>
                  <Col md={4}>
                    <Form.Label>GST Number</Form.Label>
                    <Form.Control name="gstNumber" value={formData.gstNumber} onChange={handleChange} />
                  </Col>

                  {/* ── Currency dropdown (new) ─────────────────────────
                      Pulled from /api/currency. The chosen currencyId is
                      persisted on RestaurantMaster.currency_id; the
                      currencyCode is also stored for fast rendering on the
                      restaurant list / search pages. */}
                  <Col md={4}>
                    <Form.Label>Currency</Form.Label>
                    <Form.Select
                      value={formData.currencyId || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        const picked = currencyOptions.find(
                          (o) => String(o.value) === String(val)
                        );
                        setFormData((prev) => ({
                          ...prev,
                          currencyId: val ? Number(val) : null,
                          currencyCode: picked?.currencyCode || "",
                        }));
                      }}
                    >
                      <option value="">Select currency</option>
                      {currencyOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Form.Select>
                  </Col>

                  {/* ── Star rating (new) ─────────────────────────────
                      Sourced from /api/hotelCategory so restaurants share
                      the same scale as hotels. The dropdown stores both
                      hotelCategoryId and a numeric starRating (when the
                      category record carries one) for the search filter. */}
                  {/* Star Rating dropdown — sourced from /api/hotelcategory.
                      Each option carries hotelCategoryId (FK saved on the
                      restaurant) + the parsed numeric starRating used by
                      the list / search filters. */}
                  <Col md={4}>
                    <Form.Label>Star Rating</Form.Label>
                    <Form.Select
                      value={formData.hotelCategoryId || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        const picked = starOptions.find(
                          (o) => String(o.value) === String(val)
                        );
                        setFormData((prev) => ({
                          ...prev,
                          hotelCategoryId: val ? Number(val) : null,
                          starRating: picked?.starRating ?? null,
                        }));
                      }}
                    >
                      <option value="">Select rating</option>
                      {starOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Form.Select>
                    <Form.Text muted>
                      Surfaced on the restaurant search & list as the star
                      filter. Saved as hotelCategoryId on the restaurant.
                    </Form.Text>
                  </Col>
                </Row>
              </Card.Body>
            </Card>

            {/* ── Weekday Offers + Special Promotions ──────────────────
                Repeater rows persisted as RestaurantPromotion entries.
                Two flavours:
                  WEEKDAY → reusable day-of-week offer (Mon..Sun mask)
                  SPECIAL → date-range promotion, optionally every day
                            ("appliesAllDays" toggle). */}
            <Card className="mb-3 shadow-sm">
              <Card.Header className="bg-white fw-semibold d-flex justify-content-between align-items-center">
                <span>Weekday Offers &amp; Special Promotions</span>
                <div>
                  <Button
                    size="sm"
                    variant="outline-info"
                    className="me-2"
                    onClick={() => addPromotion("WEEKDAY")}
                  >
                    + Weekday Offer
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-success"
                    onClick={() => addPromotion("SPECIAL")}
                  >
                    + Special Promotion
                  </Button>
                </div>
              </Card.Header>
              <Card.Body>
                {formData.promotions.length === 0 ? (
                  <div className="text-muted small">
                    No offers yet. Click "+ Weekday Offer" for recurring
                    weekday deals or "+ Special Promotion" for date-bounded
                    campaigns.
                  </div>
                ) : (
                  formData.promotions.map((p, idx) => (
                    <Card
                      key={idx}
                      className={`mb-2 border-${
                        p.promotionType === "WEEKDAY" ? "info" : "success"
                      }`}
                    >
                      <Card.Body>
                        <Row className="g-2 align-items-end">
                          <Col md={2}>
                            <Form.Label className="small mb-1">Type</Form.Label>
                            <Form.Select
                              value={p.promotionType}
                              onChange={(e) =>
                                updatePromotion(idx, "promotionType", e.target.value)
                              }
                            >
                              <option value="WEEKDAY">Weekday Offer</option>
                              <option value="SPECIAL">Special Promotion</option>
                            </Form.Select>
                          </Col>
                          <Col md={3}>
                            <Form.Label className="small mb-1">Name *</Form.Label>
                            <Form.Control
                              value={p.name}
                              onChange={(e) =>
                                updatePromotion(idx, "name", e.target.value)
                              }
                              placeholder="e.g. Happy Hour"
                            />
                          </Col>
                          <Col md={2}>
                            <Form.Label className="small mb-1">Discount %</Form.Label>
                            <Form.Control
                              type="number"
                              value={p.discountPercent}
                              onChange={(e) =>
                                updatePromotion(idx, "discountPercent", e.target.value)
                              }
                              placeholder="10"
                            />
                          </Col>
                          <Col md={2}>
                            <Form.Label className="small mb-1">Valid From</Form.Label>
                            <Form.Control
                              type="date"
                              value={p.validFrom}
                              onChange={(e) =>
                                updatePromotion(idx, "validFrom", e.target.value)
                              }
                            />
                          </Col>
                          <Col md={2}>
                            <Form.Label className="small mb-1">Valid To</Form.Label>
                            <Form.Control
                              type="date"
                              value={p.validTo}
                              onChange={(e) =>
                                updatePromotion(idx, "validTo", e.target.value)
                              }
                            />
                          </Col>
                          <Col md={1} className="text-end">
                            <Button
                              size="sm"
                              variant="outline-danger"
                              onClick={() => removePromotion(idx)}
                              title="Remove"
                            >
                              <FaTrash />
                            </Button>
                          </Col>

                          {/* Weekday checkboxes — only shown for WEEKDAY rows. */}
                          {p.promotionType === "WEEKDAY" && (
                            <Col md={12}>
                              <Form.Label className="small mb-1">
                                Active Days
                              </Form.Label>
                              <div className="d-flex flex-wrap gap-3">
                                {WEEKDAYS.map((d) => (
                                  <Form.Check
                                    key={d}
                                    type="checkbox"
                                    inline
                                    label={d}
                                    id={`promo-${idx}-${d}`}
                                    checked={(p.dayMaskList || []).includes(d)}
                                    onChange={() =>
                                      toggleWeekdayInPromotion(idx, d)
                                    }
                                  />
                                ))}
                              </div>
                            </Col>
                          )}

                          {/* Special-only: "applies every day" toggle. */}
                          {p.promotionType === "SPECIAL" && (
                            <Col md={4}>
                              <Form.Check
                                type="switch"
                                id={`promo-${idx}-all`}
                                checked={!!p.appliesAllDays}
                                onChange={(e) =>
                                  updatePromotion(
                                    idx,
                                    "appliesAllDays",
                                    e.target.checked
                                  )
                                }
                                label="Applies every day in range"
                              />
                            </Col>
                          )}

                          <Col md={p.promotionType === "SPECIAL" ? 7 : 11}>
                            <Form.Label className="small mb-1">
                              Description
                            </Form.Label>
                            <Form.Control
                              value={p.description}
                              onChange={(e) =>
                                updatePromotion(idx, "description", e.target.value)
                              }
                              placeholder="What's the offer?"
                            />
                          </Col>
                          <Col md={1} className="text-end">
                            <Form.Check
                              type="switch"
                              id={`promo-${idx}-active`}
                              checked={p.isActive !== false}
                              onChange={(e) =>
                                updatePromotion(idx, "isActive", e.target.checked)
                              }
                              label="Active"
                            />
                          </Col>
                        </Row>
                      </Card.Body>
                    </Card>
                  ))
                )}
              </Card.Body>
            </Card>

            {/* Images */}
            <Card className="mb-3 shadow-sm">
              <Card.Header className="bg-white fw-semibold">
                <FaImages className="me-2 text-info" />
                Restaurant Images *
              </Card.Header>
              <Card.Body>
                <Form.Control type="file" multiple accept="image/*" onChange={handleImagesUpload} />
                {errors.images && <div className="text-danger small mt-1">{errors.images}</div>}

                {/* Existing images (only present in edit mode) — user can drop
                 *  any they don't want and the rest get re-posted to the BE. */}
                {existingImages.length > 0 && (
                  <div className="d-flex flex-wrap gap-2 mt-3">
                    {existingImages.map((src, i) => (
                      <div key={`ex-${i}`} className="position-relative" style={{ width: 120, height: 90 }}>
                        <Image
                          src={src}
                          alt={`existing-${i}`}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            borderRadius: 6,
                            cursor: "pointer",
                          }}
                          onClick={() => setPreviewImage(src)}
                        />
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setExistingImages((p) => p.filter((_, k) => k !== i))}
                          style={{
                            position: "absolute",
                            top: 2,
                            right: 2,
                            padding: "0 6px",
                            lineHeight: 1.1,
                          }}
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {imagePreviews.length > 0 && (
                  <div className="d-flex flex-wrap gap-2 mt-3">
                    {imagePreviews.map((src, i) => (
                      <div key={i} className="position-relative" style={{ width: 120, height: 90 }}>
                        <Image
                          src={src}
                          alt={`img-${i}`}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            borderRadius: 6,
                            cursor: "pointer",
                          }}
                          onClick={() => setPreviewImage(src)}
                        />
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => removeImage(i)}
                          style={{
                            position: "absolute",
                            top: 2,
                            right: 2,
                            padding: "0 6px",
                            lineHeight: 1.1,
                          }}
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Card.Body>
            </Card>

            {/* Menu PDFs — upload one or more menu PDF files. Replaces the
                old row-by-row Menu Items table. */}
            <Card className="mb-3 shadow-sm">
              <Card.Header className="bg-white fw-semibold d-flex justify-content-between align-items-center">
                <span>
                  <FaFilePdf className="me-2 text-danger" />
                  Menu PDFs
                </span>
                <Form.Label
                  htmlFor="menu-pdf-input"
                  className="btn btn-sm btn-success mb-0"
                  style={{ cursor: "pointer" }}
                >
                  <FaPlus className="me-1" /> Upload PDFs
                  <Form.Control
                    id="menu-pdf-input"
                    type="file"
                    accept="application/pdf,.pdf"
                    multiple
                    className="d-none"
                    onChange={handleMenuPdfsUpload}
                  />
                </Form.Label>
              </Card.Header>
              <Card.Body>
                <Form.Text className="text-muted d-block mb-2">
                  Upload one or more menu PDFs (lunch menu, dinner menu, drinks
                  menu, etc.). Guests will see these on the booking page.
                </Form.Text>

                {existingMenuPdfs.length === 0 && menuPdfFiles.length === 0 ? (
                  <div className="text-muted small fst-italic">
                    No menu PDFs yet — click <strong>Upload PDFs</strong> to
                    attach files.
                  </div>
                ) : (
                  <ul className="list-unstyled mb-0">
                    {existingMenuPdfs.map((p, idx) => (
                      <li
                        key={`existing-${p.id || idx}`}
                        className="d-flex align-items-center justify-content-between border rounded px-2 py-1 mb-1"
                      >
                        <span className="text-truncate" style={{ maxWidth: 380 }}>
                          <FaFilePdf className="text-danger me-2" />
                          {p.displayName ||
                            (p.fileUrl ? p.fileUrl.split("/").pop() : "Menu PDF")}
                          <Badge bg="light" text="dark" className="ms-2">
                            Saved
                          </Badge>
                        </span>
                        <span className="d-flex gap-2">
                          {p.fileUrl && (
                            <a
                              href={p.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-sm btn-outline-primary"
                              title="Open PDF"
                            >
                              <FaExternalLinkAlt />
                            </a>
                          )}
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={() => removeExistingMenuPdf(idx)}
                            title="Remove"
                          >
                            <FaTrash />
                          </Button>
                        </span>
                      </li>
                    ))}
                    {menuPdfFiles.map((f, idx) => (
                      <li
                        key={`new-${idx}`}
                        className="d-flex align-items-center justify-content-between border rounded px-2 py-1 mb-1"
                      >
                        <span className="text-truncate" style={{ maxWidth: 380 }}>
                          <FaFilePdf className="text-danger me-2" />
                          {f.name}
                          <Badge bg="warning" text="dark" className="ms-2">
                            New
                          </Badge>
                          <small className="text-muted ms-2">
                            {(f.size / 1024).toFixed(0)} KB
                          </small>
                        </span>
                        <Button
                          variant="outline-danger"
                          size="sm"
                          onClick={() => removeNewMenuPdf(idx)}
                          title="Remove"
                        >
                          <FaTrash />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                {errors.menuPdfs && (
                  <div className="text-danger small mt-2">{errors.menuPdfs}</div>
                )}
              </Card.Body>
            </Card>

            <div className="d-flex justify-content-end gap-2 pb-4">
              <Button variant="outline-secondary" type="button" onClick={() => navigate("/restaurant/list")}>
                Cancel
              </Button>
              <Button type="submit" variant="warning" disabled={saving}>
                <FaSave className="me-1" />
                {saving ? (isEdit ? "Updating..." : "Saving...") : (isEdit ? "Update Restaurant" : "Save Restaurant")}
              </Button>
            </div>
          </Form>
        </div>
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

export default RestaurantRegistration;
