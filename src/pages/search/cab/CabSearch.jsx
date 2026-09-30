import React, { useState, useRef, useEffect } from "react";
import {
  Card,
  Row,
  Col,
  Form,
  Button,
  Spinner,
  Table,
  ProgressBar,
  Modal,
} from "react-bootstrap";
import {
  FaCar,
  FaSearch,
  FaRoute,
  FaClock,
  FaUserTie,
  FaMoneyBillWave,
  FaCheckCircle,
  FaUsers,
  FaSuitcase,
  FaInfoCircle,
  FaHourglassHalf,
  FaRoad,
} from "react-icons/fa";
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
import TimeApplyPicker from "../../../components/TimeApplyPicker";
import AgentCreditBalance from "../../../components/AgentCreditBalance";
import "../../../styles/HotelSearch.css";
import "../../../styles/CabTransferModal.css";

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
          style={{
            backgroundColor: "#e0e0e0",
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
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
            transition: "opacity 0.3s ease-in-out",
          }}
        />
      )}
    </div>
  );
}

// ── Demo / dummy cab inventory ────────────────────────────────────────
// Sample transfers surfaced for the test route "Dubai International Airport
// → Test Hotel" so the search → results → booking flow can be demonstrated
// without live cab inventory. Each cab carries BOTH an SIC (Shared) and a
// Private rate row so the Shared/Private toggle has data either way.
// Shapes mirror what /api/cab-search/search returns (see mapping below).
const DUMMY_ORIGIN_NAME = "Dubai International Airport";
const DUMMY_DEST_NAME = "Test Hotel";
const DUMMY_CAB_RESULTS = [
  {
    cabid: "demo-sedan",
    cabname: "Toyota Camry (Sedan)",
    cabdetails: "Comfortable 3-seater sedan with luggage space",
    cabpic:
      "https://images.unsplash.com/photo-1549924231-f129b911e442?auto=format&fit=crop&w=480&q=60",
    noOfCabs: 1,
    cabProviderId: null,
    cabProviderName: "Dubai City Transfers",
    originLocationName: DUMMY_ORIGIN_NAME,
    destinationLocationName: DUMMY_DEST_NAME,
    capacityMin: 1,
    capacityMax: 3,
    searchCabDetailsDTO: [
      {
        types: "SIC",
        location: DUMMY_ORIGIN_NAME,
        dropOff: DUMMY_DEST_NAME,
        sicRate: 55,
        totalRate: 55,
        totalRateWithoutMarkup: 50,
      },
      {
        types: "Private",
        location: DUMMY_ORIGIN_NAME,
        dropOff: DUMMY_DEST_NAME,
        privateRate: 130,
        privateTotalRate: 130,
        totalRate: 130,
        totalRateWithoutMarkup: 120,
      },
    ],
  },
  {
    cabid: "demo-suv",
    cabname: "Toyota Land Cruiser (SUV)",
    cabdetails: "Premium 6-seater SUV, ideal for families",
    cabpic:
      "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=480&q=60",
    noOfCabs: 1,
    cabProviderId: null,
    cabProviderName: "Dubai City Transfers",
    originLocationName: DUMMY_ORIGIN_NAME,
    destinationLocationName: DUMMY_DEST_NAME,
    capacityMin: 1,
    capacityMax: 6,
    searchCabDetailsDTO: [
      {
        types: "SIC",
        location: DUMMY_ORIGIN_NAME,
        dropOff: DUMMY_DEST_NAME,
        sicRate: 70,
        totalRate: 70,
        totalRateWithoutMarkup: 64,
      },
      {
        types: "Private",
        location: DUMMY_ORIGIN_NAME,
        dropOff: DUMMY_DEST_NAME,
        privateRate: 220,
        privateTotalRate: 220,
        totalRate: 220,
        totalRateWithoutMarkup: 200,
      },
    ],
  },
  {
    cabid: "demo-van",
    cabname: "Toyota Hiace (Van)",
    cabdetails: "Spacious 10-seater van for groups",
    cabpic:
      "https://images.unsplash.com/photo-1570125909232-eb263c188f7e?auto=format&fit=crop&w=480&q=60",
    noOfCabs: 1,
    cabProviderId: null,
    cabProviderName: "Dubai City Transfers",
    originLocationName: DUMMY_ORIGIN_NAME,
    destinationLocationName: DUMMY_DEST_NAME,
    capacityMin: 1,
    capacityMax: 10,
    searchCabDetailsDTO: [
      {
        types: "SIC",
        location: DUMMY_ORIGIN_NAME,
        dropOff: DUMMY_DEST_NAME,
        sicRate: 45,
        totalRate: 45,
        totalRateWithoutMarkup: 40,
      },
      {
        types: "Private",
        location: DUMMY_ORIGIN_NAME,
        dropOff: DUMMY_DEST_NAME,
        privateRate: 300,
        privateTotalRate: 300,
        totalRate: 300,
        totalRateWithoutMarkup: 275,
      },
    ],
  },
];

