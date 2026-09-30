import React, { useState, useRef, useEffect, useMemo } from "react";
import { Card, Row, Col, Form, Button, Spinner, Badge, Modal } from "react-bootstrap";
import { FaCar, FaSearch, FaClock, FaRoad, FaEye } from "react-icons/fa";
import { useLocation, useNavigate } from "react-router-dom";
import Select from "react-select";
import axiosInstance from "../../../components/AxiosInstance";
import { logAgentSearch } from "../../../utils/agentSearchLog";
import { toast } from "react-hot-toast";
import Sidebar from "../../../components/Sidebar";
import TopBar from "../../../components/TopBar";
import AgentBalanceDisplay from "../../../components/AgentBalanceDisplay";
import AdvertisementCarousel from "../../../components/AdvertisementCarousel";
import AgentCreditBalance from "../../../components/AgentCreditBalance";
import MapModal from "../../../components/map/MapModal";
import "../../../styles/HotelSearch.css";

const getCityCoords = (cityName, index) => {
  const defaults = {
    "dubai": { lat: 25.2048, lng: 55.2708 },
    "abu dhabi": { lat: 24.4539, lng: 54.3773 },
    "sharjah": { lat: 25.3463, lng: 55.42095 },
    "riyadh": { lat: 24.7136, lng: 46.6753 },
    "jeddah": { lat: 21.5433, lng: 39.1728 },
    "paris": { lat: 48.8566, lng: 2.3522 },
    "london": { lat: 51.5074, lng: -0.1278 }
  };
  const normalized = (cityName || "").toLowerCase().trim();
  const base = defaults[normalized] || { lat: 25.2048, lng: 55.2708 };
  
  // Apply a small jitter using index to spread them slightly on map so they don't overlap
  const jitterLat = ((index % 5) - 2) * 0.008;
  const jitterLng = (Math.floor(index / 5) % 5 - 2) * 0.008;
  return {
    lat: base.lat + jitterLat,
    lng: base.lng + jitterLng
  };
};


