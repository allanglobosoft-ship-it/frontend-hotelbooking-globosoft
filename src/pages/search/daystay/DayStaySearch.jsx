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
import PriceRangeSlider from "../../../components/PriceRangeSlider";
import HotelSearchProgressBar from "../../../components/HotelSearchProgressBar";
import useRefundFlags from "../../../hooks/useRefundFlags";
import {
  NO_REFUND_POLICY,
  isRefundPolicyActive,
  refundPolicyMatches,
  fetchDayStayRefundFlags,
  supplierRefundFlags,
} from "../../../utils/refundPolicyFilter";
import { toast } from "react-hot-toast";
import {
  buildApiSearchPayload,
  searchApiHotels,
  apiIdForApiType,
  fetchChannelOptions,
} from "../../../utils/lastMinuteApiHotels";
import {
  fetchDayStayApiHotelsEnabled,
  toDayStayHotelRow,
  isSupplierDayStayHotel,
  dayStayCheckOutDate,
} from "../../../utils/dayStayApiHotels";
import { isAgentLogin } from "../../../utils/supplierDisplay";
import "../../../styles/HotelSearch.css";

// Bars in the Budget price chart — the same count Last Minute uses and
// HotelSearchController.PRICE_HISTOGRAM_BARS sends to /new-booking/hotel.
const PRICE_HISTOGRAM_BARS = 40;

// Hotels per results page — the same 10 as /new-booking/hotel and Last Minute.
const PAGE_SIZE = 10;

