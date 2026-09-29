import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  Button,
  Row,
  Col,
  Form,
  Spinner,
  Badge,
  Pagination,
} from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import Select from "react-select";
import AgentSelect from "../../components/AgentSelect";
import axiosInstance from "../../components/AxiosInstance";
import { logAgentSearch } from "../../utils/agentSearchLog";
import AgentBalanceDisplay from "../../components/AgentBalanceDisplay";
import AdvertisementCarousel from "../../components/AdvertisementCarousel";
import AgentCreditBalance from "../../components/AgentCreditBalance";
import DateInput from "../../components/DateInput";
import { FaSearch, FaStar, FaMapMarkerAlt } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import {
  fetchApiHotelsEnabled,
  buildApiSearchPayload,
  searchApiHotels,
  apiIdForApiType,
} from "../../utils/lastMinuteApiHotels";
import "../../styles/HotelSearch.css";

// Default placeholder when the hotel has no image.
const DEFAULT_HOTEL_IMAGE =
  "https://details/assets/details/profilepic/hotel/hoteldefault.jpg";

// Lightweight progress bar to mimic HotelSearch's polling visual.
// Last Minute search is single-shot, so the bar just animates from 0 → 100
// while we wait for the backend response.
function SearchProgressBar({ active }) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!active) {
      setProgress(0);
      return;
    }
    setProgress(15);
    const t1 = setTimeout(() => setProgress(55), 300);
    const t2 = setTimeout(() => setProgress(85), 900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [active]);
  if (!active && progress === 0) return null;
  const display = active ? progress : 100;
  return (
    <div className="search-progress-bar-wrap mb-3">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <span className="search-progress-label">Searching last minute deals...</span>
        <span className="search-progress-percent">{display}%</span>
      </div>
      <div className="search-progress-track">
        <div className="search-progress-fill" style={{ width: `${display}%` }} />
      </div>
    </div>
  );
}

/**
 * LastMinuteBookingPage — search + listing for the Last Minute Booking flow.
 *
 * UI mirrors /new-booking/hotel (HotelSearch.jsx) with all the same fields:
 *   destination, nationality, agent, nights, check-in, check-out, rooms & guests.
 *
 * Difference from normal hotel search:
 *   • Check-in is hard-clamped to today / +1 / +2 days (Last Minute rule).
 *   • Hits ONLY /api/last-minute-hotel-search/search.
 *   • Each result row shows the discount % vs the matching normal contract rate.
 */

// ─── small helper components, copied to keep self-contained ─────────────────
function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function Counter({ value, min, max, onChange }) {
  return (
    <div className="rgs-counter">
      <button type="button" className="rgs-counter-btn"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}>−</button>
      <span className="rgs-counter-val">{value}</span>
      <button type="button" className="rgs-counter-btn"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}>+</button>
    </div>
  );
}

// Maximum number of rooms allowed per booking (matches HotelSearch).
const MAX_ROOMS = 5;

