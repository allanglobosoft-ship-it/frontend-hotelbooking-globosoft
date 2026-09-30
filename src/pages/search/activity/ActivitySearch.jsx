import React, { useState, useRef, useEffect } from "react";
import {
  Card,
  Row,
  Col,
  Form,
  Button,
  Spinner,
  Table,
  Modal,
  Badge,
  Carousel,
} from "react-bootstrap";
import { FaTicketAlt, FaSearch, FaStar, FaUsers, FaEye } from "react-icons/fa";
import { useLocation, useNavigate } from "react-router-dom";
import Select from "react-select";
import AgentSelect from "../../../components/AgentSelect";
import axiosInstance from "../../../components/AxiosInstance";
import { logAgentSearch } from "../../../utils/agentSearchLog";
import { toast } from "react-hot-toast";
import Sidebar from "../../../components/Sidebar";
import TopBar from "../../../components/TopBar";
import AgentBalanceDisplay from "../../../components/AgentBalanceDisplay";
import AdvertisementCarousel from "../../../components/AdvertisementCarousel";
import AgentCreditBalance from "../../../components/AgentCreditBalance";

function LazyImage({ src, alt, className }) {
  const containerRef = useRef(null);
  const [inView, setInView] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
          }
        });
      });
      observer.observe(el);
      return () => observer.disconnect();
    } else {
      setInView(true);
    }
  }, []);

  const imageSrc = src || "https://via.placeholder.com/480x270";

  return (
    <div
      ref={containerRef}
      className={`ratio ratio-16x9 rounded-top overflow-hidden ${
        className || ""
      }`}
      style={{ height: "100%", width: "100%", position: "relative" }}
    >
      {!loaded && (
        <div 
           className="skeleton w-100 h-100" 
           style={{ backgroundColor: '#e0e0e0', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} 
        />
      )}
      {inView && (
        <img
          src={imageSrc}
          loading="lazy"
          alt={alt}
          onLoad={() => setLoaded(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: loaded ? 1 : 0,
            transition: 'opacity 0.3s ease-in-out'
          }}
        />
      )}
    </div>
  );
}

// Friendly labels for the activity-type code (same mapping as the
// activity-rate view page): "1" = Private, "2" = SIC.
const ACTIVITY_TYPE_LABEL = { 1: "Private", 2: "SIC" };

// Compact label/value row for the details modal. Renders "-" when the
// value is missing so the layout stays aligned.
const DetailLine = ({ label, value }) => (
  <div className="d-flex mb-1">
    <span className="text-muted" style={{ minWidth: 150 }}>
      {label}
    </span>
    <span className="fw-semibold text-dark">
      {value === null || value === undefined || value === "" ? "-" : value}
    </span>
  </div>
);

// Bulleted list (Inclusions / T&C / Cancellation) with an empty fallback.
const RateBullets = ({ items, empty }) => {
  if (!items || items.length === 0) {
    return <div className="text-muted small mb-1">{empty}</div>;
  }
  return (
    <ul className="mb-1 ps-3 small">
      {items.map((line, i) => (
        <li key={i} className="mb-1">
          {line}
        </li>
      ))}
    </ul>
  );
};

// Resolve a backend image path the same way ActivityRateView does, so
// images stored as Windows paths / bare filenames render through
// /api/files/. http(s) URLs are passed through untouched.
const getRateImageUrl = (imagePath) => {
  if (!imagePath) return "";
  if (imagePath.startsWith("http")) return imagePath;
  const base = process.env.REACT_APP_API_BASE_URL || "";
  if (imagePath.includes("\\") || imagePath.includes(":")) {
    const filename = imagePath.split("\\").pop();
    return `${base}/api/files/${filename}`;
  }
  return `${base}/api/files/${imagePath}`;
};

// dd-MM-yyyy formatter for validity ranges in the details modal.
const formatRateDate = (s) => {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
};

