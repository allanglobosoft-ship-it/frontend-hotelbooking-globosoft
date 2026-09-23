import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, Button, Row, Col, Form, Spinner, Modal } from "react-bootstrap";
import Sidebar from "../../../components/Sidebar";
import TopBar from "../../../components/TopBar";
// Same "Explore On Map" preview + modal as /new-booking/hotel — reused so
// both search pages read as one system. Packages have no lat/lng, so the
// modal opens with an empty markers array and shows its built-in
// unavailable-location fallback.
import MapModal from "../../../components/map/MapModal";
import { ENABLE_MAP_PREVIEW } from "../../../config/featureFlags";
// Packages only carry a text arrive-place/arrive-country (no lat/lng
// anywhere in that chain — see PackageSearchResponseDTO on the backend).
// This resolves an approximate marker position from those strings using a
// local city/country centroid table — no third-party geocoding call.
import { resolveApproxLocation } from "../../../utils/locationCentroids";
import Select from "react-select";
import axiosInstance from "../../../components/AxiosInstance";
import AgentBalanceDisplay from "../../../components/AgentBalanceDisplay";
import AgentCreditBalance from "../../../components/AgentCreditBalance";
import AgentSelect from "../../../components/AgentSelect";
// Same OK / Cancel calendar+time picker used on Occupancy & Minimum Length's
// Validity From / Validity To fields — reused here so Arrival / Departure on
// the Package Search page render the identical popup.
import DateTimeApplyPicker, {
  parseLocalDateTime,
} from "../../../components/DateTimeApplyPicker";
import {
  FaSearch,
  FaEye,
  FaCalendarAlt,
  FaInfoCircle,
  FaCheckCircle,
  FaTimesCircle,
  FaClock,
  FaClipboardList,
  FaMapMarkerAlt,
  FaHotel,
  FaCar,
  FaHiking,
  FaMoneyBillWave,
  FaTag,
  FaFileContract,
  FaPlaneDeparture,
  FaExclamationTriangle,
} from "react-icons/fa";
import { toast } from "react-hot-toast";
import { useNavigate } from "react-router-dom";
// Reuse /new-booking/hotel's sidebar + sort-bar visual system verbatim
// (.leftside, .left-fixed, .filtersection, .filter-checkbox-list,
// .sort-pill, .clear-pill, .modern-select-sm) so both pages read as one.
// Imported first so package-specific overrides in PackageSearch.css below
// keep winning at the same specificity.
import "../../../styles/HotelSearch.css";
import "../../../styles/PackageSearch.css";

// ─────────────────────────────────────────────
// Counter Button helper
// (mirrors the "Rooms & Guests" selector on /new-booking/hotel — HotelSearch.jsx)
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

