import React, { useEffect, useRef, useState } from "react";
import {
  Card,
  Button,
  Row,
  Col,
  Form,
  Spinner,
  Badge,
} from "react-bootstrap";
import { FaSearch, FaStar } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import Select from "react-select";
import AgentSelect from "../../../components/AgentSelect";
import Sidebar from "../../../components/Sidebar";
import TopBar from "../../../components/TopBar";
import axiosInstance from "../../../components/AxiosInstance";
import { logAgentSearch } from "../../../utils/agentSearchLog";
import AdvertisementCarousel from "../../../components/AdvertisementCarousel";
import AgentCreditBalance from "../../../components/AgentCreditBalance";
import DateInput from "../../../components/DateInput";
import "../../../styles/HotelSearch.css";

// ─────────────────────────────────────────────
// Counter — same +/- counter as HotelSearch.jsx.
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
// RoomGuestSelector — copied from HotelSearch.jsx so the Day Stay
// search exposes the same per-room adults / children / child-ages
// editor instead of the three separate top-level dropdowns it used
// before. Aggregate totals are derived in the page component for the
// existing search payload + price-row display.
// ─────────────────────────────────────────────
// Maximum number of rooms allowed per booking (matches HotelSearch).
const MAX_ROOMS = 5;

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

/**
 * DayStaySearch — modelled after HotelSearch.jsx but for the Day Stay flow.
 *
 *  - Search criteria includes a date + time check-in (datetime-local) and a
 *    time check-out.
 *  - Validation on all required fields.
 *  - Destination and Agent dropdowns are loaded from the same APIs as
 *    HotelSearch (/api/province, /api/agent).
 *  - When an agent is selected the available credit balance is shown
 *    in red (matching HotelSearch behaviour).
 *  - On submit calls POST /api/day-stay-booking/search and pages over results.
 */
