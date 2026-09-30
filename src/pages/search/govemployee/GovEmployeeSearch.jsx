/**
 * GovEmployeeSearch.jsx
 *
 * "Search hotels for a government employee" page.
 *
 * UI mirrors HotelSearch.jsx for uniformity — same card chrome, field
 * order (Agent → Destination/City → Nationality → Check-In → Nights →
 * Check-Out → Rooms & Guests), `form-control-modern` styling, react-
 * select with `menuPortalTarget`, centered `btn-search-modern` submit,
 * and the same `RoomGuestSelector` panel. Only the backend endpoints
 * and a small heading/subtitle differ.
 *
 *  - POST /api/gov-employee-hotel-search/search
 *  - GET  /api/gov-employee-hotel-search/results/{searchId}
 *
 * Each hotel's `baseRate` in the response is already returned with the
 * gov-employee discount applied (computed server-side).
 *
 * Verification of the government employee (employee code or ID
 * document upload) is captured on the BOOKING page, not here.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, Button, Row, Col, Form, Spinner } from "react-bootstrap";
import { FaSearch, FaStar, FaIdBadge } from "react-icons/fa";
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
// Counter — inlined copy of the same widget defined in HotelSearch.jsx
// so we don't have to refactor that file to export it. Same CSS hooks
// (.rgs-counter-row / .rgs-counter-btn / .rgs-counter-val) so the
// styling stays in lock-step with the main hotel search.
// ─────────────────────────────────────────────
function Counter({ value, min = 0, max = 10, onChange }) {
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
// RoomGuestSelector — same shape and behavior as the one in
// HotelSearch.jsx. Operates on an array of
// `{ adults, children, childAges }` per room.
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
  const removeRoom = (index) => update(rooms.filter((_, i) => i !== index));

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
            <div className="rgs-room-header">
              <span className="rgs-room-label">🛏 Room {i + 1}</span>
              {rooms.length > 1 && (
                <button
                  type="button"
                  className="rgs-remove-btn"
                  onClick={() => removeRoom(i)}
                >
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
                <Counter
                  value={room.adults}
                  min={1}
                  max={6}
                  onChange={(v) => setAdults(i, v)}
                />
              </div>
              <div className="rgs-counter-row">
                <div className="rgs-counter-info">
                  <span className="rgs-counter-title">Children</span>
                  <span className="rgs-counter-sub">Age 0–17</span>
                </div>
                <Counter
                  value={room.children}
                  min={0}
                  max={4}
                  onChange={(v) => setChildren(i, v)}
                />
              </div>
            </div>

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
// Reusable react-select styles — match HotelSearch's look so the two
// search forms feel identical (42-px control, modal-safe z-index, etc.)
// ─────────────────────────────────────────────
const SELECT_STYLES = {
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
  control: (base) => ({
    ...base,
    minHeight: "42px",
    border: "1px solid #dee2e6",
    "&:hover": { borderColor: "#86b7fe" },
  }),
  menu: (base) => ({ ...base, zIndex: 9999, maxHeight: "200px" }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? "#f8f9fa" : "white",
    color: state.isSelected ? "white" : "#212529",
    "&:active": { backgroundColor: "#0d6efd" },
  }),
  clearIndicator: (base) => ({
    ...base,
    color: "#6c757d",
    "&:hover": { color: "#dc3545" },
  }),
};

export default function GovEmployeeSearch() {
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

  // ── form state ───────────────────────────────────────────────────
  const [destinationOptions, setDestinationOptions] = useState([]);
  const [selectedDestination, setSelectedDestination] = useState(null);
  const [nationalityList, setNationalityList] = useState([]);
  const [selectedNationality, setSelectedNationality] = useState(null);

  // Optional "Booking Done By Employee" — moved here from
  // GovEmployeeBookingPage. employeeId flows through navigate state →
  // GovEmployeeRoomList → GovEmployeeBookingPage's bookingData.payload.
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
  const [agentBalance, setAgentBalance] = useState(null);
  const [agentBalanceLoading, setAgentBalanceLoading] = useState(false);

  // ── Display currency (rates are AED; this lets the operator view them in
  // another currency). Defaults to the agent's configured currency; the
  // chosen {code, factor} rides the navigate state to the room list / booking
  // page / create payload. Rates stay AED. ──────────────────────────────────
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

  // factor = AED → target multiplier. master_currency.value is "AED per 1 unit"
  // of the target, so the multiplier is aedBaseRate / value (= 1/value when AED
  // itself has value 1), NOT value / aedBaseRate.
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

  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [nights, setNights] = useState(1);

  // Rooms now use the same shape as HotelSearch so the
  // RoomGuestSelector widget can be reused verbatim.
  const [rooms, setRooms] = useState([
    { adults: 1, children: 0, childAges: [] },
  ]);
  const [roomsOpen, setRoomsOpen] = useState(false);

  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState([]);
  // When results are on screen the big search form collapses into a sticky
  // summary strip. Clicking "Modify Search" flips this true to re-expand it.
  const [isEditingSearch, setIsEditingSearch] = useState(false);
  const resultsRef = useRef(null);

  // Coerce option fields to strings — a country row with a null name
  // would otherwise crash react-select's default filter (it calls
  // label.replace(...)). Mirrors the senior-citizen / hotel pages.
  const buildCountryOption = (c) => ({
    value: c?.id,
    label: c?.name == null ? "" : String(c.name),
    code: c?.countryCode == null ? "" : String(c.countryCode),
  });

  // Local debounce so typing in the Nationality box actually hits
  // /api/country?search=<term> rather than only filtering the first
  // 50 rows loaded on mount. (reference: /new-booking/hotel.)
  const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  };

  const debouncedCountrySearch = useRef(
    debounce(async (search) => {
      try {
        const { data } = await axiosInstance.get(
          `/api/country?search=${encodeURIComponent(search)}`,
        );
        const list = Array.isArray(data) ? data : data?.content || [];
        setNationalityList(list.filter(Boolean).map(buildCountryOption));
      } catch {
        setNationalityList([]);
      }
    }, 300),
  ).current;

  // ── Result-filter state ─ same shape as HotelSearch.jsx ─────────
  //   • starRating  — single Star option (or null = "All Stars")
  //   • hotelType   — array of selected types (checkbox)
  //   • channelType — array of selected channel/API types (checkbox)
  //   • sortBy      — "priceAsc" / "priceDesc"
  //   • hotelSearchTerm — substring filter on hotel name
  const [starRating, setStarRating] = useState(null);
  const [hotelType, setHotelType] = useState([]);
  const [channelType, setChannelType] = useState([]);
  const [sortBy, setSortBy] = useState("priceAsc");
  const [hotelSearchTerm, setHotelSearchTerm] = useState("");

  // Reusable option lists for the sidebar / header — mirror HotelSearch.
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

  // Derive the filtered+sorted result set the cards render. Pure —
  // never mutates `results`. Re-runs only when the inputs change.
  const filteredResults = useMemo(() => {
    let out = Array.isArray(results) ? [...results] : [];

    if (hotelSearchTerm.trim()) {
      const q = hotelSearchTerm.trim().toLowerCase();
      out = out.filter((h) =>
        String(h.hotelName || "").toLowerCase().includes(q),
      );
    }
    if (starRating) {
      out = out.filter(
        (h) => Number(h.starRating) === Number(starRating.value),
      );
    }
    if (hotelType.length > 0) {
      const sel = hotelType.map((t) => t.value.toLowerCase());
      out = out.filter((h) =>
        sel.includes(String(h.hotelType || "hotel").toLowerCase()),
      );
    }
    if (channelType.length > 0) {
      const sel = channelType.map((c) => c.value.toLowerCase());
      out = out.filter((h) =>
        sel.includes(String(h.apiType || "inhouse").toLowerCase()),
      );
    }

    // Sort by `baseRate` (gov-discounted) — same rate the card shows.
    out.sort((a, b) => {
      const ra = Number(a.baseRate ?? Infinity);
      const rb = Number(b.baseRate ?? Infinity);
      return sortBy === "priceDesc" ? rb - ra : ra - rb;
    });

    return out;
  }, [results, hotelSearchTerm, starRating, hotelType, channelType, sortBy]);

  const clearFilters = () => {
    setStarRating(null);
    setHotelType([]);
    setChannelType([]);
    setSortBy("priceAsc");
    setHotelSearchTerm("");
  };

  // ── date helpers — mirror HotelSearch.jsx ───────────────────────
  const formatDate = (d) => d.toISOString().split("T")[0];
  const getTomorrow = (from = new Date()) => {
    const t = new Date(from);
    t.setDate(t.getDate() + 1);
    return t;
  };
  const today = formatDate(new Date());
  const minCheckOutDate = checkIn
    ? formatDate(getTomorrow(new Date(checkIn)))
    : formatDate(getTomorrow());

  // Keep nights and checkOut in sync, the same way HotelSearch does.
  useEffect(() => {
    if (checkIn && checkOut) {
      const start = new Date(checkIn);
      const end = new Date(checkOut);
      const diff = Math.max(
        1,
        Math.ceil((end - start) / (1000 * 60 * 60 * 24)),
      );
      setNights(diff);
    }
  }, [checkIn, checkOut]);

  const handleNightsChange = (value) => {
    const val = Math.max(1, Number(value) || 1);
    setNights(val);
    if (checkIn) {
      const start = new Date(checkIn);
      const out = new Date(start);
      out.setDate(start.getDate() + val);
      const iso = new Date(out.getTime() - out.getTimezoneOffset() * 60000)
        .toISOString()
        .split("T")[0];
      setCheckOut(iso);
    }
  };

  const clearError = (key) =>
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const { [key]: _drop, ...rest } = prev;
      return rest;
    });

  // ── load destinations + nationalities + agents ───────────────────
  useEffect(() => {
    (async () => {
      try {
        const { data } = await axiosInstance.get("/api/province?limit=50");
        const list = Array.isArray(data) ? data : data?.content || data?.data || [];
        setDestinationOptions(
          list.map((city) => ({
            value: city.id ?? city.provinceId,
            label: `${city.stateName ?? city.name ?? ""}, ${city.country ?? ""}`,
            countryId: city.countryId,
            code: city.countryCode,
          })),
        );
      } catch (e) {
        /* silent */
      }
    })();

    (async () => {
      try {
        const { data } = await axiosInstance.get("/api/country?limit=50");
        const list = Array.isArray(data) ? data : data?.content || [];
        setNationalityList(list.filter(Boolean).map(buildCountryOption));
      } catch (e) {
        /* silent */
      }
    })();

    (async () => {
      try {
        const { data } = await axiosInstance.get("/api/agent?activeOnly=true");
        const list = Array.isArray(data) ? data : data?.content || [];
        setAgents(list);
      } catch (e) {
        /* silent */
      }
    })();
  }, []);

  // ── load agent credit balance when an agent is chosen ────────────
  useEffect(() => {
    if (!agent) {
      setAgentBalance(null);
      return;
    }
    let cancelled = false;
    setAgentBalanceLoading(true);
    (async () => {
      try {
        const { data } = await axiosInstance.get(
          `/api/agent-credit-limit/agent/${agent}`,
        );
        if (!cancelled)
          setAgentBalance(data?.availableCreditLimit ?? null);
      } catch (e) {
        if (!cancelled) setAgentBalance(null);
      } finally {
        if (!cancelled) setAgentBalanceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agent]);

  // ── form validation ──────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (!selectedDestination) e.destination = "Destination is required";
    if (!selectedNationality) e.nationality = "Nationality is required";
    if (!checkIn) e.checkIn = "Check-in is required";
    if (!checkOut) e.checkOut = "Check-out is required";
    if (!isAgentRole && !agent) e.agent = "Agent is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // After a fresh search, jump the viewport to the very top of the page so
  // the operator sees the heading and summary strip first, not just the
  // results list further down. Fires only when results transition from
  // empty → non-empty (handleSearchSubmit clears the list first, so this
  // only fires once per search round-trip).
  const prevResultsLenRef = useRef(0);
  useEffect(() => {
    const wasEmpty = prevResultsLenRef.current === 0;
    prevResultsLenRef.current = results.length;
    if (!wasEmpty || results.length === 0) return;
    const id = window.setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 50);
    return () => window.clearTimeout(id);
  }, [results.length]);

  // ── initiate search + poll for results ───────────────────────────
  const handleSearchSubmit = async (event) => {
    if (event && event.preventDefault) event.preventDefault();
    if (!validate()) return;
    setIsLoading(true);
    setResults([]);
    setIsEditingSearch(false);
    try {
      // Aggregate counts across all rooms so the existing backend
      // payload contract (single adults/children counts plus a
      // noOfRooms field) keeps working. roomConfigurations also goes
      // along for parity with the regular hotel search endpoint.
      const totalAdults = rooms.reduce((s, r) => s + (r.adults || 0), 0);
      const totalChildren = rooms.reduce((s, r) => s + (r.children || 0), 0);

      // For AGENT logins the agent dropdown is hidden and `agent` stays "";
      // fall back to the resolved selfAgentId so the backend receives a valid
      // filter and returns the agent's contracted hotels instead of nothing.
      const effectiveAgentId = isAgentRole ? selfAgentId : agent;
      const payload = {
        agentId: Number(effectiveAgentId) || undefined,
        checkIn,
        checkOut,
        destinationCityId: selectedDestination.value,
        destinationCountryId:
          selectedDestination.countryId ?? selectedDestination.value,
        nationalityId: selectedNationality?.value,
        nationalityCode: selectedNationality?.code,
        noOfRooms: rooms.length,
        adults: totalAdults,
        children: totalChildren,
        roomConfigurations: rooms.map((room, idx) => ({
          roomNo: idx + 1,
          adultCount: String(room.adults || 1),
          childCount: String(room.children || 0),
          childAges: room.childAges?.length ? room.childAges : [0],
          adultAges: room.adultAges?.length ? room.adultAges : [25],
        })),
      };

      // Agent search log (Unbooked Opportunities → Searches tab) —
      // fire-and-forget, agent-only, non-blocking. See utils/agentSearchLog.js.
      logAgentSearch({
        agentId: effectiveAgentId,
        agentName: loggedInAgentName,
        destinationId: selectedDestination?.value,
        destinationLabel: selectedDestination?.label,
        nationalityLabel: selectedNationality?.label,
        checkIn,
        checkOut,
        rooms,
        source: "gov-employee",
      });

      const { data } = await axiosInstance.post(
        "/api/gov-employee-hotel-search/search",
        payload,
      );
      const searchId = data?.searchId;
      if (!searchId) {
        setIsLoading(false);
        return;
      }

      // poll results — same pattern as the previous implementation.
      let attempts = 0;
      const poll = async () => {
        attempts += 1;
        try {
          const { data: r } = await axiosInstance.get(
            `/api/gov-employee-hotel-search/results/${searchId}` +
              `?agentId=${effectiveAgentId}&page=0&size=50&checkInDate=${checkIn}`,
          );
          setResults(r?.result || []);
          if (r?.finalStatus === "COMPLETED" || attempts >= 10) {
            setIsLoading(false);
            return;
          }
          setTimeout(poll, 1500);
        } catch (e) {
          setIsLoading(false);
        }
      };
      poll();
    } catch (e) {
      setIsLoading(false);
    }
  };

  // ── click "View Rooms" → navigate to gov-employee room-list ─────
  const apiIdFromType = (apiType) => {
    const map = {
      inhouse: 1,
      jumeirah: 10,
      iwtx: 12,
      x3: 15,
      ratehawk: 14,
      darina: 16,
      atharva: 3,
    };
    return map[(apiType || "").toLowerCase()] || 1;
  };
  const handleBookHotel = (h) => {
    // Use the first room's counts as the "primary" room for the
    // room-list page header; the page itself shows all rooms in the
    // booking flow.
    const firstRoom = rooms[0] || { adults: 1, children: 0 };
    // Open /gov-employee-room-list in a NEW browser tab. React Router's
    // navigate-state can't cross a tab boundary, so the handoff context is
    // persisted to localStorage (shared across same-origin tabs) and
    // GovEmployeeRoomList reads it as a fallback when location.state is empty.
    const handoff = {
      hotelCode: h.hotelCode,
      hotelId: h.hotelCode,
      hotelName: h.hotelName,
      hotelImage: h.hotelImage,
      address: h.hotelAddress,
      starRating: h.starRating,
      apiType: h.apiType,
      apiId: apiIdFromType(h.apiType),
      nationalityCode:
        (selectedNationality?.code || "").length === 2
          ? selectedNationality.code
          : "IN",
      checkIn,
      checkOut,
      noOfRooms: rooms.length,
      adults: firstRoom.adults,
      children: firstRoom.children,
      roomConfigurations: rooms,
      // For agent logins the dropdown is hidden and `agent` stays "";
      // fall back to selfAgentId so the room-list / booking flow gets a
      // valid agent id.
      agentId: (isAgentRole ? selfAgentId : agent) || "",
      // Optional "Booking Done By Employee" selection — null when
      // the user skipped the dropdown.
      employeeId: selectedEmployee?.value || null,
      // Display currency chosen on the search page — flows through to the
      // room list / booking page / create payload. Rates stay AED.
      currency: displayCurrency,
      // "Add New Item" amendment flow: when this search was launched from a
      // hotel booking's ADD NEW ITEM (?parentBookingCode=GLBIN37), carry the
      // parent code through so the booking page can link the child back to it.
      parentBookingCode:
        new URLSearchParams(window.location.search).get("parentBookingCode") ||
        null,
    };
    try {
      localStorage.setItem("govEmployeeRoomListCtx", JSON.stringify(handoff));
    } catch (e) {
      /* ignore quota / serialization issues — new tab can still open */
    }
    window.open("/gov-employee-room-list", "_blank", "noopener");
  };

  const hasResultsView = results.length > 0;
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
              <h3 className="hs-page-heading-title">
                Govt/Airline/Hoteliers
              </h3>
            </div>
          )}

          {/* ── Search Card + Ads ── */}
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
                {nights ? (
                  <span className="hs-summary-chip">
                    {nights} night{nights > 1 ? "s" : ""}
                  </span>
                ) : null}
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

          {!collapseSearch && (
          <div className="d-flex gap-3 align-items-start mb-4 hs-search-ads-row">
           <div className="flex-grow-1" style={{ minWidth: 0 }}>
          {/* ── Search Card — mirrors HotelSearch.jsx's chrome ── */}
          <Card className="shadow-sm rounded-xl mb-4 search-card-modern bg-white">
            <Card.Body className="p-4">
                <div className="mb-4 text-start d-flex justify-content-between align-items-start flex-wrap gap-2">
                <h2 className="fw-semibold text-primary mb-1 d-flex align-items-center">
                  <div>
                    <div style={{ fontSize: "1rem", fontWeight: "400" }}>
                      Find Your Perfect Stay for
                    </div>
                    <div style={{ fontSize: "2rem", fontWeight: "700" }}>
                      Government Employee
                    </div>
                  </div>
                </h2>
                {/* Agent logins see their available credit balance at the
                    right end of the heading row (renders nothing for other
                    roles). */}
                <AgentCreditBalance />
              </div>

              <Form onSubmit={handleSearchSubmit}>
                {/*
                  Search criteria order mirrors HotelSearch:
                    1. Agent
                    2. Destination / City
                    3. Nationality
                    4. Check-In
                    5. Nights
                    6. Check-Out
                    7. Rooms & Guests
                */}
                <Row className="g-4">
                  {/* 1. Agent — hidden for agent-role logins (booking is
                       forced to the logged-in agent by the backend). */}
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
                        Destination / City
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
                        className="modern-select"
                        menuPortalTarget={document.body}
                        styles={SELECT_STYLES}
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
                        onInputChange={(v) => {
                          // Block body so the handler returns undefined
                          // (a concise `&&` would leak a boolean into the
                          // input). Passes the typed term to the API.
                          if (v.length >= 2) debouncedCountrySearch(v);
                        }}
                        placeholder="Select nationality"
                        isSearchable
                        isClearable
                        className="modern-select"
                        menuPortalTarget={document.body}
                        styles={SELECT_STYLES}
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
                          styles={SELECT_STYLES}
                        />
                      </Form.Group>
                    </Col>
                  )}

                  {/* 4. Check-In — RateCalendar fetches per-day
                       GE-discounted rate hints for the selected city
                       from /api/gov-employee-hotel-search/rate-calendar.
                       Days on which no hotel has an active GE promo
                       render as "—" (matches the search's hard filter). */}
                  <Col lg={3} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">
                        Check-In
                      </Form.Label>
                      <DateInput
                        value={checkIn}
                        min={today}
                        stateId={selectedDestination?.value}
                        endpoint="/api/gov-employee-hotel-search/rate-calendar"
                        ariaLabel="Gov-employee check-in date"
                        isInvalid={!!errors.checkIn}
                        onChange={(newCheckIn) => {
                          setCheckIn(newCheckIn);
                          if (newCheckIn) {
                            clearError("checkIn");
                            const nextDay = formatDate(
                              getTomorrow(new Date(newCheckIn)),
                            );
                            if (!checkOut || checkOut <= newCheckIn) {
                              setCheckOut(nextDay);
                              clearError("checkOut");
                            }
                          }
                        }}
                      />
                      {errors.checkIn && (
                        <div className="text-danger small mt-1">
                          {errors.checkIn}
                        </div>
                      )}
                    </Form.Group>
                  </Col>

                  {/* 5. Nights */}
                  <Col lg={2} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">
                        Nights
                      </Form.Label>
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

                  {/* 6. Check-Out — same GE calendar as check-in,
                       min day is check-in + 1. */}
                  <Col lg={3} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">
                        Check-Out
                      </Form.Label>
                      <DateInput
                        value={checkOut}
                        min={minCheckOutDate}
                        stateId={selectedDestination?.value}
                        endpoint="/api/gov-employee-hotel-search/rate-calendar"
                        ariaLabel="Gov-employee check-out date"
                        isInvalid={!!errors.checkOut}
                        onChange={(v) => {
                          setCheckOut(v);
                          if (v) clearError("checkOut");
                        }}
                      />
                      {errors.checkOut && (
                        <div className="text-danger small mt-1">
                          {errors.checkOut}
                        </div>
                      )}
                    </Form.Group>
                  </Col>

                  {/* 7. Rooms & Guests */}
                  <Col lg={4} md={6}>
                    <Form.Label className="fw-semibold text-dark">
                      Rooms & Guests
                    </Form.Label>
                    <div className="d-flex gap-2">
                      <Button
                        variant="outline-primary"
                        className="flex-grow-1 text-start rooms-summary-btn-modern"
                        type="button"
                        onClick={() => setRoomsOpen((o) => !o)}
                      >
                        {rooms.reduce((a, r) => a + r.adults, 0)} adults
                        {rooms.reduce((a, r) => a + r.children, 0)
                          ? `, ${rooms.reduce(
                              (a, r) => a + r.children,
                              0,
                            )} child`
                          : ""}{" "}
                        · {rooms.length} room{rooms.length > 1 ? "s" : ""}
                        <span className="float-end">
                          {roomsOpen ? "▴" : "▾"}
                        </span>
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
                          SEARCH HOTELS
                        </>
                      )}
                    </Button>
                  </Col>
                </Row>
              </Form>
            </Card.Body>
          </Card>
           </div>
           {/* Ads carousel — city matches first, then all active ads */}
           {!hasResultsView && (
           <AdvertisementCarousel
             cityId={selectedDestination?.value}
             cityName={selectedDestination?.label}
           />
           )}
          </div>
          )}

          {/* ── Results + Filters ───────────────────────────────
              Mirrors HotelSearch.jsx's two-column layout: left
              sidebar with map preview + hotel-name search + Hotel
              Type and Channel checkbox groups; right column with a
              filter strip (star dropdown + Low/High sort pills +
              Clear) above the result cards. */}
          {(isLoading || results.length > 0) && (
            <div className="mt-3" ref={resultsRef}>
              <div className="search-layout">
                <Row className="g-4">
                  {/* Left Sidebar */}
                  <Col lg={3} className="leftside d-none d-lg-block">
                    <div className="left-fixed">
                      <Card className="shadow-sm rounded-xl filtersection">
                        <Card.Body className="p-2">
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

                          {/* Currency — converts the AED rates shown below.
                              Hidden for AGENT logins (their currency is
                              auto-locked to the agent's configured
                              currency upstream). */}
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
                            <Form.Label className="fw-semibold small">
                              Hotel Type
                            </Form.Label>
                            <div className="filter-checkbox-list">
                              {hotelTypeOptions.map((item) => (
                                <Form.Check
                                  key={item.value}
                                  type="checkbox"
                                  id={`gov-hotel-type-${item.value}`}
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

                          {/* Channel — supplier/channel checkbox filter.
                              Hidden for AGENT logins (agents book only
                              through their contracted channel and the
                              backend already scopes results). */}
                          {!isAgentRole && (
                            <>
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
                                      id={`gov-channel-${item.value}`}
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
                            </>
                          )}
                        </Card.Body>
                      </Card>
                    </div>
                  </Col>

                  {/* Right Content */}
                  <Col lg={9}>
                    {/* Filter / Sort strip */}
                    <Card className="shadow-sm rounded-xl mb-3 filtersection">
                      <Card.Body className="p-2">
                        <div className="d-flex align-items-center gap-3 flex-wrap">
                          <Select
                            options={starOptions}
                            value={starRating}
                            onChange={setStarRating}
                            placeholder="All Stars"
                            className="modern-select-sm"
                            isClearable
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
                          />

                          <div className="d-flex gap-2">
                            <Button
                              size="sm"
                              className={`sort-pill ${
                                sortBy === "priceAsc" ? "active" : ""
                              }`}
                              onClick={() => setSortBy("priceAsc")}
                            >
                              Low to High
                            </Button>
                            <Button
                              size="sm"
                              className={`sort-pill ${
                                sortBy === "priceDesc" ? "active" : ""
                              }`}
                              onClick={() => setSortBy("priceDesc")}
                            >
                              High to Low
                            </Button>
                          </div>

                          <Button
                            className="clear-pill"
                            variant="outline-primary"
                            size="sm"
                            onClick={clearFilters}
                          >
                            Clear
                          </Button>
                        </div>
                      </Card.Body>
                    </Card>

                    {/* Result-count line + loading spinner */}
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <small className="text-muted fw-semibold">
                        Showing {filteredResults.length === 0 ? 0 : 1} to{" "}
                        {filteredResults.length} of {results.length} entries
                      </small>
                      {isLoading && (
                        <small className="text-muted d-flex align-items-center">
                          <Spinner
                            animation="border"
                            size="sm"
                            className="me-2"
                          />
                          Searching with government discount applied…
                        </small>
                      )}
                    </div>

                    {!isLoading && filteredResults.length === 0 && (
                      <div className="text-muted">
                        No hotels match the current filters.
                      </div>
                    )}

                    {filteredResults.map((h, idx) => (
                      <Card key={idx} className="mb-2 shadow-sm">
                        <Card.Body>
                          <Row className="align-items-center">
                            <Col md={2}>
                              {h.hotelImage ? (
                                <img
                                  src={h.hotelImage}
                                  alt={h.hotelName}
                                  className="img-fluid rounded"
                                />
                              ) : (
                                <div className="bg-light p-3 text-center text-muted">
                                  No Image
                                </div>
                              )}
                            </Col>
                            <Col md={6}>
                              <h6 className="mb-1">{h.hotelName}</h6>
                              <div className="text-muted small">
                                {h.hotelAddress}
                              </div>
                              <div>
                                {Array.from({ length: h.starRating || 0 }).map(
                                  (_, i) => (
                                    <FaStar key={i} className="text-warning" />
                                  ),
                                )}
                              </div>
                            </Col>
                            <Col md={2}>
                              <div className="text-muted small">
                                Govt-Discounted Rate
                              </div>
                              <div className="h5 mb-0 text-success">
                                {h.baseRate != null
                                  ? `${displayCurrencyCode} ${convertFromAed(h.baseRate).toFixed(2)}`
                                  : "-"}
                              </div>
                            </Col>
                            <Col md={2} className="text-end">
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => handleBookHotel(h)}
                              >
                                View Rooms
                              </Button>
                            </Col>
                          </Row>
                        </Card.Body>
                      </Card>
                    ))}
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