const ActivitySearch = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Agent logins book under themselves — the backend forces the booking to
  // the logged-in agent, so the manual Agent picker is hidden and the
  // agent-required validation is skipped. currentActiveRole isn't set for
  // single-role logins, so fall back to userRole; admin/super-admin/staff
  // keep the picker exactly as before.
  const activeRole = (localStorage.getItem("currentActiveRole") || "")
    .trim()
    .toUpperCase();
  const storedRoles = (localStorage.getItem("userRole") || "").toUpperCase();
  const isAgentRole = activeRole
    ? activeRole === "AGENT"
    : storedRoles.includes("AGENT") && !storedRoles.includes("ADMIN");

  // Try to use state from previous page if available
  const searchCriteria = location.state || {};
  
  // Form State
  const [nationality, setNationality] = useState(searchCriteria.nationality || null);
  // Destination is now multi-select — the backend's
  // SearchActivityRequestDTO already supports `destinationCityIds` so
  // the operator can search across several cities in one go. Seeded
  // from prior single-city state for backwards compatibility.
  const [destinations, setDestinations] = useState(() => {
    if (Array.isArray(searchCriteria.destinations)) return searchCriteria.destinations;
    if (searchCriteria.destination) return [searchCriteria.destination];
    return [];
  });
  
  const [tourDate, setTourDate] = useState(searchCriteria.travelDate || "");
  const [tourAdults, setTourAdults] = useState(searchCriteria.adults || 1);
  const [tourChildren, setTourChildren] = useState(searchCriteria.children || 0);
  const [tourChildAges, setTourChildAges] = useState(searchCriteria.childAges || []);

  // ── Duration filter ────────────────────────────────────────────────
  // Maps each dropdown option to a {min,max} day window. Backend
  // returns each activity's duration as durationHr + durationMin
  // (or `viatorActivityDuration*` for Viator); we convert to days
  // (always ≥1 if any duration is present) and keep rows that fall
  // inside the window. "Flexible length" applies no filter.
  const DURATION_OPTIONS = [
    { value: "ANY",        label: "Flexible length",      min: null, max: null },
    { value: "ONE_DAY",    label: "1 day",                min: 1,    max: 1 },
    { value: "TWO_DAYS",   label: "2 days",               min: 2,    max: 2 },
    { value: "LT_4_DAYS",  label: "Less than 4 days",     min: 1,    max: 3 },
    { value: "BTW_5_15",   label: "Between 5 and 15 days", min: 5,   max: 15 },
    { value: "MT_15_DAYS", label: "More than 15 days",    min: 16,   max: null },
    { value: "UP_TO_37",   label: "Up to 37 days",        min: 1,    max: 37 },
  ];
  const [tourDuration, setTourDuration] = useState(
    searchCriteria.tourDuration || "ANY"
  );

  // Per-field validation errors. Keyed by field name so the matching
  // Form control can show inline feedback and the field outline turns
  // red until the user fixes it.
  const [searchErrors, setSearchErrors] = useState({});
  const clearSearchError = (field) =>
    setSearchErrors((prev) => {
      if (!prev[field]) return prev;
      const { [field]: _omit, ...rest } = prev;
      return rest;
    });

  // Compute an activity's duration in whole days. Prefers backend
  // {durationHr, durationMin}; falls back to Viator's hour range when
  // present. Returns null when the activity carries no duration data
  // — those rows are kept in results regardless of the filter (so a
  // missing field doesn't accidentally hide everything).
  const activityDurationInDays = (a) => {
    const hrs =
      Number(a.durationHr) ||
      Number(a.viatorActivityDurationFrom) ||
      0;
    const mins = Number(a.durationMin) || 0;
    const totalMins = hrs * 60 + mins;
    if (totalMins <= 0) return null;
    return Math.max(1, Math.ceil(totalMins / (60 * 24)));
  };

  const passesDurationFilter = (activity, optionValue) => {
    const opt = DURATION_OPTIONS.find((o) => o.value === optionValue);
    if (!opt || (opt.min == null && opt.max == null)) return true;
    const days = activityDurationInDays(activity);
    if (days == null) return true; // unknown duration → don't filter out
    if (opt.min != null && days < opt.min) return false;
    if (opt.max != null && days > opt.max) return false;
    return true;
  };
  
  // Results State
  const [tourResults, setTourResults] = useState([]);
  const [tourLoading, setTourLoading] = useState(false);
  const [hasTourSearched, setHasTourSearched] = useState(false);
  // When results are on screen the big search form collapses into a sticky
  // summary strip. Clicking "Modify Search" flips this true to re-expand it.
  const [isEditingSearch, setIsEditingSearch] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState(null);
  // Index for the gallery thumbnail strip inside the details modal.
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  // ── Result presentation: sort + view mode + price-range filter ──
  // Sort: NONE / price asc / price desc — applied client-side on
  // `totalRate`. View: list (default, horizontal cards) or grid
  // (vertical cards, 3 per row on lg). Persisted only in component
  // state — refreshing the page resets both.
  const [sortOrder, setSortOrder] = useState("NONE");
  const [viewMode, setViewMode] = useState("list");

  // ── Result filters (client-side, applied on top of the search) ──
  // Type:  ALL | 1 (Private) | 2 (SIC)  — matches activity.activityType.
  // Name:  free-text contains match on the activity / package name.
  // Star:  ALL | "5" | "4" … — matches floor(activity.starRating).
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [nameFilter, setNameFilter] = useState("");
  const [starFilter, setStarFilter] = useState("ALL");

  // ── Details modal: full activity-rate record (same payload the
  // /registration/activity-rate/view/{id} page renders). Fetched lazily
  // when the eye icon is clicked, keyed off the result's activityRateId. ──
  const [rateDetails, setRateDetails] = useState(null);
  const [rateExtras, setRateExtras] = useState({
    inclusions: [],
    terms: [],
    cancellations: [],
  });
  const [rateLoading, setRateLoading] = useState(false);
  // Resolved Country / Place names for the modal — the rate DTO only
  // carries the IDs, so we look the names up by id when the modal opens.
  const [rateCountryName, setRateCountryName] = useState("");
  const [ratePlaceName, setRatePlaceName] = useState("");

  // ── Agent credit gate ────────────────────────────────────────────
  // Mirrors the RoomList pattern: a numeric balance fetched once an
  // agent is selected, plus a soft "insufficient credit" popup that
  // appears on Book Now when the activity's total exceeds the
  // available balance. OK on the popup resumes the original Book Now
  // call (with skipCreditCheck=true) so the user still lands on the
  // booking page where they can choose online payment.
  const [agentBalance, setAgentBalance] = useState(null);
  const [showInsufficientCreditModal, setShowInsufficientCreditModal] =
    useState(false);
  const [pendingBookingFn, setPendingBookingFn] = useState(null);

  // ── Agent selector (mirrors HotelSearch.jsx pattern) ─────────────────
  const [agent, setAgent] = useState("");
  const [agents, setAgents] = useState([]);

  const loadAgents = async () => {
    try {
      const res = await axiosInstance.get("/api/agent?activeOnly=true");
      setAgents(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load agents:", err);
      setAgents([]);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  // Fetch the selected agent's available credit balance for the
  // pre-booking gate. Resets to null whenever the agent selection
  // clears, so an agent that's never been picked never gates a
  // booking. Identical contract to the RoomList implementation.
  useEffect(() => {
    const aId = agent ? String(agent).trim() : "";
    if (!aId) {
      setAgentBalance(null);
      return;
    }
    let cancelled = false;
    axiosInstance
      .get(`/api/agent-credit-limit/agent/${aId}`)
      .then((res) => {
        if (!cancelled)
          setAgentBalance(res?.data?.availableCreditLimit ?? null);
      })
      .catch(() => {
        if (!cancelled) setAgentBalance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [agent]);

  // Returns true when the activity total exceeds the available
  // balance. Skipped (returns false) when no balance is loaded — the
  // server-side check at booking time remains authoritative.
  const isInsufficientBalance = (requiredAmount) => {
    if (agentBalance == null) return false;
    const required = Number(requiredAmount) || 0;
    const available = Number(agentBalance) || 0;
    return required > available;
  };

  // Country & Destination state
  const [nationalityList, setNationalityList] = useState([]);
  const [destinationOptions, setDestinationOptions] = useState([]);
  const [isDestinationLoading, setIsDestinationLoading] = useState(false);
  const [isNationalityLoading, setIsNationalityLoading] = useState(false);

  // Debounce utility function
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Debounced city search function
  const debouncedCitySearch = useRef(
    debounce(async (searchText = "") => {
      if (!searchText || searchText.length < 2) {
        setDestinationOptions([]);
        return;
      }

      setIsDestinationLoading(true);
      try {
        const response = await axiosInstance.get(
          `/api/province?search=${searchText}`
        );
        const cityApiRes = Array.isArray(response.data) ? response.data : [];
        const options = cityApiRes.slice(0, 50).map((city) => ({
          value: city.id,
          label: `${city.stateName}, ${city.country}`,
          countryId: city.countryId,
          code: city.countryCode,
          type: "State"
        }));
        setDestinationOptions(options);
      } catch (error) {
        console.log("axios call error for city list:", error);
        setDestinationOptions([]);
      } finally {
        setIsDestinationLoading(false);
      }
    }, 300)
  ).current;

  // Debounced country search function
  const debouncedCountrySearch = useRef(
    debounce(async (search) => {
      try {
        setIsNationalityLoading(true);
        const response = await axiosInstance.get(`/api/country?search=${search}`);
        const options = Array.isArray(response.data)
          ? response.data.map((country) => ({
            value: country.id,
            label: country.name,
            code: country.countryCode,
          }))
          : [];
        setNationalityList(options);
      } catch (error) {
        console.log("axios call error for country list:", error);
        setNationalityList([]);
      } finally {
        setIsNationalityLoading(false);
      }
    }, 300)
  ).current;

  const countryList = async (search = "") => {
    if (search) {
      debouncedCountrySearch(search);
    } else {
      try {
        setIsNationalityLoading(true);
        const response = await axiosInstance.get("/api/country?limit=50");
        const options = Array.isArray(response.data)
          ? response.data.map((country) => ({
            value: country.id,
            label: country.name,
            code: country.countryCode,
          }))
          : [];
        setNationalityList(options);
      } catch (error) {
        console.log("error for country list:", error);
        setNationalityList([]);
      } finally {
        setIsNationalityLoading(false);
      }
    }
  };

  const handleCountryInputChange = (inputValue) => {
    if (inputValue.length >= 2) {
      debouncedCountrySearch(inputValue);
    }
  };

  const cityList = (searchText = "") => {
    debouncedCitySearch(searchText);
  };

  const loadPopularDestinations = async () => {
    if (destinationOptions.length > 0) return;

    try {
      setIsDestinationLoading(true);
      const response = await axiosInstance.get("/api/province?limit=20");
      const cityApiRes = Array.isArray(response.data) ? response.data : [];
      const options = cityApiRes.map((city) => ({
        value: city.id,
        label: `${city.stateName}, ${city.country}`,
        countryId: city.countryId,
        code: city.countryCode,
        type: "State"
      }));
      setDestinationOptions(options);
    } catch (error) {
      console.log("Error loading popular destinations:", error);
    } finally {
      setIsDestinationLoading(false);
    }
  };

  // Fetch initial master data
  useEffect(() => {
    countryList();
  }, []);

  // Update tour child ages when number of children changes
  useEffect(() => {
    if (tourChildren > 0) {
      setTourChildAges((prevAges) => {
        const currentAges = [...prevAges];
        while (currentAges.length < tourChildren) {
          currentAges.push(5); // Default age
        }
        if (currentAges.length > tourChildren) {
          currentAges.splice(tourChildren);
        }
        return currentAges;
      });
    } else {
      setTourChildAges([]);
    }
  }, [tourChildren]);

  const handleTourChildAgeChange = (index, value) => {
    const updatedAges = [...tourChildAges];
    updatedAges[index] = parseInt(value) || 5;
    setTourChildAges(updatedAges);
  };

  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const handleTourSearchSubmit = async (e) => {
    e.preventDefault();

    // ── Inline validation ────────────────────────────────────────
    // Build the full error map up-front so every invalid field
    // surfaces its inline message at once (not one toast per field).
    const errs = {};
    if (!nationality) errs.nationality = "Nationality is required.";
    if (!isAgentRole && !agent) errs.agent = "Agent is required.";
    if (!destinations || destinations.length === 0)
      errs.destinations = "Select at least one destination.";
    if (!tourDate) errs.tourDate = "Tour date is required.";
    if (tourDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const selected = new Date(tourDate);
      if (Number.isNaN(selected.getTime())) {
        errs.tourDate = "Tour date is invalid.";
      } else if (selected < today) {
        errs.tourDate = "Tour date cannot be in the past.";
      }
    }
    if (!tourAdults || Number(tourAdults) < 1) {
      errs.tourAdults = "At least 1 adult required.";
    }
    if (Number(tourChildren) > 0) {
      const missing = tourChildAges.findIndex(
        (age) => age === "" || age == null || Number.isNaN(Number(age))
      );
      if (missing !== -1) {
        errs.tourChildAges = "Enter an age for every child.";
      }
    }
    if (!tourDuration) {
      errs.tourDuration = "Choose a duration option.";
    }
    setSearchErrors(errs);
    if (Object.keys(errs).length > 0) {
      // toast.error("Please fix the highlighted fields and try again.");
      return;
    }

    setTourLoading(true);
    setHasTourSearched(true);
    setIsEditingSearch(false);
    setTourResults([]);

    try {
      const agentId = (agent && String(agent))
                   || sessionStorage.getItem("makeYourOwnPackageAgentId")
                   || localStorage.getItem("makeYourOwnPackageAgentId")
                   || "1";

      // Multi-city support — send `destinationCityIds` as an array, and
      // keep `destinationCityId` set to the first one so older backend
      // builds without the array support still get a sensible request.
      const cityIds = destinations.map((d) => Number(d.value)).filter(Boolean);
      const firstDest = destinations[0] || {};
      const activityPayload = {
        activityDate: formatDate(tourDate),
        nativeCountryId: nationality.value ? String(nationality.value) : "",
        destinationCountryId: firstDest.countryId || "",
        destinationCityId: firstDest.value || "",
        destinationCityIds: cityIds,
        searchCorCtype: firstDest.type || "State",
        agentId: String(agentId),
        childAge: tourChildAges && tourChildAges.length > 0
            ? tourChildAges.map((age) => String(parseInt(age) || 0))
            : tourChildren > 0
              ? Array(tourChildren).fill("0")
              : [],
        adult: String(tourAdults || 1),
        child: String(tourChildren || 0),
      };

      // Agent search log (Unbooked Opportunities → Searches tab) —
      // tours & activities uses tourDate and multi-city destinations.
      logAgentSearch({
        agentId: agentId ? Number(agentId) : null,
        destinationId: firstDest?.value,
        destinationLabel: firstDest?.label,
        nationalityLabel: nationality?.label,
        checkIn: tourDate,
        checkOut: tourDate,
        rooms: [
          {
            adults: Number(tourAdults) || 1,
            children: Number(tourChildren) || 0,
          },
        ],
        source: "tours-and-activities",
      });

      const response = await axiosInstance.post(
        "/api/makeYourOwnPackage/getActivityInhouse",
        activityPayload
      );

      const mappedResults = Array.isArray(response.data)
        ? response.data.map((activity, index) => {
          // Normalise images. Backend may send a single string field
          // (`activityImage`) or a list (`activityImages` / `images`)
          // once multi-image support lands — accept both, fall back
          // to the placeholder when nothing is configured.
          const imagesRaw =
            (Array.isArray(activity.activityImages) && activity.activityImages.length > 0)
              ? activity.activityImages
              : (Array.isArray(activity.images) && activity.images.length > 0)
                ? activity.images
                : (activity.activityImage ? [activity.activityImage] : []);
          const images = imagesRaw.length > 0
            ? imagesRaw
            : ["https://via.placeholder.com/400x225?text=Activity"];
          // Hotel inclusions for the info modal — backend may send a
          // simple string list or a list of {hotelId, hotelName} objects.
          const includedHotels = Array.isArray(activity.includedHotels)
            ? activity.includedHotels.map((h) =>
                typeof h === "string"
                  ? { hotelName: h }
                  : {
                      hotelId: h.hotelId,
                      hotelName: h.hotelName || h.name,
                      // Backend (TripServiceImpl) populates these from
                      // Hotel.address + the first HotelContactDetails
                      // row. Fall back to common alternate field names.
                      address: h.address || h.hotelAddress || null,
                      email: h.email || h.hotelEmail || h.personalEmail || null,
                      mobile:
                        h.mobile ||
                        h.hotelMobile ||
                        h.mobileNumber ||
                        h.teleNumber ||
                        h.phone ||
                        null,
                    }
              )
            : [];
          const itinerary = Array.isArray(activity.itinerary)
            ? activity.itinerary
            : (activity.itineraryText ? [{ description: activity.itineraryText }] : []);
          return {
            id: activity.activityId || `activity-${index}`,
            activityRateId: activity.activityRateId || activity.activityId,
            activityName: activity.activityname || "",
            activityDetails: activity.activityDetails || "",
            starRating: activity.starRating || 0,
            totalRate: activity.totalRate || activity.activityRate || 0,
            // Backend's typo'd field is the canonical one; keep both
            // shapes available so any consumer (booking page, summary)
            // can read whichever it expects.
            totalRateWithoutMrk: activity.totalRateWithoutmrk || activity.totalRateWithoutMarkup || activity.activityRate || 0,
            totalRateWithoutMarkup: activity.totalRateWithoutmrk || activity.totalRateWithoutMarkup || activity.activityRate || 0,
            // Primary image (first image) kept for the result-card thumb;
            // the full gallery lives on `images` for the info modal.
            activityImage: images[0],
            images,
            includedHotels,
            itinerary,
            cityId: activity.cityId || null,
            cityName: activity.cityName || "",
            childMax: activity.childMax || 0,
            childMin: activity.childMin || 0,
            adultRate: activity.adultRate || 0,
            childRate: activity.childRate || 0,
            activityType: activity.activityType || 1,
            maxPax: activity.maxPax || 0,
            minPaxsic: activity.minPaxsic || 0,
            currency: activity.currencyCode || "AED",
            duration: activity.viatorActivityDurationFrom && activity.viatorActivityDurationTo
                ? `${activity.viatorActivityDurationFrom} - ${activity.viatorActivityDurationTo}`
                : null,
            apiType: activity.apiType || null,
            viatorProductCode: activity.viatorProductCode || null,
            reportingPoint: activity.reportingPoint || activity.reportingpoint || null,
            durationHr: activity.durationHr ?? null,
            durationMin: activity.durationMin ?? null,
          };
        })
        : [];

      // Apply the duration filter on the client. We keep activities
      // with unknown duration so a malformed/missing field doesn't
      // wipe out all results — see `passesDurationFilter`.
      const filteredByDuration =
        tourDuration && tourDuration !== "ANY"
          ? mappedResults.filter((a) => passesDurationFilter(a, tourDuration))
          : mappedResults;
      setTourResults(filteredByDuration);
    } catch (err) {
      console.error("Activity search failed:", err);
      toast.error("Failed to search for activities.");
      setTourResults([]);
    } finally {
      setTourLoading(false);
    }
  };

  const handleBookNow = (activity, skipCreditCheck = false) => {
    // Pre-booking credit gate. When the activity's total exceeds the
    // agent's available balance we raise the InsufficientCreditModal
    // — clicking OK re-enters this same function with
    // skipCreditCheck=true so the booking still opens (online / cash
    // payment available on the booking page).
    const total = Number(activity?.totalRate) || 0;
    if (!skipCreditCheck && isInsufficientBalance(total)) {
      setPendingBookingFn(() => () => handleBookNow(activity, true));
      setShowInsufficientCreditModal(true);
      return;
    }

    // Open the booking page in a NEW window so the search results
    // stay open in the original tab — mirrors the RoomList →
    // HotelBookingPage flow. window.open can't carry React Router
    // location.state, so we persist the activity + searchCriteria in
    // sessionStorage; ActivityBookingPage reads sessionStorage when
    // location.state is empty (fresh-tab fallback).
    const payload = {
      activity,
      searchCriteria: {
        nationality,
        destination: destinations[0] || null,
        destinations,
        tourDate,
        tourDuration,
        adults: tourAdults,
        children: tourChildren,
        childAges: tourChildAges,
        agent,
      },
    };
    try {
      sessionStorage.setItem(
        "activityBookingPayload",
        JSON.stringify(payload),
      );
    } catch (e) {
      console.error("Failed to persist activity booking payload:", e);
    }
    window.open("/new-booking/tours-and-activities/booking", "_blank");
  };

  const renderStars = (rating) => {
    return Array.from({ length: Math.floor(rating || 0) }, (_, i) => (
      <FaStar key={i} className="text-warning" size={14} />
    ));
  };

  // Open the details modal and lazily fetch the full activity-rate
  // record + its inclusions / terms / cancellation rows — the exact
  // same two calls the /registration/activity-rate/view/{id} page
  // makes — so the modal shows all the same details.
  const openActivityDetails = (activity) => {
    setSelectedActivity(activity);
    setActiveImageIndex(0);
    setShowActivityModal(true);
    setRateDetails(null);
    setRateExtras({ inclusions: [], terms: [], cancellations: [] });
    setRateCountryName("");
    setRatePlaceName("");

    const rateId = activity?.activityRateId;
    if (!rateId) return;

    setRateLoading(true);
    Promise.allSettled([
      axiosInstance.get(`/api/activityRate/${rateId}`),
      axiosInstance.get(`/api/activityRate/inclutionAndTerms/${rateId}`),
    ])
      .then(([rateRes, extrasRes]) => {
        if (rateRes.status === "fulfilled" && rateRes.value?.data) {
          const data = rateRes.value.data;
          setRateDetails(data);
          // Look up the actual Country / Place names by id (the rate
          // DTO only ships countryId / placeId). Failures fall back to
          // the ID display already handled in the modal.
          if (data.countryId) {
            axiosInstance
              .get(`/api/country/${data.countryId}`)
              .then((r) => setRateCountryName(r.data?.name || ""))
              .catch(() => {});
          }
          if (data.placeId) {
            axiosInstance
              .get(`/api/province/${data.placeId}`)
              .then((r) => setRatePlaceName(r.data?.stateName || ""))
              .catch(() => {});
          }
        }
        if (
          extrasRes.status === "fulfilled" &&
          Array.isArray(extrasRes.value?.data)
        ) {
          const all = extrasRes.value.data;
          setRateExtras({
            inclusions: all
              .filter((x) => x.type === 1)
              .map((x) => x.data || "")
              .filter(Boolean),
            terms: all
              .filter((x) => x.type === 2)
              .map((x) => x.data || "")
              .filter(Boolean),
            cancellations: all
              .filter((x) => x.type === 3)
              .map((x) => x.data || "")
              .filter(Boolean),
          });
        }
      })
      .finally(() => setRateLoading(false));
  };

  // Build the filtered + sorted result list once per render. Type,
  // name and star filters are layered on top of the duration filter
  // already applied at search time, then the price sort is applied.
  const visibleResults = [...tourResults]
    .filter((a) => {
      if (typeFilter !== "ALL" && String(a.activityType) !== String(typeFilter))
        return false;
      if (
        nameFilter.trim() &&
        !(a.activityName || "")
          .toLowerCase()
          .includes(nameFilter.trim().toLowerCase())
      )
        return false;
      if (
        starFilter !== "ALL" &&
        String(Math.floor(Number(a.starRating) || 0)) !== String(starFilter)
      )
        return false;
      return true;
    })
    .sort((a, b) => {
      if (sortOrder === "ASC")
        return (Number(a.totalRate) || 0) - (Number(b.totalRate) || 0);
      if (sortOrder === "DESC")
        return (Number(b.totalRate) || 0) - (Number(a.totalRate) || 0);
      return 0;
    });

  // Fixed star-category options 1–5 (always shown regardless of the
  // current result set); selecting one filters by floor(starRating).
  const starOptions = [1, 2, 3, 4, 5];

    const customSelectStyles = {
  control: (base) => ({
    ...base,
    minHeight: "46px",
    height: "46px",
    borderRadius: "0.375rem", // matches bootstrap
  }),
  valueContainer: (base) => ({
    ...base,
    height: "46px",
    padding: "0 8px",
  }),
  indicatorsContainer: (base) => ({
    ...base,
    height: "46px",
  }),
};

  // Results are on screen once a search has run. Collapse the full form into
  // the sticky summary strip then, unless the user chose to modify the search.
  const collapseSearch = hasTourSearched && !isEditingSearch;

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4 hs-page">
          <Card className="shadow-sm rounded-xl mb-4 border-0">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-start mb-4">
                <h4 className="fw-bold text-primary mb-0">
                  Tours & Activities Search
                </h4>
                {/* Agent logins see their available credit balance at the
                    right end of the heading row (renders nothing for other
                    roles). */}
                <AgentCreditBalance />
               
              </div>

              {/* ── Collapsed sticky search summary strip ──
                  Shown once results are on screen. "Modify Search" re-expands
                  the full form by flipping isEditingSearch. */}
              {collapseSearch && (
                <div className="hs-summary-bar">
                  <div className="hs-summary-chips">
                    {destinations[0]?.label && (
                      <span className="hs-summary-chip hs-summary-chip-main">
                        {destinations[0].label}
                      </span>
                    )}
                    {tourDate && (
                      <span className="hs-summary-chip">{tourDate}</span>
                    )}
                    <span className="hs-summary-chip">
                      {tourAdults} adults
                      {tourChildren ? `, ${tourChildren} child` : ""}
                    </span>
                  </div>
                  <Button
                    type="button"
                    className="hs-summary-modify"
                    onClick={() => {
                      setIsEditingSearch(true);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <FaSearch className="me-2" />
                    Modify Search
                  </Button>
                </div>
              )}

              {/* ── Search Card + Ads ── */}
              {!collapseSearch && (
              <div className="d-flex gap-3 align-items-start mb-4 hs-search-ads-row">
              <div className="flex-grow-1" style={{ minWidth: 0 }}>
              <Card className="border-0 shadow-sm rounded-4 bg-white mb-4">
               <Card.Body>
  <Form onSubmit={handleTourSearchSubmit}>

     

    {/* 🔷 Row 1 — Nationality + Destinations (both required). */}
    <Row className="g-3 mb-3">

       {!isAgentRole && (
      <Col md={4}>
        <Form.Label className="fw-semibold">
          Agent <span className="text-danger">*</span>
        </Form.Label>
        <AgentSelect
          agents={agents}
          value={agent}
          isInvalid={!!searchErrors.agent}
          onChange={(v) => setAgent(v)}
        />
        <AgentBalanceDisplay agentId={agent} />
        {searchErrors.agent && (
          <div className="text-danger small mt-1">{searchErrors.agent}</div>
        )}
      </Col>
      )}

      <Col md={4}>
        <Form.Label className="fw-semibold">
          Destinations <span className="text-danger">*</span>
        </Form.Label>
        <Select
          options={destinationOptions}
          value={destinations}
          onChange={(opts) => {
            const next = Array.isArray(opts) ? opts : [];
            setDestinations(next);
            if (next.length > 0) clearSearchError("destinations");
          }}
          placeholder="Search destinations..."
          isSearchable
          isClearable
          isMulti
          className="modern-select-sm"
          isLoading={isDestinationLoading}
          noOptionsMessage={() =>
            isDestinationLoading
              ? "Searching destinations..."
              : "Type to search destinations..."
          }
          onMenuOpen={() => {
            if (destinationOptions.length === 0) {
              loadPopularDestinations();
            }
          }}
          onInputChange={(inputValue, { action }) => {
            if (action === "input-change") {
              cityList(inputValue);
            }
          }}
          menuPortalTarget={document.body}
          styles={{
            ...customSelectStyles,
            // react-select renders multi tags inside the control — relax
            // the fixed height so multiple selections wrap cleanly.
            control: (base) => ({
              ...customSelectStyles.control(base),
              minHeight: 46,
              height: "auto",
              borderColor: searchErrors.destinations ? "#dc3545" : base.borderColor,
            }),
            valueContainer: (base) => ({
              ...customSelectStyles.valueContainer(base),
              height: "auto",
              padding: "4px 8px",
            }),
            menuPortal: base => ({ ...base, zIndex: 9999 }),
          }}
        />
        {searchErrors.destinations && (
          <div className="text-danger small mt-1">{searchErrors.destinations}</div>
        )}
        {/* Surface UAE-resident status when any selected destination city
            belongs to the UAE so the operator can apply the resident rate.
            Destinations is a multi-select — `.some` catches the case where
            the UAE city is one of several picks. Matched on the city's
            country code "AE" (from master_country) so a label change can't
            break the rule. */}
        {Array.isArray(destinations) &&
          destinations.some((d) => d?.code === "AE") && (
            <div
              className="mt-1 small"
              style={{ color: "#0f7a3a", lineHeight: 1.25 }}
            >
              For UAE resident holders, please mention the nationality as United Arab Emirates regardless of the actual nationality.
            </div>
          )}
      </Col>

        <Col md={4}>
        <Form.Label className="fw-semibold">
          Nationality <span className="text-danger">*</span>
        </Form.Label>
        <Select
          options={nationalityList}
          value={nationality}
          onChange={(opt) => {
            setNationality(opt);
            if (opt) clearSearchError("nationality");
          }}
          onInputChange={handleCountryInputChange}
          isLoading={isNationalityLoading}
          placeholder="Search Nationality"
          isSearchable
          isClearable
          className="modern-select-sm"
          menuPortalTarget={document.body}
          styles={{
            ...customSelectStyles,
            control: (base) => ({
              ...customSelectStyles.control(base),
              borderColor: searchErrors.nationality ? "#dc3545" : base.borderColor,
            }),
            menuPortal: base => ({ ...base, zIndex: 9999 }),
          }}
        />
        {searchErrors.nationality && (
          <div className="text-danger small mt-1">{searchErrors.nationality}</div>
        )}
      </Col>

    </Row>

    {/* 🔷 Row 2 — Tour Date + Duration. */}
    <Row className="g-3 mb-3 align-items-end">
      <Col md={6}>
        <Form.Label className="fw-semibold">
          Tour Date <span className="text-danger">*</span>
        </Form.Label>
        <Form.Control
          style={{height:"46px"}}
          type="date"
          value={tourDate}
          isInvalid={!!searchErrors.tourDate}
          onChange={(e) => {
            setTourDate(e.target.value);
            if (e.target.value) clearSearchError("tourDate");
          }}
          min={new Date().toISOString().split("T")[0]}
        />
        <Form.Control.Feedback type="invalid">
          {searchErrors.tourDate}
        </Form.Control.Feedback>
      </Col>

      <Col md={6}>
        <Form.Label className="fw-semibold">
          Duration <span className="text-danger">*</span>
        </Form.Label>
        <Form.Select
          style={{height:"46px"}}
          value={tourDuration}
          isInvalid={!!searchErrors.tourDuration}
          onChange={(e) => {
            setTourDuration(e.target.value);
            if (e.target.value) clearSearchError("tourDuration");
          }}
        >
          {DURATION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Form.Select>
        <Form.Control.Feedback type="invalid">
          {searchErrors.tourDuration}
        </Form.Control.Feedback>
        {/* <small className="text-muted">
          Filters results to activities whose duration falls in this window.
          Activities with no duration data are kept.
        </small> */}
      </Col>
    </Row>

    {/* 🔷 Row 3 — Pax counts. */}
    <Row className="g-3 align-items-end">
      <Col md={6}>
        <Form.Label className="fw-semibold">
          Adults <span className="text-danger">*</span>
        </Form.Label>
        <Form.Select
          style={{height:"46px"}}
          value={tourAdults}
          isInvalid={!!searchErrors.tourAdults}
          onChange={(e) => {
            setTourAdults(parseInt(e.target.value) || 1);
            clearSearchError("tourAdults");
          }}
        >
          {Array.from({ length: 9 }, (_, i) => i + 1).map((num) => (
            <option key={num} value={num}>
              {num}
            </option>
          ))}
        </Form.Select>
        <Form.Control.Feedback type="invalid">
          {searchErrors.tourAdults}
        </Form.Control.Feedback>
      </Col>

      <Col md={6}>
        <Form.Label className="fw-semibold">Children</Form.Label>
        <Form.Select
          style={{height:"46px"}}
          value={tourChildren}
          onChange={(e) => {
            setTourChildren(parseInt(e.target.value) || 0);
            clearSearchError("tourChildAges");
          }}
        >
          {Array.from({ length: 6 }, (_, i) => i).map((num) => (
            <option key={num} value={num}>
              {num}
            </option>
          ))}
        </Form.Select>
      </Col>
    </Row>
   <Row className="mt-4">
  <Col md={12} className="d-flex justify-content-center">
    <Button
      variant="danger"
      className="px-4 fw-bold"
      type="submit"
      disabled={tourLoading}
      style={{ height: "38px" }}
    >
      {tourLoading ? (
        <>
          <Spinner animation="border" size="sm" className="me-2" />
          Searching...
        </>
      ) : (
        <>
          <FaSearch className="me-2" /> Search Activities
        </>
      )}
    </Button>
  </Col>
</Row>

    {/* 🔷 Child Ages */}
    {tourChildren > 0 && (
      <Row className="mt-3">
        <Col md={12}>
          <Form.Label className="fw-semibold">
            Child Ages <span className="text-danger">*</span>
          </Form.Label>

          <div className="d-flex flex-wrap gap-2">
            {tourChildAges.map((age, index) => (
              <Form.Control
                key={index}
                type="number"
                min="0"
                max="17"
                placeholder="Age"
                value={age}
                style={{ width: "80px" }}
                isInvalid={!!searchErrors.tourChildAges}
                onChange={(e) => {
                  handleTourChildAgeChange(index, e.target.value);
                  clearSearchError("tourChildAges");
                }}
              />
            ))}
          </div>
          {searchErrors.tourChildAges && (
            <div className="text-danger small mt-1">
              {searchErrors.tourChildAges}
            </div>
          )}
        </Col>
      </Row>
    )}

  </Form>
</Card.Body>
              </Card>
              </div>
              {/* Ads carousel — only on first entry, before any search has run.
                  Re-opening the form via "Modify Search" keeps it hidden. */}
              {!hasTourSearched && (
                <AdvertisementCarousel
                  cityId={destinations[0]?.value}
                  cityName={destinations[0]?.label}
                />
              )}
              </div>
              )}

              {/* Loading State */}
              {tourLoading && (
                <Card className="shadow-sm rounded-xl mb-4 mt-4 border-0">
                  <Card.Body className="text-center py-5">
                    <Spinner animation="border" variant="primary" style={{ width: '3rem', height: '3rem' }} />
                    <h5 className="text-primary fw-bold mt-3 mb-1">
                      Searching Activities...
                    </h5>
                    <p className="text-muted small mb-0">
                      Finding available activities for you
                    </p>
                  </Card.Body>
                </Card>
              )}

              {/* Empty State */}
              {!hasTourSearched && !tourLoading && (
                <div className="text-center text-muted mt-5 py-5 bg-white rounded-4 shadow-sm border-0">
                  <FaTicketAlt className="display-4 text-secondary mb-3 opacity-50" />
                  <h5>Ready to book an activity?</h5>
                  <p>Run a search to view available activities and options.</p>
                </div>
              )}

              {/* Results Display — wrapped in a Row with a left
                  filter sidebar (sort + view toggle, scaffolded for
                  more filters later) and the results column on the
                  right. Default view is "list" (horizontal cards);
                  "grid" stacks cards into 3-per-row tiles. */}
              {hasTourSearched && !tourLoading && tourResults.length > 0 && (
                <div className="mt-4">
                  <div className="d-flex justify-content-between align-items-end mb-3 flex-wrap gap-2">
                    <div>
                      <h5 className="fw-bold text-dark mb-0">
                        Activity Results
                        <span className="text-muted fs-6 fw-normal ms-2">
                          ({tourResults.length} found
                          {destinations.length > 1
                            ? ` across ${destinations.length} cities`
                            : ""}
                          )
                        </span>
                      </h5>
                      {/* DataTables-style entries summary, reflecting the
                          currently filtered/visible rows. */}
                      <div className="text-muted small mt-1">
                        {visibleResults.length > 0
                          ? `Showing 1 to ${visibleResults.length} of ${visibleResults.length} entries`
                          : "Showing 0 to 0 of 0 entries"}
                        {visibleResults.length !== tourResults.length
                          ? ` (filtered from ${tourResults.length} total)`
                          : ""}
                      </div>
                    </div>

                    {/* View toggle — list (default) / grid. Mirrors
                        the toggle pattern used on RoomList so the
                        whole app feels uniform. */}
                    <div className="btn-group shadow-sm gap-1" role="group">
                      <Button
                        variant={
                          viewMode === "list" ? "primary" : "outline-primary"
                        }
                        size="sm"
                        onClick={() => setViewMode("list")}
                        title="List view"
                      >
                        <span className="fs-5" style={{ lineHeight: 1 }}>
                          ☰
                        </span>
                      </Button>
                      <Button
                        variant={
                          viewMode === "grid" ? "primary" : "outline-primary"
                        }
                        size="sm"
                        onClick={() => setViewMode("grid")}
                        title="Grid view"
                      >
                        <span className="fs-5" style={{ lineHeight: 1 }}>
                          ⊞
                        </span>
                      </Button>
                    </div>
                  </div>

                  <Row className="g-3">
                    {/* ── Left filter sidebar ── */}
                    <Col lg={3} md={4}>
                      <Card className="border-0 shadow-sm">
                        <Card.Body className="p-3">
                          <h6 className="fw-bold mb-3">Filters</h6>

                          {/* ── Type: Private / SIC / All ── */}
                          <div className="mb-3">
                            <div className="small text-muted mb-1">Type</div>
                            <Form.Check
                              type="radio"
                              id="type-all"
                              name="type-filter"
                              label="All"
                              checked={typeFilter === "ALL"}
                              onChange={() => setTypeFilter("ALL")}
                            />
                            <Form.Check
                              type="radio"
                              id="type-private"
                              name="type-filter"
                              label="Private"
                              checked={typeFilter === "1"}
                              onChange={() => setTypeFilter("1")}
                            />
                            <Form.Check
                              type="radio"
                              id="type-sic"
                              name="type-filter"
                              label="SIC"
                              checked={typeFilter === "2"}
                              onChange={() => setTypeFilter("2")}
                            />
                          </div>

                          {/* ── Package / activity name search ── */}
                          <div className="mb-3">
                            <div className="small text-muted mb-1">
                              Package name
                            </div>
                            <Form.Control
                              type="text"
                              size="sm"
                              placeholder="Filter by name..."
                              value={nameFilter}
                              onChange={(e) => setNameFilter(e.target.value)}
                            />
                          </div>

                          {/* ── Star category ── */}
                          <div className="mb-3">
                            <div className="small text-muted mb-1">
                              Star category
                            </div>
                            <Form.Select
                              size="sm"
                              value={starFilter}
                              onChange={(e) => setStarFilter(e.target.value)}
                            >
                              <option value="ALL">All ratings</option>
                              {starOptions.map((s) => (
                                <option key={s} value={String(s)}>
                                  {s} Star{s > 1 ? "s" : ""}
                                </option>
                              ))}
                            </Form.Select>
                          </div>

                          <hr className="my-3" />

                          <div className="mb-3">
                            <div className="small text-muted mb-1">
                              Sort by price
                            </div>
                            <Form.Check
                              type="radio"
                              id="sort-none"
                              name="sort-order"
                              label="Default"
                              checked={sortOrder === "NONE"}
                              onChange={() => setSortOrder("NONE")}
                            />
                            <Form.Check
                              type="radio"
                              id="sort-asc"
                              name="sort-order"
                              label="Low to High"
                              checked={sortOrder === "ASC"}
                              onChange={() => setSortOrder("ASC")}
                            />
                            <Form.Check
                              type="radio"
                              id="sort-desc"
                              name="sort-order"
                              label="High to Low"
                              checked={sortOrder === "DESC"}
                              onChange={() => setSortOrder("DESC")}
                            />
                          </div>

                          {sortOrder !== "NONE" && (
                            <Button
                              variant="link"
                              size="sm"
                              className="p-0"
                              onClick={() => setSortOrder("NONE")}
                            >
                              Clear sort
                            </Button>
                          )}
                        </Card.Body>
                      </Card>
                    </Col>

                    {/* ── Results column ── */}
                    <Col lg={9} md={8}>
                      {visibleResults.length === 0 ? (
                        <Card className="border-0 shadow-sm">
                          <Card.Body className="text-center text-muted py-5">
                            No activities match the selected filters.
                          </Card.Body>
                        </Card>
                      ) : (
                      <Row className="g-3">
                        {visibleResults
                          .map((activity) => {
                      const adultRate = Number(activity.adultRate) || 0;
                      const childRate = Number(activity.childRate) || 0;
                      const baseTotal = Number(activity.totalRateWithoutMarkup) || 0;
                      const finalTotal = Number(activity.totalRate) || baseTotal;
                      const markupAmount =
                        finalTotal > 0 && baseTotal > 0 && finalTotal !== baseTotal
                          ? finalTotal - baseTotal
                          : 0;
                      const durationLabel =
                        activity.durationHr != null || activity.durationMin != null
                          ? `${activity.durationHr || 0}h ${activity.durationMin || 0}m`
                          : activity.duration;
                      // Grid mode stacks the three inner cells
                      // vertically (image on top, info middle,
                      // price/actions bottom) at full width inside
                      // each tile. List mode keeps the original
                      // horizontal split (3 / 6 / 3). The
                      // ternaries below pick the right Bootstrap
                      // breakpoints depending on viewMode.
                      const isGrid = viewMode === "grid";
                      const innerImgCols  = isGrid ? { xs: 12 } : { md: 3 };
                      const innerInfoCols = isGrid ? { xs: 12 } : { md: 6 };
                      const innerPayCols  = isGrid ? { xs: 12 } : { md: 3 };
                      return (
                        <Col
                          key={activity.id}
                          xs={12}
                          md={isGrid ? 6 : 12}
                          lg={isGrid ? 4 : 12}
                        >
                          <Card
                            className="border-0 shadow-sm activity-result-card h-100"
                            style={{ borderRadius: 14, overflow: "hidden" }}
                          >
                            <Card.Body className="p-0">
                              <Row className="g-0">
                                {/* ── Thumbnail (with overlay badges) ── */}
                                <Col {...innerImgCols} className="bg-light position-relative">
                                  <div style={{ height: isGrid ? 180 : "100%", minHeight: 180 }}>
                                    <LazyImage
                                      src={activity.activityImage}
                                      alt={activity.activityName}
                                    />
                                  </div>
                                  {activity.cityName && (
                                    <span
                                      className="position-absolute top-0 start-0 m-2 badge bg-dark bg-opacity-75 text-white"
                                      style={{ fontSize: "0.7rem" }}
                                    >
                                      {activity.cityName}
                                    </span>
                                  )}
                                  {Array.isArray(activity.images) && activity.images.length > 1 && (
                                    <span
                                      className="position-absolute bottom-0 end-0 m-2 badge bg-white text-dark border"
                                      style={{ fontSize: "0.7rem" }}
                                    >
                                      +{activity.images.length - 1} photos
                                    </span>
                                  )}
                                </Col>

                                {/* ── Title + description + facts ── */}
                                <Col {...innerInfoCols} className="p-3 d-flex flex-column">
                                  <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                                    <h5 className="fw-bold mb-0 text-dark">
                                      {activity.activityName || "Activity"}
                                    </h5>
                                    {activity.starRating > 0 && (
                                      <span>{renderStars(activity.starRating)}</span>
                                    )}
                                    {activity.activityType === 2 ? (
                                      <Badge bg="info-subtle" text="info" pill>
                                        SIC
                                      </Badge>
                                    ) : (
                                      <Badge bg="success-subtle" text="success" pill>
                                        Private
                                      </Badge>
                                    )}
                                  </div>

                                  {activity.activityDetails && (
                                    <p
                                      className="text-secondary small mb-2"
                                      style={{ lineHeight: 1.5 }}
                                      dangerouslySetInnerHTML={{
                                        __html:
                                          activity.activityDetails.substring(0, 220) +
                                          (activity.activityDetails.length > 220 ? "…" : ""),
                                      }}
                                    />
                                  )}

                                  <div className="d-flex gap-3 flex-wrap small text-muted mt-auto">
                                    {durationLabel && (
                                      <span>
                                        <i className="bi bi-clock me-1" />
                                        {durationLabel}
                                      </span>
                                    )}
                                    <span>
                                      <FaUsers className="me-1" />
                                      Max: {activity.maxPax || "N/A"}
                                    </span>
                                    {activity.includedHotels?.length > 0 && (
                                      <span>
                                        🏨 {activity.includedHotels.length} hotel
                                        {activity.includedHotels.length !== 1 ? "s" : ""} included
                                      </span>
                                    )}
                                  </div>
                                </Col>

                                {/* ── Pricing + actions ── */}
                                <Col
                                  {...innerPayCols}
                                  className={`p-3 d-flex flex-column justify-content-between text-center bg-light ${
                                    isGrid ? "border-top" : "border-start"
                                  }`}
                                >
                                  <div>
                                    <div className="text-muted small">Total from</div>
                                    <div className="fs-4 fw-bold text-dark">
                                      {activity.currency}{" "}
                                      {finalTotal.toLocaleString()}
                                    </div>
                                    {markupAmount > 0 && (
                                      <div
                                        className="text-muted"
                                        style={{ fontSize: "0.7rem" }}
                                      >
                                        Base {baseTotal.toLocaleString()} + markup{" "}
                                        {markupAmount.toFixed(2)}
                                      </div>
                                    )}
                                    {(adultRate > 0 || childRate > 0) && (
                                      <div
                                        className="text-muted mt-1"
                                        style={{ fontSize: "0.72rem" }}
                                      >
                                        {adultRate > 0 && `Adult: ${adultRate}`}
                                        {adultRate > 0 && childRate > 0 ? " · " : ""}
                                        {childRate > 0 && `Child: ${childRate}`}
                                      </div>
                                    )}
                                  </div>
                                  <div className="d-flex gap-2 justify-content-center mt-3">
                                    <Button
                                      variant="outline-primary"
                                      size="sm"
                                      onClick={() => openActivityDetails(activity)}
                                      title="View Details"
                                    >
                                      <FaEye className="me-1" />
                                    </Button>
                                    <Button
                                      variant="primary"
                                      size="sm"
                                      onClick={() => handleBookNow(activity)}
                                    >
                                      Book Now
                                    </Button>
                                  </div>
                                </Col>
                              </Row>
                            </Card.Body>
                          </Card>
                        </Col>
                      );
                    })}
                      </Row>
                      )}
                    </Col>
                  </Row>
                </div>
              )}

              {hasTourSearched && !tourLoading && tourResults.length === 0 && (
                <div className="text-center text-muted mt-5 py-5 bg-white rounded-4 shadow-sm border-0">
                  <FaTicketAlt className="display-4 text-warning mb-3 opacity-75" />
                  <h5 className="text-dark">No activities found</h5>
                  <p>Try selecting different dates or destinations for your search.</p>
                </div>
              )}
            </Card.Body>
          </Card>

          {/* ── Activity Details Modal ───────────────────────────────
              Richer than the original: hero image + thumbnail strip,
              quick facts, full description, itinerary (if any), and
              included hotels (if any). Falls back gracefully when the
              backend hasn't shipped the richer fields yet. */}
          <Modal
            show={showActivityModal}
            onHide={() => {
              setShowActivityModal(false);
              setSelectedActivity(null);
              setActiveImageIndex(0);
            }}
            size="lg"
            centered
            scrollable
          >
            <Modal.Header closeButton>
              <Modal.Title className="fw-bold">
                {selectedActivity?.activityName || "Activity Details"}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {selectedActivity && (
                <>
                  {/* Image carousel — auto-rotates + arrow controls.
                      `activeImageIndex` is the controlled index so the
                      thumbnail strip below stays in sync with the
                      current slide for keyboard / mouse navigation. */}
                  <div className="mb-3">
                    {(() => {
                      const imgs =
                        Array.isArray(selectedActivity.images) && selectedActivity.images.length > 0
                          ? selectedActivity.images
                          : [selectedActivity.activityImage].filter(Boolean);
                      if (imgs.length === 0) return null;
                      return (
                        <Carousel
                          activeIndex={activeImageIndex}
                          onSelect={(idx) => setActiveImageIndex(idx)}
                          interval={imgs.length > 1 ? 4000 : null}
                          controls={imgs.length > 1}
                          indicators={imgs.length > 1}
                          fade
                          className="bg-dark rounded"
                          style={{ borderRadius: 8, overflow: "hidden" }}
                        >
                          {imgs.map((src, idx) => (
                            <Carousel.Item key={idx}>
                              <img
                                src={src}
                                alt={`${selectedActivity.activityName} ${idx + 1}`}
                                style={{
                                  width: "100%",
                                  height: 360,
                                  objectFit: "cover",
                                  display: "block",
                                }}
                                onError={(e) => {
                                  e.target.src =
                                    "https://via.placeholder.com/800x360?text=Activity+Image";
                                }}
                              />
                              <Carousel.Caption
                                className="d-none d-md-block"
                                style={{
                                  background: "rgba(0,0,0,0.35)",
                                  borderRadius: 6,
                                  padding: "4px 10px",
                                  bottom: 12,
                                  left: "auto",
                                  right: 12,
                                  width: "auto",
                                }}
                              >
                                <small className="m-0">
                                  {idx + 1} / {imgs.length}
                                </small>
                              </Carousel.Caption>
                            </Carousel.Item>
                          ))}
                        </Carousel>
                      );
                    })()}
                    {Array.isArray(selectedActivity.images) &&
                      selectedActivity.images.length > 1 && (
                        <div className="d-flex gap-2 mt-2 overflow-auto pb-1">
                          {selectedActivity.images.map((src, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setActiveImageIndex(idx)}
                              className="border-0 p-0 bg-transparent"
                              style={{ flex: "0 0 auto" }}
                              title={`Image ${idx + 1}`}
                            >
                              <img
                                src={src}
                                alt={`thumb-${idx}`}
                                style={{
                                  width: 90,
                                  height: 60,
                                  objectFit: "cover",
                                  borderRadius: 6,
                                  border:
                                    activeImageIndex === idx
                                      ? "2px solid #0d6efd"
                                      : "2px solid transparent",
                                  cursor: "pointer",
                                  opacity: activeImageIndex === idx ? 1 : 0.75,
                                }}
                                onError={(e) => {
                                  e.target.src =
                                    "https://via.placeholder.com/90x60?text=img";
                                }}
                              />
                            </button>
                          ))}
                        </div>
                      )}
                  </div>

                  {/* Header chips: rating, city, type. */}
                  <div className="d-flex flex-wrap gap-2 mb-3">
                    {selectedActivity.starRating > 0 && (
                      <Badge bg="warning" text="dark">
                        <FaStar className="me-1" />
                        {selectedActivity.starRating} Star
                      </Badge>
                    )}
                    {selectedActivity.cityName && (
                      <Badge bg="secondary">{selectedActivity.cityName}</Badge>
                    )}
                    {selectedActivity.activityType === 2 ? (
                      <Badge bg="info">SIC</Badge>
                    ) : (
                      <Badge bg="success">Private</Badge>
                    )}
                    {selectedActivity.apiType && (
                      <Badge bg="dark">{selectedActivity.apiType}</Badge>
                    )}
                  </div>

                  {/* Quick facts grid. */}
                  <Row className="g-2 mb-3 small">
                    {(selectedActivity.durationHr != null ||
                      selectedActivity.durationMin != null ||
                      selectedActivity.duration) && (
                      <Col md={4}>
                        <div className="border rounded p-2 h-100">
                          <div className="text-muted">Duration</div>
                          <div className="fw-semibold">
                            {selectedActivity.durationHr != null ||
                            selectedActivity.durationMin != null
                              ? `${selectedActivity.durationHr || 0}h ${selectedActivity.durationMin || 0}m`
                              : selectedActivity.duration}
                          </div>
                        </div>
                      </Col>
                    )}
                    {selectedActivity.maxPax > 0 && (
                      <Col md={4}>
                        <div className="border rounded p-2 h-100">
                          <div className="text-muted">Max pax</div>
                          <div className="fw-semibold">
                            {selectedActivity.maxPax}
                          </div>
                        </div>
                      </Col>
                    )}
                    {selectedActivity.minPaxsic > 0 && (
                      <Col md={4}>
                        <div className="border rounded p-2 h-100">
                          <div className="text-muted">Min pax (SIC)</div>
                          <div className="fw-semibold">
                            {selectedActivity.minPaxsic}
                          </div>
                        </div>
                      </Col>
                    )}
                    {(selectedActivity.childMin > 0 ||
                      selectedActivity.childMax > 0) && (
                      <Col md={4}>
                        <div className="border rounded p-2 h-100">
                          <div className="text-muted">Child age range</div>
                          <div className="fw-semibold">
                            {selectedActivity.childMin}–{selectedActivity.childMax} yrs
                          </div>
                        </div>
                      </Col>
                    )}
                    {selectedActivity.reportingPoint && (
                      <Col md={8}>
                        <div className="border rounded p-2 h-100">
                          <div className="text-muted">Reporting point</div>
                          <div className="fw-semibold">
                            {selectedActivity.reportingPoint}
                          </div>
                        </div>
                      </Col>
                    )}
                  </Row>

                  {/* Description. */}
                  {selectedActivity.activityDetails && (
                    <div className="mb-3">
                      <h6 className="fw-bold mb-2">Description</h6>
                      <div
                        className="text-secondary small"
                        style={{ lineHeight: 1.6 }}
                        dangerouslySetInnerHTML={{
                          __html: selectedActivity.activityDetails,
                        }}
                      />
                    </div>
                  )}

                  {/* Itinerary (when provided by backend). */}
                  {Array.isArray(selectedActivity.itinerary) &&
                    selectedActivity.itinerary.length > 0 && (
                      <div className="mb-3">
                        <h6 className="fw-bold mb-2">Itinerary</h6>
                        <ol className="ps-3 mb-0 small text-secondary">
                          {selectedActivity.itinerary.map((step, idx) => (
                            <li key={idx} className="mb-1">
                              {step.title && (
                                <strong className="me-1">{step.title}:</strong>
                              )}
                              {step.description || step.text || ""}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                  {/* Included hotels — compact card per hotel so the
                      operator can see contact details at a glance. */}
                  {Array.isArray(selectedActivity.includedHotels) &&
                    selectedActivity.includedHotels.length > 0 && (
                      <div className="mb-3">
                        <h6 className="fw-bold mb-2">
                          Included Hotels
                          <span className="text-muted small ms-2 fw-normal">
                            ({selectedActivity.includedHotels.length})
                          </span>
                        </h6>
                        <Row className="g-2">
                          {selectedActivity.includedHotels.map((h, idx) => (
                            <Col key={idx} md={6}>
                              <div className="border rounded p-2 h-100 bg-light bg-opacity-50">
                                <div className="d-flex align-items-start gap-2">
                                  <span style={{ fontSize: "1.1rem" }}>🏨</span>
                                  <div className="flex-grow-1">
                                    <div className="fw-semibold text-dark">
                                      {h.hotelName || `Hotel #${h.hotelId}`}
                                    </div>
                                    {h.address && (
                                      <div className="text-muted small mt-1">
                                        <i className="bi bi-geo-alt me-1" />
                                        {h.address}
                                      </div>
                                    )}
                                    {h.email && (
                                      <div className="text-muted small">
                                        <i className="bi bi-envelope me-1" />
                                        <a
                                          href={`mailto:${h.email}`}
                                          className="text-decoration-none"
                                        >
                                          {h.email}
                                        </a>
                                      </div>
                                    )}
                                    {h.mobile && (
                                      <div className="text-muted small">
                                        <i className="bi bi-telephone me-1" />
                                        <a
                                          href={`tel:${h.mobile}`}
                                          className="text-decoration-none"
                                        >
                                          {h.mobile}
                                        </a>
                                      </div>
                                    )}
                                    {!h.address && !h.email && !h.mobile && (
                                      <div className="text-muted small fst-italic">
                                        No contact details available
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </Col>
                          ))}
                        </Row>
                      </div>
                    )}

                  {/* ── Full activity-rate details ───────────────────
                      Same record the /registration/activity-rate/view/{id}
                      page shows: Basic, Pricing, Pickup/Drop-off,
                      Validity, Inclusions, T&C, Cancellation + images. */}
                  {rateLoading && (
                    <div className="text-center py-3">
                      <Spinner animation="border" size="sm" className="me-2" />
                      <span className="text-muted small">
                        Loading full details...
                      </span>
                    </div>
                  )}

                  {rateDetails && (
                    <div className="border-top pt-3 mt-1">
                      {/* Basic Details */}
                      <h6 className="fw-bold mb-2">Basic Details</h6>
                      <Row className="g-2 small mb-3">
                        <Col md={6}>
                          <DetailLine label="Activity Name" value={rateDetails.activityName} />
                          <DetailLine label="Activity Code" value={rateDetails.activityCode} />
                          <DetailLine
                            label="Activity Type"
                            value={
                              ACTIVITY_TYPE_LABEL[rateDetails.activityType] ||
                              rateDetails.activityType
                            }
                          />
                          <DetailLine
                            label="Duration"
                            value={
                              rateDetails.durationHr || rateDetails.durationMin
                                ? `${rateDetails.durationHr || 0}h ${rateDetails.durationMin || 0}m`
                                : null
                            }
                          />
                        </Col>
                        <Col md={6}>
                          <DetailLine
                            label="Country"
                            value={
                              rateCountryName ||
                              rateDetails.countryName ||
                              (rateDetails.countryId
                                ? `ID: ${rateDetails.countryId}`
                                : null)
                            }
                          />
                          <DetailLine
                            label="Place"
                            value={
                              ratePlaceName ||
                              rateDetails.placeName ||
                              (rateDetails.placeId
                                ? `ID: ${rateDetails.placeId}`
                                : null)
                            }
                          />
                          <DetailLine label="Reporting Point" value={rateDetails.reportingPoint} />
                          <DetailLine label="Total Users Allowed" value={rateDetails.totalUsersAllowed} />
                        </Col>
                      </Row>

                      {/* Pricing */}
                      <h6 className="fw-bold mb-2">Pricing</h6>
                      <Row className="g-2 small mb-3">
                        <Col md={6}>
                          <DetailLine label="Adult Rate" value={rateDetails.adultRate} />
                          <DetailLine label="Child Rate" value={rateDetails.childRate} />
                          <DetailLine label="Activity Rate" value={rateDetails.activityRate} />
                        </Col>
                        <Col md={6}>
                          <DetailLine
                            label="Min Pax"
                            value={rateDetails.minimunPax ?? rateDetails.minPax}
                          />
                          <DetailLine label="Max Pax" value={rateDetails.maxPax} />
                          <DetailLine
                            label="Child Age Range"
                            value={
                              rateDetails.childAgeMin != null && rateDetails.childAgeMax != null
                                ? `${rateDetails.childAgeMin} – ${rateDetails.childAgeMax}`
                                : null
                            }
                          />
                        </Col>
                      </Row>

                      {/* Pickup / Drop-off */}
                      {(rateDetails.pickupName ||
                        rateDetails.dropOffName ||
                        rateDetails.pickupTime ||
                        rateDetails.dropOffTime) && (
                        <>
                          <h6 className="fw-bold mb-2">Pickup / Drop-off</h6>
                          <Row className="g-2 small mb-3">
                            <Col md={6}>
                              <DetailLine label="Pickup Name" value={rateDetails.pickupName} />
                              <DetailLine label="Pickup Time" value={rateDetails.pickupTime} />
                            </Col>
                            <Col md={6}>
                              <DetailLine label="Drop-off Name" value={rateDetails.dropOffName} />
                              <DetailLine label="Drop-off Time" value={rateDetails.dropOffTime} />
                            </Col>
                          </Row>
                        </>
                      )}

                      {/* Validity */}
                      {Array.isArray(rateDetails.validity) &&
                        rateDetails.validity.length > 0 && (
                          <>
                            <h6 className="fw-bold mb-2">Validity</h6>
                            <div className="small mb-3">
                              {rateDetails.validity.map((v, i) => (
                                <div key={v.validityId || v.id || i} className="d-flex gap-2 mb-1">
                                  <span className="text-muted" style={{ minWidth: 80 }}>
                                    Period {i + 1}:
                                  </span>
                                  <span>
                                    {formatRateDate(v.validityFrom)} → {formatRateDate(v.validityTo)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}

                      {/* Inclusions / Terms / Cancellation */}
                      <h6 className="fw-bold mb-2">Inclusions</h6>
                      <RateBullets
                        items={rateExtras.inclusions}
                        empty="No inclusions added for this tour."
                      />
                      <h6 className="fw-bold mb-2 mt-3">Terms &amp; Conditions</h6>
                      <RateBullets
                        items={rateExtras.terms}
                        empty="No terms & conditions added for this tour."
                      />
                      <h6 className="fw-bold mb-2 mt-3">Cancellation Policies</h6>
                      <RateBullets
                        items={rateExtras.cancellations}
                        empty="No cancellation policies added for this tour."
                      />

                      {/* Rate images (separate from the search-result gallery) */}
                      {(rateDetails.imagePath ||
                        (Array.isArray(rateDetails.imagePaths) &&
                          rateDetails.imagePaths.length > 0)) && (
                        <>
                          <h6 className="fw-bold mb-2 mt-3">Images</h6>
                          <div className="d-flex flex-wrap gap-2 mb-2">
                            {rateDetails.imagePath && (
                              <img
                                src={getRateImageUrl(rateDetails.imagePath)}
                                alt="Primary"
                                style={{
                                  height: 90,
                                  borderRadius: 6,
                                  border: "1px solid #dee2e6",
                                  objectFit: "cover",
                                }}
                              />
                            )}
                            {Array.isArray(rateDetails.imagePaths) &&
                              rateDetails.imagePaths.map((p, i) => (
                                <img
                                  key={i}
                                  src={getRateImageUrl(p)}
                                  alt={`Gallery ${i + 1}`}
                                  style={{
                                    height: 90,
                                    borderRadius: 6,
                                    border: "1px solid #dee2e6",
                                    objectFit: "cover",
                                  }}
                                />
                              ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Pricing footer. */}
                  <div className="mt-4 p-3 bg-light rounded">
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <h5 className="mb-0">
                          {selectedActivity.totalRate > 0
                            ? `${selectedActivity.currency} ${selectedActivity.totalRate.toLocaleString()}`
                            : "Price on request"}
                        </h5>
                        {selectedActivity.totalRateWithoutMarkup > 0 &&
                          selectedActivity.totalRateWithoutMarkup !==
                            selectedActivity.totalRate && (
                            <small className="text-muted">
                              Without markup: {selectedActivity.currency}{" "}
                              {selectedActivity.totalRateWithoutMarkup.toLocaleString()}
                            </small>
                          )}
                      </div>
                      <Badge
                        bg={
                          selectedActivity.totalRate > 0
                            ? "success"
                            : "secondary"
                        }
                      >
                        {selectedActivity.totalRate > 0
                          ? "Rate Available"
                          : "Rate on Request"}
                      </Badge>
                    </div>
                  </div>
                </>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowActivityModal(false);
                  setSelectedActivity(null);
                  setActiveImageIndex(0);
                }}
              >
                Close
              </Button>
              {selectedActivity && (
                <Button
                  variant="primary"
                  onClick={() => {
                    setShowActivityModal(false);
                    handleBookNow(selectedActivity);
                  }}
                >
                  Book Now
                </Button>
              )}
            </Modal.Footer>
          </Modal>

          {/* Insufficient credit modal — informational gate. Mirrors
              the RoomList implementation: Cancel just closes; OK
              re-runs the original handleBookNow with skipCreditCheck
              so the user still lands on the booking page where they
              can pick online / cash payment. */}
          <Modal
            show={showInsufficientCreditModal}
            onHide={() => {
              setShowInsufficientCreditModal(false);
              setPendingBookingFn(null);
            }}
            centered
            backdrop="static"
            keyboard={false}
          >
            <Modal.Header closeButton>
              <Modal.Title>Insufficient Credit Limit</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <p className="mb-2">
                Your available credit limit is not enough to cover this
                booking.
              </p>
              <p className="mb-0 text-muted small">
                You can still continue — please choose{" "}
                <strong>online payment</strong> on the booking page to
                complete this reservation.
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowInsufficientCreditModal(false);
                  setPendingBookingFn(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const fn = pendingBookingFn;
                  setShowInsufficientCreditModal(false);
                  setPendingBookingFn(null);
                  if (typeof fn === "function") fn();
                }}
              >
                OK, continue
              </Button>
            </Modal.Footer>
          </Modal>
        </main>
      </div>
    </div>
  );
};

export default ActivitySearch;