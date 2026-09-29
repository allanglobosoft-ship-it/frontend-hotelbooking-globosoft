import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  Button,
  Row,
  Col,
  Form,
  Pagination,
  Spinner,
  FormControl,
} from "react-bootstrap";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import Select from "react-select";
import AgentSelect from "../components/AgentSelect";
import AgentCreditBalance from "../components/AgentCreditBalance";
import axiosInstance from "../components/AxiosInstance";
import { logAgentSearch } from "../utils/agentSearchLog";
import AdvertisementCarousel from "../components/AdvertisementCarousel";
import TimeApplyPicker from "../components/TimeApplyPicker";
import DateInput from "../components/DateInput";
import MapModal from "../components/map/MapModal";
import { ENABLE_MAP_PREVIEW } from "../config/featureFlags";
import { FaSearch, FaStar, FaInfoCircle } from "react-icons/fa";
import { useNavigate, useLocation } from "react-router-dom";
import "../styles/HotelSearch.css";

// ─────────────────────────────────────────────
// Search Progress Bar
// ─────────────────────────────────────────────
// Default supplier list — used when the caller has no company restriction
// or when the parent hasn't computed a narrower list yet. Kept out of
// component body so its identity is stable across renders.
const DEFAULT_PROGRESS_CHANNELS = [
  "inhouse",
  "iwtx",
  "x3",
  "ratehawk",
  "darina",
  "atharva",
  "jumeirah",
  "grn",
];

