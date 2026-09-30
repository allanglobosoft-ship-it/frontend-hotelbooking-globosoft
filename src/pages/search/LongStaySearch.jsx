import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  Button,
  Row,
  Col,
  Form,
  Pagination,
  Spinner,
} from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import Select from "react-select";
import axiosInstance from "../../components/AxiosInstance";
import { logAgentSearch } from "../../utils/agentSearchLog";
import AgentBalanceDisplay from "../../components/AgentBalanceDisplay";
import AgentSelect from "../../components/AgentSelect";
import AdvertisementCarousel from "../../components/AdvertisementCarousel";
import AgentCreditBalance from "../../components/AgentCreditBalance";
import DateInput from "../../components/DateInput";
import { FaSearch, FaStar } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import "../../styles/HotelSearch.css";

// ─────────────────────────────────────────────
// Search Progress Bar
// ─────────────────────────────────────────────
function SearchProgressBar({ pollStatus, completedChannels }) {
  const channels = ["inhouse"];
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (pollStatus === "IN_PROGRESS") {
      setVisible(true);
      const done = completedChannels.size;
      const target =
        done === 0 ? 12 : Math.min(90, 12 + (done / channels.length) * 78);
      setProgress(target);
    } else if (pollStatus === "COMPLETED") {
      setProgress(100);
      const t = setTimeout(() => setVisible(false), 700);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
      setProgress(0);
    }
  }, [pollStatus, completedChannels]);

  if (!visible) return null;
  return (
    <div className="search-progress-bar-wrap">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <span className="search-progress-label">Searching long stay contracts...</span>
        <span className="search-progress-percent">{Math.round(progress)}%</span>
      </div>
      <div className="search-progress-track">
        <div className="search-progress-fill" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Counter Button helper
// ─────────────────────────────────────────────
function Counter({ value, min, max, onChange }) {
  return (
    <div className="rgs-counter">
      <button
        type="button"
        className="rgs-counter-btn"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
      >
        −
      </button>
      <span className="rgs-counter-val">{value}</span>
      <button
        type="button"
        className="rgs-counter-btn"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
      >
        +
      </button>
    </div>
  );
}

// Maximum number of rooms allowed per booking (matches HotelSearch).
const MAX_ROOMS = 5;

// ─────────────────────────────────────────────
// Room Guest Selector
// ─────────────────────────────────────────────
function RoomGuestSelector({ value, onChange }) {
  const [rooms, setRooms] = useState(value);

  // Sync internal state when the parent adds a room from outside
  // (e.g. the premium "Add Room" button beside the Rooms & Guests trigger).
  useEffect(() => {
    setRooms(value);
  }, [value]);

  const update = (next) => {
    setRooms(next);
    onChange && onChange(next);
  };
  const addRoom = () => {
    // Enforce the per-booking room cap.
    if (rooms.length >= MAX_ROOMS) return;
    update([...rooms, { adults: 1, children: 0, childAges: [] }]);
  };
  const removeRoom = (i) => update(rooms.filter((_, j) => j !== i));
  const setAdults = (i, a) =>
    update(rooms.map((r, j) => (j === i ? { ...r, adults: a } : r)));
  const setChildren = (i, c) =>
    update(
      rooms.map((r, j) =>
        j === i
          ? {
              ...r,
              children: c,
              childAges: Array.from({ length: c }, (_, k) => r.childAges[k] || 5),
            }
          : r
      )
    );
  const setChildAge = (i, idx, age) =>
    update(
      rooms.map((r, j) => {
        if (j !== i) return r;
        const ages = [...r.childAges];
        ages[idx] = age;
        return { ...r, childAges: ages };
      })
    );

  return (
    <div className="rgs-wrap">
      <div className="rgs-grid">
        {rooms.map((room, i) => (
          <div key={i} className="rgs-room-card">
            <div className="rgs-room-header">
              <span className="rgs-room-label">🛏 Room {i + 1}</span>
              {rooms.length > 1 && (
                <button type="button" className="rgs-remove-btn" onClick={() => removeRoom(i)}>
                  ✕
                </button>
              )}
            </div>
            <div className="rgs-counters-col">
              <div className="rgs-counter-row">
                <div className="rgs-counter-info">
                  <span className="rgs-counter-title">Adults</span>
                  <span className="rgs-counter-sub">Age 18+</span>
                </div>
                <Counter value={room.adults} min={1} max={6} onChange={(v) => setAdults(i, v)} />
              </div>
              <div className="rgs-counter-row">
                <div className="rgs-counter-info">
                  <span className="rgs-counter-title">Children</span>
                  <span className="rgs-counter-sub">Age 0–17</span>
                </div>
                <Counter value={room.children} min={0} max={4} onChange={(v) => setChildren(i, v)} />
              </div>
            </div>
            {room.children > 0 && (
              <div className="rgs-child-ages">
                <span className="rgs-child-ages-label">Child ages</span>
                <div className="rgs-child-ages-row">
                  {Array.from({ length: room.children }).map((_, idx) => (
                    <div key={idx} className="rgs-child-age-select">
                      <label className="rgs-child-age-label">Child {idx + 1}</label>
                      <Form.Select
                        size="sm"
                        value={room.childAges[idx] || 5}
                        onChange={(e) => setChildAge(i, idx, parseInt(e.target.value))}
                        className="rgs-age-dropdown"
                      >
                        {Array.from({ length: 18 }).map((__, age) => (
                          <option key={age} value={age}>
                            {age} {age === 1 ? "yr" : "yrs"}
                          </option>
                        ))}
                      </Form.Select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        <button
          type="button"
          className="rgs-add-room-btn"
          onClick={addRoom}
          disabled={rooms.length >= MAX_ROOMS}
        >
          <span className="rgs-add-icon">+</span>
          <span>Add Room</span>
        </button>
        {rooms.length >= MAX_ROOMS && (
          <div className="text-danger small mt-2">
            A maximum of {MAX_ROOMS} rooms can be added per booking.
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Lazy Image
// ─────────────────────────────────────────────
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
      className={`ratio rounded-xl overflow-hidden ${className || ""}`}
      style={{ "--bs-aspect-ratio": "66.25%" }}
    >
      {!loaded && <div className="skeleton w-100 h-100" />}
      {inView && (
        <img
          src={imageSrc}
          loading="lazy"
          decoding="async"
          alt={alt}
          onLoad={() => setLoaded(true)}
          className={`img-cover ${loaded ? "img-loaded" : "img-loading"}`}
        />
      )}
    </div>
  );
}

const fullText = "Search Hotel Name...";

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────
export default function LongStaySearch() {
  const [placeholder, setPlaceholder] = useState("");
  const navigate = useNavigate();

  // Agent logins book under themselves — the backend forces the booking,
  // quote and search markup to the logged-in agent (see
  // LongStayBookingController / LongStaySearchController), so the manual
  // Agent picker is hidden and the agent-required validation is skipped.
  // currentActiveRole isn't set for single-role logins, so fall back to
  // userRole; admin/super-admin/staff keep the picker exactly as before.
  const activeRole = (localStorage.getItem("currentActiveRole") || "")
    .trim()
    .toUpperCase();
  const storedRoles = (localStorage.getItem("userRole") || "").toUpperCase();
  const isAgentRole = activeRole
    ? activeRole === "AGENT"
    : storedRoles.includes("AGENT") && !storedRoles.includes("ADMIN");

  // Logged-in agent's name — for agent logins the booking is done by the
  // agent themselves, so the "Booking Done By Employee" picker is hidden and
  // this name is shown instead. Empty for admin/staff.
  const loggedInAgentName =
    localStorage.getItem("UserName") ||
    sessionStorage.getItem("UserName") ||
    "";

  const [nationalityList, setNationalityList] = useState([]);
  const [selectedNationality, setSelectedNationality] = useState(null);
  // Optional "Booking Done By Employee" — same pattern as HotelSearch.
  // employeeId rides along on `payload` → RoomList draft →
  // LongStayBookingPage create payload, so the backend can stamp the
  // employee relation on LongStayBooking.
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const res = await axiosInstance.get("/api/employee?page=0&limit=1000");
        if (res.data && Array.isArray(res.data)) {
          setEmployees(res.data);
        }
      } catch (error) {
        console.error("Error fetching employees:", error);
      }
    };
    fetchEmployees();
  }, []);
  const [destinationOptions, setDestinationOptions] = useState([]);
  const [selectedDestination, setSelectedDestination] = useState(null);
  // Minimum stay (nights) for the long-stay flow — pricing engine
  // enforces the same floor server-side (LongStayPricingService
  // #MIN_LONG_STAY_NIGHTS). Surfacing it as a constant + a `min=` on the
  // input means the operator can never search a stay shorter than the
  // backend will quote.
  const MIN_LONG_STAY_NIGHTS = 30;
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  // Nights starts blank — the operator must explicitly enter a value.
  // validateForm enforces the >= MIN_LONG_STAY_NIGHTS floor on submit.
  const [nights, setNights] = useState("");
  const [agent, setAgent] = useState("");
  const [rooms, setRooms] = useState([{ adults: 1, children: 0, childAges: [] }]);
  const [roomsOpen, setRoomsOpen] = useState(false);

  const [starRating, setStarRating] = useState(null);
  const [hotelType, setHotelType] = useState([]);
  const [channelType, setChannelType] = useState([]);
  const [sortBy, setSortBy] = useState("priceAsc");
  const [hotelSearchTerm, setHotelSearchTerm] = useState("");
  const [errors, setErrors] = useState({});
  const [clickedHotelIds, setClickedHotelIds] = useState([]);

  const [allResults, setAllResults] = useState([]);
  const [finalHotelSearchTerm, setFinalHotelSearchTerm] = useState("");
  const [agents, setAgents] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  // When results are on screen the big search form collapses into a sticky
  // summary strip. Clicking "Modify Search" flips this true to re-expand it.
  const [isEditingSearch, setIsEditingSearch] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize] = useState(10);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [hasSearchResult, setHasSearchResult] = useState(false);
  const [pollStatus, setPollStatus] = useState("IDLE");
  const completedChannelsRef = useRef(new Set());
  const [completedChannels, setCompletedChannels] = useState(new Set());
  const [searchId, setSearchId] = useState(null);
  const [isDestinationLoading, setIsDestinationLoading] = useState(false);
  const resultsRef = useRef(null);
  const [isNationalityLoading, setIsNationalityLoading] = useState(false);

  const starOptions = [
    { value: 5, label: "5 Stars" },
    { value: 4, label: "4 Stars" },
    { value: 3, label: "3 Stars" },
    { value: 2, label: "2 Stars" },
    { value: 1, label: "1 Star" },
  ];

  const hotelTypeOptions = [
    { value: "hotel", label: "Hotel" },
    { value: "villa", label: "Villa" },
    { value: "resort", label: "Resort" },
    { value: "apartment", label: "Apartment" },
  ];

  const channelTypeOptions = [{ value: "inhouse", label: "Inhouse" }];

  useEffect(() => {
    let index = 0;
    let isDeleting = false;
    const interval = setInterval(() => {
      if (!isDeleting) {
        setPlaceholder(fullText.slice(0, index + 1));
        index++;
        if (index === fullText.length) setTimeout(() => (isDeleting = true), 900);
      } else {
        setPlaceholder(fullText.slice(0, index - 1));
        index--;
        if (index === 0) isDeleting = false;
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

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

  const debouncedCitySearch = useRef(
    debounce(async (searchText = "") => {
      if (!searchText || searchText.length < 2) {
        setDestinationOptions([]);
        return;
      }
      setIsDestinationLoading(true);
      try {
        const response = await axiosInstance.get(`/api/province?search=${searchText}`);
        const cityApiRes = Array.isArray(response.data) ? response.data : [];
        const options = cityApiRes.slice(0, 50).map((city) => ({
          value: city.id,
          label: `${city.stateName}, ${city.country}`,
          countryId: city.countryId,
          code: city.countryCode,
        }));
        setDestinationOptions(options);
      } catch {
        setDestinationOptions([]);
      } finally {
        setIsDestinationLoading(false);
      }
    }, 300)
  ).current;

  const debouncedSetFinalTerm = useRef(
    debounce((term) => setFinalHotelSearchTerm(term), 500)
  ).current;

  // Nights is intentionally NOT auto-derived from the date range any
  // more — the operator must type a value explicitly. validateForm
  // enforces the >= MIN_LONG_STAY_NIGHTS rule on submit.

  // Free-typing — store whatever the user types (any number, or
  // blank). We do NOT clamp here, so a user can type "3" and continue
  // to "30" without the value snapping. validation happens on submit.
  const handleNightsChange = (value) => {
    setNights(value);
    if (value !== "") clearError("nights");
  };

  // When the user finishes editing AND the value is valid (>= 30),
  // sync checkOut. Anything else (blank, sub-30, NaN) leaves checkOut
  // untouched so we don't fight the user mid-edit. The submit-time
  // validator will surface the error.
  const commitNights = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < MIN_LONG_STAY_NIGHTS) return;
    const val = Math.floor(parsed);
    if (checkIn) {
      const start = new Date(checkIn);
      const out = new Date(start);
      out.setDate(start.getDate() + val);
      const iso = new Date(out.getTime() - out.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 10);
      setCheckOut(iso);
    }
  };

  const filteredResults = useMemo(() => {
    let results = allResults;
    if (starRating) {
      results = results.filter(
        (h) => Number(h.rating) === Number(starRating.value)
      );
    }
    if (hotelType.length > 0) {
      const types = hotelType.map((t) => t.value);
      results = results.filter((h) => types.includes(h.hotelType));
    }
    if (channelType.length > 0) {
      const ch = channelType.map((c) => c.value);
      results = results.filter((h) => ch.includes(h.channelType));
    }
    return results;
  }, [allResults, starRating, hotelType, channelType]);

  const effectiveTotalPages = useMemo(() => Math.max(1, totalPages), [totalPages]);
  const startEntry = totalElements === 0 ? 0 : pageIndex * pageSize + 1;
  const endEntry = Math.min((pageIndex + 1) * pageSize, totalElements);
  const pageNumbers = useMemo(() => {
    const current = pageIndex + 1;
    const total = effectiveTotalPages;
    const nums = [];
    if (total <= 7) for (let i = 1; i <= total; i++) nums.push(i);
    else {
      nums.push(1);
      const left = Math.max(2, current - 1);
      const right = Math.min(total - 1, current + 1);
      if (left > 2) nums.push("ellipsis-left");
      for (let i = left; i <= right; i++) nums.push(i);
      if (right < total - 1) nums.push("ellipsis-right");
      nums.push(total);
    }
    return nums;
  }, [pageIndex, effectiveTotalPages]);

  const goToPage = (idx) => {
    if (idx < 0 || idx >= effectiveTotalPages) return;
    setPageIndex(idx);
    setTimeout(() => {
      if (resultsRef.current) {
        resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 0);
  };

  const debouncedCountrySearch = useRef(
    debounce(async (search) => {
      try {
        setIsNationalityLoading(true);
        const response = await axiosInstance.get(`/api/country?search=${search}`);
        const options = Array.isArray(response.data)
          ? response.data.map((c) => ({ value: c.id, label: c.name, code: c.countryCode }))
          : [];
        setNationalityList(options);
      } catch {
        setNationalityList([]);
      } finally {
        setIsNationalityLoading(false);
      }
    }, 300)
  ).current;

  const countryList = async (search = "") => {
    if (search) return debouncedCountrySearch(search);
    try {
      setIsNationalityLoading(true);
      const response = await axiosInstance.get("/api/country?limit=50");
      const options = Array.isArray(response.data)
        ? response.data.map((c) => ({ value: c.id, label: c.name, code: c.countryCode }))
        : [];
      setNationalityList(options);
    } catch {
      setNationalityList([]);
    } finally {
      setIsNationalityLoading(false);
    }
  };

  const handleCountryInputChange = (input) => {
    if (input.length >= 2) debouncedCountrySearch(input);
  };

  const cityList = (txt = "") => debouncedCitySearch(txt);

  const loadPopularDestinations = async () => {
    if (destinationOptions.length > 0) return;
    try {
      setIsDestinationLoading(true);
      const response = await axiosInstance.get("/api/province?limit=50");
      const cityApiRes = Array.isArray(response.data) ? response.data : [];
      const options = cityApiRes.map((city) => ({
        value: city.id,
        label: `${city.stateName},${city.country}`,
        countryId: city.countryId,
        code: city.countryCode,
      }));
      setDestinationOptions(options);
    } catch {
      // silent
    } finally {
      setIsDestinationLoading(false);
    }
  };

  const agentList = async () => {
    try {
      const response = await axiosInstance.get("/api/agent?activeOnly=true");
      setAgents(response.data || []);
    } catch {
      setAgents([]);
    }
  };

  useEffect(() => {
    countryList();
    agentList();
  }, []);

  // ── Display currency (search rates are quoted in AED; this lets the
  // operator view them in another currency). Mirrors HotelSearch: options
  // from /api/currency, defaults to the agent's configured currency, the
  // chosen {code, factor} rides the sessionStorage handoff. Rates stay AED. ──
  const [currencyOptions, setCurrencyOptions] = useState([]);
  const [selectedCurrency, setSelectedCurrency] = useState(null);
  const currencyTouchedRef = useRef(false);
  const [selfAgentId, setSelfAgentId] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axiosInstance.get("/api/currency?page=0");
        const opts = (Array.isArray(res.data) ? res.data : [])
          .filter((c) => c && c.currencyCode)
          .map((c) => ({
            value: c.currencyId,
            label: c.currencyCode,
            code: c.currencyCode,
            rate: Number(c.value),
          }));
        if (cancelled) return;
        setCurrencyOptions(opts);
        const aed = opts.find((o) => o.code === "AED");
        setSelectedCurrency(aed || opts[0] || null);
      } catch (err) {
        console.warn("currency list fetch failed (non-fatal):", err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isAgentRole) return;
    const cached = localStorage.getItem("userId");
    if (cached) { setSelfAgentId(cached); return; }
    const userName =
      localStorage.getItem("UserName") || sessionStorage.getItem("UserName");
    if (!userName) return;
    let cancelled = false;
    axiosInstance
      .get(`/api/personalProfile/${userName}`)
      .then((res) => {
        if (!cancelled && res?.data?.id != null) {
          const idv = String(res.data.id);
          localStorage.setItem("userId", idv);
          setSelfAgentId(idv);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isAgentRole]);

  const currencyAgentId = isAgentRole ? selfAgentId : agent;
  useEffect(() => {
    if (currencyTouchedRef.current) return;
    if (!currencyAgentId || currencyOptions.length === 0) return;
    let cancelled = false;
    axiosInstance
      .get(`/api/agent/${currencyAgentId}`)
      .then((res) => {
        const code = res?.data?.currencyCode;
        if (cancelled || !code || currencyTouchedRef.current) return;
        const opt = currencyOptions.find((o) => o.code === code);
        if (opt) setSelectedCurrency(opt);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currencyAgentId, currencyOptions]);

  const aedBaseRate = useMemo(() => {
    const aed = currencyOptions.find((o) => o.code === "AED");
    return aed && Number.isFinite(aed.rate) && aed.rate > 0 ? aed.rate : 1;
  }, [currencyOptions]);

  // {code, factor} threaded downstream. factor = AED→target multiplier.
  // master_currency.value is "AED per 1 unit" of the target, so the multiplier
  // is aedBaseRate / value (= 1/value when AED itself has value 1),
  // NOT value / aedBaseRate.
  const displayCurrency = useMemo(() => ({
    code: selectedCurrency?.code || "AED",
    factor:
      selectedCurrency &&
      Number.isFinite(selectedCurrency.rate) &&
      selectedCurrency.rate > 0 &&
      aedBaseRate
        ? aedBaseRate / selectedCurrency.rate
        : 1,
  }), [selectedCurrency, aedBaseRate]);
  const displayCurrencyCode = displayCurrency.code;
  const convertFromAed = (aed) => (Number(aed) || 0) * displayCurrency.factor;

  useEffect(() => {
    setPageIndex(0);
    if (hasSearchResult && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [starRating, hotelType, channelType, sortBy]);

  // After a fresh search, jump the viewport to the very top of the page so
  // the operator sees the "Long Stay" heading and summary strip first, not
  // just the results list further down. Fires once the first batch of
  // hotels actually arrives.
  useEffect(() => {
    if (!hasSearched || !hasSearchResult) return;
    const id = window.setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 50);
    return () => window.clearTimeout(id);
  }, [hasSearched, hasSearchResult]);

  const formatDate = (date) => date.toISOString().split("T")[0];
  const getTomorrow = (date = new Date()) => {
    const tomorrow = new Date(date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  };
  const today = formatDate(new Date());

  // Pure utility — number of whole nights between two ISO date strings.
  // Returns null when either input is missing or unparseable, and clamps
  // to 0 when checkOut <= checkIn so we never display a negative value.
  // Used by the CheckIn / CheckOut handlers below to keep the Nights
  // field in sync with whatever the operator picks. The submit-time
  // validator still enforces the MIN_LONG_STAY_NIGHTS rule — this
  // helper only mirrors the date pair into the Nights input.
  const nightsBetween = (cin, cout) => {
    if (!cin || !cout) return null;
    const start = new Date(cin);
    const end = new Date(cout);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return null;
    }
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const diff = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
    return Math.max(0, diff);
  };
  const minCheckOutDate = checkIn
    ? formatDate(getTomorrow(new Date(checkIn)))
    : formatDate(getTomorrow());

  const validateForm = () => {
    const e = {};
    if (!selectedNationality) e.nationality = "Nationality is required";
    if (!selectedDestination) e.destination = "Destination is required";
    if (!checkIn) e.checkIn = "Check-in date is required";
    if (!checkOut) e.checkOut = "Check-out date is required";
    // Agent logins don't pick an agent — the backend uses the logged-in one.
    if (!isAgentRole && !agent) e.agent = "Agent is required";
    // Nights — required, numeric, and >= the long-stay floor. Backend
    // pricing service rejects anything below MIN_LONG_STAY_NIGHTS too,
    // so this just gives the operator a clean front-line message.
    if (nights === "" || nights === null || nights === undefined) {
      e.nights = "Nights is required";
    } else {
      const n = Number(nights);
      if (!Number.isFinite(n)) {
        e.nights = "Nights must be a number";
      } else if (n < MIN_LONG_STAY_NIGHTS) {
        e.nights = `Nights must be ${MIN_LONG_STAY_NIGHTS} or more`;
      }
    }
    return e;
  };

  const clearError = (field) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const { [field]: _omit, ...rest } = prev;
      return rest;
    });
  };

  const fetchHotels = async (page, sid, agentId, nameSearch = "") => {
    try {
      const isNameSearching = !!nameSearch.trim();
      const endpoint = isNameSearching
        ? `/api/long-stay-search/results/${sid}/filter-by-name`
        : `/api/long-stay-search/results/${sid}`;

      const params = {
        agentId: agentId || agent || 1,
        page,
        size: pageSize,
        sortBy:
          sortBy === "priceAsc" || sortBy === "priceDesc" ? "baseRate" : sortBy,
        sortOrder:
          sortBy === "priceAsc" || sortBy === "ratingAsc" || sortBy === "nameAsc"
            ? "asc"
            : "desc",
        starRating: starRating ? starRating.value : undefined,
        apiType:
          channelType.map((c) => c.value.toUpperCase()).join(",") || undefined,
      };
      if (isNameSearching) params.hotelName = nameSearch.trim();

      const res = await axiosInstance.get(endpoint, { params });
      const mapped = Array.isArray(res.data.result)
        ? res.data.result.map((h, i) => ({
            id: h.hotelCode ? `${sid}-${h.hotelCode}` : `${sid}-h${i + 1}`,
            searchId: sid,
            hotelCode: h.hotelCode || null,
            name: h.hotelName || "Unknown Hotel",
            address: h.hotelAddress || "",
            city: h.cityName || "",
            price: h.baseRate || null,
            // "Long Stay Available" badge dropped — every card on this
            // page is a long-stay result, so the label was redundant
            // noise. The "Rate Unavailable" case is still surfaced when
            // a hotel came back with no baseRate — that's real info the
            // operator needs before clicking "View Rooms".
            badge: h.baseRate ? null : "Rate Unavailable",
            image: h.hotelImage || "https://details/assets/details/profilepic/hotel/hoteldefault.jpg",
            rating: h.starRating || 0,
            hotelType: "hotel",
            channelType: (h.apiType || "INHOUSE").toLowerCase(),
          }))
        : [];

      setAllResults(mapped);
      setTotalElements(Number(res.data.totalResults) || mapped.length);
      setTotalPages(
        Math.max(1, Math.ceil((Number(res.data.totalResults) || mapped.length) / pageSize))
      );
      setHasSearchResult(true);
      return res.data;
    } catch (err) {
      console.error("Fetch failed", err);
      if (!nameSearch) setPollStatus("ERROR");
      throw err;
    }
  };

  const pollUntilComplete = async (
    url,
    params,
    checkComplete,
    onUpdate,
    intervalMs = 2000,
    timeoutMs = 20000,
    initialDelay = 500
  ) => {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let count = 0;
      const poll = async () => {
        try {
          count++;
          const res = await axiosInstance.get(url, { params });
          if (onUpdate) onUpdate(res.data, count);
          if (checkComplete(res.data)) {
            setPollStatus("COMPLETED");
            return resolve(res.data);
          }
          if (Date.now() - startTime >= timeoutMs) {
            setPollStatus("TIMEOUT");
            return reject(new Error("Polling timed out"));
          }
          setTimeout(poll, intervalMs);
        } catch (err) {
          console.error("Poll failed", err);
          setPollStatus("ERROR");
          reject(err);
        }
      };
      setPollStatus("IN_PROGRESS");
      setTimeout(poll, initialDelay);
    });
  };

  const handleSearchSubmit = async (e) => {
    e.preventDefault();
    const formErrors = validateForm();
    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors);
      setHasSearched(false);
      return;
    }
    setErrors({});
    setIsLoading(true);
    setHasSearched(true);
    setIsEditingSearch(false);
    setHasSearchResult(false);
    setAllResults([]);
    setPollStatus("IDLE");
    setPageIndex(0);
    setTotalElements(0);
    setTotalPages(1);
    completedChannelsRef.current = new Set();
    setCompletedChannels(new Set());

    try {
      const nationalityId = selectedNationality.value;
      const nationalityCode = selectedNationality.code;
      const destinationCityId = selectedDestination.value;
      const destinationCountryId = selectedDestination.countryId;
      const noOfRooms = String(rooms.length);

      const roomConfigurations = rooms.map((room, i) => ({
        roomNo: i + 1,
        adultCount: String(room.adults || 1),
        childCount: String(room.children || 0),
        childAges: room.childAges?.length ? room.childAges : [0],
        adultAges: room.adultAges?.length ? room.adultAges : [25],
      }));

      const agentId = agent || 1;

      const payload = {
        nationalityId,
        nationalityCode,
        destinationCityId,
        destinationCountryId,
        checkIn,
        checkOut,
        noOfRooms,
        roomConfigurations,
        agentId,
      };

      // Agent search log (Unbooked Opportunities → Searches tab) —
      // fire-and-forget, agent-only, non-blocking. See utils/agentSearchLog.js.
      logAgentSearch({
        agentId,
        agentName: loggedInAgentName,
        destinationId: destinationCityId,
        destinationLabel: selectedDestination?.label,
        nationalityLabel: selectedNationality?.label,
        checkIn,
        checkOut,
        rooms,
        source: "long-stay",
      });

      const searchKeyRes = await axiosInstance.post(
        "/api/long-stay-search/search",
        payload
      );
      const newSearchId = searchKeyRes.data.searchId;
      if (!newSearchId) throw new Error("No searchId returned");
      setSearchId(newSearchId);

      const params = {
        agentId,
        page: 0,
        size: pageSize,
        sortBy:
          sortBy === "priceAsc" || sortBy === "priceDesc" ? "baseRate" : sortBy,
        sortOrder:
          sortBy === "priceAsc" || sortBy === "ratingAsc" || sortBy === "nameAsc"
            ? "asc"
            : "desc",
        starRating: starRating ? starRating.value : undefined,
        apiType:
          channelType.map((c) => c.value.toUpperCase()).join(",") || undefined,
      };

      await pollUntilComplete(
        `/api/long-stay-search/results/${newSearchId}`,
        params,
        (data) => data.finalStatus === "COMPLETED",
        (data) => {
          const mapped = Array.isArray(data.result)
            ? data.result.map((h, i) => ({
                id: h.hotelCode ? `${newSearchId}-${h.hotelCode}` : `${newSearchId}-h${i + 1}`,
                searchId: newSearchId,
                hotelCode: h.hotelCode || null,
                name: h.hotelName || "Unknown Hotel",
                address: h.hotelAddress || "",
                city: h.cityName || "",
                price: h.baseRate || null,
                // "Long Stay Available" badge dropped — every card on this
            // page is a long-stay result, so the label was redundant
            // noise. The "Rate Unavailable" case is still surfaced when
            // a hotel came back with no baseRate — that's real info the
            // operator needs before clicking "View Rooms".
            badge: h.baseRate ? null : "Rate Unavailable",
                image:
                  h.hotelImage ||
                  "https://details/assets/details/profilepic/hotel/hoteldefault.jpg",
                rating: h.starRating || 0,
                hotelType: "hotel",
                channelType: (h.apiType || "INHOUSE").toLowerCase(),
              }))
            : [];
          setAllResults(mapped);
          completedChannelsRef.current.add("inhouse");
          setCompletedChannels(new Set(completedChannelsRef.current));
          setHasSearchResult(true);
          setTotalElements(Number(data.totalResults) || mapped.length);
          setTotalPages(
            Math.max(1, Math.ceil((Number(data.totalResults) || mapped.length) / pageSize))
          );
        },
        2000,
        20000,
        500
      );
    } catch (err) {
      console.error("Search failed", err);
      setHasSearched(false);
      setPollStatus("ERROR");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!searchId || !hasSearched) return;
    if (pollStatus === "IN_PROGRESS") return;
    setIsLoading(true);
    fetchHotels(pageIndex, searchId, agent, finalHotelSearchTerm).finally(() =>
      setIsLoading(false)
    );
    // eslint-disable-next-line
  }, [pageIndex, sortBy, starRating, channelType, finalHotelSearchTerm]);

  // Results are on screen once a result lands. Collapse the full form into the
  // sticky summary strip then, unless the user chose to modify the search.
  const hasResultsView = hasSearchResult || allResults.length > 0;
  const collapseSearch = hasResultsView && !isEditingSearch;

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4 hs-page">
          {/* ── Results-page heading ──
              Shown once actual results have arrived (not just on search
              click), above the search summary / form. Matches the heading
              on /new-booking/hotel. */}
          {hasResultsView && (
            <div className="hs-page-heading">
              <h3 className="hs-page-heading-title">Long Stay</h3>
            </div>
          )}

          {/* ── Collapsed sticky search summary strip ──
              Shown once results are on screen. "Modify Search" re-expands
              the full form by flipping isEditingSearch. */}
          {collapseSearch && (
            <div className="hs-summary-bar">
              <div className="hs-summary-chips">
                {selectedDestination?.label && (
                  <span className="hs-summary-chip hs-summary-chip-main">
                    {selectedDestination.label}
                  </span>
                )}
                {checkIn && (
                  <span className="hs-summary-chip">
                    {checkIn}
                    {checkOut ? ` → ${checkOut}` : ""}
                  </span>
                )}
                {nights && (
                  <span className="hs-summary-chip">
                    {nights} night{Number(nights) > 1 ? "s" : ""}
                  </span>
                )}
                <span className="hs-summary-chip">
                  {rooms.reduce((a, r) => a + r.adults, 0)} adults
                  {rooms.reduce((a, r) => a + r.children, 0)
                    ? `, ${rooms.reduce((a, r) => a + r.children, 0)} child`
                    : ""}{" "}
                  · {rooms.length} room{rooms.length > 1 ? "s" : ""}
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
          <Card className="shadow-sm rounded-xl search-card-modern bg-white h-100">
            <Card.Body className="p-4">
              <div className="mb-4 text-start d-flex justify-content-between align-items-start flex-wrap gap-2">
                <div>
                  <h2 className="fw-semibold text-primary mb-1">
                    Find Your Long Stay
                  </h2>
                  <p className="text-muted">
                    Discover monthly long-stay contracts and the best rates
                  </p>
                </div>
                {/* Agent logins see their available credit balance at the
                    right end of the heading row (renders nothing for other
                    roles). */}
                <AgentCreditBalance />
              </div>

              <Form onSubmit={handleSearchSubmit}>
                {/* Field order mirrors /new-booking/hotel (HotelSearch.jsx):
                      1. Agent  2. Destination / City  3. Nationality
                      4. Check-In  5. Nights  6. Check-Out  7. Rooms & Guests
                    Only the JSX order is rearranged — every prop, handler,
                    state binding, validation message and layout class is
                    preserved bit-for-bit so behavior is unchanged. */}
                <Row className="g-4">
                  {/* 1. Agent */}
                  {!isAgentRole && (
                    <Col lg={4} md={6}>
                      <Form.Group>
                        <Form.Label className="fw-semibold text-dark">Agent</Form.Label>
                        <AgentSelect
                          agents={agents}
                          value={agent}
                          isInvalid={!!errors.agent}
                          onChange={(v) => {
                            setAgent(v);
                            if (v) clearError("agent");
                          }}
                        />
                        {errors.agent && (
                          <div className="text-danger small mt-1">{errors.agent}</div>
                        )}
                        <AgentBalanceDisplay agentId={agent} />
                      </Form.Group>
                    </Col>
                  )}

                  {/* 2. Destination / City */}
                  <Col lg={4} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">Destination</Form.Label>
                      <Select
                        options={destinationOptions}
                        value={selectedDestination}
                        onChange={(option) => {
                          setSelectedDestination(option);
                          if (option) clearError("destination");
                        }}
                        placeholder="Where do you want to go?"
                        isSearchable
                        isClearable
                        className="modern-select"
                        isLoading={isDestinationLoading}
                        noOptionsMessage={() =>
                          isDestinationLoading
                            ? "Searching destinations..."
                            : "Type to search destinations..."
                        }
                        onMenuOpen={() => {
                          if (destinationOptions.length === 0) loadPopularDestinations();
                        }}
                        onInputChange={(inputValue, { action }) => {
                          if (action === "input-change") cityList(inputValue);
                        }}
                        menuPortalTarget={document.body}
                        styles={{
                          menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                          control: (base) => ({
                            ...base,
                            minHeight: "42px",
                            border: "1px solid #dee2e6",
                            "&:hover": { borderColor: "#86b7fe" },
                          }),
                        }}
                      />
                      {errors.destination && (
                        <div className="text-danger small mt-1">{errors.destination}</div>
                      )}
                      {/* Surface UAE-resident status when the selected
                          destination city belongs to the UAE so the operator
                          can apply the resident rate. Matched on the city's
                          country code "AE" (from master_country) so a label
                          change can't break the rule. */}
                      {selectedDestination?.code === "AE" && (
                        <div
                          className="mt-1 small"
                          style={{ color: "#0f7a3a", lineHeight: 1.25 }}
                        >
                          For UAE resident holders, please mention the nationality as United Arab Emirates regardless of the actual nationality.
                        </div>
                      )}
                    </Form.Group>
                  </Col>

                  {/* 3. Nationality */}
                  <Col lg={4} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">Nationality</Form.Label>
                      <Select
                        options={nationalityList}
                        value={selectedNationality}
                        onChange={(option) => {
                          setSelectedNationality(option);
                          if (option) clearError("nationality");
                        }}
                        onInputChange={handleCountryInputChange}
                        isLoading={isNationalityLoading}
                        placeholder="Select nationality"
                        isSearchable
                        isClearable
                        className="modern-select"
                        menuPortalTarget={document.body}
                        styles={{
                          menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                          control: (base) => ({
                            ...base,
                            minHeight: "42px",
                            border: "1px solid #dee2e6",
                            "&:hover": { borderColor: "#86b7fe" },
                          }),
                        }}
                      />
                      {errors.nationality && (
                        <div className="text-danger small mt-1">{errors.nationality}</div>
                      )}
                      {/* UAE-resident hint moved to the Destination field —
                          it now triggers on a UAE destination city, not on the
                          selected nationality. */}
                    </Form.Group>
                  </Col>

                  {/* Booking Done By — agent logins book under themselves, so
                      the staff-employee picker is hidden and the agent's own
                      name is shown (read-only). Admin/staff keep the optional
                      dropdown exactly as before. */}
                  {isAgentRole ? (
                    <Col lg={4} md={6}>
                      <Form.Group>
                        <Form.Label className="fw-semibold text-dark">
                          Booking Done By
                        </Form.Label>
                        <Form.Control
                          type="text"
                          value={loggedInAgentName || "—"}
                          readOnly
                          disabled
                          className="form-control-modern"
                          style={{ height: "42px" }}
                        />
                      </Form.Group>
                    </Col>
                  ) : (
                    <Col lg={4} md={6}>
                      <Form.Group>
                        <Form.Label className="fw-semibold text-dark">
                          Booking Done By Employee{" "}
                          <span className="text-muted small">(optional)</span>
                        </Form.Label>
                        <Select
                          options={employees.map((e) => ({
                            value: e.employeeId,
                            label: `${e.firstName || ""} ${e.lastName || ""}`.trim(),
                          }))}
                          value={selectedEmployee}
                          onChange={(option) => setSelectedEmployee(option)}
                          placeholder="Select employee"
                          isSearchable
                          isClearable
                          className="modern-select"
                          menuPortalTarget={document.body}
                          styles={{
                            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                            control: (base) => ({
                              ...base,
                              minHeight: "42px",
                              border: "1px solid #dee2e6",
                              "&:hover": { borderColor: "#86b7fe" },
                            }),
                          }}
                        />
                      </Form.Group>
                    </Col>
                  )}

                  {/* 4. Check-In */}
                  <Col lg={4} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">Check-in</Form.Label>
                      <DateInput
                        value={checkIn}
                        min={today}
                        stateId={selectedDestination?.value}
                        endpoint="/api/long-stay-search/rate-calendar"
                        ariaLabel="Long-stay check-in date"
                        isInvalid={!!errors.checkIn}
                        onChange={(newCheckIn) => {
                          setCheckIn(newCheckIn);
                          if (!newCheckIn) return;
                          clearError("checkIn");

                          // Two-way sync rules when CheckIn changes:
                          //  (a) If a valid CheckOut is already on the form
                          //      AND it is on/after the new CheckIn, KEEP
                          //      CheckOut and recompute Nights from the
                          //      date pair. This is what the spec asks for
                          //      under "If user changes Check-in Date".
                          //  (b) Otherwise (no CheckOut yet, or CheckOut
                          //      now lies before CheckIn) fall back to the
                          //      original behavior: derive CheckOut from
                          //      Nights when the operator already typed a
                          //      valid Nights value, else a "next day"
                          //      placeholder. This preserves the existing
                          //      Nights → CheckOut flow.
                          const start = new Date(newCheckIn);
                          const existingOut = checkOut ? new Date(checkOut) : null;
                          const keepExistingOut =
                            existingOut &&
                            !Number.isNaN(existingOut.getTime()) &&
                            existingOut.getTime() >= start.getTime();

                          if (keepExistingOut) {
                            const n = nightsBetween(newCheckIn, checkOut);
                            if (n !== null) setNights(String(n));
                            clearError("nights");
                            return;
                          }

                          const n = Number(nights);
                          const useNights =
                            Number.isFinite(n) && n >= MIN_LONG_STAY_NIGHTS;
                          const out = new Date(start);
                          out.setDate(start.getDate() + (useNights ? Math.floor(n) : 1));
                          const iso = new Date(out.getTime() - out.getTimezoneOffset() * 60000)
                            .toISOString()
                            .slice(0, 10);
                          setCheckOut(iso);
                          clearError("checkOut");
                          // Keep Nights mirrored to the new (CheckIn, derived
                          // CheckOut) pair so the field reflects what was
                          // actually picked — important when the fallback
                          // landed on the "next day" placeholder (1 night)
                          // and Nights was previously a stale value like 30.
                          const derivedNights = nightsBetween(newCheckIn, iso);
                          if (derivedNights !== null) {
                            setNights(String(derivedNights));
                          }
                        }}
                      />
                      {errors.checkIn && (
                        <div className="text-danger small mt-1">{errors.checkIn}</div>
                      )}
                    </Form.Group>
                  </Col>

                  {/* 5. Nights */}
                  <Col lg={2} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">
                        Nights{" "}
                        <small className="text-muted fw-normal">
                          (min {MIN_LONG_STAY_NIGHTS})
                        </small>
                      </Form.Label>
                      <Form.Control
                        style={{ height: "42px" }}
                        className="form-control-modern"
                        type="number"
                        // `min` is a hint to the browser spinner; the
                        // authoritative check is in validateForm so
                        // pasted / typed sub-30 values are flagged
                        // explicitly to the user.
                        min={MIN_LONG_STAY_NIGHTS}
                        max={365}
                        placeholder={`${MIN_LONG_STAY_NIGHTS}+`}
                        value={nights}
                        onChange={(e) => handleNightsChange(e.target.value)}
                        onBlur={(e) => commitNights(e.target.value)}
                        isInvalid={!!errors.nights}
                      />
                      {errors.nights && (
                        <div className="text-danger small mt-1">{errors.nights}</div>
                      )}
                    </Form.Group>
                  </Col>

                  {/* 6. Check-Out */}
                  <Col lg={3} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">Check-out</Form.Label>
                      <DateInput
                        value={checkOut}
                        min={minCheckOutDate}
                        stateId={selectedDestination?.value}
                        endpoint="/api/long-stay-search/rate-calendar"
                        ariaLabel="Long-stay check-out date"
                        isInvalid={!!errors.checkOut}
                        onChange={(newCheckOut) => {
                          setCheckOut(newCheckOut);
                          if (newCheckOut) clearError("checkOut");
                          // CheckOut → Nights sync. If CheckIn is set and
                          // the new CheckOut is on/after it, mirror the
                          // diff into the Nights field so the operator
                          // sees a coherent triple. RateCalendar's own
                          // `min` prop already blocks pre-CheckIn values;
                          // the helper additionally clamps to 0 for
                          // safety when an earlier date somehow lands.
                          if (newCheckOut && checkIn) {
                            const n = nightsBetween(checkIn, newCheckOut);
                            if (n !== null) {
                              setNights(String(n));
                              if (n > 0) clearError("nights");
                            }
                          }
                        }}
                      />
                      {errors.checkOut && (
                        <div className="text-danger small mt-1">{errors.checkOut}</div>
                      )}
                    </Form.Group>
                  </Col>

                  <Col lg={4} md={6}>
                    <Form.Label className="fw-semibold text-dark">Rooms & Guests</Form.Label>
                    <div className="d-flex gap-2">
                      <Button
                        variant="outline-primary"
                        className="flex-grow-1 text-start rooms-summary-btn-modern"
                        type="button"
                        onClick={() => setRoomsOpen((o) => !o)}
                      >
                        {rooms.reduce((a, r) => a + r.adults, 0)} adults
                        {rooms.reduce((a, r) => a + r.children, 0)
                          ? `, ${rooms.reduce((a, r) => a + r.children, 0)} child`
                          : ""}{" "}
                        · {rooms.length} room{rooms.length > 1 ? "s" : ""}
                        <span className="float-end">{roomsOpen ? "▴" : "▾"}</span>
                      </Button>
                      <Button
                        type="button"
                        // hs-add-room-btn-red is the shared solid-red variant
                        // already defined in HotelSearch.css alongside the
                        // base .btn-add-room-premium pill. Matches the red
                        // used by the SEARCH LONG STAY button below (#EC0B43
                        // → #C90939). Same convention HotelSearch uses; other
                        // search pages sharing btn-add-room-premium (Student,
                        // GovEmployee, etc.) don't carry this modifier and
                        // keep their pink→violet gradient.
                        className="flex-shrink-0 btn-add-room-premium hs-add-room-btn-red"
                        disabled={roomsOpen && rooms.length >= MAX_ROOMS}
                        onClick={() => {
                          if (!roomsOpen) {
                            setRoomsOpen(true);
                          } else {
                            // Never exceed the per-booking room cap.
                            setRooms((prev) =>
                              prev.length >= MAX_ROOMS
                                ? prev
                                : [
                                    ...prev,
                                    { adults: 1, children: 0, childAges: [] },
                                  ]
                            );
                          }
                        }}
                      >
                        <span className="add-room-plus">+</span>
                        <span>Add Room</span>
                      </Button>
                    </div>
                  </Col>
                </Row>

                {roomsOpen && (
                  <Row className="g-3 mt-3">
                    <Col md={12}>
                      <RoomGuestSelector value={rooms} onChange={setRooms} />
                    </Col>
                  </Row>
                )}

                <Row className="mt-3">
                  <Col className="d-flex justify-content-center gap-3">
                    <Button
                      type="submit"
                      className="btn-search-modern"
                      disabled={isLoading}
                      size="lg"
                    >
                      {isLoading ? (
                        <>
                          <Spinner animation="border" size="sm" className="me-2" />
                          Searching...
                        </>
                      ) : (
                        <>
                          <FaSearch className="me-2" />
                          SEARCH LONG STAY
                        </>
                      )}
                    </Button>
                  </Col>
                </Row>
              </Form>
            </Card.Body>
          </Card>
           </div>
            {/* Ads carousel — only on first entry, before any search has run.
                Re-opening the form via "Modify Search" keeps it hidden. */}
            {!hasResultsView && (
              <AdvertisementCarousel
                cityId={selectedDestination?.value}
                cityName={selectedDestination?.label}
              />
            )}
          </div>
          )}

          <SearchProgressBar pollStatus={pollStatus} completedChannels={completedChannels} />

          {!hasSearched && !hasSearchResult && (
            <Card className="shadow-sm rounded-xl">
              <Card.Body className="text-center text-muted py-5">
                <FaSearch className="display-4 text-muted mb-3" />
                <h4>Find Long Stay Contracts</h4>
                <p>Use the search form above to discover monthly contracts at the best rates.</p>
              </Card.Body>
            </Card>
          )}

          {(hasSearchResult || allResults.length > 0) && (
            <div ref={resultsRef}>
              <div className="search-layout">
                <Row className="g-4">
                  <Col lg={3} className="leftside d-none d-lg-block">
                    <div className="left-fixed">
                      <Card className="shadow-sm rounded-xl filtersection">
                        <Card.Body className="p-2">
                          <div className="map-preview-wrapper mb-2">
                            <img src="/images/map.jpg" alt="Map preview" className="map-preview-img" />
                            <button className="map-overlay-btn">EXPLORE ON MAP 📍</button>
                          </div>
                          <Form.Control
                            type="text"
                            placeholder={placeholder}
                            className="ps-3 mb-2"
                            value={hotelSearchTerm}
                            onChange={(e) => {
                              const val = e.target.value;
                              setHotelSearchTerm(val);
                              setPageIndex(0);
                              debouncedSetFinalTerm(val);
                            }}
                          />
                          {/* Currency — converts the AED rates shown below.
                              Hidden for AGENT logins (their currency is
                              auto-locked to the agent's configured
                              currency upstream). */}
                          {!isAgentRole && (
                            <>
                              <Form.Group className="mb-2">
                                <Form.Label className="fw-semibold small">Currency</Form.Label>
                                <Select
                                  options={currencyOptions}
                                  value={selectedCurrency}
                                  onChange={(opt) => {
                                    currencyTouchedRef.current = true;
                                    setSelectedCurrency(opt);
                                  }}
                                  placeholder="Select currency"
                                  isSearchable
                                  className="modern-select-sm"
                                  menuPortalTarget={document.body}
                                  styles={{
                                    control: (base) => ({
                                      ...base,
                                      minHeight: "36px",
                                      background: "#ffffff",
                                      color: "#000000",
                                    }),
                                    menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                                    menu: (base) => ({ ...base, zIndex: 9999 }),
                                  }}
                                />
                              </Form.Group>

                              <hr />
                            </>
                          )}

                          <Form.Group className="mb-2">
                            <Form.Label className="fw-semibold small">Hotel Type</Form.Label>
                            <div className="filter-checkbox-list">
                              {hotelTypeOptions.map((item) => (
                                <Form.Check
                                  key={item.value}
                                  type="checkbox"
                                  id={`hotel-type-${item.value}`}
                                  label={item.label}
                                  checked={hotelType.some((t) => t.value === item.value)}
                                  onChange={(e) => {
                                    if (e.target.checked) setHotelType([...hotelType, item]);
                                    else setHotelType(hotelType.filter((t) => t.value !== item.value));
                                  }}
                                />
                              ))}
                            </div>
                          </Form.Group>
                          {/* Channel — supplier/channel checkbox filter.
                              Hidden for AGENT logins (agents book only
                              through their contracted channel and the
                              backend already scopes results). */}
                          {!isAgentRole && (
                            <>
                              <hr />
                              <Form.Group>
                                <Form.Label className="fw-semibold small">Channel</Form.Label>
                                <div className="filter-checkbox-list">
                                  {channelTypeOptions.map((item) => (
                                    <Form.Check
                                      key={item.value}
                                      type="checkbox"
                                      id={`channel-${item.value}`}
                                      label={item.label}
                                      checked={channelType.some((c) => c.value === item.value)}
                                      onChange={(e) => {
                                        if (e.target.checked) setChannelType([...channelType, item]);
                                        else setChannelType(channelType.filter((c) => c.value !== item.value));
                                      }}
                                    />
                                  ))}
                                </div>
                              </Form.Group>
                            </>
                          )}
                        </Card.Body>
                      </Card>
                    </div>
                  </Col>

                  <Col lg={9}>
                    <Card className="shadow-sm rounded-xl mb-3 filtersection">
                      <Card.Body className="p-2">
                        <div className="d-flex align-items-center gap-3 flex-wrap">
                          <Select
                            options={starOptions}
                            value={starRating}
                            onChange={setStarRating}
                            placeholder="All Stars"
                            className="modern-select-sm"
                            menuPortalTarget={document.body}
                            styles={{
                              control: (base) => ({
                                ...base,
                                height: "36px",
                                minHeight: "36px",
                                width: "180px",
                                background: "#ffffff",
                                color: "#000000",
                                marginLeft: "30px",
                              }),
                              menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                              menu: (base) => ({ ...base, zIndex: 9999 }),
                            }}
                            isClearable
                          />
                          <div className="d-flex gap-2">
                            <Button
                              size="sm"
                              className={`sort-pill ${sortBy === "priceAsc" ? "active" : ""}`}
                              onClick={() => setSortBy("priceAsc")}
                            >
                              Low to High
                            </Button>
                            <Button
                              size="sm"
                              className={`sort-pill ${sortBy === "priceDesc" ? "active" : ""}`}
                              onClick={() => setSortBy("priceDesc")}
                            >
                              High to Low
                            </Button>
                          </div>
                          <Button
                            className="clear-pill"
                            variant="outline-primary"
                            size="sm"
                            onClick={() => {
                              setStarRating(null);
                              setHotelType([]);
                              setChannelType([]);
                              setSortBy("priceAsc");
                              setHotelSearchTerm("");
                            }}
                          >
                            Clear
                          </Button>
                        </div>
                      </Card.Body>
                    </Card>

                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <small className="text-muted fw-semibold">
                        Showing {startEntry} to {endEntry} of {totalElements} entries
                      </small>
                    </div>

                    {isLoading && pollStatus !== "IN_PROGRESS" && (
                      <Card className="shadow-sm rounded-xl mb-4">
                        <Card.Body className="text-center py-4">
                          <Spinner animation="border" variant="primary" />
                          <p className="text-muted mt-2 mb-0">Loading results…</p>
                        </Card.Body>
                      </Card>
                    )}

                    <Row className="g-4">
                      {filteredResults.length > 0 ? (
                        filteredResults.map((hotel) => (
                          <Col xs={12} key={hotel.id}>
                            <div
                              style={{
                                backgroundColor: "white",
                                border: "1px solid #dee2e6",
                                borderRadius: "12px",
                                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                                overflow: "hidden",
                              }}
                            >
                              <Row className="g-0">
                                <Col md={4}>
                                  <div style={{ position: "relative", height: "100%", padding: "15px" }}>
                                    <LazyImage src={hotel.image} alt={hotel.name} />
                                    <div
                                      style={{
                                        position: "absolute",
                                        top: "25px",
                                        left: "25px",
                                        backgroundColor: "rgba(0,0,0,0.7)",
                                        color: "white",
                                        padding: "5px 10px",
                                        borderRadius: "15px",
                                        fontSize: "12px",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "5px",
                                      }}
                                    >
                                      <FaStar className="text-warning" />
                                      {hotel.rating}
                                      {/* Channel chip — same gray pill the
                                          Last Minute results use. Long Stay
                                          only surfaces in-house contracts
                                          (see channelTypeOptions above), so
                                          this is always "INHOUSE". Kept
                                          static to match LM instead of
                                          driving from hotel.channelType so
                                          the two pages read as one system. */}
                                      <span
                                        style={{
                                          marginLeft: "5px",
                                          backgroundColor: "#6c757d",
                                          padding: "2px 6px",
                                          borderRadius: "10px",
                                        }}
                                      >
                                        INHOUSE
                                      </span>
                                    </div>
                                  </div>
                                </Col>
                                <Col md={8}>
                                  <div style={{ padding: "16px" }}>
                                    <h6
                                      style={{
                                        fontSize: "1.0rem",
                                        fontWeight: "600",
                                        marginBottom: "8px",
                                        color: "#333",
                                      }}
                                    >
                                      {hotel.name}
                                    </h6>
                                    <p style={{ fontSize: "0.875rem", color: "#666", marginBottom: "8px" }}>
                                      📍 {hotel.address || hotel.city || "Address Not Available"}
                                    </p>
                                    {hotel.badge && (
                                      <span
                                        style={{
                                          backgroundColor: "#17a2b8",
                                          color: "white",
                                          padding: "4px 8px",
                                          borderRadius: "4px",
                                          fontSize: "0.75rem",
                                          display: "inline-block",
                                          marginBottom: "12px",
                                        }}
                                      >
                                        {hotel.badge}
                                      </span>
                                    )}
                                    <div
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        marginTop: "16px",
                                        paddingTop: "12px",
                                        borderTop: "1px solid #eee",
                                      }}
                                    >
                                      <div style={{ fontSize: "1.1rem", fontWeight: "600", color: "#333" }}>
                                        {(() => {
                                          // hotel.price is now the actual
                                          // cheapest TOTAL stay price across
                                          // this hotel's contracts × rooms,
                                          // computed by the backend
                                          // (LongStayPricingService#estimateTotal)
                                          // using the same cost-type rules
                                          // the room-list page applies — so
                                          // the figures agree.
                                          const total = Number(hotel.price);
                                          if (!Number.isFinite(total) || total <= 0) {
                                            return "Price on request";
                                          }
                                          const n = Number(nights) || 0;
                                          return (
                                            <>
                                              <span style={{ display: "block" }}>
                                                from {displayCurrencyCode}{" "}
                                                {convertFromAed(total).toLocaleString(undefined, {
                                                  minimumFractionDigits: 0,
                                                  maximumFractionDigits: 0,
                                                })}
                                              </span>
                                              {n > 0 && (
                                                <small className="text-muted fw-normal" style={{ fontSize: "0.78rem" }}>
                                                  total for {n} night{n !== 1 ? "s" : ""}
                                                </small>
                                              )}
                                            </>
                                          );
                                        })()}
                                      </div>
                                      <Button
                                        size="sm"
                                        variant={
                                          clickedHotelIds.includes(hotel.id) ? "secondary" : "primary"
                                        }
                                        onClick={() => {
                                          setClickedHotelIds((prev) => [...prev, hotel.id]);
                                          const nationalityCode =
                                            (selectedNationality?.code || "").length === 2
                                              ? selectedNationality.code
                                              : " ";
                                          const roomsPayload = rooms.map((r) => ({
                                            adults: r.adults || 1,
                                            children: r.children || 0,
                                            childAges: r.childAges || [],
                                            adultAges: Array.from(
                                              { length: r.adults || 1 },
                                              () => 30
                                            ),
                                          }));
                                          const payload = {
                                            checkInDate: checkIn,
                                            checkOutDate: checkOut,
                                            hotelCode: hotel.hotelCode || "",
                                            hotelId: Number(hotel.hotelCode),
                                            nationality: nationalityCode,
                                            // Agent logins never populate
                                            // `agent` (the picker is hidden
                                            // for them), so fall back to
                                            // their own resolved id —
                                            // otherwise /long-stay-room-list's
                                            // "Available Balance" (keyed off
                                            // this field) has no agent id to
                                            // look up.
                                            agentId: String(
                                              isAgentRole ? selfAgentId : agent,
                                            ),
                                            apiId: 1,
                                            rooms: roomsPayload,
                                            // Optional "Booking Done By"
                                            // selection — null when the
                                            // user skipped the dropdown.
                                            employeeId:
                                              selectedEmployee?.value || null,
                                            // "Add New Item" amendment flow —
                                            // parent hotel booking code when
                                            // launched from ADD NEW ITEM.
                                            parentBookingCode:
                                              new URLSearchParams(
                                                window.location.search,
                                              ).get("parentBookingCode") || null,
                                          };
                                          const meta = {
                                            hotelName: hotel.name,
                                            address: hotel.address || hotel.city,
                                            starRating: hotel.rating || 0,
                                            phone: "",
                                            hotelImage: hotel.image,
                                          };
                                          sessionStorage.setItem(
                                            "longStayRoomListPayload",
                                            JSON.stringify({ payload, meta, currency: displayCurrency })
                                          );
                                          setTimeout(() => {
                                            window.open("/long-stay-room-list", "_blank");
                                          }, 50);
                                        }}
                                      >
                                        View Rooms
                                      </Button>
                                    </div>
                                  </div>
                                </Col>
                              </Row>
                            </div>
                          </Col>
                        ))
                      ) : (
                        <Col xs={12}>
                          <Card className="shadow-sm rounded-xl">
                            <Card.Body className="text-center text-muted py-5">
                              <FaSearch className="display-4 text-muted mb-3" />
                              <h5>No long stay contracts found</h5>
                              <p>Try adjusting your filters or search criteria.</p>
                            </Card.Body>
                          </Card>
                        </Col>
                      )}
                    </Row>

                    {filteredResults.length > 0 &&
                      totalElements > 0 &&
                      !(hotelSearchTerm || hotelType.length > 0) && (
                        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-4 mt-3">
                          <small className="text-muted fw-semibold"></small>
                          <Pagination className="mb-0 pagination-modern">
                            <Pagination.Prev
                              disabled={pageIndex === 0}
                              onClick={() => goToPage(pageIndex - 1)}
                            />
                            {pageNumbers.map((n) =>
                              typeof n === "number" ? (
                                <Pagination.Item
                                  key={n}
                                  active={n === pageIndex + 1}
                                  onClick={() => goToPage(n - 1)}
                                >
                                  {n}
                                </Pagination.Item>
                              ) : (
                                <Pagination.Ellipsis key={n} disabled />
                              )
                            )}
                            <Pagination.Next
                              disabled={pageIndex >= effectiveTotalPages - 1}
                              onClick={() => goToPage(pageIndex + 1)}
                            />
                          </Pagination>
                        </div>
                      )}
                  </Col>
                </Row>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