// Page buttons, same rule as /new-booking/hotel and Last Minute: always the
// first 3 and last 3 pages, plus the current page and its neighbours; "…" fills
// each gap, and a gap of a single page shows that page instead. pageIndex is
// 0-based; the buttons are 1-based. Empty when there is only one page.
function pageButtons(pageIndex, totalPages) {
  if (totalPages <= 1) return [];
  const EDGE_PAGES = 3;
  const current = pageIndex + 1;
  const shown = new Set();
  for (let i = 1; i <= Math.min(EDGE_PAGES, totalPages); i++) shown.add(i);
  for (let i = Math.max(1, totalPages - EDGE_PAGES + 1); i <= totalPages; i++) shown.add(i);
  for (let i = Math.max(1, current - 1); i <= Math.min(totalPages, current + 1); i++) {
    shown.add(i);
  }
  const sorted = Array.from(shown).sort((a, b) => a - b);
  const nums = [];
  sorted.forEach((n, idx) => {
    const prev = sorted[idx - 1];
    if (prev !== undefined && n - prev === 2) nums.push(prev + 1);
    else if (prev !== undefined && n - prev > 2) nums.push(`ellipsis-${prev}`);
    nums.push(n);
  });
  return nums;
}

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
  const activeRole = (sessionStorage.getItem("currentActiveRole") || "")
    .trim()
    .toUpperCase();
  const storedRoles = (sessionStorage.getItem("userRole") || "").toUpperCase();
  const isAgentRole = activeRole
    ? activeRole === "AGENT"
    : storedRoles.includes("AGENT") && !storedRoles.includes("ADMIN");

  // Logged-in agent's name — for agent logins the booking is done by the
  // agent themselves, so the "Booking Done By Employee" picker is hidden and
  // this name is shown instead. Empty for admin/staff.
  const loggedInAgentName =
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

  // Budget slider — the same control /new-booking/hotel and Last Minute have.
  // [lo, hi] in AED on the price each card shows; an end left at its edge is
  // null ("no limit"), and null as a whole means the full range (no
  // filtering). Client-side, like every other filter on this page.
  const [priceSlider, setPriceSlider] = useState(null);

  // Refund Policy — the same three boxes as /new-booking/hotel; ticking one
  // clears the others (utils/refundPolicyFilter.js).
  const [refundPolicy, setRefundPolicy] = useState(NO_REFUND_POLICY);

  // ── Supplier API hotels ─────────────────────────────────────────────────
  // Driven by hbs.day-stay.api-hotels.enabled on the backend, the same way
  // Long Stay and Last Minute show supplier hotels. While false (also the state
  // until the check returns, and if it fails) nothing below runs and this page
  // works exactly as it did before suppliers were added.
  const [apiHotelsEnabled, setApiHotelsEnabled] = useState(false);
  // Channel rows: the channels the company has enabled on /admin/api-access.
  const [allowedChannelOptions, setAllowedChannelOptions] = useState(null);
  const [apiHotels, setApiHotels] = useState([]);
  const [apiPollStatus, setApiPollStatus] = useState("IDLE");
  // Per-supplier status ({ grn: "COMPLETED", … }) for the progress bar.
  const [apiChannelStatuses, setApiChannelStatuses] = useState({});
  // Bumped on every search, so a slow supplier reply from an older search is
  // dropped instead of landing in the newer results.
  const apiSearchSeqRef = useRef(0);

  // Results page (0-based), 10 hotels a page like /new-booking/hotel. Back to
  // the first page whenever the list itself changes — a new search or any
  // filter / sort — but not while supplier hotels stream in, so the page being
  // read doesn't jump.
  const [pageIndex, setPageIndex] = useState(0);
  useEffect(() => {
    setPageIndex(0);
  }, [
    results,
    starRating,
    sortBy,
    hotelSearchTerm,
    hotelType,
    channelType,
    priceSlider,
    refundPolicy,
  ]);
  // Change page and bring the top of the results back into view — same as
  // /new-booking/hotel, so paging from the bottom of the list does not leave
  // the user at the bottom of the next page.
  const goToPage = (idx, totalPages) => {
    if (idx < 0 || idx >= totalPages) return;
    setPageIndex(idx);
    setTimeout(() => {
      if (resultsRef.current) {
        resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 0);
  };

  // Collapsed search-summary strip, measured so the sticky progress bar can sit
  // just below it (the same arrangement as /new-booking/hotel).
  const summaryBarRef = useRef(null);
  const [summaryBarHeight, setSummaryBarHeight] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchDayStayApiHotelsEnabled().then((enabled) => {
      if (cancelled || !enabled) return;
      setApiHotelsEnabled(true);
      fetchChannelOptions().then((options) => {
        if (!cancelled) setAllowedChannelOptions(options);
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
    const cached = sessionStorage.getItem("userId");
    if (cached) {
      setSelfAgentId(cached);
      return;
    }
    const userName =
      sessionStorage.getItem("UserName");
    if (!userName) return;
    let cancelled = false;
    axiosInstance
      .get(`/api/personalProfile/${userName}`)
      .then((res) => {
        if (cancelled) return;
        if (res?.data?.id != null) {
          const idv = String(res.data.id);
          sessionStorage.setItem("userId", idv);
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

  // The AED price a result card shows (the rate for the picked rooms and
  // guests, markup included) — the same formula as the result card below, so
  // the Budget slider filters on the number the agent sees. Null = "Rate on
  // request".
  const dayStayDisplayRateOf = (hotel) => {
    const baseRate = Number(hotel?.dayStayRate || 0);
    if (!(baseRate > 0)) return null;
    const pct = Number(hotel.percentage || 0);
    const adultsN = totalAdults || 1;
    const perRoom =
      baseRate +
      Math.max(0, adultsN - 1) * Number(hotel.minAdultRate || 0) +
      totalChildren * Number(hotel.minChildRate || 0);
    const grossPerRoom = +(perRoom * (1 + pct / 100)).toFixed(2);
    return grossPerRoom * (totalRooms || 1);
  };
  const flatChildAges = rooms.flatMap((r) => r.childAges || []);

  // Refund Policy flags, one per hotel, looked up only while a box is ticked:
  // the same /api/day-stay-contract/rooms-search call /day-stay-room-list
  // makes for the hotel (same body, all its contracts), read the way that page
  // labels each rate. The key carries everything the answer depends on, so a
  // new search is looked up anew.
  const refundLookups = useMemo(() => {
    const byHotel = new Map();
    results.forEach((h) => {
      const entry = byHotel.get(h.hotelId);
      if (!entry) {
        byHotel.set(h.hotelId, { hotel: h, ids: [h.contractId] });
        return;
      }
      if (!entry.ids.includes(h.contractId)) entry.ids.push(h.contractId);
      // The card shows the hotel's cheapest contract; the room list gets its %.
      if (Number(h.dayStayRate || 0) < Number(entry.hotel.dayStayRate || Infinity)) {
        entry.hotel = h;
      }
    });
    return [...byHotel.values()].map(({ hotel, ids }) => ({
      hotelId: hotel.hotelId,
      key: `${hotel.hotelId}|${checkInDate}|${ids.join(",")}|${totalAdults}|${totalChildren}|${totalRooms}`,
      fetchFlags: () =>
        fetchDayStayRefundFlags({
          hotelId: hotel.hotelId,
          hotelName: hotel.hotelName,
          hotelAddress: hotel.hotelAddress,
          starRating: hotel.starRating,
          contractIds: ids,
          adults: totalAdults,
          children: totalChildren,
          rooms: totalRooms,
          checkInDate,
          basePctRate: Number(hotel.percentage || 0),
          nationality:
            selectedNationality?.label || selectedNationality?.code || "",
        }),
    }));
  }, [results, checkInDate, totalAdults, totalChildren, totalRooms, selectedNationality]);
  const refundActive = isRefundPolicyActive(refundPolicy);
  const { flags: refundFlagsByKey, loading: refundFlagsLoading } =
    useRefundFlags(refundActive, refundLookups);
  const refundKeyByHotel = useMemo(
    () => new Map(refundLookups.map((l) => [l.hotelId, l.key])),
    [refundLookups],
  );

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

  // Supplier search (switch on only): runs alongside the day-stay one, not
  // awaited, because suppliers can take a minute or more. Suppliers sell no
  // day-use rates, so it searches one night from the check-in date.
  // searchApiHotels never throws, and rows appear as each supplier replies.
  const startSupplierSearch = () => {
    const seq = ++apiSearchSeqRef.current;
    const isCurrent = () => seq === apiSearchSeqRef.current;
    setApiHotels([]);
    setApiChannelStatuses({});
    setApiPollStatus("IN_PROGRESS");
    searchApiHotels(
      buildApiSearchPayload({
        nationalityId: selectedNationality?.value,
        nationalityCode: selectedNationality?.code,
        destinationCityId: selectedDestination?.value,
        destinationCountryId: selectedDestination?.countryId,
        checkIn: checkInDate,
        checkOut: dayStayCheckOutDate(checkInDate),
        rooms,
        agentId: (isAgentRole ? selfAgentId : agent) || 1,
      }),
      (rows) => {
        if (isCurrent()) setApiHotels(rows.map(toDayStayHotelRow));
      },
      {
        isCancelled: () => !isCurrent(),
        onStatus: (statuses) => {
          if (isCurrent()) setApiChannelStatuses({ ...statuses });
        },
      },
    ).then((result) => {
      if (isCurrent()) {
        setApiPollStatus(result?.completed ? "COMPLETED" : "TIMEOUT");
      }
    });
  };

  // "View Rooms" on a supplier hotel opens the normal supplier room list (one
  // night from the check-in date), with dayStayBooking added so the booking is
  // tagged and listed as Day Stay.
  const openSupplierRooms = (hotel) => {
    const apiId = apiIdForApiType(hotel.apiType);
    if (!apiId) {
      toast.error(
        isAgentLogin()
          ? "Unable to open rooms for this hotel."
          : `Unknown supplier "${hotel.apiType || ""}" — cannot open rooms.`,
      );
      return;
    }
    const payload = {
      checkInDate,
      checkOutDate: dayStayCheckOutDate(checkInDate),
      hotelCode: hotel.hotelCode || "",
      nationality:
        (selectedNationality?.code || "").length === 2
          ? selectedNationality.code
          : " ",
      agentId: String((isAgentRole ? selfAgentId : agent) || ""),
      agentName: loggedInAgentName,
      destinationLabel: selectedDestination?.label || "",
      nationalityLabel: selectedNationality?.label || "",
      employeeName: null,
      nightsCount: 1,
      apiId,
      rooms: rooms.map((r) => ({
        adults: r.adults || 1,
        children: r.children || 0,
        childAges: r.childAges || [],
        adultAges: Array.from({ length: r.adults || 1 }, () => 30),
      })),
      parentBookingCode: null,
      employeeId: selectedEmployee?.value || null,
      dayStayBooking: true,
    };
    const meta = {
      hotelName: hotel.hotelName,
      address: hotel.hotelAddress || hotel.city,
      starRating: hotel.starRating || 0,
      phone: hotel.contactNumber || "",
      hotelImage: hotel.hotelImage,
    };
    try {
      sessionStorage.setItem(
        "roomListPayload",
        JSON.stringify({
          payload,
          meta,
          currency: { code: displayCurrencyCode, factor: convertFromAed(1) },
        }),
      );
    } catch (e) {
      console.error("Failed to write sessionStorage:", e);
    }
    setClickedHotelIds((prev) =>
      prev.includes(hotel.contractId) ? prev : [...prev, hotel.contractId],
    );
    window.open("/api-room-list", "_blank");
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
    // A new search has its own price range, so the Budget starts from the full
    // range again (as on /new-booking/hotel).
    setPriceSlider(null);
    // Supplier hotels (switch on only) — started first so they search while
    // the day-stay contracts load. Nothing runs here while the switch is off.
    if (apiHotelsEnabled) startSupplierSearch();
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

  // Track the summary strip's live height, as /new-booking/hotel does, so the
  // sticky progress bar sits right below it instead of under it.
  useEffect(() => {
    if (!collapseSearch) {
      setSummaryBarHeight(0);
      return undefined;
    }
    const el = summaryBarRef.current;
    if (!el) return undefined;
    setSummaryBarHeight(el.offsetHeight);
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => {
      const h = el.offsetHeight;
      setSummaryBarHeight((prev) => (prev === h ? prev : h));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [collapseSearch]);

  // Search progress bar — the same bar /new-booking/hotel shows. It counts the
  // day-stay contract search as one source and, with supplier hotels on, each
  // supplier as another; it fills as each one answers and goes away once all
  // have. Until the suppliers report in, it says "Asking suppliers". If a
  // supplier never finishes it is hidden instead (TIMEOUT), like Long Stay.
  const supplierKeys = apiHotelsEnabled ? Object.keys(apiChannelStatuses) : [];
  const suppliersSearching = apiHotelsEnabled && apiPollStatus === "IN_PROGRESS";
  const progressPollStatus = !hasSearched
    ? "IDLE"
    : isLoading || suppliersSearching
      ? "IN_PROGRESS"
      : apiHotelsEnabled && apiPollStatus === "TIMEOUT"
        ? "TIMEOUT"
        : "COMPLETED";
  const searchProgress =
    suppliersSearching && supplierKeys.length === 0
      ? { total: 0, answered: 0, failed: 0, complete: false }
      : {
          total: 1 + supplierKeys.length,
          answered:
            (isLoading ? 0 : 1) +
            supplierKeys.filter((k) => apiChannelStatuses[k] === "COMPLETED")
              .length,
          failed: 0,
          complete: progressPollStatus === "COMPLETED",
        };
  const hotelsSoFar =
    new Set(results.map((h) => h.hotelId)).size +
    (apiHotelsEnabled ? apiHotels.length : 0);

  // Result card for a supplier hotel (switch on only). Same frame as the
  // day-stay card below; the chip names the supplier (agents see "API"), and the
  // price is the supplier's rate for one night from the check-in date.
  const renderSupplierHotelCard = (hotel) => {
    const adultsN = totalAdults || 1;
    const childrenN = totalChildren;
    const roomsN = totalRooms || 1;
    return (
      <Col xs={12} key={hotel.contractId}>
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
              <div style={{ position: "relative", height: "100%", padding: "10px" }}>
                {/* Same photo box as /new-booking/hotel (hs-hotel-img in
                    HotelSearch.css): the photo fills the card's height and is
                    cropped, so a tall photo can't stretch the card. */}
                <div
                  className="ratio rounded-xl overflow-hidden hs-hotel-img"
                  style={{ "--bs-aspect-ratio": "66.25%" }}
                >
                  <img
                    src={hotel.hotelImage}
                    alt={hotel.hotelName}
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.src =
                        "https://via.placeholder.com/480x270?text=Hotel";
                    }}
                    className="img-cover"
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
                  {hotel.starRating || 0}
                  {/* Supplier pill — same grey pill and capitals as the
                      /new-booking/hotel result card, and like that page it is
                      hidden for every agent-side login. */}
                  {!isAgentLogin() && (
                    <span
                      style={{
                        marginLeft: "5px",
                        backgroundColor: "#6c757d",
                        padding: "2px 6px",
                        borderRadius: "10px",
                      }}
                    >
                      {String(hotel.apiType || "API").toUpperCase()}
                    </span>
                  )}
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
                <p style={{ fontSize: "0.875rem", color: "#666", marginBottom: "4px" }}>
                  📍 {hotel.hotelAddress || hotel.city || "Address Not Available"}
                </p>
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
                      backgroundColor: hotel.fromRate ? "#28a745" : "#6c757d",
                      color: "white",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      fontSize: "0.75rem",
                      display: "inline-block",
                    }}
                  >
                    {hotel.fromRate ? "Rate Available" : "Rate Unavailable"}
                  </span>
                  <span
                    style={{
                      backgroundColor: "#0d6efd",
                      color: "white",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      fontSize: "0.75rem",
                      display: "inline-block",
                    }}
                  >
                    1 night stay from the check-in date
                  </span>
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
                    <div style={{ fontSize: "1.1rem", fontWeight: "600", color: "#333" }}>
                      {hotel.fromRate
                        ? `from ${displayCurrencyCode} ${convertFromAed(
                            hotel.fromRate,
                          ).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`
                        : "Rate on request"}
                    </div>
                    <small className="text-muted">
                      1 night · {adultsN} adult{adultsN > 1 ? "s" : ""}
                      {childrenN
                        ? `, ${childrenN} child${childrenN > 1 ? "ren" : ""}`
                        : ""}{" "}
                      · {roomsN} room{roomsN > 1 ? "s" : ""}
                    </small>
                  </div>
                  <Button
                    size="sm"
                    variant={
                      clickedHotelIds.includes(hotel.contractId)
                        ? "secondary"
                        : "primary"
                    }
                    onClick={() => openSupplierRooms(hotel)}
                  >
                    View Rooms
                  </Button>
                </div>
              </div>
            </Col>
          </Row>
        </div>
      </Col>
    );
  };

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
            <div className="hs-summary-bar" ref={summaryBarRef}>
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

          {/* ── Progress Bar ──
              Same bar and placement as /new-booking/hotel: between the search
              summary/form and the results, sticky while the search runs. The
              --below-summary modifier moves it down below the collapsed
              summary strip so the strip doesn't cover it. */}
          <div
            className={
              collapseSearch
                ? "hs-progress-anchor hs-progress--below-summary"
                : "hs-progress-anchor"
            }
            style={{ "--hs-summary-h": `${summaryBarHeight}px` }}
          >
            <HotelSearchProgressBar
              pollStatus={progressPollStatus}
              progress={searchProgress}
              hotelsSoFar={hotelsSoFar}
              isLoading={isLoading}
            />
          </div>

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
              {results.length === 0 &&
                !isLoading &&
                // With supplier hotels on, wait for them too before saying
                // nothing was found. Off, this is the original condition.
                (!apiHotelsEnabled ||
                  (apiHotels.length === 0 && apiPollStatus !== "IN_PROGRESS")) && (
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
                // Budget slider + price chart: worked out over every hotel
                // found (before any other filter), the same way Last Minute
                // does — PRICE_HISTOGRAM_BARS equal-width bars across
                // [floor(cheapest), ceil(dearest)], at least 1 wide. Null
                // (section hidden) until a hotel has a price.
                // Supplier hotels — an empty list while the switch is off, so
                // everything below then works on the day-stay contracts alone,
                // exactly as before.
                const supplierRows = apiHotelsEnabled ? apiHotels : [];
                const candidates =
                  supplierRows.length > 0
                    ? [...deduped, ...supplierRows]
                    : deduped;
                // Channels with at least one hotel in the results: the LIVE /
                // OFF badge, with the same meaning it has on Long Stay.
                const channelsWithResults = new Set([
                  ...deduped.map((h) =>
                    String(h.channelType || "inhouse").toLowerCase(),
                  ),
                  ...supplierRows.map((h) => h.channelType),
                ]);
                // The AED price a card shows: the day-stay rate for a
                // contract, the supplier's one-night rate for a supplier hotel.
                const priceOf = (h) =>
                  isSupplierDayStayHotel(h)
                    ? h.fromRate
                    : dayStayDisplayRateOf(h);
                const priceBounds = (() => {
                  const rates = candidates
                    .map((h) => priceOf(h))
                    .filter((r) => Number.isFinite(r) && r > 0);
                  if (rates.length === 0) return null;
                  let min = rates[0];
                  let max = rates[0];
                  rates.forEach((r) => {
                    if (r < min) min = r;
                    if (r > max) max = r;
                  });
                  const lo = Math.floor(min);
                  const hi = Math.max(Math.ceil(max), lo + 1);
                  const width = (hi - lo) / PRICE_HISTOGRAM_BARS;
                  const histogram = new Array(PRICE_HISTOGRAM_BARS).fill(0);
                  rates.forEach((r) => {
                    const i = Math.floor((r - lo) / width);
                    histogram[
                      Math.max(0, Math.min(PRICE_HISTOGRAM_BARS - 1, i))
                    ] += 1;
                  });
                  return { min: lo, max: hi, histogram };
                })();
                const budgetMin = priceBounds ? priceBounds.min : 0;
                const budgetMax = priceBounds ? priceBounds.max : 0;
                const minPrice = priceSlider?.[0] ?? null;
                const maxPrice = priceSlider?.[1] ?? null;
                const needle = hotelSearchTerm.trim().toLowerCase();
                const displayed = candidates
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
                  // Budget — inclusive AED bounds; an open (null) end sets no
                  // limit on that side. While a bound is set, hotels without
                  // a rate ("Rate on request") are hidden. Same rule as
                  // /new-booking/hotel and Last Minute.
                  .filter((h) => {
                    if (minPrice === null && maxPrice === null) return true;
                    const p = priceOf(h);
                    return (
                      Number.isFinite(p) &&
                      (minPrice === null || p >= minPrice) &&
                      (maxPrice === null || p <= maxPrice)
                    );
                  })
                  // Refund Policy — strict, as on /new-booking/hotel: only
                  // hotels known to have a rate of the ticked kind stay;
                  // unknown (still being checked, or the check failed) is
                  // hidden too.
                  .filter((h) =>
                    refundActive
                      ? refundPolicyMatches(
                          refundPolicy,
                          isSupplierDayStayHotel(h)
                            ? supplierRefundFlags(h)
                            : refundFlagsByKey[refundKeyByHotel.get(h.hotelId)],
                        )
                      : true,
                  )
                  .sort((a, b) => {
                    // Supplier hotels in the list: compare the price each card
                    // shows, with hotels that have no rate last. Day-stay
                    // contracts alone keep the original order below.
                    if (supplierRows.length > 0) {
                      const pa = Number(priceOf(a)) || 0;
                      const pb = Number(priceOf(b)) || 0;
                      if (!pa || !pb) return (pb ? 1 : 0) - (pa ? 1 : 0);
                      return sortBy === "priceDesc" ? pb - pa : pa - pb;
                    }
                    const ra = Number(a.dayStayRate || 0);
                    const rb = Number(b.dayStayRate || 0);
                    return sortBy === "priceDesc" ? rb - ra : ra - rb;
                  });
                const totalDisplayed = displayed.length;
                // Paging, 10 a page like /new-booking/hotel. The page is kept
                // inside the range in case the list shrank.
                const totalPages = Math.max(
                  1,
                  Math.ceil(totalDisplayed / PAGE_SIZE),
                );
                const currentPage = Math.min(pageIndex, totalPages - 1);
                const pageHotels = displayed.slice(
                  currentPage * PAGE_SIZE,
                  (currentPage + 1) * PAGE_SIZE,
                );
                const startEntry =
                  totalDisplayed === 0 ? 0 : currentPage * PAGE_SIZE + 1;
                const endEntry = Math.min(
                  totalDisplayed,
                  (currentPage + 1) * PAGE_SIZE,
                );
                const pageNumbers = pageButtons(currentPage, totalPages);
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

                            {/* Hotel-name search moved to the top filter
                                row, next to Clear — same placement as
                                /new-booking/hotel. Same state and handler. */}

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

                            {/* Budget — a bar chart of how many hotels sit
                                at each price, with a two-handle slider under
                                it to narrow the list. Same control and
                                placement as /new-booking/hotel. Values are
                                AED; labels are in the display currency.
                                Shown once any hotel has a price. */}
                            {priceBounds && (
                              <>
                                <Form.Group className="mb-2">
                                  <Form.Label className="fw-semibold small">
                                    Budget
                                  </Form.Label>
                                  <PriceRangeSlider
                                    min={budgetMin}
                                    max={budgetMax}
                                    value={[
                                      priceSlider?.[0] ?? budgetMin,
                                      priceSlider?.[1] ?? budgetMax,
                                    ]}
                                    // An end dragged back to its edge means
                                    // "no limit" on that side — stored as null.
                                    onChange={([lo, hi]) =>
                                      setPriceSlider(
                                        lo <= budgetMin && hi >= budgetMax
                                          ? null
                                          : [
                                              lo <= budgetMin ? null : lo,
                                              hi >= budgetMax ? null : hi,
                                            ],
                                      )
                                    }
                                    histogram={priceBounds.histogram}
                                    format={(aed) =>
                                      `${displayCurrencyCode} ${Math.round(
                                        convertFromAed(aed),
                                      ).toLocaleString()}`
                                    }
                                    ariaLabel="Budget"
                                  />
                                </Form.Group>

                                <hr />
                              </>
                            )}

                            {/* Refund Policy — same boxes and placement as
                                /new-booking/hotel. The boxes are mutually
                                exclusive: ticking one clears the others,
                                and unticking shows every hotel again. */}
                            <Form.Group className="mb-2">
                              <Form.Label className="fw-semibold small">
                                Refund Policy
                                {refundActive && refundFlagsLoading && (
                                  <span className="text-muted fw-normal ms-2">
                                    Checking…
                                  </span>
                                )}
                              </Form.Label>
                              <div className="filter-checkbox-list">
                                <Form.Check
                                  type="checkbox"
                                  id="refund-policy-refundable"
                                  label="Flexible"
                                  checked={refundPolicy.refundable}
                                  onChange={(e) =>
                                    setRefundPolicy({
                                      ...NO_REFUND_POLICY,
                                      refundable: e.target.checked,
                                    })
                                  }
                                />
                                <Form.Check
                                  type="checkbox"
                                  id="refund-policy-partial"
                                  label="Flexible - Partial"
                                  checked={refundPolicy.partial}
                                  onChange={(e) =>
                                    setRefundPolicy({
                                      ...NO_REFUND_POLICY,
                                      partial: e.target.checked,
                                    })
                                  }
                                />
                                <Form.Check
                                  type="checkbox"
                                  id="refund-policy-non-refundable"
                                  label="Non Refundable"
                                  checked={refundPolicy.nonRefundable}
                                  onChange={(e) =>
                                    setRefundPolicy({
                                      ...NO_REFUND_POLICY,
                                      nonRefundable: e.target.checked,
                                    })
                                  }
                                />
                              </div>
                            </Form.Group>

                            <hr />

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

                            {/* Channel — with supplier hotels switched on it
                                lists the channels enabled on
                                /admin/api-access with the same LIVE / OFF
                                badge as Long Stay, and (like Long Stay) is
                                hidden for agent logins so they never see a
                                supplier name. Switched off, it is the
                                original Inhouse-only list. */}
                            {(!apiHotelsEnabled || !isAgentLogin()) && (
                              <>
                            <hr />

                            <Form.Group>
                              <Form.Label className="fw-semibold small">
                                Channel
                              </Form.Label>
                              <div className="filter-checkbox-list">
                                {(apiHotelsEnabled
                                  ? allowedChannelOptions || channelTypeOptions
                                  : channelTypeOptions
                                ).map((item) => (
                                  <div
                                    key={item.value}
                                    className="d-flex align-items-center justify-content-between gap-2"
                                  >
                                  <Form.Check
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
                                  {/* Only meaningful once there are several channels. */}
                                  {apiHotelsEnabled && (
                                    <Badge
                                      bg={
                                        channelsWithResults.has(
                                          String(item.value).toLowerCase(),
                                        )
                                          ? "success"
                                          : "danger"
                                      }
                                      title={
                                        channelsWithResults.has(
                                          String(item.value).toLowerCase(),
                                        )
                                          ? "Hotels from this channel are in the results"
                                          : "No hotels from this channel in the results"
                                      }
                                    >
                                      {channelsWithResults.has(
                                        String(item.value).toLowerCase(),
                                      )
                                        ? "LIVE"
                                        : "OFF"}
                                    </Badge>
                                  )}
                                  </div>
                                ))}
                              </div>
                            </Form.Group>
                              </>
                            )}
                          </Card.Body>
                        </Card>
                      </div>
                    </Col>

                    {/* Right Content — sort bar + entry counter + cards */}
                    <Col lg={9}>
                      {(results.length > 0 || supplierRows.length > 0) && (
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
                                  setPriceSlider(null);
                                  setRefundPolicy(NO_REFUND_POLICY);
                                }}
                              >
                                Clear
                              </Button>

                              {/* Hotel-name search — moved here from the
                                  left sidebar, same spot and size as on
                                  /new-booking/hotel. Same state and
                                  handler. ms-auto keeps it at the right
                                  edge; on narrow screens it wraps below
                                  the sort pills. */}
                              <Form.Control
                                type="text"
                                placeholder="Search Hotel Name..."
                                value={hotelSearchTerm}
                                onChange={(e) =>
                                  setHotelSearchTerm(e.target.value)
                                }
                                className="ms-auto ps-3"
                                style={{
                                  height: "36px",
                                  maxWidth: "260px",
                                  minWidth: "180px",
                                }}
                              />
                            </div>
                          </Card.Body>
                        </Card>
                      )}

                      {/* Entry counter — mirrors HotelSearch's "Showing
                          X to Y of Z entries" strip, for the page on
                          screen (10 hotels a page). */}
                      {(results.length > 0 || supplierRows.length > 0) && (
                        <div className="d-flex justify-content-between align-items-center mb-3">
                          <small className="text-muted fw-semibold">
                            Showing {startEntry} to {endEntry} of{" "}
                            {totalDisplayed} entries
                          </small>
                        </div>
                      )}

                      <Row className="g-4">
                        {pageHotels.map((hotel) => {
                  // Supplier hotels get their own card (switch on only).
                  if (isSupplierDayStayHotel(hotel)) {
                    return renderSupplierHotelCard(hotel);
                  }
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
                              {/* Same photo box as /new-booking/hotel
                                  (hs-hotel-img in HotelSearch.css): the
                                  photo fills the card's height and is
                                  cropped, so a tall photo can't stretch
                                  the card. */}
                              <div
                                className="ratio rounded-xl overflow-hidden hs-hotel-img"
                                style={{ "--bs-aspect-ratio": "66.25%" }}
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
                                  className="img-cover"
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
                                {hotel.starRating || 0}
                                {/* Hidden for agent-side logins, like the
                                    pill on the /new-booking/hotel result
                                    card. */}
                                {!isAgentLogin() && (
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
                                )}
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

                      {/* Pagination — same buttons, look and place as
                          /new-booking/hotel, under the list. Shown once
                          there is more than one page. */}
                      {totalDisplayed > 0 && totalPages > 1 && (
                        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-4 mt-3">
                          <small className="text-muted fw-semibold"></small>
                          <Pagination className="mb-0 pagination-modern">
                            <Pagination.Prev
                              disabled={currentPage === 0}
                              onClick={() =>
                                goToPage(currentPage - 1, totalPages)
                              }
                            />
                            {pageNumbers.map((n) =>
                              typeof n === "number" ? (
                                <Pagination.Item
                                  key={n}
                                  active={n === currentPage + 1}
                                  onClick={() => goToPage(n - 1, totalPages)}
                                >
                                  {n}
                                </Pagination.Item>
                              ) : (
                                <Pagination.Ellipsis key={n} disabled />
                              ),
                            )}
                            <Pagination.Next
                              disabled={currentPage >= totalPages - 1}
                              onClick={() =>
                                goToPage(currentPage + 1, totalPages)
                              }
                            />
                          </Pagination>
                        </div>
                      )}
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
