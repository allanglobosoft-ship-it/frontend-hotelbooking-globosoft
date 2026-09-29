/**
 * SeniorCitizenSearch.jsx
 *
 * Search page for the Senior Citizen booking flow. The shape mirrors
 * HotelSearch.jsx exactly (destination / nationality / agent / nights /
 * check-in / check-out / rooms & guests selector), so users see a
 * familiar UI when switching flows. Validation errors are displayed
 * inline next to each field.
 *
 * Backend endpoints used:
 *   POST /api/senior-citizen-hotel-search/search
 *   GET  /api/senior-citizen-hotel-search/results/{searchId}
 *
 * The results page surfaces hotels with the per-hotel Senior Citizen
 * discount already applied. "View Rooms" hands off to
 * /senior-citizen-room-list with the necessary context.
 */

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
import Sidebar from "../../../components/Sidebar";
import TopBar from "../../../components/TopBar";
import Select from "react-select";
import AgentSelect from "../../../components/AgentSelect";
import axiosInstance from "../../../components/AxiosInstance";
import { logAgentSearch } from "../../../utils/agentSearchLog";
import AdvertisementCarousel from "../../../components/AdvertisementCarousel";
import AgentCreditBalance from "../../../components/AgentCreditBalance";
import DateInput from "../../../components/DateInput";
import { FaSearch, FaStar, FaArrowLeft } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import "../../../styles/HotelSearch.css";
import DashboardRedirections from "../../../components/DashboardRedirections";

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
    update([
      ...rooms,
      { adults: 1, children: 0, childAges: [], adultAges: [65] },
    ]);
  };
  const removeRoom = (index) => update(rooms.filter((_, i) => i !== index));
  const setAdults = (index, adults) =>
    update(
      rooms.map((r, i) =>
        i === index
          ? {
              ...r,
              adults,
              // Resize the adultAges array to match the new adult count.
              // Default new adults to 65 so the senior-citizen markup kicks
              // in by default — the user can override per-row below.
              adultAges: Array.from({ length: adults }, (_, j) =>
                r.adultAges && r.adultAges[j] != null ? r.adultAges[j] : 65,
              ),
            }
          : r,
      ),
    );
  // Children are not allowed on the senior-citizen flow. The Children
  // counter and per-child age inputs are hidden in this page's
  // RoomGuestSelector, but each room still carries `children: 0` and
  // `childAges: []` so the existing search payload shape stays intact.
  const setAdultAge = (roomIdx, adultIdx, age) =>
    update(
      rooms.map((r, i) => {
        if (i !== roomIdx) return r;
        const ages = [...(r.adultAges || [])];
        ages[adultIdx] = age;
        return { ...r, adultAges: ages };
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
                  <span className="rgs-counter-sub">Age 60+</span>
                </div>
                <Counter
                  value={room.adults}
                  min={1}
                  max={6}
                  onChange={(v) => setAdults(i, v)}
                />
              </div>
            </div>
            {/* Adult ages — required for the senior-citizen flow. If any
                adult age is ≥ 60 the backend treats this room as a
                senior-citizen booking and applies the configured markup
                (discount) to the contract rate. */}
            {room.adults > 0 && (
              <div className="rgs-child-ages">
                <span className="rgs-child-ages-label">Adult ages *</span>
                <div className="rgs-child-ages-row">
                  {Array.from({ length: room.adults }).map((_, idx) => {
                    const age = (room.adultAges && room.adultAges[idx]) || 65;
                    const isSenior = Number(age) >= 60;
                    return (
                      <div key={idx} className="rgs-child-age-select">
                        <label className="rgs-child-age-label">
                          Adult {idx + 1} {isSenior ? "👵" : ""}
                        </label>
                        <Form.Select
                          size="sm"
                          value={age}
                          onChange={(e) =>
                            setAdultAge(i, idx, parseInt(e.target.value))
                          }
                          className="rgs-age-dropdown"
                          style={
                            isSenior ? { borderColor: "#198754" } : undefined
                          }
                        >
                          {Array.from({ length: 41 }).map((__, k) => {
                            const a = k + 60; // 60..100 — senior-citizen only
                            return (
                              <option key={a} value={a}>
                                {a} yrs
                              </option>
                            );
                          })}
                        </Form.Select>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
        {/* <button type="button" className="rgs-add-room-btn" onClick={addRoom}>
          <span className="rgs-add-icon">+</span>
          <span>Add Room</span>
        </button> */}
      </div>
    </div>
  );
}

export default function SeniorCitizenSearch() {
  const navigate = useNavigate();

  // Agent logins book under themselves, so the manual Agent picker is
  // hidden and the agent-required validation is skipped (mirrors
  // /new-booking/hotel — HotelSearch.jsx). currentActiveRole isn't set for
  // single-role logins, so fall back to userRole; admin/super-admin/staff
  // keep the picker exactly as before.
  // NOTE: unlike the normal hotel flow, the senior-citizen backend does NOT
  // force the agent id from the JWT — it uses the agentId from the request
  // as-is. So for an agent login we resolve their own Agent id (via
  // /api/personalProfile/{UserName}) and seed it into `agent` below, so the
  // search payload + results call still carry a valid agentId.
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

  // Optional "Booking Done By Employee" — moved here from
  // SeniorCitizenBookingPage. Threaded through state →
  // SeniorCitizenRoomList → SeniorCitizenBookingPage payload.
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

  const [destinationOptions, setDestinationOptions] = useState([]);
  const [selectedDestination, setSelectedDestination] = useState(null);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [nights, setNights] = useState(1);
  const [agent, setAgent] = useState("");
  const [agents, setAgents] = useState([]);
  const [agentBalance, setAgentBalance] = useState(null);
  const [agentBalanceLoading, setAgentBalanceLoading] = useState(false);
  // Seed Adult 1 to age 65 so the senior-citizen markup applies by
  // default. The user can change it to a non-senior age (or any other)
  // before searching. Backend decides per-room whether the markup
  // applies based on the highest age in `adultAges`.
  const [rooms, setRooms] = useState([
    { adults: 1, children: 0, childAges: [], adultAges: [65] },
  ]);
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [errors, setErrors] = useState({});
  const [isDestinationLoading, setIsDestinationLoading] = useState(false);
  const [isNationalityLoading, setIsNationalityLoading] = useState(false);

  // Results state
  const [allResults, setAllResults] = useState([]);
  const [hasSearchResult, setHasSearchResult] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  // When results are on screen the big search form collapses into a sticky
  // summary strip. Clicking "Modify Search" flips this true to re-expand it.
  const [isEditingSearch, setIsEditingSearch] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pollStatus, setPollStatus] = useState("IDLE");
  const [searchId, setSearchId] = useState(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize] = useState(10);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState("priceAsc");
  const [starRating, setStarRating] = useState(null);
  const [hotelSearchTerm, setHotelSearchTerm] = useState("");
  const [hotelType, setHotelType] = useState([]);
  const [channelType, setChannelType] = useState([]);
  const hotelTypeOptions = [
    { value: "hotel", label: "Hotel" },
    { value: "villa", label: "Villa" },
    { value: "resort", label: "Resort" },
    { value: "apartment", label: "Apartment" },
  ];
  const channelTypeOptions = [{ value: "inhouse", label: "Inhouse" }];

  // ── Display currency (rates are AED; converts for display). Defaults to
  // the agent's configured currency; the chosen {code, factor} rides the
  // navigate state to the room list / booking page / create payload. ───────
  const [currencyOptions, setCurrencyOptions] = useState([]);
  const [selectedCurrency, setSelectedCurrency] = useState(null);
  const currencyTouchedRef = useRef(false);
  const resultsRef = useRef(null);

  const starOptions = [
    { value: 5, label: "5 Stars" },
    { value: 4, label: "4 Stars" },
    { value: 3, label: "3 Stars" },
    { value: 2, label: "2 Stars" },
    { value: 1, label: "1 Star" },
  ];

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
          `/api/province?search=${searchText}`,
        );
        const list = Array.isArray(response.data) ? response.data : [];
        setDestinationOptions(
          list.slice(0, 50).map((city) => ({
            value: city.id,
            label: `${city.stateName}, ${city.country}`,
            countryId: city.countryId,
            code: city.countryCode,
          })),
        );
      } catch {
        setDestinationOptions([]);
      } finally {
        setIsDestinationLoading(false);
      }
    }, 300),
  ).current;

  // Some country master rows can come back with `name: null`. The
  // default react-select filter calls `label.replace(...)` on
  // every option as the user types and explodes on a non-string,
  // so we coerce every label to a string at the source.
  const buildCountryOption = (c) => ({
    value: c?.id,
    label: c?.name == null ? "" : String(c.name),
    code: c?.countryCode == null ? "" : String(c.countryCode),
  });

  // Hard guard: react-select's default `filterOption` calls
  // `option.label.replace(...)` and crashes the whole subtree if
  // any option in the list has a non-string label. We replace it
  // with a stringified search that simply can't throw, so even a
  // malformed option won't bring down the page.
  const safeFilterOption = (option, raw) => {
    const needle = (raw == null ? "" : String(raw)).trim().toLowerCase();
    if (!needle) return true;
    const lbl = option?.data?.label;
    const hay = (lbl == null ? "" : String(lbl)).toLowerCase();
    return hay.includes(needle);
  };

  const debouncedCountrySearch = useRef(
    debounce(async (search) => {
      try {
        setIsNationalityLoading(true);
        const response = await axiosInstance.get(
          `/api/country?search=${search}`,
        );
        setNationalityList(
          Array.isArray(response.data)
            ? response.data.filter(Boolean).map(buildCountryOption)
            : [],
        );
      } catch {
        setNationalityList([]);
      } finally {
        setIsNationalityLoading(false);
      }
    }, 300),
  ).current;

  const countryList = async () => {
    try {
      setIsNationalityLoading(true);
      const response = await axiosInstance.get("/api/country?limit=50");
      setNationalityList(
        Array.isArray(response.data)
          ? response.data.filter(Boolean).map(buildCountryOption)
          : [],
      );
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
      const list = Array.isArray(response.data) ? response.data : [];
      setDestinationOptions(
        list.map((city) => ({
          value: city.id,
          label: `${city.stateName},${city.country}`,
          countryId: city.countryId,
          code: city.countryCode,
        })),
      );
    } catch {
      /* silent */
    } finally {
      setIsDestinationLoading(false);
    }
  };

  useEffect(() => {
    countryList();
    (async () => {
      try {
        const { data } = await axiosInstance.get("/api/agent?activeOnly=true");
        setAgents(Array.isArray(data) ? data : data?.content || []);
      } catch {
        setAgents([]);
      }
    })();
  }, []);

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

  // For agent logins, resolve the logged-in agent's own id and seed it into
  // `agent` so the (hidden) picker's value is still present for the search.
  // Prefer the cached userId; otherwise fetch /api/personalProfile/{UserName}
  // (returns the Agent entity id for an AGENT account).
  useEffect(() => {
    if (!isAgentRole) return;
    const cached = localStorage.getItem("userId");
    if (cached) {
      setAgent(cached);
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
          const id = String(res.data.id);
          localStorage.setItem("userId", id);
          setAgent(id);
        }
      })
      .catch(() => {
        /* silent — search just won't auto-fill the agent */
      });
    return () => {
      cancelled = true;
    };
  }, [isAgentRole]);

  // Load currency list (default AED).
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
    return () => {
      cancelled = true;
    };
  }, []);

  // Default the display currency to the (selected/own) agent's currency.
  // `agent` already holds the selected agent (admins) or the resolved own id
  // (agent logins, set above). Stops once the operator picks a currency.
  useEffect(() => {
    if (currencyTouchedRef.current) return;
    if (!agent || currencyOptions.length === 0) return;
    let cancelled = false;
    axiosInstance
      .get(`/api/agent/${agent}`)
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
  }, [agent, currencyOptions]);

  const aedBaseRate = useMemo(() => {
    const aed = currencyOptions.find((o) => o.code === "AED");
    return aed && Number.isFinite(aed.rate) && aed.rate > 0 ? aed.rate : 1;
  }, [currencyOptions]);

  // factor = AED → target multiplier. master_currency.value is "AED per 1 unit"
  // of the target, so the multiplier is aedBaseRate / value (= 1/value when AED
  // itself has value 1), NOT value / aedBaseRate.
  const displayCurrency = useMemo(
    () => ({
      code: selectedCurrency?.code || "AED",
      factor:
        selectedCurrency &&
        Number.isFinite(selectedCurrency.rate) &&
        selectedCurrency.rate > 0 &&
        aedBaseRate
          ? aedBaseRate / selectedCurrency.rate
          : 1,
    }),
    [selectedCurrency, aedBaseRate],
  );
  const displayCurrencyCode = displayCurrency.code;
  const convertFromAed = (aed) => (Number(aed) || 0) * displayCurrency.factor;

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
        .slice(0, 10);
      setCheckOut(iso);
    }
  };

  // After a fresh search, jump the viewport to the very top of the page so
  // the operator sees the heading and summary strip first, not just the
  // results list further down. Fires once the first batch of hotels
  // actually arrives.
  useEffect(() => {
    if (!hasSearched || !hasSearchResult) return;
    const id = window.setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 50);
    return () => window.clearTimeout(id);
  }, [hasSearched, hasSearchResult]);

  const formatDate = (date) => date.toISOString().split("T")[0];
  const getTomorrow = (date = new Date()) => {
    const t = new Date(date);
    t.setDate(t.getDate() + 1);
    return t;
  };
  const today = formatDate(new Date());
  const minCheckOutDate = checkIn
    ? formatDate(getTomorrow(new Date(checkIn)))
    : formatDate(getTomorrow());

  const validateForm = () => {
    const e = {};
    if (!selectedNationality) e.nationality = "Nationality is required";
    if (!selectedDestination) e.destination = "Destination is required";
    if (!checkIn) e.checkIn = "Check-in date is required";
    if (!checkOut) e.checkOut = "Check-out date is required";
    else if (checkIn && checkOut <= checkIn)
      e.checkOut = "Check-out must be after check-in";
    // Agent logins book under themselves (picker hidden, id seeded above) —
    // skip this check for them or the search can never pass validation.
    if (!isAgentRole && !agent) e.agent = "Agent is required";

    // Senior-citizen rule — the booking only qualifies if at least one
    // adult across all rooms is aged 60+. Without this guard the flow
    // would silently apply no discount and just match the normal search.
    const hasSenior = rooms.some((r) =>
      (r.adultAges || []).some((a) => Number(a) >= 60),
    );
    if (!hasSenior) {
      e.rooms = "At least one adult must be 60+ to use the Senior Citizen flow";
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
    setPollStatus("IN_PROGRESS");

    try {
      const noOfRooms = String(rooms.length);
      const roomConfigurations = rooms.map((room, idx) => ({
        roomNo: idx + 1,
        adultCount: String(room.adults || 1),
        childCount: String(room.children || 0),
        childAges: room.childAges?.length ? room.childAges : [],
        adultAges: room.adultAges?.length ? room.adultAges : [],
      }));

      const payload = {
        checkIn,
        checkOut,
        nationalityId: String(selectedNationality.value),
        nationalityCode: selectedNationality.code,
        noOfRooms,
        destinationCityId: selectedDestination.value,
        destinationCountryId: selectedDestination.countryId,
        agentId: Number(agent),
        roomConfigurations,
      };

      // Agent search log (Unbooked Opportunities → Searches tab) —
      // fire-and-forget, agent-only, non-blocking. See utils/agentSearchLog.js.
      logAgentSearch({
        agentId: Number(agent) || null,
        agentName: loggedInAgentName,
        destinationId: selectedDestination?.value,
        destinationLabel: selectedDestination?.label,
        nationalityLabel: selectedNationality?.label,
        checkIn,
        checkOut,
        rooms,
        source: "senior-citizen",
      });

      const { data } = await axiosInstance.post(
        "/api/senior-citizen-hotel-search/search",
        payload,
      );
      const sid = data?.searchId;
      if (!sid) throw new Error("No searchId returned");
      setSearchId(sid);

      // Poll for results
      let attempts = 0;
      const poll = async () => {
        attempts += 1;
        try {
          const params = new URLSearchParams({
            agentId: agent,
            checkInDate: checkIn,
            page: pageIndex,
            size: pageSize,
            sortBy: "baseRate",
          });
          const { data: r } = await axiosInstance.get(
            `/api/senior-citizen-hotel-search/results/${sid}?${params.toString()}`,
          );
          const list = Array.isArray(r?.result)
            ? r.result
            : Array.isArray(r?.content)
              ? r.content
              : [];
          setAllResults(list);
          setTotalElements(
            Number(r?.totalResults ?? r?.totalElements ?? list.length),
          );
          setTotalPages(
            Math.max(
              1,
              Math.ceil(
                Number(r?.totalResults ?? r?.totalElements ?? list.length) /
                  pageSize,
              ),
            ),
          );
          setHasSearchResult(true);
          if (r?.finalStatus === "COMPLETED" || attempts >= 10) {
            setPollStatus("COMPLETED");
            setIsLoading(false);
            return;
          }
          setTimeout(poll, 1500);
        } catch (err) {
          console.error("Senior citizen search poll failed:", err);
          setPollStatus("ERROR");
          setIsLoading(false);
        }
      };
      poll();
    } catch (err) {
      console.error("Senior citizen search failed:", err);
      setHasSearched(false);
      setPollStatus("ERROR");
      setIsLoading(false);
    }
  };

  const filteredResults = useMemo(() => {
    let res = allResults;
    if (starRating)
      res = res.filter(
        (h) => Number(h.starRating) === Number(starRating.value),
      );
    if (hotelSearchTerm.trim()) {
      const q = hotelSearchTerm.toLowerCase();
      res = res.filter((h) => (h.hotelName || "").toLowerCase().includes(q));
    }
    if (hotelType.length > 0) {
      const sel = hotelType.map((t) => t.value.toLowerCase());
      res = res.filter((h) =>
        sel.includes(String(h.hotelType || "hotel").toLowerCase()),
      );
    }
    if (
      channelType.length > 0 &&
      !channelType.some((c) => c.value === "inhouse")
    ) {
      res = [];
    }
    if (sortBy === "priceAsc")
      res = [...res].sort((a, b) => (a.baseRate || 0) - (b.baseRate || 0));
    if (sortBy === "priceDesc")
      res = [...res].sort((a, b) => (b.baseRate || 0) - (a.baseRate || 0));
    return res;
  }, [allResults, starRating, hotelSearchTerm, hotelType, channelType, sortBy]);

  const apiIdFromType = (apiType) => {
    const m = {
      inhouse: 1,
      jumeirah: 10,
      iwtx: 12,
      x3: 15,
      ratehawk: 14,
      darina: 16,
      atharva: 3,
    };
    return m[(apiType || "").toLowerCase()] || 1;
  };

  const handleViewRooms = (h) => {
    // Open /senior-citizen-room-list in a NEW browser tab. React Router's
    // navigate-state can't cross a tab boundary, so the handoff context is
    // persisted to localStorage (shared across same-origin tabs) and
    // SeniorCitizenRoomList reads it as a fallback when location.state is empty.
    // Carries the full per-room shape (including adultAges) so the backend can
    // re-apply the senior-citizen markup per room.
    const handoff = {
      hotelCode: h.hotelCode,
      hotelId: h.hotelCode,
      hotelName: h.hotelName,
      hotelImage: h.hotelImage,
      address: h.hotelAddress,
      starRating: h.starRating,
      apiType: h.apiType,
      apiId: apiIdFromType(h.apiType),
      nationalityCode: (selectedNationality?.code || "IN")
        .toUpperCase()
        .slice(0, 2),
      checkIn,
      checkOut,
      noOfRooms: rooms.length,
      adults: rooms.reduce((a, r) => a + r.adults, 0),
      children: rooms.reduce((a, r) => a + r.children, 0),
      agentId: agent,
      // Optional "Booking Done By Employee" selection.
      employeeId: selectedEmployee?.value || null,
      // "Add New Item" flow: parent code rides in the URL
      // (?parentBookingCode=SNCIT7) and threads through so the new booking
      // is saved as a child (SNCIT7/1, SNCIT7/2, …).
      parentBookingCode:
        new URLSearchParams(window.location.search).get("parentBookingCode") || null,
      // Display currency chosen on the search page — flows through to the
      // room list / booking page / create payload. Rates stay AED.
      currency: displayCurrency,
      // Per-room breakdown — needed by SeniorCitizenRoomList to build
      // the room-search payload with the right adult ages.
      rooms: rooms.map((r) => ({
        adults: r.adults || 1,
        children: r.children || 0,
        childAges: r.childAges || [],
        adultAges:
          Array.isArray(r.adultAges) && r.adultAges.length === (r.adults || 1)
            ? r.adultAges
            : Array.from({ length: r.adults || 1 }, () => 65),
      })),
    };
    try {
      localStorage.setItem("seniorCitizenRoomListCtx", JSON.stringify(handoff));
    } catch (e) {
      /* ignore quota / serialization issues — new tab can still open */
    }
    window.open("/senior-citizen-room-list", "_blank", "noopener");
  };

  const hasResultsView = hasSearchResult || allResults.length > 0;
  const collapseSearch = hasResultsView && !isEditingSearch;

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4 hs-page">
          {/* Back to the signed-in user's dashboard — top-left, above the page content */}
          <div className="mb-3">
            <Button
              variant="outline-secondary"
              onClick={() => DashboardRedirections((localStorage.getItem("currentActiveRole") || "").trim().toUpperCase(), navigate)}
              className="d-inline-flex align-items-center gap-2 rounded-pill px-3 py-2"
            >
              <FaArrowLeft />
              Back
            </Button>
          </div>

          {/* ── Results-page heading ──
              Shown once actual results have arrived (not just on search
              click), above the search summary / form. Matches the heading
              on /new-booking/hotel. */}
          {hasResultsView && (
            <div className="hs-page-heading">
              <h3 className="hs-page-heading-title">Senior Citizen</h3>
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

          {!collapseSearch && (
          <div className="d-flex gap-3 align-items-start mb-4 hs-search-ads-row">
           <div className="flex-grow-1" style={{ minWidth: 0 }}>
          <Card className="shadow-sm rounded-xl h-100 search-card-modern bg-white">
            <Card.Body className="p-4">
              <div className="mb-4 text-start d-flex justify-content-between align-items-start flex-wrap gap-2">
                <h2 className="fw-semibold text-primary mb-1 d-flex align-items-center">
                  <div>
                    <div style={{ fontSize: "1rem", fontWeight: "400" }}>
                      Find Your Perfect Stay for
                    </div>
                    <div style={{ fontSize: "2rem", fontWeight: "700" }}>
                      Senior Citizen
                    </div>
                  </div>
                </h2>
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
                  {/* 1. Agent — hidden for agent logins (they book under
                       themselves; the id is resolved automatically). */}
                  {!isAgentRole && (
                    <Col lg={4} md={6}>
                      <Form.Group>
                        <Form.Label className="fw-semibold text-dark">
                          Agent *
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
                        Destination *
                      </Form.Label>
                      <Select
                        filterOption={safeFilterOption}
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
                          control: (base) => ({ ...base, minHeight: "42px" }),
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
                        Nationality *
                      </Form.Label>
                      <Select
                        filterOption={safeFilterOption}
                        options={nationalityList}
                        value={selectedNationality}
                        onChange={(option) => {
                          setSelectedNationality(option);
                          if (option) clearError("nationality");
                        }}
                        onInputChange={(v) => {
                          // Block body so the handler returns undefined.
                          // A concise `v.length >= 2 && ...` returned the
                          // boolean `false` for short inputs, which
                          // react-select injected into the input box —
                          // showing "false" and producing queries like
                          // `?search=falsejh`.
                          if (v.length >= 2) debouncedCountrySearch(v);
                        }}
                        isLoading={isNationalityLoading}
                        placeholder="Select nationality"
                        isSearchable
                        isClearable
                        className="modern-select"
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
                          filterOption={safeFilterOption}
                          options={employees.map((e) => ({
                            value: e?.employeeId,
                            label:
                              `${e?.firstName || ""} ${e?.lastName || ""}`.trim(),
                          }))}
                          value={selectedEmployee}
                          onChange={(opt) => setSelectedEmployee(opt)}
                          placeholder="Select employee"
                          isSearchable
                          isClearable
                          className="modern-select"
                          menuPortalTarget={document.body}
                          styles={{
                            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                            control: (base) => ({ ...base, minHeight: "42px" }),
                          }}
                        />
                      </Form.Group>
                    </Col>
                  )}

                  {/* 4. Check-In — RateCalendar fetches per-day
                       SC-discounted rate hints for the selected city
                       from /api/senior-citizen-hotel-search/rate-calendar.
                       Days on which no hotel has an active SC promo
                       render as "—" (matches the search's hard filter). */}
                  <Col lg={3} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">
                        Check-in *
                      </Form.Label>
                      <DateInput
                        value={checkIn}
                        min={today}
                        stateId={selectedDestination?.value}
                        endpoint="/api/senior-citizen-hotel-search/rate-calendar"
                        ariaLabel="Senior-citizen check-in date"
                        isInvalid={!!errors.checkIn}
                        onChange={(newCheckIn) => {
                          setCheckIn(newCheckIn);
                          if (newCheckIn) {
                            clearError("checkIn");
                            setCheckOut(
                              formatDate(getTomorrow(new Date(newCheckIn))),
                            );
                            clearError("checkOut");
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
                        type="number"
                        min={1}
                        max={60}
                        value={nights}
                        onChange={(e) => handleNightsChange(e.target.value)}
                      />
                    </Form.Group>
                  </Col>

                  {/* 6. Check-Out — same SC calendar, min day is
                       check-in + 1. */}
                  <Col lg={3} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">
                        Check-out *
                      </Form.Label>
                      <DateInput
                        value={checkOut}
                        min={minCheckOutDate}
                        stateId={selectedDestination?.value}
                        endpoint="/api/senior-citizen-hotel-search/rate-calendar"
                        ariaLabel="Senior-citizen check-out date"
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
                        className="flex-grow-1 rooms-summary-btn-modern"
                        type="button"
                        onClick={() => setRoomsOpen((o) => !o)}
                      >
                        <div className="d-flex justify-content-between align-items-center w-100">
                          <span>
                            {rooms.reduce((a, r) => a + r.adults, 0)} adults
                            {rooms.reduce((a, r) => a + r.children, 0)
                              ? `, ${rooms.reduce((a, r) => a + r.children, 0)} child`
                              : ""}{" "}
                            · {rooms.length} room{rooms.length > 1 ? "s" : ""}
                          </span>

                          <span
                            style={{
                              fontSize: "1.5rem",
                              fontWeight: "bold",
                              lineHeight: 1,
                            }}
                          >
                            {roomsOpen ? "▴" : "▾"}
                          </span>
                        </div>
                      </Button>
                      {/* <Button
                        type="button"
                        className="flex-shrink-0 btn-add-room-premium"
                        onClick={() => {
                          if (!roomsOpen) {
                            setRoomsOpen(true);
                          } else {
                            setRooms((prev) => [
                              ...prev,
                              {
                                adults: 1,
                                children: 0,
                                childAges: [],
                                adultAges: [65],
                              },
                            ]);
                            clearError("rooms");
                          }
                        }}
                      >
                        <span className="add-room-plus">+</span>
                        <span>Add Room</span>
                      </Button> */}
                    </div>
                  </Col>
                </Row>

                {roomsOpen && (
                  <Row className="g-3 mt-3">
                    <Col md={12}>
                      <RoomGuestSelector
                        value={rooms}
                        onChange={(next) => {
                          setRooms(next);
                          // Drop the "must include senior" error as soon as the
                          // user adjusts the rooms — re-validated on submit.
                          clearError("rooms");
                        }}
                      />
                    </Col>
                  </Row>
                )}

                {errors.rooms && (
                  <Row className="mt-3">
                    <Col className="text-center">
                      <div className="text-danger small">{errors.rooms}</div>
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
                          />{" "}
                          Searching...
                        </>
                      ) : (
                        <>
                          <FaSearch className="me-2" /> SEARCH HOTELS
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

          {!hasSearched && !hasSearchResult && (
            <Card className="shadow-sm rounded-xl">
              <Card.Body className="text-center text-muted py-5">
                <FaSearch className="display-4 text-muted mb-3" />
                <h4>Ready to Find Senior-Citizen-Friendly Stays?</h4>
                <p>
                  Fill in the form above and we'll surface hotels with active
                  senior-citizen discounts.
                </p>
              </Card.Body>
            </Card>
          )}

          {(hasSearchResult || allResults.length > 0) && (
            <div ref={resultsRef}>
              <Row className="g-3">
                {/* Left filter sidebar (mirrors GovEmployeeSearch) */}
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
                          onChange={(e) => setHotelSearchTerm(e.target.value)}
                        />
                        {/* Currency — converts the AED rates shown below.
                            Hidden for AGENT logins (their currency is
                            auto-locked to the agent's configured currency
                            upstream). */}
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
                                    background: "#fff",
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
                                id={`sc-hotel-type-${item.value}`}
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
                            Hidden for AGENT logins (agents book only through
                            their contracted channel and the backend already
                            scopes results). */}
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
                                    id={`sc-channel-${item.value}`}
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

                {/* Right content — star/sort strip + result cards */}
                <Col lg={9}>
                  <Card className="shadow-sm rounded-xl mb-3 filtersection">
                    <Card.Body className="p-2">
                      <div className="d-flex align-items-center gap-3 flex-wrap">
                        <Select
                          filterOption={safeFilterOption}
                          options={starOptions}
                          value={starRating}
                          onChange={setStarRating}
                          placeholder="All Stars"
                          isClearable
                          menuPortalTarget={document.body}
                          styles={{
                            control: (base) => ({
                              ...base,
                              minWidth: 160,
                              height: 38,
                            }),
                            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                          }}
                        />
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
                        <Button
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

                  {pollStatus === "IN_PROGRESS" && (
                    <div className="text-center mb-2 small text-muted">
                      <Spinner animation="border" size="sm" /> Searching hotels…
                    </div>
                  )}

                  <Row className="g-3">
                    {filteredResults.length > 0 ? (
                      filteredResults.map((hotel, idx) => (
                        <Col xs={12} key={hotel.hotelCode || idx}>
                          <Card className="shadow-sm">
                            <Card.Body>
                              <Row className="align-items-center">
                                <Col md={2}>
                                  {hotel.hotelImage ? (
                                    <img
                                      src={hotel.hotelImage}
                                      alt={hotel.hotelName}
                                      className="img-fluid rounded"
                                      style={{ maxHeight: 100 }}
                                    />
                                  ) : (
                                    <div className="bg-light p-3 text-center text-muted">
                                      No Image
                                    </div>
                                  )}
                                </Col>
                                <Col md={6}>
                                  <h6 className="mb-1">
                                    {hotel.hotelName || "Hotel"}
                                  </h6>
                                  <div className="text-muted small">
                                    {hotel.hotelAddress}
                                  </div>
                                  <div>
                                    {Array.from({
                                      length: hotel.starRating || 0,
                                    }).map((_, i) => (
                                      <FaStar
                                        key={i}
                                        className="text-warning"
                                      />
                                    ))}
                                  </div>
                                  {/* Channel line hidden for AGENT logins —
                                      agents only book through their contracted
                                      channel, and the sidebar Channel filter is
                                      already hidden for them above (see the
                                      !isAgentRole guard on the Channel Form
                                      Group), so surfacing it on each result
                                      card is out of scope for the agent. */}
                                  {!isAgentRole && (
                                    <div className="small text-muted mt-1">
                                      Channel:{" "}
                                      {(hotel.apiType || "INHOUSE").toUpperCase()}
                                    </div>
                                  )}
                                </Col>
                                <Col md={2}>
                                  <div className="text-muted small">
                                    Senior-Citizen Rate
                                  </div>
                                  <div className="h5 mb-0 text-success">
                                    {hotel.baseRate != null
                                      ? `${displayCurrencyCode} ${convertFromAed(hotel.baseRate).toFixed(2)}`
                                      : "-"}
                                  </div>
                                </Col>
                                <Col md={2} className="text-end">
                                  <Button
                                    size="sm"
                                    variant="primary"
                                    onClick={() => handleViewRooms(hotel)}
                                  >
                                    View Rooms
                                  </Button>
                                </Col>
                              </Row>
                            </Card.Body>
                          </Card>
                        </Col>
                      ))
                    ) : (
                      <Col xs={12}>
                        <Card className="shadow-sm rounded-xl">
                          <Card.Body className="text-center text-muted py-5">
                            <FaSearch className="display-4 text-muted mb-3" />
                            <h5>No results found</h5>
                            <p>
                              Try adjusting your filters or search criteria.
                            </p>
                          </Card.Body>
                        </Card>
                      </Col>
                    )}
                  </Row>

                  {totalPages > 1 && (
                    <div className="d-flex justify-content-end mt-3">
                      <Pagination size="sm">
                        <Pagination.Prev
                          disabled={pageIndex === 0}
                          onClick={() =>
                            setPageIndex((p) => Math.max(0, p - 1))
                          }
                        />
                        <Pagination.Item active>
                          {pageIndex + 1}
                        </Pagination.Item>
                        <Pagination.Next
                          disabled={pageIndex + 1 >= totalPages}
                          onClick={() => setPageIndex((p) => p + 1)}
                        />
                      </Pagination>
                    </div>
                  )}
                </Col>
              </Row>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
