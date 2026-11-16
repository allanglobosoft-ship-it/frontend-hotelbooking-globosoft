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
} from "react-bootstrap";
import { FaCar, FaSearch } from "react-icons/fa";
import { useLocation, useNavigate } from "react-router-dom";
import Select from "react-select";
import axiosInstance from "../../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import Sidebar from "../../../components/Sidebar";
import TopBar from "../../../components/TopBar";
import AgentBalanceDisplay from "../../../components/AgentBalanceDisplay";

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
  const activeRole = (sessionStorage.getItem("currentActiveRole") || "")
    .trim()
    .toUpperCase();
  const storedRoles = (sessionStorage.getItem("userRole") || "").toUpperCase();
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

  // ── Booking type toggle for search results ───────────────────────────
  // "Shared"  → show SIC rates priced by passenger count
  //             (paying pax = adults + children whose age > 3).
  // "Private" → show private rates as returned by the backend
  //             (privateTotal flat, falling back to privatePerPax × pax).
  // Affects ONLY how rows are filtered & priced in the results table —
  // does not change the search request payload, so backend behaviour
  // and other flows are untouched.
  const [transferType, setTransferType] = useState("Shared");

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

  const loadAgents = async () => {
    try {
      const res = await axiosInstance.get("/api/agent");
      setAgents(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load agents:", err);
      setAgents([]);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  // ── New search criteria (Juniper-style layout) ────────────────────────
  const [tripType, setTripType] = useState("ONE_WAY"); // "ONE_WAY" | "ROUND_TRIP"
  const [timeType, setTimeType] = useState("PICKUP_TIME"); // "PICKUP_TIME" | "FLIGHT_TIME"
  const [origin, setOrigin] = useState(null);
  const [departureTime, setDepartureTime] = useState("");
  const [returnTime, setReturnTime] = useState("");

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
  // Returns {} when the form is valid; otherwise an object whose keys are
  // field names and values are user-facing error strings rendered inline.
  const buildValidationErrors = () => {
    const errs = {};

    // Mandatory fields (existing behaviour, now per-field).
    if (!nationality) errs.nationality = "Nationality is required.";
    if (!origin) errs.origin = "Origin is required.";
    if (!destination) errs.destination = "Destination is required.";
    if (!transferPickupDate) errs.pickupDate = "Departure date is required.";
    // Agent is required so the search can apply the right markup +
    // resolve the agent balance in the booking flow downstream.
    if (!isAgentRole && !agent) errs.agent = "Agent is required.";

    // Round-trip needs a return date.
    if (tripType === "ROUND_TRIP" && !transferDropoffDate) {
      errs.dropoffDate = "Return date is required for round trip.";
    }

    // Drop-off date (already required by data flow); flag if check-out
    // somehow falls strictly before pickup.
    if (
      transferPickupDate &&
      transferDropoffDate &&
      transferDropoffDate < transferPickupDate
    ) {
      errs.dropoffDate = "Return date cannot be before departure date.";
    }

    // Pickup section — only meaningful once a type is chosen.
    if (pickupType) {
      if (!pickupName || !pickupName.trim()) {
        errs.pickupName =
          pickupType === "HOTEL"
            ? "Please select a pickup hotel."
            : "Please enter the pickup airport name.";
      }
      if (pickupType === "AIRPORT") {
        if (!pickupTime) {
          errs.pickupTime = "Pickup time is required for airport pickup.";
        }
      }
    }

    // Drop-off section — name required once type is chosen; time is optional.
    if (dropoffType) {
      if (!dropoffName || !dropoffName.trim()) {
        errs.dropoffName =
          dropoffType === "HOTEL"
            ? "Please select a drop-off hotel."
            : "Please enter the drop-off airport name.";
      }
    }

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

  const handleTransferSearchSubmit = async (e) => {
    e.preventDefault();

    // Run validation. If anything's wrong, surface inline + a single toast
    // pointing the user at the form, then short-circuit.
    const errs = buildValidationErrors();
    setValidationErrors(errs);
    if (Object.keys(errs).length > 0) {
      // toast.error("Please fix the highlighted fields and try again.");
      return;
    }

    setTransferLoading(true);
    setHasTransferSearched(true);
    setTransferResults([]);

    try {
      const agentId =
        (agent && String(agent)) ||
        sessionStorage.getItem("makeYourOwnPackageAgentId") ||
        localStorage.getItem("makeYourOwnPackageAgentId") ||
        "1";

      // New zone-based search payload — matches CabSearchRequestDTO on the
      // backend. The endpoint filters cabs by their CabZone (registered in
      // CabProvider → Manage Zones) and surfaces matching CabRates rows.
      const transferPayload = {
        originSource: origin?.source || "SUBLOCATION",
        originLocationId: origin?.locationId || null,
        originLocationName: origin?.locationName || null,
        destinationSource: destination?.source || "SUBLOCATION",
        destinationLocationId: destination?.locationId || null,
        destinationLocationName: destination?.locationName || null,
        tripType, // "ONE_WAY" | "ROUND_TRIP"
        timeType, // "PICKUP_TIME" | "FLIGHT_TIME"
        departureDate: transferPickupDate || null,
        departureTime: departureTime || null,
        returnDate:
          tripType === "ROUND_TRIP" ? transferDropoffDate || null : null,
        returnTime: tripType === "ROUND_TRIP" ? returnTime || null : null,
        adults: transferAdults || 1,
        children: transferChildren || 0,
        childAges:
          transferChildAges && transferChildAges.length > 0
            ? transferChildAges.map((age) => parseInt(age) || 0)
            : transferChildren > 0
              ? Array(transferChildren).fill(0)
              : [],
        agentId: agentId ? Number(agentId) : null,
      };

      const response = await axiosInstance.post(
        "/api/cab-search/search",
        transferPayload,
      );

      const ensureHttpImage = (imageUrl) => {
        if (!imageUrl) {
          return "https://via.placeholder.com/400x225?text=Transfer";
        }
        if (/^https?:\/\//i.test(imageUrl)) {
          return imageUrl;
        }
        if (typeof imageUrl === "string") {
          const fileName = imageUrl.split(/[/\\]/).pop();
          if (fileName) {
            return `https://b2b.choosenfly.com/assets/details/profilepic/hotel/${fileName}`;
          }
        }
        return "https://via.placeholder.com/400x225?text=Transfer";
      };

      const mappedResults = Array.isArray(response.data)
        ? response.data.map((cab, index) => ({
            cabid: cab.cabid || cab.cabId || `cab-${index}`,
            cabname: cab.cabname || cab.cabName || "Transfer Vehicle",
            cabdetails: cab.cabdetails || "",
            cabpic: ensureHttpImage(cab.cabpic || cab.cabPic),
            noOfCabs: cab.noOfCabs || 1,
            // Additions surfaced by the new /api/cab-search/search endpoint.
            cabProviderId: cab.cabProviderId || null,
            cabProviderName: cab.cabProviderName || "",
            originLocationName: cab.originLocationName || "",
            destinationLocationName: cab.destinationLocationName || "",
            capacityMin: cab.capacityMin ?? null,
            capacityMax: cab.capacityMax ?? null,
            // Normalise per-row rate fields so the UI can rely on a single
            // shape regardless of what the backend names them:
            //   totalRate              → final price WITH agent markup
            //   totalRateWithoutMarkup → base price WITHOUT agent markup
            // Older payloads used `totalRateWithoutMrk` for the base — we
            // map that into `totalRateWithoutMarkup` so legacy responses
            // still render. Any pre-existing per-row fields (sicRate,
            // privateRate, privateTotalRate, privatePerPaxRate, types,
            // location, dropOff, etc.) are preserved as-is.
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
          }))
        : [];

      // ── Demo route injection ──────────────────────────────────────────
      // When searching the sample route "Dubai International Airport →
      // Test Hotel", surface the dummy cab inventory so the flow can be
      // demonstrated even when no live rates are configured. Matching is
      // lenient (case-insensitive substring) on the picked origin/dest
      // labels. Any real results still show alongside the demo cabs.
      const originLabel = (
        origin?.label ||
        origin?.locationName ||
        ""
      ).toLowerCase();
      const destLabel = (
        destination?.label ||
        destination?.locationName ||
        ""
      ).toLowerCase();
      const isDemoRoute =
        originLabel.includes("dubai") &&
        originLabel.includes("airport") &&
        destLabel.includes("test hotel");

      if (isDemoRoute) {
        // Attach REAL cab ids to the demo cards so they can be booked. We keep
        // the demo names / images / rates but point each card at an existing
        // Cab row (cycling through whatever's registered).
        const realCabs = await fetchRealCabsForDemo();
        if (realCabs.length === 0) {
          toast.error(
            "No registered cabs found — demo cards will show but can't be booked. Register a cab first.",
          );
        }
        const demoResults = DUMMY_CAB_RESULTS.map((tpl, i) => {
          const real = realCabs.length ? realCabs[i % realCabs.length] : null;
          return {
            ...tpl,
            cabid: real ? real.cabId : tpl.cabid,
          };
        });
        setTransferResults([...mappedResults, ...demoResults]);
      } else {
        setTransferResults(mappedResults);
      }
    } catch (err) {
      console.error("Transfer search failed:", err);
      toast.error("Failed to search for transfers.");
      setTransferResults([]);
    } finally {
      setTransferLoading(false);
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

    if (transferType === "Shared") {
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
    // Recompute the row's price the same way the table shows it so the
    // booking page receives a consistent total. We carry BOTH the
    // markup-applied price (`totalRate`, what the user pays) and the
    // base price (`totalRateWithoutMarkup`, used by the order summary
    // to display the markup separately). For backwards compatibility
    // with CabBookingPage we also keep `totalRateWithoutMrk` aligned
    // to the markup-applied total, since that's the field it reads as
    // its initial billable amount.
    const { total: rowTotal, baseTotal } = priceDetail(cabDetail);
    const enrichedSelectedOption = {
      ...cabDetail,
      types: transferType === "Shared" ? "SIC" : "Private",
      // New, explicitly named fields:
      totalRate: rowTotal, // billable price WITH agent markup
      totalRateWithoutMarkup: baseTotal, // base price WITHOUT agent markup
      // Legacy field name preserved for backwards compatibility with
      // CabBookingPage's API payload (totalRateWithoutmrk). This MUST
      // stay equal to the base (no-markup) price so the booked rate
      // and the supplier-side base reconcile correctly downstream.
      totalRateWithoutMrk: baseTotal,
    };
    // Navigate to CabBookingPage and carry over search data and selected cab data
    navigate("/cab-booking-page", {
      state: {
        cab,
        selectedOption: enrichedSelectedOption,
        searchCriteria: {
          nationality,
          destination,
          pickupDate: transferPickupDate,
          dropoffDate: transferDropoffDate,
          adults: transferAdults,
          children: transferChildren,
          childAges: transferChildAges,
          // ── NEW: pickup / drop-off details carried into the booking page.
          //    Booking Summary / Order Summary read these to render the
          //    facility name (hotel or airport) + optional times. The booking
          //    POST already picks them up from the same searchCriteria too.
          pickupType,
          pickupName,
          pickupTime,
          dropoffType,
          dropoffName,
          dropoffTime,
        },
      },
    });
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

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />

      <div className="d-flex flex-grow-1">
        <Sidebar />

        <main className="flex-grow-1 p-4">
          <Card className="shadow-sm rounded-xl mb-4 border-0">
            <Card.Body>
              {/* 🔷 Header */}
              <div className="mb-4 d-flex justify-content-between align-items-start">
                <div>
                  <h4 className="fw-bold text-primary mb-1">
                    Transfers Search
                  </h4>
                  <p className="text-muted small mb-0">
                    Search and compare available transfer options
                  </p>
                </div>
              </div>

              {/* 🔷 Search Card */}
              <Card className="border-0 shadow-sm rounded-4 bg-white mb-4">
                <Card.Body>
                  <Form onSubmit={handleTransferSearchSubmit}>
                    {/* ── NEW: Trip Type radios (top of form) ─────────────── */}
                    <div className="mb-3 d-flex gap-4 align-items-center">
                      <Form.Check
                        inline
                        type="radio"
                        id="trip-one-way"
                        name="tripType"
                        label="One way"
                        checked={tripType === "ONE_WAY"}
                        onChange={() => setTripType("ONE_WAY")}
                      />
                      <Form.Check
                        inline
                        type="radio"
                        id="trip-round"
                        name="tripType"
                        label="Round trip"
                        checked={tripType === "ROUND_TRIP"}
                        onChange={() => setTripType("ROUND_TRIP")}
                      />
                    </div>

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
                        <Form.Control
                          style={{ height: "46px" }}
                          type="time"
                          value={departureTime}
                          onChange={(e) => setDepartureTime(e.target.value)}
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
                        <Form.Control
                          style={{ height: "46px" }}
                          type="time"
                          value={returnTime}
                          disabled={tripType === "ONE_WAY"}
                          onChange={(e) => setReturnTime(e.target.value)}
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
                        <Form.Select
                          style={{ height: "46px" }}
                          className="form-control-modern"
                          value={agent}
                          isInvalid={!!validationErrors.agent}
                          onChange={(e) => {
                            setAgent(e.target.value);
                            if (e.target.value) clearError("agent");
                          }}
                        >
                          <option value="">Select Agent</option>
                          {agents.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.companyName}
                            </option>
                          ))}
                        </Form.Select>
                        <Form.Control.Feedback type="invalid">
                          {validationErrors.agent}
                        </Form.Control.Feedback>
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
                          <Form.Control
                            style={{ height: "46px" }}
                            type="time"
                            // Only meaningful for airport pickups; disabled otherwise
                            // so the form stays clean.
                            disabled={pickupType !== "AIRPORT"}
                            value={pickupTime}
                            isInvalid={!!validationErrors.pickupTime}
                            onChange={(e) => {
                              setPickupTime(e.target.value);
                              if (e.target.value) clearError("pickupTime");
                            }}
                          />
                          <Form.Control.Feedback type="invalid">
                            {validationErrors.pickupTime}
                          </Form.Control.Feedback>
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
                          <Form.Control
                            style={{ height: "46px" }}
                            type="time"
                            // Per spec, drop-off time is optional even for airport
                            // drops. Disabled until a type is chosen for clarity.
                            disabled={!dropoffType}
                            value={dropoffTime}
                            onChange={(e) => setDropoffTime(e.target.value)}
                          />
                        </Col>
                      </Row>
                    </div>

                    <Row className="justify-content-center">
                      <Col
                        md={4}
                        className="d-flex justify-content-center mt-3"
                      >
                        <Button
                          variant="warning"
                          className="px-5 py-2 fw-bold"
                          type="submit"
                          disabled={transferLoading}
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

                    {/* Child Ages */}
                    {transferChildren > 0 && (
                      <Row className="g-2 mt-3">
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
                                placeholder="Age"
                                value={age}
                                style={{ width: "80px" }}
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
                  </Form>
                </Card.Body>
              </Card>

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
                transferResults.length > 0 && (
                  <div className="mt-4">
                    {/* Header */}
                    <div className="d-flex justify-content-between align-items-center mb-3 px-1 flex-wrap gap-2">
                      <h5 className="fw-semibold mb-0">Transfer Results</h5>

                      {/* Shared / Private toggle. Drives result filtering + pricing only
        (does not re-trigger the search). Defaulting to "Shared" matches
        the SIC-first pricing convention used elsewhere in the app. */}
                      <div className="d-flex align-items-center gap-3">
                        <Form.Check
                          inline
                          type="radio"
                          id="transferType-shared"
                          name="transferType"
                          label="Shared (SIC)"
                          checked={transferType === "Shared"}
                          onChange={() => setTransferType("Shared")}
                        />
                        <Form.Check
                          inline
                          type="radio"
                          id="transferType-private"
                          name="transferType"
                          label="Private"
                          checked={transferType === "Private"}
                          onChange={() => setTransferType("Private")}
                        />
                        <span className="text-muted small">
                          {transferResults.length} found
                        </span>
                      </div>
                    </div>

                    {/* Small note explaining how SIC pricing is computed so the operator
      can sanity-check totals against the rate grid. */}
                    {transferType === "Shared" && (
                      <div className="text-muted small mb-2 px-1">
                        Pricing for {sicPayingPax} paying pax (adults + children
                        aged &gt; 3).
                      </div>
                    )}

                    {/* If the user toggles to a type that none of the search results
      support, surface a friendly empty-state instead of an empty grid. */}
                    {transferResults.every(
                      (cab) =>
                        !Array.isArray(cab.searchCabDetailsDTO) ||
                        cab.searchCabDetailsDTO.filter((d) =>
                          transferType === "Shared"
                            ? String(d.types || "").toUpperCase() === "SIC"
                            : String(d.types || "").toLowerCase() === "private",
                        ).length === 0,
                    ) && (
                      <div className="text-center text-muted py-4 bg-white rounded-3 border">
                        No{" "}
                        {transferType === "Shared" ? "shared (SIC)" : "private"}{" "}
                        rates available for this search. Try the other option.
                      </div>
                    )}

                    <Row className="g-3 justify-content-center">
                      {transferResults.map((cab) => {
                        // Filter rows up-front so we know whether this cab has any
                        // matching options for the selected type — keeps empty cabs out
                        // of the list entirely and per-card hints accurate.
                        const filteredDetails = Array.isArray(
                          cab.searchCabDetailsDTO,
                        )
                          ? cab.searchCabDetailsDTO.filter((d) =>
                              transferType === "Shared"
                                ? String(d.types || "").toUpperCase() === "SIC"
                                : String(d.types || "").toLowerCase() ===
                                  "private",
                            )
                          : [];
                        if (filteredDetails.length === 0) return null;
                        return (
                          <Col key={cab.cabid} lg={12} xl={12}>
                            {" "}
                            {/* 🔥 wider */}
                            <Card className="border-0 shadow-sm bg-white">
                              <Card.Body className="p-4">
                                {" "}
                                {/* 🔥 more padding */}
                                {/* HEADER */}
                                <div className="d-flex justify-content-between align-items-center mb-3">
                                  {/* LEFT */}
                                  <div>
                                    <h5 className="fw-semibold mb-1">
                                      {cab.cabname || "Transfer Vehicle"}
                                    </h5>
                                    {cab.cabProviderName && (
                                      <div className="text-muted small mb-1">
                                        by {cab.cabProviderName}
                                      </div>
                                    )}
                                    {(cab.originLocationName ||
                                      cab.destinationLocationName) && (
                                      <div className="small text-primary mb-1">
                                        {cab.originLocationName || "—"} →{" "}
                                        {cab.destinationLocationName || "—"}
                                      </div>
                                    )}
                                    <div className="d-flex flex-wrap gap-2 align-items-center">
                                      <span className="text-muted small">
                                        <FaCar className="me-1" />
                                        {cab.noOfCabs || "1"} Vehicle
                                      </span>
                                      {(cab.capacityMin != null ||
                                        cab.capacityMax != null) && (
                                        <span className="badge bg-light text-dark border">
                                          Capacity{" "}
                                          {cab.capacityMin != null
                                            ? cab.capacityMin
                                            : "?"}
                                          –
                                          {cab.capacityMax != null
                                            ? cab.capacityMax
                                            : "?"}{" "}
                                          pax
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* RIGHT IMAGE */}
                                  <div
                                    style={{
                                      width: "160px", // 🔥 bigger
                                      height: "95px",
                                      overflow: "hidden",
                                    }}
                                  >
                                    <LazyImage
                                      src={cab.cabpic}
                                      alt={cab.cabname}
                                      className="rounded"
                                    />
                                  </div>
                                </div>
                                {/* Divider */}
                                <div
                                  style={{
                                    borderTop: "1px solid #f1f5f9",
                                    marginBottom: "10px",
                                  }}
                                />
                                {/* TABLE */}
                                {filteredDetails.length > 0 ? (
                                  <div>
                                    <table
                                      className="w-100"
                                      style={{ fontSize: "0.95rem" }}
                                    >
                                      <thead>
                                        <tr className="text-muted small">
                                          <th className="pb-2 fw-normal">
                                            Route
                                          </th>
                                          <th className="pb-2 fw-normal">
                                            Type
                                          </th>
                                          <th className="pb-2 fw-normal text-end">
                                            Price
                                          </th>
                                          <th className="pb-2 text-end"></th>
                                        </tr>
                                      </thead>

                                      <tbody>
                                        {filteredDetails.map((detail, idx) => {
                                          const {
                                            total: totalRate,
                                            perUnit,
                                            label,
                                          } = priceDetail(detail);

                                          return (
                                            <tr
                                              key={idx}
                                              style={{
                                                borderTop: "1px solid #f1f5f9",
                                              }}
                                              className="hover-row"
                                            >
                                              {/* Route */}
                                              <td className="py-3">
                                                {" "}
                                                {/* 🔥 more spacing */}
                                                {detail.location || "N/A"}{" "}
                                                <span className="text-muted mx-1">
                                                  →
                                                </span>{" "}
                                                {detail.dropOff || "N/A"}
                                              </td>

                                              {/* Type */}
                                              <td className="py-3">
                                                <span
                                                  className={`fw-medium ${
                                                    transferType === "Private"
                                                      ? "text-success"
                                                      : "text-primary"
                                                  }`}
                                                >
                                                  {transferType === "Private"
                                                    ? "Private"
                                                    : "SIC"}
                                                </span>
                                              </td>

                                              {/* Price */}
                                              <td className="py-3 text-end fw-semibold">
                                                AED{" "}
                                                {Number(
                                                  totalRate || 0,
                                                ).toLocaleString()}
                                                {label ? (
                                                  <div className="text-muted small fw-normal">
                                                    {perUnit > 0
                                                      ? `AED ${perUnit.toLocaleString()} ${label}`
                                                      : label}
                                                  </div>
                                                ) : null}
                                              </td>

                                              {/* Button */}
                                              <td className="py-3 text-end">
                                                <Button
                                                  size="sm"
                                                  variant="primary"
                                                  className="px-3"
                                                  onClick={() =>
                                                    handleBookNow(cab, detail)
                                                  }
                                                >
                                                  Book
                                                </Button>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <div className="text-muted small mt-2">
                                    No options available
                                  </div>
                                )}
                              </Card.Body>
                            </Card>
                          </Col>
                        );
                      })}
                    </Row>
                  </div>
                )}

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
            </Card.Body>
          </Card>
        </main>
      </div>
    </div>
  );
};