function LazyImage({ src, alt, className, style }) {
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

  const imageSrc = src || "https://via.placeholder.com/480x270?text=Chauffeur";

  return (
    <div
      ref={containerRef}
      className={`ratio ratio-16x9 overflow-hidden ${className || ""}`}
      style={{ height: "100%", width: "100%", position: "relative", ...style }}
    >
      {!loaded && (
        <div
          className="skeleton w-100 h-100"
          style={{ backgroundColor: "#e0e0e0", position: "absolute", inset: 0 }}
        />
      )}
      {inView && (
        <img
          src={imageSrc}
          loading="lazy"
          alt={alt}
          onLoad={() => setLoaded(true)}
          onError={(e) => {
            e.currentTarget.src = "https://via.placeholder.com/480x270?text=Chauffeur";
          }}
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


/**
 * Chauffeur-rental search. Replaces the old transfer-style
 * origin/destination/oneway/roundtrip screen with a time-and-distance based
 * rental search: City + Pickup Date/Time + Rental Package + Cab Type +
 * Nationality + Agent + Passengers. Talks to /api/scheffer-rental-search.
 */
export const SchefferDriverSearch = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const activeRole = (localStorage.getItem("currentActiveRole") || "").trim().toUpperCase();
  const storedRoles = (localStorage.getItem("userRole") || "").toUpperCase();
  const isAgentRole = activeRole
    ? activeRole === "AGENT"
    : storedRoles.includes("AGENT") && !storedRoles.includes("ADMIN");

  const prior = location.state || {};

  // ---- form state ----
  const [city, setCity] = useState(prior.city || null);
  const [pickupDate, setPickupDate] = useState(prior.pickupDate || "");
  const [pickupTime, setPickupTime] = useState(prior.pickupTime || "");
  const [hoursFilter, setHoursFilter] = useState(prior.hoursFilter || "");
  const [pickup, setPickup] = useState(prior.pickup || null);
  const [dropoff, setDropoff] = useState(prior.dropoff || null);
  const [adults, setAdults] = useState(prior.adults || 1);
  const [children, setChildren] = useState(prior.children || 0);
  const [childAges, setChildAges] = useState(prior.childAges || []);
  const [nationality, setNationality] = useState(prior.nationality || null);
  const [agent, setAgent] = useState("");

  // ---- lookups ----
  const [cityOptions, setCityOptions] = useState([]);
  const [nationalityList, setNationalityList] = useState([]);
  const [locationGroups, setLocationGroups] = useState([]);  // grouped Zones/Hotels/Airports
  const [isLocLoading, setIsLocLoading] = useState(false);
  const [isNationalityLoading, setIsNationalityLoading] = useState(false);
  const [agents, setAgents] = useState([]);

  // ---- results ----
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [showCabDetailModal, setShowCabDetailModal] = useState(false);
  const [selectedCabResult, setSelectedCabResult] = useState(null);
  const [selectedCabConfig, setSelectedCabConfig] = useState(null);
  const [selectedCabRateDetails, setSelectedCabRateDetails] = useState(null);
  const [selectedCabZoneDetails, setSelectedCabZoneDetails] = useState(null);
  const [cabDetailLoading, setCabDetailLoading] = useState(false);
  // When results are on screen the big search form collapses into a sticky
  // summary strip. Clicking "Modify Search" flips this true to re-expand it.
  const [isEditingSearch, setIsEditingSearch] = useState(false);

  // ---- filter states ----
  const [showMapModal, setShowMapModal] = useState(false);
  const [nameFilter, setNameFilter] = useState("");
  const [pendingNameFilter, setPendingNameFilter] = useState("");
  const [selectedSuppliers, setSelectedSuppliers] = useState([]);
  const [pendingSuppliers, setPendingSuppliers] = useState([]);
  const [transferType, setTransferType] = useState("All");
  const [sortBy, setSortBy] = useState("price_asc");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;
  const [priceFilter, setPriceFilter] = useState(10000);
  const [maxPriceLimit, setMaxPriceLimit] = useState(10000);
  const [minPriceLimit, setMinPriceLimit] = useState(0);

  const [validationErrors, setValidationErrors] = useState({});
  const clearError = (field) =>
    setValidationErrors((prev) => {
      if (!prev[field]) return prev;
      const { [field]: _omit, ...rest } = prev;
      return rest;
    });

  // ---- load lookups ----
  // Only cities are needed in the search form now — Cab Type and Package are
  // no longer search inputs; the search returns every chauffeur available in
  // the chosen city and the operator picks one from the result cards.
  const loadRentalLookup = async () => {
    try {
      const res = await axiosInstance.get("/api/scheffer-rental-search/lookup");
      const d = res.data || {};
      setCityOptions((d.cities || []).map((c) => ({ value: c.id, label: c.name })));
    } catch (e) {
      console.error("Failed to load rental lookup:", e);
    }
  };

  // Pickup / Dropoff lookup — grouped Zones / Hotels / Airports, same shape as
  // the cab transfer search. Used by both selects below.
  const buildLocOption = (item) => ({
    value: `${item.source}:${item.id}`,
    label: item.name,
    subtitle: item.subtitle || "",
    source: item.source,
    locationId: Number(item.id),
    locationName: item.name,
    code: item.code || null,
  });

  // Dedicated chauffeur-rental lookup. NOT the legacy /api/cab-search/lookup
  // (which belongs to the transfer cab flow and uses "zones" — that label
  // conflicts with the rental operators' mental model). The rental endpoint
  // groups results as "places" instead.
  const fetchLocationLookup = (q = "") => {
    setIsLocLoading(true);
    axiosInstance
      .get(`/api/scheffer-rental-search/locations?search=${encodeURIComponent(q)}&limit=20`)
      .then((res) => {
        const d = res?.data || {};
        const groups = [];
        const places = Array.isArray(d.places) ? d.places : [];
        const hotels = Array.isArray(d.hotels) ? d.hotels : [];
        const airports = Array.isArray(d.airports) ? d.airports : [];
        if (places.length) groups.push({ label: "PLACES", options: places.map(buildLocOption) });
        if (hotels.length) groups.push({ label: "HOTELS", options: hotels.map(buildLocOption) });
        if (airports.length) groups.push({ label: "AIRPORTS", options: airports.map(buildLocOption) });
        setLocationGroups(groups);
      })
      .catch(() => setLocationGroups([]))
      .finally(() => setIsLocLoading(false));
  };

  const formatLocOption = (opt) => (
    <div>
      <div className="fw-semibold">{opt.label}</div>
      {opt.subtitle && <small className="text-muted">{opt.subtitle}</small>}
    </div>
  );

  const loadAgents = async () => {
    try {
      const res = await axiosInstance.get("/api/agent?activeOnly=true");
      setAgents(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load agents:", err);
      setAgents([]);
    }
  };

  function debounce(func, wait) {
    let timeout;
    return function executed(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }

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
        setNationalityList([]);
      } finally {
        setIsNationalityLoading(false);
      }
    }, 300)
  ).current;

  const loadCountries = async () => {
    try {
      setIsNationalityLoading(true);
      const response = await axiosInstance.get("/api/country?limit=50");
      const options = Array.isArray(response.data)
        ? response.data.map((c) => ({ value: c.id, label: c.name, code: c.countryCode }))
        : [];
      setNationalityList(options);
    } catch (e) {
      setNationalityList([]);
    } finally {
      setIsNationalityLoading(false);
    }
  };

  useEffect(() => {
    loadRentalLookup();
    loadAgents();
    loadCountries();
    fetchLocationLookup("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep child-age array sized to children count
  useEffect(() => {
    if (children > 0) {
      setChildAges((prev) => {
        const next = [...prev];
        while (next.length < children) next.push(5);
        if (next.length > children) next.splice(children);
        return next;
      });
    } else {
      setChildAges([]);
    }
  }, [children]);

  const handleChildAgeChange = (index, value) => {
    const next = [...childAges];
    next[index] = parseInt(value) || 0;
    setChildAges(next);
  };

  const validate = () => {
    const errs = {};
    // Only City + Date + Time are mandatory — the search returns every
    // chauffeur available in the city so the operator can browse. Cab
    // Type / Package / Hours are optional filters layered on top.
    if (!city) errs.city = "City is required.";
    if (!pickupDate) errs.pickupDate = "Pickup date is required.";
    if (!pickupTime) errs.pickupTime = "Pickup time is required.";
    if (!nationality) errs.nationality = "Nationality is required.";
    if (!isAgentRole && !agent) errs.agent = "Agent is required.";
    return errs;
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    const errs = validate();
    setValidationErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    setHasSearched(true);
    setIsEditingSearch(false);
    setResults([]);

    try {
      const agentId =
        (agent && String(agent)) ||
        sessionStorage.getItem("makeYourOwnPackageAgentId") ||
        localStorage.getItem("makeYourOwnPackageAgentId") ||
        null;

      const payload = {
        cityId: city?.value || null,
        cityName: city?.label || null,
        cabType: null,
        packageName: null,
        // Optional duration filter — empty means "any duration".
        hours: hoursFilter ? parseInt(hoursFilter, 10) : null,
        pickupDate: pickupDate || null,
        pickupTime: pickupTime || null,
        adults: adults || 1,
        children: children || 0,
        childAges: childAges && childAges.length ? childAges.map((a) => parseInt(a) || 0) : [],
        nationality: nationality?.label || null,
        agentId: agentId ? Number(agentId) : null,
      };

      // Agent search log (Unbooked Opportunities → Searches tab) —
      // chauffeur / limo has a city and pickup date, no check-out.
      logAgentSearch({
        agentId: agentId ? Number(agentId) : null,
        destinationId: city?.value,
        destinationLabel: city?.label,
        nationalityLabel: nationality?.label,
        checkIn: pickupDate,
        checkOut: pickupDate,
        source: "chauffeur",
      });

      const res = await axiosInstance.post("/api/scheffer-rental-search/search", payload);
      const data = Array.isArray(res.data) ? res.data : [];
      setResults(data);

      // Reset filter states
      setNameFilter("");
      setPendingNameFilter("");
      setSelectedSuppliers([]);
      setPendingSuppliers([]);
      setTransferType("All");
      setSortBy("price_asc");
      setCurrentPage(1);
      if (data.length > 0) {
        const prices = data.map(card => card.basePriceWithMarkup != null ? card.basePriceWithMarkup : card.basePrice);
        const maxVal = Math.ceil(Math.max(...prices));
        const minVal = Math.floor(Math.min(...prices));
        setMinPriceLimit(minVal);
        setMaxPriceLimit(maxVal);
        setPriceFilter(maxVal);
      } else {
        setMinPriceLimit(0);
        setMaxPriceLimit(10000);
        setPriceFilter(10000);
      }
    } catch (err) {
      console.error("Rental search failed:", err);
      toast.error("Failed to search rentals.");
      setResults([]);
      setNameFilter("");
      setPendingNameFilter("");
      setSelectedSuppliers([]);
      setPendingSuppliers([]);
      setTransferType("All");
      setSortBy("price_asc");
      setCurrentPage(1);
      setMinPriceLimit(0);
      setMaxPriceLimit(10000);
      setPriceFilter(10000);
    } finally {
      setLoading(false);
    }
  };

  // Derive unique supplier names from raw results for the Suppliers filter
  const supplierNames = useMemo(() => {
    const names = results.map((c) => c.cabProviderName).filter(Boolean);
    return [...new Set(names)].sort();
  }, [results]);

  const filteredResults = useMemo(() => {
    let data = [...results];

    // 1. Price Range filter
    data = data.filter((card) => {
      const price = card.basePriceWithMarkup != null ? card.basePriceWithMarkup : card.basePrice;
      return price <= priceFilter;
    });

    // 2. Name filter
    if (nameFilter.trim()) {
      const q = nameFilter.trim().toLowerCase();
      data = data.filter((card) => (card.cabName || "").toLowerCase().includes(q));
    }

    // 3. Supplier filter
    if (selectedSuppliers.length > 0) {
      data = data.filter((card) => selectedSuppliers.includes(card.cabProviderName));
    }

    // 4. Transfer type filter
    if (transferType === "Shared") {
      data = data.filter((card) => String(card.types || "").toUpperCase() === "SIC");
    } else if (transferType === "Private") {
      data = data.filter((card) => String(card.types || "").toUpperCase() !== "SIC");
    }

    // 5. Sort
    if (sortBy === "price_asc") {
      data.sort((a, b) => {
        const pa = a.basePriceWithMarkup != null ? a.basePriceWithMarkup : a.basePrice;
        const pb = b.basePriceWithMarkup != null ? b.basePriceWithMarkup : b.basePrice;
        return pa - pb;
      });
    } else if (sortBy === "price_desc") {
      data.sort((a, b) => {
        const pa = a.basePriceWithMarkup != null ? a.basePriceWithMarkup : a.basePrice;
        const pb = b.basePriceWithMarkup != null ? b.basePriceWithMarkup : b.basePrice;
        return pb - pa;
      });
    } else if (sortBy === "name") {
      data.sort((a, b) => (a.cabName || "").localeCompare(b.cabName || ""));
    }

    return data;
  }, [results, priceFilter, nameFilter, selectedSuppliers, transferType, sortBy]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredResults.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageRows = filteredResults.slice((safePage - 1) * pageSize, safePage * pageSize);

  const renderPagination = () => {
    if (totalPages <= 1) return null;
    const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
    return (
      <div className="d-flex gap-1 flex-wrap">
        <Button size="sm" variant="link" className="text-decoration-none p-1" disabled={safePage === 1} onClick={() => setCurrentPage(1)}>First</Button>
        <Button size="sm" variant="link" className="text-decoration-none p-1" disabled={safePage === 1} onClick={() => setCurrentPage(safePage - 1)}>Prev</Button>
        {pages.map((p) => (
          <Button key={p} size="sm" variant={p === safePage ? "primary" : "outline-secondary"} className="px-2 py-0" onClick={() => setCurrentPage(p)}>{p}</Button>
        ))}
        <Button size="sm" variant="link" className="text-decoration-none p-1" disabled={safePage === totalPages} onClick={() => setCurrentPage(safePage + 1)}>Next</Button>
        <Button size="sm" variant="link" className="text-decoration-none p-1" disabled={safePage === totalPages} onClick={() => setCurrentPage(totalPages)}>Last</Button>
      </div>
    );
  };

  const mapMarkers = useMemo(() => {
    return filteredResults.map((card, idx) => {
      const coords = getCityCoords(card.cityName, idx);
      return {
        id: card.packageId || idx,
        name: `${card.cabName} (${card.packageName})`,
        lat: coords.lat,
        lng: coords.lng,
        address: `${card.cityName}, ${card.packageName} package`,
        contactNumber: card.cabProviderName || "",
      };
    });
  }, [filteredResults]);

  const handleBookNow = (card) => {
    const price = card.basePriceWithMarkup != null ? card.basePriceWithMarkup : card.basePrice;
    const selectedOption = {
      ...card,
      // unified pricing fields the booking page reads
      totalRate: price,
      totalRateWithoutMarkup: card.basePrice,
      totalRateWithoutMrk: card.basePrice,
    };
    navigate("/scheffer-driver-booking-page", {
      state: {
        cab: {
          cabid: card.cabId,
          cabname: card.cabName,
          cabpic: card.cabPic,
          cabProviderId: card.cabProviderId,
          cabProviderName: card.cabProviderName,
        },
        selectedOption,
        searchCriteria: {
          nationality,
          cityId: card.cityId,
          cityName: card.cityName,
          pickupDate,
          pickupTime,
          adults,
          children,
          childAges,
          // Operational pickup / dropoff (place / hotel / airport) — saved
          // onto the booking record so the driver knows where to meet the
          // customer. NOT a filter for the rental search.
          pickup,
          dropoff,
          pickupType: pickup?.source || null,
          pickupName: pickup?.locationName || null,
          dropoffType: dropoff?.source || null,
          dropoffName: dropoff?.locationName || null,
        },
      },
    });
  };

  const getCabImageUrl = (imagePath) => {
    if (!imagePath) return "";
    if (typeof imagePath !== "string") return "";
    if (imagePath.startsWith("http") || imagePath.startsWith("blob:")) {
      return imagePath;
    }
    if (imagePath.includes("\\") || imagePath.includes(":")) {
      const filename = imagePath.split("\\").pop();
      return `${process.env.REACT_APP_API_BASE_URL}/api/files/${filename}`;
    }
    if (imagePath.startsWith("/")) {
      return `${process.env.REACT_APP_API_BASE_URL}${imagePath}`;
    }
    return `${process.env.REACT_APP_API_BASE_URL}/api/files/${imagePath}`;
  };

  const handleViewCab = async (card) => {
    setSelectedCabResult(card);
    setSelectedCabConfig(null);
    setSelectedCabRateDetails(null);
    setSelectedCabZoneDetails(null);
    setShowCabDetailModal(true);

    const cabId = card?.cabId || card?.cabid;
    const providerId = card?.cabProviderId;
    const rateId = card?.rentalRateId || card?.cabRateId || card?.cabratesId;
    const requests = [];

    setCabDetailLoading(true);

    if (providerId && cabId) {
      requests.push(
        axiosInstance
          .get(`/api/SchefferDriver/cabs/${providerId}`)
          .then((res) => {
            const cabList = Array.isArray(res.data)
              ? res.data
              : Array.isArray(res.data?.data)
              ? res.data.data
              : Array.isArray(res.data?.cabs)
              ? res.data.cabs
              : [];
            const matchingCab = cabList.find(
              (cab) => String(cab.cabId || cab.id) === String(cabId),
            );
            setSelectedCabConfig(matchingCab || null);
          }),
      );
    }

    if (rateId) {
      requests.push(
        axiosInstance
          .get(`/api/scheffer-rental-rates/${rateId}`)
          .then((res) => setSelectedCabRateDetails(res.data || null)),
      );
    }

    if (providerId && cabId) {
      requests.push(
        axiosInstance
          .get(`/api/scheffer-zones/by-provider/${providerId}`)
          .then((res) => {
            const zones = Array.isArray(res.data) ? res.data : [];
            const matchingZone = zones.find((zone) => String(zone.cabId) === String(cabId));
            setSelectedCabZoneDetails(matchingZone || null);
          }),
      );
    }

    if (requests.length === 0) {
      setCabDetailLoading(false);
      return;
    }

    const results = await Promise.allSettled(requests);
    if (results.some((result) => result.status === "rejected")) {
      console.error("Failed to load one or more cab detail sections:", results);
      toast.error("Some cab details could not be loaded. Showing available details.");
    }
    setCabDetailLoading(false);
  };

  const customSelectStyles = {
    control: (base) => ({
      ...base,
      minHeight: "42px",
      border: "1px solid #dee2e6",
      "&:hover": { borderColor: "#86b7fe" },
    }),
    menuPortal: (base) => ({ ...base, zIndex: 9999 }),
  };

  const money = (v) => (v == null ? "-" : `${Number(v).toLocaleString()} AED`);

  const formatDetailValue = (value) => {
    if (value == null || value === "") return "-";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (Array.isArray(value)) return value.length ? `${value.length} item(s)` : "-";
    if (typeof value === "object") return "-";
    return String(value);
  };

  const DetailItem = ({ label, value }) => (
    <Col md={6}>
      <div className="border rounded-3 p-2 h-100 bg-white">
        <div className="text-muted small">{label}</div>
        <div className="fw-semibold text-dark" style={{ wordBreak: "break-word" }}>
          {formatDetailValue(value)}
        </div>
      </div>
    </Col>
  );

  const PolicyList = ({ rows, emptyText }) => {
    const cleanRows = Array.isArray(rows)
      ? rows.filter((row) => row != null && String(row).trim() !== "")
      : [];
    if (cleanRows.length === 0) {
      return <div className="text-muted small">{emptyText}</div>;
    }
    return (
      <ol className="mb-0 ps-3">
        {cleanRows.map((row, index) => (
          <li key={`${row}-${index}`} className="small mb-1">
            {row}
          </li>
        ))}
      </ol>
    );
  };

  const formatZoneLocation = (loc) => {
    if (!loc) return "-";
    const name = loc.locationName || loc.name || loc.label || "-";
    const source = loc.source ? ` (${loc.source})` : "";
    return `${name}${source}`;
  };

  // Results are on screen once a search has run. Collapse the full form into
  // the sticky summary strip then, unless the user chose to modify the search.
  const collapseSearch = hasSearched && !isEditingSearch;
  const selectedCabImage =
    getCabImageUrl(
      selectedCabConfig?.cabImage ||
        selectedCabConfig?.cabpic ||
        selectedCabConfig?.cabPic ||
        selectedCabResult?.cabPic ||
        selectedCabResult?.cabpic,
    ) ||
    selectedCabResult?.cabPic ||
    selectedCabResult?.cabpic;
  const selectedCabLocations = Array.isArray(selectedCabConfig?.cabLocationDTOList)
    ? selectedCabConfig.cabLocationDTOList
    : Array.isArray(selectedCabConfig?.locations)
    ? selectedCabConfig.locations
    : [];
  const hiddenDetailKeys = new Set([
    "cabLocationDTOList",
    "locations",
    "cabImage",
    "cabpic",
    "cabPic",
    "cabProviderId",
    "cabId",
    "id",
    "name",
    "cabName",
    "cabCode",
    "cabType",
    "countryid",
    "countryId",
    "countryName",
    "placeid",
    "placeId",
    "placeName",
    "stateName",
    "maxCapacity",
    "maxLuggageCapacity",
  ]);
  const additionalCabDetails = Object.entries(selectedCabConfig || {}).filter(
    ([key, value]) =>
      !hiddenDetailKeys.has(key) &&
      value != null &&
      value !== "" &&
      typeof value !== "object",
  );
  const selectedRateId =
    selectedCabResult?.rentalRateId ||
    selectedCabResult?.cabRateId ||
    selectedCabResult?.cabratesId;
  const selectedRateTerms = Array.isArray(selectedCabRateDetails?.termsAndConditions)
    ? selectedCabRateDetails.termsAndConditions
    : [];
  const selectedRateCancellationPolicies = Array.isArray(
    selectedCabRateDetails?.cancellationPolicies,
  )
    ? selectedCabRateDetails.cancellationPolicies
    : [];
  const selectedZonePickupLocations = Array.isArray(selectedCabZoneDetails?.pickupLocations)
    ? selectedCabZoneDetails.pickupLocations
    : [];
  const selectedZoneDropoffLocations = Array.isArray(selectedCabZoneDetails?.dropoffLocations)
    ? selectedCabZoneDetails.dropoffLocations
    : [];

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4 hs-page">
          <Card className="shadow-sm rounded-xl mb-4 border-0">
            <Card.Body>
              <div className="mb-4 d-flex justify-content-between align-items-start flex-wrap gap-2">
                <div>
                  <h4 className="fw-bold text-primary mb-1">
                    <FaCar className="me-2" />
                    Chauffeur Driver Search
                  </h4>
                  <p className="text-muted small mb-0">
                    Book an hourly chauffeur rental — travel anywhere within the city for the package duration.
                  </p>
                </div>
                {/* Agent logins see their available credit balance at the
                    right end of the heading row (renders nothing for other
                    roles). */}
                <AgentCreditBalance />
              </div>

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
                    {pickupDate && (
                      <span className="hs-summary-chip">{pickupDate}</span>
                    )}
                    <span className="hs-summary-chip">
                      {adults} adults
                      {children ? `, ${children} child` : ""}
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
              <div className="d-flex gap-3 align-items-start mb-3 hs-search-ads-row">
                <div className="flex-grow-1" style={{ minWidth: 0 }}>
                  <Card className="border-0 shadow-sm rounded-4 bg-white mb-3">
                <Card.Body className="p-4">
                  <Form onSubmit={handleSearch}>

                    {/* Row 1 — Agent (admin-only) + City / Location + Nationality */}
                    <Row className="g-3 mb-3">
                      {!isAgentRole && (
                        <Col md={4}>
                          <Form.Label className="fw-semibold text-dark">
                            Agent <span className="text-danger">*</span>
                          </Form.Label>
                          <Select
  options={agents.map((a) => ({
    value: a.id,
    label: a.companyName,
  }))}
  value={
    agents
      .map((a) => ({
        value: a.id,
        label: a.companyName,
      }))
      .find((a) => String(a.value) === String(agent)) || null
  }
  onChange={(selected) => {
    setAgent(selected ? selected.value : "");
    if (selected) clearError("agent");
  }}
  placeholder="Select Agent"
  isSearchable
  isClearable
  menuPortalTarget={document.body}
  styles={{
    ...customSelectStyles,
    control: (base) => ({
      ...customSelectStyles.control(base),
      borderColor: validationErrors.agent ? "#dc3545" : "#dee2e6",
    }),
    menuPortal: (base) => ({
      ...base,
      zIndex: 9999,
    }),
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
                      <Col md={!isAgentRole ? 4 : 6}>
                        <Form.Label className="fw-semibold text-dark">
                          City / Location <span className="text-danger">*</span>
                        </Form.Label>
                        <Select
                          options={cityOptions}
                          value={city}
                          onChange={(opt) => {
                            setCity(opt);
                            if (opt) clearError("city");
                          }}
                          placeholder="Select city"
                          isSearchable
                          isClearable
                          menuPortalTarget={document.body}
                          styles={{
                            ...customSelectStyles,
                            control: (base) => ({
                              ...customSelectStyles.control(base),
                              borderColor: validationErrors.city ? "#dc3545" : "#dee2e6",
                            }),
                            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                          }}
                        />
                        {validationErrors.city && (
                          <div className="text-danger small mt-1">{validationErrors.city}</div>
                        )}
                      </Col>
                      <Col md={!isAgentRole ? 4 : 6}>
                        <Form.Label className="fw-semibold text-dark">
                          Nationality <span className="text-danger">*</span>
                        </Form.Label>
                        <Select
                          options={nationalityList}
                          value={nationality}
                          onChange={(opt) => {
                            setNationality(opt);
                            if (opt) clearError("nationality");
                          }}
                          onInputChange={(val) => {
                            if (val && val.length >= 2) debouncedCountrySearch(val);
                          }}
                          isLoading={isNationalityLoading}
                          placeholder="Search Nationality"
                          isSearchable
                          isClearable
                          menuPortalTarget={document.body}
                          styles={{
                            ...customSelectStyles,
                            control: (base) => ({
                              ...customSelectStyles.control(base),
                              borderColor: validationErrors.nationality ? "#dc3545" : "#dee2e6",
                            }),
                            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                          }}
                        />
                        {validationErrors.nationality && (
                          <div className="text-danger small mt-1">{validationErrors.nationality}</div>
                        )}
                      </Col>
                    </Row>

                    {/* Row 2 — Pickup / Dropoff + Hours */}
                    <Row className="g-3 mb-3">
                      <Col md={5}>
                        <Form.Label className="fw-semibold text-dark">
                          Pickup <small className="text-muted fw-normal">(place / hotel / airport)</small>
                        </Form.Label>
                        <Select
                          options={locationGroups}
                          value={pickup}
                          onChange={(opt) => setPickup(opt)}
                          onInputChange={(input, { action }) => {
                            if (action !== "input-change") return;
                            clearTimeout(window.__schPickupDebounce);
                            window.__schPickupDebounce = setTimeout(() => fetchLocationLookup(input || ""), 300);
                          }}
                          filterOption={() => true}
                          formatOptionLabel={formatLocOption}
                          isLoading={isLocLoading}
                          placeholder="Search place / hotel / airport"
                          isSearchable
                          isClearable
                          menuPortalTarget={document.body}
                          styles={{
                            ...customSelectStyles,
                            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                            groupHeading: (base) => ({ ...base, fontWeight: 700, color: "#212529", textTransform: "uppercase", fontSize: "0.75rem" }),
                          }}
                          noOptionsMessage={({ inputValue }) => inputValue ? "No matches" : "Type to search…"}
                        />
                      </Col>
                      <Col md={5}>
                        <Form.Label className="fw-semibold text-dark">
                          Dropoff <small className="text-muted fw-normal">(place / hotel / airport)</small>
                        </Form.Label>
                        <Select
                          options={locationGroups}
                          value={dropoff}
                          onChange={(opt) => setDropoff(opt)}
                          onInputChange={(input, { action }) => {
                            if (action !== "input-change") return;
                            clearTimeout(window.__schDropoffDebounce);
                            window.__schDropoffDebounce = setTimeout(() => fetchLocationLookup(input || ""), 300);
                          }}
                          filterOption={() => true}
                          formatOptionLabel={formatLocOption}
                          isLoading={isLocLoading}
                          placeholder="Search place / hotel / airport"
                          isSearchable
                          isClearable
                          menuPortalTarget={document.body}
                          styles={{
                            ...customSelectStyles,
                            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                            groupHeading: (base) => ({ ...base, fontWeight: 700, color: "#212529", textTransform: "uppercase", fontSize: "0.75rem" }),
                          }}
                          noOptionsMessage={({ inputValue }) => inputValue ? "No matches" : "Type to search…"}
                        />
                      </Col>
                      <Col md={2}>
                        <Form.Label className="fw-semibold text-dark">
                          Hours <small className="text-muted fw-normal">(opt.)</small>
                        </Form.Label>
                        <Form.Select
                          style={{ height: "42px" }}
                          className="form-control-modern"
                          value={hoursFilter}
                          onChange={(e) => setHoursFilter(e.target.value)}
                        >
                          <option value="">Any</option>
                          <option value="4">4 hrs</option>
                          <option value="6">6 hrs</option>
                          <option value="8">8 hrs</option>
                          <option value="10">10 hrs</option>
                          <option value="12">12 hrs</option>
                          <option value="24">24 hrs</option>
                        </Form.Select>
                      </Col>
                    </Row>

                    {/* Row 3 — Date / Time / Pax */}
                    <Row className="g-3 mb-3">
                      <Col md={3}>
                        <Form.Label className="fw-semibold text-dark">
                          Pickup Date <span className="text-danger">*</span>
                        </Form.Label>
                        <Form.Control
                          style={{ height: "42px" }}
                          className="form-control-modern"
                          type="date"
                          value={pickupDate}
                          isInvalid={!!validationErrors.pickupDate}
                          min={new Date().toISOString().split("T")[0]}
                          onChange={(e) => {
                            setPickupDate(e.target.value);
                            if (e.target.value) clearError("pickupDate");
                          }}
                        />
                        <Form.Control.Feedback type="invalid">
                          {validationErrors.pickupDate}
                        </Form.Control.Feedback>
                      </Col>
                      <Col md={3}>
                        <Form.Label className="fw-semibold text-dark">
                          Pickup Time <span className="text-danger">*</span>
                        </Form.Label>
                        <Form.Control
                          style={{ height: "42px" }}
                          className="form-control-modern"
                          type="time"
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
                      <Col md={3}>
                        <Form.Label className="fw-semibold text-dark">Adults</Form.Label>
                        <Form.Select
                          style={{ height: "42px" }}
                          className="form-control-modern"
                          value={adults}
                          onChange={(e) => setAdults(parseInt(e.target.value) || 1)}
                        >
                          {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={n}>{n} Adult{n > 1 ? "s" : ""}</option>
                          ))}
                        </Form.Select>
                      </Col>
                      <Col md={3}>
                        <Form.Label className="fw-semibold text-dark">Children</Form.Label>
                        <Form.Select
                          style={{ height: "42px" }}
                          className="form-control-modern"
                          value={children}
                          onChange={(e) => setChildren(parseInt(e.target.value) || 0)}
                        >
                          {Array.from({ length: 6 }, (_, i) => i).map((n) => (
                            <option key={n} value={n}>{n} Child{n !== 1 ? "ren" : ""}</option>
                          ))}
                        </Form.Select>
                      </Col>
                    </Row>

                    {children > 0 && (
                      <Row className="g-3 mb-3">
                        <Col md={12}>
                          <Form.Label className="fw-semibold text-dark">Child Ages</Form.Label>
                          <div className="d-flex flex-wrap gap-2">
                            {childAges.map((age, index) => (
                              <Form.Control
                                key={index}
                                type="number"
                                min="0"
                                max="17"
                                placeholder="Age"
                                value={age}
                                className="form-control-modern"
                                style={{ width: "80px", height: "42px" }}
                                onChange={(e) => handleChildAgeChange(index, e.target.value)}
                              />
                            ))}
                          </div>
                        </Col>
                      </Row>
                    )}

                    <div className="d-flex justify-content-center mt-3">
                      <Button
                        variant="danger"
                        className="px-5 fw-bold"
                        style={{ height: "42px", fontSize: "0.95rem" }}
                        type="submit"
                        disabled={loading}
                      >
                        {loading ? (
                          <><Spinner animation="border" size="sm" className="me-2" />Searching...</>
                        ) : (
                          <><FaSearch className="me-2" />Search</>
                        )}
                      </Button>
                    </div>
                  </Form>
                </Card.Body>
              </Card>
                </div>
                {/* Ads carousel — only on first entry, before any search has run.
                    Re-opening the form via "Modify Search" keeps it hidden. */}
                {!hasSearched && (
                  <AdvertisementCarousel
                    cityId={city?.value}
                    cityName={city?.label}
                  />
                )}
              </div>
              )}

              {/* Results */}
              {loading && (
                <div className="text-center py-5">
                  <Spinner animation="border" />
                  <p className="text-muted mt-2">Finding chauffeur rentals…</p>
                </div>
              )}

              {!loading && hasSearched && results.length === 0 && (
                <Card className="border-0 shadow-sm">
                  <Card.Body className="text-center py-5 text-muted">
                    <FaCar className="display-4 text-secondary mb-3 opacity-50 d-block mx-auto" />
                    No rental cabs found for your search. Try a different city, package or cab type.
                  </Card.Body>
                </Card>
              )}

              {!hasSearched && !loading && (
                <div className="text-center text-muted mt-3 py-5 bg-white rounded-4 shadow-sm border-0">
                  <FaCar className="display-4 text-secondary mb-3 opacity-50" />
                  <h5>Ready to book a chauffeur?</h5>
                  <p>Select a city, package and cab type, then search.</p>
                </div>
              )}

              {!loading && results.length > 0 && (
                <Row className="g-3">
                  {/* ── LEFT: Filter panel ─────────────────────── */}
                  <Col lg={3} md={4}>

                    {/* Explore Map Box */}
                    <Card className="border-0 shadow-sm rounded-3 mb-3">
                      <Card.Body className="p-0" style={{ position: "relative" }}>
                        <img
                          src="/images/map.jpg"
                          alt="Map preview"
                          className="w-100 rounded-3"
                          style={{ height: "120px", objectFit: "cover", display: "block" }}
                        />
                        <Button
                          type="button"
                          className="btn-sm"
                          onClick={() => setShowMapModal(true)}
                          style={{
                            position: "absolute",
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%, -50%)",
                            backgroundColor: "rgba(0, 0, 0, 0.75)",
                            color: "white",
                            border: "none",
                            padding: "6px 12px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: "bold",
                            whiteSpace: "nowrap",
                          }}
                        >
                          EXPLORE ON MAP 📍
                        </Button>
                      </Card.Body>
                    </Card>

                    {/* Search by Chauffeur Name */}
                    <Card className="border-0 shadow-sm rounded-3 mb-3">
                      <Card.Header className="bg-white border-bottom fw-semibold d-flex justify-content-between align-items-center">
                        <span className="text-primary">Search by Chauffeur Name</span>
                        <span className="text-muted small">▾</span>
                      </Card.Header>
                      <Card.Body className="p-3">
                        <div className="d-flex gap-2">
                          <Form.Control
                            type="text"
                            size="sm"
                            placeholder="Search"
                            value={pendingNameFilter}
                            onChange={(e) => setPendingNameFilter(e.target.value)}
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


                    {/* Suppliers */}
                    <Card className="border-0 shadow-sm rounded-3 mb-3">
                      <Card.Header className="bg-white border-bottom fw-semibold d-flex justify-content-between align-items-center">
                        <span className="text-primary">Suppliers</span>
                        <span className="text-muted small">▾</span>
                      </Card.Header>
                      <Card.Body className="p-3">
                        {supplierNames.length === 0 ? (
                          <div className="text-muted small">No suppliers in results.</div>
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
                                    : prev.filter((x) => x !== s)
                                );
                              }}
                            />
                          ))
                        )}
                      </Card.Body>
                    </Card>

                    {/* Transfer Type */}
                    <Card className="border-0 shadow-sm rounded-3 mb-3">
                      <Card.Header className="bg-white border-bottom fw-semibold d-flex justify-content-between align-items-center">
                        <span className="text-primary">Transfer Type</span>
                        <span className="text-muted small">▾</span>
                      </Card.Header>
                      <Card.Body className="p-3">
                        <Form.Check
                          type="radio"
                          id="scheffer-filter-all"
                          name="schefferTransferType"
                          label="All"
                          className="small"
                          checked={transferType === "All"}
                          onChange={() => { setTransferType("All"); setCurrentPage(1); }}
                        />
                        <Form.Check
                          type="radio"
                          id="scheffer-filter-shared"
                          name="schefferTransferType"
                          label="Shared (SIC)"
                          className="small"
                          checked={transferType === "Shared"}
                          onChange={() => { setTransferType("Shared"); setCurrentPage(1); }}
                        />
                        <Form.Check
                          type="radio"
                          id="scheffer-filter-private"
                          name="schefferTransferType"
                          label="Private"
                          className="small"
                          checked={transferType === "Private"}
                          onChange={() => { setTransferType("Private"); setCurrentPage(1); }}
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
                        <span className="text-muted small me-1">Sort By:</span>
                        <Button
                          size="sm"
                          variant={sortBy === "price_asc" ? "primary" : "light"}
                          className="px-3"
                          onClick={() => { setSortBy("price_asc"); setCurrentPage(1); }}
                        >
                          ↑ Price: Low to High
                        </Button>
                        <Button
                          size="sm"
                          variant={sortBy === "price_desc" ? "primary" : "light"}
                          className="px-3"
                          onClick={() => { setSortBy("price_desc"); setCurrentPage(1); }}
                        >
                          ↓ Price: High to Low
                        </Button>
                      </Card.Body>
                    </Card>

                    {/* Page count + pagination top */}
                    <div className="d-flex justify-content-between align-items-center mb-2 small text-muted">
                      <div>
                        Page {safePage} of {totalPages} ({filteredResults.length} records)
                      </div>
                      {totalPages > 1 && renderPagination()}
                    </div>

                    {filteredResults.length === 0 ? (
                      <div className="text-center text-muted py-5 bg-white rounded-3 border">
                        No chauffeurs match your filters.
                      </div>
                    ) : (
                      <Row className="g-3">
                        {pageRows.map((card, idx) => {
                          const price =
                            card.basePriceWithMarkup != null
                              ? card.basePriceWithMarkup
                              : card.basePrice;
                          const isSIC = String(card.types || "").toUpperCase() === "SIC";
                          return (
                            <Col xs={12} key={`${card.rentalRateId}-${card.packageId}-${idx}`}>
                              <Card className="border-0 shadow-sm rounded-3 overflow-hidden">
                                <Card.Header className="bg-light py-2 px-3 fw-semibold text-dark">
                                  {card.cabName || "Chauffeur Vehicle"}
                                </Card.Header>
                                <Card.Body className="p-3">
                                  <Row className="align-items-center g-3">
                                    {/* Image */}
                                    <Col xs={12} md={3}>
                                      <div style={{ width: "100%", height: "120px", overflow: "hidden", borderRadius: "8px" }}>
                                        <LazyImage src={card.cabPic} alt={card.cabName} />
                                      </div>
                                    </Col>

                                    {/* Details */}
                                    <Col xs={12} md={6}>
                                      {/* Transfer Type */}
                                      <div className="small mb-1">
                                        <span className="text-muted">Transfer Type: </span>
                                        <span className={`fw-medium ${isSIC ? "text-primary" : "text-success"}`}>
                                          {isSIC ? "Shared (SIC)" : "Private Transfer"}
                                        </span>
                                      </div>
                                      {/* Vehicle */}
                                      <div className="small mb-1">
                                        <span className="text-muted">Vehicle: </span>
                                        <span className="text-dark">{card.cabName || "—"}</span>
                                      </div>
                                      {/* Hours & KM */}
                                      <div className="small mb-1 d-flex flex-wrap gap-3">
                                        <span>
                                          <span className="text-muted">Hours Included: </span>
                                          <span className="text-dark">{card.hoursIncluded ?? "—"}</span>
                                        </span>
                                        <span>
                                          <span className="text-muted">KM Included: </span>
                                          <span className="text-dark">{card.kmIncluded ?? "—"}</span>
                                        </span>
                                      </div>
                                      {/* Package */}
                                      {card.packageName && (
                                        <div className="small mb-1">
                                          <span className="text-muted">Package: </span>
                                          <span className="text-dark">{card.packageName}</span>
                                        </div>
                                      )}
                                      {/* Max Luggage Capacity with robust fallbacks */}
                                      {(() => {
                                        const luggageVal = card.maxLuggageCapacity ?? card.maxLuggage ?? card.vehicleMaxLuggage ?? card.luggageCapacity ?? card.luggage;
                                        if (luggageVal != null && luggageVal !== "") {
                                          return (
                                            <div className="small mb-1">
                                              <span className="text-muted">Max Luggage: </span>
                                              <span className="text-dark fw-medium">{luggageVal} bag{Number(luggageVal) !== 1 ? "s" : ""}</span>
                                            </div>
                                          );
                                        }
                                        return null;
                                      })()}
                                      {/* City */}
                                      {card.cityName && (
                                        <div className="small mb-1 text-muted">{card.cityName}</div>
                                      )}
                                      {/* Supplier */}
                                      {card.cabProviderName && (
                                        <div className="small text-muted">
                                          by {card.cabProviderName}
                                        </div>
                                      )}
                                    </Col>

                                    {/* Price + action */}
                                    <Col xs={12} md={3} className="text-md-end">
                                      <div className="text-success small fw-semibold mb-1">Available</div>
                                      <div className="fw-bold fs-5 mb-1">
                                        AED {Number(price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </div>
                                      {card.hoursIncluded && (
                                        <div className="small text-muted mb-2">
                                          for {card.hoursIncluded} hr{card.hoursIncluded !== 1 ? "s" : ""}
                                        </div>
                                      )}
                                      <div className="d-flex gap-2 justify-content-md-end">
                                        <Button
                                          variant="outline-primary"
                                          className="px-3 fw-semibold d-inline-flex align-items-center gap-1"
                                          onClick={() => handleViewCab(card)}
                                        >
                                          <FaEye size={14} />
                                          View
                                        </Button>
                                        <Button
                                          variant="danger"
                                          className="px-4 fw-semibold"
                                          onClick={() => handleBookNow(card)}
                                        >
                                          Book Now
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

                    {/* Pagination bottom */}
                    {totalPages > 1 && (
                      <div className="d-flex justify-content-end mt-3">
                        {renderPagination()}
                      </div>
                    )}
                  </Col>
                </Row>
              )}
            </Card.Body>
          </Card>
        </main>
      </div>
      <Modal
        show={showCabDetailModal}
        onHide={() => setShowCabDetailModal(false)}
        size="xl"
        centered
        scrollable
      >
        <Modal.Header closeButton>
          <Modal.Title className="fw-bold" style={{ fontSize: "1.05rem" }}>
            Chauffeur / Cab Details
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ backgroundColor: "#f8fafc" }}>
          {!selectedCabResult ? (
            <div className="text-center text-muted py-4">No cab selected.</div>
          ) : (
            <>
              <Row className="g-3 mb-3">
                <Col md={4}>
                  <div className="bg-white border rounded-3 p-2 h-100">
                    <div style={{ height: "220px", overflow: "hidden", borderRadius: "8px" }}>
                      <LazyImage
                        src={selectedCabImage}
                        alt={
                          selectedCabConfig?.name ||
                          selectedCabResult?.cabName ||
                          "Chauffeur Vehicle"
                        }
                      />
                    </div>
                  </div>
                </Col>
                <Col md={8}>
                  <div className="bg-white border rounded-3 p-3 h-100">
                    <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-2">
                      <div>
                        <h5 className="mb-1">
                          {selectedCabConfig?.name ||
                            selectedCabConfig?.cabName ||
                            selectedCabResult?.cabName ||
                            "Chauffeur Vehicle"}
                        </h5>
                        <div className="text-muted small">
                          {selectedCabResult?.cabProviderName || "Supplier not available"}
                        </div>
                      </div>
                      <Badge bg="success">Available</Badge>
                    </div>
                    {cabDetailLoading && (
                      <div className="small text-muted mb-2">
                        <Spinner animation="border" size="sm" className="me-2" />
                        Loading complete cab configuration...
                      </div>
                    )}
                    <Row className="g-2">
                      <DetailItem label="Cab Code" value={selectedCabConfig?.cabCode} />
                      <DetailItem
                        label="Cab Type"
                        value={selectedCabConfig?.cabType || selectedCabResult?.cabType}
                      />
                      <DetailItem
                        label="Country"
                        value={
                          selectedCabConfig?.countryName ||
                          selectedCabConfig?.countryid ||
                          selectedCabConfig?.countryId
                        }
                      />
                      <DetailItem
                        label="State / Place"
                        value={
                          selectedCabConfig?.placeName ||
                          selectedCabConfig?.stateName ||
                          selectedCabConfig?.place ||
                          selectedCabConfig?.placeid ||
                          selectedCabConfig?.placeId ||
                          selectedCabResult?.cityName
                        }
                      />
                      <DetailItem
                        label="Max Capacity"
                        value={
                          selectedCabConfig?.maxCapacity ??
                          selectedCabResult?.maxCapacity ??
                          selectedCabResult?.vehicleMaxCapacity
                        }
                      />
                      <DetailItem
                        label="Max Luggage"
                        value={
                          selectedCabConfig?.maxLuggageCapacity ??
                          selectedCabResult?.maxLuggageCapacity ??
                          selectedCabResult?.maxLuggage ??
                          selectedCabResult?.vehicleMaxLuggage ??
                          selectedCabResult?.luggageCapacity ??
                          selectedCabResult?.luggage
                        }
                      />
                    </Row>
                  </div>
                </Col>
              </Row>

              <div className="bg-white border rounded-3 p-3 mb-3">
                <div className="fw-bold mb-2">Search & Rate Details</div>
                <Row className="g-2">
                  <DetailItem label="City" value={selectedCabResult?.cityName} />
                  <DetailItem label="Package" value={selectedCabResult?.packageName} />
                  <DetailItem
                    label="Transfer Type"
                    value={
                      String(selectedCabResult?.types || "").toUpperCase() === "SIC"
                        ? "Shared (SIC)"
                        : selectedCabResult?.types
                        ? "Private Transfer"
                        : "-"
                    }
                  />
                  <DetailItem label="Hours Included" value={selectedCabResult?.hoursIncluded} />
                  <DetailItem label="KM Included" value={selectedCabResult?.kmIncluded} />
                  <DetailItem
                    label="Base Price"
                    value={money(selectedCabResult?.basePrice)}
                  />
                  <DetailItem
                    label="Selling Price"
                    value={money(
                      selectedCabResult?.basePriceWithMarkup ??
                        selectedCabResult?.basePrice,
                    )}
                  />
                  <DetailItem label="Rental Rate ID" value={selectedRateId} />
                </Row>
              </div>

              <Row className="g-3 mb-3">
                <Col md={6}>
                  <div className="bg-white border rounded-3 p-3 h-100">
                    <div className="fw-bold mb-2">Cancellation Policies</div>
                    <PolicyList
                      rows={selectedRateCancellationPolicies}
                      emptyText={
                        selectedRateId
                          ? "No cancellation policy configured for this rate."
                          : "Rate details are not available for this cab."
                      }
                    />
                  </div>
                </Col>
                <Col md={6}>
                  <div className="bg-white border rounded-3 p-3 h-100">
                    <div className="fw-bold mb-2">Terms &amp; Conditions</div>
                    <PolicyList
                      rows={selectedRateTerms}
                      emptyText={
                        selectedRateId
                          ? "No terms and conditions configured for this rate."
                          : "Rate details are not available for this cab."
                      }
                    />
                  </div>
                </Col>
              </Row>

              <div className="bg-white border rounded-3 p-3 mb-3">
                <div className="fw-bold mb-2">Zone Details</div>
                {!selectedCabZoneDetails ? (
                  <div className="text-muted small">No zone details configured for this cab.</div>
                ) : (
                  <Row className="g-3">
                    <Col md={6}>
                      <div className="border rounded-3 p-2 h-100">
                        <div className="text-muted small fw-semibold mb-1">Pickup Locations</div>
                        {selectedZonePickupLocations.length > 0 ? (
                          <ol className="mb-0 ps-3">
                            {selectedZonePickupLocations.map((loc, index) => (
                              <li key={loc.id || `${loc.locationId}-${index}`} className="small mb-1">
                                {formatZoneLocation(loc)}
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <div className="text-muted small">No pickup locations configured.</div>
                        )}
                      </div>
                    </Col>
                    <Col md={6}>
                      <div className="border rounded-3 p-2 h-100">
                        <div className="text-muted small fw-semibold mb-1">Dropoff Locations</div>
                        {selectedZoneDropoffLocations.length > 0 ? (
                          <ol className="mb-0 ps-3">
                            {selectedZoneDropoffLocations.map((loc, index) => (
                              <li key={loc.id || `${loc.locationId}-${index}`} className="small mb-1">
                                {formatZoneLocation(loc)}
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <div className="text-muted small">No dropoff locations configured.</div>
                        )}
                      </div>
                    </Col>
                  </Row>
                )}
              </div>

              {selectedCabLocations.length > 0 && (
                <div className="bg-white border rounded-3 p-3 mb-3">
                  <div className="fw-bold mb-2">Configured Pickup / Dropoff Locations</div>
                  <div className="table-responsive">
                    <table className="table table-sm mb-0">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Pickup</th>
                          <th>Dropoff</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedCabLocations.map((loc, index) => (
                          <tr key={loc.cablocationId || loc.id || index}>
                            <td>{index + 1}</td>
                            <td>{loc.pickup || loc.pickupName || "-"}</td>
                            <td>{loc.dropOff || loc.dropoff || loc.dropoffName || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {additionalCabDetails.length > 0 && (
                <div className="bg-white border rounded-3 p-3">
                  <div className="fw-bold mb-2">Additional Cab Configuration</div>
                  <Row className="g-2">
                    {additionalCabDetails.map(([key, value]) => (
                      <DetailItem
                        key={key}
                        label={key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}
                        value={value}
                      />
                    ))}
                  </Row>
                </div>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowCabDetailModal(false)}>
            Close
          </Button>
          {selectedCabResult && (
            <Button
              variant="danger"
              onClick={() => {
                const card = selectedCabResult;
                setShowCabDetailModal(false);
                handleBookNow(card);
              }}
            >
              Book Now
            </Button>
          )}
        </Modal.Footer>
      </Modal>
      {showMapModal && (
        <MapModal
          show={showMapModal}
          onHide={() => setShowMapModal(false)}
          markers={mapMarkers}
          title="Explore Chauffeurs on Map"
        />
      )}
    </div>
  );
};

export default SchefferDriverSearch;