function RoomGuestSelector({ value, onChange }) {
  const [rooms, setRooms] = useState(value);

  // Sync internal state when the parent adds a room from outside
  // (e.g. the premium "Add Room" button beside the Rooms & Guests trigger).
  useEffect(() => {
    setRooms(value);
  }, [value]);

  const update = (next) => { setRooms(next); onChange?.(next); };
  const addRoom = () => {
    if (rooms.length >= MAX_ROOMS) return;
    update([...rooms, { adults: 1, children: 0, childAges: [] }]);
  };
  const removeRoom = (i) => update(rooms.filter((_, idx) => idx !== i));
  const setAdults = (i, adults) => update(rooms.map((r, idx) => idx === i ? { ...r, adults } : r));
  const setChildren = (i, children) =>
    update(rooms.map((r, idx) => idx === i
      ? { ...r, children, childAges: Array.from({ length: children }, (_, j) => r.childAges[j] || 5) }
      : r));
  const setChildAge = (rIdx, cIdx, age) =>
    update(rooms.map((r, idx) => {
      if (idx !== rIdx) return r;
      const ages = [...r.childAges]; ages[cIdx] = age;
      return { ...r, childAges: ages };
    }));

  return (
    <div className="rgs-wrap">
      <div className="rgs-grid">
        {rooms.map((room, i) => (
          <div key={i} className="rgs-room-card">
            <div className="rgs-room-header">
              <span className="rgs-room-label">🛏 Room {i + 1}</span>
              {rooms.length > 1 && (
                <button type="button" className="rgs-remove-btn" onClick={() => removeRoom(i)}>✕</button>
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
                      <Form.Select size="sm"
                        value={room.childAges[idx] || 5}
                        onChange={(e) => setChildAge(i, idx, parseInt(e.target.value))}
                        className="rgs-age-dropdown">
                        {Array.from({ length: 18 }).map((__, age) => (
                          <option key={age} value={age}>{age} {age === 1 ? "yr" : "yrs"}</option>
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

// ─── date helpers ──────────────────────────────────────────────────────────
const formatDate = (d) => d.toISOString().split("T")[0];
const addDays = (date, days) => {
  const d = new Date(date); d.setDate(d.getDate() + days); return d;
};

// ─── main page ─────────────────────────────────────────────────────────────
export default function LastMinuteBookingPage() {
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

  // Number of days the check-in calendar should stay open from today —
  // pulled from the backend at mount (driven by the "Check-in Window (Days)"
  // configured on each Last Minute Contract Rate). Default 2.
  const [checkInWindowDays, setCheckInWindowDays] = useState(2);

  useEffect(() => {
    let cancelled = false;
    axiosInstance
      .get("/api/last-minute-hotel-search/check-in-window")
      .then((res) => {
        const v = Number(res?.data?.maxDays);
        if (!cancelled && Number.isFinite(v) && v > 0) setCheckInWindowDays(v);
      })
      .catch(() => {
        // silent — fall back to the default of 2 days
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Supplier API hotels in Last Minute ────────────────────────────────────
  // Driven by hbs.last-minute.api-hotels.enabled on the backend. While false
  // (the default) this page behaves exactly as it always has: one request to
  // /api/last-minute-hotel-search/search and nothing else. The helper fails
  // closed, so a backend that predates this endpoint also leaves the page in
  // its original inhouse-only state.
  const [apiHotelsEnabled, setApiHotelsEnabled] = useState(false);
  // Separate from `searching` on purpose — inhouse results render as soon as
  // they land, while supplier hotels are still streaming in behind them.
  const [apiSearching, setApiSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchApiHotelsEnabled().then((enabled) => {
      if (!cancelled) setApiHotelsEnabled(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Allowed check-in dates (today / +1 / ... / +checkInWindowDays). Used to clamp the date input.
  const allowedCheckIns = useMemo(() => {
    const arr = [];
    for (let i = 0; i <= checkInWindowDays; i++) arr.push(formatDate(addDays(new Date(), i)));
    return arr;
  }, [checkInWindowDays]);
  const today = allowedCheckIns[0];
  const maxCheckIn = allowedCheckIns[allowedCheckIns.length - 1];

  // ── form state ──
  const [destinationOptions, setDestinationOptions] = useState([]);
  const [selectedDestination, setSelectedDestination] = useState(null);
  const [isDestinationLoading, setIsDestinationLoading] = useState(false);

  const [nationalityList, setNationalityList] = useState([]);
  const [selectedNationality, setSelectedNationality] = useState(null);
  const [isNationalityLoading, setIsNationalityLoading] = useState(false);

  // Optional "Booking Done By Employee" — mirrors HotelSearch.
  // employeeId rides the sessionStorage handoff through to
  // LastMinuteBookingForm's create payload.
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const res = await axiosInstance.get("/api/employee?page=0&limit=1000");
        if (res.data && Array.isArray(res.data)) setEmployees(res.data);
      } catch (error) {
        console.error("Error fetching employees:", error);
      }
    };
    fetchEmployees();
  }, []);

  const [agents, setAgents] = useState([]);
  const [agent, setAgent] = useState("");

  const [checkIn, setCheckIn] = useState(today);
  const [checkOut, setCheckOut] = useState(formatDate(addDays(new Date(today), 1)));
  const [nights, setNights] = useState(1);

  const [rooms, setRooms] = useState([{ adults: 1, children: 0, childAges: [] }]);
  const [roomsOpen, setRoomsOpen] = useState(false);

  const [errors, setErrors] = useState({});

  // ── results state ──
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);
  // When results are on screen the big search form collapses into a sticky
  // summary strip. Clicking "Modify Search" flips this true to re-expand it.
  const [isEditingSearch, setIsEditingSearch] = useState(false);
  const resultsRef = useRef(null);

  // After a fresh search, jump the viewport to the results so the operator
  // sees them without having to scroll past the search card. Fires once
  // when results transition from null → populated.
  useEffect(() => {
    if (!results) return;
    const id = window.setTimeout(() => {
      if (resultsRef.current) {
        resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 50);
    return () => window.clearTimeout(id);
  }, [results]);

  // ── load static dropdowns ─────────────────────────────────────────────────
  const loadCountries = async (search = "") => {
    try {
      setIsNationalityLoading(true);
      const url = search ? `/api/country?search=${search}` : `/api/country?limit=50`;
      const res = await axiosInstance.get(url);
      setNationalityList((res.data || []).map((c) => ({
        value: c.id, label: c.name, code: c.countryCode,
      })));
    } catch {
      setNationalityList([]);
    } finally {
      setIsNationalityLoading(false);
    }
  };
  const debouncedCountrySearch = useRef(debounce(loadCountries, 300)).current;

  const loadDestinations = async () => {
    if (destinationOptions.length > 0) return;
    try {
      setIsDestinationLoading(true);
      const res = await axiosInstance.get("/api/province?limit=50");
      const opts = (res.data || []).map((c) => ({
        value: c.id,
        label: `${c.stateName},${c.country}`,
        countryId: c.countryId,
        code: c.countryCode,
      }));
      setDestinationOptions(opts);
    } catch {
      setDestinationOptions([]);
    } finally {
      setIsDestinationLoading(false);
    }
  };
  const debouncedCitySearch = useRef(
    debounce(async (search) => {
      try {
        setIsDestinationLoading(true);
        const res = await axiosInstance.get(`/api/province?search=${search}`);
        setDestinationOptions((res.data || []).map((c) => ({
          value: c.id,
          label: `${c.stateName},${c.country}`,
          countryId: c.countryId,
          code: c.countryCode,
        })));
      } catch {
        // silent
      } finally {
        setIsDestinationLoading(false);
      }
    }, 300)
  ).current;

  const loadAgents = async () => {
    try {
      const res = await axiosInstance.get("/api/agent?activeOnly=true");
      setAgents(res.data || []);
    } catch {
      setAgents([]);
    }
  };

  useEffect(() => {
    loadCountries();
    loadAgents();
  }, []);

  // ── Display currency (search rates are quoted in AED; this lets the
  // operator view them in another currency). Mirrors HotelSearch: options
  // from /api/currency, defaults to the agent's configured currency, and the
  // chosen {code, factor} rides the sessionStorage handoff to the room list /
  // booking form / create payload. Rates stay AED everywhere. ──────────────
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

  // ── auto-update checkout when check-in or nights change ──
  useEffect(() => {
    if (!checkIn) return;
    setCheckOut(formatDate(addDays(new Date(checkIn), Math.max(1, Number(nights) || 1))));
  }, [checkIn, nights]);

  // ── helpers ──
  const clearError = (field) =>
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const { [field]: _ignore, ...rest } = prev;
      return rest;
    });

  const handleNightsChange = (val) => {
    const n = Math.max(1, Math.min(60, Number(val) || 1));
    setNights(n);
  };

  const validate = () => {
    const e = {};
    if (!selectedDestination) e.destination = "Destination is required";
    if (!selectedNationality) e.nationality = "Nationality is required";
    if (!isAgentRole && !agent) e.agent = "Agent is required";
    if (!checkIn) e.checkIn = "Check-in date is required";
    if (!checkOut) e.checkOut = "Check-out date is required";
    if (checkIn && (checkIn < today || checkIn > maxCheckIn)) {
      e.checkIn = `Check-in must be within today + ${checkInWindowDays} day(s)`;
    }
    if (checkIn && checkOut && checkOut <= checkIn) {
      e.checkOut = "Check-out must be after check-in";
    }
    return e;
  };

  // ── search ────────────────────────────────────────────────────────────────
  const handleSearch = async (event) => {
    event?.preventDefault?.();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setIsEditingSearch(false);

    const totalAdults = rooms.reduce((a, r) => a + (r.adults || 0), 0);
    const totalChildren = rooms.reduce((a, r) => a + (r.children || 0), 0);

    const payload = {
      hotelId: null,
      cityId: selectedDestination?.value ?? null,
      checkInDate: checkIn ? `${checkIn}T00:00:00` : null,
      checkOutDate: checkOut ? `${checkOut}T00:00:00` : null,
      adults: totalAdults,
      children: totalChildren,
      rooms: rooms.length,
      roomGuests: rooms.map((r) => ({
        adults: r.adults || 1,
        children: r.children || 0,
        childAges: r.childAges || [],
      })),
    };

    try {
      setSearching(true);
      setResults(null);

      // ── Agent search log (Unbooked Opportunities → Searches tab) ──────
      // Fire-and-forget snapshot of the Last Minute search context so
      // admins see it in the Unbooked Opportunities report even when the
      // agent never picks a hotel. Shared with HotelSearch — see
      // utils/agentSearchLog.js. Runs BEFORE the inhouse search so it
      // gets on the wire even if the inhouse call fails.
      logAgentSearch({
        agentId: (isAgentRole ? selfAgentId : agent) || 1,
        agentName: loggedInAgentName,
        destinationId: selectedDestination?.value,
        destinationLabel: selectedDestination?.label,
        nationalityLabel: selectedNationality?.label,
        checkIn,
        checkOut,
        rooms,
        source: "last-minute-booking",
      });

      // ── Source 1: inhouse last-minute contract rates (unchanged) ──────────
      // Awaited first so the page paints as soon as these land. This request,
      // its payload and its error handling are exactly as they were before
      // supplier hotels existed.
      const res = await axiosInstance.post(
        "/api/last-minute-hotel-search/search",
        payload
      );
      if (res.data?.success) {
        setResults(res.data);
      } else {
        toast.error(res.data?.message || "Search failed");
        setResults({ ...(res.data || {}), hotels: [] });
      }

      // ── Source 2: supplier API hotels (opt-in) ────────────────────────────
      // Fired only when the backend flag is on. Runs AFTER the inhouse render
      // and merges rows in as each supplier replies, so a slow supplier can
      // never delay or blank the inhouse list. searchApiHotels never throws.
      if (apiHotelsEnabled) {
        setApiSearching(true);
        const apiPayload = buildApiSearchPayload({
          nationalityId: selectedNationality?.value,
          nationalityCode: selectedNationality?.code,
          destinationCityId: selectedDestination?.value,
          destinationCountryId: selectedDestination?.countryId,
          checkIn,
          checkOut,
          rooms,
          agentId: (isAgentRole ? selfAgentId : agent) || 1,
        });

        // Merge helper: inhouse rows are keyed by numeric hotelId, API rows by
        // the "API-<TYPE>-<code>" synthetic id, so the two can never collide.
        const mergeApiRows = (apiRows) => {
          setResults((prev) => {
            const inhouse = (prev?.hotels || []).filter((h) => h.source !== "API");
            return { ...(prev || {}), hotels: [...inhouse, ...apiRows] };
          });
        };

        try {
          await searchApiHotels(apiPayload, mergeApiRows);
        } finally {
          setApiSearching(false);
        }
      }
    } catch (err) {
      const msg = err?.response?.data?.message || "Search failed";
      toast.error(msg);
      setResults({ hotels: [] });
    } finally {
      setSearching(false);
    }
  };

  // ── render ────────────────────────────────────────────────────────────────
  // Results are on screen while searching or once results land. Collapse the
  // full form into the sticky summary strip then, unless the user is editing.
  const hasResultsView = searching || !!results;
  const collapseSearch = hasResultsView && !isEditingSearch;

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4 hs-page">
          {/* ── Results-page heading ──
              Shown once actual results have arrived (not just on search
              click), above the search summary / form. Mirrors the heading
              on /new-booking/hotel. */}
          {!!results && (
            <div className="hs-page-heading">
              <h3 className="hs-page-heading-title">Last Minute</h3>
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
                <span className="hs-summary-chip">
                  {nights} night{nights > 1 ? "s" : ""}
                </span>
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
          <Card className="shadow-sm rounded-xl h-100 search-card-modern bg-white">
            <Card.Body className="p-4">
              <div className="mb-4 d-flex justify-content-between align-items-start flex-wrap gap-2">
                <div>
                  <h2 className="fw-semibold text-primary mb-1">Last Minute Deals</h2>
                  <p className="text-muted mb-0">Discounted rooms for check-in upto {checkInWindowDays} days</p>
                </div>
                {/* Agent logins see their available credit balance at the
                    right end of the heading row (renders nothing for other
                    roles). */}
                <AgentCreditBalance />
              </div>

              <Form onSubmit={handleSearch}>
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
                        onChange={(v) => { setAgent(v); if (v) clearError("agent"); }}
                      />
                      {errors.agent && <div className="text-danger small mt-1">{errors.agent}</div>}
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
                        onChange={(opt) => { setSelectedDestination(opt); if (opt) clearError("destination"); }}
                        placeholder="Where do you want to go?"
                        isSearchable
                        isClearable
                        className="modern-select"
                        isLoading={isDestinationLoading}
                        noOptionsMessage={() => isDestinationLoading
                          ? "Searching destinations..."
                          : "Type to search destinations..."}
                        onMenuOpen={loadDestinations}
                        onInputChange={(input, { action }) => {
                          if (action === "input-change" && input) debouncedCitySearch(input);
                        }}
                        menuPortalTarget={document.body}
                        styles={{
                          menuPortal: (b) => ({ ...b, zIndex: 9999 }),
                          control: (b) => ({ ...b, minHeight: "42px", border: "1px solid #dee2e6" }),
                        }}
                      />
                      {errors.destination && <div className="text-danger small mt-1">{errors.destination}</div>}
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
                        onChange={(opt) => { setSelectedNationality(opt); if (opt) clearError("nationality"); }}
                        onInputChange={(input) => { if (input?.length >= 2) debouncedCountrySearch(input); }}
                        isLoading={isNationalityLoading}
                        placeholder="Select nationality"
                        isSearchable
                        isClearable
                        className="modern-select"
                        menuPortalTarget={document.body}
                        styles={{
                          menuPortal: (b) => ({ ...b, zIndex: 9999 }),
                          control: (b) => ({ ...b, minHeight: "42px", border: "1px solid #dee2e6" }),
                        }}
                      />
                      {errors.nationality && <div className="text-danger small mt-1">{errors.nationality}</div>}
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
                          onChange={(opt) => setSelectedEmployee(opt)}
                          placeholder="Select employee"
                          isSearchable
                          isClearable
                          className="modern-select"
                          menuPortalTarget={document.body}
                          styles={{
                            menuPortal: (b) => ({ ...b, zIndex: 9999 }),
                            control: (b) => ({ ...b, minHeight: "42px", border: "1px solid #dee2e6" }),
                          }}
                        />
                      </Form.Group>
                    </Col>
                  )}

                  {/* 4. Check-In (clamped to today/+1/+2) — RateCalendar
                       fetches per-night LM rate hints for the selected city
                       from /api/last-minute-hotel-search/rate-calendar. */}
                  <Col lg={3} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">Check-in</Form.Label>
                      <DateInput
                        value={checkIn}
                        onChange={(v) => {
                          setCheckIn(v);
                          if (v) clearError("checkIn");
                        }}
                        min={today}
                        stateId={selectedDestination?.value}
                        endpoint="/api/last-minute-hotel-search/rate-calendar"
                        ariaLabel="Last-minute check-in date"
                        isInvalid={!!errors.checkIn}
                      />
                      {errors.checkIn && <div className="text-danger small mt-1">{errors.checkIn}</div>}
                      <Badge bg="warning" text="dark" className="mt-2">
                        Check-in: today through +{checkInWindowDays} day{checkInWindowDays === 1 ? "" : "s"} only
                      </Badge>
                    </Form.Group>
                  </Col>

                  {/* 5. Nights */}
                  <Col lg={2} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">Nights</Form.Label>
                      <Form.Control
                        style={{ height: "42px" }}
                        className="form-control-modern"
                        type="number"
                        min={1}
                        max={60}
                        value={nights}
                        onChange={(e) => handleNightsChange(e.target.value)}
                      />
                    </Form.Group>
                  </Col>

                  {/* 6. Check-Out — same LM calendar, min day is check-in + 1. */}
                  <Col lg={3} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">Check-out</Form.Label>
                      <DateInput
                        value={checkOut}
                        onChange={(v) => {
                          setCheckOut(v);
                          if (v) clearError("checkOut");
                        }}
                        min={checkIn ? formatDate(addDays(new Date(checkIn), 1)) : today}
                        stateId={selectedDestination?.value}
                        endpoint="/api/last-minute-hotel-search/rate-calendar"
                        ariaLabel="Last-minute check-out date"
                        isInvalid={!!errors.checkOut}
                      />
                      {errors.checkOut && <div className="text-danger small mt-1">{errors.checkOut}</div>}
                    </Form.Group>
                  </Col>

                  {/* 7. Rooms & Guests */}
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
                        className="flex-shrink-0 btn-add-room-premium hs-add-room-btn-red"
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
                      disabled={searching}
                      size="lg"
                    >
                      {searching ? (
                        <><Spinner animation="border" size="sm" className="me-2" />Searching...</>
                      ) : (
                        <><FaSearch className="me-2" />SEARCH LAST MINUTE DEALS</>
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

          {/* ── Progress Bar (mirrors HotelSearch.jsx) ── */}
          <SearchProgressBar active={searching} />

          {/* ── Results layout — left filter sidebar + right card grid ── */}
          <div ref={resultsRef}>
          {searching ? (
            <Card className="shadow-sm rounded-xl mb-4">
              <Card.Body className="text-center py-4">
                <Spinner animation="border" variant="primary" />
                <p className="text-muted mt-2 mb-0">Loading last minute deals...</p>
              </Card.Body>
            </Card>
          ) : results ? (
            <ResultsWithFilters
              results={results}
              apiHotelsEnabled={apiHotelsEnabled}
              apiSearching={apiSearching}
              isAgentRole={isAgentRole}
              currencyOptions={currencyOptions}
              selectedCurrency={selectedCurrency}
              onCurrencyChange={(opt) => {
                currencyTouchedRef.current = true;
                setSelectedCurrency(opt);
              }}
              searchContext={{
                checkIn,
                checkOut,
                rooms,
                nationality: selectedNationality,
                // Agent logins never populate `agent` (the picker is hidden
                // for them), so fall back to their own resolved id —
                // otherwise /last-minute-room-list's "Available Balance"
                // (keyed off this field) never has an agent id to look up.
                agent: isAgentRole ? selfAgentId : agent,
                // Optional "Booking Done By Employee" selection.
                // null when the user skipped the dropdown.
                employeeId: selectedEmployee?.value || null,
                // Display currency chosen on the search page — flows through to
                // the room list / booking form / create payload. Rates stay AED.
                currency: displayCurrency,
                // Extras used by the API-hotel branch of handleViewRooms — see
                // Phase 5. Ignored by the inhouse branch.
                destinationLabel: selectedDestination?.label || "",
                loggedInAgentName,
              }}
            />
          ) : (
            <Card className="shadow-sm rounded-xl">
              <Card.Body className="text-center text-muted py-5">
                <FaSearch className="display-4 text-muted mb-3" />
                <h4>Ready to Find Last Minute Deals?</h4>
                <p>Use the search form above to discover discounted rooms for the next 2 days.</p>
              </Card.Body>
            </Card>
          )}
          </div>
        </main>
      </div>
    </div>
  );
}

// ─── Filter constants — mirror HotelSearch.jsx ────────────────────────────
const STAR_OPTIONS = [
  { value: "", label: "All Stars" },
  { value: 1, label: "1 Star" },
  { value: 2, label: "2 Star" },
  { value: 3, label: "3 Star" },
  { value: 4, label: "4 Star" },
  { value: 5, label: "5 Star" },
];

const HOTEL_TYPE_OPTIONS = [
  { value: "hotel", label: "Hotel" },
  { value: "villa", label: "Villa" },
  { value: "resort", label: "Resort" },
  { value: "apartment", label: "Apartment" },
];

const CHANNEL_OPTIONS = [
  { value: "inhouse", label: "Inhouse" },
];

const PAGE_SIZE = 10;

// ─── ResultsWithFilters — full HotelSearch.jsx layout clone ────────────────
//
// Renders:
//   • Left sidebar (lg=3): map preview, hotel name search, hotel type
//     checkboxes, channel checkboxes.
//   • Right column (lg=9): top filter bar (star dropdown + sort pills + clear),
//     "Showing X to Y of N entries" line, hotel cards, pagination footer.
//
// All filtering happens client-side over `results.hotels` since the backend
// returns the full set in one shot.
function ResultsWithFilters({
  results,
  searchContext,
  apiHotelsEnabled = false,
  apiSearching = false,
  isAgentRole = false,
  currencyOptions = [],
  selectedCurrency = null,
  onCurrencyChange,
}) {
  const navigate = useNavigate();

  // Display-currency conversion (rates are AED-based). factor = AED→target.
  const _cur = searchContext?.currency || { code: "AED", factor: 1 };
  const curCode = _cur.code || "AED";
  const curFactor = Number(_cur.factor) > 0 ? Number(_cur.factor) : 1;

  // Filter state
  const [hotelSearchTerm, setHotelSearchTerm] = useState("");
  const [hotelType, setHotelType] = useState([]);
  const [channelType, setChannelType] = useState([]);
  const [starRating, setStarRating] = useState(STAR_OPTIONS[0]);
  const [sortBy, setSortBy] = useState("priceAsc");
  const [pageIndex, setPageIndex] = useState(0);

  // Apply filters + sort
  const filteredAndSorted = useMemo(() => {
    let list = Array.isArray(results?.hotels) ? [...results.hotels] : [];

    // Name filter
    if (hotelSearchTerm.trim()) {
      const q = hotelSearchTerm.trim().toLowerCase();
      list = list.filter((h) => (h.hotelName || "").toLowerCase().includes(q));
    }

    // Star rating filter
    if (starRating?.value) {
      list = list.filter((h) => Number(h.starRating) === Number(starRating.value));
    }

    // Hotel type — filter on category name (best we can do without a discrete type field)
    if (hotelType.length > 0) {
      const wanted = hotelType.map((t) => t.value.toLowerCase());
      list = list.filter((h) => {
        const cat = (h.categoryName || "").toLowerCase();
        return wanted.some((w) => cat.includes(w));
      });
    }

    // Channel filter.
    //
    // With API hotels OFF, Last Minute is single-source ("inhouse"): checking
    // Inhouse keeps everything, checking anything else would match nothing, so
    // empty/inhouse-only is a no-op. That original behaviour is preserved
    // untouched on the else branch.
    //
    // With API hotels ON, rows carry a real channel — "inhouse" for contract
    // rates, the lower-cased apiType ("grn", "ratehawk", …) for supplier rows —
    // so this becomes a genuine per-supplier selection.
    if (channelType.length > 0) {
      if (apiHotelsEnabled) {
        const wanted = new Set(
          channelType.map((c) => String(c.value).toLowerCase())
        );
        list = list.filter((h) =>
          wanted.has(
            h.source === "API" ? String(h.apiType || "").toLowerCase() : "inhouse"
          )
        );
      } else if (!channelType.some((c) => c.value === "inhouse")) {
        list = [];
      }
    }

    // Sort
    const cheapest = (h) => (h.fromRate != null ? Number(h.fromRate) : Infinity);
    if (sortBy === "priceAsc") list.sort((a, b) => cheapest(a) - cheapest(b));
    else if (sortBy === "priceDesc") list.sort((a, b) => cheapest(b) - cheapest(a));

    return list;
  }, [results, hotelSearchTerm, starRating, hotelType, channelType, sortBy, apiHotelsEnabled]);

  // Pagination
  const totalElements = filteredAndSorted.length;
  const totalPages = Math.max(1, Math.ceil(totalElements / PAGE_SIZE));
  useEffect(() => { if (pageIndex >= totalPages) setPageIndex(0); }, [totalPages, pageIndex]);
  const startEntry = totalElements === 0 ? 0 : pageIndex * PAGE_SIZE + 1;
  const endEntry = Math.min(totalElements, (pageIndex + 1) * PAGE_SIZE);
  const pageHotels = filteredAndSorted.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);
  const pageNumbers = useMemo(() => {
    if (totalPages <= 1) return [];
    const pages = [];
    for (let i = 1; i <= totalPages; i++) pages.push(i);
    return pages;
  }, [totalPages]);

  // View Rooms handler.
  //
  // Inhouse rows keep the original path unchanged: sessionStorage
  // "lastMinuteRoomListPayload" and the Last Minute room list page.
  //
  // API rows re-use the SAME room list / booking pages the normal hotel
  // search already uses for supplier hotels — /api-room-list, backed by
  // ExternalApiRoomList + ApiBookingPageForHotels. That is the whole point
  // of the "reuse the already-integrated search-to-book flow" rule for this
  // feature: we do NOT re-integrate suppliers into the inhouse Last Minute
  // room list. We hand the row off to the code path that already knows how
  // to talk to every supplier — with one small addition:
  //
  //   payload.lastMinuteBooking = true
  //
  // which flows through ApiBookingPageForHotels into /api/hotel-booking/create,
  // where the Phase-1 BookingFlagStamper stamps the row as LAST_MINUTE so the
  // Last Minute booking list picks it up.
  const handleViewRooms = (hotel) => {
    if (hotel?.source === "API") {
      const apiId = apiIdForApiType(hotel.apiType);
      if (!apiId) {
        toast.error(`Unknown supplier "${hotel.apiType || ""}" — cannot open rooms.`);
        return;
      }

      // Shape mirrors what HotelSearch.jsx builds for /api-room-list
      // (~line 3087). Fields ExternalApiRoomList / ApiBookingPageForHotels
      // read from `payload` must be populated; the rest we can leave null.
      const sc = searchContext || {};
      const nationalityCode = (sc.nationality?.code || "").length === 2
        ? sc.nationality.code
        : " ";
      const roomsPayload = (sc.rooms || []).map((r) => ({
        adults: r.adults || 1,
        children: r.children || 0,
        childAges: r.childAges || [],
        adultAges: Array.from({ length: r.adults || 1 }, () => 30),
      }));

      const payload = {
        checkInDate: sc.checkIn,
        checkOutDate: sc.checkOut,
        hotelCode: hotel.hotelCode || "",
        nationality: nationalityCode,
        agentId: String(sc.agent || ""),
        agentName: sc.loggedInAgentName || "",
        destinationLabel: sc.destinationLabel || "",
        nationalityLabel: sc.nationality?.label || "",
        employeeName: null,
        nightsCount: Number(results?.nights) || 0,
        apiId,
        rooms: roomsPayload,
        parentBookingCode: null,
        employeeId: sc.employeeId || null,
        // Marker read by ApiBookingPageForHotels when it builds the
        // /api/hotel-booking/create payload — see Phase 6.
        lastMinuteBooking: true,
        // 24-hour flags are irrelevant here but ApiBookingPageForHotels
        // has never read them for supplier hotels, so leave them off.
      };
      const meta = {
        hotelName: hotel.hotelName,
        address: hotel.address || hotel.cityName,
        starRating: hotel.starRating || 0,
        phone: hotel.contactNumber || "",
        hotelImage: hotel.hotelImage,
      };
      const currency = sc.currency || { code: "AED", factor: 1 };

      try {
        sessionStorage.setItem(
          "roomListPayload",
          JSON.stringify({ payload, meta, currency })
        );
      } catch (e) {
        console.error("Failed to write sessionStorage:", e);
      }
      window.open("/api-room-list", "_blank");
      return;
    }

    // Original inhouse path — unchanged.
    const payload = { hotel, results: { ...results }, searchContext };
    try {
      sessionStorage.setItem("lastMinuteRoomListPayload", JSON.stringify(payload));
    } catch (e) {
      console.error("Failed to write sessionStorage:", e);
    }
    window.open("/last-minute-room-list", "_blank");
  };

  const clearAllFilters = () => {
    setStarRating(STAR_OPTIONS[0]);
    setHotelType([]);
    setChannelType([]);
    setSortBy("priceAsc");
    setHotelSearchTerm("");
  };

  return (
    <div className="search-layout">
      <Row className="g-4">
        {/* ─── Left sidebar — same structure as HotelSearch.jsx ─── */}
        <Col lg={3} className="leftside d-none d-lg-block">
          <div className="left-fixed">
            <Card className="shadow-sm rounded-xl filtersection">
              <Card.Body className="p-2">
                {/* Map preview */}
                <div className="map-preview-wrapper mb-2">
                  <img src="/images/map.jpg" alt="Map preview" className="map-preview-img" />
                  <button className="map-overlay-btn">EXPLORE ON MAP 📍</button>
                </div>

                {/* Name search */}
                <Form.Control
                  type="text"
                  placeholder="Search Hotel Name"
                  className="ps-3 mb-2"
                  value={hotelSearchTerm}
                  onChange={(e) => { setHotelSearchTerm(e.target.value); setPageIndex(0); }}
                />

                {/* Currency — converts the AED rates shown below.
                    Hidden for AGENT logins (their currency is auto-locked
                    to the agent's configured currency upstream). */}
                {!isAgentRole && (
                  <>
                    <Form.Group className="mb-2">
                      <Form.Label className="fw-semibold small">Currency</Form.Label>
                      <Select
                        options={currencyOptions}
                        value={selectedCurrency}
                        onChange={(opt) => onCurrencyChange && onCurrencyChange(opt)}
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

                {/* Hotel type */}
                <Form.Group className="mb-2">
                  <Form.Label className="fw-semibold small">Hotel Type</Form.Label>
                  <div className="filter-checkbox-list">
                    {HOTEL_TYPE_OPTIONS.map((item) => (
                      <Form.Check
                        key={item.value}
                        type="checkbox"
                        id={`lm-hotel-type-${item.value}`}
                        label={item.label}
                        checked={hotelType.some((t) => t.value === item.value)}
                        onChange={(e) => {
                          if (e.target.checked) setHotelType([...hotelType, item]);
                          else setHotelType(hotelType.filter((t) => t.value !== item.value));
                          setPageIndex(0);
                        }}
                      />
                    ))}
                  </div>
                </Form.Group>

                {/* Channel — supplier/channel checkbox filter.
                    Hidden for AGENT logins (agents book only through their
                    contracted channel and the backend already scopes results). */}
                {!isAgentRole && (
                  <>
                    <hr />

                    <Form.Group>
                      <Form.Label className="fw-semibold small">Channel</Form.Label>
                      <div className="filter-checkbox-list">
                        {CHANNEL_OPTIONS.map((item) => (
                          <Form.Check
                            key={item.value}
                            type="checkbox"
                            id={`lm-channel-${item.value}`}
                            label={item.label}
                            checked={channelType.some((c) => c.value === item.value)}
                            onChange={(e) => {
                              if (e.target.checked) setChannelType([...channelType, item]);
                              else setChannelType(channelType.filter((c) => c.value !== item.value));
                              setPageIndex(0);
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

        {/* ─── Right column — filter bar, count, hotel cards, pagination ─── */}
        <Col lg={9}>
          <Card className="shadow-sm rounded-xl mb-3 filtersection">
            <Card.Body className="p-2">
              <div className="d-flex align-items-center gap-3 flex-wrap">
                <Select
                  options={STAR_OPTIONS}
                  value={starRating}
                  onChange={(opt) => { setStarRating(opt); setPageIndex(0); }}
                  placeholder="All Stars"
                  className="modern-select-sm"
                  menuPortalTarget={document.body}
                  styles={{
                    control: (base) => ({
                      ...base,
                      height: "36px", minHeight: "36px", width: "180px",
                      background: "#ffffff", color: "#000000", marginLeft: "30px",
                    }),
                    menuPortal: (base) => ({ ...base, zIndex: 9999 }),
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
                  onClick={clearAllFilters}
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
            {/* Supplier hotels stream in after the inhouse list has already
                painted, so the count above grows while this is showing.
                Without it the list appears to change on its own. */}
            {apiSearching && (
              <small className="text-muted d-flex align-items-center gap-2">
                <Spinner animation="border" size="sm" />
                Loading supplier hotels…
              </small>
            )}
          </div>

          <Row className="g-4">
            {pageHotels.length > 0 ? (
              pageHotels.map((h) => (
                <Col xs={12} key={h.hotelId}>
                  <HotelCard
                    hotel={h}
                    onViewRooms={() => handleViewRooms(h)}
                    currencyCode={curCode}
                    currencyFactor={curFactor}
                  />
                </Col>
              ))
            ) : (
              <Col xs={12}>
                <Card className="shadow-sm rounded-xl">
                  <Card.Body className="text-center text-muted py-5">
                    <FaSearch className="display-4 text-muted mb-3" />
                    <h5>No results found</h5>
                    <p>Try adjusting your filters or search criteria.</p>
                    <Button variant="outline-primary" size="sm" onClick={clearAllFilters}>
                      Clear All Filters
                    </Button>
                  </Card.Body>
                </Card>
              </Col>
            )}
          </Row>

          {totalElements > 0 && totalPages > 1 && (
            <div className="d-flex justify-content-end align-items-center mt-3 mb-4">
              <Pagination className="mb-0 pagination-modern">
                <Pagination.Prev
                  disabled={pageIndex === 0}
                  onClick={() => setPageIndex(pageIndex - 1)}
                />
                {pageNumbers.map((n) => (
                  <Pagination.Item
                    key={n}
                    active={n === pageIndex + 1}
                    onClick={() => setPageIndex(n - 1)}
                  >
                    {n}
                  </Pagination.Item>
                ))}
                <Pagination.Next
                  disabled={pageIndex >= totalPages - 1}
                  onClick={() => setPageIndex(pageIndex + 1)}
                />
              </Pagination>
            </div>
          )}
        </Col>
      </Row>
    </div>
  );
}

// Single hotel card — extracted so it can be reused / kept readable.
function HotelCard({ hotel: h, onViewRooms, currencyCode = "AED", currencyFactor = 1 }) {
  // Rates saved in the DB already include the admin markup (it is pre-applied
  // on the contract rate form). Return the cheapest base rate directly.
  const getCheapestMarkedUpRate = (hotel) => {
    if (!hotel.rooms || hotel.rooms.length === 0) {
      return hotel.fromRate;
    }
    let minRate = null;
    hotel.rooms.forEach((r) => {
      const base = Number(r.lastMinuteRate || 0);
      if (minRate === null || base < minRate) {
        minRate = base;
      }
    });
    return minRate;
  };

  const displayFromRate = getCheapestMarkedUpRate(h);

  return (
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
        {/* Image (left) */}
        <Col md={4}>
          <div style={{ position: "relative", height: "100%", padding: "15px" }}>
            <div
              className="ratio rounded-xl overflow-hidden"
              style={{ "--bs-aspect-ratio": "66.25%" }}
            >
              <img
                src={h.hotelImage || DEFAULT_HOTEL_IMAGE}
                alt={h.hotelName}
                loading="lazy"
                decoding="async"
                style={{
                  width: "100%", height: "100%", objectFit: "cover", borderRadius: "9px",
                }}
                onError={(ev) => { ev.currentTarget.src = DEFAULT_HOTEL_IMAGE; }}
              />
            </div>
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
              {h.starRating != null ? h.starRating : "—"}
              {/* Source badge. Was hard-coded INHOUSE while Last Minute was
                  single-source; now that contract rates and live supplier
                  rates can appear in one list, the operator has to be able to
                  tell them apart at a glance. Inhouse rows are unchanged. */}
              <span
                style={{
                  marginLeft: "5px",
                  backgroundColor: h.source === "API" ? "#0d6efd" : "#6c757d",
                  padding: "2px 6px",
                  borderRadius: "10px",
                }}
              >
                {h.source === "API" ? h.apiType || "API" : "INHOUSE"}
              </span>
            </div>
          </div>
        </Col>

        {/* Info (right) */}
        <Col md={8}>
          <div style={{ padding: "16px" }}>
            <h6 style={{ fontSize: "1.0rem", fontWeight: 600, marginBottom: 8, color: "#333" }}>
              {h.hotelName || "Hotel Name Not Available"}
            </h6>
            <p style={{ fontSize: "0.875rem", color: "#666", marginBottom: 8 }}>
              <FaMapMarkerAlt className="me-1" />
              {h.address || h.cityName || "Address Not Available"}
            </p>
            <span
              style={{
                backgroundColor: "#28a745",
                color: "white",
                padding: "4px 8px",
                borderRadius: "4px",
                fontSize: "0.75rem",
                display: "inline-block",
                marginBottom: "12px",
              }}
            >
              Rate Available
            </span>

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
              <div style={{ fontSize: "1.1rem", fontWeight: 600, color: "#333" }}>
                {displayFromRate != null
                  ? `${currencyCode} ${(Number(displayFromRate) * currencyFactor).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`
                  : "Price on request"}
              </div>
              <Button size="sm" variant="primary" onClick={onViewRooms}>
                View Rooms
              </Button>
            </div>
          </div>
        </Col>
      </Row>
    </div>
  );
}