export default function DayStaySearch() {
  const navigate = useNavigate();

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

  // Logged-in agent's name — for agent logins the booking is done by the
  // agent themselves, so the "Booking Done By Employee" picker is hidden and
  // this name is shown instead. Empty for admin/staff.
  const loggedInAgentName =
    localStorage.getItem("UserName") ||
    sessionStorage.getItem("UserName") ||
    "";

  const [nationalityList, setNationalityList] = useState([]);
  const [selectedNationality, setSelectedNationality] = useState(null);
  // Optional "Booking Done By Employee" — mirrors HotelSearch / LongStay.
  // employeeId flows on the payload → DayStayRoomList → DayStayBookingPage
  // create payload, so the backend can stamp the employee relation.
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
  const [agents, setAgents] = useState([]);
  const [agent, setAgent] = useState("");
  const [agentBalance, setAgentBalance] = useState(null);
  const [agentBalanceLoading, setAgentBalanceLoading] = useState(false);

  const [checkInDate, setCheckInDate] = useState("");
  // Day Stay no longer asks the agent for a specific check-in / out
  // time. We always send a full-day range (00:00 → 23:59) so the
  // backend returns every hotel that has a day-stay contract for the
  // picked date, regardless of its hourly window. The View Rooms
  // button still picks up each contract's own checkInStartTime /
  // checkInEndTime when launching the room list.
  const [checkInTime] = useState("00:00");
  const [checkOutTime] = useState("23:59");
  // ── Rooms & Guests — array-of-rooms model, mirrors HotelSearch.jsx.
  //
  // Each room carries its own adults / children / per-child ages. The
  // existing `/api/day-stay-booking/search` endpoint still expects
  // single aggregate numbers (adults, children, rooms), so we derive
  // totals just before sending the payload — the backend contract is
  // unchanged.
  const [rooms, setRooms] = useState([{ adults: 1, children: 0, childAges: [] }]);
  const [roomsOpen, setRoomsOpen] = useState(false);

  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isDestinationLoading, setIsDestinationLoading] = useState(false);
  const [isNationalityLoading, setIsNationalityLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  // When results are on screen the big search form collapses into a sticky
  // summary strip. Clicking "Modify Search" flips this true to re-expand it.
  const [isEditingSearch, setIsEditingSearch] = useState(false);
  const [results, setResults] = useState([]);
  const [clickedHotelIds, setClickedHotelIds] = useState([]);
  const resultsRef = useRef(null);

  // Result sort / star-rating filter — mirrors HotelSearch's "sort-pill"
  // + starRating select, styled through the shared HotelSearch.css
  // classes. Defaults to price ascending (Low → High). "Clear" resets
  // both back to their initial values.
  const [sortBy, setSortBy] = useState("priceAsc");
  const [starRating, setStarRating] = useState(null);
  const starOptions = [
    { value: 5, label: "5 Stars" },
    { value: 4, label: "4 Stars" },
    { value: 3, label: "3 Stars" },
    { value: 2, label: "2 Stars" },
    { value: 1, label: "1 Star" },
  ];

  // Left-sidebar filters — Hotel Name text search + Hotel Type checkbox
  // list. Both match on the hotel entries returned by /day-stay-hotels
  // (client-side; the search endpoint itself is untouched).
  const [hotelSearchTerm, setHotelSearchTerm] = useState("");
  const [hotelType, setHotelType] = useState([]);
  const hotelTypeOptions = [
    { value: "hotel", label: "Hotel" },
    { value: "villa", label: "Villa" },
    { value: "resort", label: "Resort" },
    { value: "apartment", label: "Apartment" },
  ];

  // Channel filter — mirrors HotelSearch. DayStay currently only exposes
  // Inhouse contracts, but the checkbox pattern matches Hotel so future
  // supplier channels drop in.
  const [channelType, setChannelType] = useState([]);
  const channelTypeOptions = [
    { value: "inhouse", label: "Inhouse" },
  ];

  // Display currency + rate-conversion helpers. Rates come back from the
  // search endpoint quoted in AED; the conversion here is purely
  // display-only. Admins/SuperAdmins see the dropdown and can switch;
  // agent logins are locked to their configured currency (auto-loaded
  // from /api/agent/{id}, same as HotelSearch).
  const [currencyOptions, setCurrencyOptions] = useState([]);
  const [selectedCurrency, setSelectedCurrency] = useState(null);
  const currencyTouchedRef = useRef(false);
  const [selfAgentId, setSelfAgentId] = useState(null);

  const mapCurrencyOptions = (list) =>
    (Array.isArray(list) ? list : [])
      .filter((c) => c && c.currencyCode)
      .map((c) => ({
        value: c.currencyId,
        label: c.currencyCode,
        code: c.currencyCode,
        rate: Number(c.value),
      }));

  const fetchCurrencies = async (search = "") => {
    const q = search ? `&search=${encodeURIComponent(search)}` : "";
    const res = await axiosInstance.get(`/api/currency?page=0${q}`);
    return mapCurrencyOptions(res.data);
  };

  const debouncedCurrencySearch = useRef(
    debounce(async (search) => {
      try {
        setCurrencyOptions(await fetchCurrencies(search));
      } catch (err) {
        console.warn("currency search failed (non-fatal):", err);
      }
    }, 300),
  ).current;

  // Load the currency list once + default to AED.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const options = await fetchCurrencies("");
        if (cancelled) return;
        setCurrencyOptions(options);
        const aed = options.find((o) => o.code === "AED");
        setSelectedCurrency(aed || options[0] || null);
      } catch (err) {
        console.warn("currency list fetch failed (non-fatal):", err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Agent-login self-id resolution — used to look up their default
  // currency below. Mirrors HotelSearch line-for-line.
  useEffect(() => {
    if (!isAgentRole) return;
    const cached = localStorage.getItem("userId");
    if (cached) {
      setSelfAgentId(cached);
      return;
    }
    const userName =
      localStorage.getItem("UserName") || sessionStorage.getItem("UserName");
    if (!userName) return;
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

  // Default the display currency to the agent's configured currency.
  // Admin: uses the picked agent id; Agent login: uses selfAgentId.
  // Stops once the operator changes the currency manually.
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
    return () => {
      cancelled = true;
    };
  }, [currencyAgentId, currencyOptions]);

  // AED is the base the search rates arrive in. Normalise against its
  // stored value so AED→AED is always ×1 regardless of how the master
  // row is configured. Falls back to 1 until the list loads.
  const aedBaseRate = (() => {
    const aed = currencyOptions.find((o) => o.code === "AED");
    return aed && Number.isFinite(aed.rate) && aed.rate > 0 ? aed.rate : 1;
  })();

  const displayCurrencyCode = selectedCurrency?.code || "AED";

  const convertFromAed = (aedPrice) => {
    if (aedPrice == null) return aedPrice;
    // master_currency.value stores "AED per 1 unit of target", so AED → target
    // is `aed / value`, not `aed * value`. AED itself has value 1 (aedBaseRate)
    // and short-circuits when the picker sits on it.
    const targetRate =
      selectedCurrency && Number.isFinite(selectedCurrency.rate) && selectedCurrency.rate > 0
        ? selectedCurrency.rate
        : aedBaseRate;
    return Number(aedPrice) * (aedBaseRate / targetRate);
  };

  // Reuse the HotelSearch debounce helper.
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
        const response = await axiosInstance.get(
          `/api/province?search=${searchText}`
        );
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

  const debouncedCountrySearch = useRef(
    debounce(async (search) => {
      try {
        setIsNationalityLoading(true);
        const response = await axiosInstance.get(
          `/api/country?search=${search}`
        );
        const options = Array.isArray(response.data)
          ? response.data.map((country) => ({
              value: country.id,
              label: country.name,
              code: country.countryCode,
            }))
          : [];
        setNationalityList(options);
      } catch {
        setNationalityList([]);
      } finally {
        setIsNationalityLoading(false);
      }
    }, 300)
  ).current;

  const loadInitialCountries = async () => {
    try {
      setIsNationalityLoading(true);
      const res = await axiosInstance.get("/api/country?limit=50");
      const opts = Array.isArray(res.data)
        ? res.data.map((c) => ({
            value: c.id,
            label: c.name,
            code: c.countryCode,
          }))
        : [];
      setNationalityList(opts);
    } catch {
      setNationalityList([]);
    } finally {
      setIsNationalityLoading(false);
    }
  };

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
      // silently fail
    } finally {
      setIsDestinationLoading(false);
    }
  };

  const loadAgents = async () => {
    try {
      const res = await axiosInstance.get("/api/agent?activeOnly=true");
      setAgents(res.data || []);
    } catch {
      setAgents([]);
    }
  };

  useEffect(() => {
    loadInitialCountries();
    loadAgents();
  }, []);

  // Agent credit balance lookup — same endpoint as HotelSearch.
  useEffect(() => {
    if (!agent) {
      setAgentBalance(null);
      return;
    }
    let cancelled = false;
    setAgentBalanceLoading(true);
    axiosInstance
      .get(`/api/agent-credit-limit/agent/${agent}`)
      .then((res) => {
        if (!cancelled)
          setAgentBalance(res?.data?.availableCreditLimit ?? null);
      })
      .catch(() => {
        if (!cancelled) setAgentBalance(null);
      })
      .finally(() => {
        if (!cancelled) setAgentBalanceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agent]);

  // Keep childAges length in lock-step with the children count.
  // (Removed) The previous `childAges` sync useEffect is gone —
  // RoomGuestSelector now manages per-room child ages inside the
  // `rooms` array, so the top-level useEffect is unnecessary.
  //
  // (Removed) Default check-out time auto-fill — time is no longer
  // captured on this page. The full-day range is sent as-is.

  const clearError = (field) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const { [field]: _omit, ...rest } = prev;
      return rest;
    });
  };

  // ── Aggregate guest counts derived from the rooms array. Kept as a
  //    plain computation (no useMemo) so we don't add stale-closure
  //    hazards — the array is small. Used by the search payload, the
  //    result-card price math, the "1 adult · 1 room" summary, and the
  //    payload that opens the day-stay room list.
  const totalAdults = rooms.reduce((a, r) => a + (Number(r.adults) || 0), 0);
  const totalChildren = rooms.reduce((a, r) => a + (Number(r.children) || 0), 0);
  const totalRooms = rooms.length;
  const flatChildAges = rooms.flatMap((r) => r.childAges || []);

  const validate = () => {
    const e = {};
    if (!selectedNationality) e.nationality = "Nationality is required";
    if (!selectedDestination) e.destination = "Destination is required";
    if (!checkInDate) e.checkInDate = "Check-in date is required";
    // Time-window validation removed — Day Stay search returns every
    // hotel with a contract for the date, regardless of hourly window.
    if (!isAgentRole && !agent) e.agent = "Agent is required";
    if (totalAdults < 1) e.adults = "At least one adult required";
    return e;
  };

  const handleSearch = async (ev) => {
    ev.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setIsLoading(true);
    setHasSearched(true);
    setIsEditingSearch(false);
    setResults([]);
    try {
      // checkInTime / checkOutTime intentionally omitted — Day Stay
      // search now lists every hotel with a contract for the picked
      // date regardless of hourly window. Sending the full-day range
      // 00:00–23:59 still excluded hotels whose contract window was
      // narrower (e.g. 09:00–17:00) because the backend compared the
      // request times against the contract window. Omitting the fields
      // tells the backend "no time filter".
      const payload = {
        destinationCityId: selectedDestination?.value || null,
        agentId: Number(agent),
        nationalityCode: selectedNationality?.code || null,
        checkInDate,
        // Backend still consumes single numbers — derive from rooms[].
        adults: totalAdults,
        children: totalChildren,
        rooms: totalRooms,
      };
      // Agent search log (Unbooked Opportunities → Searches tab) — day-stay
      // is single-day, so checkOut mirrors checkInDate. Fire-and-forget.
      logAgentSearch({
        agentId: Number(agent) || null,
        agentName: loggedInAgentName,
        destinationId: selectedDestination?.value,
        destinationLabel: selectedDestination?.label,
        nationalityLabel: selectedNationality?.label,
        checkIn: checkInDate,
        checkOut: checkInDate,
        rooms: Array.from({ length: totalRooms || 1 }, () => ({
          adults: totalAdults,
          children: totalChildren,
        })),
        source: "day-stay",
      });

      const res = await axiosInstance.post(
        "/api/day-stay-booking/search",
        payload
      );
      setResults(Array.isArray(res.data) ? res.data : []);
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 0);
    } catch (err) {
      console.error(err);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  // Results are on screen once a search has run. Collapse the full form into
  // the sticky summary strip then, unless the user chose to modify the search.
  const collapseSearch = hasSearched && !isEditingSearch;

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4 hs-page">
          {/* ── Results-page heading ──
              Shown once the search has actually finished (not just on
              click), above the search summary / form. Matches the heading
              on /new-booking/hotel. */}
          {hasSearched && !isLoading && (
            <div className="hs-page-heading">
              <h3 className="hs-page-heading-title">Day Stay</h3>
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
                {checkInDate && (
                  <span className="hs-summary-chip">{checkInDate}</span>
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
          <Card className="shadow-sm rounded-xl mb-4 search-card-modern bg-white">
            <Card.Body className="p-4">
              <div className="mb-4 text-start d-flex justify-content-between align-items-start flex-wrap gap-2">
                <div>
                  <h2 className="fw-semibold text-primary mb-1">
                    Day Stay Booking
                  </h2>
                  <p className="text-muted">
                    Book a hotel for a few hours within the hotel's daily
                    day-stay window.
                  </p>
                </div>
                {/* Agent logins see their available credit balance at the
                    right end of the heading row (renders nothing for other
                    roles). */}
                <AgentCreditBalance />
              </div>

              <Form onSubmit={handleSearch} noValidate>
                {/* Field order mirrors /new-booking/hotel (HotelSearch.jsx):
                      1. Agent  2. Destination / City  3. Nationality
                      4. Check-In  5. Rooms & Guests
                    (Day Stay is single-day so Nights / Check-Out are
                    intentionally absent.) The Adults / Children / Rooms
                    trio + Child Ages row are replaced with one
                    "Rooms & Guests" button + collapsible
                    RoomGuestSelector, identical to HotelSearch's
                    pattern. */}
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
                        value={agent}
                        isInvalid={!!errors.agent}
                        onChange={(v) => {
                          setAgent(v);
                          if (v) clearError("agent");
                        }}
                      />
                      {errors.agent && (
                        <div className="text-danger small mt-1">
                          {errors.agent}
                        </div>
                      )}
                      {agent && (
                        <div className="mt-1 small">
                          {agentBalanceLoading ? (
                            <span className="text-muted">
                              Loading available balance…
                            </span>
                          ) : agentBalance != null ? (
                            <span
                              className="fw-semibold"
                              style={{ color: "#dc3545" }}
                            >
                              Available Balance:{" "}
                              {Number(agentBalance).toFixed(2)} AED
                            </span>
                          ) : (
                            <span className="text-muted">
                              Available balance unavailable
                            </span>
                          )}
                        </div>
                      )}
                    </Form.Group>
                  </Col>
                  )}

                  {/* 2. Destination / City */}
                  <Col lg={4} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">
                        Destination
                      </Form.Label>
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
                        isLoading={isDestinationLoading}
                        noOptionsMessage={() =>
                          isDestinationLoading
                            ? "Searching destinations..."
                            : "Type to search destinations..."
                        }
                        onMenuOpen={() => {
                          if (destinationOptions.length === 0)
                            loadPopularDestinations();
                        }}
                        onInputChange={(inputValue, { action }) => {
                          if (action === "input-change")
                            debouncedCitySearch(inputValue);
                        }}
                        menuPortalTarget={document.body}
                        styles={{
                          menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                          control: (base) => ({
                            ...base,
                            minHeight: "42px",
                          }),
                        }}
                      />
                      {errors.destination && (
                        <div className="text-danger small mt-1">
                          {errors.destination}
                        </div>
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
                      <Form.Label className="fw-semibold text-dark">
                        Nationality
                      </Form.Label>
                      <Select
                        options={nationalityList}
                        value={selectedNationality}
                        onChange={(option) => {
                          setSelectedNationality(option);
                          if (option) clearError("nationality");
                        }}
                        onInputChange={(v, { action }) => {
                          if (action === "input-change" && v.length >= 2)
                            debouncedCountrySearch(v);
                        }}
                        isLoading={isNationalityLoading}
                        placeholder="Select nationality"
                        isSearchable
                        isClearable
                        menuPortalTarget={document.body}
                        styles={{
                          menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                          control: (base) => ({
                            ...base,
                            minHeight: "42px",
                          }),
                        }}
                      />
                      {errors.nationality && (
                        <div className="text-danger small mt-1">
                          {errors.nationality}
                        </div>
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
                          menuPortalTarget={document.body}
                          styles={{
                            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                            control: (base) => ({
                              ...base,
                              minHeight: "42px",
                            }),
                          }}
                        />
                      </Form.Group>
                    </Col>
                  )}

                  {/* 4. Check-In Date — RateCalendar fetches per-day DS
                       rate hints for the selected city from
                       /api/day-stay-search/rate-calendar. Day-stay is a
                       single-date booking (no check-out), so this is the
                       only date field on the page. */}
                  <Col lg={4} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">
                        Check-in Date
                      </Form.Label>
                      <DateInput
                        value={checkInDate}
                        onChange={(v) => {
                          setCheckInDate(v);
                          if (v) clearError("checkInDate");
                        }}
                        min={today}
                        stateId={selectedDestination?.value}
                        endpoint="/api/day-stay-search/rate-calendar"
                        ariaLabel="Day-stay check-in date"
                        isInvalid={!!errors.checkInDate}
                      />
                      {errors.checkInDate && (
                        <div className="text-danger small mt-1">
                          {errors.checkInDate}
                        </div>
                      )}
                    </Form.Group>
                  </Col>

                  {/* Check-in / Check-out Time fields removed — Day Stay
                      search now lists every hotel with a contract on
                      the picked date regardless of hourly window. The
                      contract's own start/end times are picked up when
                      the operator clicks "View Rooms". */}

                  {/* 5. Rooms & Guests — same UX as HotelSearch:
                       one button that opens the RoomGuestSelector
                       below. Replaces the previous three dropdowns
                       (Adults / Children / Rooms) and the per-child
                       age row. */}
                  <Col lg={4} md={6}>
                    <Form.Label className="fw-semibold text-dark">
                      Rooms & Guests
                    </Form.Label>
                    <div className="d-flex flex-wrap gap-2">
                      <Button
                        variant="outline-primary"
                        className="flex-grow-1 text-start rooms-summary-btn-modern"
                        type="button"
                        onClick={() => setRoomsOpen((o) => !o)}
                      >
                        {totalAdults} adult{totalAdults !== 1 ? "s" : ""}
                        {totalChildren
                          ? `, ${totalChildren} child${totalChildren !== 1 ? "ren" : ""}`
                          : ""}{" "}
                        · {totalRooms} room{totalRooms !== 1 ? "s" : ""}
                        <span className="float-end">{roomsOpen ? "▴" : "▾"}</span>
                      </Button>
                      <Button
                        type="button"
                        // hs-add-room-btn-red is the shared solid-red variant
                        // already defined in HotelSearch.css alongside the
                        // base .btn-add-room-premium pill. Matches the red
                        // used by the SEARCH DAY STAY button below (#EC0B43
                        // → #C90939). Same convention Hotel + Long Stay
                        // searches use; other pages sharing btn-add-room-premium
                        // (Student, GovEmployee, Meet & Space, etc.) don't
                        // carry this modifier and keep their pink → violet
                        // gradient unchanged.
                        className="flex-grow-1 justify-content-center btn-add-room-premium hs-add-room-btn-red"
                        disabled={roomsOpen && rooms.length >= MAX_ROOMS}
                        onClick={() => {
                          if (!roomsOpen) {
                            setRoomsOpen(true);
                          } else {
                            setRooms((prev) =>
                              prev.length >= MAX_ROOMS
                                ? prev
                                : [...prev, { adults: 1, children: 0, childAges: [] }]
                            );
                          }
                        }}
                      >
                        <span className="add-room-plus">+</span>
                        <span>Add Room</span>
                      </Button>
                    </div>
                    {errors.adults && (
                      <div className="text-danger small mt-1">{errors.adults}</div>
                    )}
                  </Col>
                </Row>

                {roomsOpen && (
                  <Row className="g-3 mt-3">
                    <Col md={12}>
                      <RoomGuestSelector
                        value={rooms}
                        onChange={(next) => {
                          setRooms(next);
                          if (next.some((r) => Number(r.adults) > 0))
                            clearError("adults");
                        }}
                      />
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
                          <Spinner
                            animation="border"
                            size="sm"
                            className="me-2"
                          />
                          Searching...
                        </>
                      ) : (
                        <>
                          <FaSearch className="me-2" />
                          SEARCH DAY STAY
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
           {!hasSearched && (
             <AdvertisementCarousel
               cityId={selectedDestination?.value}
               cityName={selectedDestination?.label}
             />
           )}
          </div>
          )}

          {!hasSearched && (
            <Card className="shadow-sm rounded-xl">
              <Card.Body className="text-center text-muted py-5">
                <FaSearch className="display-4 text-muted mb-3" />
                <h4>Find a Day Stay Hotel</h4>
                <p>
                  Pick a date + time and we'll show hotels that accept a
                  day-stay check-in during that window.
                </p>
              </Card.Body>
            </Card>
          )}

          {hasSearched && (
            <div ref={resultsRef}>
              {results.length === 0 && !isLoading && (
                <Card className="shadow-sm rounded-xl">
                  <Card.Body className="text-center text-muted py-5">
                    <FaSearch className="display-4 text-muted mb-3" />
                    <h5>No Day Stay hotels available</h5>
                    <p>
                      Try a different time or date — your selected check-in
                      may be outside every hotel's day-stay window.
                    </p>
                  </Card.Body>
                </Card>
              )}

              {/* Search-results layout mirrors HotelSearch: a left-side
                  filtersection Card (Explore-on-Map preview, Hotel Name
                  text search, Hotel Type checkboxes) + a right-side main
                  column with the sort-pill bar and result cards. */}
              {(() => {
                // Dedupe by hotelId + apply the sidebar/top-bar filters
                // once so the entry counter and result cards read the
                // same list.
                const deduped = Object.values(
                  results.reduce((acc, h) => {
                    const key = h.hotelId;
                    const rate = Number(h.dayStayRate || 0);
                    if (
                      !acc[key] ||
                      rate < Number(acc[key].dayStayRate || Infinity)
                    ) {
                      acc[key] = {
                        ...h,
                        allContractIds: [
                          ...((acc[key] && acc[key].allContractIds) || []),
                          h.contractId,
                        ].filter((v, i, a) => a.indexOf(v) === i),
                      };
                    } else if (acc[key]) {
                      acc[key] = {
                        ...acc[key],
                        allContractIds: [
                          ...(acc[key].allContractIds || []),
                          h.contractId,
                        ].filter((v, i, a) => a.indexOf(v) === i),
                      };
                    }
                    return acc;
                  }, {}),
                );
                const needle = hotelSearchTerm.trim().toLowerCase();
                const displayed = deduped
                  .filter((h) =>
                    starRating
                      ? Number(h.starRating) === Number(starRating.value)
                      : true,
                  )
                  .filter((h) =>
                    hotelType.length > 0
                      ? hotelType.some(
                          (t) =>
                            String(h.hotelType || "").toLowerCase() ===
                            String(t.value).toLowerCase(),
                        )
                      : true,
                  )
                  .filter((h) =>
                    needle
                      ? String(h.hotelName || "")
                          .toLowerCase()
                          .includes(needle)
                      : true,
                  )
                  .filter((h) =>
                    channelType.length > 0
                      ? channelType.some(
                          (c) =>
                            String(h.channelType || "inhouse").toLowerCase() ===
                            String(c.value).toLowerCase(),
                        )
                      : true,
                  )
                  .sort((a, b) => {
                    const ra = Number(a.dayStayRate || 0);
                    const rb = Number(b.dayStayRate || 0);
                    return sortBy === "priceDesc" ? rb - ra : ra - rb;
                  });
                const totalDisplayed = displayed.length;
                return (
                  <Row className="g-4">
                    {/* Left Sidebar — mirrors HotelSearch.filtersection */}
                    <Col lg={3} className="leftside d-none d-lg-block">
                      <div className="left-fixed">
                        <Card className="shadow-sm rounded-xl filtersection">
                          <Card.Body className="p-2">
                            {/* Map preview — visual only for now (matches
                                HotelSearch layout); the "Explore On Map"
                                overlay button is a display affordance
                                until a map component is wired up. */}
                            <div className="map-preview-wrapper mb-2">
                              <img
                                src="/images/map.jpg"
                                alt="Map preview"
                                className="map-preview-img"
                              />
                              <button className="map-overlay-btn" type="button">
                                EXPLORE ON MAP 📍
                              </button>
                            </div>

                            <Form.Control
                              type="text"
                              placeholder="Search Hotel Name..."
                              className="ps-3 mb-2"
                              value={hotelSearchTerm}
                              onChange={(e) =>
                                setHotelSearchTerm(e.target.value)
                              }
                            />

                            {/* Display currency — converts the shown
                                rates from AED into the chosen currency
                                using the master_currency multiplier.
                                Display-only: search/booking payloads
                                stay in AED. Hidden for Agent logins
                                (locked to the agent's configured
                                currency). Server-side search: react-
                                select's client filter is disabled so
                                the /api/currency search param drives
                                the option list. */}
                            {!isAgentRole && (
                              <>
                                <Form.Group className="mb-2">
                                  <Form.Label className="fw-semibold small">
                                    Currency
                                  </Form.Label>
                                  <Select
                                    options={currencyOptions}
                                    value={selectedCurrency}
                                    onChange={(opt) => {
                                      currencyTouchedRef.current = true;
                                      setSelectedCurrency(opt);
                                    }}
                                    placeholder="Select currency"
                                    isSearchable
                                    filterOption={() => true}
                                    onInputChange={(value, { action }) => {
                                      if (action === "input-change")
                                        debouncedCurrencySearch(value);
                                    }}
                                    className="modern-select-sm"
                                    menuPortalTarget={document.body}
                                    styles={{
                                      control: (base) => ({
                                        ...base,
                                        minHeight: "36px",
                                        background: "#ffffff",
                                        color: "#000000",
                                      }),
                                      menuPortal: (base) => ({
                                        ...base,
                                        zIndex: 9999,
                                      }),
                                      menu: (base) => ({
                                        ...base,
                                        zIndex: 9999,
                                      }),
                                    }}
                                  />
                                </Form.Group>

                                <hr />
                              </>
                            )}

                            <Form.Group className="mb-2">
                              <Form.Label className="fw-semibold small">
                                Hotel Type
                              </Form.Label>
                              <div className="filter-checkbox-list">
                                {hotelTypeOptions.map((item) => (
                                  <Form.Check
                                    key={item.value}
                                    type="checkbox"
                                    id={`hotel-type-${item.value}`}
                                    label={item.label}
                                    checked={hotelType.some(
                                      (t) => t.value === item.value,
                                    )}
                                    onChange={(e) => {
                                      if (e.target.checked)
                                        setHotelType([...hotelType, item]);
                                      else
                                        setHotelType(
                                          hotelType.filter(
                                            (t) => t.value !== item.value,
                                          ),
                                        );
                                    }}
                                  />
                                ))}
                              </div>
                            </Form.Group>

                            <hr />

                            <Form.Group>
                              <Form.Label className="fw-semibold small">
                                Channel
                              </Form.Label>
                              <div className="filter-checkbox-list">
                                {channelTypeOptions.map((item) => (
                                  <Form.Check
                                    key={item.value}
                                    type="checkbox"
                                    id={`channel-${item.value}`}
                                    label={item.label}
                                    checked={channelType.some(
                                      (c) => c.value === item.value,
                                    )}
                                    onChange={(e) => {
                                      if (e.target.checked)
                                        setChannelType([...channelType, item]);
                                      else
                                        setChannelType(
                                          channelType.filter(
                                            (c) => c.value !== item.value,
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

                    {/* Right Content — sort bar + entry counter + cards */}
                    <Col lg={9}>
                      {results.length > 0 && (
                        <Card className="shadow-sm rounded-xl mb-3 filtersection">
                          <Card.Body className="p-2">
                            <div className="d-flex align-items-center gap-3 flex-wrap">
                              <Select
                                options={starOptions}
                                value={starRating}
                                onChange={setStarRating}
                                placeholder="All Stars"
                                isClearable
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
                                onClick={() => {
                                  setStarRating(null);
                                  setSortBy("priceAsc");
                                  setHotelSearchTerm("");
                                  setHotelType([]);
                                  setChannelType([]);
                                }}
                              >
                                Clear
                              </Button>
                            </div>
                          </Card.Body>
                        </Card>
                      )}

                      {/* Entry counter — mirrors HotelSearch's "Showing
                          X to Y of Z entries" strip. Day-Stay results
                          aren't paginated client-side so start/end are
                          always 1 and totalDisplayed respectively. */}
                      {results.length > 0 && (
                        <div className="d-flex justify-content-between align-items-center mb-3">
                          <small className="text-muted fw-semibold">
                            Showing {totalDisplayed > 0 ? 1 : 0} to{" "}
                            {totalDisplayed} of {totalDisplayed} entries
                          </small>
                        </div>
                      )}

                      <Row className="g-4">
                        {displayed.map((hotel) => {
                  const baseRate = Number(hotel.dayStayRate || 0);
                  const pct = Number(hotel.percentage || 0);
                  // Pax-adjusted: base rate per room + extra adults +
                  // children. First adult per room is included in base,
                  // extras pay adultRate; children pay childRate.
                  // With multi-room, the aggregate is the sum across
                  // rooms, so use the totals as before — the formula
                  // shape is preserved bit-for-bit (no math regression
                  // when the user picks one room with N adults).
                  const adultsN = totalAdults || 1;
                  const childrenN = totalChildren;
                  const roomsN = totalRooms || 1;
                  const adultPer = Number(hotel.minAdultRate || 0);
                  const childPer = Number(hotel.minChildRate || 0);
                  const perRoom =
                    baseRate +
                    Math.max(0, adultsN - 1) * adultPer +
                    childrenN * childPer;
                  const grossPerRoom = +(perRoom * (1 + pct / 100)).toFixed(2);
                  const displayRate = baseRate > 0 ? grossPerRoom * roomsN : null;
                  const cats = Array.isArray(hotel.roomCategories)
                    ? hotel.roomCategories
                    : [];
                  return (
                    <Col xs={12} key={hotel.contractId}>
                      {/* Mirrors HotelSearch.jsx result-card layout —
                          tight card padding (12px 14px), 10px image
                          padding, flex-column main content that pushes
                          the price/button row to the card bottom, and
                          Hotel's badge-row + Rate-Available conventions.
                          Day-Stay-specific pieces preserved: DAY STAY
                          chip on the image, Day Stay Window green pill,
                          optional markup badge, Categories chip list,
                          and the pax breakdown under the price. */}
                      <div
                        style={{
                          position: "relative",
                          backgroundColor: "white",
                          border: "1px solid #dee2e6",
                          borderRadius: "12px",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                          overflow: "hidden",
                        }}
                      >
                        <Row className="g-0">
                          <Col md={4}>
                            <div
                              style={{
                                position: "relative",
                                height: "100%",
                                padding: "10px",
                              }}
                            >
                              <img
                                src={
                                  hotel.hotelImage ||
                                  "https://via.placeholder.com/480x270?text=Day+Stay"
                                }
                                alt={hotel.hotelName}
                                loading="lazy"
                                onError={(e) => {
                                  e.currentTarget.src =
                                    "https://via.placeholder.com/480x270?text=Day+Stay";
                                }}
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "cover",
                                  borderRadius: "9px",
                                }}
                              />
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
                                {hotel.starRating || 0}
                                <span
                                  style={{
                                    marginLeft: "5px",
                                    backgroundColor: "#6c757d",
                                    padding: "2px 6px",
                                    borderRadius: "10px",
                                  }}
                                >
                                  DAY STAY
                                </span>
                              </div>
                            </div>
                          </Col>
                          <Col md={8}>
                            <div
                              style={{
                                padding: "12px 14px",
                                display: "flex",
                                flexDirection: "column",
                                height: "100%",
                              }}
                            >
                              <h6
                                style={{
                                  fontSize: "1.0rem",
                                  fontWeight: "600",
                                  marginBottom: "4px",
                                  color: "#333",
                                }}
                              >
                                {hotel.hotelName || "Hotel Name Not Available"}
                              </h6>

                              <p
                                style={{
                                  fontSize: "0.875rem",
                                  color: "#666",
                                  marginBottom: "4px",
                                }}
                              >
                                📍{" "}
                                {hotel.hotelAddress ||
                                  hotel.city ||
                                  "Address Not Available"}
                              </p>

                              {/* {cats.length > 0 && (
                                <div className="mb-2">
                                  <small className="text-muted me-2">
                                    Categories:
                                  </small>
                                  {cats.map((c) => (
                                    <Badge
                                      key={c}
                                      bg="light"
                                      text="dark"
                                      className="border me-1"
                                      style={{ fontSize: "0.7rem" }}
                                    >
                                      {c}
                                    </Badge>
                                  ))}
                                </div>
                              )} */}

                              {/* Badge row — same wrapper Hotel uses so the
                                  Rate-Available signal, Day Stay Window
                                  and optional markup pill wrap uniformly
                                  on small screens. */}
                              <div
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: "6px",
                                  marginBottom: "6px",
                                  alignItems: "center",
                                }}
                              >
                                <span
                                  style={{
                                    backgroundColor: "#28a745",
                                    color: "white",
                                    padding: "4px 8px",
                                    borderRadius: "4px",
                                    fontSize: "0.75rem",
                                    display: "inline-block",
                                  }}
                                >
                                  Rate Available
                                </span>
                                <span
                                  style={{
                                    backgroundColor: "#28a745",
                                    color: "white",
                                    padding: "4px 8px",
                                    borderRadius: "4px",
                                    fontSize: "0.75rem",
                                    display: "inline-block",
                                  }}
                                >
                                  Day Stay Window:{" "}
                                  {(hotel.checkInStartTime || "").slice(0, 5)} –{" "}
                                  {(hotel.checkInEndTime || "").slice(0, 5)}
                                </span>
                                {pct > 0 && (
                                  <span
                                    style={{
                                      backgroundColor: "#ffc107",
                                      color: "#212529",
                                      padding: "4px 8px",
                                      borderRadius: "4px",
                                      fontSize: "0.75rem",
                                      display: "inline-block",
                                    }}
                                  >
                                    +{pct}% markup
                                  </span>
                                )}
                              </div>

                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  marginTop: "auto",
                                  paddingTop: "8px",
                                  borderTop: "1px solid #eee",
                                }}
                              >
                                <div>
                                  <div
                                    style={{
                                      fontSize: "1.1rem",
                                      fontWeight: "600",
                                      color: "#333",
                                    }}
                                  >
                                    {displayRate != null
                                      ? `${displayCurrencyCode} ${convertFromAed(
                                          displayRate,
                                        ).toLocaleString(undefined, {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2,
                                        })}`
                                      : "Rate on request"}
                                  </div>
                                  <small className="text-muted">
                                    {adultsN} adult
                                    {adultsN > 1 ? "s" : ""}
                                    {childrenN
                                      ? `, ${childrenN} child${
                                          childrenN > 1 ? "ren" : ""
                                        }`
                                      : ""}{" "}
                                    · {roomsN} room
                                    {roomsN > 1 ? "s" : ""}
                                  </small>
                                </div>

                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "flex-end",
                                    gap: "6px",
                                  }}
                                >
                                <Button
                                  size="sm"
                                  variant={
                                    clickedHotelIds.includes(hotel.contractId)
                                      ? "secondary"
                                      : "primary"
                                  }
                                  onClick={() => {
                                    setClickedHotelIds((prev) => [
                                      ...prev,
                                      hotel.contractId,
                                    ]);
                                    // Use the contract's window times as the
                                    // actual booking check-in / check-out
                                    // (the user's typed time is only used
                                    // to filter which contracts match).
                                    const cStart = (hotel.checkInStartTime || checkInTime || "")
                                      .slice(0, 5);
                                    const cEnd = (hotel.checkInEndTime || checkOutTime || "")
                                      .slice(0, 5);
                                    const payload = {
                                      hotelId: hotel.hotelId,
                                      hotelName: hotel.hotelName,
                                      hotelAddress: hotel.hotelAddress,
                                      hotelImage: hotel.hotelImage,
                                      contractId: hotel.contractId,
                                      // All matching contract ids — room
                                      // list shows each as its own window.
                                      allContractIds:
                                        hotel.allContractIds &&
                                        hotel.allContractIds.length > 0
                                          ? hotel.allContractIds
                                          : [hotel.contractId],
                                      dayStayRate: baseRate,
                                      basePctRate: pct,
                                      minAdultRate: hotel.minAdultRate || 0,
                                      minChildRate: hotel.minChildRate || 0,
                                      checkInDate,
                                      // Contract window is the actual stay
                                      // span — booking saves these times.
                                      checkInTime: cStart,
                                      checkOutTime: cEnd,
                                      windowStart: cStart,
                                      windowEnd: cEnd,
                                      // Agent logins never populate `agent`
                                      // (the picker is hidden for them), so
                                      // fall back to their own resolved id —
                                      // otherwise /day-stay-room-list's
                                      // "Available Balance" (keyed off this
                                      // field) has no agent id to look up.
                                      agentId: isAgentRole ? selfAgentId : agent,
                                      // Optional "Booking Done By" selection
                                      // — null when the user skipped it.
                                      employeeId:
                                        selectedEmployee?.value || null,
                                      nationality:
                                        selectedNationality?.code || "",
                                      nationalityLabel:
                                        selectedNationality?.label || "",
                                      // Aggregate counts derived from
                                      // the rooms[] array. Backend +
                                      // /day-stay-room-list still
                                      // expect single numbers, so the
                                      // contract is unchanged.
                                      adults: totalAdults,
                                      children: totalChildren,
                                      childAges: flatChildAges,
                                      rooms: totalRooms,
                                      // "Add New Item" amendment flow — parent
                                      // hotel booking code when launched from
                                      // ADD NEW ITEM.
                                      parentBookingCode:
                                        new URLSearchParams(
                                          window.location.search,
                                        ).get("parentBookingCode") || null,
                                    };
                                    sessionStorage.setItem(
                                      "dayStayRoomListPayload",
                                      JSON.stringify(payload)
                                    );
                                    window.open(
                                      "/day-stay-room-list",
                                      "_blank"
                                    );
                                  }}
                                >
                                  View Rooms
                                </Button>
                                </div>
                              </div>
                            </div>
                          </Col>
                        </Row>
                      </div>
                    </Col>
                  );
                })}
                      </Row>
                    </Col>
                  </Row>
                );
              })()}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