// ─────────────────────────────────────────────
// Room Guest Selector
// ─────────────────────────────────────────────
function RoomGuestSelector({ value, onChange }) {
  const [rooms, setRooms] = useState(value);

  // Sync internal state when the parent updates the rooms list externally
  // (e.g. the "Add Room" button beside the Rooms & Guests trigger).
  useEffect(() => {
    setRooms(value);
  }, [value]);

  const update = (next) => {
    setRooms(next);
    onChange && onChange(next);
  };

  const setAdults = (index, adults) =>
    update(rooms.map((r, i) => (i === index ? { ...r, adults } : r)));

  const setChildren = (index, children) =>
    update(
      rooms.map((r, i) =>
        i === index
          ? {
              ...r,
              children,
              childAges: Array.from(
                { length: children },
                (_, j) => r.childAges[j] || 5,
              ),
            }
          : r,
      ),
    );

  const setChildAge = (roomIdx, childIdx, age) =>
    update(
      rooms.map((r, i) => {
        if (i !== roomIdx) return r;
        const ages = [...r.childAges];
        ages[childIdx] = age;
        return { ...r, childAges: ages };
      }),
    );

  return (
    <div className="rgs-wrap">
      <div className="rgs-grid">
        {rooms.map((room, i) => (
          <div key={i} className="rgs-room-card">
            <div className="rgs-counters-col">
              <div className="rgs-counter-row">
                <div className="rgs-counter-info">
                  <span className="rgs-counter-title">Adults</span>
                  <span className="rgs-counter-sub">Age 12+</span>
                </div>
                <Counter
                  value={room.adults}
                  min={1}
                  max={4}
                  onChange={(v) => setAdults(i, v)}
                />
              </div>
              <div className="rgs-counter-row">
                <div className="rgs-counter-info">
                  <span className="rgs-counter-title">Children</span>
                  <span className="rgs-counter-sub">Age 0–12</span>
                </div>
                <Counter
                  value={room.children}
                  min={0}
                  max={4}
                  onChange={(v) => setChildren(i, v)}
                />
              </div>
            </div>

            {/* Informational guidance only — shown ONLY when this room has
                more than 2 children, so users planning that case understand
                they may need an additional room. Does NOT validate or
                restrict. */}
            {room.children > 2 && (
              <div
                role="note"
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "8px",
                  border: "1px solid #b6e0fe",
                  backgroundColor: "#eaf6ff",
                  color: "#084c8d",
                  borderRadius: "4px",
                  padding: "8px 10px",
                  marginTop: "8px",
                  fontSize: "0.78rem",
                  lineHeight: 1.35,
                }}
              >
                <FaInfoCircle
                  style={{ marginTop: "2px", flexShrink: 0 }}
                  aria-hidden="true"
                />
                <span>
                  Most hotels allow up to <strong>2 children per room</strong>.
                  If you have more than 2 children, you may need to book an
                  additional room.
                </span>
              </div>
            )}

            {room.children > 0 && (
              <div className="rgs-child-ages">
                <span className="rgs-child-ages-label">Child ages</span>
                <div className="rgs-child-ages-row">
                  {Array.from({ length: room.children }).map((_, idx) => (
                    <div key={idx} className="rgs-child-age-select">
                      <label className="rgs-child-age-label">
                        Child {idx + 1}
                      </label>
                      <Form.Select
                        size="sm"
                        value={room.childAges[idx] || 5}
                        onChange={(e) =>
                          setChildAge(i, idx, parseInt(e.target.value))
                        }
                        className="rgs-age-dropdown"
                      >
                        {/* Children are age 0–12, so the age options stop at 12. */}
                        {Array.from({ length: 13 }).map((__, age) => (
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
      </div>
    </div>
  );
}

const PackageSearch = () => {
  // Agent logins book under themselves, so the manual Agent picker is hidden
  // and the agent-required validation is skipped. Mirrors the same rule on
  // /new-booking/hotel (HotelSearch.jsx) — currentActiveRole isn't set for
  // single-role logins, so fall back to userRole.
  const activeRole = (localStorage.getItem("currentActiveRole") || "")
    .trim()
    .toUpperCase();
  const storedRoles = (localStorage.getItem("userRole") || "").toUpperCase();
  const isAgentRole = activeRole
    ? activeRole === "AGENT"
    : storedRoles.includes("AGENT") && !storedRoles.includes("ADMIN");

  // Logged-in agent's name — for agent logins the booking is "done by" the
  // agent themselves, so the "Booking Done By Employee" picker is hidden and
  // this name is shown instead. Empty for admin/staff.
  const loggedInAgentName =
    localStorage.getItem("UserName") ||
    sessionStorage.getItem("UserName") ||
    "";

  const [agents, setAgents] = useState([]);
  const [agentId, setAgentId] = useState("");
  // For agent logins the Agent picker is hidden, so the agent's own id is
  // resolved here instead — otherwise the search would run with no agent and
  // the agent's markup would silently not be applied. Same resolution order
  // as /new-booking/hotel: cached userId, else /api/personalProfile/{UserName}.
  const [selfAgentId, setSelfAgentId] = useState("");
  const [destinationOptions, setDestinationOptions] = useState([]);
  const [selectedDestination, setSelectedDestination] = useState(null);
  // Nationality filter — mirrors /new-booking/hotel. Sent with the search so
  // the backend keeps only packages priced for that nationality's market
  // type, and carried into the booking as the pax native country.
  const [nationalityList, setNationalityList] = useState([]);
  const [selectedNationality, setSelectedNationality] = useState(null);
  const [isNationalityLoading, setIsNationalityLoading] = useState(false);
  // Optional "Booking Done By Employee" selector — mirrors
  // /new-booking/hotel. Carried through to the booking page so it is
  // persisted on the new PackageBooking row.
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  // Rooms & Guests filter — mirrors /new-booking/hotel (HotelSearch.jsx).
  // Each room holds its own adult/children counts and per-child ages.
  const [rooms, setRooms] = useState([
    { adults: 1, children: 0, childAges: [] },
  ]);
  // Controls the expandable Rooms & Guests selector below the trigger button.
  const [roomsOpen, setRoomsOpen] = useState(false);
  // Flight Details filter (optional) — the traveller's arrival & departure
  // date/time. When both are set they are sent with the search so the backend
  // flags packages whose itinerary is longer than this travel window.
  const [arrivalDateTime, setArrivalDateTime] = useState("");
  const [departureDateTime, setDepartureDateTime] = useState("");

  // Per-day package rate hints, keyed by "yyyy-MM-dd", rendered under
  // the day number inside the existing Arrival / Departure calendar
  // popups. Populated by fetchPackageRates below whenever the
  // destination changes or the user navigates the picker to a new
  // month. Empty by default so the pickers behave exactly as before
  // when no destination is selected or the endpoint returns nothing.
  const [packageRateMap, setPackageRateMap] = useState({});
  // Guard against overlapping fetches / stale writes when the operator
  // clicks through months quickly. Cancels the older promise's setter
  // by comparing this ref's value at fetch-return time.
  const packageRateFetchIdRef = useRef(0);
  // Remember which (countryId, yyyy-MM) pairs are already cached in
  // packageRateMap so the effect below doesn't re-hit the API for a
  // month we've already loaded. Merges instead of overwriting so a
  // second month's fetch keeps the first month's keys visible.
  const packageRateMonthsRef = useRef(new Set());
  // Reset the accumulated cache whenever the destination changes —
  // Country A's rates must never leak into Country B's popup.
  useEffect(() => {
    packageRateMonthsRef.current = new Set();
    setPackageRateMap({});
  }, [selectedDestination?.countryId]);
  const [isDestinationLoading, setIsDestinationLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [results, setResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  // Default listing — every active package, loaded automatically when the
  // page opens (see loadDefaultPackages) so the operator can browse before
  // searching. It fills the same `results` a search does, so the sidebar
  // filters, sort bar, map and cards all work on it; `hasSearched` stays
  // false while it is on screen, which keeps the search form expanded.
  // Starts true because the load is kicked off on mount — avoids a one-frame
  // flash of the "Ready to Search?" card before the request begins.
  const [isDefaultLoading, setIsDefaultLoading] = useState(true);
  // Latest package-list request wins. A search started while the default
  // listing is still loading bumps this, so the late default response is
  // dropped instead of overwriting the search results.
  const packageRequestIdRef = useRef(0);
  // When results are on screen the big search form collapses into a sticky
  // summary strip. Clicking "Modify Search" flips this true to re-expand it.
  const [isEditingSearch, setIsEditingSearch] = useState(false);
  // "Explore on Map" modal — opened from the map preview at the top of the
  // left results sidebar. Same pattern as /new-booking/hotel.
  const [showMapModal, setShowMapModal] = useState(false);

  // ── Results-side filters (mirror /new-booking/hotel's left sidebar +
  //    top sort bar). All applied client-side against `results`. ──
  //  Package Name search         ↔ Hotel Name search
  //  Package Type checkboxes     ↔ Hotel Type
  //  Package Category checkboxes ↔ Channel
  //  Package Includes checkboxes ↔ Available Deals
  //  Duration dropdown           ↔ All Stars
  //  Low / High / Clear          ↔ same
  const [packageSearchTerm, setPackageSearchTerm] = useState("");
  const [packageTypeFilter, setPackageTypeFilter] = useState([]);
  const [packageCategoryFilter, setPackageCategoryFilter] = useState([]);
  const [packageIncludesFilter, setPackageIncludesFilter] = useState([]);
  const [durationFilter, setDurationFilter] = useState(null);
  const [sortBy, setSortBy] = useState("priceAsc");
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(null);
  const resultsRef = useRef(null);

  // After a fresh search, jump the viewport to the results so the operator
  // sees them without having to scroll past the search card. Keyed on the
  // raw `results` (not filteredResults) so a sidebar-filter tweak doesn't
  // re-scroll the page after the initial land.
  useEffect(() => {
    if (!hasSearched || results.length === 0) return;
    const id = window.setTimeout(() => {
      if (resultsRef.current) {
        resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 50);
    return () => window.clearTimeout(id);
  }, [hasSearched, results.length]);
  const navigate = useNavigate();
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(null);
  // Category resolved for the current search's pax count — captured off the
  // clicked result row so the View modal's "Categories" line shows only the
  // room that will actually be booked (not every category the package sells).
  // Falls back to the full list if the backend didn't send matchedCategoryName.
  const [selectedMatchedCategory, setSelectedMatchedCategory] = useState(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // ─────────────────────────────────────────────
  // Helper: Debounce function
  // ─────────────────────────────────────────────
  const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  };

  // Add N calendar days to a datetime-local string (yyyy-MM-ddTHH:mm). The
  // time-of-day is taken from `timeFrom` when supplied, otherwise the source
  // value's own time is preserved. Used to auto-fill Departure from Arrival
  // and to re-derive Departure when the Nights field is edited.
  const addDaysLocal = (dtLocal, days, timeFrom) => {
    if (!dtLocal) return "";
    const d = new Date(dtLocal);
    if (Number.isNaN(d.getTime())) return "";
    d.setDate(d.getDate() + days);
    if (timeFrom) {
      const t = new Date(timeFrom);
      if (!Number.isNaN(t.getTime())) {
        d.setHours(t.getHours(), t.getMinutes(), 0, 0);
      }
    }
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
      d.getDate(),
    )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const addOneDayLocal = (dtLocal) => addDaysLocal(dtLocal, 1);

  // Nights in the selected travel window — the package equivalent of the
  // Check-In → Nights → Check-Out triple on /new-booking/hotel. Derived from
  // Arrival/Departure (single source of truth) so the two can never drift.
  const nights = React.useMemo(() => {
    if (!arrivalDateTime || !departureDateTime) return 0;
    const a = new Date(arrivalDateTime);
    const d = new Date(departureDateTime);
    if (Number.isNaN(a.getTime()) || Number.isNaN(d.getTime())) return 0;
    const dayOnly = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
    const diff = Math.round(
      (dayOnly(d) - dayOnly(a)) / (24 * 60 * 60 * 1000),
    );
    return diff > 0 ? diff : 0;
  }, [arrivalDateTime, departureDateTime]);

  // Editing Nights moves Departure, keeping whatever departure time-of-day the
  // user already picked (falling back to the arrival time).
  const handleNightsChange = (value) => {
    const n = parseInt(value, 10);
    if (!arrivalDateTime || Number.isNaN(n) || n < 1) return;
    setDepartureDateTime(
      addDaysLocal(arrivalDateTime, n, departureDateTime || arrivalDateTime),
    );
    setErrors((prev) => ({ ...prev, departureDateTime: null }));
  };

  // ─────────────────────────────────────────────
  // Progress Bar Helpers
  // ─────────────────────────────────────────────
  const startProgress = () => {
    setProgress(0);
    let current = 0;
    progressRef.current = setInterval(() => {
      current += Math.random() * 8 + 2;
      if (current >= 90) {
        current = 90;
        clearInterval(progressRef.current);
      }
      setProgress(Math.min(current, 90));
    }, 200);
  };

  const completeProgress = () => {
    clearInterval(progressRef.current);
    setProgress(100);
    setTimeout(() => setProgress(0), 600);
  };

  // ─────────────────────────────────────────────
  // API: Fetch Agents
  // ─────────────────────────────────────────────
  const fetchAgents = async () => {
    try {
      const response = await axiosInstance.get("/api/agent?activeOnly=true");
      setAgents(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Error fetching agents:", error);
      setAgents([]);
    }
  };

  // ─────────────────────────────────────────────
  // API: Fetch Destinations (Initial & Search)
  // ─────────────────────────────────────────────
  const loadInitialDestinations = async () => {
    try {
      setIsDestinationLoading(true);
      const response = await axiosInstance.get("/api/province?limit=50");
      const cityApiRes = Array.isArray(response.data) ? response.data : [];
      const options = cityApiRes.map((city) => ({
        value: city.id,
        label: `${city.stateName}, ${city.country}`,
        countryId: city.countryId,
      }));
      setDestinationOptions(options);
    } catch (error) {
      console.error("Error loading initial destinations:", error);
    } finally {
      setIsDestinationLoading(false);
    }
  };

  const debouncedCitySearch = useRef(
    debounce(async (searchText = "") => {
      if (!searchText || searchText.length < 2) {
        loadInitialDestinations();
        return;
      }
      setIsDestinationLoading(true);
      try {
        const response = await axiosInstance.get(
          `/api/province?search=${searchText}`,
        );
        const cityApiRes = Array.isArray(response.data) ? response.data : [];
        const options = cityApiRes.slice(0, 50).map((city) => ({
          value: city.id,
          label: `${city.stateName}, ${city.country}`,
          countryId: city.countryId,
        }));
        setDestinationOptions(options);
      } catch (error) {
        console.error("Error searching cities:", error);
        setDestinationOptions([]);
      } finally {
        setIsDestinationLoading(false);
      }
    }, 300),
  ).current;

  // ─────────────────────────────────────────────
  // API: Package rate hints — fetched lazily by month as the Arrival /
  // Departure picker navigates. Result is merged into packageRateMap so
  // the DateTimeApplyPicker can render a small rate line under each
  // day inside the existing calendar popup. Deliberately no-op when
  // the destination has no countryId — the backend endpoint requires
  // a country scope and we don't want a 400 on every open.
  // ─────────────────────────────────────────────
  const fetchPackageRatesForMonth = async (countryId, year, monthIndex) => {
    if (!countryId) return;
    const monthKey = `${countryId}:${year}-${String(monthIndex + 1).padStart(2, "0")}`;
    if (packageRateMonthsRef.current.has(monthKey)) return; // already loaded
    packageRateMonthsRef.current.add(monthKey);

    const monthStart = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(year, monthIndex + 1, 0).getDate();
    const monthEnd = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const fetchId = ++packageRateFetchIdRef.current;
    try {
      const res = await axiosInstance.get("/api/package-search/rate-calendar", {
        params: { stateId: countryId, monthStart, monthEnd, currency: "AED" },
      });
      if (fetchId !== packageRateFetchIdRef.current) return; // stale
      const days = res?.data?.days || {};
      // Merge into whatever's already loaded so a second month doesn't
      // erase the first — matches how the picker renders any day that
      // has a rate, regardless of which fetch supplied it.
      setPackageRateMap((prev) => ({ ...prev, ...days }));
    } catch (err) {
      // Rate hints are optional. Swallow so a failure never breaks the
      // date-time picker itself.
      // eslint-disable-next-line no-console
      console.warn("Package rate-calendar fetch failed — hint disabled.", err);
      // Un-mark so a retry on the next month change can succeed.
      packageRateMonthsRef.current.delete(monthKey);
    }
  };

  // ─────────────────────────────────────────────
  // API: Fetch Nationalities (Initial & Search)
  // Same /api/country source and option shape used by /new-booking/hotel.
  // ─────────────────────────────────────────────
  const loadInitialNationalities = async () => {
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
      console.error("Error loading nationalities:", error);
      setNationalityList([]);
    } finally {
      setIsNationalityLoading(false);
    }
  };

  const debouncedCountrySearch = useRef(
    debounce(async (searchText = "") => {
      if (!searchText || searchText.length < 2) return;
      setIsNationalityLoading(true);
      try {
        const response = await axiosInstance.get(
          `/api/country?search=${searchText}`,
        );
        const options = Array.isArray(response.data)
          ? response.data.map((country) => ({
              value: country.id,
              label: country.name,
              code: country.countryCode,
            }))
          : [];
        setNationalityList(options);
      } catch (error) {
        console.error("Error searching nationalities:", error);
        setNationalityList([]);
      } finally {
        setIsNationalityLoading(false);
      }
    }, 300),
  ).current;

  const handleCountryInputChange = (inputValue) => {
    if (inputValue && inputValue.length >= 2) {
      debouncedCountrySearch(inputValue);
    }
  };

  // ─────────────────────────────────────────────
  // API: Fetch Employees (Booking Done By Employee)
  // ─────────────────────────────────────────────
  const fetchEmployees = async () => {
    try {
      const response = await axiosInstance.get("/api/employee?page=0&limit=1000");
      setEmployees(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Error fetching employees:", error);
      setEmployees([]);
    }
  };

  // ─────────────────────────────────────────────
  // API: Default listing — all active packages
  // Same /api/v1/package-booking/search endpoint the Search button uses, sent
  // with no criteria: the backend then skips every filter (destination,
  // nationality, travel window, occupancy) and returns each package whose
  // liveStatus is Active. No agent is sent, so rates carry no agent markup —
  // harmless here: the cards show no price, the Low/High sort order is the
  // same with or without markup, and booking always goes through a real
  // search (see handleBookFromDefaultList).
  // ─────────────────────────────────────────────
  const loadDefaultPackages = async () => {
    const requestId = ++packageRequestIdRef.current;
    setIsDefaultLoading(true);
    try {
      const response = await axiosInstance.post(
        "/api/v1/package-booking/search",
        {},
      );
      if (requestId !== packageRequestIdRef.current) return; // superseded
      setResults(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      if (requestId !== packageRequestIdRef.current) return;
      console.error("Failed to load active packages:", error);
      toast.error(error.response?.data?.message || "Failed to load packages");
      setResults([]);
    } finally {
      if (requestId === packageRequestIdRef.current) setIsDefaultLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
    loadInitialDestinations();
    loadInitialNationalities();
    fetchEmployees();
    loadDefaultPackages();
  }, []);

  // Agent logins: resolve the agent's own id so the search still carries an
  // agent (and therefore their markup) even though the picker is hidden.
  useEffect(() => {
    if (!isAgentRole) return undefined;
    const cached = localStorage.getItem("userId");
    if (cached) {
      setSelfAgentId(cached);
      return undefined;
    }
    const userName =
      localStorage.getItem("UserName") || sessionStorage.getItem("UserName");
    if (!userName) return undefined;
    let cancelled = false;
    axiosInstance
      .get(`/api/personalProfile/${userName}`)
      .then((res) => {
        if (cancelled) return;
        if (res?.data?.id != null) {
          const idv = String(res.data.id);
          localStorage.setItem("userId", idv);
          setSelfAgentId(idv);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAgentRole]);

  // The agent the search/booking runs under: the picked one for admin/staff,
  // the logged-in agent's own id for agent logins.
  const effectiveAgentId = isAgentRole ? selfAgentId : agentId;

  // ─────────────────────────────────────────────
  // Form Submission
  // ─────────────────────────────────────────────
  const validateForm = () => {
    const newErrors = {};
    if (!selectedNationality) newErrors.nationality = "Nationality is required";
    if (!selectedDestination) newErrors.destination = "Destination is required";
    // Agent logins book under themselves (the picker is hidden), so the agent
    // is never set manually — skip this check for them, as HotelSearch does.
    if (!isAgentRole && !agentId) newErrors.agent = "Agent is required";
    // Flight Details are mandatory — both ends must be provided and the
    // departure must be strictly after the arrival.
    if (!arrivalDateTime)
      newErrors.arrivalDateTime = "Arrival date & time is required";
    if (!departureDateTime)
      newErrors.departureDateTime = "Departure date & time is required";
    if (
      arrivalDateTime &&
      departureDateTime &&
      new Date(departureDateTime) <= new Date(arrivalDateTime)
    )
      newErrors.departureDateTime = "Departure must be after arrival";
    return newErrors;
  };

  const handleSearchSubmit = async (e) => {
    // No event when run from a default-listing "Book" click (see
    // handleBookFromDefaultList).
    if (e) e.preventDefault();
    const formErrors = validateForm();
    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors);
      return;
    }

    setErrors({});
    // A search supersedes the automatic default listing — invalidate any
    // default request still in flight so its late response can't replace
    // these results (see loadDefaultPackages).
    packageRequestIdRef.current += 1;
    setIsDefaultLoading(false);
    setIsLoading(true);
    startProgress();
    setHasSearched(true);
    setIsEditingSearch(false);
    setResults([]);
    // Fresh search — drop any leftover sidebar-filter picks from the previous
    // result set so a stale checkbox can't silently hide every new package.
    clearResultFilters();

    try {
      const totalAdults = rooms.reduce((a, r) => a + (r.adults || 0), 0);
      const totalChildren = rooms.reduce((a, r) => a + (r.children || 0), 0);
      const payload = {
        countryId: selectedDestination.countryId || "",
        cityId: selectedDestination.value || "",
        agentId: effectiveAgentId || "",
        // Nationality filter — the backend resolves this country's market type
        // and keeps only packages that have a rate priced for that market
        // (rates with no market restriction always qualify).
        nationalityId: selectedNationality?.value || "",
        // Flight Details filter — sent only when both ends are provided.
        arrivalDateTime: arrivalDateTime || "",
        departureDateTime: departureDateTime || "",
        // Occupancy filter — the backend returns only packages that have a
        // category able to accommodate this group, along with the matched
        // category (matchedCategoryId/Name) used later by the booking flow.
        adultCount: totalAdults || 1,
        childCount: totalChildren,
      };

      console.log("Package search payload:", payload);
      const response = await axiosInstance.post(
        "/api/v1/package-booking/search",
        payload,
      );

      console.log("Package search response:", response.data);
      setResults(Array.isArray(response.data) ? response.data : []);

      if (response.data.length > 0) {
        toast.success(`Found ${response.data.length} packages!`);
      } else {
        toast.error("No packages found for the selected criteria.");
      }
    } catch (error) {
      console.error("Package search failed:", error);
      toast.error(error.response?.data?.message || "Package search failed");
      setResults([]);
    } finally {
      setIsLoading(false);
      completeProgress();
    }
  };

  const handleBookNow = (pkg) => {
    // Flight Details filter: this package's itinerary is longer than the
    // selected travel window. Warn and let the user accept before booking.
    if (pkg.exceedsTravelWindow) {
      const proceed = window.confirm(
        `${
          pkg.travelWindowWarning ||
          "This package's itinerary is longer than your selected flight window."
        }\n\nDo you want to continue booking this package?`,
      );
      if (!proceed) return;
    }

    // Open the booking page in a new browser tab with a CLEAN URL:
    //   /new-booking/package-booking/{packageId}
    // No query parameters — per spec. Search-page context (agent, pax,
    // nationality, rate…) is handed off via a one-shot localStorage draft
    // keyed by packageId; PackageBooking reads it via useParams() and
    // clears it on mount. Same pattern CabSearch already uses for
    // cabBookingDraft. localStorage (not sessionStorage) because window.open
    // with noopener spawns a tab that does NOT inherit the opener's
    // sessionStorage but DOES share localStorage on the same origin.
    const totalAdults = rooms.reduce((a, r) => a + (r.adults || 0), 0);
    const totalChildren = rooms.reduce((a, r) => a + (r.children || 0), 0);
    const allChildAges = rooms.flatMap((r) => r.childAges || []);

    // ADD NEW ITEM flow: PackageBookingDetailView navigates to the search
    // page with ?parentBookingCode=GPKG-... so a booking created downstream
    // becomes a child of an existing primary booking. Forwarded via the
    // draft so PackageBooking → PaxInformation can stamp the POST /book
    // payload, and the backend writes "{parent}/{n}" for bookingCode.
    const incomingParent = new URLSearchParams(window.location.search).get(
      "parentBookingCode",
    );

    const bookingContext = {
      agentId: effectiveAgentId || null,
      destinationCountryId:
        selectedDestination?.countryId != null
          ? String(selectedDestination.countryId)
          : null,
      searchRate: pkg.rate != null ? String(pkg.rate) : null,
      searchRateType: pkg.rateType || null,
      searchCurrency: pkg.currencyCode || "AED",
      nationalityId:
        selectedNationality?.value != null
          ? String(selectedNationality.value)
          : null,
      nationalityName: selectedNationality?.label || null,
      employeeId:
        !isAgentRole && selectedEmployee?.value != null
          ? String(selectedEmployee.value)
          : null,
      employeeName:
        !isAgentRole && selectedEmployee?.label ? selectedEmployee.label : null,
      adultCount: String(totalAdults || 1),
      childCount: String(totalChildren),
      childAges: allChildAges.length ? allChildAges.join(",") : "",
      noOfRooms: String(rooms.length),
      packageCategory:
        pkg.matchedCategoryId != null ? String(pkg.matchedCategoryId) : null,
      packageCategoryName: pkg.matchedCategoryName || null,
      parentBookingCode: incomingParent || null,
      // ── Abandoned-package suggestion email context ──────────────────
      // Extra fields the /api/package-search-history/save call needs so
      // the follow-up email can name the package, its destination, the
      // travel window the agent picked, and the rate they saw. Purely
      // additive to bookingContext — no existing consumer reads any of
      // these keys, so nothing else in the booking flow is affected.
      destinationCityId:
        selectedDestination?.value != null
          ? String(selectedDestination.value)
          : null,
      destinationLabel: selectedDestination?.label || null,
      destinationCityName: selectedDestination?.cityName || null,
      destinationCountryName: selectedDestination?.countryName || null,
      packageName: pkg.packageName || null,
      packageType: pkg.packageType || null,
      packageImage: pkg.packageImage || null,
      noOfNights: pkg.duration != null ? String(pkg.duration) : null,
      arrivalDateTime: arrivalDateTime || null,
      departureDateTime: departureDateTime || null,
    };

    try {
      localStorage.setItem(
        `packageBookingContext:${pkg.packageId}`,
        JSON.stringify(bookingContext),
      );
    } catch {
      // localStorage unavailable / quota exceeded — the booking page falls
      // back to defaults; the operator can re-enter agent/pax there.
    }

    const url = `/new-booking/package-booking/${pkg.packageId}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // "Book" on a default-listing card. Those rows come from a criteria-free
  // search, so they carry no matched package category and no agent,
  // destination, nationality or travel window — all of which the booking
  // page needs (its Hotels step cannot load without a category). Booking
  // therefore still goes through a real search: missing details are flagged
  // on the search form above, and a complete form runs the search so the
  // operator books from results matched to those details, exactly as before.
  const handleBookFromDefaultList = () => {
    const formErrors = validateForm();
    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors);
      window.scrollTo({ top: 0, behavior: "smooth" });
      toast.error("Fill in the search details above to book this package.");
      return;
    }
    handleSearchSubmit();
  };

  // Resolve image paths the same way PackageDetailedView does, so saved
  // absolute Windows paths still render in-browser.
  const getImageUrl = (imagePath) => {
    if (!imagePath) return "";
    if (imagePath.startsWith("http")) return imagePath;
    if (imagePath.includes("\\") || imagePath.includes(":")) {
      const filename = imagePath.split("\\").pop();
      return `${process.env.REACT_APP_API_BASE_URL}/api/files/${filename}`;
    }
    return `${process.env.REACT_APP_API_BASE_URL}/api/files/${imagePath}`;
  };

  const handleView = React.useCallback(async (pkgOrId) => {
    // Accept either the whole result row (preferred — carries the matched
    // category the search resolved for this pax count) or a bare id for
    // legacy callers. The matched category, if any, is captured into state
    // so the modal's Categories line shows only the room to be booked.
    const packageId = typeof pkgOrId === "object" && pkgOrId !== null
      ? pkgOrId.packageId
      : pkgOrId;
    const matched = typeof pkgOrId === "object" && pkgOrId !== null
      ? pkgOrId.matchedCategoryName || null
      : null;
    try {
      setIsDetailLoading(true);
      setSelectedPackage(null);
      setSelectedMatchedCategory(matched);
      setShowDetailModal(true);

      const response = await axiosInstance.get(
        `/api/TravelPackage/view/${packageId}`,
      );
      setSelectedPackage(response.data);
    } catch (error) {
      console.error("Error fetching package details:", error);
      toast.error("Failed to fetch package details");
      setShowDetailModal(false);
    } finally {
      setIsDetailLoading(false);
    }
  }, []);

  // Results are on screen once a search has run. Collapse the full form into
  // the sticky summary strip then, unless the user chose to modify the search.
  const collapseSearch = hasSearched && !isEditingSearch;
  // Until a search runs, the results area holds the default listing (every
  // active package) fetched on page open by loadDefaultPackages.
  const isDefaultListing = !hasSearched;
  const selectedAgentName = agents.find(
    (a) => String(a.id) === String(agentId),
  )?.companyName;

  // ── Filter option lists ──
  // Package Includes filter — mirrors "Available Deals" on the hotel page.
  // Backed by the containHotel / containCab / containActivity flags on the
  // package (returned by the search response).
  const packageIncludesOptions = [
    { value: "hotel", label: "Hotel", flag: "containHotel" },
    { value: "Transfers", label: "Transfers", flag: "containCab" },
    { value: "Tours", label: "Tours", flag: "containActivity" },
  ];

  // Duration buckets — mirrors the "All Stars" top-of-results dropdown. Each
  // option carries a predicate that runs against the package's numeric
  // duration (backend returns a string like "3", so we parse defensively).
  const durationOptions = [
    { value: "1", label: "1 Night", test: (n) => n === 1 },
    { value: "2", label: "2 Nights", test: (n) => n === 2 },
    { value: "3-5", label: "3–5 Nights", test: (n) => n >= 3 && n <= 5 },
    { value: "6-10", label: "6–10 Nights", test: (n) => n >= 6 && n <= 10 },
    { value: "10+", label: "10+ Nights", test: (n) => n > 10 },
  ];

  // Package Type and Package Category options are derived from the results
  // themselves (only what's actually available is shown), so a checkbox never
  // narrows to zero from the outset. Category is a comma-joined string on
  // the response ("Triple Sharing, Single Sharing"), so we split it.
  const packageTypeOptions = React.useMemo(() => {
    const seen = new Set();
    const options = [];
    results.forEach((p) => {
      const t = (p.packageType || "").trim();
      if (!t || t === "N/A" || seen.has(t.toLowerCase())) return;
      seen.add(t.toLowerCase());
      options.push({ value: t, label: t });
    });
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [results]);

  const packageCategoryOptions = React.useMemo(() => {
    const seen = new Set();
    const options = [];
    results.forEach((p) => {
      const raw = (p.packageCategory || "").trim();
      if (!raw || raw === "N/A") return;
      raw.split(",").forEach((c) => {
        const name = c.trim();
        if (!name || seen.has(name.toLowerCase())) return;
        seen.add(name.toLowerCase());
        options.push({ value: name, label: name });
      });
    });
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [results]);

  // ── Client-side filter + sort ──
  // All narrowing runs against the last search's `results` (no re-fetch on
  // filter change), matching how /new-booking/hotel does it.
  const filteredResults = React.useMemo(() => {
    let items = Array.isArray(results) ? [...results] : [];

    const term = packageSearchTerm.trim().toLowerCase();
    if (term) {
      items = items.filter((p) =>
        (p.packageName || "").toLowerCase().includes(term),
      );
    }

    if (packageTypeFilter.length > 0) {
      const picked = new Set(
        packageTypeFilter.map((t) => (t.value || "").toLowerCase()),
      );
      items = items.filter((p) =>
        picked.has((p.packageType || "").toLowerCase()),
      );
    }

    if (packageCategoryFilter.length > 0) {
      const picked = new Set(
        packageCategoryFilter.map((c) => (c.value || "").toLowerCase()),
      );
      items = items.filter((p) => {
        const cats = (p.packageCategory || "")
          .split(",")
          .map((c) => c.trim().toLowerCase())
          .filter(Boolean);
        return cats.some((c) => picked.has(c));
      });
    }

    if (packageIncludesFilter.length > 0) {
      // AND semantics — a picked include must be present on the package.
      // The backend returns each flag as 1/0 (Integer) or true/false; treat
      // both as truthy.
      items = items.filter((p) =>
        packageIncludesFilter.every((inc) => {
          const v = p[inc.flag];
          return v === 1 || v === true || v === "1";
        }),
      );
    }

    if (durationFilter) {
      items = items.filter((p) => {
        const n = parseInt(String(p.duration || "").trim(), 10);
        if (Number.isNaN(n)) return false;
        return durationFilter.test(n);
      });
    }

    // Sort by rate. The backend returns rate as a string, so we parse.
    const rateOf = (p) => {
      const n = parseFloat(String(p.rate || "").replace(/,/g, ""));
      return Number.isNaN(n) ? 0 : n;
    };
    if (sortBy === "priceAsc") items.sort((a, b) => rateOf(a) - rateOf(b));
    else if (sortBy === "priceDesc")
      items.sort((a, b) => rateOf(b) - rateOf(a));

    return items;
  }, [
    results,
    packageSearchTerm,
    packageTypeFilter,
    packageCategoryFilter,
    packageIncludesFilter,
    durationFilter,
    sortBy,
  ]);

  // "Explore on Map" markers — one per currently-visible (filtered) package,
  // approximated from arrivePlace/arriveCountryName (see
  // utils/locationCentroids.js). Packages with no recognized place/country
  // are skipped rather than guessed. When two or more packages resolve to
  // the exact same coordinate, later ones are nudged outward along a
  // golden-angle spiral so their pins don't stack exactly on top of each
  // other.
  const mapMarkers = useMemo(() => {
    const seenCount = new Map();
    return filteredResults
      .map((pkg) => {
        const coords = resolveApproxLocation(
          pkg.arrivePlace,
          pkg.arriveCountryName,
        );
        if (!coords) return null;

        const key = `${coords[0].toFixed(3)},${coords[1].toFixed(3)}`;
        const dupIndex = seenCount.get(key) || 0;
        seenCount.set(key, dupIndex + 1);

        let [lat, lng] = coords;
        if (dupIndex > 0) {
          const radius = 0.06 * dupIndex;
          const angle = dupIndex * 137.5 * (Math.PI / 180);
          lat += radius * Math.cos(angle);
          lng += radius * Math.sin(angle);
        }

        const address = [pkg.arrivePlace, pkg.arriveCountryName]
          .filter((v) => v && v !== "N/A")
          .join(", ");

        return { id: pkg.packageId, name: pkg.packageName, lat, lng, address };
      })
      .filter(Boolean);
  }, [filteredResults]);

  const clearResultFilters = () => {
    setPackageSearchTerm("");
    setPackageTypeFilter([]);
    setPackageCategoryFilter([]);
    setPackageIncludesFilter([]);
    setDurationFilter(null);
    setSortBy("priceAsc");
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 package-search-container">
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
                {arrivalDateTime && departureDateTime && (
                  <span className="hs-summary-chip">
                    ✈ {arrivalDateTime.replace("T", " ")} →{" "}
                    {departureDateTime.replace("T", " ")}
                  </span>
                )}
                {nights > 0 && (
                  <span className="hs-summary-chip">
                    {nights} night{nights > 1 ? "s" : ""}
                  </span>
                )}
                <span className="hs-summary-chip">
                  {rooms.reduce((a, r) => a + r.adults, 0)} adults
                  {rooms.reduce((a, r) => a + r.children, 0)
                    ? `, ${rooms.reduce((a, r) => a + r.children, 0)} child`
                    : ""}{" "}
                  · {rooms.length} room{rooms.length > 1 ? "s" : ""}
                </span>
                {selectedNationality?.label && (
                  <span className="hs-summary-chip">
                    {selectedNationality.label}
                  </span>
                )}
                {selectedAgentName && (
                  <span className="hs-summary-chip">{selectedAgentName}</span>
                )}
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

          {!collapseSearch && (
          <Card className="search-card-modern shadow-sm border-0 hs-form-expand">
            <Card.Body>
              <div className="mb-4 d-flex justify-content-between align-items-start flex-wrap gap-2">
                <div>
                  <h2 className="fw-bold text-primary mb-1">Package Search</h2>
                  <p className="text-muted">
                    Find the best travel packages for your clients
                  </p>
                </div>
                {/* Agent logins see their available credit balance at the
                    right end of the heading row (renders nothing for other
                    roles). */}
                <AgentCreditBalance />
              </div>

              <Form onSubmit={handleSearchSubmit}>
                {/*
                  Search criteria order — kept identical to /new-booking/hotel
                  (HotelSearch.jsx) so both booking flows read the same way:
                    1. Agent
                    2. Destination / City
                    3. Nationality
                    4. Booking Done By (Employee)
                    5. Arrival   (the package equivalent of Check-In)
                    6. Nights    (derived from the travel window)
                    7. Departure (the package equivalent of Check-Out)
                    8. Rooms & Guests
                  Row totals stay 12 on lg — first row is Agent + Destination +
                  Nationality + Booking Done By (4/4/4/4), second row is
                  Arrival + Nights + Departure + Rooms & Guests (3/2/3/4).
                */}
                <Row className="g-4">
                  {/* 1. Agent */}
                  {!isAgentRole && (
                    <Col lg={4} md={6}>
                      <Form.Group>
                        <Form.Label className="fw-semibold text-dark">
                          Agent
                        </Form.Label>
                        <AgentSelect
                          agents={agents}
                          value={agentId}
                          isInvalid={!!errors.agent}
                          onChange={(v) => {
                            setAgentId(v);
                            if (v) setErrors((prev) => ({ ...prev, agent: null }));
                          }}
                        />
                        {errors.agent && (
                          <div className="text-danger small mt-1">
                            {errors.agent}
                          </div>
                        )}
                        <AgentBalanceDisplay agentId={agentId} />
                      </Form.Group>
                    </Col>
                  )}

                  {/* 2. Destination / City */}
                  <Col lg={4} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">
                        Destination / City
                      </Form.Label>
                      <Select
                        className="modern-select"
                        classNamePrefix="react-select"
                        options={destinationOptions}
                        value={selectedDestination}
                        isLoading={isDestinationLoading}
                        onInputChange={(val) => debouncedCitySearch(val)}
                        onChange={(option) => {
                          setSelectedDestination(option);
                          if (option)
                            setErrors((prev) => ({
                              ...prev,
                              destination: null,
                            }));
                        }}
                        placeholder="Where do you want to go?"
                        isSearchable
                        isClearable
                        menuPortalTarget={document.body}
                        styles={{
                          menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                          control: (base) => ({ ...base, minHeight: "42px" }),
                        }}
                      />
                      {errors.destination && (
                        <div className="text-danger small mt-1">
                          {errors.destination}
                        </div>
                      )}
                    </Form.Group>
                  </Col>

                  {/* 3. Nationality */}
                  <Col lg={4} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">
                        Nationality <span className="text-danger">*</span>
                      </Form.Label>
                      <Select
                        className="modern-select"
                        classNamePrefix="react-select"
                        options={nationalityList}
                        value={selectedNationality}
                        isLoading={isNationalityLoading}
                        onInputChange={handleCountryInputChange}
                        onChange={(option) => {
                          setSelectedNationality(option);
                          if (option)
                            setErrors((prev) => ({
                              ...prev,
                              nationality: null,
                            }));
                        }}
                        placeholder="Select nationality"
                        isSearchable
                        isClearable
                        menuPortalTarget={document.body}
                        styles={{
                          menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                          control: (base) => ({ ...base, minHeight: "42px" }),
                        }}
                      />
                      {errors.nationality && (
                        <div className="text-danger small mt-1">
                          {errors.nationality}
                        </div>
                      )}
                    </Form.Group>
                  </Col>

                  {/* 4. Booking Done By — for AGENT logins the booking is done
                      by the logged-in agent, so the staff-employee picker is
                      hidden and the agent's own name is shown (read-only).
                      Admin/staff keep the optional employee dropdown. */}
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
                          className="modern-select"
                          classNamePrefix="react-select"
                          options={employees.map((e) => ({
                            value: e.employeeId,
                            label: `${e.firstName || ""} ${e.lastName || ""}`.trim(),
                          }))}
                          value={selectedEmployee}
                          onChange={(option) => setSelectedEmployee(option)}
                          placeholder="Select employee"
                          isSearchable
                          isClearable
                          menuPortalTarget={document.body}
                          styles={{
                            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                            control: (base) => ({ ...base, minHeight: "42px" }),
                          }}
                        />
                      </Form.Group>
                    </Col>
                  )}

                  {/* 5. Arrival — the package flow's Check-In. Together with
                      Departure it is the Flight Details filter: the backend
                      drops packages with no rate valid for the window and
                      flags those whose itinerary runs longer than it. */}
                  <Col lg={3} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">
                        <FaPlaneDeparture className="me-2" />
                        Arrival (Date &amp; Time){" "}
                        <span className="text-danger">*</span>
                      </Form.Label>
                      <DateTimeApplyPicker
                        value={arrivalDateTime}
                        isInvalid={!!errors.arrivalDateTime}
                        placeholder="Select arrival date & time"
                        rateMap={packageRateMap}
                        rateCurrency="AED"
                        onViewMonthChange={({ year, monthIndex }) =>
                          fetchPackageRatesForMonth(
                            selectedDestination?.countryId,
                            year,
                            monthIndex,
                          )
                        }
                        onApply={(newArrival) => {
                          setArrivalDateTime(newArrival);
                          setErrors((prev) => ({
                            ...prev,
                            arrivalDateTime: null,
                            departureDateTime: null,
                          }));
                          // Auto-fill Departure the same way the native input
                          // path did: next day at the same time when it's
                          // empty or no longer after the new Arrival; leave a
                          // valid later value the user picked themselves.
                          if (newArrival) {
                            const nextDay = addOneDayLocal(newArrival);
                            setDepartureDateTime((prev) => {
                              if (!prev) return nextDay;
                              if (new Date(prev) <= new Date(newArrival))
                                return nextDay;
                              return prev;
                            });
                          }
                        }}
                      />
                      {errors.arrivalDateTime && (
                        <div className="text-danger small mt-1">
                          {errors.arrivalDateTime}
                        </div>
                      )}
                    </Form.Group>
                  </Col>

                  {/* 6. Nights — same position and behaviour as the Nights
                      field on /new-booking/hotel: editing it moves Departure.
                      Disabled until an Arrival is picked (there is nothing to
                      count from). */}
                  <Col lg={2} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">
                        Nights
                      </Form.Label>
                      <Form.Control
                        type="number"
                        min={1}
                        className="form-control-modern"
                        style={{ height: "42px" }}
                        value={nights || ""}
                        disabled={!arrivalDateTime}
                        onChange={(e) => handleNightsChange(e.target.value)}
                      />
                    </Form.Group>
                  </Col>

                  {/* 7. Departure — the package flow's Check-Out. */}
                  <Col lg={3} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">
                        Departure (Date &amp; Time){" "}
                        <span className="text-danger">*</span>
                      </Form.Label>
                      <DateTimeApplyPicker
                        value={departureDateTime}
                        isInvalid={!!errors.departureDateTime}
                        placeholder="Select departure date & time"
                        minDate={
                          arrivalDateTime
                            ? parseLocalDateTime(arrivalDateTime)
                            : undefined
                        }
                        rateMap={packageRateMap}
                        rateCurrency="AED"
                        onViewMonthChange={({ year, monthIndex }) =>
                          fetchPackageRatesForMonth(
                            selectedDestination?.countryId,
                            year,
                            monthIndex,
                          )
                        }
                        onApply={(newDep) => {
                          setDepartureDateTime(newDep);
                          setErrors((prev) => ({
                            ...prev,
                            departureDateTime: null,
                          }));
                        }}
                      />
                      {errors.departureDateTime && (
                        <div className="text-danger small mt-1">
                          {errors.departureDateTime}
                        </div>
                      )}
                    </Form.Group>
                  </Col>

                  {/* 8. Guests — mirrors /new-booking/hotel's selector.
                      A package booking resolves ONE package category for the
                      whole party, so the room count is fixed at 1 and the
                      hotel page's "Add Room" button is deliberately absent.
                      The button label shows guests only (no room count) per
                      product spec; the underlying rooms[] shape is unchanged
                      so the selector, payload and downstream flows behave
                      exactly as before. */}
                  <Col lg={4} md={6}>
                    <Form.Label className="fw-semibold text-dark">
                      Guests
                    </Form.Label>
                    <div className="d-flex flex-wrap gap-2">
                      <Button
                        variant="outline-primary"
                        className="flex-grow-1 text-start rooms-summary-btn-modern"
                        type="button"
                        onClick={() => setRoomsOpen((o) => !o)}
                      >
                        {rooms.reduce((a, r) => a + r.adults, 0)} adults
                        {rooms.reduce((a, r) => a + r.children, 0)
                          ? `, ${rooms.reduce((a, r) => a + r.children, 0)} child`
                          : ""}
                        <span className="float-end">
                          {roomsOpen ? "▴" : "▾"}
                        </span>
                      </Button>
                    </div>
                  </Col>
                </Row>

                {/* Expandable Rooms & Guests selector */}
                {roomsOpen && (
                  <Row className="g-3 mt-2">
                    <Col md={12}>
                      <RoomGuestSelector value={rooms} onChange={setRooms} />
                    </Col>
                  </Row>
                )}

                <div className="d-flex justify-content-center mt-5">
                  <Button
                    type="submit"
                    className="btn-search-modern d-flex align-items-center gap-2"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Spinner animation="border" size="sm" />
                        Searching...
                      </>
                    ) : (
                      <>
                        <FaSearch size={18} />
                        SEARCH PACKAGES
                      </>
                    )}
                  </Button>
                </div>
              </Form>
            </Card.Body>
          </Card>
          )}

          {/* Progress Bar */}
          {progress > 0 && (
            <div className="progress-bar-wrap">
              <div
                className="progress-bar-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {/* Results / Empty State */}
          <div ref={resultsRef}>
          {isLoading || isDefaultLoading ? (
            /* A package-list request is in flight — the default listing on
               page open, or a search. Shown in place of the empty states so
               "No Packages Found" never flashes before the response lands. */
            <Card className="empty-state-card mt-5 text-center py-5">
              <Card.Body>
                <Spinner animation="border" variant="danger" />
                <p className="mt-3 small text-muted mb-0">
                  {isLoading
                    ? "Searching packages..."
                    : "Loading available packages..."}
                </p>
              </Card.Body>
            </Card>
          ) : isDefaultListing && results.length === 0 ? (
            /* Default listing came back empty (or failed) — fall back to the
               original search prompt. */
            <Card className="empty-state-card mt-5 text-center py-5">
              <Card.Body>
                <div className="empty-state-icon">
                  <FaSearch />
                </div>
                <h4 className="fw-bold text-dark mb-2">Ready to Search?</h4>
                <p className="text-muted mx-auto" style={{ maxWidth: "500px" }}>
                  Select an agent, destination, nationality and travel window to
                  discover available travel packages and special offers.
                </p>
              </Card.Body>
            </Card>
          ) : results.length > 0 ? (
            <div className="mt-4">
              {/* Results Header — the default listing is labelled as such,
                  with a pointer to the search form that narrows it. */}
              <div className="d-flex justify-content-between align-items-center gap-2 mb-3">
                <div>
                  <h5 className="fw-bold mb-0 text-dark">
                    {isDefaultListing ? "Available Packages" : "Search Results"}
                  </h5>
                  {isDefaultListing && (
                    <small className="text-muted">
                      Showing all active packages — search above to filter by
                      destination, nationality, travel dates and guests.
                    </small>
                  )}
                </div>
                <span className="text-muted fw-medium">
                  {filteredResults.length}
                  {filteredResults.length !== results.length
                    ? ` of ${results.length}`
                    : ""}{" "}
                  Package{results.length === 1 ? "" : "s"} Found
                </span>
              </div>

              <Row className="g-4">
                {/* ── Left Sidebar — mirrors /new-booking/hotel's sidebar ── */}
                <Col lg={3} className="leftside d-none d-lg-block">
                  <div className="left-fixed">
                    <Card className="shadow-sm rounded-xl filtersection">
                      <Card.Body className="p-2">
                        {/* "Explore On Map" preview — same block as
                            /new-booking/hotel's sidebar (see HotelSearch.jsx:
                            .map-preview-wrapper + .map-overlay-btn). Styles
                            resolve from HotelSearch.css which this page
                            already imports. */}
                        <div className="map-preview-wrapper mb-2">
                          <img
                            src="/images/map.jpg"
                            alt="Map preview"
                            className="map-preview-img"
                          />
                          {ENABLE_MAP_PREVIEW && (
                            <button
                              type="button"
                              className="map-overlay-btn"
                              onClick={() => setShowMapModal(true)}
                            >
                              EXPLORE ON MAP 📍
                            </button>
                          )}
                        </div>

                        {/* Package Name search (↔ Search Hotel Name) */}
                        <Form.Control
                          type="text"
                          placeholder="Search Package Name..."
                          className="ps-3 mb-2"
                          value={packageSearchTerm}
                          onChange={(e) =>
                            setPackageSearchTerm(e.target.value)
                          }
                        />

                        <hr />

                        {/* Package Type (↔ Hotel Type) */}
                        <Form.Group className="mb-2">
                          <Form.Label className="fw-semibold small">
                            Package Type
                          </Form.Label>
                          <div className="filter-checkbox-list">
                            {packageTypeOptions.length === 0 ? (
                              <div className="text-muted small px-1">
                                No types available
                              </div>
                            ) : (
                              packageTypeOptions.map((item) => (
                                <Form.Check
                                  key={item.value}
                                  type="checkbox"
                                  id={`pkg-type-${item.value}`}
                                  label={item.label}
                                  checked={packageTypeFilter.some(
                                    (t) => t.value === item.value,
                                  )}
                                  onChange={(e) => {
                                    if (e.target.checked)
                                      setPackageTypeFilter([
                                        ...packageTypeFilter,
                                        item,
                                      ]);
                                    else
                                      setPackageTypeFilter(
                                        packageTypeFilter.filter(
                                          (t) => t.value !== item.value,
                                        ),
                                      );
                                  }}
                                />
                              ))
                            )}
                          </div>
                        </Form.Group>

                        <hr />

                        {/* Package Category (↔ Channel) */}
                        <Form.Group className="mb-2">
                          <Form.Label className="fw-semibold small">
                            Package Category
                          </Form.Label>
                          <div className="filter-checkbox-list">
                            {packageCategoryOptions.length === 0 ? (
                              <div className="text-muted small px-1">
                                No categories available
                              </div>
                            ) : (
                              packageCategoryOptions.map((item) => (
                                <Form.Check
                                  key={item.value}
                                  type="checkbox"
                                  id={`pkg-cat-${item.value}`}
                                  label={item.label}
                                  checked={packageCategoryFilter.some(
                                    (c) => c.value === item.value,
                                  )}
                                  onChange={(e) => {
                                    if (e.target.checked)
                                      setPackageCategoryFilter([
                                        ...packageCategoryFilter,
                                        item,
                                      ]);
                                    else
                                      setPackageCategoryFilter(
                                        packageCategoryFilter.filter(
                                          (c) => c.value !== item.value,
                                        ),
                                      );
                                  }}
                                />
                              ))
                            )}
                          </div>
                        </Form.Group>

                        <hr />

                        {/* Package Includes (↔ Available Deals) */}
                        <Form.Group>
                          <Form.Label className="fw-semibold small d-flex justify-content-between align-items-center">
                            <span>Package Includes</span>
                            {packageIncludesFilter.length > 0 && (
                              <span
                                role="button"
                                className="text-primary small"
                                style={{
                                  cursor: "pointer",
                                  fontWeight: 500,
                                }}
                                onClick={() => setPackageIncludesFilter([])}
                              >
                                Clear
                              </span>
                            )}
                          </Form.Label>
                          <div className="filter-checkbox-list">
                            {packageIncludesOptions.map((item) => (
                              <Form.Check
                                key={item.value}
                                type="checkbox"
                                id={`pkg-inc-${item.value}`}
                                label={item.label}
                                checked={packageIncludesFilter.some(
                                  (i) => i.value === item.value,
                                )}
                                onChange={(e) => {
                                  if (e.target.checked)
                                    setPackageIncludesFilter([
                                      ...packageIncludesFilter,
                                      item,
                                    ]);
                                  else
                                    setPackageIncludesFilter(
                                      packageIncludesFilter.filter(
                                        (i) => i.value !== item.value,
                                      ),
                                    );
                                }}
                              />
                            ))}
                          </div>
                        </Form.Group>
                      </Card.Body>
                    </Card>
                  </div>
                </Col>

                {/* ── Right Content — top sort bar + package cards ── */}
                <Col lg={9}>
                  <Card className="shadow-sm rounded-xl mb-3 filtersection">
                    <Card.Body className="p-2">
                      <div className="d-flex align-items-center gap-3 flex-wrap">
                        {/* Duration dropdown (↔ All Stars) */}
                        <Select
                          options={durationOptions}
                          value={durationFilter}
                          onChange={setDurationFilter}
                          placeholder="All Durations"
                          isClearable
                          className="modern-select-sm"
                          menuPortalTarget={document.body}
                          styles={{
                            /* No left margin — the strip's `gap-3` on the
                               parent already spaces the dropdown from the sort
                               pills, so the extra 30px port from the hotel
                               page's "All Stars" would push it away from the
                               card's left edge with nothing filling the gap. */
                            control: (base) => ({
                              ...base,
                              height: "36px",
                              minHeight: "36px",
                              width: "180px",
                              background: "#ffffff",
                              color: "#000000",
                            }),
                            menuPortal: (base) => ({
                              ...base,
                              zIndex: 9999,
                            }),
                            menu: (base) => ({ ...base, zIndex: 9999 }),
                          }}
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
                          onClick={clearResultFilters}
                        >
                          Clear
                        </Button>
                      </div>
                    </Card.Body>
                  </Card>

                  {/* Card Grid — narrowed to filteredResults. When filters
                      strip every card, show an inline "no matches" panel
                      instead of the top-level empty state so the sidebar
                      stays on screen and the operator can loosen filters. */}
                  {filteredResults.length > 0 ? (
                    <Row className="g-3">
                      {filteredResults.map((pkg) => (
                        /* Full-width row per package, mirroring the vertical
                           list layout on /new-booking/hotel (HotelSearch.jsx
                           uses <Col xs={12}> per hotel with an internal
                           <Col md={4}> image + <Col md={8}> body split). */
                        <Col key={pkg.packageId} xs={12}>
                          <div className="result-card-wrap">
                            <Card className="result-card border-0">
                              <Row className="g-0">
                                {/* Image — left third on md+, stacks on top on
                                    xs/sm. .package-image-wrap--row (see
                                    PackageSearch.css) fills the card height and
                                    switches corner-rounding responsively. */}
                                <Col md={4}>
                                  <div className="package-image-wrap package-image-wrap--row">
                                    <img
                                      src={
                                        getImageUrl(pkg.packageImage) ||
                                        "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=800&q=80"
                                      }
                                      alt={pkg.packageName}
                                      className="package-image"
                                      onError={(e) => {
                                        e.target.onerror = null;
                                        e.target.src =
                                          "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=800&q=80";
                                      }}
                                    />
                                    {/* <div className="duration-badge">
                                      <FaClock className="me-1 mb-1" size={11} />
                                      {pkg.duration} Night(s)
                                    </div> */}
                                  </div>
                                </Col>

                                {/* Body — right two-thirds on md+. */}
                                <Col md={8}>
                                  <Card.Body className="d-flex flex-column p-3 h-100">
                                    <span className="package-type-tag">
                                      {pkg.packageType}
                                    </span>
                                    <h6 className="package-name">
                                      {pkg.packageName}
                                    </h6>
                                    <p
                                      className="text-muted mb-3"
                                      style={{ fontSize: "0.78rem" }}
                                    >
                                      {pkg.packageCategory}
                                    </p>

                                    {/* Flight Details filter warning — shown when
                                        the package itinerary is longer than the
                                        selected arrival→departure window. */}
                                    {pkg.exceedsTravelWindow && (
                                      <div
                                        className="pkg-window-warning"
                                        role="note"
                                      >
                                        <FaExclamationTriangle
                                          className="pkg-window-warning-icon"
                                          aria-hidden="true"
                                        />
                                        <span>{pkg.travelWindowWarning}</span>
                                      </div>
                                    )}

                                    {/* Actions cluster — the price/base-rate line was
                                        removed per client ask; the card just shows
                                        View + Book on the right now. */}
                                    <div className="price-box d-flex flex-wrap justify-content-end align-items-center gap-2 mt-auto">
                                      <div className="package-actions d-flex align-items-center gap-2">
                                        <Button
                                          variant="outline-success"
                                          size="sm"
                                          className="pkg-view-btn"
                                          title="View package details"
                                          aria-label="View package details"
                                          onClick={() => handleView(pkg)}
                                        >
                                         View
                                        </Button>
                                        <Button
                                          variant="primary"
                                          size="sm"
                                          className="pkg-book-btn rounded-pill fw-bold"
                                          onClick={() =>
                                            isDefaultListing
                                              ? handleBookFromDefaultList()
                                              : handleBookNow(pkg)
                                          }
                                        >
                                         Book
                                        </Button>
                                      </div>
                                    </div>
                                  </Card.Body>
                                </Col>
                              </Row>
                            </Card>
                          </div>
                        </Col>
                      ))}
                    </Row>
                  ) : (
                    <Card className="empty-state-card text-center py-4">
                      <Card.Body>
                        <div className="empty-state-icon text-muted opacity-50">
                          <FaSearch />
                        </div>
                        <h6 className="fw-bold text-dark mb-2">
                          No packages match the selected filters
                        </h6>
                        <p
                          className="text-muted mx-auto small mb-3"
                          style={{ maxWidth: "420px" }}
                        >
                          Try removing a package type, category or include —
                          or clear the sidebar filters.
                        </p>
                        <Button
                          variant="outline-primary"
                          className="rounded-pill"
                          size="sm"
                          onClick={clearResultFilters}
                        >
                          Clear Filters
                        </Button>
                      </Card.Body>
                    </Card>
                  )}
                </Col>
              </Row>
            </div>
          ) : (
            <Card className="empty-state-card mt-5 text-center py-5">
              <Card.Body>
                <div className="empty-state-icon text-muted opacity-50">
                  <FaSearch />
                </div>
                <h4 className="fw-bold text-dark mb-2">No Packages Found</h4>
                <p className="text-muted mx-auto" style={{ maxWidth: "500px" }}>
                  We couldn't find any packages matching your selection. Try
                  adjusting your destination, nationality or travel window.
                </p>
                <Button
                  variant="outline-primary"
                  className="mt-3 rounded-pill"
                  onClick={() => {
                    setHasSearched(false);
                    setResults([]);
                    // Back to the default listing the page opens with.
                    loadDefaultPackages();
                  }}
                >
                  Clear Search
                </Button>
              </Card.Body>
            </Card>
          )}
          </div>
        </main>
      </div>
      {/* Package Detail Modal */}
      <Modal
        show={showDetailModal}
        onHide={() => setShowDetailModal(false)}
        size="lg"
        centered
        scrollable
        className="package-detail-modal"
      >
        <Modal.Header closeButton className="detail-modal-header">
          <Modal.Title className="detail-modal-title">
            {isDetailLoading
              ? "Loading package details..."
              : selectedPackage?.packageName || "Package Details"}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-0 detail-modal-body">
          {isDetailLoading ? (
            <div className="text-center py-5">
              <Spinner animation="border" variant="danger" />
              <p className="mt-3 small text-muted mb-0">
                Fetching package details...
              </p>
            </div>
          ) : selectedPackage ? (
            <div className="modal-content-inner">
              {/* ─── Hero ─────────────────────────────────────────── */}
              <div className="detail-hero-image-container">
                <img
                  src={
                    getImageUrl(selectedPackage.packageImage) ||
                    "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1200&q=80"
                  }
                  alt={selectedPackage.packageName}
                  className="detail-hero-image"
                  onError={(e) => {
                    e.target.src =
                      "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1200&q=80";
                  }}
                />
                <div className="detail-hero-overlay">
                  <div className="detail-hero-text">
                    <span className="detail-hero-type">
                      {selectedPackage.packageTypeName || "Travel Package"}
                    </span>
                    <h4 className="detail-hero-name">
                      {selectedPackage.packageName}
                    </h4>
                    <div className="detail-hero-meta">
                      {selectedPackage.arriveCountryName && (
                        <span>
                          <FaMapMarkerAlt className="me-1" size={11} />
                          {selectedPackage.arriveCountryName}
                        </span>
                      )}
                      {selectedPackage.noOfNights != null && (
                        <span>
                          <FaClock className="me-1" size={11} />
                          {selectedPackage.noOfNights} Night(s)
                        </span>
                      )}
                      {selectedPackage.packageCode && (
                        <span>
                          <FaTag className="me-1" size={11} />
                          {selectedPackage.packageCode}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="detail-body-content p-3">
                {/* ─── Highlight Strip ───────────────────────────── */}
                <div className="highlight-strip">
                  {/* <div className="highlight-item">
                    <FaMoneyBillWave className="highlight-icon" />
                    <div>
                      <div className="highlight-label">Basic Rate</div>
                      <div className="highlight-value">
                        {selectedPackage.currencyName
                          ? `${selectedPackage.currencyName} `
                          : ""}
                        {selectedPackage.packageBasicRate ?? "-"}
                      </div>
                    </div>
                  </div> */}
                  <div className="highlight-item">
                    <FaClock className="highlight-icon" />
                    <div>
                      <div className="highlight-label">Duration</div>
                      <div className="highlight-value">
                        {selectedPackage.noOfNights ?? "-"} Night(s)
                      </div>
                    </div>
                  </div>
                  <div className="highlight-item">
                    <FaCheckCircle className="highlight-icon" />
                    <div>
                      <div className="highlight-label">Status</div>
                      <div
                        className={`highlight-value ${
                          selectedPackage.liveStatus
                            ? "text-success"
                            : "text-muted"
                        }`}
                      >
                        {selectedPackage.liveStatus ? "Active" : "Inactive"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ─── Includes Chips ────────────────────────────── */}
                <div className="includes-row">
                  <span
                    className={`include-chip ${
                      selectedPackage.containHotel === 1 ? "active" : ""
                    }`}
                  >
                    <FaHotel className="me-1" /> Hotel
                  </span>
                  <span
                    className={`include-chip ${
                      selectedPackage.containCab === 1 ? "active" : ""
                    }`}
                  >
                    <FaCar className="me-1" /> Transfers
                  </span>
                  <span
                    className={`include-chip ${
                      selectedPackage.containActivity === 1 ? "active" : ""
                    }`}
                  >
                    <FaHiking className="me-1" /> Tours
                  </span>
                </div>

                {/* ─── Basic Details ─────────────────────────────── */}
                <section className="detail-section">
                  <h6 className="section-title">
                    <FaInfoCircle className="me-2 text-danger" />
                    Basic Information
                  </h6>
                  <div className="details-grid-card">
                    <Row className="g-3">
                      <Col md={6}>
                        <div className="info-row">
                          <span className="info-label">Package Code</span>
                          <span className="info-value">
                            {selectedPackage.packageCode || "-"}
                          </span>
                        </div>
                        <div className="info-row">
                          <span className="info-label">Package Type</span>
                          <span className="info-value">
                            {selectedPackage.packageTypeName || "-"}
                          </span>
                        </div>
                        {/* <div className="info-row">
                          <span className="info-label">Currency</span>
                          <span className="info-value">
                            {selectedPackage.currencyName || "-"}
                          </span>
                        </div> */}
                      </Col>
                      <Col md={6}>
                        <div className="info-row">
                          <span className="info-label">Arrive Country</span>
                          <span className="info-value">
                            {selectedPackage.arriveCountryName || "-"}
                          </span>
                        </div>
                        <div className="info-row">
                          <span className="info-label">Arrive Places</span>
                          <span className="info-value">
                            {selectedPackage.arrivePlaces &&
                            selectedPackage.arrivePlaces.length > 0
                              ? selectedPackage.arrivePlaces
                                  .map((p) => p.name)
                                  .filter(Boolean)
                                  .join(", ") || "-"
                              : "-"}
                          </span>
                        </div>
                        <div className="info-row">
                          <span className="info-label">Categories</span>
                          <span className="info-value">
                            {selectedMatchedCategory
                              ? selectedMatchedCategory
                              : selectedPackage.packageCategories &&
                                selectedPackage.packageCategories.length > 0
                              ? selectedPackage.packageCategories
                                  .map((c) => c.name)
                                  .filter(Boolean)
                                  .join(", ") || "-"
                              : "-"}
                          </span>
                        </div>
                      </Col>
                    </Row>
                  </div>
                </section>

                {/* ─── Overview ──────────────────────────────────── */}
                {selectedPackage.overview && (
                  <section className="detail-section">
                    <h6 className="section-title">
                      <FaClipboardList className="me-2 text-danger" />
                      Overview
                    </h6>
                    <div className="overview-card">
                      {selectedPackage.overview}
                    </div>
                  </section>
                )}

                {/* ─── Itinerary ─────────────────────────────────── */}
                <section className="detail-section">
                  <h6 className="section-title">
                    <FaCalendarAlt className="me-2 text-danger" />
                    Itinerary
                  </h6>
                  <div className="itinerary-container">
                    {selectedPackage.itineraries &&
                    selectedPackage.itineraries.length > 0 ? (
                      [...selectedPackage.itineraries]
                        .sort((a, b) => a.day - b.day)
                        .map((item, idx, arr) => (
                          <div key={idx} className="timeline-item">
                            {idx !== arr.length - 1 && (
                              <div className="timeline-line"></div>
                            )}
                            <div className="timeline-dot">
                              <div className="dot-inner">{item.day}</div>
                            </div>
                            <div className="timeline-card">
                              <div className="timeline-heading">
                                {item.heading || `Day ${item.day}`}
                              </div>
                              {item.placeName && (
                                <div className="timeline-place">
                                  <FaMapMarkerAlt
                                    className="me-1"
                                    size={10}
                                  />
                                  {item.placeName}
                                </div>
                              )}
                              {item.dayActivities && (
                                <div className="timeline-text">
                                  {item.dayActivities}
                                </div>
                              )}
                              {item.packageItinearyImage && (
                                <img
                                  src={getImageUrl(item.packageItinearyImage)}
                                  alt={`Day ${item.day}`}
                                  className="timeline-image"
                                  onError={(e) => {
                                    e.target.style.display = "none";
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        ))
                    ) : (
                      <div className="small text-muted fst-italic">
                        No itinerary available.
                      </div>
                    )}
                  </div>
                </section>

                {/* ─── Inclusions / Exclusions ───────────────────── */}
                <Row className="g-3">
                  <Col md={6}>
                    <section className="detail-section h-100">
                      <h6 className="section-title">
                        <FaCheckCircle className="me-2 text-success" />
                        Inclusions
                      </h6>
                      <div className="list-card">
                        {selectedPackage.inclusions &&
                        selectedPackage.inclusions.length > 0 ? (
                          <ul className="detail-list">
                            {selectedPackage.inclusions.map((i) => (
                              <li key={i.otherId}>
                                <FaCheckCircle
                                  className="me-2 text-success"
                                  size={11}
                                />
                                {i.description}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="small text-muted fst-italic">
                            No inclusions.
                          </span>
                        )}
                      </div>
                    </section>
                  </Col>
                  <Col md={6}>
                    <section className="detail-section h-100">
                      <h6 className="section-title">
                        <FaTimesCircle className="me-2 text-danger" />
                        Exclusions
                      </h6>
                      <div className="list-card">
                        {selectedPackage.exclusions &&
                        selectedPackage.exclusions.length > 0 ? (
                          <ul className="detail-list">
                            {selectedPackage.exclusions.map((i) => (
                              <li key={i.otherId}>
                                <FaTimesCircle
                                  className="me-2 text-danger"
                                  size={11}
                                />
                                {i.description}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="small text-muted fst-italic">
                            No exclusions.
                          </span>
                        )}
                      </div>
                    </section>
                  </Col>
                </Row>

                {/* ─── Terms & Conditions ────────────────────────── */}
                <section className="detail-section">
                  <h6 className="section-title">
                    <FaFileContract className="me-2 text-danger" />
                    Terms & Conditions
                  </h6>
                  <div className="list-card">
                    {selectedPackage.termsAndConditions &&
                    selectedPackage.termsAndConditions.length > 0 ? (
                      <ul className="detail-list">
                        {selectedPackage.termsAndConditions.map((i) => (
                          <li key={i.otherId}>
                            <FaInfoCircle
                              className="me-2 text-secondary"
                              size={11}
                            />
                            {i.description}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="small text-muted fst-italic">
                        No terms and conditions.
                      </span>
                    )}
                  </div>
                </section>
              </div>
            </div>
          ) : null}
        </Modal.Body>
        <Modal.Footer className="detail-modal-footer">
          <Button
            variant="outline-secondary"
            size="sm"
            className="px-3 rounded-pill"
            onClick={() => setShowDetailModal(false)}
          >
            Close
          </Button>
          {/* {selectedPackage?.packageId && (
            <Button
              variant="danger"
              size="sm"
              className="px-3 rounded-pill fw-bold"
              onClick={() => {
                setShowDetailModal(false);
                const orig = results.find(
                  (r) => r.packageId === selectedPackage.packageId,
                );
                handleBookNow(
                  orig || {
                    packageId: selectedPackage.packageId,
                    rate: selectedPackage.packageBasicRate,
                    rateType: "Per Person",
                    currencyCode: selectedPackage.currencyName || "AED",
                  },
                );
              }}
            >
              Book Now
            </Button>
          )} */}
        </Modal.Footer>
      </Modal>

      {/* Shared "Explore on Map" modal — one pin per currently-filtered
          package, approximated from arrivePlace/arriveCountryName (see
          mapMarkers above). Falls back to MapModal's built-in "location
          currently unavailable" state when no package resolves to a known
          place/country. */}
      {ENABLE_MAP_PREVIEW && (
        <MapModal
          show={showMapModal}
          onHide={() => setShowMapModal(false)}
          markers={mapMarkers}
          title="Explore on Map"
        />
      )}
    </div>
  );
};

export default PackageSearch;