export const CabSearch = () => {
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
  const [nationality, setNationality] = useState(
    searchCriteria.nationality || null,
  );
  const [destination, setDestination] = useState(
    searchCriteria.destination || null,
  );

  const [transferPickupDate, setTransferPickupDate] = useState(
    searchCriteria.travelDate || "",
  );
  const [transferDropoffDate, setTransferDropoffDate] = useState(
    searchCriteria.travelDate || "",
  );
  const [transferAdults, setTransferAdults] = useState(
    searchCriteria.adults || 1,
  );
  const [transferChildren, setTransferChildren] = useState(
    searchCriteria.children || 0,
  );
  const [transferChildAges, setTransferChildAges] = useState(
    searchCriteria.childAges || [],
  );

  // Results State
  const [transferResults, setTransferResults] = useState([]);
  const [transferLoading, setTransferLoading] = useState(false);
  const [hasTransferSearched, setHasTransferSearched] = useState(false);
  // When results are on screen the big search form collapses into a sticky
  // summary strip. Clicking "Modify Search" flips this true to re-expand it.
  const [isEditingSearch, setIsEditingSearch] = useState(false);

  // ── View modal — shows full transfer details for one (cab, detail) row.
  // Held as { cab, detail } or null. Driven by the View button on each
  // search-result card. Does not touch the booking flow.
  const [viewModal, setViewModal] = useState(null);

  // ── Booking type toggle for search results ───────────────────────────
  // "All"     → show BOTH SIC and Private rows (default).
  // "Shared"  → show SIC rates priced by passenger count
  //             (paying pax = adults + children whose age > 3).
  // "Private" → show private rates as returned by the backend
  //             (privateTotal flat, falling back to privatePerPax × pax).
  // Default flipped from "Shared" → "All" because external suppliers
  // (IWay Transfers, guide §11.6) are Private-only — a Shared default
  // silently drops every IWay card the moment it lands. "All" surfaces
  // both supplier flavours on first view; the operator can still narrow
  // to Shared/Private via the sidebar radios. Affects ONLY how rows are
  // filtered & priced in the results table — the search request payload
  // is unchanged, so backend behaviour and other flows are untouched.
  const [transferType, setTransferType] = useState("All");

  // ── Result-page filter / sort / pagination state ─────────────────────
  // Mirrors the Juniper-style result page in the reference screenshot:
  //   - free-text "Search by Transfer Name"
  //   - multi-select "Suppliers" (built from the unique cab providers
  //     in the current result set)
  //   - sort by Price (default) or Transfer Name
  //   - basic page-of-N pagination, default 5 cards/page
  // None of these touch the search API — they're applied on top of the
  // already-fetched transferResults array.
  const [nameFilter, setNameFilter] = useState("");
  const [pendingNameFilter, setPendingNameFilter] = useState("");
  const [selectedSuppliers, setSelectedSuppliers] = useState([]);
  const [pendingSuppliers, setPendingSuppliers] = useState([]);
  const [sortBy, setSortBy] = useState("price");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  // Country & Destination state
  const [nationalityList, setNationalityList] = useState([]);
  const [destinationOptions, setDestinationOptions] = useState([]);
  const [isDestinationLoading, setIsDestinationLoading] = useState(false);
  const [isNationalityLoading, setIsNationalityLoading] = useState(false);

  // ── NEW: Pickup / Drop-off detail fields ────────────────────────────
  // pickupType / dropoffType: "HOTEL" | "AIRPORT" | "" (none chosen yet)
  // pickupName / dropoffName: free-text for AIRPORT, dropdown value for HOTEL
  // pickupTime: required only when pickupType === "AIRPORT"
  // dropoffTime: optional, only meaningful when dropoffType === "AIRPORT"
  const [pickupType, setPickupType] = useState("");
  const [pickupName, setPickupName] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [dropoffType, setDropoffType] = useState("");
  const [dropoffName, setDropoffName] = useState("");
  const [dropoffTime, setDropoffTime] = useState("");

  // Hotel-lookup options used when either pickupType OR dropoffType is HOTEL.
  // Fetched from the new lightweight endpoint /api/hotels/lookup,
  // filtered by the current destination's countryId + cityId.
  const [hotelOptions, setHotelOptions] = useState([]);
  const [isHotelLoading, setIsHotelLoading] = useState(false);

  // ── Agent selector (mirrors HotelSearch.jsx pattern) ─────────────────
  const [agent, setAgent] = useState("");
  const [agents, setAgents] = useState([]);

  // ── Currency dropdown ────────────────────────────────────────────────
  // Sourced from /api/currency and rendered as currencyCode-only options
  // (the master row's `name` / `value` aren't surfaced in the picker per
  // spec). The picked code is carried through to the booking page state
  // so downstream conversion logic can use it; the search payload itself
  // is unchanged, so no other flow is affected.
  const [currencyOptions, setCurrencyOptions] = useState([]);
  const [isCurrencyLoading, setIsCurrencyLoading] = useState(false);
  const [currency, setCurrency] = useState(null);

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

  // Load currencies once on mount. The endpoint is paginated; we ask for a
  // generous limit so the whole master list comes back in one call. We map
  // each row to a {value, label} where label is *only* the currencyCode —
  // per spec the user picks "AED" / "INR" etc, not the full currency name.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setIsCurrencyLoading(true);
        const res = await axiosInstance.get("/api/currency", {
          params: { page: 0, limit: 200 },
        });
        if (cancelled) return;
        const arr = Array.isArray(res.data) ? res.data : [];
        const opts = arr
          .filter((c) => c && c.currencyCode && !c.isDeleted)
          .map((c) => ({
            value: c.currencyCode,
            label: c.currencyCode,
            currencyId: c.currencyId,
          }));
        setCurrencyOptions(opts);
      } catch (err) {
        if (!cancelled) {
          console.warn("Currency lookup failed:", err);
          setCurrencyOptions([]);
        }
      } finally {
        if (!cancelled) setIsCurrencyLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── New search criteria (Juniper-style layout) ────────────────────────
  const [tripType, setTripType] = useState("ONE_WAY"); // "ONE_WAY" | "ROUND_TRIP"
  const [timeType, setTimeType] = useState("PICKUP_TIME"); // "PICKUP_TIME" | "FLIGHT_TIME"
  const [origin, setOrigin] = useState(null);
  const [departureTime, setDepartureTime] = useState("");
  const [returnTime, setReturnTime] = useState("");

  // ── NEW simplified Transfer search criteria ───────────────────────────
  // city: the master_state row chosen via api/province (drives the
  //   pickup/drop facility lists). Shape: { value, label, countryId }.
  // pickupKind / dropoffKind: "AIRPORT" | "HOTEL" | "PLACE" | ""
  // pickupItem / dropoffItem: the selected option from the dependent
  //   dropdown — { value, label, source, locationId, locationName }
  // arrivalTime: HH:mm string (mapped to the search payload as
  //   departureTime since the backend uses the same field for both
  //   pickup-time and flight/arrival-time depending on timeType).
  const [city, setCity] = useState(null);
  const [cityOptions, setCityOptions] = useState([]);
  const [isCityLoading, setIsCityLoading] = useState(false);
  const [pickupKind, setPickupKind] = useState("");
  const [pickupItem, setPickupItem] = useState(null);
  const [dropoffKind, setDropoffKind] = useState("");
  const [dropoffItem, setDropoffItem] = useState(null);
  const [arrivalTime, setArrivalTime] = useState("");
  // Drop-side departure time — separate from the pickup-side arrival time
  // above. Sent as `dropoffTime` in the search payload.
  const [dropDepartureTime, setDropDepartureTime] = useState("");

  // "Change drop off city?" — when toggled on, a second City select appears
  // and the drop-side facility lists load from that city instead of the
  // pickup city. When off (default), pickup + drop facilities share the
  // single City selection above.
  const [changeDropCity, setChangeDropCity] = useState(false);
  const [dropCity, setDropCity] = useState(null);
  const [dropCityOptions, setDropCityOptions] = useState([]);
  const [isDropCityLoading, setIsDropCityLoading] = useState(false);

  // ─── Pickup / Drop-off location options ─────────────────────────────
  // ONE searchable dropdown per end, no category step. Both are filled from
  // /api/cab-search/lookup, which searches every in-house master table
  // (sublocations, places, hotels, airports) by the typed term AND appends
  // the locations of whichever suppliers the caller is permitted to use
  // (agent exclusion + company allow-list at /admin/api-access).
  //
  // The picked option carries its own `source`, so the backend — not the
  // operator — decides whether the location is priced through the in-house
  // zone matcher, a supplier, or both. That is what removed the need for
  // the old Airport / Accommodation / Place selector and the separate
  // per-supplier fields.
  //
  // Pickup and drop keep independent option state so typing in one field
  // never disturbs the other's current list or selection.
  const [pickupLocationOptions, setPickupLocationOptions] = useState([]);
  const [isPickupLocationsLoading, setIsPickupLocationsLoading] = useState(false);
  const [dropLocationOptions, setDropLocationOptions] = useState([]);
  const [isDropLocationsLoading, setIsDropLocationsLoading] = useState(false);

  // ─── IWay Transfers (external supplier) ─────────────────────────────
  // Optional second search leg that hits the i'way BS integration
  // (backend: /api/iway/*). Follows the HotelSearch multi-supplier
  // pattern (IWTX / RateHawk / Atharva merge into one result list) — an
  // IWay offer becomes another row in `transferResults` with
  // channelType/source = "IWAY".
  //
  // IWay requires lat/lng for both pickup + drop (guide §11.6), which the
  // existing city+facility selectors don't carry. We collect them via two
  // extra autocomplete inputs backed by IWay's /places/find + /places/{id}
  // passthroughs so the operator can type a real location string and pick
  // a suggestion. Both selections must resolve into { placeId, lat, lng,
  // label } before we send the /transfer-search request; otherwise the
  // IWay leg is silently skipped and the in-house cabProvider results
  // still render on their own.
  const [iwayEnabled, setIwayEnabled] = useState(false);
  const [iwayPickupOptions, setIwayPickupOptions] = useState([]);
  const [iwayPickupSelected, setIwayPickupSelected] = useState(null);
  const [isIwayPickupLoading, setIsIwayPickupLoading] = useState(false);
  const [iwayDropOptions, setIwayDropOptions] = useState([]);
  const [iwayDropSelected, setIwayDropSelected] = useState(null);
  const [isIwayDropLoading, setIsIwayDropLoading] = useState(false);
  const [iwayLoading, setIwayLoading] = useState(false);

  // Shared helper: hit /api/province?search= and return city options shaped
  // for react-select. Used by both the pickup City and the optional Drop
  // City selectors so they show identical results for the same query.
  const fetchCityOptions = async (q) => {
    const res = await axiosInstance.get(
      `/api/province?search=${encodeURIComponent(q || "")}&limit=20`,
    );
    const arr = Array.isArray(res.data) ? res.data : [];
    return arr.slice(0, 50).map((p) => ({
      value: p.id,
      label: `${p.stateName || p.name || ""}${
        p.country ? `, ${p.country}` : ""
      }`,
      countryId: p.countryId || null,
      stateName: p.stateName || p.name || "",
      code: p.countryCode,
    }));
  };

  // City search hits api/province?search= directly so the dropdown shows the
  // matching state rows (id, stateName, country).
  const debouncedCityProvinceSearch = useRef(
    debounce(async (q = "") => {
      try {
        setIsCityLoading(true);
        const opts = await fetchCityOptions(q);
        setCityOptions(opts);
      } catch {
        setCityOptions([]);
      } finally {
        setIsCityLoading(false);
      }
    }, 300),
  ).current;

  // Same logic but for the optional Drop City selector. Kept as a separate
  // debounced ref so typing in one search box doesn't race the other.
  const debouncedDropCityProvinceSearch = useRef(
    debounce(async (q = "") => {
      try {
        setIsDropCityLoading(true);
        const opts = await fetchCityOptions(q);
        setDropCityOptions(opts);
      } catch {
        setDropCityOptions([]);
      } finally {
        setIsDropCityLoading(false);
      }
    }, 300),
  ).current;


  // ── Supplier location autocomplete ─────────────────────────────────
  // One endpoint, one contract: /api/cab-search/lookup returns the
  // in-house groups plus an `external` array of supplier-native locations.
  // We only read `external` here — the in-house pickup/drop lists are
  // already city-filtered by their own loaders — and shape each entry into
  // a react-select option carrying everything the backend needs to place
  // it: source + externalId, and coordinates when the supplier sent them
  // inline (transport nodes do; free-text predictions don't, and those get
  // geocoded server-side at search time).
  // One option object regardless of origin. In-house rows key off `id`,
  // supplier rows off `externalId`; both carry `source`, which is what the
  // backend reads to decide how to price the location — and what the UI now
  // uses in place of the removed category dropdown.
  const buildLocationOption = (item) => ({
    value: item.externalId
      ? `${item.source}:${item.externalId}`
      : `${item.source}:${item.id}`,
    label: item.name,
    subtitle: item.subtitle || "",
    source: item.source,
    locationId: item.id != null ? Number(item.id) : null,
    externalId: item.externalId || null,
    locationName: item.name,
    code: item.code || null,
    lat: item.lat ?? null,
    lng: item.lng ?? null,
    subLocationId: item.subLocationId ?? null,
    subLocationName: item.subLocationName ?? null,
  });

  // Every location the operator can pick, in one call. /api/cab-search/lookup
  // already searches master_sub_locations + master_place + hotel +
  // master_airport by the same term and appends the permitted suppliers'
  // locations under `external`, so a single request fills the whole dropdown
  // without the user having to pick a category first.
  const fetchAllLocationOptions = async (term) => {
    if (!term || term.trim().length < 2) return [];
    try {
      const params = new URLSearchParams({ search: term, limit: "20" });
      const resolvedAgentId =
        (agent && String(agent)) ||
        sessionStorage.getItem("makeYourOwnPackageAgentId") ||
        localStorage.getItem("makeYourOwnPackageAgentId") ||
        "";
      if (resolvedAgentId) params.set("agentId", resolvedAgentId);
      // Opt in to the Transfer Location Mapping substitution — a mapped
      // in-house record disappears from its own group and shows up as the
      // i'way entry in `external`, so the Pickup / Drop dropdown never
      // offers the same real-world place twice. The /registration/cabProvider
      // zone modal deliberately leaves this off so every in-house record
      // stays available for zone building.
      params.set("applyIwayMapping", "true");

      const res = await axiosInstance.get(
        `/api/cab-search/lookup?${params.toString()}`,
      );
      const d = res?.data || {};
      const groups = [];
      const push = (label, rows, filterFn) => {
        const list = (Array.isArray(rows) ? rows : [])
          .filter(filterFn)
          .map(buildLocationOption);
        if (list.length > 0) groups.push({ label, options: list });
      };
      // In-house first — those are the contracted rates operators reach for
      // most — then the supplier feed.
      push("ZONES", d.zones, (r) => r?.id != null);
      push("HOTELS", d.hotels, (r) => r?.id != null);
      push("AIRPORTS", d.airports, (r) => r?.id != null);
      push("IWAY LOCATIONS", d.external, (r) => !!r?.externalId);
      return groups;
    } catch (err) {
      console.warn("Location lookup failed:", err?.message || err);
      return [];
    }
  };

  // ── IWay places autocomplete ───────────────────────────────────────
  // Backed by /api/iway/places/find (server-side passthrough to i'way's
  // /places/find, which itself wraps Google Places Autocomplete). We
  // normalise each prediction into { value, label, placeId } and defer
  // lat/lng resolution to onChange (fetchIwayPlaceDetails below) so we
  // only spend a Place-Details call on the option the user actually
  // picks rather than every autocomplete suggestion.
  const fetchIwayPlaceOptions = async (term) => {
    if (!term || term.trim().length < 2) return [];
    try {
      const res = await axiosInstance.get(
        `/api/iway/places/find?term=${encodeURIComponent(term)}`,
      );
      // The backend returns whatever IWay's /places/find returns — that
      // shape can arrive as either an array of predictions or an object
      // wrapping a `predictions` array (Google's own shape). Normalise
      // both so downstream code has one contract.
      const raw = res.data;
      const predictions = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.predictions)
          ? raw.predictions
          : [];
      return predictions
        .map((p) => {
          const placeId = p.place_id || p.placeId;
          if (!placeId) return null;
          const label =
            p.description ||
            p.formatted_address ||
            p.structured_formatting?.main_text ||
            placeId;
          return { value: placeId, label, placeId };
        })
        .filter(Boolean);
    } catch (err) {
      console.warn("IWay places lookup failed:", err?.message || err);
      return [];
    }
  };

  const debouncedIwayPickupSearch = useRef(
    debounce(async (q = "") => {
      setIsIwayPickupLoading(true);
      try {
        setIwayPickupOptions(await fetchIwayPlaceOptions(q));
      } finally {
        setIsIwayPickupLoading(false);
      }
    }, 350),
  ).current;

  const debouncedIwayDropSearch = useRef(
    debounce(async (q = "") => {
      setIsIwayDropLoading(true);
      try {
        setIwayDropOptions(await fetchIwayPlaceOptions(q));
      } finally {
        setIsIwayDropLoading(false);
      }
    }, 350),
  ).current;

  // Resolve a picked prediction → { lat, lng } via /api/iway/places/{id}
  // (server passthrough to IWay's Place-Details). Called on onChange of
  // the IWay pickup/drop autocomplete so the selected option carries the
  // coordinates GET /prices needs.
  const fetchIwayPlaceDetails = async (placeId) => {
    if (!placeId) return { lat: null, lng: null };
    try {
      const res = await axiosInstance.get(
        `/api/iway/places/${encodeURIComponent(placeId)}`,
      );
      const details = res.data;
      // Google Place Details puts lat/lng at result.geometry.location —
      // handle the object-wrapped and raw-object shapes.
      const geo =
        details?.result?.geometry?.location ||
        details?.geometry?.location ||
        details?.location;
      if (!geo) return { lat: null, lng: null };
      return {
        lat: typeof geo.lat === "function" ? geo.lat() : Number(geo.lat),
        lng: typeof geo.lng === "function" ? geo.lng() : Number(geo.lng),
      };
    } catch (err) {
      console.warn("IWay place details failed:", err?.message || err);
      return { lat: null, lng: null };
    }
  };

  const debouncedPickupLocationSearch = useRef(
    debounce(async (q = "") => {
      setIsPickupLocationsLoading(true);
      try {
        setPickupLocationOptions(await fetchAllLocationOptions(q));
      } finally {
        setIsPickupLocationsLoading(false);
      }
    }, 350),
  ).current;

  const debouncedDropLocationSearch = useRef(
    debounce(async (q = "") => {
      setIsDropLocationsLoading(true);
      try {
        setDropLocationOptions(await fetchAllLocationOptions(q));
      } finally {
        setIsDropLocationsLoading(false);
      }
    }, 350),
  ).current;


  // The per-category, city-scoped option loaders that used to feed the
  // "Pickup Facility" / "Drop Facility" selects are gone. Both fields now
  // draw from /api/cab-search/lookup, which searches every master table (and
  // the permitted suppliers) by the typed term in one call — so there is no
  // category to pre-select and no city to pre-filter by.
  //
  // Leaving them in place would also have been actively wrong: `pickupKind`
  // is now DERIVED from the chosen location, so a city-keyed effect watching
  // it would re-fire on every selection.

  // Combined Origin / Destination options grouped into Zones / Hotels /
  // Airports. Sourced from the new /api/cab-search/lookup endpoint, which
  // searches across master_sub_locations, master_place, hotel, and
  // master_airport in parallel so a single typed query like "burj" surfaces
  // matches across every type.
  const [zoneLocationOptions, setZoneLocationOptions] = useState([]); // grouped
  const [isZoneOptsLoading, setIsZoneOptsLoading] = useState(false);

  const buildLookupOption = (item) => ({
    // value is unique across the four sources
    value: `${item.source}:${item.id}`,
    label: item.name,
    subtitle: item.subtitle || "",
    source: item.source,
    locationId: Number(item.id),
    locationName: item.name,
    code: item.code || null,
    subLocationId: item.subLocationId || null,
    subLocationName: item.subLocationName || null,
  });

  const fetchLookup = (search = "") => {
    setIsZoneOptsLoading(true);
    axiosInstance
      .get(
        `/api/cab-search/lookup?search=${encodeURIComponent(search)}&limit=20`,
      )
      .then((res) => {
        const d = res?.data || {};
        const groups = [];
        const zones = Array.isArray(d.zones) ? d.zones : [];
        const hotels = Array.isArray(d.hotels) ? d.hotels : [];
        const airports = Array.isArray(d.airports) ? d.airports : [];
        if (zones.length > 0) {
          groups.push({
            label: "ZONES",
            options: zones.map(buildLookupOption),
          });
        }
        if (hotels.length > 0) {
          groups.push({
            label: "HOTELS",
            options: hotels.map(buildLookupOption),
          });
        }
        if (airports.length > 0) {
          groups.push({
            label: "AIRPORTS",
            options: airports.map(buildLookupOption),
          });
        }
        setZoneLocationOptions(groups);
      })
      .catch(() => setZoneLocationOptions([]))
      .finally(() => setIsZoneOptsLoading(false));
  };

  useEffect(() => {
    fetchLookup("");
  }, []);

  // Custom react-select option renderer: name on top, light subtitle below.
  const formatLookupOptionLabel = (opt) => (
    <div>
      <div className="fw-semibold">{opt.label}</div>
      {opt.subtitle && <small className="text-muted">{opt.subtitle}</small>}
    </div>
  );

  // ── Per-field validation errors ──────────────────────────────────────
  // Keyed by field name; values are the error message to display under the
  // corresponding input. Cleared as the user edits each field.
  const [validationErrors, setValidationErrors] = useState({});
  const clearError = (field) =>
    setValidationErrors((prev) => {
      if (!prev[field]) return prev;
      const { [field]: _omit, ...rest } = prev;
      return rest;
    });

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
        console.log("axios call error for city list:", error);
        setDestinationOptions([]);
      } finally {
        setIsDestinationLoading(false);
      }
    }, 300),
  ).current;

  // Debounced country search function
  const debouncedCountrySearch = useRef(
    debounce(async (search) => {
      try {
        setIsNationalityLoading(true);
        const response = await axiosInstance.get(
          `/api/country?search=${search}`,
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
        console.log("axios call error for country list:", error);
        setNationalityList([]);
      } finally {
        setIsNationalityLoading(false);
      }
    }, 300),
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

  // ── Fetch hotel list whenever pickup or dropoff type is HOTEL ────────
  // The backend /api/hotels/lookup endpoint accepts optional countryId /
  // cityId. We pass the destination filters when they're available so the
  // list is narrowed to the search city, but we ALSO fire the lookup with
  // no filters when the user hasn't picked a destination yet — that way the
  // dropdown is never empty just because the destination field is blank.
  useEffect(() => {
    const needsHotelList = pickupType === "HOTEL" || dropoffType === "HOTEL";
    if (!needsHotelList) {
      setHotelOptions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setIsHotelLoading(true);
        // Build params dynamically — undefined values are skipped by axios.
        const params = {};
        if (destination?.countryId) params.countryId = destination.countryId;
        if (destination?.value) params.cityId = destination.value;
        const res = await axiosInstance.get("/api/hotels/lookup", { params });
        if (cancelled) return;
        const opts = Array.isArray(res.data)
          ? res.data.map((h) => ({
              value: String(h.hotelName || ""),
              label: h.hotelName || `Hotel #${h.hotelId}`,
              hotelId: h.hotelId,
              address: h.address,
            }))
          : [];
        setHotelOptions(opts);
      } catch (err) {
        if (!cancelled) {
          console.warn("Hotel lookup failed:", err);
          setHotelOptions([]);
        }
      } finally {
        if (!cancelled) setIsHotelLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [destination, pickupType, dropoffType]);

  // Update transfer child ages when number of children changes
  useEffect(() => {
    if (transferChildren > 0) {
      setTransferChildAges((prevAges) => {
        const currentAges = [...prevAges];
        while (currentAges.length < transferChildren) {
          currentAges.push(5); // Default age
        }
        if (currentAges.length > transferChildren) {
          currentAges.splice(transferChildren);
        }
        return currentAges;
      });
    } else {
      setTransferChildAges([]);
    }
  }, [transferChildren]);

  const handleTransferChildAgeChange = (index, value) => {
    const updatedAges = [...transferChildAges];
    updatedAges[index] = parseInt(value) || 5;
    setTransferChildAges(updatedAges);
  };

  // ── Build per-field error map ─────────────────────────────────────────
  // Mirrors the simplified Transfer search layout: Agent → City → Date →
  // Pickup → Arrival time → Drop-off → Pax.
  const buildValidationErrors = () => {
    const errs = {};

    if (!isAgentRole && !agent) errs.agent = "Agent is required.";

    // City no longer scopes the location dropdowns — they search every master
    // table globally — but it still travels through to the booking hand-off,
    // so it stays required for any route with an in-house leg. A route that
    // is supplier-native at BOTH ends never touches the in-house tables, so
    // demanding a city there would block a search we can actually serve.
    const routeIsFullyExternal =
      pickupItem?.source === "IWAY" && dropoffItem?.source === "IWAY";

    if (!city && !routeIsFullyExternal) errs.city = "City is required.";
    if (changeDropCity && !dropCity && !routeIsFullyExternal)
      errs.dropCity = "Drop city is required.";
    if (!transferPickupDate) errs.pickupDate = "Transfer date is required.";

    // The category is no longer a field the user fills — it's derived from
    // the picked location's `source` — so only the location itself is
    // validated here.
    if (!pickupItem) errs.pickupItem = "Please select a pickup location.";

    if (!arrivalTime) errs.arrivalTime = "Arrival time is required.";

    if (!dropoffItem) errs.dropoffItem = "Please select a drop-off location.";

    // Departure time is required whenever the Departure Time field is shown
    // (non-HOTEL drops). Hotel drops hide the field, so it's skipped there.
    if (dropoffKind !== "HOTEL" && !dropDepartureTime)
      errs.dropDepartureTime = "Departure time is required.";

    return errs;
  };

  // ── Real cab ids for the demo route ──────────────────────────────────
  // The booking API (/api/cab/book) requires an existing Cab row, so the
  // demo cards must carry REAL cab ids to be bookable. We pull them from the
  // cab-provider registry: each provider exposes a nested cabList; if that's
  // empty we fall back to the per-provider /cabs/{id} endpoint. Returns up to
  // a handful of { cabId, name, cabpic }.
  const fetchRealCabsForDemo = async () => {
    try {
      const res = await axiosInstance.get("/api/cabProvider", {
        params: { page: 0, limit: 50 },
      });
      const providers = Array.isArray(res.data) ? res.data : [];
      const cabs = [];
      providers.forEach((p) => {
        (Array.isArray(p.cabList) ? p.cabList : []).forEach((c) => {
          if (c?.cabId != null)
            cabs.push({ cabId: c.cabId, name: c.name, cabpic: c.cabpic });
        });
      });
      // Fallback: providers came back without a nested cabList — query the
      // first provider's cabs directly (CabListDTO → { cabId, cabName }).
      if (cabs.length === 0 && providers[0]?.cabprovider != null) {
        const cl = await axiosInstance.get(
          `/api/cabProvider/cabs/${providers[0].cabprovider}`,
        );
        (Array.isArray(cl.data) ? cl.data : []).forEach((c) => {
          if (c?.cabId != null) cabs.push({ cabId: c.cabId, name: c.cabName });
        });
      }
      return cabs;
    } catch (e) {
      console.warn("Demo cab lookup failed:", e);
      return [];
    }
  };

  // ── Common row mapper ────────────────────────────────────────────────
  // Backend now returns the unified CabSearchResult DTO from every
  // supplier, so the mapping is identical whether the row came from the
  // in-house cabProvider tables (apiType="INHOUSE"/channelType="inhouse")
  // or from IWay (apiType="IWAY"/channelType="iway"). Kept outside the
  // handler so the poll callback can call it on every tick without
  // rebuilding closures.
  const ensureHttpImage = (imageUrl) => {
    if (!imageUrl) {
      return "https://via.placeholder.com/400x225?text=Transfer";
    }
    if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
    if (typeof imageUrl === "string") {
      const fileName = imageUrl.split(/[/\\]/).pop();
      if (fileName) {
        return `https://b2b.choosenfly.com/assets/details/profilepic/hotel/${fileName}`;
      }
    }
    return "https://via.placeholder.com/400x225?text=Transfer";
  };

  const mapUnifiedRow = (cab, index) => ({
    cabid: cab.cabid || cab.cabId || `cab-${index}`,
    cabname: cab.cabname || cab.cabName || "Transfer Vehicle",
    cabdetails: cab.cabdetails || "",
    cabpic: ensureHttpImage(cab.cabpic || cab.cabPic),
    noOfCabs: cab.noOfCabs || 1,
    cabProviderId: cab.cabProviderId || null,
    cabProviderName: cab.cabProviderName || "",
    originLocationName: cab.originLocationName || "",
    destinationLocationName: cab.destinationLocationName || "",
    capacityMin: cab.capacityMin ?? null,
    capacityMax: cab.capacityMax ?? null,
    apiType: cab.apiType || null,
    channelType: cab.channelType || null,
    source: cab.apiType || cab.source || null,
    iwayPriceId: cab.iwayPriceId || null,
    iwayPriceUid: cab.iwayPriceUid || null,
    // flexible_tariff flag from the i'way price offer (guide §11.6.2).
    // Carried through so CabBookingPage can forward it to /api/cab/book,
    // where the backend uses it to decide whether to send text_tablet
    // (Meet & Greet sign) on the create-order payload. Null on in-house
    // rows — the backend treats null as "M&G included" (safe default).
    iwayFlexibleTariff:
      cab.flexibleTariff != null ? Boolean(cab.flexibleTariff) : null,
    // allowable_time (seconds) from the i'way price offer — carried
    // through so CabBookingPage can forward it to /api/cab/book, where
    // TripServiceImpl.checkTimeForMeetAndGreet uses it to enforce guide
    // §11.10 locally (pickup_time - now >= allowable_time + 20 min). Null
    // on in-house rows and on any i'way row whose search response omitted
    // the field — the backend then no-ops the check for backwards compat.
    iwayAllowableTime:
      cab.allowableTime != null ? Number(cab.allowableTime) : null,
    searchCabDetailsDTO: Array.isArray(cab.searchCabDetailsDTO)
      ? cab.searchCabDetailsDTO.map((d) => ({
          ...d,
          totalRate:
            d?.totalRate != null
              ? Number(d.totalRate)
              : d?.totalRateWithMrk != null
                ? Number(d.totalRateWithMrk)
                : null,
          totalRateWithoutMarkup:
            d?.totalRateWithoutMarkup != null
              ? Number(d.totalRateWithoutMarkup)
              : d?.totalRateWithoutMrk != null
                ? Number(d.totalRateWithoutMrk)
                : null,
        }))
      : [],
  });

  // ── POST → poll helper (parity with HotelSearch.jsx's flow) ─────────
  // POST /api/cab-search/search returns a UUID; then poll
  // GET /api/cab-search/results/{searchId} every intervalMs until the
  // response's finalStatus === "COMPLETED" (all suppliers finished/errored).
  // Progressive results land in state on every tick via onUpdate.
  const pollUntilCabSearchComplete = async (
    searchId,
    onUpdate,
    { intervalMs = 2000, timeoutMs = 30000, initialDelay = 500 } = {},
  ) => {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let pollCount = 0;

      const tick = async () => {
        try {
          pollCount++;
          const res = await axiosInstance.get(
            `/api/cab-search/results/${encodeURIComponent(searchId)}`,
            { params: { page: 0, size: 100 } },
          );
          if (onUpdate) onUpdate(res.data, pollCount);
          if (res.data?.finalStatus === "COMPLETED") return resolve(res.data);
          if (Date.now() - startTime >= timeoutMs) {
            return reject(new Error("Polling timed out"));
          }
          setTimeout(tick, intervalMs);
        } catch (err) {
          reject(err);
        }
      };
      setTimeout(tick, initialDelay);
    });
  };


  // One location shape for every supplier. `source` + `id` drive the
  // in-house zone matcher; `externalId` + coords drive coordinate-based
  // suppliers. Whichever the operator picked, both legs receive the same
  // object and each decides for itself whether it can serve it. Hoisted to
  // component scope (not just the search-submit handler) so handleBookNow
  // can reuse it to build the same origin/destination for the booking
  // hand-off — the backend re-resolves it via IwayPlaceResolver exactly as
  // it did at search time.
  const toTransferLocation = (item, fallbackSource) => {
    if (!item) return null;
    return {
      source: item.source || fallbackSource,
      id: item.locationId ?? null,
      externalId: item.externalId ?? null,
      name: item.locationName || item.label || null,
      subtitle: item.subtitle || null,
      // IATA when known. The backend uses it to match a supplier airport
      // back onto master_airport, which is what lets an i'way-picked
      // airport still return in-house cabProvider rates.
      code: item.code || null,
      lat: item.lat ?? null,
      lng: item.lng ?? null,
    };
  };


  const handleTransferSearchSubmit = async (e) => {
    e.preventDefault();

    // Run validation. If anything's wrong, surface inline + a single toast
    // pointing the user at the form, then short-circuit.
    const errs = buildValidationErrors();
    setValidationErrors(errs);
    if (Object.keys(errs).length > 0) {
      return;
    }

    setTransferLoading(true);
    setHasTransferSearched(true);
    setIsEditingSearch(false);
    setTransferResults([]);

    try {
      const agentId =
        (agent && String(agent)) ||
        sessionStorage.getItem("makeYourOwnPackageAgentId") ||
        localStorage.getItem("makeYourOwnPackageAgentId") ||
        "1";


      const originLocation = toTransferLocation(pickupItem, "AIRPORT");
      const destinationLocation = toTransferLocation(dropoffItem, "HOTEL");

      const iwayReady =
        iwayEnabled &&
        iwayPickupSelected?.lat != null &&
        iwayPickupSelected?.lng != null &&
        iwayDropSelected?.lat != null &&
        iwayDropSelected?.lng != null;


      const transferPayload = {
        origin: originLocation,
        destination: destinationLocation,
        currency: currency?.value || null,
        // Legacy flat mirror. The backend's normalize() would derive these
        // anyway, but sending them keeps any older consumer of this payload
        // (and the request logs) reading exactly what they read before.
        originSource: originLocation?.source || "AIRPORT",
        originLocationId: originLocation?.id || null,
        originLocationName: originLocation?.name || null,
        destinationSource: destinationLocation?.source || "HOTEL",
        destinationLocationId: destinationLocation?.id || null,
        destinationLocationName: destinationLocation?.name || null,
        tripType: "ONE_WAY",
        timeType: "FLIGHT_TIME",
        departureDate: transferPickupDate || null,
        departureTime: arrivalTime || null,
        dropoffTime: dropDepartureTime || null,
        returnDate: null,
        returnTime: null,
        adults: transferAdults || 1,
        children: transferChildren || 0,
        childAges:
          transferChildAges && transferChildAges.length > 0
            ? transferChildAges.map((age) => parseInt(age) || 0)
            : transferChildren > 0
              ? Array(transferChildren).fill(0)
              : [],
        agentId: agentId ? Number(agentId) : null,
        // IWay leg piggybacked on the same request — backend skips the
        // IWay fan-out when iwayEnabled=false or coords are missing.
        iwayEnabled: iwayReady,
        iwayStartPlaceId: iwayReady ? iwayPickupSelected.placeId : null,
        iwayStartLat: iwayReady ? iwayPickupSelected.lat : null,
        iwayStartLng: iwayReady ? iwayPickupSelected.lng : null,
        iwayStartLabel: iwayReady ? iwayPickupSelected.label : null,
        iwayFinishPlaceId: iwayReady ? iwayDropSelected.placeId : null,
        iwayFinishLat: iwayReady ? iwayDropSelected.lat : null,
        iwayFinishLng: iwayReady ? iwayDropSelected.lng : null,
        iwayFinishLabel: iwayReady ? iwayDropSelected.label : null,
        iwayCurrency: iwayReady ? currency?.value || null : null,
      };

      // Agent search log (Unbooked Opportunities → Searches tab) —
      // transfer has no city; destinationLabel becomes "origin → drop".
      // Prefer the iway pickup/drop labels when both are set, otherwise
      // fall back to the origin/destination selects.
      {
        const originLabel =
          (iwayPickupSelected && iwayPickupSelected.label) ||
          origin?.label ||
          origin?.locationName;
        const dropLabel =
          (iwayDropSelected && iwayDropSelected.label) ||
          destination?.label ||
          destination?.locationName;
        const composite = [originLabel, dropLabel].filter(Boolean).join(" → ");
        logAgentSearch({
          agentId: agentId ? Number(agentId) : null,
          destinationLabel: composite || null,
          checkIn: transferPickupDate,
          checkOut: transferPickupDate,
          source: "transfer",
        });
      }

      // ── 1) Kick off the async fan-out ─────────────────────────────
      // POST /search publishes one Rabbit message per supplier and
      // returns immediately with { searchId, status, suppliers } — no
      // supplier is queried on this thread. Same pattern the hotel
      // search uses (/api/hotel-search/search returns a searchId that
      // /api/hotel-search/results/{searchId} then polls).
      const initRes = await axiosInstance.post(
        "/api/cab-search/search",
        transferPayload,
      );
      const searchId = initRes?.data?.searchId;
      if (!searchId) throw new Error("No searchId returned");

      // Which suppliers the backend actually dispatched to, after agent
      // exclusion + company allow-list. Used below to decide whether a
      // missing supplier row is worth reporting.
      const dispatchedSuppliers = Array.isArray(initRes?.data?.suppliers)
        ? initRes.data.suppliers.map((s) => String(s).toLowerCase())
        : [];

      if (iwayReady) setIwayLoading(true);


      // Precompute demo-route flag / real-cab list so the poll can fold
      // the dummy cards in alongside without re-fetching every tick.
      const originLabel = (origin?.label || origin?.locationName || "").toLowerCase();
      const destLabel = (destination?.label || destination?.locationName || "").toLowerCase();
      const isDemoRoute =
        originLabel.includes("dubai") &&
        originLabel.includes("airport") &&
        destLabel.includes("test hotel");
      let demoResults = [];
      if (isDemoRoute) {
        const realCabs = await fetchRealCabsForDemo();
        if (realCabs.length === 0) {
          toast.error(
            "No registered cabs found — demo cards will show but can't be booked. Register a cab first.",
          );
        }
        demoResults = DUMMY_CAB_RESULTS.map((tpl, i) => {
          const real = realCabs.length ? realCabs[i % realCabs.length] : null;
          return { ...tpl, cabid: real ? real.cabId : tpl.cabid };
        });
      }

      // ── 2) Poll for progressive results ───────────────────────────
      // Each tick reads whatever suppliers have written into Redis so
      // far. We overwrite transferResults on every tick with the freshly
      // deduped list (the poll response IS the current state), so as
      // suppliers finish new cards fade into view without re-rendering
      // the whole table twice. Demo cards are appended locally.
      let finalData = null;
      try {
        finalData = await pollUntilCabSearchComplete(
          searchId,
          (data /* pollCount */) => {
            const merged = Array.isArray(data?.result)
              ? data.result.map(mapUnifiedRow)
              : [];
            setTransferResults(
              demoResults.length ? [...merged, ...demoResults] : merged,
            );
          },
        );
      } catch (pollErr) {
        // Polling errored or timed out — keep whatever landed so far.
        console.warn("Cab-search poll ended early:", pollErr?.message || pollErr);
      }


      // Post-completion: if IWay was requested but no IWay row landed,
      // hint the operator. Uses the LAST poll response so we don't lie
      // about a mid-flight tick.
      if (iwayReady && finalData) {
        const iwayRows = (finalData.result || []).some(
          (r) =>
            (r.channelType && r.channelType.toLowerCase() === "iway") ||
            (r.apiType && r.apiType.toUpperCase() === "IWAY"),
        );
        if (!iwayRows) {
          toast("IWay Transfers returned no offers for this route.", { icon: "ℹ️" });
        }
      }
    } catch (err) {
      console.error("Transfer search failed:", err);
      toast.error("Failed to search for transfers.");
      setTransferResults([]);
    } finally {
      setTransferLoading(false);
      setIwayLoading(false);
    }
  };

  // ── Paying pax for SIC pricing ───────────────────────────────────────
  // SIC (Seat-In-Coach / Shared) is per-seat. Adults always pay. Children
  // are charged only when their age is strictly greater than 3 (toddlers
  // age 0–3 ride free). When child ages are not collected yet we
  // conservatively count all children as paying.
  const sicPayingPax = (() => {
    const adults = Number(transferAdults) || 0;
    const childCount = Number(transferChildren) || 0;
    if (childCount <= 0) return adults;
    if (Array.isArray(transferChildAges) && transferChildAges.length > 0) {
      const payingChildren = transferChildAges
        .slice(0, childCount)
        .filter((age) => Number(age) > 3).length;
      return adults + payingChildren;
    }
    return adults + childCount;
  })();

  // Total head-count (used for Private per-pax fallback pricing).
  const totalPax =
    (Number(transferAdults) || 0) + (Number(transferChildren) || 0);

  // Price a single search-result row for the currently selected transfer
  // type. Returns { total, baseTotal, perUnit, label } where:
  //   total     → headline price WITH agent markup (what the user pays)
  //   baseTotal → price WITHOUT markup (kept for the booking summary)
  //   perUnit   → per-pax rate used for the "× N pax" breakdown
  //   label     → "× N pax" qualifier (empty when not applicable)
  // We prefer the backend's `totalRate` (markup-applied on the server)
  // whenever it's present so the displayed price always matches the
  // billable amount. If the backend hasn't sent it (older responses /
  // markup misconfigured) we fall back to the per-pax rule for SIC and
  // the existing chain for Private — the UI still works, just without
  // markup applied.
  const priceDetail = (detail) => {
    if (!detail) return { total: 0, baseTotal: 0, perUnit: 0, label: "" };

    const backendWithMarkup =
      detail.totalRate != null ? Number(detail.totalRate) : null;
    const backendBase =
      detail.totalRateWithoutMarkup != null
        ? Number(detail.totalRateWithoutMarkup)
        : null;

    const rowType = String(detail.types || "").toUpperCase();
    const isSharedRow =
      rowType === "SIC" ||
      (rowType === "" && transferType === "Shared");

    if (isSharedRow) {
      const per = Number(detail.sicRate) || 0;
      const fallbackTotal = per * sicPayingPax;
      // Prefer backend's markup-applied total; fall back to per-seat × pax.
      const total =
        backendWithMarkup != null && backendWithMarkup > 0
          ? backendWithMarkup
          : fallbackTotal;
      const baseTotal =
        backendBase != null && backendBase > 0 ? backendBase : fallbackTotal;
      return {
        total,
        baseTotal,
        perUnit: per,
        label: sicPayingPax > 0 ? `× ${sicPayingPax} pax` : "",
      };
    }

    // Private: backend markup-applied total wins. Fall back through
    // privateRate → privatePerPaxRate × totalPax → privateTotalRate
    // (existing behaviour, retained for backwards compatibility).
    if (backendWithMarkup != null && backendWithMarkup > 0) {
      return {
        total: backendWithMarkup,
        baseTotal:
          backendBase != null && backendBase > 0
            ? backendBase
            : backendWithMarkup,
        perUnit: 0,
        label: "",
      };
    }
    const privateRate = Number(detail.privateRate) || 0;
    if (privateRate > 0)
      return {
        total: privateRate,
        baseTotal: privateRate,
        perUnit: 0,
        label: "",
      };
    const perPax = Number(detail.privatePerPaxRate) || 0;
    if (perPax > 0 && totalPax > 0) {
      const computed = perPax * totalPax;
      return {
        total: computed,
        baseTotal: computed,
        perUnit: perPax,
        label: `× ${totalPax} pax`,
      };
    }
    const flat = Number(detail.privateTotalRate) || 0;
    return { total: flat, baseTotal: flat, perUnit: 0, label: "" };
  };

  const handleBookNow = (cab, cabDetail) => {

    const isIway = cab?.channelType === "iway" || cab?.source === "IWAY";

    // Recompute the row's price the same way the table shows it so the
    // booking page receives a consistent total. We carry BOTH the
    // markup-applied price (`totalRate`, what the user pays) and the
    // base price (`totalRateWithoutMarkup`, used by the order summary
    // to display the markup separately). For backwards compatibility
    // with CabBookingPage we also keep `totalRateWithoutMrk` aligned
    // to the markup-applied total, since that's the field it reads as
    // its initial billable amount.
    const { total: rowTotal, baseTotal } = priceDetail(cabDetail);
    const detailType = String(cabDetail.types || "").toUpperCase();
    const resolvedType =
      detailType === "SIC" || detailType === "PRIVATE"
        ? detailType === "SIC"
          ? "SIC"
          : "Private"
        : transferType === "Shared"
          ? "SIC"
          : "Private";
    const enrichedSelectedOption = {
      ...cabDetail,
      types: resolvedType,
      // New, explicitly named fields:
      totalRate: rowTotal, // billable price WITH agent markup
      totalRateWithoutMarkup: baseTotal, // base price WITHOUT agent markup
      // Legacy field name preserved for backwards compatibility with
      // CabBookingPage's API payload (totalRateWithoutmrk). This MUST
      // stay equal to the base (no-markup) price so the booked rate
      // and the supplier-side base reconcile correctly downstream.
      totalRateWithoutMrk: baseTotal,
    };
    // Assemble the payload the checkout page needs.
    const bookingState = {
      cab,
      selectedOption: enrichedSelectedOption,
      searchCriteria: {
        // Selected agent — carried forward so /cab-booking-page can
        // stamp it on the /api/cab/book payload. Falls back to the
        // same session/local keys the search request already reads
        // so behaviour matches whichever value the user searched with.
        // For agent-role logins the Agent picker is hidden and nobody
        // sets makeYourOwnPackageAgentId, so drop to the logged-in
        // user's own userId — that IS their agent id (the backend
        // forces the booking to the logged-in agent anyway).
        agentId:
          (agent && String(agent)) ||
          sessionStorage.getItem("makeYourOwnPackageAgentId") ||
          localStorage.getItem("makeYourOwnPackageAgentId") ||
          (isAgentRole ? localStorage.getItem("userId") : "") ||
          "",
        nationality,
        destination,
        city,
        pickupDate: transferPickupDate,
        dropoffDate: transferDropoffDate,
        adults: transferAdults,
        children: transferChildren,
        childAges: transferChildAges,
        // Carry the simplified Transfer criteria forward so the booking
        // summary can display facility names and (where present) times.
        pickupType: pickupKind === "HOTEL" ? "HOTEL" : pickupKind,
        pickupName: pickupItem?.locationName || "",
        pickupTime: arrivalTime,
        // Master-configured estimated arrival buffer for the picked
        // airport — carried through so the booking page renders it
        // read-only instead of asking the operator to retype it.
        pickupEstimatedArrivalTime:
          pickupKind === "AIRPORT"
            ? pickupItem?.estimatedArrivalTime || ""
            : "",
        dropoffType: dropoffKind === "HOTEL" ? "HOTEL" : dropoffKind,
        dropoffName: dropoffItem?.locationName || "",
        dropoffTime: dropDepartureTime || "",
        arrivalTime,
        // Currency code (e.g. "AED") chosen on the search page — carried
        // through so the booking page / downstream invoice can apply
        // conversion. Null when the user didn't pick one.
        currencyCode: currency?.value || null,
        // i'way booking fields — null/absent for in-house rows, so the
        // existing in-house payload shape is completely unaffected.
        // origin/destination reuse the exact same shape the /prices search
        // request already sent, so the backend can re-resolve i'way
        // place_id/coordinates via IwayPlaceResolver at booking time exactly
        // as it did at search time.
        apiType: isIway ? "IWAY" : null,
        iwayPriceId: isIway ? (cab?.iwayPriceId ?? null) : null,
        iwayPriceUid: isIway ? (cab?.iwayPriceUid ?? null) : null,
        // Guide §11.10 pre-order time check on the backend needs the
        // offer's allowable_time. Carried on searchCriteria so
        // CabBookingPage doesn't have to re-read it off the cab row.
        // Null on in-house rows and on i'way rows whose offer omitted it.
        iwayAllowableTime: isIway ? (cab?.iwayAllowableTime ?? null) : null,
        originLocation: isIway ? toTransferLocation(pickupItem, "AIRPORT") : null,
        destinationLocation: isIway ? toTransferLocation(dropoffItem, "HOTEL") : null,
      },
    };

    // Open the checkout in a NEW TAB with a CLEAN URL: /cab-booking-page
    // (no query params). Router state can't cross a browser tab, so the
    // payload is stashed in localStorage under a one-time
    // `cabBookingDraft:<id>` key and the id is handed to the new tab via
    // `window.open(url, targetName)` — the second arg becomes the new tab's
    // `window.name`, which CabBookingPage reads (and clears) on mount.
    // If the hand-off or the popup is blocked, fall back to same-tab
    // navigation via router state.
    const draftId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    let handedOff = false;
    try {
      localStorage.setItem(
        `cabBookingDraft:${draftId}`,
        JSON.stringify(bookingState),
      );
      handedOff = true;
    } catch {
      // localStorage full/unavailable — we'll navigate in the same tab.
    }

    const newTab = handedOff
      ? window.open(
          `${window.location.origin}/cab-booking-page`,
          `cabBookingDraft:${draftId}`,
        )
      : null;

    if (newTab) {
      // Same-origin, but sever the opener reference as a tidy default.
      newTab.opener = null;
    } else {
      // Popup blocked or hand-off failed — keep the original behaviour and
      // navigate in the current tab, carrying the payload via router state.
      if (handedOff) {
        localStorage.removeItem(`cabBookingDraft:${draftId}`);
      }
      navigate("/cab-booking-page", { state: bookingState });
    }
  };

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
  const collapseSearch = hasTransferSearched && !isEditingSearch;

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />

      <div className="d-flex flex-grow-1">
        <Sidebar />

        <main className="flex-grow-1 p-4 hs-page">
          {/* Outer wrapping Card removed to match /new-booking/hotel — the
              search-card-modern (below) is now the single visual container,
              same as HotelSearch. Kept every child block in place; only the
              double-card chrome was dropped. The header moves into the
              search card just below (HotelSearch pattern). */}

              {/* ── Collapsed sticky search summary strip ──
                  Shown once results are on screen. "Modify Search" re-expands
                  the full form by flipping isEditingSearch. */}
              {collapseSearch && (
                <div className="hs-summary-bar">
                  <div className="hs-summary-chips">
                    {city?.label && (
                      <span className="hs-summary-chip hs-summary-chip-main">
                        {city.label}
                      </span>
                    )}
                    {transferPickupDate && (
                      <span className="hs-summary-chip">
                        {transferPickupDate}
                        {tripType === "ROUND_TRIP" && transferDropoffDate
                          ? ` → ${transferDropoffDate}`
                          : ""}
                      </span>
                    )}
                    <span className="hs-summary-chip">
                      {transferAdults} adults
                      {transferChildren ? `, ${transferChildren} child` : ""}
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
              {/* 🔷 Search Card — matches /new-booking/hotel's search-card-modern
                  (same class, same rounded-xl + shadow + bg), so the .hs-page
                  styling in HotelSearch.css picks it up and both pages share
                  identical card chrome, field polish, and CTA look. */}
              <Card className="shadow-sm rounded-xl search-card-modern bg-white h-100">
                <Card.Body className="p-4">
                  {/* Header lifted into the card body (HotelSearch pattern) —
                      h2 + fw-semibold + regular text-muted description, so the
                      typography matches Find-Your-Perfect-Stay side-by-side. */}
                  <div className="mb-4 text-start d-flex justify-content-between align-items-start flex-wrap gap-2">
                    <div>
                      <h2 className="fw-semibold text-primary mb-1">
                        Transfers Search
                      </h2>
                      <p className="text-muted mb-0">
                        Search and compare available transfer options
                      </p>
                    </div>
                    {/* Agent logins see their available credit balance at the
                        right end of the heading row (renders nothing for other
                        roles). */}
                    <AgentCreditBalance />
                  </div>

                  <Form onSubmit={handleTransferSearchSubmit}>
                    {/* ── Simplified Transfer search criteria ───────────────
                        Layout per spec:
                          1. Agent (hidden for Agent-role logins)
                          2. City  — api/province?search=
                          3. Transfer Date
                          4. Pickup type + dependent facility
                          5. Arrival time
                          6. Drop type + dependent facility
                          7. Pax (Adults + Children + Child ages) */}
                    {/* Row 1 — Agent / City / Nationality
                        align-items-start keeps all labels on the same baseline;
                        the "Change drop off city?" checkbox under the City
                        Select just hangs below without pushing the neighbouring
                        controls down.
                        Column widths total 12 in both roles:
                          • admin/staff — Agent 4 · City 4 · Nationality 4
                          • agent login — City 6 · Nationality 6 (no agent col)
                        Transfer Date has been moved to its own row below so the
                        traveller-identity fields sit together up top and the
                        date field gets more visual weight. */}
                    <Row className="g-3 mb-3 align-items-start">
                      {!isAgentRole && (
                        <Col md={4}>
                          <Form.Label className="fw-semibold">
                            Agent <span className="text-danger">*</span>
                          </Form.Label>
                          <AgentSelect
                            agents={agents}
                            value={agent}
                            isInvalid={!!validationErrors.agent}
                            onChange={(v) => {
                              setAgent(v);
                              if (v) clearError("agent");
                            }}
                          />
                          {validationErrors.agent && (
                            <div className="text-danger small mt-1">
                              {validationErrors.agent}
                            </div>
                          )}
                          {agent && <AgentBalanceDisplay agentId={agent} />}
                        </Col>
                      )}
                      <Col md={isAgentRole ? 6 : 4}>
                        <Form.Label className="fw-semibold">
                          City <span className="text-danger">*</span>
                        </Form.Label>
                        <Select
                          options={cityOptions}
                          value={city}
                          isLoading={isCityLoading}
                          onChange={(opt) => {
                            setCity(opt);
                            // Picking a different city invalidates whatever
                            // facility was selected for pickup / dropoff —
                            // clear them so the user re-selects within the
                            // new city's lists.
                            setPickupItem(null);
                            setDropoffItem(null);
                            if (opt) clearError("city");
                          }}
                          onInputChange={(input, { action }) => {
                            if (action !== "input-change") return;
                            debouncedCityProvinceSearch(input || "");
                          }}
                          onFocus={() => {
                            if (cityOptions.length === 0) {
                              debouncedCityProvinceSearch("");
                            }
                          }}
                          filterOption={() => true}
                          placeholder="Search city (e.g. Dubai)"
                          isSearchable
                          isClearable
                          menuPortalTarget={document.body}
                          styles={{
                            ...customSelectStyles,
                            control: (base) => ({
                              ...customSelectStyles.control(base),
                              borderColor: validationErrors.city
                                ? "#dc3545"
                                : base.borderColor,
                            }),
                            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                          }}
                        />
                        {validationErrors.city && (
                          <div className="text-danger small mt-1">
                            {validationErrors.city}
                          </div>
                        )}
                        {/* Surface UAE-resident status when the selected
                            city belongs to the UAE so the operator can apply
                            the resident rate. Matched on the city's country
                            code "AE" (from master_country) so a label change
                            can't break the rule. */}
                        {/*
                        {city?.code === "AE" && (
                          <div
                            className="mt-1 small"
                            style={{ color: "#0f7a3a", lineHeight: 1.25 }}
                          >
                            For UAE resident holders, please mention the nationality as United Arab Emirates regardless of the actual nationality.
                          </div>
                        )}
                        */}
                        {/* Toggle that reveals the optional Drop City
                            selector (rendered in its own row below) so the
                            operator can search a route that ends in a
                            different city than the pickup city. */}
                        <Form.Check
                          type="checkbox"
                          id="cab-change-drop-city"
                          label="Change drop off city?"
                          className="mt-2"
                          checked={changeDropCity}
                          onChange={(e) => {
                            const next = e.target.checked;
                            setChangeDropCity(next);
                            // Either way, the current drop facility was
                            // bound to a list filtered by the *previous*
                            // effective city — clear it so the user picks
                            // afresh once the dropdown reloads.
                            setDropoffItem(null);
                            if (!next) setDropCity(null);
                          }}
                        />
                      </Col>
                      {/* Nationality — moved into Row 1 (was previously in
                          Row 4 next to Adults / Children) so the operator
                          sees the traveller-identity fields grouped with
                          Agent + City up top. Shares the same state as the
                          rest of the form. */}
                      <Col md={isAgentRole ? 6 : 4}>
                        <Form.Label className="fw-semibold">
                          Nationality
                        </Form.Label>
                        <Select
                          options={nationalityList}
                          value={nationality}
                          onChange={(opt) => {
                            setNationality(opt);
                            if (opt) clearError("nationality");
                          }}
                          onInputChange={handleCountryInputChange}
                          isLoading={isNationalityLoading}
                          placeholder="Search Nationality"
                          isSearchable
                          isClearable
                          menuPortalTarget={document.body}
                          styles={{
                            ...customSelectStyles,
                            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                          }}
                        />
                      </Col>
                    </Row>

                    {/* Row 2 — Transfer Date on its own line so it isn't
                        squeezed against Row 1's identity fields. md=4 keeps
                        it a comfortable width without stretching all the way
                        across; the extra space on the right stays clean. */}
                    <Row className="g-3 mb-3 align-items-end">
                      <Col md={4}>
                        <Form.Label className="fw-semibold">
                          Transfer Date{" "}
                          <span className="text-danger">*</span>
                        </Form.Label>
                        <Form.Control
                          style={{ height: "46px" }}
                          type="date"
                          value={transferPickupDate}
                          isInvalid={!!validationErrors.pickupDate}
                          onChange={(e) => {
                            setTransferPickupDate(e.target.value);
                            if (e.target.value) clearError("pickupDate");
                          }}
                          min={new Date().toISOString().split("T")[0]}
                        />
                        <Form.Control.Feedback type="invalid">
                          {validationErrors.pickupDate}
                        </Form.Control.Feedback>
                      </Col>
                    </Row>

                    {changeDropCity && (
                      <Row className="g-3 mb-3 align-items-end">
                        <Col md={6}>
                          <Form.Label className="fw-semibold">
                            Drop City{" "}
                            <span className="text-danger">*</span>
                          </Form.Label>
                          <Select
                            options={dropCityOptions}
                            value={dropCity}
                            isLoading={isDropCityLoading}
                            onChange={(opt) => {
                              setDropCity(opt);
                              // Picking a different drop city invalidates
                              // whatever drop facility was selected.
                              setDropoffItem(null);
                              if (opt) clearError("dropCity");
                            }}
                            onInputChange={(input, { action }) => {
                              if (action !== "input-change") return;
                              debouncedDropCityProvinceSearch(input || "");
                            }}
                            onFocus={() => {
                              if (dropCityOptions.length === 0) {
                                debouncedDropCityProvinceSearch("");
                              }
                            }}
                            filterOption={() => true}
                            placeholder="Search drop city"
                            isSearchable
                            isClearable
                            menuPortalTarget={document.body}
                            styles={{
                              ...customSelectStyles,
                              control: (base) => ({
                                ...customSelectStyles.control(base),
                                borderColor: validationErrors.dropCity
                                  ? "#dc3545"
                                  : base.borderColor,
                              }),
                              menuPortal: (base) => ({
                                ...base,
                                zIndex: 9999,
                              }),
                            }}
                          />
                          {validationErrors.dropCity && (
                            <div className="text-danger small mt-1">
                              {validationErrors.dropCity}
                            </div>
                          )}
                        </Col>
                      </Row>
                    )}

                    <Row className="g-3 mb-3 align-items-end">


                      {/* One field, every location. The old Airport /
                          Accommodation / Place category step is gone — the
                          category now comes FROM the picked option's `source`
                          (see onChange), which is all the downstream logic
                          ever needed it for. */}
                      <Col md={6}>
                        <Form.Label className="fw-semibold">
                          Pickup <span className="text-danger">*</span>
                        </Form.Label>
                        <Select
                          options={pickupLocationOptions}
                          value={pickupItem}
                          isLoading={isPickupLocationsLoading}
                          onChange={(opt) => {
                            setPickupItem(opt);
                            // Derive the category from the selection so the
                            // Departure-Time rule, booking hand-off and result
                            // labels keep working unchanged.
                            // IATA-first: i'way-native airports come back tagged
                            // source="IWAY", so falling straight to opt.source
                            // would classify DWC/DXB/etc. as generic "IWAY" and
                            // downstream code (booking-page flight-number
                            // input, TripServiceImpl.pickupIsAirport) would
                            // never treat them as airports.
                            setPickupKind(opt?.code ? "AIRPORT" : opt?.source || "");
                            if (opt) clearError("pickupItem");
                          }}
                          onInputChange={(input, { action }) => {
                            if (action !== "input-change") return;
                            debouncedPickupLocationSearch(input || "");
                          }}
                          // Every group is server-filtered by the same term,
                          // so client-side filtering would only re-filter an
                          // already-correct list and hide valid matches.
                          filterOption={() => true}
                          formatOptionLabel={formatLookupOptionLabel}
                          isSearchable
                          isClearable
                          placeholder="Search airport, hotel, place…"
                          noOptionsMessage={({ inputValue }) =>
                            inputValue ? "No matches" : "Type to search locations…"
                          }
                          menuPortalTarget={document.body}
                          styles={{
                            ...customSelectStyles,
                            control: (base) => ({
                              ...customSelectStyles.control(base),
                              borderColor: validationErrors.pickupItem
                                ? "#dc3545"
                                : base.borderColor,
                            }),
                            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                            groupHeading: (base) => ({
                              ...base,
                              fontWeight: 700,
                              color: "#212529",
                              textTransform: "uppercase",
                              fontSize: "0.75rem",
                            }),
                          }}
                        />
                        {validationErrors.pickupItem && (
                          <div className="text-danger small mt-1">
                            {validationErrors.pickupItem}
                          </div>
                        )}
                      </Col>

                      <Col md={3}>
                        <Form.Label className="fw-semibold">
                          Arrival Time{" "}
                          <span className="text-danger">*</span>
                        </Form.Label>
                        {/* Same OK/Cancel + AM/PM picker used on
                            /new-booking/hotel-24hr — value stays "HH:MM"
                            24-hour, so the arrivalTime payload is unchanged. */}
                        <TimeApplyPicker
                          value={arrivalTime}
                          isInvalid={!!validationErrors.arrivalTime}
                          onApply={(v) => {
                            setArrivalTime(v);
                            if (v) clearError("arrivalTime");
                          }}
                          placeholder="Select arrival time"
                        />
                        {validationErrors.arrivalTime && (
                          <div className="invalid-feedback d-block">
                            {validationErrors.arrivalTime}
                          </div>
                        )}
                      </Col>

                      {/* Adults moved into the pickup row's empty tail (was
                          in its own row below with Children) to remove the
                          otherwise mostly-empty Pax row and tighten vertical
                          space. Row totals 12: Pickup 3 + Facility 3 +
                          Arrival 3 + Adults 3. */}
                      <Col md={3}>
                        <Form.Label className="fw-semibold">Adults</Form.Label>
                        <Form.Select
                          style={{ height: "46px" }}
                          value={transferAdults}
                          onChange={(e) =>
                            setTransferAdults(parseInt(e.target.value) || 1)
                          }
                        >
                          {Array.from({ length: 9 }, (_, i) => i + 1).map(
                            (num) => (
                              <option key={num} value={num}>
                                {num} Adult{num > 1 ? "s" : ""}
                              </option>
                            ),
                          )}
                        </Form.Select>
                      </Col>
                    </Row>

                    <Row className="g-3 mb-3 align-items-end">
                      <Col md={6}>
                        <Form.Label className="fw-semibold">
                          Drop-off <span className="text-danger">*</span>
                        </Form.Label>
                        <Select
                          options={dropLocationOptions}
                          value={dropoffItem}
                          isLoading={isDropLocationsLoading}
                          onChange={(opt) => {
                            setDropoffItem(opt);
                            // IATA-first, same reason as the pickup branch —
                            // i'way-native airports are tagged source="IWAY"
                            // and need the code fallback to classify as AIRPORT.
                            const kind = opt?.code ? "AIRPORT" : opt?.source || "";
                            setDropoffKind(kind);
                            // Accommodation drops don't carry a departure
                            // time — clear any previously entered value so a
                            // stale time isn't sent once the field is hidden.
                            if (kind === "HOTEL") setDropDepartureTime("");
                            if (opt) clearError("dropoffItem");
                          }}
                          onInputChange={(input, { action }) => {
                            if (action !== "input-change") return;
                            debouncedDropLocationSearch(input || "");
                          }}
                          filterOption={() => true}
                          formatOptionLabel={formatLookupOptionLabel}
                          isSearchable
                          isClearable
                          placeholder="Search airport, hotel, place…"
                          noOptionsMessage={({ inputValue }) =>
                            inputValue ? "No matches" : "Type to search locations…"
                          }
                          menuPortalTarget={document.body}
                          styles={{
                            ...customSelectStyles,
                            control: (base) => ({
                              ...customSelectStyles.control(base),
                              borderColor: validationErrors.dropoffItem
                                ? "#dc3545"
                                : base.borderColor,
                            }),
                            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                            groupHeading: (base) => ({
                              ...base,
                              fontWeight: 700,
                              color: "#212529",
                              textTransform: "uppercase",
                              fontSize: "0.75rem",
                            }),
                          }}
                        />
                        {validationErrors.dropoffItem && (
                          <div className="text-danger small mt-1">
                            {validationErrors.dropoffItem}
                          </div>
                        )}
                      </Col>

                      {/* Departure Time is hidden when the drop is an
                          Accommodation — a hotel drop has no onward
                          departure time to capture. md=3 mirrors Arrival
                          Time on the pickup row above so both time fields
                          have identical widths. */}
                      {dropoffKind !== "HOTEL" && (
                        <Col md={3}>
                          <Form.Label className="fw-semibold">
                            Departure Time{" "}
                            <span className="text-danger">*</span>
                          </Form.Label>
                          <TimeApplyPicker
                            value={dropDepartureTime}
                            isInvalid={!!validationErrors.dropDepartureTime}
                            onApply={(v) => {
                              setDropDepartureTime(v);
                              if (v) clearError("dropDepartureTime");
                            }}
                            placeholder="Select departure time"
                          />
                          {validationErrors.dropDepartureTime && (
                            <div className="invalid-feedback d-block">
                              {validationErrors.dropDepartureTime}
                            </div>
                          )}
                        </Col>
                      )}

                      {/* Children moved into the drop row's tail — same
                          consolidation as Adults on the pickup row above.
                          Row totals: Drop 3 + Facility 3 + Departure 3
                          (when shown) + Children 3 = 12; when Departure is
                          hidden for HOTEL drops the row collapses to 9,
                          leaving the space where Departure would be blank. */}
                      <Col md={3}>
                        <Form.Label className="fw-semibold">
                          Children
                        </Form.Label>
                        <Form.Select
                          style={{ height: "46px" }}
                          value={transferChildren}
                          onChange={(e) =>
                            setTransferChildren(parseInt(e.target.value) || 0)
                          }
                        >
                          {Array.from({ length: 6 }, (_, i) => i).map((num) => (
                            <option key={num} value={num}>
                              {num} Child{num !== 1 ? "ren" : ""}
                            </option>
                          ))}
                        </Form.Select>
                      </Col>
                    </Row>

                    {/* Row 5 — Currency selector (currencyCode-only). The
                        chosen code is carried forward to the booking page
                        for downstream conversion; the search payload is
                        unchanged.
                        Hidden per product decision — the state remains so
                        the payload still carries `currencyCode: null` (a
                        value the booking page already tolerates) and the
                        row can be un-hidden by dropping the `d-none`. */}
                    <Row className="d-none g-3 mb-3 align-items-end">
                      <Col md={3}>
                        <Form.Label className="fw-semibold">
                          Currency
                        </Form.Label>
                        <Select
                          options={currencyOptions}
                          value={currency}
                          isLoading={isCurrencyLoading}
                          onChange={(opt) => setCurrency(opt)}
                          placeholder="Select currency"
                          isSearchable
                          isClearable
                          menuPortalTarget={document.body}
                          styles={{
                            ...customSelectStyles,
                            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                          }}
                        />
                      </Col>
                    </Row>


                    {/* IWay Transfers UI removed. i'way locations now appear
                        as an extra option group inside the Pickup / Drop
                        controls above, and whether i'way runs is decided by
                        CabApiCallerContext (agent exclusion + company
                        allow-list). The iwayEnabled/pickup/drop state,
                        debounced lookups, place-details fetch and the
                        piggybacked iway* fields in the search payload are
                        intentionally kept so the integration keeps working
                        for that path. */}

                    {/* Legacy/hidden fields kept in state but invisible.
                        The original Trip Type radios + Origin/Destination/
                        Time-type rows are no longer rendered — the simplified
                        criteria above replace them. */}
                    <div className="d-none">
                      <Form.Check
                        type="radio"
                        checked={tripType === "ONE_WAY"}
                        onChange={() => setTripType("ONE_WAY")}
                        label="One way"
                      />

                    {/* ── NEW: Origin / Destination / Passengers row ──────── */}
                    <Row className="g-3 mb-3">
                      <Col md={4}>
                        <Form.Label className="fw-semibold">Origin<span className="text-danger">*</span></Form.Label>
                        <Select
                          options={zoneLocationOptions}
                          value={origin}
                          onChange={(opt) => {
                            setOrigin(opt);
                            if (opt) clearError("origin");
                          }}
                          onInputChange={(input, { action }) => {
                            if (action !== "input-change") return;
                            clearTimeout(window.__cabOriginDebounce);
                            window.__cabOriginDebounce = setTimeout(
                              () => fetchLookup(input || ""),
                              300,
                            );
                          }}
                          filterOption={() => true}
                          formatOptionLabel={formatLookupOptionLabel}
                          isLoading={isZoneOptsLoading}
                          placeholder="Search zone / hotel / airport"
                          isSearchable
                          isClearable
                          className="modern-select-sm"
                          menuPortalTarget={document.body}
                          noOptionsMessage={({ inputValue }) =>
                            inputValue ? "No matches" : "Type to search…"
                          }
                          styles={{
                            ...customSelectStyles,
                            control: (base) => ({
                              ...customSelectStyles.control(base),
                              borderColor: validationErrors.origin
                                ? "#dc3545"
                                : base.borderColor,
                            }),
                            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                            groupHeading: (base) => ({
                              ...base,
                              fontWeight: 700,
                              color: "#212529",
                              textTransform: "uppercase",
                              fontSize: "0.75rem",
                            }),
                          }}
                        />
                        {validationErrors.origin && (
                          <div className="text-danger small mt-1">
                            {validationErrors.origin}
                          </div>
                        )}
                      </Col>

                      <Col md={4}>
                        <Form.Label className="fw-semibold">
                          Destination<span className="text-danger">*</span>
                        </Form.Label>
                        <Select
                          options={zoneLocationOptions}
                          value={
                            destination && destination.source
                              ? destination
                              : null
                          }
                          onChange={(opt) => {
                            setDestination(opt);
                            if (opt) clearError("destination");
                          }}
                          onInputChange={(input, { action }) => {
                            if (action !== "input-change") return;
                            clearTimeout(window.__cabDestDebounce);
                            window.__cabDestDebounce = setTimeout(
                              () => fetchLookup(input || ""),
                              300,
                            );
                          }}
                          filterOption={() => true}
                          formatOptionLabel={formatLookupOptionLabel}
                          isLoading={isZoneOptsLoading}
                          placeholder="Search zone / hotel / airport"
                          isSearchable
                          isClearable
                          className="modern-select-sm"
                          menuPortalTarget={document.body}
                          noOptionsMessage={({ inputValue }) =>
                            inputValue ? "No matches" : "Type to search…"
                          }
                          styles={{
                            ...customSelectStyles,
                            control: (base) => ({
                              ...customSelectStyles.control(base),
                              borderColor: validationErrors.destination
                                ? "#dc3545"
                                : base.borderColor,
                            }),
                            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                            groupHeading: (base) => ({
                              ...base,
                              fontWeight: 700,
                              color: "#212529",
                              textTransform: "uppercase",
                              fontSize: "0.75rem",
                            }),
                          }}
                        />
                        {validationErrors.destination && (
                          <div className="text-danger small mt-1">
                            {validationErrors.destination}
                          </div>
                        )}
                      </Col>

                      <Col md={4}>
                        <Form.Label className="fw-semibold">
                          Passengers<span className="text-danger">*</span>
                        </Form.Label>
                        <Row className="g-2">
                          <Col xs={6}>
                            <Form.Select
                              style={{ height: "46px" }}
                              value={transferAdults}
                              onChange={(e) =>
                                setTransferAdults(parseInt(e.target.value) || 1)
                              }
                            >
                              {Array.from({ length: 9 }, (_, i) => i + 1).map(
                                (num) => (
                                  <option key={num} value={num}>
                                    {num} Adult{num > 1 ? "s" : ""}
                                  </option>
                                ),
                              )}
                            </Form.Select>
                          </Col>
                          <Col xs={6}>
                            <Form.Select
                              style={{ height: "46px" }}
                              value={transferChildren}
                              onChange={(e) =>
                                setTransferChildren(
                                  parseInt(e.target.value) || 0,
                                )
                              }
                            >
                              {Array.from({ length: 6 }, (_, i) => i).map(
                                (num) => (
                                  <option key={num} value={num}>
                                    {num} Child{num !== 1 ? "ren" : ""}
                                  </option>
                                ),
                              )}
                            </Form.Select>
                          </Col>
                        </Row>
                      </Col>
                    </Row>

                    {/* ── NEW: Time Type + Departure / Return rows ────────── */}
                    <Row className="g-3 mb-3 align-items-end">
                      <Col md={2}>
                        <Form.Label className="fw-semibold">
                          Time Type
                        </Form.Label>
                        <Form.Select
                          style={{ height: "46px" }}
                          value={timeType}
                          onChange={(e) => setTimeType(e.target.value)}
                        >
                          <option value="">--SELECT--</option>
                          <option value="PICKUP_TIME">Pickup time</option>
                          <option value="FLIGHT_TIME">Flight time</option>
                        </Form.Select>
                      </Col>

                      <Col md={3}>
                        <Form.Label className="fw-semibold">
                          Departure<span className="text-danger">*</span>
                        </Form.Label>
                        <Form.Control
                          style={{ height: "46px" }}
                          type="date"
                          value={transferPickupDate}
                          isInvalid={!!validationErrors.pickupDate}
                          onChange={(e) => {
                            setTransferPickupDate(e.target.value);
                            if (e.target.value) clearError("pickupDate");
                          }}
                          min={new Date().toISOString().split("T")[0]}
                        />
                        <Form.Control.Feedback type="invalid">
                          {validationErrors.pickupDate}
                        </Form.Control.Feedback>
                      </Col>

                      <Col md={2}>
                        <Form.Label className="fw-semibold">
                          {timeType === "FLIGHT_TIME"
                            ? "Flight time"
                            : "Pickup time"}
                        </Form.Label>
                        <TimeApplyPicker
                          value={departureTime}
                          onApply={(v) => setDepartureTime(v)}
                          placeholder={
                            timeType === "FLIGHT_TIME"
                              ? "Select flight time"
                              : "Select pickup time"
                          }
                        />
                      </Col>

                      <Col md={3}>
                        <Form.Label className="fw-semibold">Return</Form.Label>
                        <Form.Control
                          style={{ height: "46px" }}
                          type="date"
                          value={transferDropoffDate}
                          disabled={tripType === "ONE_WAY"}
                          isInvalid={!!validationErrors.dropoffDate}
                          onChange={(e) => {
                            setTransferDropoffDate(e.target.value);
                            clearError("dropoffDate");
                          }}
                          min={transferPickupDate || undefined}
                        />
                        <Form.Control.Feedback type="invalid">
                          {validationErrors.dropoffDate}
                        </Form.Control.Feedback>
                      </Col>

                      <Col md={2}>
                        <Form.Label className="fw-semibold">
                          {timeType === "FLIGHT_TIME"
                            ? "Flight time"
                            : "Pickup time"}
                        </Form.Label>
                        <TimeApplyPicker
                          value={returnTime}
                          disabled={tripType === "ONE_WAY"}
                          onApply={(v) => setReturnTime(v)}
                          placeholder={
                            timeType === "FLIGHT_TIME"
                              ? "Select flight time"
                              : "Select pickup time"
                          }
                        />
                      </Col>
                    </Row>

                    {/* Nationality + Agent — kept on the same row so the
                        operator can pick the traveller's nationality and the
                        booking agent side-by-side. Both fields are required
                        (agent drives markup + balance lookup downstream). */}
                    <Row className="g-3 mb-3">
                      <Col md={4}>
                        <Form.Label className="fw-semibold">
                          Nationality<span className="text-danger">*</span>
                        </Form.Label>
                        {/* react-select can't take isInvalid directly; we apply a
                        red border via the styles override below, and render a
                        manual error message under the control. */}
                        <Select
                          options={nationalityList}
                          value={nationality}
                          onChange={(opt) => {
                            setNationality(opt);
                            if (opt) clearError("nationality");
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
                              borderColor: validationErrors.nationality
                                ? "#dc3545"
                                : base.borderColor,
                            }),
                            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                          }}
                        />
                        {validationErrors.nationality && (
                          <div className="text-danger small mt-1">
                            {validationErrors.nationality}
                          </div>
                        )}
                      </Col>
                      {!isAgentRole && (
                      <Col md={4}>
                        <Form.Label className="fw-semibold">
                          Agent <span className="text-danger">*</span>
                        </Form.Label>
                        <AgentSelect
                          agents={agents}
                          value={agent}
                          isInvalid={!!validationErrors.agent}
                          onChange={(v) => {
                            setAgent(v);
                            if (v) clearError("agent");
                          }}
                        />
                        {validationErrors.agent && (
                          <div className="text-danger small mt-1">
                            {validationErrors.agent}
                          </div>
                        )}
                        {agent && <AgentBalanceDisplay agentId={agent} />}
                      </Col>
                      )}
                    </Row>

                    {/* ── Legacy form rows hidden — values still tracked in state for
                    backward compat with the existing search payload. */}
                    <div className="d-none">
                      <Row className="g-3 mb-3">
                        <Col md={4}>
                          <Form.Label className="fw-semibold">
                            Destination
                          </Form.Label>
                          <Select
                            options={destinationOptions}
                            value={destination}
                            onChange={(opt) => {
                              setDestination(opt);
                              if (opt) clearError("destination");
                            }}
                            placeholder="Search destinations..."
                            isSearchable
                            isClearable
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
                              control: (base) => ({
                                ...customSelectStyles.control(base),
                                borderColor: validationErrors.destination
                                  ? "#dc3545"
                                  : base.borderColor,
                              }),
                              menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                            }}
                          />
                          {validationErrors.destination && (
                            <div className="text-danger small mt-1">
                              {validationErrors.destination}
                            </div>
                          )}
                        </Col>
                        <Col md={4}>
                          <Form.Label className="fw-semibold">
                            Pickup Date
                          </Form.Label>
                          <Form.Control
                            style={{ height: "46px" }}
                            type="date"
                            value={transferPickupDate}
                            isInvalid={!!validationErrors.pickupDate}
                            onChange={(e) => {
                              setTransferPickupDate(e.target.value);
                              if (e.target.value) clearError("pickupDate");
                            }}
                            min={new Date().toISOString().split("T")[0]}
                          />
                          <Form.Control.Feedback type="invalid">
                            {validationErrors.pickupDate}
                          </Form.Control.Feedback>
                        </Col>
                      </Row>

                      {/* Row 2 */}
                      <Row className="g-3 align-items-end">
                        <Col md={4}>
                          <Form.Label className="fw-semibold">
                            Dropoff Date
                          </Form.Label>
                          <Form.Control
                            style={{ height: "46px" }}
                            type="date"
                            value={transferDropoffDate}
                            isInvalid={!!validationErrors.dropoffDate}
                            onChange={(e) => {
                              setTransferDropoffDate(e.target.value);
                              clearError("dropoffDate");
                            }}
                            min={transferPickupDate || undefined}
                          />
                          <Form.Control.Feedback type="invalid">
                            {validationErrors.dropoffDate}
                          </Form.Control.Feedback>
                        </Col>

                        <Col md={4}>
                          <Form.Label className="fw-semibold">
                            Adults
                          </Form.Label>
                          <Form.Select
                            style={{ height: "46px" }}
                            value={transferAdults}
                            onChange={(e) =>
                              setTransferAdults(parseInt(e.target.value) || 1)
                            }
                          >
                            {Array.from({ length: 9 }, (_, i) => i + 1).map(
                              (num) => (
                                <option key={num} value={num}>
                                  {num}
                                </option>
                              ),
                            )}
                          </Form.Select>
                        </Col>

                        <Col md={4}>
                          <Form.Label className="fw-semibold">
                            Children
                          </Form.Label>
                          <Form.Select
                            style={{ height: "46px" }}
                            value={transferChildren}
                            onChange={(e) =>
                              setTransferChildren(parseInt(e.target.value) || 0)
                            }
                          >
                            {Array.from({ length: 6 }, (_, i) => i).map(
                              (num) => (
                                <option key={num} value={num}>
                                  {num}
                                </option>
                              ),
                            )}
                          </Form.Select>
                        </Col>

                        {/* <Col md={4} className="d-flex justify-content-md-end mt-3 mt-md-0">
                    <Button
                      variant="warning"
                      className="px-5 py-2 fw-bold w-100 w-md-auto"
                      type="submit"
                      disabled={transferLoading}
                    >
                      {transferLoading ? (
                        <>
                          <Spinner animation="border" size="sm" className="me-2" />
                          Searching...
                        </>
                      ) : (
                        <>
                          <FaSearch className="me-2" /> Search Cabs
                        </>
                      )}
                    </Button>
                  </Col> */}
                      </Row>

                      {/* ── NEW: Pickup details row ───────────────────────────────
                    Type drives both the name input shape (dropdown vs. text)
                    and the visibility / requiredness of the time input. */}
                      <Row className="g-3 align-items-end mt-1">
                        <Col md={4}>
                          <Form.Label className="fw-semibold">
                            Pickup Type
                          </Form.Label>
                          <Form.Select
                            style={{ height: "46px" }}
                            value={pickupType}
                            onChange={(e) => {
                              setPickupType(e.target.value);
                              // Reset name/time when the type changes — what was
                              // valid for AIRPORT (free text) won't be valid for
                              // HOTEL (must come from the dropdown). Also clear
                              // related field errors so they don't linger.
                              setPickupName("");
                              clearError("pickupName");
                              if (e.target.value !== "AIRPORT") {
                                setPickupTime("");
                                clearError("pickupTime");
                              }
                            }}
                          >
                            <option value="">— Select —</option>
                            <option value="HOTEL">Hotel</option>
                            <option value="AIRPORT">Airport</option>
                          </Form.Select>
                        </Col>

                        <Col md={4}>
                          <Form.Label className="fw-semibold">
                            Pickup{" "}
                            {pickupType === "HOTEL"
                              ? "Hotel"
                              : pickupType === "AIRPORT"
                                ? "Airport"
                                : "Name"}
                            {pickupType ? " *" : ""}
                          </Form.Label>
                          {pickupType === "HOTEL" ? (
                            // Dropdown sourced from /api/hotels/lookup filtered by
                            // destination country + city. Sends the hotel NAME to
                            // the backend search, matching how cab_location.pickup
                            // stores plain text.
                            <Select
                              options={hotelOptions}
                              value={
                                hotelOptions.find(
                                  (o) => o.value === pickupName,
                                ) || null
                              }
                              onChange={(opt) => {
                                setPickupName(opt ? opt.value : "");
                                if (opt) clearError("pickupName");
                              }}
                              isLoading={isHotelLoading}
                              isClearable
                              placeholder={
                                isHotelLoading
                                  ? "Loading hotels..."
                                  : hotelOptions.length === 0
                                    ? destination
                                      ? "No hotels for this city"
                                      : "No hotels found"
                                    : destination
                                      ? "Select a hotel"
                                      : "Select a hotel (choose destination to filter)"
                              }
                              noOptionsMessage={() =>
                                isHotelLoading
                                  ? "Loading..."
                                  : "No hotels found"
                              }
                              menuPortalTarget={document.body}
                              styles={{
                                ...customSelectStyles,
                                control: (base) => ({
                                  ...customSelectStyles.control(base),
                                  borderColor: validationErrors.pickupName
                                    ? "#dc3545"
                                    : base.borderColor,
                                }),
                                menuPortal: (base) => ({
                                  ...base,
                                  zIndex: 9999,
                                }),
                              }}
                            />
                          ) : (
                            // Free text input for AIRPORT and the empty default.
                            <Form.Control
                              style={{ height: "46px" }}
                              type="text"
                              placeholder={
                                pickupType === "AIRPORT"
                                  ? "Airport name"
                                  : "Pick a type first"
                              }
                              value={pickupName}
                              isInvalid={!!validationErrors.pickupName}
                              disabled={!pickupType}
                              onChange={(e) => {
                                setPickupName(e.target.value);
                                if (e.target.value.trim())
                                  clearError("pickupName");
                              }}
                            />
                          )}
                          {validationErrors.pickupName && (
                            <div className="text-danger small mt-1">
                              {validationErrors.pickupName}
                            </div>
                          )}
                        </Col>

                        <Col md={4}>
                          <Form.Label className="fw-semibold">
                            Pickup Time{" "}
                            {pickupType === "AIRPORT" ? "*" : "(optional)"}
                          </Form.Label>
                          {/* Only meaningful for airport pickups; disabled
                              otherwise so the form stays clean. */}
                          <TimeApplyPicker
                            disabled={pickupType !== "AIRPORT"}
                            value={pickupTime}
                            isInvalid={!!validationErrors.pickupTime}
                            onApply={(v) => {
                              setPickupTime(v);
                              if (v) clearError("pickupTime");
                            }}
                            placeholder="Select pickup time"
                          />
                          {validationErrors.pickupTime && (
                            <div className="invalid-feedback d-block">
                              {validationErrors.pickupTime}
                            </div>
                          )}
                        </Col>
                      </Row>

                      {/* ── NEW: Dropoff details row ─────────────────────────────
                    Same pattern as pickup; time is always optional. */}
                      <Row className="g-3 align-items-end mt-1">
                        <Col md={4}>
                          <Form.Label className="fw-semibold">
                            Dropoff Type
                          </Form.Label>
                          <Form.Select
                            style={{ height: "46px" }}
                            value={dropoffType}
                            onChange={(e) => {
                              setDropoffType(e.target.value);
                              setDropoffName("");
                              clearError("dropoffName");
                              if (e.target.value !== "AIRPORT")
                                setDropoffTime("");
                            }}
                          >
                            <option value="">— Select —</option>
                            <option value="HOTEL">Hotel</option>
                            <option value="AIRPORT">Airport</option>
                          </Form.Select>
                        </Col>

                        <Col md={4}>
                          <Form.Label className="fw-semibold">
                            Dropoff{" "}
                            {dropoffType === "HOTEL"
                              ? "Hotel"
                              : dropoffType === "AIRPORT"
                                ? "Airport"
                                : "Name"}
                            {dropoffType ? " *" : ""}
                          </Form.Label>
                          {dropoffType === "HOTEL" ? (
                            <Select
                              options={hotelOptions}
                              value={
                                hotelOptions.find(
                                  (o) => o.value === dropoffName,
                                ) || null
                              }
                              onChange={(opt) => {
                                setDropoffName(opt ? opt.value : "");
                                if (opt) clearError("dropoffName");
                              }}
                              isLoading={isHotelLoading}
                              isClearable
                              placeholder={
                                isHotelLoading
                                  ? "Loading hotels..."
                                  : hotelOptions.length === 0
                                    ? destination
                                      ? "No hotels for this city"
                                      : "No hotels found"
                                    : destination
                                      ? "Select a hotel"
                                      : "Select a hotel (choose destination to filter)"
                              }
                              noOptionsMessage={() =>
                                isHotelLoading
                                  ? "Loading..."
                                  : "No hotels found"
                              }
                              menuPortalTarget={document.body}
                              styles={{
                                ...customSelectStyles,
                                control: (base) => ({
                                  ...customSelectStyles.control(base),
                                  borderColor: validationErrors.dropoffName
                                    ? "#dc3545"
                                    : base.borderColor,
                                }),
                                menuPortal: (base) => ({
                                  ...base,
                                  zIndex: 9999,
                                }),
                              }}
                            />
                          ) : (
                            <Form.Control
                              style={{ height: "46px" }}
                              type="text"
                              placeholder={
                                dropoffType === "AIRPORT"
                                  ? "Airport name"
                                  : "Pick a type first"
                              }
                              value={dropoffName}
                              isInvalid={!!validationErrors.dropoffName}
                              disabled={!dropoffType}
                              onChange={(e) => {
                                setDropoffName(e.target.value);
                                if (e.target.value.trim())
                                  clearError("dropoffName");
                              }}
                            />
                          )}
                          {validationErrors.dropoffName && (
                            <div className="text-danger small mt-1">
                              {validationErrors.dropoffName}
                            </div>
                          )}
                        </Col>

                        <Col md={4}>
                          <Form.Label className="fw-semibold">
                            Dropoff Time (optional)
                          </Form.Label>
                          {/* Per spec, drop-off time is optional even for
                              airport drops. Disabled until a type is chosen
                              for clarity. */}
                          <TimeApplyPicker
                            disabled={!dropoffType}
                            value={dropoffTime}
                            onApply={(v) => setDropoffTime(v)}
                            placeholder="Select dropoff time"
                          />
                        </Col>
                      </Row>
                    </div>
                    </div>

                    {/* Child Ages — moved above the Search button so it
                        follows the natural top-to-bottom form order (inputs
                        then CTA). Only rendered when there is at least one
                        child to enter an age for. */}
                    {transferChildren > 0 && (
                      <Row className="g-2 mb-3">
                        <Col md={12}>
                          <Form.Label className="mb-2 fw-semibold">
                            Child Ages
                          </Form.Label>
                          <div className="d-flex flex-wrap gap-2">
                            {transferChildAges.map((age, index) => (
                              <Form.Control
                                key={index}
                                type="number"
                                min="0"
                                max="17"
                                placeholder={`Child ${index + 1}`}
                                value={age}
                                style={{ width: "100px", height: "46px" }}
                                onChange={(e) =>
                                  handleTransferChildAgeChange(
                                    index,
                                    e.target.value,
                                  )
                                }
                              />
                            ))}
                          </div>
                        </Col>
                      </Row>
                    )}

                    <Row className="justify-content-center">
                      <Col
                        md={4}
                        className="d-flex justify-content-center mt-3"
                      >
                        {/* Match the HotelSearch CTA look (btn-search-modern)
                            so the /new-booking/* search pages share the same
                            button shape, size and gradient. */}
                        <Button
                          type="submit"
                          className="btn-search-modern"
                          disabled={transferLoading}
                          size="lg"
                        >
                          {transferLoading ? (
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
                              <FaSearch className="me-2" /> Search Cabs
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
                {!hasTransferSearched && (
                  <AdvertisementCarousel
                    cityId={city?.value}
                    cityName={city?.label}
                  />
                )}
              </div>
              )}

              {/* Loading State */}
              {transferLoading && (
                <Card className="shadow-sm rounded-xl mb-4 mt-4 border-0">
                  <Card.Body className="text-center py-5">
                    <Spinner
                      animation="border"
                      variant="primary"
                      style={{ width: "3rem", height: "3rem" }}
                    />
                    <h5 className="text-primary fw-bold mt-3 mb-1">
                      Searching Transfers...
                    </h5>
                    <p className="text-muted small mb-0">
                      {transferPickupDate
                        ? `Searching for transfer from ${transferPickupDate}${
                            tripType === "ROUND_TRIP" && transferDropoffDate
                              ? ` to ${transferDropoffDate}`
                              : ""
                          }`
                        : "Finding available transfer options for you"}
                    </p>
                    <div className="mt-3 mx-auto" style={{ maxWidth: 480 }}>
                      <ProgressBar animated now={100} variant="primary" />
                    </div>
                  </Card.Body>
                </Card>
              )}

              {/* Empty State */}
              {!hasTransferSearched && !transferLoading && (
                <div className="text-center text-muted mt-5 py-5 bg-white rounded-4 shadow-sm border-0">
                  <FaCar className="display-4 text-secondary mb-3 opacity-50" />
                  <h5>Ready to book a transfer?</h5>
                  <p>Run a search to view available cabs and options.</p>
                </div>
              )}

              {/* Results Display */}
              {hasTransferSearched &&
                !transferLoading &&
                transferResults.length > 0 &&
                (() => {
                  // ── Flatten cabs into (cab, detail) rows so each option
                  //   shows as its own card (matches the reference UI).
                  //   Then apply name + supplier filters and sort by the
                  //   currently selected key.
                  const rows = [];
                  transferResults.forEach((cab) => {
                    const details = Array.isArray(cab.searchCabDetailsDTO)
                      ? cab.searchCabDetailsDTO.filter((d) => {
                          const t = String(d.types || "").toUpperCase();
                          if (transferType === "Shared") return t === "SIC";
                          if (transferType === "Private") return t === "PRIVATE";
                          return t === "SIC" || t === "PRIVATE";
                        })
                      : [];
                    details.forEach((d) => rows.push({ cab, detail: d }));
                  });

                  const supplierNames = Array.from(
                    new Set(
                      transferResults
                        .map((c) => c.cabProviderName)
                        .filter(Boolean),
                    ),
                  );

                  const trimmedName = nameFilter.trim().toLowerCase();
                  const filtered = rows.filter(({ cab }) => {
                    if (
                      trimmedName &&
                      !String(cab.cabname || "")
                        .toLowerCase()
                        .includes(trimmedName)
                    ) {
                      return false;
                    }
                    if (
                      selectedSuppliers.length > 0 &&
                      !selectedSuppliers.includes(cab.cabProviderName)
                    ) {
                      return false;
                    }
                    return true;
                  });

                  filtered.sort((a, b) => {
                    if (sortBy === "name") {
                      return String(a.cab.cabname || "").localeCompare(
                        String(b.cab.cabname || ""),
                      );
                    }
                    const pa = priceDetail(a.detail).total || 0;
                    const pb = priceDetail(b.detail).total || 0;
                    return pa - pb;
                  });

                  const totalPages = Math.max(
                    1,
                    Math.ceil(filtered.length / pageSize),
                  );
                  const safePage = Math.min(currentPage, totalPages);
                  const pageStart = (safePage - 1) * pageSize;
                  const pageRows = filtered.slice(
                    pageStart,
                    pageStart + pageSize,
                  );

                  const renderPagination = () => (
                    <div className="d-flex justify-content-end align-items-center gap-2 small">
                      <Button
                        size="sm"
                        variant="link"
                        className="text-decoration-none p-1"
                        disabled={safePage === 1}
                        onClick={() => setCurrentPage(1)}
                      >
                        First
                      </Button>
                      <Button
                        size="sm"
                        variant="link"
                        className="text-decoration-none p-1"
                        disabled={safePage === 1}
                        onClick={() => setCurrentPage(safePage - 1)}
                      >
                        Previous
                      </Button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                        (p) => (
                          <Button
                            key={p}
                            size="sm"
                            variant={p === safePage ? "primary" : "outline-secondary"}
                            className="px-2 py-0"
                            onClick={() => setCurrentPage(p)}
                          >
                            {p}
                          </Button>
                        ),
                      )}
                      <Button
                        size="sm"
                        variant="link"
                        className="text-decoration-none p-1"
                        disabled={safePage === totalPages}
                        onClick={() => setCurrentPage(safePage + 1)}
                      >
                        Next
                      </Button>
                      <Button
                        size="sm"
                        variant="link"
                        className="text-decoration-none p-1"
                        disabled={safePage === totalPages}
                        onClick={() => setCurrentPage(totalPages)}
                      >
                        Last
                      </Button>
                    </div>
                  );

                  return (
                    <div className="mt-4">
                      <Row className="g-3">
                        {/* ── LEFT: Filter panel ─────────────────────── */}
                        <Col lg={3} md={4}>
                          <Card className="border-0 shadow-sm rounded-3 mb-3">
                            <Card.Header className="bg-white border-bottom fw-semibold d-flex justify-content-between align-items-center">
                              <span className="text-primary">
                                Search by Transfer Name
                              </span>
                              <span className="text-muted small">▾</span>
                            </Card.Header>
                            <Card.Body className="p-3">
                              <div className="d-flex gap-2">
                                <Form.Control
                                  type="text"
                                  size="sm"
                                  placeholder="Search"
                                  value={pendingNameFilter}
                                  onChange={(e) =>
                                    setPendingNameFilter(e.target.value)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      setNameFilter(pendingNameFilter);
                                      setCurrentPage(1);
                                    }
                                  }}
                                />
                                <Button
                                  size="sm"
                                  variant="primary"
                                  className="px-3"
                                  onClick={() => {
                                    setNameFilter(pendingNameFilter);
                                    setCurrentPage(1);
                                  }}
                                >
                                  GO
                                </Button>
                              </div>
                            </Card.Body>
                          </Card>

                          <Card className="border-0 shadow-sm rounded-3 mb-3">
                            <Card.Header className="bg-white border-bottom fw-semibold d-flex justify-content-between align-items-center">
                              <span className="text-primary">Suppliers</span>
                              <span className="text-muted small">▾</span>
                            </Card.Header>
                            <Card.Body className="p-3">
                              {supplierNames.length === 0 ? (
                                <div className="text-muted small">
                                  No suppliers in results.
                                </div>
                              ) : (
                                supplierNames.map((s) => (
                                  <Form.Check
                                    key={s}
                                    type="checkbox"
                                    id={`supplier-${s}`}
                                    label={s}
                                    className="small"
                                    checked={pendingSuppliers.includes(s)}
                                    onChange={(e) => {
                                      setPendingSuppliers((prev) =>
                                        e.target.checked
                                          ? [...prev, s]
                                          : prev.filter((x) => x !== s),
                                      );
                                    }}
                                  />
                                ))
                              )}
                            </Card.Body>
                          </Card>

                          <Card className="border-0 shadow-sm rounded-3 mb-3">
                            <Card.Header className="bg-white border-bottom fw-semibold d-flex justify-content-between align-items-center">
                              <span className="text-primary">Transfer Type</span>
                              <span className="text-muted small">▾</span>
                            </Card.Header>
                            <Card.Body className="p-3">
                              <Form.Check
                                type="radio"
                                id="filter-all"
                                name="filterTransferType"
                                label="All"
                                className="small"
                                checked={transferType === "All"}
                                onChange={() => {
                                  setTransferType("All");
                                  setCurrentPage(1);
                                }}
                              />
                              <Form.Check
                                type="radio"
                                id="filter-shared"
                                name="filterTransferType"
                                label="Shared (SIC)"
                                className="small"
                                checked={transferType === "Shared"}
                                onChange={() => {
                                  setTransferType("Shared");
                                  setCurrentPage(1);
                                }}
                              />
                              <Form.Check
                                type="radio"
                                id="filter-private"
                                name="filterTransferType"
                                label="Private"
                                className="small"
                                checked={transferType === "Private"}
                                onChange={() => {
                                  setTransferType("Private");
                                  setCurrentPage(1);
                                }}
                              />
                            </Card.Body>
                          </Card>

                          <Button
                            variant="primary"
                            className="w-100 fw-bold"
                            onClick={() => {
                              setNameFilter(pendingNameFilter);
                              setSelectedSuppliers(pendingSuppliers);
                              setCurrentPage(1);
                            }}
                          >
                            APPLY FILTERS
                          </Button>
                        </Col>

                        {/* ── RIGHT: Results column ──────────────────── */}
                        <Col lg={9} md={8}>
                          {/* Sort bar */}
                          <Card className="border-0 shadow-sm rounded-3 mb-3">
                            <Card.Body className="py-2 px-3 d-flex flex-wrap align-items-center gap-2">
                              <span className="text-muted small me-1">
                                Sort By:
                              </span>
                              <Button
                                size="sm"
                                variant={
                                  sortBy === "price" ? "primary" : "light"
                                }
                                className="px-3"
                                onClick={() => setSortBy("price")}
                              >
                                ↕ Price
                              </Button>
                              <Button
                                size="sm"
                                variant={
                                  sortBy === "name" ? "primary" : "light"
                                }
                                className="px-3"
                                onClick={() => setSortBy("name")}
                              >
                                ↕ Transfer Name
                              </Button>
                            </Card.Body>
                          </Card>

                          {/* Page-of-N + count */}
                          <div className="d-flex justify-content-between align-items-center mb-2 small text-muted">
                            <div>
                              Page {safePage} of {totalPages} ({filtered.length}{" "}
                              records)
                            </div>
                            {totalPages > 1 && renderPagination()}
                          </div>

                          {(transferType === "Shared" ||
                            transferType === "All") && (
                            <div className="text-muted small mb-2">
                              Pricing for {sicPayingPax} paying pax (adults +
                              children aged &gt; 3) for shared transfers.
                            </div>
                          )}

                          {filtered.length === 0 ? (
                            <div className="text-center text-muted py-5 bg-white rounded-3 border">
                              No{" "}
                              {transferType === "Shared"
                                ? "shared (SIC)"
                                : transferType === "Private"
                                  ? "private"
                                  : ""}{" "}
                              transfers match your filters.
                            </div>
                          ) : (
                            <Row className="g-3">
                              {pageRows.map(({ cab, detail }, idx) => {
                                const {
                                  total: totalRate,
                                  perUnit,
                                  label,
                                } = priceDetail(detail);
                                return (
                                  <Col xs={12} key={`${cab.cabid}-${idx}`}>
                                    <Card className="border-0 shadow-sm rounded-3 overflow-hidden">
                                      <Card.Header className="bg-light py-2 px-3 fw-semibold text-dark d-flex justify-content-between align-items-center">
                                        <span>
                                          {cab.cabname || "Transfer Vehicle"}
                                        </span>
                                        {/* IWay-source badge — makes the
                                            external supplier obvious at a
                                            glance without disturbing rows
                                            that come from the in-house
                                            cabProvider search. */}
                                        {(cab.channelType === "iway" ||
                                          cab.source === "IWAY") && (
                                          <span
                                            className="badge"
                                            style={{
                                              backgroundColor: "#e8f4ff",
                                              color: "#0b6bcb",
                                              border: "1px solid #cfe4fb",
                                              fontWeight: 600,
                                              fontSize: "0.7rem",
                                              padding: "3px 8px",
                                            }}
                                            title="Offer from the IWay (i'way) external supplier"
                                          >
                                            IWay
                                          </span>
                                        )}
                                      </Card.Header>
                                      <Card.Body className="p-3">
                                        <Row className="align-items-center g-3">
                                          {/* Image */}
                                          <Col xs={12} md={3}>
                                            <div
                                              style={{
                                                width: "100%",
                                                height: "120px",
                                                overflow: "hidden",
                                                borderRadius: "8px",
                                              }}
                                            >
                                              <LazyImage
                                                src={cab.cabpic}
                                                alt={cab.cabname}
                                              />
                                            </div>
                                          </Col>

                                          {/* Details */}
                                          <Col xs={12} md={6}>
                                            {(() => {
                                              const rowType = String(detail.types || "").toUpperCase();
                                              const isPrivate = rowType === "PRIVATE";
                                              return (
                                                <div className="small mb-1">
                                                  <span className="text-muted">
                                                    Transfer Type:{" "}
                                                  </span>
                                                  <span
                                                    className={`fw-medium ${
                                                      isPrivate
                                                        ? "text-success"
                                                        : "text-primary"
                                                    }`}
                                                  >
                                                    {isPrivate
                                                      ? "Private Transfer"
                                                      : "Shared (SIC)"}
                                                  </span>
                                                </div>
                                              );
                                            })()}
                                            <div className="small mb-1">
                                              <span className="text-muted">
                                                Vehicle:{" "}
                                              </span>
                                              <span className="text-dark">
                                                {cab.cabname || "—"}
                                              </span>
                                            </div>
                                            <div className="small mb-1 d-flex flex-wrap gap-3">
                                              <span>
                                                <span className="text-muted">
                                                  Max Pax Per Vehicle :{" "}
                                                </span>
                                                <span className="text-dark">
                                                  {cab.capacityMax ??
                                                    cab.noOfCabs ??
                                                    "—"}
                                                </span>
                                              </span>
                                              <span>
                                                <span className="text-muted">
                                                  Max Luggage Per Vehicle :{" "}
                                                </span>
                                                <span className="text-dark">
                                                  {cab.capacityMax ?? "—"}
                                                </span>
                                              </span>
                                            </div>
                                            {(detail.location ||
                                              detail.dropOff) && (
                                              <div className="small text-muted mb-1">
                                                {detail.location || "N/A"} →{" "}
                                                {detail.dropOff || "N/A"}
                                              </div>
                                            )}
                                            {cab.cabProviderName && (
                                              <div className="small text-muted">
                                                by {cab.cabProviderName}
                                              </div>
                                            )}
                                          </Col>

                                          {/* Price + action */}
                                          <Col
                                            xs={12}
                                            md={3}
                                            className="text-md-end"
                                          >
                                            <div className="text-success small fw-semibold mb-1">
                                              Available
                                            </div>
                                            <div className="fw-bold fs-5 mb-1">
                                              AED{" "}
                                              {Number(
                                                totalRate || 0,
                                              ).toLocaleString(undefined, {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                              })}
                                            </div>
                                            {label && (
                                              <div className="small text-muted mb-2">
                                                {perUnit > 0
                                                  ? `AED ${perUnit.toLocaleString()} ${label}`
                                                  : label}
                                              </div>
                                            )}
                                            <div className="d-flex gap-2 justify-content-md-end">
                                              <Button
                                                variant="outline-secondary"
                                                className="px-3 fw-semibold"
                                                onClick={() =>
                                                  setViewModal({ cab, detail })
                                                }
                                              >
                                                View
                                              </Button>
                                              <Button
                                                variant="primary"
                                                className="px-4 fw-semibold"
                                                onClick={() =>
                                                  handleBookNow(cab, detail)
                                                }
                                              >
                                                Select
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

                          {totalPages > 1 && (
                            <div className="d-flex justify-content-end mt-3">
                              {renderPagination()}
                            </div>
                          )}
                        </Col>
                      </Row>
                    </div>
                  );
                })()}

              {/* No Results */}
              {hasTransferSearched &&
                !transferLoading &&
                transferResults.length === 0 && (
                  <div className="text-center text-muted mt-5 py-5 bg-white rounded-4 shadow-sm border-0">
                    <FaCar className="display-4 text-warning mb-3 opacity-75" />
                    <h5 className="text-dark">No transfers found</h5>
                    <p>
                      Try selecting different dates or destinations for your
                      search.
                    </p>
                  </div>
                )}
        </main>
      </div>

      {/* ── Transfer details view modal ────────────────────────────────
          Triggered by the "View" button on each result-card row. Redesigned
          into a rich, package-modal-style card (hero + highlight strip +
          feature chips + journey route + transfer summary + stat tiles +
          price + disclaimer). All fields come from the (cab, detail) row and
          the search-form state; styling lives in CabTransferModal.css. */}
      <Modal
        show={!!viewModal}
        onHide={() => setViewModal(null)}
        size="lg"
        centered
        scrollable
        className="ctm-modal"
      >
        {viewModal && (() => {
          const { cab, detail } = viewModal;
          const labelForKind = (k) =>
            k === "AIRPORT"
              ? "Airport"
              : k === "HOTEL"
                ? "Accommodation"
                : k === "PLACE"
                  ? "Place"
                  : "";
          const isPrivate =
            String(detail.types || "").toUpperCase() === "PRIVATE";
          const transferTypeLabel = isPrivate
            ? "Private Transfer"
            : "Shared Transfer";
          const transferTypeShort = isPrivate ? "Private" : "Shared (SIC)";
          const totalChildren = Number(transferChildren) || 0;
          const totalAdults = Number(transferAdults) || 0;
          const passengerLabel = `${totalAdults} Adult${
            totalAdults !== 1 ? "s" : ""
          }${
            totalChildren > 0
              ? `, ${totalChildren} Child${totalChildren !== 1 ? "ren" : ""}`
              : ""
          }`;
          const transferDateLabel = transferPickupDate
            ? new Date(transferPickupDate).toLocaleDateString(undefined, {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })
            : "—";
          const fromLoc =
            cab.originLocationName || detail.pickup || detail.location || "—";
          const toLoc = cab.destinationLocationName || detail.dropOff || "—";
          const fromKind = pickupKind ? labelForKind(pickupKind) : "";
          const toKind = dropoffKind ? labelForKind(dropoffKind) : "";
          const durationLabel = detail.hourDetails || "NA";
          const waitingTime = detail.driverWaitingTime || "—";
          const distanceLabel =
            detail.distance != null
              ? `${Number(detail.distance).toFixed(3)} Km`
              : "—";
          const maxPax = cab.vehicleMaxCapacity ?? cab.capacityMax ?? "—";
          const maxLuggage =
            cab.vehicleMaxLuggage ?? cab.capacityMax ?? "—";
          const supplier = cab.cabProviderName || "";
          const { total: priceTotal, perUnit, label: priceLabel } =
            priceDetail(detail);
          const fmtAed = (n) =>
            Number(n || 0).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
          return (
            <>
              <Modal.Header closeButton className="ctm-header">
                <Modal.Title className="ctm-title">
                  <FaCar className="me-2" /> Transfer Details
                </Modal.Title>
              </Modal.Header>
              <Modal.Body className="ctm-body">
                {/* ─── Hero ──────────────────────────────────────── */}
                <div className="ctm-hero">
                  <div className="ctm-hero-fallback">
                    <FaCar />
                  </div>
                  {cab.cabpic && (
                    <img
                      src={cab.cabpic}
                      alt={cab.cabname || "Vehicle"}
                      className="ctm-hero-img"
                      onError={(e) => {
                        e.target.style.display = "none";
                      }}
                    />
                  )}
                  <div className="ctm-hero-overlay">
                    <div className="ctm-hero-text">
                      <span className="ctm-hero-type">
                        {transferTypeShort}
                      </span>
                      <h4 className="ctm-hero-name">
                        {cab.cabname || "Vehicle"} <small>or similar</small>
                      </h4>
                      <div className="ctm-hero-meta">
                        <span>
                          <FaRoute className="me-1" size={12} />
                          {fromLoc} → {toLoc}
                        </span>
                        <span>
                          <FaClock className="me-1" size={12} />
                          {durationLabel}
                        </span>
                        {supplier && (
                          <span>
                            <FaUserTie className="me-1" size={12} />
                            by {supplier}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="ctm-content">
                  {/* ─── Highlight strip ─────────────────────────── */}
                  <div className="ctm-highlight-strip">
                    <div className="ctm-highlight-item">
                      <FaMoneyBillWave className="ctm-highlight-icon" />
                      <div>
                        <div className="ctm-highlight-label">Total Price</div>
                        <div className="ctm-highlight-value ctm-price">
                          AED {fmtAed(priceTotal)}
                        </div>
                      </div>
                    </div>
                    <div className="ctm-highlight-item">
                      <FaCar className="ctm-highlight-icon" />
                      <div>
                        <div className="ctm-highlight-label">Transfer</div>
                        <div className="ctm-highlight-value">
                          {transferTypeShort}
                        </div>
                      </div>
                    </div>
                    <div className="ctm-highlight-item">
                      <FaClock className="ctm-highlight-icon" />
                      <div>
                        <div className="ctm-highlight-label">Duration</div>
                        <div className="ctm-highlight-value">
                          {durationLabel}
                        </div>
                      </div>
                    </div>
                    <div className="ctm-highlight-item">
                      <FaCheckCircle className="ctm-highlight-icon" />
                      <div>
                        <div className="ctm-highlight-label">Availability</div>
                        <div className="ctm-highlight-value text-success">
                          Available
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ─── Feature chips ───────────────────────────── */}
                  <div className="ctm-chips">
                    <span className="ctm-chip ctm-chip-type">
                      <FaCar /> {transferTypeShort}
                    </span>
                    <span className="ctm-chip">
                      <FaUsers /> Max {maxPax} Pax
                    </span>
                    <span className="ctm-chip">
                      <FaSuitcase /> Max {maxLuggage} Luggage
                    </span>
                    <span className="ctm-chip">
                      <FaUserTie /> Driver Included
                    </span>
                  </div>

                  {/* ─── Journey route ───────────────────────────── */}
                  <section className="ctm-section">
                    <h6 className="ctm-section-title">
                      <FaRoute className="me-2 text-danger" />
                      Journey Route
                    </h6>
                    <div className="ctm-route">
                      <div className="ctm-route-rail">
                        <span className="ctm-route-pin" />
                        <span className="ctm-route-line" />
                        <span className="ctm-route-pin ctm-route-pin-end" />
                      </div>
                      <div className="ctm-route-points">
                        <div>
                          <div className="ctm-route-loc">{fromLoc}</div>
                          <div className="ctm-route-kind">
                            {fromKind ? `Pickup · ${fromKind}` : "Pickup"}
                          </div>
                        </div>
                        <div>
                          <div className="ctm-route-loc">{toLoc}</div>
                          <div className="ctm-route-kind">
                            {toKind ? `Drop-off · ${toKind}` : "Drop-off"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* ─── Transfer summary ────────────────────────── */}
                  <section className="ctm-section">
                    <h6 className="ctm-section-title">
                      <FaInfoCircle className="me-2 text-danger" />
                      Transfer Summary
                    </h6>
                    <Row className="g-md-4">
                      <Col md={6}>
                        <div className="ctm-info-row">
                          <span className="ctm-info-label">Transfer Date</span>
                          <span className="ctm-info-value">
                            {transferDateLabel}
                          </span>
                        </div>
                        <div className="ctm-info-row">
                          <span className="ctm-info-label">Transfer Type</span>
                          <span className="ctm-info-value">
                            {transferTypeLabel}
                          </span>
                        </div>
                        <div className="ctm-info-row">
                          <span className="ctm-info-label">Nationality</span>
                          <span className="ctm-info-value">
                            {nationality?.label || "—"}
                          </span>
                        </div>
                        <div className="ctm-info-row">
                          <span className="ctm-info-label">Duration</span>
                          <span className="ctm-info-value">
                            {durationLabel}
                          </span>
                        </div>
                      </Col>
                      <Col md={6}>
                        <div className="ctm-info-row">
                          <span className="ctm-info-label">Passengers</span>
                          <span className="ctm-info-value">
                            {passengerLabel}
                          </span>
                        </div>
                        <div className="ctm-info-row">
                          <span className="ctm-info-label">Vehicle</span>
                          <span className="ctm-info-value">
                            {cab.cabname || "—"} or similar
                          </span>
                        </div>
                        <div className="ctm-info-row">
                          <span className="ctm-info-label">Supplier</span>
                          <span className="ctm-info-value">
                            {supplier || "—"}
                          </span>
                        </div>
                        <div className="ctm-info-row">
                          <span className="ctm-info-label">Availability</span>
                          <span className="ctm-info-value text-success">
                            Available
                          </span>
                        </div>
                      </Col>
                    </Row>
                  </section>

                  {/* ─── Transfer & vehicle info tiles ───────────── */}
                  <section className="ctm-section">
                    <h6 className="ctm-section-title">
                      <FaCar className="me-2 text-danger" />
                      Transfer &amp; Vehicle Info
                    </h6>
                    <div className="ctm-stat-grid">
                      <div className="ctm-stat-tile">
                        <div className="ctm-stat-icon">
                          <FaHourglassHalf />
                        </div>
                        <div>
                          <div className="ctm-stat-label">
                            Driver Waiting Time
                          </div>
                          <div className="ctm-stat-value">{waitingTime}</div>
                        </div>
                      </div>
                      <div className="ctm-stat-tile">
                        <div className="ctm-stat-icon">
                          <FaRoad />
                        </div>
                        <div>
                          <div className="ctm-stat-label">Distance</div>
                          <div className="ctm-stat-value">{distanceLabel}</div>
                        </div>
                      </div>
                      <div className="ctm-stat-tile">
                        <div className="ctm-stat-icon">
                          <FaUsers />
                        </div>
                        <div>
                          <div className="ctm-stat-label">
                            Max Pax / Vehicle
                          </div>
                          <div className="ctm-stat-value">{maxPax}</div>
                        </div>
                      </div>
                      <div className="ctm-stat-tile">
                        <div className="ctm-stat-icon">
                          <FaSuitcase />
                        </div>
                        <div>
                          <div className="ctm-stat-label">
                            Max Luggage / Vehicle
                          </div>
                          <div className="ctm-stat-value">{maxLuggage}</div>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* ─── Price details ───────────────────────────── */}
                  <section className="ctm-section">
                    <h6 className="ctm-section-title">
                      <FaMoneyBillWave className="me-2 text-danger" />
                      Price Details
                    </h6>
                    {priceLabel && (
                      <div className="ctm-price-row">
                        <span>Rate</span>
                        <span>
                          {perUnit > 0
                            ? `AED ${Number(perUnit).toLocaleString()} ${priceLabel}`
                            : priceLabel}
                        </span>
                      </div>
                    )}
                    <div className="ctm-price-row ctm-price-total">
                      <span>Total Price</span>
                      <span>AED {fmtAed(priceTotal)}</span>
                    </div>
                  </section>

                  {/* ─── Disclaimer ──────────────────────────────── */}
                  <section className="ctm-section">
                    <h6 className="ctm-section-title">
                      <FaInfoCircle className="me-2 text-danger" />
                      Disclaimer
                    </h6>
                    <p className="ctm-disclaimer">
                      Whilst we believe all our transfer information and reports
                      to be accurate we shall not be liable in any way to you or
                      to any third parties should any such information or reports
                      prove to be incorrect or incomplete in any way.
                    </p>
                  </section>
                </div>
              </Modal.Body>
              <Modal.Footer className="ctm-footer">
                <Button
                  variant="outline-secondary"
                  size="sm"
                  className="px-3 rounded-pill"
                  onClick={() => setViewModal(null)}
                >
                  Close
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="px-4 rounded-pill fw-bold"
                  onClick={() => {
                    setViewModal(null);
                    handleBookNow(cab, detail);
                  }}
                >
                  Select This Transfer
                </Button>
              </Modal.Footer>
            </>
          );
        })()}
      </Modal>
    </div>
  );
};