function SearchProgressBar({ pollStatus, completedChannels, channels, isLoading }) {
  const effectiveChannels =
    Array.isArray(channels) && channels.length > 0
      ? channels
      : DEFAULT_PROGRESS_CHANNELS;
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // isLoading covers the tiny window between the user's Search click and
    // pollStatus flipping to IN_PROGRESS (handleSearchSubmit resets pollStatus
    // to IDLE first). Without it, a Modify Search briefly hides the bar
    // because the previous COMPLETED state is wiped before the new poll has
    // started — the exact "accidentally hides" case the spec warns about.
    const isActive =
      pollStatus === "IN_PROGRESS" ||
      (!!isLoading && pollStatus !== "COMPLETED");
    if (isActive) {
      setVisible(true);
      const done = completedChannels.size;
      const target =
        done === 0
          ? 12
          : Math.min(90, 12 + (done / effectiveChannels.length) * 78);
      setProgress(target);
    } else if (pollStatus === "COMPLETED") {
      setProgress(100);
      const timer = setTimeout(() => setVisible(false), 900);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
      setProgress(0);
    }
  }, [pollStatus, completedChannels, isLoading]);

  if (!visible) return null;

  return (
    <div className="search-progress-bar-wrap">
      {/* Label row */}
      <div className="d-flex justify-content-between align-items-center mb-2">
        <span className="search-progress-label">Searching hotels...</span>
        <span className="search-progress-percent">{Math.round(progress)}%</span>
      </div>

      {/* Bar */}
      <div className="search-progress-track">
        <div
          className="search-progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Channel pills */}
      {/* <div className="search-progress-channels">
        {channels.map((ch) => {
          const done = completedChannels.has(ch);
          return (
            <span key={ch} className={`channel-pill ${done ? "done" : "pending"}`}>
              {done ? "✓" : <span className="pill-dot" />}
              {ch}
            </span>
          );
        })}
      </div> */}
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

// Maximum number of rooms allowed per booking.
const MAX_ROOMS = 5;

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

  const addRoom = () => {
    // Enforce the per-booking room cap.
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

            {/* Informational guidance only — shown ONLY when this room has
                more than 2 children, so users planning that case understand
                they may need an additional room. Does NOT validate or
                restrict; the counter, child-age inputs, search payload, and
                booking flow are all unchanged. */}
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
// Local placeholder the rest of the app already uses for missing photos.
const NO_IMAGE_SRC = "/images/not-available.jpg";

// Returns the image URL unchanged, or null when it can never load. Several
// supplier search legs send "https://details/…" or "https://deatails/…" to
// mean "no photo". A dotless host like that never resolves, yet the browser
// spent ~3s failing its DNS lookup for every such card.
function usableImageUrl(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const { protocol, hostname } = new URL(url, window.location.origin);
    if (protocol !== "http:" && protocol !== "https:") return null;
    if (hostname !== "localhost" && !hostname.includes(".")) return null;
    return url;
  } catch {
    return null;
  }
}

// One <link rel="preconnect"> per image host, so DNS + TLS setup for a
// supplier's image server is already done when a card lower down the page
// requests its photo.
const preconnectedImageOrigins = new Set();
function preconnectImageOrigin(url) {
  try {
    const { origin } = new URL(url, window.location.origin);
    if (
      origin === window.location.origin ||
      preconnectedImageOrigins.has(origin)
    ) {
      return;
    }
    preconnectedImageOrigins.add(origin);
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = origin;
    document.head.appendChild(link);
  } catch {
    // Unparseable URL — nothing to warm up.
  }
}

function LazyImage({ src, alt, className }) {
  const containerRef = useRef(null);
  const [inView, setInView] = useState(false);
  // Keyed by URL instead of plain booleans, so a card whose photo changes
  // starts over rather than keeping a stale loaded/failed flag.
  const [loadedSrc, setLoadedSrc] = useState(null);
  const [failedSrc, setFailedSrc] = useState(null);

  const supplierSrc = usableImageUrl(src);
  const imageSrc =
    supplierSrc && failedSrc !== supplierSrc ? supplierSrc : NO_IMAGE_SRC;
  const loaded = loadedSrc === imageSrc;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setInView(true);
              observer.disconnect();
            }
          });
        },
        // Start the request a little before the card scrolls into view.
        { rootMargin: "300px 0px" },
      );
      observer.observe(el);
      return () => observer.disconnect();
    } else {
      setInView(true);
    }
  }, []);

  useEffect(() => {
    if (supplierSrc) preconnectImageOrigin(supplierSrc);
  }, [supplierSrc]);

  // A broken supplier photo falls back to the placeholder; if even that
  // fails, drop the skeleton instead of letting it shimmer forever.
  const handleError = () => {
    if (imageSrc === NO_IMAGE_SRC) setLoadedSrc(imageSrc);
    else setFailedSrc(imageSrc);
  };

  // The supplier URL is requested exactly as sent. The old srcSet appended
  // ?w=&h= to it, which sent Akamai-hosted photos through Akamai's resizer
  // (3–4s cold, 5-minute browser cache instead of ~10 days) and mangled URLs
  // that already carry a query string, such as Darina's
  // ShowImg.aspx?params=…. loading="lazy" and fetchpriority="low" are gone
  // too: the IntersectionObserver already holds the <img> back until the
  // card is near the viewport, and low priority let other requests jump
  // ahead of photos that were already on screen.
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
          decoding="async"
          alt={alt}
          onLoad={() => setLoadedSrc(imageSrc)}
          onError={handleError}
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
// ── Props ────────────────────────────────────────────────────────────
// `force24Hour` (default false) is a hard opt-in for the dedicated
// "24 Hour Check-In" route at /new-booking/hotel-24hr. When true the
// search runs in 24-hour mode permanently (the toggle row is hidden,
// time inputs are always shown, and post-processing always probes the
// 24-hour configs). When false (the default `/new-booking/hotel` flow)
// the 24-hour UI is hidden entirely so the page is a clean normal
// hotel-booking flow — no toggle, no post-processing, no probe call.
// `religiousMode` (default false) is the same pattern as force24Hour —
// a hard opt-in for the dedicated Religious search route at
// /new-booking/religious. When true:
//   • the Destination / City picker is locked to a hardcoded list of
//     Mecca + Medina (no /api/province cascade, no search),
//   • the page heading picks up a "Religious" tag,
//   • the "View Rooms" navigation targets /religious-room-list instead
//     of /room-list, so RoomListReligious/HotelBookingPageReligious can
//     thread the flag through to the create payload + booking list
//     without touching the normal hotel-booking route.
export default function HotelSearch({
  force24Hour = false,
  religiousMode = false,
} = {}) {
  // Hardcoded destination options for the Religious flow — see
  // planning notes above. IDs pulled from master_state:
  //   5219  = Makkah (Saudi Arabia, country_id 233)
  //   10773 = Al Madinah Al Munawwarah (Saudi Arabia, country_id 233)
  // Kept as a module-level constant so it's trivially removable if the
  // religious flow is ever wound down.
  const RELIGIOUS_DESTINATIONS = [
    { value: 5219,  label: "Mecca (Makkah)",           countryId: 233, code: "SA" },
    { value: 10773, label: "Medina (Al Madinah)",     countryId: 233, code: "SA" },
  ];
  const [placeholder, setPlaceholder] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

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

  // Logged-in agent's name — for agent logins the booking is "done by" the
  // agent themselves, so the "Booking Done By Employee" picker is hidden and
  // this name is shown (and sent) instead. Same source the payload's
  // agentName uses for agent logins. Empty for admin/staff.
  const loggedInAgentName =
    localStorage.getItem("UserName") ||
    sessionStorage.getItem("UserName") ||
    "";

  // When user came here via "Edit -> Book Again" from a booking detail page,
  // parentBookingCode is in the URL (e.g. ?parentBookingCode=GLBIN37). It is
  // threaded through to HotelBookingPage so the new booking is saved as a
  // child of that primary booking (GLBIN37/1, GLBIN37/2, ...).
  const parentBookingCode = new URLSearchParams(location.search).get(
    "parentBookingCode"
  );
  const [nationalityList, setNationalityList] = useState([]);
  const [selectedNationality, setSelectedNationality] = useState(null);
  // Optional "Booking Done By Employee" selector — moved here from
  // HotelBookingPage. When set, the employeeId rides on the payload all
  // the way through RoomList → HotelBookingPage → /api/hotel-booking/create
  // so it's persisted on the new HotelBooking row.
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  // Agent-side staff for the "Booking Done On Behalf Of Agent Staff"
  // dropdown — separate from the admin-side employees above. Populated
  // from GET /api/sub-user/by-agent/{agentId} whenever the picked agent
  // changes. Empty list until an agent is chosen; the dropdown is hidden
  // when there are no sub-users for the picked agent.
  const [agentStaffOptions, setAgentStaffOptions] = useState([]);
  const [selectedAgentStaff, setSelectedAgentStaff] = useState(null);

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
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [nights, setNights] = useState(1);

  // Prefill check-in / check-out when this page is opened from the
  // /calendar date-range picker. The calendar hands the dates over via
  // React Router's navigation state (location.state.checkIn / checkOut)
  // so the URL stays clean; URL query params (?checkIn=...&checkOut=...)
  // are still honoured as a fallback so any older link or bookmark keeps
  // working. Runs once on mount and only when the fields are still
  // empty, so it never overwrites user edits or state from other flows.
  useEffect(() => {
    const stateIn = location.state && location.state.checkIn;
    const stateOut = location.state && location.state.checkOut;
    const params = new URLSearchParams(location.search || "");
    const qIn = stateIn || params.get("checkIn");
    const qOut = stateOut || params.get("checkOut");
    if (qIn && !checkIn) setCheckIn(qIn);
    if (qOut && !checkOut) setCheckOut(qOut);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Longest stay this search form allows. Enforced both when the user types
  // directly into the Nights field and when they pick a Check-Out date more
  // than MAX_NIGHTS days after Check-In.
  const MAX_NIGHTS = 15;
  const NIGHTS_LIMIT_MESSAGE = `Maximum stay allowed is ${MAX_NIGHTS} nights.`;
  // Guards the checkIn/checkOut effect below from immediately clearing the
  // limit error on the render that follows our own auto-corrective
  // setCheckOut call (see that effect for details).
  const isAutoCorrectingNights = useRef(false);
  const [agent, setAgent] = useState("");
  const [agentBalance, setAgentBalance] = useState(null);
  // Currency the balance is expressed in — populated from the same
  // /agent-credit-limit response now that the backend returns already-
  // converted balances alongside the raw AED number. Defaults to "AED" so
  // an older backend (before this fix) still renders correctly.
  const [agentBalanceCurrency, setAgentBalanceCurrency] = useState("AED");
  const [agentBalanceLoading, setAgentBalanceLoading] = useState(false);

  useEffect(() => {
    if (!agent) {
      setAgentBalance(null);
      setAgentBalanceCurrency("AED");
      return;
    }
    let cancelled = false;
    setAgentBalanceLoading(true);
    axiosInstance
      .get(`/api/agent-credit-limit/agent/${agent}`)
      .then((res) => {
        if (cancelled) return;
        // Prefer the agent-currency-converted figure; the backend returns
        // it alongside the raw AED field. Falls back to the AED value when
        // the backend is older than this fix (both fields will be null in
        // that case, so `??` chains land on the AED number).
        const converted =
          res?.data?.availableCreditLimitInAgentCurrency ??
          res?.data?.availableCreditLimit ??
          null;
        setAgentBalance(converted);
        setAgentBalanceCurrency(res?.data?.currencyCode || "AED");
      })
      .catch(() => {
        if (!cancelled) {
          setAgentBalance(null);
          setAgentBalanceCurrency("AED");
        }
      })
      .finally(() => {
        if (!cancelled) setAgentBalanceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agent]);
  const [rooms, setRooms] = useState([
    { adults: 1, children: 0, childAges: [] },
  ]);
  const [roomsOpen, setRoomsOpen] = useState(false);

  const [starRating, setStarRating] = useState(null);
  const [hotelType, setHotelType] = useState([]);
  const [channelType, setChannelType] = useState([]);
  // Per-company supplier allow-list — populated once on mount from
  // /api/hotel-search/my-allowed-suppliers. When `channelsUnrestricted`
  // is true (no company assigned or no picks made yet) the sidebar
  // channel filter keeps every option visible. Otherwise it narrows to
  // the codes in `allowedChannels` so admins/agents only see the
  // suppliers the super_admin has actually enabled for their company.
  //
  // Purely presentational — the server-side HotelApiCallerContext is
  // still the authoritative gate on which suppliers are queried.
  const [allowedChannels, setAllowedChannels] = useState(new Set());
  const [channelsUnrestricted, setChannelsUnrestricted] = useState(true);
  // Every supplier super_admin has enabled for this company — the same
  // list the /admin/api-access grid renders. Drives which rows appear
  // in the Channel filter sidebar (both admin-enabled AND admin-disabled
  // ones show, so the operator sees the same list as the admin page).
  // The LIVE/OFF badge on each row is separately driven by
  // `channelHasResults` (see below).
  const [registeredChannels, setRegisteredChannels] = useState(new Set());
  // Suppliers that contributed at least one hotel to the CURRENT search,
  // as reported by the backend's `channelCounts` (counted over the whole
  // deduplicated result set, before the apiType filter and before
  // pagination). This is what the LIVE/OFF badge reads — allResults only
  // ever holds the current page, so a supplier whose hotels sit on page
  // 3+ would otherwise wrongly read OFF.
  const [channelsWithResults, setChannelsWithResults] = useState(new Set());
  // Available Deals multi-select filter (array of option values).
  // Empty array = no filter. Matching is OR across selected options.
  const [availableDeals, setAvailableDeals] = useState([]);
  const [sortBy, setSortBy] = useState("priceAsc");
  const [hotelSearchTerm, setHotelSearchTerm] = useState("");
  const [errors, setErrors] = useState({});
  // "Explore on Map" modal — shows every currently-visible hotel with
  // usable coordinates. See components/map/MapModal.jsx.
  const [showMapModal, setShowMapModal] = useState(false);

  // ── Currency conversion (display only) ────────────────────────────────
  // Conversion is done in the BACKEND now — HotelSearchController resolves
  // the agent's configured currency (or the `displayCurrencyCode` request
  // override) and returns every card with `displayBaseRate` +
  // `displayCurrencyCode`, plus envelope-level `displayCurrencyCode` /
  // `displayCurrencyFactor` for the sessionStorage handoff to RoomList /
  // booking pages. The FE never picks a direction or looks up a rate — it
  // just renders the numbers the backend sent.
  //
  // The dropdown still exists for admin previews; its selection is passed
  // back to the search endpoint as `?displayCurrencyCode=` so the backend
  // re-runs the conversion against that override.
  const [currencyOptions, setCurrencyOptions] = useState([]);
  const [selectedCurrency, setSelectedCurrency] = useState(null);
  // Once the operator picks a currency manually we stop auto-defaulting it to
  // the agent's currency (so their choice sticks).
  const currencyTouchedRef = useRef(false);
  // Latest selected code, readable synchronously from async callbacks
  // (handleSearchSubmit after its POST await, the agent-default lookup).
  const selectedCurrencyCodeRef = useRef(null);
  // Envelope-level {code, factor} from the last backend response — used by
  // the sessionStorage handoff to RoomList / booking pages. `factor` is
  // "target-per-1-AED" (backend divides master_currency.value into 1), so
  // downstream `formatPrice(aed) = code + " " + aed * factor` renders the
  // correct amount with no direction guessing.
  const backendDisplayCurrencyRef = useRef({ code: "AED", factor: 1 });
  // Live target for the running poll's `displayCurrencyCode` param. The
  // pollUntilComplete closure re-reads this on every tick, so a picker
  // change flows into subsequent poll requests without restarting the
  // search. Setter also mutates the closed-over params object in place.
  const pollCurrencyCodeRef = useRef(null);
  const pollParamsRef = useRef(null);
  // Currency-version counter, bumped on every picker change. Any in-flight
  // request captures the version at send-time; if by the time the response
  // arrives the counter has advanced (user picked a new currency in the
  // interim), the response is DROPPED instead of merged — otherwise a
  // stale poll tick would overwrite freshly-fetched rows with old-currency
  // data. That was the "mixed AED/GBP cards" symptom in the screenshot.
  const currencyVersionRef = useRef(0);
  // For agent logins, the agent's own id (resolved below) used to default the
  // display currency to that agent's configured currency.
  const [selfAgentId, setSelfAgentId] = useState("");

  // ── 24 Hour Check-In opt-in state ────────────────────────────────────
  // When `is24HourCheckin` is true, the search post-processes results: each
  // hotel is probed against /api/24-hour-checkin/probe-bulk; ineligible
  // hotels are filtered out and the displayed rate is uplifted by the
  // configured percentage. When false, the search behaves exactly as before.
  // Seeded from `force24Hour` so the dedicated 24-hour route ships in
  // 24-hour mode from first render (no flicker). The normal route keeps
  // this false and the entire 24-hour code path stays dormant.
  const [is24HourCheckin, setIs24HourCheckin] = useState(force24Hour);
  const [checkInTime24, setCheckInTime24] = useState("14:00");
  const [checkOutTime24, setCheckOutTime24] = useState("14:00"); // +24h default
  // Map of hotelId → { eligible, percentage } returned by the probe endpoint.
  const [twentyFourHourMap, setTwentyFourHourMap] = useState({});
  const [clickedHotelIds, setClickedHotelIds] = useState([]);

  // Map of hotelId → { longStay, twentyFourHourCheckIn, lastMinute, dayStay,
  // meetAndSpace, govEmployeeDiscount, studentDiscount } returned by
  // /api/hotel-feature-flags. Drives the scrolling "Exclusive Deals" banner
  // above the search results and the per-hotel blinking "Flash Sale" pill.
  const [featureFlagsMap, setFeatureFlagsMap] = useState({});

  const [allResults, setAllResults] = useState([]);
  const [finalHotelSearchTerm, setFinalHotelSearchTerm] = useState("");
  // Mirror of finalHotelSearchTerm so the poll callback (a closure captured
  // at handleSearchSubmit-time) can read the live value and skip its merge
  // while a name filter is active. Without this the poll keeps repopulating
  // allResults with unfiltered rows, undoing /filter-by-name mid-poll.
  const finalHotelSearchTermRef = useRef("");
  useEffect(() => {
    finalHotelSearchTermRef.current = finalHotelSearchTerm;
  }, [finalHotelSearchTerm]);

  // Fetch the caller's per-company supplier allow-list once on mount so
  // the Channel sidebar filter can show only the suppliers the caller is
  // actually allowed to hit. Fail-open: any error keeps every channel
  // visible (matches the server-side "empty allow-list = no restriction"
  // rule) so a transient DB hiccup never accidentally narrows the UI.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axiosInstance.get(
          "/api/hotel-search/my-allowed-suppliers",
        );
        if (cancelled) return;
        const unrestricted = res?.data?.unrestricted !== false;
        const codes = Array.isArray(res?.data?.codes) ? res.data.codes : [];
        const registered = Array.isArray(res?.data?.registered)
          ? res.data.registered
          : [];
        setChannelsUnrestricted(unrestricted);
        setAllowedChannels(
          new Set(codes.map((c) => String(c || "").toLowerCase())),
        );
        setRegisteredChannels(
          new Set(registered.map((c) => String(c || "").toLowerCase())),
        );
      } catch (_) {
        if (!cancelled) {
          setChannelsUnrestricted(true);
          setAllowedChannels(new Set());
          setRegisteredChannels(new Set());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  // Sequence guard for /filter-by-name — an older response can arrive after
  // a newer one (500 ms debounce, no XHR cancel) and stomp results for the
  // wrong term. Only the response whose seq matches the latest issued call
  // is allowed to write to state.
  const nameSearchSeqRef = useRef(0);
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
  // Set of every supplier the backend has confirmed it fan-out'd to,
  // built from data.status keys as poll results arrive. Used as the
  // DENOMINATOR by SearchProgressBar so the "%" reflects the real
  // dispatched list (which varies by market/agent restrictions) —
  // previously the bar divided by a hardcoded 8-supplier default and
  // stalled at ~25% because only a subset ever reported back.
  const dispatchedChannelsRef = useRef(new Set());
  const [dispatchedChannels, setDispatchedChannels] = useState(new Set());
  const [searchId, setSearchId] = useState(null);
  // Bumped at the start of every search. fetchHotels and the currency
  // picker's /resultsOut refetch capture it at send time and drop their
  // response if another search has started since, so a slow reply that
  // belongs to the PREVIOUS search can never write that destination's rows
  // back into allResults after Modify Search → Search cleared them.
  const searchGenRef = useRef(0);
  // Bumped by every fetchHotels call that REPLACES allResults, so a slower
  // full-list /resultsOut reply (currency picker) can't overwrite a newer
  // page or hotel-name result.
  const replaceGenRef = useRef(0);
  const [isDestinationLoading, setIsDestinationLoading] = useState(false);
  const resultsRef = useRef(null);
  const [isInitialResultsLoaded, setIsInitialResultsLoaded] = useState(false);
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
    // { value: "villa", label: "Villa" },
    // { value: "resort", label: "Resort" },
    // { value: "apartment", label: "Apartment" },
  ];

  const channelTypeOptions = [
    { value: "inhouse", label: "Inhouse" },
     { value: "iwtx", label: "Iwtx" },
     { value: "x3", label: "x3" },
     { value: "atharva", label: "Atharva" },
     { value: "jumeirah", label: "Jumeirah" },
     { value: "ratehawk", label: "Ratehawk" },
     { value: "darina", label: "Darina" },
     { value: "grn", label: "GRN" },
     { value: "goglobal", label: "GoGlobal" },
  ];

  // Channel sidebar filter — every supplier super_admin has registered
  // for this caller's company (the exact rows the /admin/api-access page
  // renders) shows here, whether or not admin has enabled it. Each row
  // is then LIVE/OFF-badged below. When the caller is unrestricted (no
  // company, no allow-list, or auth failed) every hardcoded option
  // stays visible so no existing flow is affected.
  const visibleChannelTypeOptions = channelsUnrestricted
    ? channelTypeOptions
    : channelTypeOptions.filter((o) => registeredChannels.has(o.value));
  // SearchProgressBar's denominator — the list of suppliers we KNOW
  // the backend actually dispatched to. Comes from data.status keys
  // observed on the live poll (dispatchedChannels), with two fallbacks
  // so the bar still renders sensibly before the first poll returns:
  //   1. live dispatched list (arrives after the first successful poll)
  //   2. explicit allow-list when the caller has one (super_admin ∩
  //      admin-enabled) — same restriction the pill row used to use
  //   3. SearchProgressBar's own DEFAULT_PROGRESS_CHANNELS fallback
  const visibleProgressChannels = dispatchedChannels.size > 0
    ? Array.from(dispatchedChannels)
    : channelsUnrestricted
      ? undefined
      : channelTypeOptions
          .filter((o) => allowedChannels.has(o.value))
          .map((o) => o.value);

  // (channelHasResults is defined further down, right after
  // filteredResults, so the LIVE/OFF badge reflects what is actually
  // visible on screen instead of the full unfiltered result set.)

  // Available Deals filter options. Each option maps to a per-hotel
  // predicate evaluated against the feature-flag map and the search
  // DTO's hasDestinationSales flag. "Flash Sale" matches any hotel
  // with at least one feature label (mirrors the corner badge logic).
  const availableDealsOptions = [
    { value: "flashSale",        label: "Flash Sale" },
    { value: "longStay",         label: "Long Stay" },
    { value: "twentyFourHour",   label: "24 Hour Check-In" },
    { value: "lastMinute",       label: "Last Minute" },
    { value: "dayStay",          label: "Day Stay" },
    { value: "meetingSpace",     label: "Meeting & Space" },
    { value: "govEmployee",      label: "Govt Employee Discount" },
    { value: "studentDiscount",  label: "Student Discount" },
    { value: "seniorCitizen",    label: "Senior Citizen" },
    { value: "destinationSales", label: "Destination Sales" },
  ];

  useEffect(() => {
    let index = 0;
    let isDeleting = false;
    const interval = setInterval(() => {
      if (!isDeleting) {
        setPlaceholder(fullText.slice(0, index + 1));
        index++;
        if (index === fullText.length)
          setTimeout(() => (isDeleting = true), 900);
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
      // Religious flow — freeze the dropdown to Mecca + Medina; typed
      // input never triggers a network search and can never surface any
      // other city. Filter the fixed list by the typed prefix so the
      // dropdown still narrows as the user types.
      if (religiousMode) {
        const q = (searchText || "").trim().toLowerCase();
        setDestinationOptions(
          q
            ? RELIGIOUS_DESTINATIONS.filter((o) =>
                o.label.toLowerCase().includes(q),
              )
            : RELIGIOUS_DESTINATIONS,
        );
        return;
      }
      if (!searchText || searchText.length < 2) {
        setDestinationOptions([]);
        return;
      }
      setIsDestinationLoading(true);
      try {
        // Tokenize on whitespace/commas so multi-word queries like
        // "van turkey" or "Van, Turkey" actually work. The backend's
        // /api/province?search= does a whole-string contains match and
        // returns 0 rows for either of those, but returns 165 rows for
        // just "van" (with "Van, Turkey" buried at index 162). We hit
        // the backend with the LONGEST token — the most specific one,
        // less likely to over-match a common prefix — then filter and
        // rank client-side so exact/starts-with city matches surface
        // above hits that only contain the token as a substring.
        const tokens = searchText
          .trim()
          .toLowerCase()
          .split(/[\s,]+/)
          .filter(Boolean);
        if (tokens.length === 0) {
          setDestinationOptions([]);
          return;
        }
        const backendQuery = tokens.reduce(
          (a, b) => (b.length > a.length ? b : a),
          tokens[0],
        );

        const response = await axiosInstance.get(
          `/api/province?search=${encodeURIComponent(backendQuery)}`,
        );
        const cityApiRes = Array.isArray(response.data) ? response.data : [];

        // Rank each row by how well it matches the FULL query. Rows
        // that don't contain every token in stateName + country are
        // dropped so a two-word query behaves like AND (matches "Van
        // + Turkey" but not "Vannes + France").
        const query = tokens.join(" ");
        const scored = [];
        for (const city of cityApiRes) {
          const sn = String(city.stateName || "").toLowerCase();
          const cn = String(city.country || "").toLowerCase();
          const combined = `${sn} ${cn}`;
          if (!tokens.every((t) => combined.includes(t))) continue;

          let score = 0;
          if (sn === query) score += 1000;
          if (tokens.some((t) => sn === t)) score += 800;
          if (sn.startsWith(tokens[0])) score += 500;
          if (tokens.length > 1 && cn === tokens[tokens.length - 1])
            score += 400;
          if (
            tokens.length > 1 &&
            tokens.slice(1).every((t) => cn.includes(t))
          )
            score += 300;
          if (sn.includes(query)) score += 200;
          if (sn.includes(tokens[0])) score += 100;
          // Slight tiebreaker so a shorter, tighter name wins over a
          // long incidental substring match.
          score -= Math.min(50, sn.length * 0.5);

          scored.push({ city, score });
        }
        scored.sort((a, b) => b.score - a.score);

        const options = scored.slice(0, 50).map(({ city }) => ({
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
    }, 300),
  ).current;

  const debouncedSetFinalTerm = useRef(
    debounce((term) => {
      setFinalHotelSearchTerm(term);
    }, 500),
  ).current;

  useEffect(() => {
    if (checkIn && checkOut) {
      // Skip the recompute that follows our own corrective setCheckOut call
      // below — otherwise this second pass would immediately recompute a
      // within-limit diff and clear the error message before the user sees it.
      if (isAutoCorrectingNights.current) {
        isAutoCorrectingNights.current = false;
        return;
      }
      const start = new Date(checkIn);
      const end = new Date(checkOut);
      const diff = Math.max(
        1,
        Math.ceil((end - start) / (1000 * 60 * 60 * 24)),
      );
      if (diff > MAX_NIGHTS) {
        const cappedOut = new Date(start);
        cappedOut.setDate(start.getDate() + MAX_NIGHTS);
        const iso = new Date(
          cappedOut.getTime() - cappedOut.getTimezoneOffset() * 60000,
        )
          .toISOString()
          .slice(0, 10);
        isAutoCorrectingNights.current = true;
        setNights(MAX_NIGHTS);
        setCheckOut(iso);
        setErrors((prev) => ({ ...prev, nights: NIGHTS_LIMIT_MESSAGE }));
      } else {
        setNights(diff);
        clearError("nights");
      }
    }
  }, [checkIn, checkOut]);

  const handleNightsChange = (value) => {
    const raw = Math.max(1, Number(value) || 1);
    const capped = Math.min(raw, MAX_NIGHTS);
    setNights(capped);
    if (raw > MAX_NIGHTS) {
      setErrors((prev) => ({ ...prev, nights: NIGHTS_LIMIT_MESSAGE }));
    } else {
      clearError("nights");
    }
    if (checkIn) {
      const start = new Date(checkIn);
      const out = new Date(start);
      out.setDate(start.getDate() + capped);
      const iso = new Date(out.getTime() - out.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 10);
      // Capped means the checkOut we're about to set already reflects
      // MAX_NIGHTS, so suppress the checkIn/checkOut effect's own recompute
      // for the same reason as above.
      if (raw > MAX_NIGHTS) isAutoCorrectingNights.current = true;
      setCheckOut(iso);
    }
  };

  // ── Hotel feature flags ───────────────────────────────────────────────
  // Backend: GET /api/hotel-feature-flags?ids=1,2,3
  // Returns { hotels: { "1": { longStay, twentyFourHour, lastMinute, dayStay,
  // meetingSpace, govEmployee, studentDiscount, anyFeature, features: [...] }},
  // summary: { anyFeature, features: [...] } }. We re-fetch whenever the result
  // set changes (new search, channel filter, pagination) so the banner only
  // surfaces features actually present in the visible hotels.

  // Pull the numeric tail off the hotelCode ("IN5" → 5) — same trick the
  // 24-hour probe uses, so the feature-flag map (keyed by numeric id) lines
  // up with the search result rows (keyed by prefixed code).
  const extractHotelNumericId = (h) => {
    if (h?.hotelId != null) return String(h.hotelId);
    const raw = String(h?.hotelCode || h?.id || "");
    const m = raw.match(/(\d+)$/);
    return m ? m[1] : null;
  };

  // Comma-joined, sorted, de-duped id list. Sorted so the dependency string
  // stays stable when the underlying array is just reordered — avoids a
  // spurious re-fetch.
  const resultHotelIdsCsv = useMemo(() => {
    const ids = new Set();
    allResults.forEach((h) => {
      const id = extractHotelNumericId(h);
      if (id) ids.add(id);
    });
    return Array.from(ids).sort((a, b) => Number(a) - Number(b)).join(",");
  }, [allResults]);

  useEffect(() => {
    if (!resultHotelIdsCsv) {
      setFeatureFlagsMap({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await axiosInstance.get(
          `/api/hotel-feature-flags?ids=${resultHotelIdsCsv}`
        );
        if (cancelled) return;
        const hotels = res?.data?.hotels || {};
        setFeatureFlagsMap(hotels);
      } catch (err) {
        console.warn("hotel-feature-flags fetch failed (non-fatal):", err);
        if (!cancelled) setFeatureFlagsMap({});
      }
    })();
    return () => { cancelled = true; };
  }, [resultHotelIdsCsv]);

  const getHotelFeatureLabels = (hotel) => {
    const id = extractHotelNumericId(hotel);
    if (!id) return [];
    const flags = featureFlagsMap[id];
    if (!flags) return [];
    return Array.isArray(flags.features) ? flags.features : [];
  };

  // Maps each canonical feature label to a CSS modifier class AND the
  // dedicated booking-page route the user is sent to when they click the
  // pill. Unknown labels degrade to the default pill styling and the
  // click is a no-op (we skip the navigation when route is undefined).
  const DEAL_PILL_META = {
    "Last Minute":             { cls: "deal-last-minute", route: "/new-booking/last-minute-booking" },
    "Long Stay":               { cls: "deal-long-stay",   route: "/new-booking/long-stay"           },
    "Day Stay":                { cls: "deal-day-stay",    route: "/new-booking/day-stay"            },
    "24 Hour Check-In":        { cls: "deal-24h",         route: "/new-booking/hotel-24hr"          },
    "Govt Employee Discount":  { cls: "deal-gov",         route: "/new-booking/gov-employee"        },
    "Student Discount":        { cls: "deal-student",     route: "/new-booking/student"             },
    "Meeting & Space":         { cls: "deal-meeting",     route: "/new-booking/meet-and-space"      },
    "Honeymoon":               { cls: "deal-honeymoon",   route: "/new-booking/honeymoon"           },
  };

  const filteredResults = useMemo(() => {
    let results = allResults;

    // Hotel Name filter (client-side): case-insensitive, whitespace-
    // tokenized substring match — ALL tokens must appear somewhere in
    // hotel.name. Handles the "smart hyde" → "Smart Hyde Park Inn" case
    // that the backend's whole-string /filter-by-name endpoint rejects,
    // and normalizes redundant whitespace between tokens ("smart   hyde").
    const rawNameQuery = String(hotelSearchTerm || "").trim();
    if (rawNameQuery) {
      const tokens = rawNameQuery.toLowerCase().split(/\s+/).filter(Boolean);
      if (tokens.length > 0) {
        results = results.filter((hotel) => {
          const name = String(hotel?.name || "").toLowerCase();
          return tokens.every((t) => name.includes(t));
        });
      }
    }

    if (starRating) {
      results = results.filter(
        (hotel) => Number(hotel.rating) === Number(starRating.value),
      );
    }
    if (hotelType.length > 0) {
      const selectedTypes = hotelType.map((t) => t.value);
      results = results.filter((hotel) =>
        selectedTypes.includes(hotel.hotelType),
      );
    }
    if (channelType.length > 0) {
      const selectedChannels = channelType.map((c) => c.value);
      results = results.filter((hotel) =>
        selectedChannels.includes(hotel.channelType),
      );
    }

    // Available Deals — OR-match across the selected option values.
    if (availableDeals.length > 0) {
      const selected = new Set(availableDeals.map((d) => d.value));
      const hasFeatureLabel = (hotel, label) =>
        getHotelFeatureLabels(hotel).some(
          (f) => String(f).toLowerCase() === String(label).toLowerCase()
        );
      results = results.filter((hotel) => {
        if (selected.has("flashSale") && getHotelFeatureLabels(hotel).length > 0) return true;
        if (selected.has("longStay") && hasFeatureLabel(hotel, "Long Stay")) return true;
        if (selected.has("twentyFourHour") && hasFeatureLabel(hotel, "24 Hour Check-In")) return true;
        if (selected.has("lastMinute") && hasFeatureLabel(hotel, "Last Minute")) return true;
        if (selected.has("dayStay") && hasFeatureLabel(hotel, "Day Stay")) return true;
        if (selected.has("meetingSpace") && hasFeatureLabel(hotel, "Meeting & Space")) return true;
        if (selected.has("govEmployee") &&
            (hasFeatureLabel(hotel, "Govt Employee Discount") || hasFeatureLabel(hotel, "Govt Employee"))) return true;
        if (selected.has("studentDiscount") && hasFeatureLabel(hotel, "Student Discount")) return true;
        if (selected.has("seniorCitizen") && hasFeatureLabel(hotel, "Senior Citizen")) return true;
        if (selected.has("destinationSales") && hotel.hasDestinationSales === true) return true;
        return false;
      });
    }

    // ── 24 Hour Check-In transform ──────────────────────────────────
    // When the toggle is on, keep ONLY hotels the probe marked eligible
    // and uplift the displayed price by the configured percentage.
    //
    // The probe-bulk response is keyed by the numeric hotel_id ("5"), but
    // hotel.hotelCode is the prefixed string ("IN5"). Strip the non-digit
    // prefix the same way we did when building the probe payload, so the
    // map lookup actually hits.
    if (is24HourCheckin) {
      const numericId = (code) => {
        const m = String(code || "").match(/(\d+)$/);
        return m ? m[1] : null;
      };
      results = results
        .filter((hotel) => {
          const meta = twentyFourHourMap[numericId(hotel.hotelCode)];
          return meta && meta.eligible;
        })
        .map((hotel) => {
          const meta = twentyFourHourMap[numericId(hotel.hotelCode)];
          const pct = Number(meta?.percentage || 0);
          const base = Number(hotel.price || 0);
          const uplifted = +(base * (1 + pct / 100)).toFixed(2);
          // The card renders displayPrice, so convert the uplifted AED price
          // once with the backend factor (same maths as RoomList).
          const factor = Number(hotel.displayFactor) > 0 ? Number(hotel.displayFactor) : 1;
          const displayPrice =
            pct > 0 ? Math.round(uplifted * factor * 100 + 1e-9) / 100 : hotel.displayPrice;
          return { ...hotel, price: uplifted, displayPrice, _twentyFourHourPercentage: pct };
        });
    }

    // Client-side sort so the visible list always matches the selected
    // sort pill (Low to High is the default). The backend sorts each page,
    // but the poll merges pages into `allResults` in insertion order via a
    // Map — so a late-arriving supplier's cheap hotel would appear at the
    // bottom of the list even when Low to High is selected. Re-sorting the
    // current page here fixes that. Only the sort keys the UI can actually
    // pick are handled; anything else keeps the incoming order.
    if (sortBy === "priceAsc" || sortBy === "priceDesc") {
      const dir = sortBy === "priceAsc" ? 1 : -1;
      // Copy so we don't mutate a memoized array from an earlier stage.
      results = [...results].sort((a, b) => {
        const pa = Number(a?.price);
        const pb = Number(b?.price);
        // Rows without a numeric price sink to the bottom regardless of
        // direction, so they never distort the top of the list.
        const aMissing = !Number.isFinite(pa);
        const bMissing = !Number.isFinite(pb);
        if (aMissing && bMissing) return 0;
        if (aMissing) return 1;
        if (bMissing) return -1;
        return (pa - pb) * dir;
      });
    }

    return results;
  }, [allResults, hotelSearchTerm, starRating, hotelType, channelType,
      availableDeals, featureFlagsMap,
      is24HourCheckin, twentyFourHourMap, sortBy]);

  // Channels that returned at least one hotel for the CURRENT search —
  // drives the LIVE/OFF badge next to each Channel filter row.
  // Rule: LIVE (green) = this supplier has hotels in the search result;
  // OFF (red) = it has none. Nothing about admin toggles.
  //
  // Source of truth is `channelsWithResults`, the backend's per-supplier
  // count over the WHOLE deduplicated result set (every page, before the
  // apiType checkbox filter). allResults only holds the current page, so
  // reading the badge off the page would mark a supplier OFF whenever its
  // hotels happen to sort onto a later page — exactly the "all OFF but
  // results are there" bug. The page-derived set is unioned in only as a
  // fallback for a backend that hasn't been restarted with channelCounts.
  const channelHasResults = useMemo(() => {
    const set = new Set(channelsWithResults);
    for (const h of allResults || []) {
      const ct = String(h?.channelType || "").toLowerCase();
      if (ct) set.add(ct);
    }
    return set;
  }, [channelsWithResults, allResults]);

  // Shared "View Rooms" handler — used by both the row-level button on the
  // hotel card and the "View Rooms" action inside the Explore-on-Map
  // popup. Builds the roomListPayload from the current search-page state
  // for the given hotel, stashes it in sessionStorage, and opens the
  // right room-list route in a new tab. Kept here (not memoized) because
  // it closes over most of the page's state and doesn't need reference
  // stability — the map popup only reads it on click.
  const openRoomListForHotel = (hotel) => {
    setClickedHotelIds((prev) => [...prev, hotel.id]);
    const nationalityCode =
      (selectedNationality?.code || "").length === 2
        ? selectedNationality.code
        : " ";
    const roomsPayload = rooms.map((r) => ({
      adults: r.adults || 1,
      children: r.children || 0,
      childAges: r.childAges || [],
      adultAges: Array.from({ length: r.adults || 1 }, () => 30),
    }));
    const apiIdMapping = {
      jumeirah: 10,
      iwtx: 12,
      x3: 15,
      inhouse: 1,
      ratehawk: 14,
      darina: 16,
      atharva: 3,
      grn: 20,
      goglobal: 21,
    };
    const apiId = apiIdMapping[hotel.channelType?.toLowerCase()] || 0;

    const pickedAgentId = String(isAgentRole ? selfAgentId : agent);
    const pickedAgent = (Array.isArray(agents) ? agents : []).find(
      (a) => String(a?.id) === pickedAgentId,
    );
    const agentName = isAgentRole
      ? localStorage.getItem("UserName") ||
        sessionStorage.getItem("UserName") ||
        ""
      : pickedAgent
        ? pickedAgent.companyName ||
          pickedAgent.name ||
          `${pickedAgent.firstName || ""} ${pickedAgent.lastName || ""}`.trim()
        : "";

    const payload = {
      checkInDate: checkIn,
      checkOutDate: checkOut,
      hotelCode:
        hotel.hotelCode ||
        hotel.id?.split("-").slice(1).join("-") ||
        "",
      nationality: nationalityCode,
      agentId: String(isAgentRole ? selfAgentId : agent),
      agentName,
      destinationLabel: selectedDestination?.label || "",
      nationalityLabel: selectedNationality?.label || "",
      employeeName: isAgentRole
        ? agentName || null
        : selectedEmployee?.label || null,
      nightsCount: nights,
      apiId,
      rooms: roomsPayload,
      parentBookingCode: parentBookingCode || null,
      employeeId: isAgentRole ? null : selectedEmployee?.value || null,
      // Booking Done On Behalf Of Agent Staff (sub-user of the picked agent);
      // forwarded RoomList -> HotelBookingPage -> POST /api/hotel-booking/create.
      agentStaffId:
        selectedAgentStaff?.value != null ? String(selectedAgentStaff.value) : null,
      agentStaffName: selectedAgentStaff?.label || null,
      is24HourCheckin: !!is24HourCheckin,
      checkInTime: is24HourCheckin ? checkInTime24 : null,
      checkOutTime: is24HourCheckin ? checkOutTime24 : null,
      twentyFourHourPercentage: hotel._twentyFourHourPercentage || null,
    };
    const meta = {
      hotelName: hotel.name,
      address: hotel.address || hotel.city,
      starRating: hotel.rating || 0,
      phone: "",
      hotelImage: hotel.image,
    };
    // Currency handoff comes from the backend (HotelSearchController): factor is
    // "target per 1 AED", so RoomList / booking pages render aed * factor.
    // Prefer the clicked card's own code/factor, else the last envelope value.
    const backendCurrency =
      backendDisplayCurrencyRef.current || { code: "AED", factor: 1 };
    const currency = hotel.displayCurrencyCode
      ? {
          code: hotel.displayCurrencyCode,
          factor:
            Number(hotel.displayFactor) > 0 ? Number(hotel.displayFactor) : 1,
        }
      : {
          code: backendCurrency.code || "AED",
          factor:
            Number.isFinite(backendCurrency.factor) && backendCurrency.factor > 0
              ? backendCurrency.factor
              : 1,
        };
    sessionStorage.setItem(
      "roomListPayload",
      JSON.stringify({ payload, meta, currency }),
    );
    setTimeout(() => {
      const route =
        religiousMode && apiId === 1
          ? "/religious-room-list"
          : force24Hour
            ? "/room-list-24hr"
            : apiId === 1
              ? "/room-list"
              : "/api-room-list";
      window.open(route, "_blank");
    }, 50);
  };

  // Union of active feature labels across hotels currently in view. Order
  // mirrors the backend's canonical ordering (Long Stay → 24 Hour Check-In
  // → Last Minute → Day Stay → Meeting & Space → Govt Employee Discount →
  // Student Discount) so the marquee text stays stable across renders.
  // Empty → deals banner is suppressed entirely.
  const activeFeatureLabels = useMemo(() => {
    const canonical = [
      "Long Stay",
      "24 Hour Check-In",
      "Last Minute",
      "Day Stay",
      "Meeting & Space",
      "Govt Employee Discount",
      "Student Discount",
    ];
    const set = new Set();
    filteredResults.forEach((h) => {
      getHotelFeatureLabels(h).forEach((label) => set.add(label));
    });
    return canonical.filter((l) => set.has(l));
  }, [filteredResults, featureFlagsMap]);

  const effectiveTotalPages = useMemo(
    () => Math.max(1, totalPages),
    [totalPages],
  );

  // Counter reflects rows that are actually rendered on screen, not the
  // raw server count. On the 24-hour route (and any flow where a
  // client-side filter — 24hr eligibility, star rating, deals, etc. —
  // trims the fetched page), filteredResults.length can be smaller than
  // the backend's totalElements. Using filteredResults for the range and
  // capping the "of X" at what's visible keeps the "Showing 1 to N of N"
  // pill honest without touching pagination controls (which still use
  // totalPages / totalElements from the server).
  const shownCount = filteredResults.length;
  const startEntry = shownCount === 0 ? 0 : pageIndex * pageSize + 1;
  const endEntry = pageIndex * pageSize + shownCount;
  const displayTotal =
    shownCount < allResults.length ? endEntry : Math.max(totalElements, endEntry);

  const pageNumbers = useMemo(() => {
    const current = pageIndex + 1;
    const total = effectiveTotalPages;
    const nums = [];
    if (total <= 7) {
      for (let i = 1; i <= total; i++) nums.push(i);
    } else {
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
    const total = effectiveTotalPages;
    if (idx < 0 || idx >= total) return;
    setPageIndex(idx);
    setTimeout(() => {
      if (resultsRef.current) {
        resultsRef.current.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    }, 0);
  };

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
        console.error("error for country search:", error);
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
        console.error("error for country list:", error);
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

  const cityList = (searchText = "") => debouncedCitySearch(searchText);

  const loadPopularDestinations = async () => {
    // Religious flow is scoped to Mecca + Medina only — skip the master
    // cities fetch entirely so the dropdown can't ever surface any other
    // city, even transiently while the async load is in flight.
    if (religiousMode) {
      setDestinationOptions(RELIGIOUS_DESTINATIONS);
      return;
    }
    if (destinationOptions.length > 0) return;
    try {
      setIsDestinationLoading(true);
      const response = await axiosInstance.get("/api/province?limit=50");
      const cityApiRes = Array.isArray(response.data) ? response.data : [];
      const options = cityApiRes.map((city) => ({
        value: city.id,
        // label: `${city.name}, ${city.state} , ${city.country}`,
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

  const agentList = async () => {
    try {
      const response = await axiosInstance.get("/api/agent?activeOnly=true");
      setAgents(response.data);
    } catch {
      setAgents([]);
    }
  };

  useEffect(() => {
    countryList();
    agentList();
  }, []);

  // Maps /api/currency rows to react-select options. Only active rows with a
  // positive rate are offered (the backend cannot convert into the others),
  // one option per code — master_currency holds a deleted duplicate BDT row.
  const mapCurrencyOptions = (list) => {
    const seenCodes = new Set();
    return (Array.isArray(list) ? list : [])
      .filter((c) => {
        if (!c || !c.currencyCode || c.isDeleted === true || !(Number(c.value) > 0)) {
          return false;
        }
        const code = c.currencyCode.trim().toUpperCase();
        if (seenCodes.has(code)) return false;
        seenCodes.add(code);
        return true;
      })
      .map((c) => ({
        value: c.currencyId,
        label: c.currencyCode,
        code: c.currencyCode,
        rate: Number(c.value),
      }));
  };

  // Fetches the currency list, passing the typed text as the backend `search`
  // param (server matches on currency name, e.g. "US dollar").
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

  // Load the currency list for the display-currency dropdown and default the
  // selection to AED (the base currency the rates arrive in).
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
  }, []);

  // Fetch the picked agent's own sub-users so the "Booking Done On
  // Behalf Of Agent Staff" dropdown can populate. Fires whenever the
  // Agent field changes (admin flow) or when the logged-in agent's own
  // id resolves (agent flow). Fire-and-forget; failures collapse the
  // options list to empty and the dropdown auto-hides.
  useEffect(() => {
    const resolvedAgentId = isAgentRole ? selfAgentId : agent;
    if (!resolvedAgentId) {
      setAgentStaffOptions([]);
      setSelectedAgentStaff(null);
      return;
    }
    let cancelled = false;
    axiosInstance
      .get(`/api/sub-user/by-agent/${resolvedAgentId}`)
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res?.data) ? res.data : [];
        setAgentStaffOptions(rows);
        // If the previously-selected staff no longer belongs to the
        // new agent (admin switched agents), clear the selection so
        // stale ids never ride onto the payload.
        setSelectedAgentStaff((prev) => {
          if (!prev) return prev;
          const stillValid = rows.some(
            (r) => String(r.id) === String(prev.id),
          );
          return stillValid ? prev : null;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setAgentStaffOptions([]);
        setSelectedAgentStaff(null);
      });
    return () => { cancelled = true; };
  }, [agent, selfAgentId, isAgentRole]);

  // For agent logins, resolve the agent's own id (cached userId else
  // /api/personalProfile/{UserName}) so we can look up their currency below.
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
        if (cancelled) return;
        if (res?.data?.id != null) {
          const idv = String(res.data.id);
          localStorage.setItem("userId", idv);
          setSelfAgentId(idv);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isAgentRole]);

  // Default the display currency to the agent's configured currency (instead
  // of AED): admins use the picked agent, agent logins their own id. Rates are
  // still quoted in AED — this only sets the initial dropdown selection so the
  // operator sees the agent's currency by default. Stops once the operator
  // changes the currency manually (currencyTouchedRef).
  useEffect(() => {
    selectedCurrencyCodeRef.current = selectedCurrency?.code || null;
  }, [selectedCurrency]);

  const currencyAgentId = isAgentRole ? selfAgentId : agent;
  useEffect(() => {
    if (currencyTouchedRef.current) return;
    if (!currencyAgentId || currencyOptions.length === 0) return;
    let cancelled = false;
    const searchGenAtRequest = searchGenRef.current;
    axiosInstance
      .get(`/api/agent/${currencyAgentId}`)
      .then((res) => {
        const code = res?.data?.currencyCode;
        if (cancelled || !code || currencyTouchedRef.current) return;
        const opt = currencyOptions.find((o) => o.code === code);
        // Skip the on-screen re-convert if a new search started meanwhile:
        // this closure's searchId would belong to the previous search.
        if (opt) {
          changeDisplayCurrency(opt, {
            reconvertAll: searchGenAtRequest === searchGenRef.current,
          });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currencyAgentId, currencyOptions]);

  // The display code shown next to card prices — mirrors the last backend
  // response so admin-override picks and the agent's default currency both
  // work. Falls back to the FE picker state on the first render, before any
  // response has landed.
  const displayCurrencyCode =
    backendDisplayCurrencyRef.current?.code || selectedCurrency?.code || "AED";

  // "Explore on Map" markers — one per currently-visible (filtered) hotel.
  // MapModal itself drops any entry whose lat/lng isn't a finite number, so
  // no need to pre-filter here. Enriched with the same fields the row-level
  // card shows (image, rating, channel badge, price, deal chips) so the
  // in-map popup gives the operator a real preview of the hotel instead of
  // just a name and address.
  const mapMarkers = useMemo(
    () =>
      filteredResults.map((hotel) => {
        const priceLabel = hotel.price
          ? `${hotel.displayCurrencyCode || displayCurrencyCode} ${Number(
              hotel.displayPrice != null ? hotel.displayPrice : hotel.price,
            ).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`
          : null;
        return {
          id: hotel.id,
          name: hotel.name,
          lat: hotel.latitude,
          lng: hotel.longitude,
          address: hotel.address,
          contactNumber: hotel.contactNumber,
          image: hotel.image || null,
          rating: Number(hotel.rating) || 0,
          channelType: hotel.channelType || null,
          hotelType: hotel.type || hotel.hotelType || null,
          priceLabel,
          dealLabels: getHotelFeatureLabels(hotel),
        };
      }),
    [filteredResults, displayCurrencyCode, featureFlagsMap],
  );

  useEffect(() => {
    setPageIndex(0);
    if (hasSearchResult && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [starRating, hotelType, channelType, sortBy]);

  // After a fresh search, jump the viewport to the very top of the page so
  // the operator sees the "Hotel / Accommodation" heading and summary strip
  // first, not just the results list further down. Fires once the first
  // batch of hotels actually arrives.
  useEffect(() => {
    if (!hasSearched || !isInitialResultsLoaded) return;
    const id = window.setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 50);
    return () => window.clearTimeout(id);
  }, [hasSearched, isInitialResultsLoaded]);

  const formatDate = (date) => date.toISOString().split("T")[0];
  const getTomorrow = (date = new Date()) => {
    const tomorrow = new Date(date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  };

  const today = formatDate(new Date());
  const minCheckOutDate = checkIn
    ? formatDate(getTomorrow(new Date(checkIn)))
    : formatDate(getTomorrow());

  const validateForm = () => {
    const newErrors = {};
    if (!selectedNationality) newErrors.nationality = "Nationality is required";
    if (!selectedDestination) newErrors.destination = "Destination is required";
    if (!checkIn) newErrors.checkIn = "Check-in date is required";
    if (!checkOut) newErrors.checkOut = "Check-out date is required";
    if (nights > MAX_NIGHTS) newErrors.nights = NIGHTS_LIMIT_MESSAGE;
    // Agent logins book under themselves (backend forces the agent id and the
    // picker is hidden), so the agent is never set manually — skip this check
    // for them or the search can never pass validation.
    if (!isAgentRole && !agent) newErrors.agent = "Agent is required";
    return newErrors;
  };

  const clearError = (field) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const { [field]: _omit, ...rest } = prev;
      return rest;
    });
  };

  const fetchHotels = async (page, sid, agentId, nameSearch = "", currencyCodeOverride = null) => {
    try {
      const isNameSearching = !!nameSearch.trim();
      // Capture a per-call seq only for name-search. Basic (unfiltered)
      // fetches don't need this — the poll loop is already the sole writer
      // for them and never races with itself.
      const mySeq = isNameSearching ? ++nameSearchSeqRef.current : null;
      // Client-side owns hotel-name matching now (see filteredResults memo)
      // so we always hit the plain /results endpoint. When a name filter is
      // active we pull the entire result set in one page (mirroring the
      // /resultsOut currency-refetch that already asks for size=100000) so
      // the tokenized client filter can look at every hotel, not just the
      // 10-row page slice — otherwise a hotel that sorts onto page 2+ could
      // never match a partial name typed on page 1.
      const NAME_SEARCH_PAGE_SIZE = 100000;
      const endpoint = `/api/hotel-search/results/${sid}`;

      const params = {
        agentId:
          agentId || (isAgentRole ? selfAgentId : agent) || 1,
        page: isNameSearching ? 0 : page,
        // pageSize is kept for the paginated case so existing behaviour is
        // preserved (backend defaults to 10 anyway). For the name-search
        // fetch we must send `size` — the backend's Pageable binder reads
        // `size` (verified: /results?pageSize=1000 returns 10, /results?
        // size=1000 returns 1000), matching the /resultsOut convention.
        pageSize: isNameSearching ? undefined : pageSize,
        size: isNameSearching ? NAME_SEARCH_PAGE_SIZE : undefined,
        sortBy:
          sortBy === "priceAsc" || sortBy === "priceDesc" ? "baseRate" : sortBy,
        sortOrder:
          sortBy === "priceAsc" ||
          sortBy === "ratingAsc" ||
          sortBy === "nameAsc"
            ? "asc"
            : "desc",
        starRating: starRating ? starRating.value : undefined,
        apiType:
          channelType.map((c) => c.value.toUpperCase()).join(",") || undefined,
      };

      // Currency-conversion is fully backend-side now. When the operator
      // picked an override from the (admin-only) currency dropdown we send
      // it as `displayCurrencyCode`; otherwise the backend defaults to the
      // agent's configured currency (Agent.currency_id → master_currency).
      //
      // `currencyCodeOverride` wins over the state read — the picker's
      // onChange calls fetchHotels with the just-picked code even though
      // setSelectedCurrency hasn't flushed yet, so the very first request
      // after a picker change already carries the new code.
      const effectiveCurrencyCode =
        currencyCodeOverride || selectedCurrency?.code;
      if (effectiveCurrencyCode) {
        params.displayCurrencyCode = effectiveCurrencyCode;
      }

      // hotelName is deliberately NOT sent — the client-side filter in
      // filteredResults does tokenized substring matching, which is broader
      // than the backend endpoint's whole-string match ("smart hyde" would
      // otherwise return zero even though "Smart Hyde Park Inn" is in the
      // result set). Server-side filters (starRating, apiType) still ride
      // on the same request so combined filtering keeps working.

      // Capture the currency-version at send-time; if the user picks a
      // different currency before the response lands, we DROP the response
      // rather than merge — otherwise a slow in-flight request would
      // overwrite freshly-fetched rows with old-currency data (that was
      // the "mixed AED/GBP cards" bug in the screenshot).
      const myCurrencyVersion = currencyVersionRef.current;
      const mySearchGen = searchGenRef.current;
      if (isNameSearching || pollStatus !== "IN_PROGRESS") {
        replaceGenRef.current += 1;
      }

      const res = await axiosInstance.get(endpoint, {
        params,
      });

      // A newer search has started since this request went out — its
      // payload belongs to the previous destination, so never let it touch
      // allResults / totals / hasSearchResult.
      if (mySearchGen !== searchGenRef.current) {
        return res.data;
      }

      // Drop stale name-search responses so an older term can't overwrite
      // results for the term the user is actually looking at.
      if (isNameSearching && mySeq !== nameSearchSeqRef.current) {
        return res.data;
      }

      // Same idea for currency: if the picker moved on, this response is
      // now stale — return the raw data (so the caller's Promise resolves
      // as before) without touching allResults.
      if (myCurrencyVersion !== currencyVersionRef.current) {
        return res.data;
      }

      const mappedResults = Array.isArray(res.data.result)
        ? res.data.result.map((hotel, index) => ({
            id: hotel.hotelCode
              ? `${sid}-${hotel.hotelCode}`
              : `${sid}-h${index + 1}`,
            searchId: sid,
            hotelCode: hotel.hotelCode || null,
            name: hotel.hotelName || "Unknown Hotel",
            address: hotel.hotelAddress || "",
            city: hotel.hotelAddress
              ? hotel.hotelAddress.split(", ").pop() || "Unknown City"
              : "Unknown City",
            price: hotel.baseRate || null,
            // Backend-converted price + code in the agent's display currency
            // (see HotelSearchController.applyDisplayCurrency). Card renderer
            // reads these; `price` (AED) stays the source of truth for every
            // downstream flow (sorting, dedupe, booking payloads, credit
            // checks) — same as before this fix.
            displayPrice:
              hotel.displayBaseRate != null ? hotel.displayBaseRate : hotel.baseRate,
            displayCurrencyCode:
              hotel.displayCurrencyCode || "AED",
            displayFactor:
              Number(res.data.displayCurrencyFactor) > 0
                ? Number(res.data.displayCurrencyFactor)
                : 1,
            badge: hotel.baseRate ? "Rate Available" : "Rate Unavailable",
            image:
              hotel.hotelImage ||
              "https://details/assets/details/profilepic/hotel/hoteldefault.jpg",
            rating: hotel.starRating || 0,
            hotelType: "hotel",
            channelType: hotel.apiType?.toLowerCase() || "inhouse",
            // Surface the backend-computed promotion flag so the
            // "Destination Sales" pill and filter actually work.
            hasDestinationSales: !!hotel.hasDestinationSales,
            flashSale: !!hotel.flashSale,
            latitude: hotel.latitude,
            longitude: hotel.longitude,
            contactNumber: hotel.contactNumber || "",
          }))
        : [];

      // Envelope-level currency metadata that the RoomList / booking-page
      // handoff needs. Cached on a ref so `handleHotelClick` (which reads
      // the sessionStorage handoff) sees the latest value without depending
      // on setState timing.
      if (res.data && res.data.displayCurrencyCode) {
        backendDisplayCurrencyRef.current = {
          code: res.data.displayCurrencyCode,
          factor:
            res.data.displayCurrencyFactor != null
              ? Number(res.data.displayCurrencyFactor)
              : 1,
        };
      }

      if (mappedResults.length > 0 || isNameSearching) {
        if (pollStatus === "IN_PROGRESS" && !isNameSearching) {
          setAllResults((prev) => {
            const map = new Map(prev.map((h) => [h.id, h]));
            mappedResults.forEach((h) => map.set(h.id, h));
            return Array.from(map.values());
          });
        } else {
          setAllResults(mappedResults);
        }
      } else if (!isNameSearching && pollStatus !== "IN_PROGRESS") {
        setAllResults([]);
      }

      // For a name-search fetch we pulled everything (up to
      // NAME_SEARCH_PAGE_SIZE) in one go and filter it client-side, so the
      // paginator collapses to a single page for the visible/filtered set.
      // Everything else uses the server-side totals exactly as before.
      if (isNameSearching) {
        setTotalElements(mappedResults.length);
        setTotalPages(1);
      } else {
        setTotalElements(Number(res.data.totalResults) || mappedResults.length);
        setTotalPages(
          Math.max(
            1,
            Math.ceil(
              (Number(res.data.totalResults) || mappedResults.length) / pageSize,
            ),
          ),
        );
      }
      // Keep the LIVE/OFF badges in sync on filter / page refetches too.
      // The backend counts over the full set BEFORE the apiType filter,
      // so ticking one channel never flips the others to OFF.
      if (
        !isNameSearching &&
        res.data.channelCounts &&
        typeof res.data.channelCounts === "object"
      ) {
        setChannelsWithResults(
          new Set(
            Object.entries(res.data.channelCounts)
              .filter(([, n]) => Number(n) > 0)
              .map(([ct]) => String(ct).toLowerCase()),
          ),
        );
      }
      setHasSearchResult(true);
      return res.data;
    } catch (err) {
      console.error("Fetch hotels failed:", err);
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
    initialDelay = 2000,
  ) => {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let localPollCount = 0;

      const poll = async () => {
        try {
          localPollCount++;
          const res = await axiosInstance.get(url, { params });
          if (onUpdate) onUpdate(res.data, localPollCount);
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
          console.error("Poll failed:", err);
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
    // Start a new search generation and forget the previous searchId BEFORE
    // the reset below. The fetch-effect further down re-runs whenever
    // pollStatus / pageIndex change, and on a Modify Search → Search it was
    // firing with the OLD searchId still in state: it re-fetched the
    // previous destination's cached /results page and wrote those rows
    // (plus hasSearchResult=true) straight back over the cleared list while
    // the new search was still polling. Nulling searchId makes the effect
    // early-return exactly as it does on the very first search; the
    // generation bump covers any reply that is already in flight.
    searchGenRef.current += 1;
    setSearchId(null);
    setIsLoading(true);
    setHasSearched(true);
    setIsEditingSearch(false);
    setHasSearchResult(false);
    setAllResults([]);
    setChannelsWithResults(new Set());
    setPollStatus("IDLE");
    setPageIndex(0);
    setTotalElements(0);
    setTotalPages(1);
    setIsInitialResultsLoaded(false);
    completedChannelsRef.current = new Set();
    setCompletedChannels(new Set());
    dispatchedChannelsRef.current = new Set();
    setDispatchedChannels(new Set());
    // Drop the previous search's id until the new one comes back. Keeping it
    // let the results effect refetch the OLD search as soon as pollStatus
    // reset to IDLE — which is why a second Search press showed the first
    // search's third-party hotels. Bumping currencyVersionRef (fetchHotels'
    // stale-response guard) also stops a fetch still in flight for the old
    // search from writing its rows into this one.
    setSearchId(null);
    currencyVersionRef.current += 1;

    try {
      const nationalityId = selectedNationality.value;
      const nationalityCode = selectedNationality.code;
      const destinationCityId = selectedDestination.value;
      const destinationCountryId = selectedDestination.countryId;
      const noOfRooms = String(rooms.length);

      const roomConfigurations = rooms.map((room, index) => ({
        roomNo: index + 1,
        adultCount: String(room.adults || 1),
        childCount: String(room.children || 0),
        // Only send childAges when the user actually picked at least one
        // child. The old fallback of [0] was making some suppliers
        // (e.g. GoGlobal) treat it as a real 1-year-old and charge for a
        // phantom child. Empty array = truly no children.
        childAges: room.childAges?.length ? room.childAges : [],
        adultAges: room.adultAges?.length ? room.adultAges : [25],
      }));

      const agentId = (isAgentRole ? selfAgentId : agent) || 1;

      const searchPayloadReq = {
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

      const searchKeyRes = await axiosInstance.post(
        "/api/hotel-search/search",
        searchPayloadReq,
      );
      const newSearchId = searchKeyRes.data.searchId;
      if (!newSearchId) throw new Error("No searchId returned");
      setSearchId(newSearchId);

      // ── Agent search log (Unbooked Opportunities → Searches tab) ──────
      // Fire-and-forget snapshot of the search context so the admin AI
      // report can show what agents are looking for even when they never
      // reach the booking page. Shared with LastMinuteBookingPage and
      // any future /new-booking flow — see utils/agentSearchLog.js.
      logAgentSearch({
        agentId,
        agentName: loggedInAgentName,
        destinationId: destinationCityId,
        destinationLabel: selectedDestination?.label,
        nationalityLabel: selectedNationality?.label,
        checkIn,
        checkOut,
        rooms,
        source: "search-page",
      });

      const params = {
        agentId,
        page: 0,
        pageSize,
        sortBy:
          sortBy === "priceAsc" || sortBy === "priceDesc" ? "baseRate" : sortBy,
        sortOrder:
          sortBy === "priceAsc" ||
          sortBy === "ratingAsc" ||
          sortBy === "nameAsc"
            ? "asc"
            : "desc",
        starRating: starRating ? starRating.value : undefined,
        apiType:
          channelType.map((c) => c.value.toUpperCase()).join(",") || undefined,
      };

      // The poll uses the SAME /results endpoint fetchHotels does — pass the
      // picker override the same way so the very first wave of results also
      // arrives already converted to the chosen display currency. Missing
      // this made the initial rows render in AED for the ~10-15 s the poll
      // took to finish, which is the "still see AED" symptom.
      // Read the ref, not the closure: the agent-default currency can land
      // while the POST above is still awaiting.
      const pollDisplayCode = selectedCurrencyCodeRef.current;
      if (pollDisplayCode) {
        params.displayCurrencyCode = pollDisplayCode;
        pollCurrencyCodeRef.current = pollDisplayCode;
      } else {
        pollCurrencyCodeRef.current = null;
      }
      // Stash the params object so a picker change mid-poll can mutate its
      // `displayCurrencyCode` field in place — pollUntilComplete's closure
      // reads the SAME object each tick, so the new code takes effect on
      // the next axios call without restarting the search.
      pollParamsRef.current = params;

      const expectedChannels = [
        "inhouse",
        // "iwtx",
        // "x3",
        "ratehawk",
        // "darina",
        // "atharva",
        // "jumeirah",
      ];

      const finalPollData = await pollUntilComplete(
        `/api/hotel-search/results/${newSearchId}`,
        params,
        (data) => data.finalStatus === "COMPLETED",
        (data, pollCount) => {
          // Discard the tick when the currency this response was generated
          // in no longer matches what the user has picked. Prevents an
          // in-flight tick (fired before the picker moved) from clobbering
          // freshly-fetched rows in the new currency two seconds later.
          if (
            pollCurrencyCodeRef.current &&
            data?.displayCurrencyCode &&
            String(data.displayCurrencyCode).toUpperCase() !==
              String(pollCurrencyCodeRef.current).toUpperCase()
          ) {
            return;
          }

          // Poll payload also carries the backend-converted display currency
          // — same shape as the /results endpoint. Cache it on the ref so
          // handleHotelClick's sessionStorage handoff picks up the correct
          // {code, factor} even when the user clicks a card that arrived
          // during the polling phase.
          if (data && data.displayCurrencyCode) {
            backendDisplayCurrencyRef.current = {
              code: data.displayCurrencyCode,
              factor:
                data.displayCurrencyFactor != null
                  ? Number(data.displayCurrencyFactor)
                  : 1,
            };
          }

          const mappedResults = Array.isArray(data.result)
            ? data.result.map((hotel, index) => ({
                id: hotel.hotelCode
                  ? `${newSearchId}-${hotel.hotelCode}`
                  : `${newSearchId}-h${index + 1}`,
                searchId: newSearchId,
                hotelCode: hotel.hotelCode || null,
                name: hotel.hotelName || "Unknown Hotel",
                address: hotel.hotelAddress || "",
                city: hotel.hotelAddress
                  ? hotel.hotelAddress.split(", ").pop() || "Unknown City"
                  : "Unknown City",
                price: hotel.baseRate || null,
                // Backend-converted display fields — MUST match the shape
                // used by fetchHotels' mapping below. Missing these fields
                // is what makes the FIRST wave of poll results render in
                // raw AED even though the backend correctly sends GBP.
                displayPrice:
                  hotel.displayBaseRate != null ? hotel.displayBaseRate : hotel.baseRate,
                displayCurrencyCode:
                  hotel.displayCurrencyCode || "AED",
                displayFactor:
                  Number(data.displayCurrencyFactor) > 0
                    ? Number(data.displayCurrencyFactor)
                    : 1,
                badge: hotel.baseRate ? "Rate Available" : "Rate Unavailable",
                image:
                  hotel.hotelImage ||
                  "https://details/assets/details/profilepic/hotel/hoteldefault.jpg",
                rating: hotel.starRating || 0,
                hotelType: "hotel",
                channelType: hotel.apiType?.toLowerCase() || "inhouse",
                // Surface backend promotion flags so the
                // "Destination Sales" pill + filter actually work.
                hasDestinationSales: !!hotel.hasDestinationSales,
                flashSale: !!hotel.flashSale,
                latitude: hotel.latitude,
                longitude: hotel.longitude,
                contactNumber: hotel.contactNumber || "",
              }))
            : [];

          // When a hotel-name filter is active, /filter-by-name owns
          // allResults. Merging the poll's unfiltered payload here would
          // repopulate the list with non-matching hotels every 2 s and
          // undo the filter. Clearing the box unblocks this branch on the
          // next poll tick, and the poll returns the full Redis payload so
          // the unfiltered list rebuilds naturally.
          if (!finalHotelSearchTermRef.current.trim()) {
            setAllResults((prev) => {
              const map = new Map(prev.map((h) => [h.id, h]));
              mappedResults.forEach((h) => map.set(h.id, h));
              return Array.from(map.values());
            });
          }

          const currentStatuses = data.status || {};
          // Track every supplier the backend fan-out'd to (denominator)
          // AND every one that reported COMPLETED (numerator). Iterate
          // over the LIVE status keys so we never miss a supplier that
          // wasn't on the old hardcoded expectedChannels list; the bar
          // now progresses through every real reply and only reserves
          // the final 10% for the overall COMPLETED flip.
          let dispatchedGrew = false;
          Object.keys(currentStatuses).forEach((ch) => {
            if (!dispatchedChannelsRef.current.has(ch)) {
              dispatchedChannelsRef.current.add(ch);
              dispatchedGrew = true;
            }
            if (
              currentStatuses[ch] === "COMPLETED" &&
              !completedChannelsRef.current.has(ch)
            ) {
              completedChannelsRef.current.add(ch);
            }
          });
          if (dispatchedGrew) {
            setDispatchedChannels(new Set(dispatchedChannelsRef.current));
          }
          setCompletedChannels(new Set(completedChannelsRef.current));

          if (pollCount === 1 || mappedResults.length > 0) {
            setHasSearchResult(true);
            if (
              completedChannelsRef.current.size >= 1 ||
              mappedResults.length > 0
            ) {
              setIsInitialResultsLoaded(true);
            }
          }

          // Same reason as the setAllResults guard above — while a name
          // filter is active the /filter-by-name response owns the paging
          // counts; the unfiltered poll totals would flash the wrong page
          // count next to a filtered list.
          if (!finalHotelSearchTermRef.current.trim()) {
            setTotalElements(Number(data.totalResults) || mappedResults.length);
            setTotalPages(
              Math.max(
                1,
                Math.ceil(
                  (Number(data.totalResults) || mappedResults.length) / pageSize,
                ),
              ),
            );
          }

          // Full-set supplier presence for the LIVE/OFF badges. Counted
          // by the backend over every page, so it is correct even when
          // the current page happens to be all one supplier.
          if (data.channelCounts && typeof data.channelCounts === "object") {
            setChannelsWithResults(
              new Set(
                Object.entries(data.channelCounts)
                  .filter(([, n]) => Number(n) > 0)
                  .map(([ct]) => String(ct).toLowerCase()),
              ),
            );
          }
        },
        2000,
        // 30 s poll ceiling — keeps the UI responsive; GRN's slower
        // Dubai fan-out (~30-40 s) that would previously push the total
        // wait to a full minute now caps out at 30 s. Faster suppliers
        // (inhouse / RateHawk) still resolve early via the
        // finalStatus=COMPLETED check, and any GRN rows that arrive
        // between poll ticks before the timeout still show up. If GRN
        // hasn't finished by then the catch below no longer flips
        // hasSearched=false (existing behaviour after the 60 s bump), so
        // filter changes keep working. Supplier legs that finish after the
        // timeout are picked up by the late-results check (the effect right
        // after the results effect).
        30000,
        2000,
      );
      // ── 24 Hour Check-In post-processing ───────────────────────────
      // Probe each hotel's 24-hour config eligibility for the requested
      // check-in date+time. The result map keys hotelId -> { eligible,
      // percentage }; filteredResults uses it to filter non-eligible hotels
      // and uplift displayed rates.
      //
      // We read `finalPollData.result` (the freshest payload from the last
      // poll) rather than `allResults`, because setAllResults inside the
      // poll's onUpdate callback hasn't been flushed back into this
      // closure — reading allResults here returns the stale value (empty
      // list on the first search), which would cause the probe to receive
      // no IDs and return {}, filtering every hotel out.
      if (is24HourCheckin) {
        try {
          // hotelCode comes back as a string like "IN5" / "IN12" — the
          // numeric tail is the real hotel_id. Strip the leading "IN" (or
          // any non-digit prefix) before sending to the probe endpoint.
          const idsAfterSearch = (finalPollData?.result || [])
            .map((h) => {
              const raw = String(h.hotelCode || "");
              const m = raw.match(/(\d+)$/);
              return m ? Number(m[1]) : NaN;
            })
            .filter((n) => Number.isFinite(n) && n > 0);

          if (idsAfterSearch.length > 0 && checkIn && checkInTime24) {
            const probeRes = await axiosInstance.post(
              "/api/24-hour-checkin/probe-bulk",
              {
                hotelIds: idsAfterSearch,
                date: checkIn,
                time: checkInTime24,
              }
            );
            setTwentyFourHourMap(probeRes.data || {});
          } else {
            setTwentyFourHourMap({});
          }
        } catch (probeErr) {
          console.warn("24-hour probe failed (non-fatal):", probeErr);
          setTwentyFourHourMap({});
        }
      }
    } catch (err) {
      console.error("Search failed:", err);
      // Timeouts (30 s ceiling for GRN) are NOT a real failure — the rows
      // that came in via prior poll ticks are still valid. Flipping
      // hasSearched=false here used to block every subsequent picker /
      // filter refetch, which is exactly the "AED still shown after USD
      // picked" symptom. Leave hasSearched=true so downstream effects
      // (currency-picker refetch, channel filter, pagination) keep
      // working.
      const isTimeout =
        err && (err.message === "Polling timed out" || err.name === "TimeoutError");
      if (!isTimeout) {
        setHasSearched(false);
      }
      setPollStatus(isTimeout ? "TIMEOUT" : "ERROR");
    } finally {
      setIsLoading(false);
    }
  };

  // const showResultsDuringPolling =
  //   hasSearchResult &&
  //   isInitialResultsLoaded &&
  //   (pollStatus === "IN_PROGRESS" || pollStatus === "COMPLETED");

  // Single path for every display-currency change (picker + agent default).
  // Same code → no-op. Otherwise redirect the running poll, drop in-flight
  // replies in the old currency, and re-convert what's already on screen.
  const changeDisplayCurrency = (opt, { manual = false, reconvertAll = true } = {}) => {
    if (manual) currencyTouchedRef.current = true;
    if (!opt?.code) return;
    setSelectedCurrency(opt);
    if (opt.code === selectedCurrencyCodeRef.current) return;
    selectedCurrencyCodeRef.current = opt.code;
    currencyVersionRef.current += 1;
    if (pollParamsRef.current) {
      pollParamsRef.current.displayCurrencyCode = opt.code;
    }
    pollCurrencyCodeRef.current = opt.code;

    // Once polling is over (or a name filter is active) the results effect
    // REPLACES the list in the new currency itself (selectedCurrency?.code is
    // one of its deps). While polling, its fetches only MERGE one page — even
    // with a channel/star filter — so re-convert the whole list via /resultsOut.
    const effectWillRefetch =
      hasSearched &&
      (pollStatus !== "IN_PROGRESS" || !!finalHotelSearchTermRef.current.trim());
    if (!reconvertAll || !searchId || effectWillRefetch) return;

    const myVersion = currencyVersionRef.current;
    const mySearchGen = searchGenRef.current;
    const myReplaceGen = replaceGenRef.current;
    axiosInstance
      .get(`/api/hotel-search/resultsOut/${searchId}`, {
        params: {
          agentId: (isAgentRole ? selfAgentId : agent) || 1,
          page: 0,
          size: 100000,
          sortBy:
            sortBy === "priceAsc" || sortBy === "priceDesc" ? "baseRate" : sortBy,
          sortOrder:
            sortBy === "priceAsc" || sortBy === "ratingAsc" || sortBy === "nameAsc"
              ? "asc"
              : "desc",
          starRating: starRating ? starRating.value : undefined,
          apiType:
            channelType.map((c) => c.value.toUpperCase()).join(",") || undefined,
          displayCurrencyCode: opt.code,
        },
      })
      .then((res) => {
        // Drop if the currency or search moved on, a newer page/name fetch
        // replaced the list, or a hotel-name filter now owns allResults.
        if (
          myVersion !== currencyVersionRef.current ||
          mySearchGen !== searchGenRef.current ||
          myReplaceGen !== replaceGenRef.current ||
          finalHotelSearchTermRef.current.trim()
        ) {
          return;
        }
        if (res.data && res.data.displayCurrencyCode) {
          backendDisplayCurrencyRef.current = {
            code: res.data.displayCurrencyCode,
            factor:
              res.data.displayCurrencyFactor != null
                ? Number(res.data.displayCurrencyFactor)
                : 1,
          };
        }
        const mapped = Array.isArray(res.data?.result)
          ? res.data.result.map((hotel, i) => ({
              id: hotel.hotelCode
                ? `${searchId}-${hotel.hotelCode}`
                : `${searchId}-h${i + 1}`,
              searchId,
              hotelCode: hotel.hotelCode || null,
              name: hotel.hotelName || "Unknown Hotel",
              address: hotel.hotelAddress || "",
              city: hotel.hotelAddress
                ? hotel.hotelAddress.split(", ").pop() || "Unknown City"
                : "Unknown City",
              price: hotel.baseRate || null,
              displayPrice:
                hotel.displayBaseRate != null ? hotel.displayBaseRate : hotel.baseRate,
              displayCurrencyCode: hotel.displayCurrencyCode || "AED",
              displayFactor:
                Number(res.data.displayCurrencyFactor) > 0
                  ? Number(res.data.displayCurrencyFactor)
                  : 1,
              badge: hotel.baseRate ? "Rate Available" : "Rate Unavailable",
              image:
                hotel.hotelImage ||
                "https://details/assets/details/profilepic/hotel/hoteldefault.jpg",
              rating: hotel.starRating || 0,
              hotelType: "hotel",
              channelType: hotel.apiType?.toLowerCase() || "inhouse",
              hasDestinationSales: !!hotel.hasDestinationSales,
              flashSale: !!hotel.flashSale,
              latitude: hotel.latitude,
              longitude: hotel.longitude,
              contactNumber: hotel.contactNumber || "",
            }))
          : [];
        setAllResults(mapped);
      })
      .catch(() => {
        /* fail-safe: leave existing rows */
      });
  };

  const showResultsDuringPolling = hasSearchResult || allResults.length > 0;

  // Collapse the full search form into the sticky summary strip once results
  // are on screen, unless the user explicitly chose to modify the search.
  const collapseSearch = showResultsDuringPolling && !isEditingSearch;

  // Bumped by the late-results check below to make the results effect
  // refetch the visible page. lateResultsRefreshRef marks that refetch as a
  // background one so it doesn't flash the loading card every few seconds.
  const [resultsRefreshTick, setResultsRefreshTick] = useState(0);
  const lateResultsRefreshRef = useRef(false);

  useEffect(() => {
    const isBackgroundRefresh = lateResultsRefreshRef.current;
    lateResultsRefreshRef.current = false;
    if (!searchId || !hasSearched) return;
    // Gate basic (unfiltered) fetches until polling finishes so we don't
    // double-write allResults alongside the poll's merge. Name-search
    // (/filter-by-name) is exempt — it targets a separate endpoint,
    // REPLACES allResults on its own, and is protected from stale-response
    // races by nameSearchSeqRef. Without this exemption, typing a hotel
    // name during the initial supplier poll silently no-ops until poll
    // completes, which is the "sometimes it doesn't work" symptom.
    //
    // Filter-driven fetches (channelType, starRating) are ALSO exempt from
    // the guard: they issue a filtered /results call (e.g. apiType=GRN)
    // that returns a different result set than the unfiltered poll, so
    // the "double-write" concern doesn't apply. Blocking them meant that
    // ticking Channel = GRN while a slow supplier (GRN itself, ~30-40 s
    // for Dubai) was still polling silently zeroed the list.
    const hasActiveFilter =
      (channelType && channelType.length > 0) ||
      !!starRating ||
      (hotelType && hotelType.length > 0);
    if (
      pollStatus === "IN_PROGRESS" &&
      !finalHotelSearchTerm.trim() &&
      !hasActiveFilter
    ) return;
    if (!isBackgroundRefresh) setIsLoading(true);
    fetchHotels(pageIndex, searchId, agent, finalHotelSearchTerm).finally(() => {
      if (!isBackgroundRefresh) setIsLoading(false);
    });
  }, [
    pageIndex,
    sortBy,
    starRating,
    channelType,
    hotelType,
    searchId,
    agent,
    hasSearched,
    pollStatus,
    finalHotelSearchTerm,
    // Currency conversion happens server-side now (see fetchHotels — it
    // sends `displayCurrencyCode=…` from selectedCurrency.code). Adding
    // the code as a dep so a picker change re-fetches the results in the
    // new currency instead of leaving stale numbers on screen.
    selectedCurrency?.code,
    resultsRefreshTick,
  ]);

  // Late supplier results. The search poll gives up after 30 s, but a slow
  // supplier leg (GRN waits up to its 25 s cutoff_time; big cities take
  // longer) can still add hotels after that. Nothing asked again, so those
  // hotels only appeared on the next Search press. After a poll timeout,
  // check the result count every few seconds until the backend reports every
  // supplier finished, and refresh the visible page whenever the count moves.
  useEffect(() => {
    if (pollStatus !== "TIMEOUT" || !searchId) return;
    const CHECK_EVERY_MS = 4000;
    const GIVE_UP_AFTER_MS = 90000;
    const startedAt = Date.now();
    let cancelled = false;
    let timer;
    let lastTotal = null;

    const checkForLateResults = async () => {
      try {
        const res = await axiosInstance.get(
          `/api/hotel-search/results/${searchId}`,
          {
            params: {
              agentId: (isAgentRole ? selfAgentId : agent) || 1,
              page: 0,
              size: 1,
            },
          },
        );
        if (cancelled) return;
        if (res.data?.finalStatus === "COMPLETED") {
          // pollStatus is a dependency of the results effect, so this also
          // runs its final (background) refetch.
          lateResultsRefreshRef.current = true;
          setPollStatus("COMPLETED");
          return;
        }
        const total = Number(res.data?.totalResults) || 0;
        if (total !== lastTotal) {
          lastTotal = total;
          lateResultsRefreshRef.current = true;
          setResultsRefreshTick((tick) => tick + 1);
        }
      } catch (err) {
        if (cancelled) return;
        console.warn("Late supplier results check failed (will retry):", err);
      }
      if (Date.now() - startedAt < GIVE_UP_AFTER_MS) {
        timer = setTimeout(checkForLateResults, CHECK_EVERY_MS);
      }
    };

    timer = setTimeout(checkForLateResults, CHECK_EVERY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pollStatus, searchId, agent, selfAgentId, isAgentRole]);

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />

        <main className="flex-grow-1 p-4 hs-page">
          {/* ── Results-page heading ──
              Shown once actual results have arrived (not just on search
              click — avoids flashing the heading during the loading/poll
              phase), above the search summary / form. Stays visible whether
              the summary is collapsed or re-expanded via "Modify Search". */}
          {showResultsDuringPolling && (
            <div className="hs-page-heading">
              <h3 className="hs-page-heading-title">
                {force24Hour ? "24 Hours" : "Accommodation"}
              </h3>
              {/* <p className="hs-page-heading-subtitle">
                Browse and book hotels, resorts, villas and apartments.
              </p> */}
            </div>
          )}

          {/* ── Collapsed sticky search summary strip ──
              Shown once results are on screen. "Modify Search" re-expands
              the full form by flipping isEditingSearch. */}
          {collapseSearch && (
            <div className="hs-summary-bar">
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
            </div>
          )}

          {/* ── Search Card + Ads ── */}
          {!collapseSearch && (
          <div className="d-flex gap-3 align-items-start mb-2 hs-search-ads-row">
           <div className="flex-grow-1" style={{ minWidth: 0 }}>
          <Card className="shadow-sm rounded-xl search-card-modern bg-white h-100">
            <Card.Body className={force24Hour ? "p-4 hs24-compact" : "p-4"}>
              <div
                className={
                  force24Hour
                    ? "mb-2 text-start d-flex justify-content-between align-items-start flex-wrap gap-2"
                    : "mb-4 text-start d-flex justify-content-between align-items-start flex-wrap gap-2"
                }
              >
                <div>
                  <h2 className="fw-semibold text-primary mb-1 d-inline-flex align-items-center gap-2">
                    {force24Hour
                      ? "24 Hours"
                      : "Find Your Perfect Stay"}
                    {religiousMode && (
                      <span
                        className="badge bg-warning-subtle text-warning border border-warning-subtle"
                        style={{ fontSize: "0.65em", padding: "4px 10px", verticalAlign: "middle" }}
                        title="Religious flow — destination restricted to Mecca / Medina"
                      >
                        Religious
                      </span>
                    )}
                  </h2>
                  <p className={force24Hour ? "text-muted mb-0" : "text-muted"}>
                    {force24Hour
                      ? "Pick a check-in time — we'll filter to hotels with an active 24-hour config and apply the per-hotel uplift."
                      : religiousMode
                        ? "Search hotels in Mecca and Medina."
                        : "Discover amazing hotels and exclusive deals"}
                  </p>
                </div>
                {/* Agent logins see their available credit balance at the
                    right end of the heading row (renders nothing for other
                    roles). */}
                <AgentCreditBalance />
              </div>

              <Form onSubmit={handleSearchSubmit}>
                {/*
                  Search criteria order (per spec):
                    1. Agent
                    2. Destination / City
                    3. Nationality
                    4. Check-In
                    5. Nights
                    6. Check-Out
                    7. Rooms & Guests
                  Row totals stay 12 on lg so the form keeps its
                  responsive feel — first row holds Agent + Destination +
                  Nationality (4/4/4), second row holds Check-In + Nights +
                  Check-Out + Rooms & Guests (3/2/3/4). On the 24-hour route,
                  Check-In Time + Check-Out Time join Rooms & Guests as a
                  third 4/4/4 row (rather than a separate Row below) purely
                  to cut vertical space so the form fits on screen.
                */}
                <Row className={force24Hour ? "g-3" : "g-4"}>
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
                            <span className="fw-semibold" style={{ color: "#dc3545" }}>
                              Available Balance: {Number(agentBalance).toFixed(2)} {agentBalanceCurrency || "AED"}
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
                          if (action === "input-change") cityList(inputValue);
                        }}
                        // Client-side filter/ranking is already done inside
                        // debouncedCitySearch. Keeping react-select's default
                        // filter would drop "Van, Turkey" for the query
                        // "van turkey" because it does a raw substring test
                        // against the label and the comma between city and
                        // country breaks the match. Same pattern the Currency
                        // picker below already uses.
                        filterOption={() => true}
                        menuPortalTarget={document.body}
                        styles={{
                          menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                          control: (base) => ({
                            ...base,
                            minHeight: "42px",
                            border: "1px solid #dee2e6",
                            "&:hover": { borderColor: "#86b7fe" },
                          }),
                          menu: (base) => ({
                            ...base,
                            zIndex: 9999,
                            maxHeight: "200px",
                          }),
                          // Brand-aligned option styling: the selected row
                          // uses the brand red so it stays clearly visible
                          // when the menu is reopened (react-select's
                          // default bright blue clashes with the app's
                          // #EC0B43 theme); the focused row gets a soft
                          // pink to match. Text color is set alongside the
                          // background so we never regress into the
                          // white-on-white bug the earlier override had.
                          option: (base, state) => ({
                            ...base,
                            cursor: "pointer",
                            backgroundColor: state.isSelected
                              ? "#EC0B43"
                              : state.isFocused
                                ? "#fff0f3"
                                : "white",
                            color: state.isSelected ? "white" : "#212529",
                            "&:active": {
                              backgroundColor: state.isSelected
                                ? "#EC0B43"
                                : "#f8c1cf",
                            },
                          }),
                          clearIndicator: (base) => ({
                            ...base,
                            color: "#6c757d",
                            "&:hover": { color: "#dc3545" },
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
                        <div className="text-danger small mt-1">
                          {errors.nationality}
                        </div>
                      )}
                    </Form.Group>
                  </Col>

                  {/* Booking Done By — for AGENT logins the booking is done
                      by the logged-in agent, so the staff-employee picker is
                      hidden and the agent's own name is shown (read-only) and
                      carried on the payload. Admin/staff keep the optional
                      employee dropdown exactly as before. */}
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
                  {/* Booking Done On Behalf Of Agent Staff — new dropdown
                      whose options come from the selected agent's own
                      sub-users (GET /api/sub-user/by-agent/{agentId},
                      fetched in the effect above). Auto-hides when the
                      picked agent has no registered sub-users, so
                      agencies without staff don't see an empty
                      dropdown. Completely optional; when left blank the
                      booking is persisted without agent-side attribution
                      exactly as before this feature. */}
                  {agentStaffOptions.length > 0 && (
                    <Col lg={4} md={6}>
                      <Form.Group>
                        <Form.Label className="fw-semibold text-dark">
                          Booking Done On Behalf Of Agent Staff{" "}
                          <span className="text-muted small">(optional)</span>
                        </Form.Label>
                        <Select
                          options={agentStaffOptions.map((s) => ({
                            value: s.id,
                            label: (s.agentName ||
                              [s.firstName, s.lastName]
                                .filter(Boolean)
                                .join(" ")
                                .trim() ||
                              `Sub-user #${s.id}`),
                          }))}
                          value={selectedAgentStaff}
                          onChange={(option) => setSelectedAgentStaff(option)}
                          placeholder="Select agent staff"
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

                  {/* Row-break before Check-In (lg+ only) — only when the
                      optional Agent-Staff dropdown is rendered. Bootstrap 5
                      flex-wrap treats a full-width child as a hard break, so
                      Check-In / Nights / Check-Out / Rooms & Guests
                      (3 + 2 + 3 + 4 = 12) always land together on their own
                      row instead of getting split across two rows when
                      BookingBy + AgentStaff + Check-In (4 + 4 + 3 = 11) push
                      Nights + Check-Out to the next line. On md and below
                      each Col is already full-width, so the breaker is
                      hidden there and the stacked layout is unchanged. */}
                  {agentStaffOptions.length > 0 && (
                    <div className="w-100 d-none d-lg-block" aria-hidden="true" />
                  )}

                  {/* 4. Check-In — RateCalendar renders a picker that
                       shows the "starting from" nightly rate under each day
                       (from GET /api/hotel-search/rate-calendar). Same
                       ISO yyyy-MM-dd contract in value/onChange as the
                       previous <Form.Control type="date">, so all downstream
                       consumers (nights sync, submit payload, sticky summary
                       strip) work unchanged. */}
                  <Col lg={3} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">
                        Check-In
                      </Form.Label>
                      <DateInput
                        value={checkIn}
                        min={today}
                        stateId={selectedDestination?.value}
                        currency="AED"
                        isInvalid={!!errors.checkIn}
                        ariaLabel="Check-in date"
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
                        className="form-control-modern"
                        type="number"
                        min={1}
                        max={MAX_NIGHTS}
                        value={nights}
                        onChange={(e) => handleNightsChange(e.target.value)}
                      />
                      {errors.nights && (
                        <div className="text-danger small mt-1">
                          {errors.nights}
                        </div>
                      )}
                    </Form.Group>
                  </Col>

                  {/* 6. Check-Out — same RateCalendar treatment as Check-In.
                       min={minCheckOutDate} keeps operators from picking a
                       date before/equal to check-in (the picker greys those
                       days out and refuses selection). */}
                  <Col lg={3} md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold text-dark">
                        Check-Out
                      </Form.Label>
                      <DateInput
                    
                        value={checkOut}
                        min={minCheckOutDate}
                        stateId={selectedDestination?.value}
                        currency="AED"
                        isInvalid={!!errors.checkOut}
                        ariaLabel="Check-out date"
                        onChange={(newCheckOut) => {
                          setCheckOut(newCheckOut);
                          if (newCheckOut) clearError("checkOut"); 
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
      setRoomsOpen(true); // first click: just open
    } else {
      // later clicks: add room, but never exceed the cap
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

                  {/* ── 24 Hour Check-In time inputs ─────────────────────
                      Rendered ONLY on the dedicated 24-hour route
                      (force24Hour=true). Kept as plain columns in the same
                      Row as the rest of the criteria (rather than a
                      separate Row below) purely so the form fits on screen
                      without extra scrolling — same fields, same handlers,
                      just laid out more compactly. The 24-hour
                      post-processing / probe call still only runs when
                      is24HourCheckin is true, which on the normal route
                      stays false for the entire lifetime of the page. */}
                  {force24Hour && (
                    <>
                      <Col lg={4} md={6}>
                        <Form.Group>
                          <Form.Label className="fw-semibold text-dark">
                            Check-In Time (24-hour)
                          </Form.Label>
                          {/* Same OK/Cancel + AM-PM picker used on
                              hotel-actions/{id}/occupancy-and-minimumlength —
                              stepper + AM/PM toggle + read-only display. Value
                              stays as an "HH:MM" 24-hour string so downstream
                              usage (probe call, booking payload) is unchanged. */}
                          <TimeApplyPicker
                            value={checkInTime24}
                            onApply={(v) => {
                              setCheckInTime24(v);
                              // Auto-bump check-out to the same time → 24h later.
                              // User can override afterwards.
                              if (v) setCheckOutTime24(v);
                            }}
                            placeholder="Select check-in time"
                          />
                        </Form.Group>
                      </Col>
                      <Col lg={4} md={6}>
                        <Form.Group>
                          <Form.Label className="fw-semibold text-dark">
                            Check-Out Time
                          </Form.Label>
                          <TimeApplyPicker
                            value={checkOutTime24}
                            onApply={(v) => setCheckOutTime24(v)}
                            placeholder="Select check-out time"
                          />
                        </Form.Group>
                      </Col>
                    </>
                  )}
                </Row>

                {roomsOpen && (
                  <Row className="g-3 mt-3">
                    <Col md={12}>
                      <RoomGuestSelector value={rooms} onChange={setRooms} />
                    </Col>
                  </Row>
                )}

                <Row className={force24Hour ? "mt-2" : "mt-3"}>
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
                          {force24Hour
                            ? "SEARCH"
                            : "SEARCH"}
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

          {/* ── Progress Bar ── */}
          <SearchProgressBar
            pollStatus={pollStatus}
            completedChannels={completedChannels}
            channels={visibleProgressChannels}
            isLoading={isLoading}
          />

          {/* ── Loading skeleton ──
          {hasSearched && !showResultsDuringPolling && (
            <Card className="shadow-sm rounded-xl mb-4">
              <Card.Body className="text-center py-5">
                <div className="results-loader">
                  <div className="loader-ring">
                    <span></span><span></span><span></span><span></span>
                  </div>
                  <h4 className="text-primary fw-bold mt-3 mb-1">
                    Fetching Best Results...
                  </h4>
                  <p className="text-muted small mb-0">
                    Comparing rates across multiple providers
                  </p>
                </div>
              </Card.Body>
            </Card>
          )} */}

          {/* ── Empty state ── */}
          {!hasSearched && !hasSearchResult && (
            <Card className="shadow-sm rounded-xl">
              <Card.Body className="text-center text-muted py-5">
                <FaSearch className="display-4 text-muted mb-3" />
                <h4>Ready to Find Your Perfect Stay?</h4>
                <p>
                  Use the search form above to discover amazing hotels and
                  exclusive deals.
                </p>
              </Card.Body>
            </Card>
          )}

          {/* ── Results section ── */}
          {/* {hasSearched && ( */}
          {(hasSearchResult || allResults.length > 0) && (
            <div ref={resultsRef}>
              <div className="search-layout">
                {/* ── Exclusive deals scrolling banner ───────────────────
                    Surfaces the union of feature flags (Long Stay, 24 Hour
                    Check-In, Last Minute, Day Stay, Meeting & Space, Govt
                    Employee Discount, Student Discount) across the hotels
                    in view. Suppressed entirely when no hotel has any flag
                    set so we don't render an empty marquee. */}
              {/* Exclusive Deals marquee hidden — per-hotel deal pills on each
                  card now surface the same information in context. */}
              {false && activeFeatureLabels.length > 0 && (
  <div style={{ overflow: "hidden", width: "100%", marginBottom: "14px" }}>
    <div className="deals-banner" style={{ marginBottom: 0 }}>
      <div className="deals-banner-tag">
        <FaStar className="deals-banner-icon" /> EXCLUSIVE DEALS
      </div>
      <div className="deals-banner-scroll">
        <div className="deals-banner-track">
          {[0, 1].map((dup) => (
            <React.Fragment key={dup}>
              {activeFeatureLabels.map((label, i) => (
                <React.Fragment key={`${dup}-${i}`}>
                  <strong>{label}</strong>
                  <span style={{ color: "#94a3b8", margin: "0 6px" }}>·</span>
                </React.Fragment>
              ))}
              <span style={{ color: "#cbd5e1", marginRight: "56px" }}>
                Unlock special rates at preferred hotels.
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  </div>
)}
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

                          {/* Display currency — converts the shown rates from
                              AED into the chosen currency using the
                              master_currency multiplier. Display-only: it does
                              not alter the search/booking payloads.
                              For an AGENT login the field is hidden entirely
                              and locked to the agent's configured currency
                              (auto-populated from /api/agent/{id} above); only
                              Admin/SuperAdmin see and can switch it. */}
                          {!isAgentRole && (
                            <>
                              <Form.Group className="mb-2">
                                <Form.Label className="fw-semibold small">
                                  Currency
                                </Form.Label>
                                <Select
                                  options={currencyOptions}
                                  value={selectedCurrency}
                                  onChange={(opt) =>
                                    changeDisplayCurrency(opt, { manual: true })
                                  }
                                  placeholder="Select currency"
                                  isSearchable
                                  // Server-side search: the backend filters the
                                  // list by the `search` param, so we disable
                                  // react-select's own client filtering to avoid
                                  // double-filtering the returned options.
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

                          {/* Channel — supplier/channel checkbox filter.
                              Hidden for AGENT logins (agents book only
                              through their contracted channel and the
                              backend already scopes results). */}
                          {!isAgentRole && (
                            <>
                              <Form.Group>
                                <Form.Label className="fw-semibold small">
                                  Channel
                                </Form.Label>
                                <div className="filter-checkbox-list">
                                  {/* Every supplier registered for this
                                      company via /admin/api-access appears
                                      here — enabled AND disabled ones —
                                      so the filter mirrors what the admin
                                      grid shows. The LIVE/OFF badge on
                                      each row is a pure "is this channel
                                      represented in the current results?"
                                      check — nothing about admin toggles.
                                      LIVE (green) = at least one hotel of
                                      that channel is listed in the search
                                      results right now; OFF (red) = none.
                                      So the operator can read the sidebar
                                      as "which suppliers actually gave me
                                      data on this search". */}
                                  {visibleChannelTypeOptions.map((item) => {
                                    const isLive = channelHasResults.has(
                                      item.value,
                                    );
                                    return (
                                      <div
                                        key={item.value}
                                        className="d-flex align-items-center justify-content-between gap-2"
                                        style={{ minHeight: 26 }}
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
                                              setChannelType([
                                                ...channelType,
                                                item,
                                              ]);
                                            else
                                              setChannelType(
                                                channelType.filter(
                                                  (c) => c.value !== item.value,
                                                ),
                                              );
                                          }}
                                        />
                                        <span
                                          title={
                                            isLive
                                              ? "Hotels from this supplier are in the results"
                                              : "No hotels from this supplier in the results"
                                          }
                                          style={{
                                            fontSize: "0.65rem",
                                            fontWeight: 700,
                                            padding: "1px 6px",
                                            borderRadius: 10,
                                            lineHeight: 1.4,
                                            color: "#fff",
                                            backgroundColor: isLive
                                              ? "#198754"
                                              : "#dc3545",
                                            whiteSpace: "nowrap",
                                          }}
                                        >
                                          {isLive ? "LIVE" : "OFF"}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </Form.Group>

                              <hr />
                            </>
                          )}

                          <Form.Group>
                            <Form.Label className="fw-semibold small d-flex justify-content-between align-items-center">
                              <span>Available Deals</span>
                              {availableDeals.length > 0 && (
                                <span
                                  role="button"
                                  className="text-primary small"
                                  style={{ cursor: "pointer", fontWeight: 500 }}
                                  onClick={() => setAvailableDeals([])}
                                >
                                  Clear
                                </span>
                              )}
                            </Form.Label>
                            <div className="filter-checkbox-list">
                              {availableDealsOptions.map((item) => (
                                <Form.Check
                                  key={item.value}
                                  type="checkbox"
                                  id={`deal-${item.value}`}
                                  label={item.label}
                                  checked={availableDeals.some(
                                    (d) => d.value === item.value,
                                  )}
                                  onChange={(e) => {
                                    if (e.target.checked)
                                      setAvailableDeals([...availableDeals, item]);
                                    else
                                      setAvailableDeals(
                                        availableDeals.filter(
                                          (d) => d.value !== item.value,
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

                  {/* Right Content */}
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
                              setAvailableDeals([]);
                              setSortBy("priceAsc");
                              setHotelSearchTerm("");
                            }}
                          >
                            Clear
                          </Button>

                        </div>
                      </Card.Body>
                    </Card>

                    {/* {hasSearched && ( */}
                    {(hasSearchResult || allResults.length > 0) && (
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <small className="text-muted fw-semibold">
                          Showing {startEntry} to {endEntry} of {displayTotal}{" "}
                          entries
                          {pollStatus === "IN_PROGRESS" && (
                            <span className="ms-1 text-primary">
                              (updating…)
                            </span>
                          )}
                        </small>
                      </div>
                    )}

                    {isLoading && pollStatus !== "IN_PROGRESS" && (
                      <Card className="shadow-sm rounded-xl mb-4">
                        <Card.Body className="text-center py-4">
                          <Spinner animation="border" variant="primary" />
                          <p className="text-muted mt-2 mb-0">
                            Loading results…
                          </p>
                        </Card.Body>
                      </Card>
                    )}

                    <Row className="g-4">
                      {filteredResults.length > 0 ? (
                        filteredResults.map((hotel) => (
                          <Col xs={12} key={hotel.id}>
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
                              {/* Corner Flash Sale logo removed — the badge
                                  next to "Rate Available" carries the same
                                  signal and is more prominent there. */}
                              <Row className="g-0">
                                <Col md={4}>
                                  <div
                                    style={{
                                      position: "relative",
                                      height: "100%",
                                      padding: "10px",
                                    }}
                                  >
                                    <LazyImage
                                      src={hotel.image}
                                      alt={hotel.name}
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
                                      {hotel.rating}
                                      {/* Supplier / channel-type pill
                                          (INHOUSE / IWTX / DARINA …). Only
                                          admin-side roles need to see which
                                          supplier a hotel came from —
                                          agents book against a single
                                          curated inventory and the label
                                          just adds noise. Guarded on
                                          isAgentRole so admin / super
                                          admin / all other roles keep it. */}
                                      {!isAgentRole && (
                                        <span
                                          style={{
                                            marginLeft: "5px",
                                            backgroundColor: "#6c757d",
                                            padding: "2px 6px",
                                            borderRadius: "10px",
                                          }}
                                        >
                                          {(
                                            hotel.channelType || ""
                                          ).toUpperCase()}
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
                                      {hotel.name || "Hotel Name Not Available"}
                                    </h6>

                                    <p
                                      style={{
                                        fontSize: "0.875rem",
                                        color: "#666",
                                        marginBottom: "4px",
                                      }}
                                    >
                                      📍{" "}
                                      {hotel.address ||
                                        hotel.city ||
                                        "Address Not Available"}
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
                                      {hotel.badge && (
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
                                          {hotel.badge}
                                        </span>
                                      )}
                                      {/* Flash Sale badge — shown beside Rate Available
                                          when the hotel has any active deal feature.
                                          Uses the same /images/flash-sale-logo.png asset
                                          as the corner badge; falls back to a text pill
                                          so the indicator never disappears silently. */}
                                      {!force24Hour && getHotelFeatureLabels(hotel).length > 0 && (
                                        <span
                                          className="flash-sale-badge flash-sale-inline"
                                          aria-label="Flash Sale"
                                          title="Flash Sale"
                                          style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            height: "64px",
                                          }}
                                        >
                                          <img
                                            src="/images/flash-sale-logo.png"
                                            alt="Flash Sale"
                                            style={{ height: "60px", width: "auto" }}
                                            onError={(e) => {
                                              const fallback = document.createElement("span");
                                              fallback.style.background = "#ff3b30";
                                              fallback.style.color = "#fff";
                                              fallback.style.padding = "8px 18px";
                                              fallback.style.borderRadius = "8px";
                                              fallback.style.fontSize = "1.1rem";
                                              fallback.style.fontWeight = "800";
                                              fallback.style.letterSpacing = "0.5px";
                                              fallback.textContent = "FLASH SALE";
                                              e.target.replaceWith(fallback);
                                            }}
                                          />
                                        </span>
                                      )}
                                    </div>

                                    {/* Per-hotel "Also Available Deals" — each
                                        pill is a clickable shortcut to the
                                        dedicated booking flow for that deal
                                        type (Long Stay → /new-booking/long-stay,
                                        Last Minute → /new-booking/last-minute-booking,
                                        Day Stay → /new-booking/day-stay, etc.).
                                        Falls back to a non-clickable pill if the
                                        label isn't in DEAL_PILL_META.route.
                                        stopPropagation is added because a future
                                        row-level click handler shouldn't swallow
                                        the navigation.
                                        Hidden in the dedicated 24-hour search
                                        (force24Hour) — the operator is already
                                        committed to that flow, listing other
                                        deals here would be a distraction. */}
                                    {!force24Hour && (getHotelFeatureLabels(hotel).length > 0 || hotel.hasDestinationSales) && (
                                      <div className="available-deals-wrap">
                                        <div className="available-deals-label">
                                          Also Available Deals
                                        </div>
                                        <div className="deal-pills-row">
                                          {/* Destination Sales — display-only badge that
                                              indicates the hotel has at least one of:
                                              Special Rate / Discount / Stay Pay. Not
                                              clickable; no navigation. */}
                                          {hotel.hasDestinationSales && (
                                            <span
                                              className="deal-pill deal-destination-sales"
                                              title="Destination Sales"
                                              style={{
                                                backgroundColor: "#6f42c1",
                                                color: "#fff",
                                                cursor: "default",
                                              }}
                                            >
                                              Destination Sales
                                            </span>
                                          )}
                                          {getHotelFeatureLabels(hotel).map((label) => {
                                            const meta = DEAL_PILL_META[label] || { cls: "" };
                                            const isClickable = !!meta.route;
                                            return (
                                              <span
                                                key={label}
                                                role={isClickable ? "button" : undefined}
                                                tabIndex={isClickable ? 0 : undefined}
                                                className={`deal-pill ${meta.cls}${isClickable ? " deal-pill-clickable" : ""}`}
                                                title={isClickable ? `Open ${label} booking` : label}
                                                style={isClickable ? { cursor: "pointer" } : undefined}
                                                onClick={(e) => {
                                                  if (!isClickable) return;
                                                  e.stopPropagation();
                                                  navigate(meta.route);
                                                }}
                                                onKeyDown={(e) => {
                                                  if (!isClickable) return;
                                                  if (e.key === "Enter" || e.key === " ") {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    navigate(meta.route);
                                                  }
                                                }}
                                              >
                                                {label}
                                              </span>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}

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
                                      <div
                                        style={{
                                          fontSize: "1.1rem",
                                          fontWeight: "600",
                                          color: "#333",
                                        }}
                                      >
                                        {hotel.price
                                          ? `${hotel.displayCurrencyCode || displayCurrencyCode} ${Number(
                                              hotel.displayPrice != null
                                                ? hotel.displayPrice
                                                : hotel.price,
                                            ).toLocaleString(undefined, {
                                              minimumFractionDigits: 2,
                                              maximumFractionDigits: 2,
                                            })}`
                                          : "Price on request"}
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
                                          clickedHotelIds.includes(hotel.id)
                                            ? "secondary"
                                            : "primary"
                                        }
                                        onClick={() =>
                                          openRoomListForHotel(hotel)
                                        }
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
                        ))
                      ) : pollStatus === "IN_PROGRESS" || isLoading ? (
                        // Search is still in flight — the supplier
                        // fan-out hasn't finished yet, so an empty
                        // filteredResults just means we don't have
                        // rates back for this filter YET. Show a
                        // "fetching best prices" placeholder instead
                        // of the misleading "No hotels found" panel,
                        // which only makes sense once polling is
                        // COMPLETED.
                        <Col xs={12}>
                          <Card className="shadow-sm rounded-xl">
                            <Card.Body className="text-center py-5">
                              <Spinner
                                animation="border"
                                variant="primary"
                                className="mb-3"
                              />
                              <h5 className="text-primary mb-1">
                                Fetching best prices…
                              </h5>
                              <p className="text-muted mb-0">
                                We're comparing rates across every
                                supplier for you. Hang on a moment.
                              </p>
                            </Card.Body>
                          </Card>
                        </Col>
                      ) : (
                        <Col xs={12}>
                          <Card className="shadow-sm rounded-xl">
                            <Card.Body className="text-center text-muted py-5">
                              <FaSearch className="display-4 text-muted mb-3" />
                              <h5>No hotels found</h5>
                              <p>
                                {channelType.length > 0
                                  ? `No hotels found for selected channel(s): ${channelType
                                      .map((c) => c.label)
                                      .join(", ")}`
                                  : "We couldn't find any hotels matching your selected criteria. Try adjusting your dates, room preferences, or destination to discover available alternatives."}
                              </p>
                              <Button
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
                                Clear All Filters
                              </Button>
                            </Card.Body>
                          </Card>
                        </Col>
                      )}
                    </Row>

                    {/* {hasSearched && */}
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
                              ),
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

          {ENABLE_MAP_PREVIEW && (
            <MapModal
              show={showMapModal}
              onHide={() => setShowMapModal(false)}
              markers={mapMarkers}
              title="Explore on Map"
              onHotelSelect={(hotelId) => {
                // Map popup's "View Rooms" — resolve the marker back to
                // the full hotel object (markers only carry a light
                // subset) and reuse the shared handler so the payload
                // and route match the row-level button exactly.
                const hotel = filteredResults.find(
                  (h) => h.id === hotelId,
                );
                if (hotel) openRoomListForHotel(hotel);
              }}
              starOptions={starOptions}
              starRating={starRating}
              onStarRatingChange={setStarRating}
              sortBy={sortBy}
              onSortByChange={setSortBy}
              onClearFilters={() => {
                setStarRating(null);
                setHotelType([]);
                setChannelType([]);
                setAvailableDeals([]);
                setSortBy("priceAsc");
                setHotelSearchTerm("");
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
