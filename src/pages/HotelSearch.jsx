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
import {
  getCurrentActiveRole,
  getUserId,
  getUserName,
  getUserRole,
  setUserId,
} from "../utils/authSession";
import { displayHotelName, isAgentLogin } from "../utils/supplierDisplay";
import HotelSearchProgressBar from "../components/HotelSearchProgressBar";
import {
  incompleteSearchNotice,
  mapHotelRow,
  pollUntilFinished,
  readProgress,
  roomListApiId,
  roomListHandoff,
} from "../utils/hotelSearchResults";
import { refundPolicyOfFilter } from "../utils/refundLabel";
import AdvertisementCarousel from "../components/AdvertisementCarousel";
import TimeApplyPicker from "../components/TimeApplyPicker";
import PriceRangeSlider from "../components/PriceRangeSlider";
import DateInput from "../components/DateInput";
import MapModal from "../components/map/MapModal";
import { formatHotelPrice } from "../components/map/hotelMapData";
import {
  filterHotelResults,
  idBatches,
  needsWholeResultSet,
  resultsQueryParams,
} from "../utils/hotelResultFilters";
import useTwentyFourHourEligibility from "../hooks/useTwentyFourHourEligibility";
import { resultsCounterText } from "../utils/resultsCounter";
import { ENABLE_MAP_PREVIEW } from "../config/featureFlags";
import { FaSearch, FaStar, FaInfoCircle } from "react-icons/fa";
import { useNavigate, useLocation } from "react-router-dom";
import "../styles/HotelSearch.css";
import toast from "react-hot-toast";
import { apiErrorMessage } from "../utils/apiErrorMessage";

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
                // `??` (not `||`) so a chosen age of 0 survives a
                // children-count change instead of resetting to 5.
                (_, j) => r.childAges[j] ?? 5,
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
                        value={room.childAges[idx] ?? 5}
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
  const activeRole = getCurrentActiveRole().trim().toUpperCase();
  const storedRoles = getUserRole().toUpperCase();
  const isAgentRole = activeRole
    ? activeRole === "AGENT"
    : storedRoles.includes("AGENT") && !storedRoles.includes("ADMIN");

  // Logged-in agent's name — for agent logins the booking is "done by" the
  // agent themselves, so the "Booking Done By Employee" picker is hidden and
  // this name is shown (and sent) instead. Same source the payload's
  // agentName uses for agent logins. Empty for admin/staff.
  const loggedInAgentName = getUserName();

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
  // Per-company supplier list — populated once on mount from
  // /api/hotel-search/my-allowed-suppliers. When `channelsUnrestricted` is
  // true (no company assigned or no picks made yet) the sidebar channel filter
  // keeps every option visible. Purely presentational — the server-side
  // HotelApiCallerContext is still the authoritative gate on which suppliers
  // are queried.
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
  // Refund Policy sidebar filter. Sent to /results as `refundPolicy` so it
  // narrows the WHOLE result set (all pages), and re-applied client-side in
  // filteredResults so the list is right even while suppliers are still
  // polling. At most one box can be ticked (the checkboxes clear each
  // other); none ticked = no narrowing. Strict: hotels whose
  // supplier sends no refund info at search time (flag null) are hidden
  // while either box is ticked.
  const [refundPolicy, setRefundPolicy] = useState({
    refundable: false,
    partial: false,
    nonRefundable: false,
  });
  // View Rooms hands this same value to the room list (roomListHandoff), so
  // the room list opens with the same box ticked.
  const refundPolicyParam = refundPolicyOfFilter(refundPolicy);
  // Budget slider + price chart (sidebar, above Refund Policy). All values
  // are AED, the unit of hotel.price / baseRate; labels convert to the
  // display currency.
  //   priceBounds — { min, max, sliderMax, histogram } for the whole result
  //                 set, from the backend's priceMin / priceMax /
  //                 priceSliderMax / priceHistogram (null = none yet).
  //   priceSlider — [lo, hi] while dragging; an end left at its edge is null
  //                 ("no limit"), so it keeps tracking the edge as more
  //                 suppliers report in (null = whole range).
  //   priceRange  — committed [lo, hi] with the same null-ends, sent to
  //                 /results as minPrice / maxPrice so it narrows every page.
  const [priceBounds, setPriceBounds] = useState(null);
  const [priceSlider, setPriceSlider] = useState(null);
  const [priceRange, setPriceRange] = useState(null);
  const minPriceParam = priceRange?.[0] ?? undefined;
  const maxPriceParam = priceRange?.[1] ?? undefined;
  // Whole-number slider ends — cheapest to dearest rate, the same ends the
  // backend's chart bars are laid across. A single price still gets a
  // 1-wide track.
  const budgetMin = priceBounds ? Math.floor(priceBounds.min) : 0;
  const budgetMax = priceBounds
    ? priceBounds.sliderMax ||
      Math.max(Math.ceil(priceBounds.max), budgetMin + 1)
    : 0;
  // Commit the handles 400 ms after they stop moving, so a drag refetches
  // once rather than on every step.
  useEffect(() => {
    const t = setTimeout(() => {
      const lo = priceSlider?.[0] ?? null;
      const hi = priceSlider?.[1] ?? null;
      setPriceRange((prev) =>
        lo === null && hi === null
          ? null
          : prev && prev[0] === lo && prev[1] === hi
            ? prev
            : [lo, hi],
      );
    }, 400);
    return () => clearTimeout(t);
  }, [priceSlider]);
  // Slider data from a /results response. Only replaces the state when it
  // changes, so steady polling doesn't re-render the slider each tick.
  const updatePriceBounds = (data) => {
    const min = Number(data?.priceMin);
    const max = Number(data?.priceMax);
    if (!(min > 0) || !(max > 0)) return;
    const sliderMax =
      Number(data?.priceSliderMax) > 0 ? Number(data.priceSliderMax) : null;
    const histogram = Array.isArray(data?.priceHistogram)
      ? data.priceHistogram.map(Number)
      : [];
    setPriceBounds((prev) =>
      prev &&
      prev.min === min &&
      prev.max === max &&
      prev.sliderMax === sliderMax &&
      prev.histogram.join() === histogram.join()
        ? prev
        : { min, max, sliderMax, histogram },
    );
  };
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
  // The check-in date and time of the last search pressed, which the 24-hour
  // probe asks about (twentyFourHourMap, below). Editing the form without
  // searching again leaves it alone, as the hotels on screen are still that
  // search's.
  const [searched24Slot, setSearched24Slot] = useState(null);
  const [clickedHotelIds, setClickedHotelIds] = useState([]);

  // Map of hotelId → { longStay, twentyFourHourCheckIn, lastMinute, dayStay,
  // meetAndSpace, govEmployeeDiscount, studentDiscount } returned by
  // /api/hotel-feature-flags. Drives the scrolling "Exclusive Deals" banner
  // above the search results and the per-hotel blinking "Flash Sale" pill.
  const [featureFlagsMap, setFeatureFlagsMap] = useState({});

  const [allResults, setAllResults] = useState([]);
  const [finalHotelSearchTerm, setFinalHotelSearchTerm] = useState("");

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
        const registered = Array.isArray(res?.data?.registered)
          ? res.data.registered
          : [];
        setChannelsUnrestricted(unrestricted);
        setRegisteredChannels(
          new Set(registered.map((c) => String(c || "").toLowerCase())),
        );
      } catch (_) {
        if (!cancelled) {
          setChannelsUnrestricted(true);
          setRegisteredChannels(new Set());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  // Latest request wins. Polls and filter / page changes all fetch the list, and
  // a slower older reply must not overwrite what a newer request brought.
  const fetchSeqRef = useRef(0);
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
  const pollStatusRef = useRef("IDLE");
  pollStatusRef.current = pollStatus;
  // Counts from the latest reply, for the progress state. See readProgress.
  const [searchProgress, setSearchProgress] = useState(null);
  const [searchId, setSearchId] = useState(null);
  // Bumped at the start of every search. fetchHotels and the currency
  // picker's /resultsOut refetch capture it at send time and drop their
  // response if another search has started since, so a slow reply that
  // belongs to the PREVIOUS search can never write that destination's rows
  // back into allResults after Modify Search → Search cleared them.
  const searchGenRef = useRef(0);
  const [isDestinationLoading, setIsDestinationLoading] = useState(false);
  const resultsRef = useRef(null);
  const [isInitialResultsLoaded, setIsInitialResultsLoaded] = useState(false);
  const [isNationalityLoading, setIsNationalityLoading] = useState(false);
  // Live height of the sticky summary bar (px). The progress bar reads
  // this into its sticky `top` so it always sits just below the summary
  // bar, even when the summary chips wrap to a second line at narrower
  // widths. 0 = summary bar is not on screen and the progress bar sticks
  // right under the TopBar.
  const summaryBarRef = useRef(null);
  const [summaryBarHeight, setSummaryBarHeight] = useState(0);

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
          `/api/province?search=${encodeURIComponent(backendQuery)}&source=hotel-search`,
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

  // The id list the flags on hand belong to, and whether the hotels on hand
  // are the whole result set. While a deal box is ticked and either is not
  // ready yet, the list waits instead of saying "No hotels found".
  const [featureFlagsCsv, setFeatureFlagsCsv] = useState("");
  const [wholeSetLoaded, setWholeSetLoaded] = useState(false);

  useEffect(() => {
    if (!resultHotelIdsCsv) {
      setFeatureFlagsMap({});
      setFeatureFlagsCsv("");
      return;
    }
    let cancelled = false;
    // A deal filter loads the whole result set (needsWholeResultSet), so the
    // ids go in batches to keep each URL short.
    Promise.all(
      idBatches(resultHotelIdsCsv).map((csv) =>
        axiosInstance
          .get(`/api/hotel-feature-flags?ids=${csv}`)
          .then((res) => res?.data?.hotels || {})
          .catch((err) => {
            console.warn("hotel-feature-flags fetch failed (non-fatal):", err);
            return {};
          }),
      ),
    ).then((parts) => {
      if (cancelled) return;
      setFeatureFlagsMap(Object.assign({}, ...parts));
      setFeatureFlagsCsv(resultHotelIdsCsv);
    });
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

  // Every filter on the page, in the shape utils/hotelResultFilters.js takes.
  // The list and the map both filter with it, so they always agree.
  const resultFilters = useMemo(
    () => ({
      nameQuery: hotelSearchTerm,
      starRating: starRating ? starRating.value : null,
      hotelTypes: hotelType.map((t) => t.value),
      channelTypes: channelType.map((c) => c.value),
      refundPolicy: refundPolicyParam,
      minPrice: minPriceParam,
      maxPrice: maxPriceParam,
      deals: availableDeals.map((d) => d.value),
      twentyFourHour: !!is24HourCheckin,
      sortBy,
    }),
    [hotelSearchTerm, starRating, hotelType, channelType, refundPolicyParam,
      minPriceParam, maxPriceParam, availableDeals, is24HourCheckin, sortBy],
  );

  // 24 Hour Check-In: hotelId → { eligible, percentage } from
  // /api/24-hour-checkin/probe-bulk, for the hotels that pass every other
  // filter (the ones the list would show if eligible). Probed again for the
  // new hotels whenever those change (page, sort, filters, more hotels while
  // suppliers answer) and merged, so pages already seen keep theirs.
  const twentyFourHourCandidates = useMemo(
    () =>
      is24HourCheckin
        ? filterHotelResults(
            allResults,
            { ...resultFilters, twentyFourHour: false },
            { featureFlagsMap },
          )
        : [],
    [is24HourCheckin, allResults, resultFilters, featureFlagsMap],
  );
  const twentyFourHourMap = useTwentyFourHourEligibility({
    enabled: is24HourCheckin,
    searchId,
    date: searched24Slot?.date,
    time: searched24Slot?.time,
    hotels: twentyFourHourCandidates,
  });

  const filteredResults = useMemo(
    () =>
      filterHotelResults(allResults, resultFilters, {
        featureFlagsMap,
        twentyFourHourMap,
      }),
    [allResults, resultFilters, featureFlagsMap, twentyFourHourMap],
  );

  // A deal filter loads the whole result set into one page (see fetchHotels),
  // and its matches are known only once the deal flags for those hotels are in.
  const dealsTicked = availableDeals.length > 0;
  // A failed fetch ends the wait, so the list never spins for good.
  const dealFlagsPending =
    dealsTicked &&
    pollStatus !== "ERROR" &&
    (!wholeSetLoaded ||
      (!!resultHotelIdsCsv && featureFlagsCsv !== resultHotelIdsCsv));

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
    // The card's own apiId first (agents' replies carry apiId but no
    // apiType, so channelType is empty for them), else the supplier code
    // mapped to the room-list id (utils/hotelSearchResults).
    const apiId = roomListApiId(hotel);

    // Display labels for values the payload otherwise carries only as
    // ids/codes. They ride through RoomList into the booking page, which
    // posts them to /api/search-history/save for the admin "Hotel Booking
    // History" report.
    const pickedAgentId = String(isAgentRole ? selfAgentId : agent);
    const pickedAgent = (Array.isArray(agents) ? agents : []).find(
      (a) => String(a?.id) === pickedAgentId,
    );
    const agentName = isAgentRole
      ? getUserName()
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
      // Agent logins: the logged-in agent's own name. Admin/staff: the
      // selected employee's label.
      employeeName: isAgentRole
        ? agentName || null
        : selectedEmployee?.label || null,
      nightsCount: nights,
      apiId,
      rooms: roomsPayload,
      parentBookingCode: parentBookingCode || null,
      // Optional "Booking Done By" selection; agent logins never pick one.
      employeeId: isAgentRole ? null : selectedEmployee?.value || null,
      // Booking Done On Behalf Of Agent Staff (sub-user of the picked agent);
      // forwarded RoomList -> HotelBookingPage -> POST /api/hotel-booking/create.
      agentStaffId:
        selectedAgentStaff?.value != null ? String(selectedAgentStaff.value) : null,
      agentStaffName: selectedAgentStaff?.label || null,
      // 24 Hour Check-In flags — only populated when the user opted in.
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
    // roomListHandoff adds the search's Refund Policy value (when a box is
    // ticked) so the room list opens with the same box ticked.
    sessionStorage.setItem(
      "roomListPayload",
      JSON.stringify(
        roomListHandoff({
          payload,
          meta,
          currency,
          refundPolicy: refundPolicyParam,
        }),
      ),
    );
    setTimeout(() => {
      // religiousMode > force24Hour > apiId — religious is only supported
      // for the inhouse flow (apiId 1); it never touches /api-room-list.
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

  // The "Showing … entries" line. When the page's own filters (24-hour
  // eligibility, name, hotel type, deals) drop hotels from a server page, it
  // counts that page only, as other pages are not known (utils/resultsCounter).
  const resultsCounter = resultsCounterText({
    pageIndex,
    pageSize,
    shown: filteredResults.length,
    pageRows: allResults.length,
    totalElements,
    totalPages: effectiveTotalPages,
  });

  // Page buttons: always the first 3 and last 3 pages, plus the current
  // page and its neighbours (so the window slides as you page through the
  // middle); "…" fills each gap. A gap of a single page shows that page
  // instead — an ellipsis there would hide nothing.
  const pageNumbers = useMemo(() => {
    const EDGE_PAGES = 3;
    const current = pageIndex + 1;
    const total = effectiveTotalPages;
    const shown = new Set();
    for (let i = 1; i <= Math.min(EDGE_PAGES, total); i++) shown.add(i);
    for (let i = Math.max(1, total - EDGE_PAGES + 1); i <= total; i++) shown.add(i);
    for (let i = Math.max(1, current - 1); i <= Math.min(total, current + 1); i++) {
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
    const cached = getUserId();
    if (cached) { setSelfAgentId(cached); return; }
    const userName = getUserName();
    if (!userName) return;
    let cancelled = false;
    axiosInstance
      .get(`/api/personalProfile/${userName}`)
      .then((res) => {
        if (cancelled) return;
        if (res?.data?.id != null) {
          const idv = String(res.data.id);
          setUserId(idv);
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
    axiosInstance
      .get(`/api/agent/${currencyAgentId}`)
      .then((res) => {
        const code = res?.data?.currencyCode;
        if (cancelled || !code || currencyTouchedRef.current) return;
        const opt = currencyOptions.find((o) => o.code === code);
        if (opt) changeDisplayCurrency(opt);
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
  // just a name and address. Agent-side logins never get a supplier name:
  // no channelType, and the name loses any " (SUPPLIER)" suffix.
  const mapMarkers = useMemo(() => {
    const hideSupplier = isAgentLogin();
    return filteredResults.map((hotel) => ({
      id: hotel.id,
      name: displayHotelName(hotel.name),
      lat: hotel.latitude,
      lng: hotel.longitude,
      address: hotel.address,
      contactNumber: hotel.contactNumber,
      image: hotel.image || null,
      rating: Number(hotel.rating) || 0,
      channelType: hideSupplier ? null : hotel.channelType || null,
      hotelType: hotel.type || hotel.hotelType || null,
      // Same text as the card's price (formatHotelPrice); none when the
      // hotel has no rate, so the popup leaves the price row out.
      priceLabel: hotel.price
        ? formatHotelPrice(hotel, displayCurrencyCode)
        : null,
      dealLabels: getHotelFeatureLabels(hotel),
    }));
  }, [filteredResults, displayCurrencyCode, featureFlagsMap]);

  useEffect(() => {
    setPageIndex(0);
    if (hasSearchResult && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [starRating, hotelType, channelType, sortBy, refundPolicyParam,
      minPriceParam, maxPriceParam, availableDeals]);

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

  /**
   * Fetches the page on screen and puts it on screen. The server's page replaces
   * the list every time, while suppliers are answering too: the server has
   * already grouped, filtered, sorted and paged it, so a hotel cannot show twice
   * and a filter cannot be undone by the next reply.
   */
  const fetchHotels = async (page, sid, agentId, nameSearch = "") => {
    const mySeq = ++fetchSeqRef.current;
    try {
      const isNameSearching = !!nameSearch.trim();
      // Client-side owns hotel-name and deal matching (see filteredResults), so
      // either filter pulls the entire result set in one page. Otherwise a
      // hotel that sorts onto page 2+ could never match on page 1.
      const wholeSet = needsWholeResultSet({
        nameQuery: nameSearch,
        deals: resultFilters.deals,
      });
      const NAME_SEARCH_PAGE_SIZE = 100000;
      const endpoint = `/api/hotel-search/results/${sid}`;

      // The server-side filters, shared with the map (utils/hotelResultFilters).
      // Currency conversion is fully backend-side. The admin-only picker's
      // choice is sent as `displayCurrencyCode`; otherwise the backend defaults
      // to the agent's configured currency.
      const params = resultsQueryParams(resultFilters, {
        agentId: agentId || (isAgentRole ? selfAgentId : agent) || 1,
        page: wholeSet ? 0 : page,
        // The backend reads `size`, and defaults to 10 like pageSize here.
        pageSize: wholeSet ? undefined : pageSize,
        size: wholeSet ? NAME_SEARCH_PAGE_SIZE : undefined,
        displayCurrencyCode: selectedCurrency?.code,
      });

      const myCurrencyVersion = currencyVersionRef.current;
      const mySearchGen = searchGenRef.current;

      const res = await axiosInstance.get(endpoint, {
        params,
      });

      // Too late for the screen: a newer search has started, a newer request
      // has been sent, or the currency has changed. The caller still gets the
      // reply, so a poll can see that the search has finished.
      if (
        mySearchGen !== searchGenRef.current ||
        mySeq !== fetchSeqRef.current ||
        myCurrencyVersion !== currencyVersionRef.current
      ) {
        return res.data;
      }

      const mappedResults = Array.isArray(res.data.result)
        ? res.data.result.map((hotel, index) =>
            mapHotelRow(hotel, sid, index, res.data),
          )
        : [];

      // Envelope-level currency metadata that the RoomList / booking-page
      // handoff needs. Cached on a ref so the View Rooms click (which writes the
      // sessionStorage handoff) sees the latest value.
      if (res.data && res.data.displayCurrencyCode) {
        backendDisplayCurrencyRef.current = {
          code: res.data.displayCurrencyCode,
          factor:
            res.data.displayCurrencyFactor != null
              ? Number(res.data.displayCurrencyFactor)
              : 1,
        };
      }

      setAllResults(mappedResults);
      setWholeSetLoaded(wholeSet);
      if (mappedResults.length > 0) setIsInitialResultsLoaded(true);

      // A name or deal filter pulled everything in one go and filters it
      // client-side, so the paginator collapses to a single page. Everything
      // else uses the server's totals.
      const total = Number(res.data.totalResults) || mappedResults.length;
      setTotalElements(wholeSet ? mappedResults.length : total);
      setTotalPages(wholeSet ? 1 : Math.max(1, Math.ceil(total / pageSize)));

      // Keep the LIVE/OFF badges in sync. The backend counts over the full set
      // BEFORE the apiType filter, so ticking one channel never flips the others
      // to OFF. Agents do not receive this: their page has no Channel filter.
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
      updatePriceBounds(res.data);
      setHasSearchResult(true);
      if (res.data.progress) setSearchProgress(readProgress(res.data));
      return res.data;
    } catch (err) {
      console.error("Fetch hotels failed:", err);
      // While suppliers are answering the poll tries again: one failed request
      // must not end a search that is going well.
      if (!nameSearch && pollStatusRef.current !== "IN_PROGRESS") {
        setPollStatus("ERROR");
      }
      throw err;
    }
  };

  // The search's poll is started once but must always ask for what is on screen
  // now: the current page, sort, filters and currency. Reassigned on every render.
  const fetchCurrentPageRef = useRef(null);
  fetchCurrentPageRef.current = (sid) =>
    fetchHotels(pageIndex, sid, agent, finalHotelSearchTerm);

  // Leaving the page ends its poll.
  useEffect(
    () => () => {
      searchGenRef.current += 1;
    },
    [],
  );

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
    const mySearchGen = searchGenRef.current;
    setSearchId(null);
    setIsLoading(true);
    setHasSearched(true);
    setIsEditingSearch(false);
    setHasSearchResult(false);
    setAllResults([]);
    setChannelsWithResults(new Set());
    setPriceBounds(null);
    setPriceSlider(null);
    setPriceRange(null);
    setPollStatus("IDLE");
    setPageIndex(0);
    setTotalElements(0);
    setTotalPages(1);
    setIsInitialResultsLoaded(false);
    setSearchProgress(null);
    setSearched24Slot({ date: checkIn, time: checkInTime24 });
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
      if (mySearchGen !== searchGenRef.current) return;
      // The hotels found so far are usable from here on, so the form is free
      // again: the bar shows the search is still going.
      setSearchId(newSearchId);
      setPollStatus("IN_PROGRESS");
      setIsLoading(false);

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

      const { outcome } = await pollUntilFinished({
        fetchPage: () => fetchCurrentPageRef.current(newSearchId),
        isCancelled: () => mySearchGen !== searchGenRef.current,
      });
      if (outcome === "cancelled") return;
      // The results effect fetches once more on this change, quietly, so the
      // list is right even if the last poll's reply lost to a newer request.
      backgroundRefreshRef.current = true;
      setPollStatus(outcome === "completed" ? "COMPLETED" : "TIMEOUT");
      // 24 Hour Check-In eligibility is probed by useTwentyFourHourEligibility
      // for whatever hotels are on screen, so page 2 and later get theirs too.
    } catch (err) {
      console.error("Search failed:", err);
      // Only the request that starts the search can land here: polling handles
      // its own failures.
      if (mySearchGen === searchGenRef.current) {
        setHasSearched(false);
        setPollStatus("ERROR");
        // Say why instead of silently dropping back to the empty form: the
        // server's own message when it sent one (e.g. a 400 / 409 sentence),
        // otherwise the HTTP status, so the cause is visible on screen.
        const status = err?.response?.status;
        toast.error(
          apiErrorMessage(
            err,
            status
              ? `The search could not start (server error ${status}). Please try again.`
              : "The search could not start: the server did not answer. Please check the connection and try again.",
          ),
        );
      }
    } finally {
      if (mySearchGen === searchGenRef.current) setIsLoading(false);
    }
  };

  // const showResultsDuringPolling =
  //   hasSearchResult &&
  //   isInitialResultsLoaded &&
  //   (pollStatus === "IN_PROGRESS" || pollStatus === "COMPLETED");

  // Single path for every display-currency change (picker + agent default).
  // Same code → no-op. Otherwise drop in-flight replies in the old currency; the
  // results effect then fetches the page again in the new one.
  const changeDisplayCurrency = (opt, { manual = false } = {}) => {
    if (manual) currencyTouchedRef.current = true;
    if (!opt?.code) return;
    setSelectedCurrency(opt);
    if (opt.code === selectedCurrencyCodeRef.current) return;
    selectedCurrencyCodeRef.current = opt.code;
    currencyVersionRef.current += 1;
  };

  const showResultsDuringPolling = hasSearchResult || allResults.length > 0;

  // Collapse the full search form into the sticky summary strip once results
  // are on screen, unless the user explicitly chose to modify the search.
  const collapseSearch = showResultsDuringPolling && !isEditingSearch;

  // Track the summary bar's live height. When the summary bar shows up the
  // sticky progress bar has to sit right below it (both are sticky at the
  // top of the results area — without this the summary bar's higher
  // z-index just covers the progress bar and the user sees nothing while
  // scrolling). ResizeObserver keeps this in sync with chip wrap, viewport
  // changes, and Modify-Search collapse/expand.
  useEffect(() => {
    if (!collapseSearch) {
      setSummaryBarHeight(0);
      return;
    }
    const el = summaryBarRef.current;
    if (!el) return;
    // offsetHeight includes padding + border, matching the summary bar's
    // real sticky footprint (contentRect.height would exclude padding and
    // let the progress bar overlap the bottom of the summary strip).
    setSummaryBarHeight(el.offsetHeight);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const h = el.offsetHeight;
      setSummaryBarHeight((prev) => (prev === h ? prev : h));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [collapseSearch]);

  // Set just before the search finishes, so that last fetch stays quiet.
  const backgroundRefreshRef = useRef(false);

  // Fetches at once when the page, sort, a filter or the currency changes,
  // including while suppliers are answering. The poll then keeps that same view
  // up to date. No loading card during a search: the bar is already on screen and
  // the hotels so far stay usable.
  useEffect(() => {
    const quiet = backgroundRefreshRef.current || pollStatus === "IN_PROGRESS";
    backgroundRefreshRef.current = false;
    if (!searchId || !hasSearched) return;
    if (!quiet) setIsLoading(true);
    fetchHotels(pageIndex, searchId, agent, finalHotelSearchTerm)
      .catch(() => {
        /* already reported by fetchHotels */
      })
      .finally(() => {
        if (!quiet) setIsLoading(false);
      });
  }, [
    pageIndex,
    sortBy,
    starRating,
    channelType,
    refundPolicyParam,
    minPriceParam,
    maxPriceParam,
    hotelType,
    searchId,
    agent,
    hasSearched,
    pollStatus,
    finalHotelSearchTerm,
    // Ticking the first deal box (or clearing the last) switches between one
    // page and the whole set; changing deals in between filters what's loaded.
    dealsTicked,
    // Conversion happens server-side, so a picker change has to fetch again.
    selectedCurrency?.code,
  ]);

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
            <div className="hs-summary-bar" ref={summaryBarRef}>
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

          {/* ── Progress Bar ──
              Rendered here so it sits between the search summary/form and
              the Accommodation results. .search-progress-bar-wrap is made
              sticky in HotelSearch.css so it stays anchored to the top of
              the results area while the user scrolls during a search.
              The wrapper's .hs-progress--below-summary modifier bumps the
              sticky top down when the collapsed summary bar is also on
              screen — otherwise the two would fight for top:64 and the
              summary bar (higher z-index) would cover the progress bar. */}
          <div
            className={
              collapseSearch
                ? "hs-progress-anchor hs-progress--below-summary"
                : "hs-progress-anchor"
            }
            style={{ "--hs-summary-h": `${summaryBarHeight}px` }}
          >
            <HotelSearchProgressBar
              pollStatus={pollStatus}
              progress={searchProgress}
              hotelsSoFar={totalElements}
              isLoading={isLoading}
            />
          </div>

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

                          {/* Hotel-name search input intentionally removed
                              from the left sidebar — it now lives in the
                              top filter row on the right, next to the
                              Clear button (see &lt;Col lg={9}&gt; below). Same
                              state / handlers, so filtering, debounce,
                              and page-reset behaviour are unchanged. */}

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

                          {/* Budget — a bar chart of how many hotels sit at
                              each price, with a two-handle slider under it to
                              narrow the list. Ends come from the whole result
                              set (AED); labels are in the display currency.
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
                                  format={(aed) => {
                                    const factor =
                                      Number(backendDisplayCurrencyRef.current?.factor) > 0
                                        ? Number(backendDisplayCurrencyRef.current.factor)
                                        : 1;
                                    return `${displayCurrencyCode} ${Math.round(
                                      aed * factor,
                                    ).toLocaleString()}`;
                                  }}
                                  ariaLabel="Budget"
                                />
                              </Form.Group>

                              <hr />
                            </>
                          )}

                          {/* Refund Policy — lets the agent narrow the hotel
                              list without opening each hotel's rooms. The two
                              boxes are mutually exclusive: ticking one clears
                              the other, and either can be unticked to show
                              every hotel again. */}
                          <Form.Group className="mb-2">
                            <Form.Label className="fw-semibold small">
                              Refund Policy
                            </Form.Label>
                            <div className="filter-checkbox-list">
                              <Form.Check
                                type="checkbox"
                                id="refund-policy-refundable"
                                label="Flexible"
                                checked={refundPolicy.refundable}
                                onChange={(e) =>
                                  setRefundPolicy({
                                    refundable: e.target.checked,
                                    partial: false,
                                    nonRefundable: false,
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
                                    refundable: false,
                                    partial: e.target.checked,
                                    nonRefundable: false,
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
                                    refundable: false,
                                    partial: false,
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

                          <hr />

                          {/* Channel — supplier/channel checkbox filter.
                              Hidden for agent-side logins, sub-accounts
                              included (agents book only through their
                              contracted channel and the backend already
                              scopes results). */}
                          {!isAgentLogin() && (
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
                              setRefundPolicy({ refundable: false, partial: false, nonRefundable: false });
                              setPriceSlider(null);
                              setPriceRange(null);
                              setSortBy("priceAsc");
                              setHotelSearchTerm("");
                            }}
                          >
                            Clear
                          </Button>

                          {/* Hotel-name search — moved here from the left
                              sidebar. Same state + handlers (500 ms
                              debounce, page-reset) so filtering / name
                              search flows are unchanged. ms-auto pushes it
                              to the right edge of the row so on wide
                              viewports it sits at the far right next to
                              Clear, and on narrow ones it wraps below the
                              sort pills without breaking the layout. */}
                          <Form.Control
                            type="text"
                            placeholder={placeholder}
                            value={hotelSearchTerm}
                            onChange={(e) => {
                              const val = e.target.value;
                              setHotelSearchTerm(val);
                              setPageIndex(0);
                              debouncedSetFinalTerm(val);
                            }}
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

                    {/* {hasSearched && ( */}
                    {(hasSearchResult || allResults.length > 0) && (
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <small className="text-muted fw-semibold">
                          {resultsCounter}
                          {pollStatus === "IN_PROGRESS" && (
                            <span className="ms-1 text-primary">
                              (updating…)
                            </span>
                          )}
                        </small>
                      </div>
                    )}

                    {/* Search has finished but not every supplier answered. The
                        supplier names here come only from an admin's reply. */}
                    {pollStatus === "TIMEOUT" ? (
                      <div className="small text-muted mb-3" role="status">
                        Could not reach the server to finish this search.
                        Showing the hotels found so far.
                      </div>
                    ) : (
                      pollStatus === "COMPLETED" &&
                      incompleteSearchNotice(searchProgress) && (
                        <div
                          className="small text-muted mb-3"
                          role="status"
                          data-testid="hotel-search-incomplete"
                        >
                          {incompleteSearchNotice(searchProgress)}
                        </div>
                      )
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
                                    {/* hs-hotel-img makes the photo follow the
                                        card's height instead of setting it —
                                        see HotelSearch.css. LazyImage takes
                                        only src/alt/className, so a `style`
                                        prop here would be silently dropped. */}
                                    <LazyImage
                                      src={hotel.image}
                                      alt={hotel.name}
                                      className="hs-hotel-img"
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
                                          just adds noise. Hidden for every
                                          agent-side login (isAgentLogin) and
                                          when the hotel has no channelType,
                                          so no empty grey pill is drawn. */}
                                      {!isAgentLogin() && hotel.channelType && (
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
                                      {/* Rate Available is the only box on the
                                          card, for in-house and supplier hotels
                                          alike: no "Best of N suppliers" and no
                                          Flexible / Flexible - Partial / Non
                                          Refundable pills. A hotel several
                                          suppliers sell is still one card at
                                          the best price, and the hasRefundable /
                                          hasPartial / hasNonRefundable flags
                                          still drive the sidebar Refund Policy
                                          filter. */}
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
                                        {/* Same text as the map's marker. */}
                                        {formatHotelPrice(hotel, displayCurrencyCode)}
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
                      ) : pollStatus === "IN_PROGRESS" || isLoading || dealFlagsPending ? (
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
                                  setAvailableDeals([])
                                  setRefundPolicy({ refundable: false, partial: false, nonRefundable: false });
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
                    {/* Shown whenever the server sent hotels for this page,
                        even if 24-hour eligibility or Hotel Type leaves none
                        on screen: other pages may have some, and without the
                        pager there is no way on. (Every result is a "hotel"
                        today, so ticking Hotel removes nothing.) A name or
                        deal filter shows the whole set on one page, so it
                        has none. */}
                    {allResults.length > 0 &&
                      totalElements > 0 &&
                      !(hotelSearchTerm || dealsTicked) && (
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
                // Same reset as the filter row's Clear button, so the
                // list and the map markers stay in step.
                setStarRating(null);
                setHotelType([]);
                setChannelType([]);
                setAvailableDeals([]);
                setRefundPolicy({ refundable: false, partial: false, nonRefundable: false });
                setPriceSlider(null);
                setPriceRange(null);
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
