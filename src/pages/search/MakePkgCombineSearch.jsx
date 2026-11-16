import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import {
  Card,
  Row,
  Col,
  Form,
  Button,
  Spinner,
  Pagination,
  Badge,
  Modal,
  Accordion,
  Table,
  OverlayTrigger,
  Tooltip,
} from "react-bootstrap";
import Select from "react-select";
import {
  FaSearch,
  FaHotel,
  FaCar,
  FaTicketAlt,
  FaStar,
  FaBuilding,
  FaGlobe,
  FaSort,
  FaEye,
  FaBed,
  FaUtensils,
  FaInfoCircle,
  FaShieldAlt,
  FaChevronDown,
  FaMapMarkerAlt,
  FaConciergeBell,
} from "react-icons/fa";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import {
  SingleAddOnService,
  ADDON_SERVICES_CATALOG,
  ADDON_SERVICES_STORAGE_KEY,
  readAddOnServices,
} from "../../components/AddOnServicesPanel";
import AgentBalanceDisplay from "../../components/AgentBalanceDisplay";
import { useLocation, useNavigate } from "react-router-dom";
import axiosInstance from "../../components/AxiosInstance";
import { SUPPLIER_SEARCH_TIMEOUT_MS } from "../../config/apiTimeouts";
import { toast } from "react-hot-toast";
import "../../styles/RoomList.css";
import { isAgentLogin } from "../../utils/supplierDisplay";
import RefundBadge from "../../components/RefundBadge";

// ─────────────────────────────────────────────
// Search Progress Bar (same as HotelSearch)
// ─────────────────────────────────────────────
function SearchProgressBar({ isLoading, pollStatus }) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isLoading || pollStatus === "IN_PROGRESS") {
      setVisible(true);
      setProgress((prev) => Math.min(85, prev + 15));
    } else if (pollStatus === "COMPLETED" || !isLoading) {
      setProgress(100);
      const timer = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 900);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
      setProgress(0);
    }
  }, [isLoading, pollStatus]);

  if (!visible) return null;

  return (
    <div className="search-progress-bar-wrap mb-3">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <span className="search-progress-label">Searching hotels...</span>
        <span className="search-progress-percent">{Math.round(progress)}%</span>
      </div>
      <div className="search-progress-track">
        <div
          className="search-progress-fill"
          style={{ width: `${progress}%`, transition: "width 0.6s ease" }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Skeleton Hotel Card
// ─────────────────────────────────────────────
function SkeletonHotelCard() {
  return (
    <Col xs={12}>
      <div
        style={{
          backgroundColor: "white",
          border: "1px solid #dee2e6",
          borderRadius: "12px",
          overflow: "hidden",
        }}
      >
        <Row className="g-0">
          <Col md={4} lg={3}>
            <div
              className="skeleton w-100"
              style={{ minHeight: "180px", borderRadius: "0" }}
            />
          </Col>
          <Col md={8} lg={9}>
            <div className="p-3">
              <div
                className="skeleton mb-2"
                style={{ height: "18px", width: "65%", borderRadius: "4px" }}
              />
              <div
                className="skeleton mb-2"
                style={{ height: "13px", width: "45%", borderRadius: "4px" }}
              />
              <div
                className="skeleton mb-3"
                style={{ height: "13px", width: "30%", borderRadius: "4px" }}
              />
              <div style={{ borderTop: "1px solid #eee", paddingTop: "10px" }}>
                <div
                  className="skeleton"
                  style={{ height: "13px", width: "20%", borderRadius: "4px" }}
                />
              </div>
            </div>
          </Col>
        </Row>
      </div>
    </Col>
  );
}

// ─────────────────────────────────────────────
// Lazy Image
// ─────────────────────────────────────────────
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

  const buildSrcSet = (url) => {
    try {
      const safeUrl = url || "https://via.placeholder.com/480x270";
      const pattern = /\/(\d+)\/(\d+)$/;
      const small = pattern.test(safeUrl)
        ? safeUrl.replace(pattern, "/320/180")
        : `${safeUrl}?w=320&h=180`;
      const medium = pattern.test(safeUrl)
        ? safeUrl.replace(pattern, "/480/270")
        : `${safeUrl}?w=480&h=270`;
      const large = pattern.test(safeUrl)
        ? safeUrl.replace(pattern, "/640/360")
        : `${safeUrl}?w=640&h=360`;
      return `${small} 320w, ${medium} 480w, ${large} 640w`;
    } catch {
      return undefined;
    }
  };

  const imageSrc = src || "https://via.placeholder.com/480x270";

  return (
    <div
      ref={containerRef}
      className={`ratio ratio-16x9 rounded-top overflow-hidden ${className || ""}`}
      style={{ height: "100%" }}
    >
      {!loaded && <div className="skeleton w-100 h-100" />}
      {inView && (
        <img
          src={imageSrc}
          srcSet={buildSrcSet(imageSrc)}
          sizes="(min-width:1200px) 33vw, (min-width:768px) 50vw, 100vw"
          loading="lazy"
          decoding="async"
          fetchpriority="low"
          alt={alt}
          onLoad={() => setLoaded(true)}
          className={`img-cover ${loaded ? "img-loaded" : "img-loading"}`}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Sample / demo cab data (UI testing only)
// ─────────────────────────────────────────────
// Used by the "Load Sample Cabs" button on the Transfer step — only
// kicks in when the operator explicitly clicks it, so real searches are
// untouched. The shape matches what /api/makeYourOwnPackageV2/getTransfer
// Inhouse returns after frontend mapping, so the cab-list UI and the
// existing handleAddTransferToCart payload builder both work without
// any further changes. cabid values are prefixed `demo-` so they're
// easy to spot in the Redis cart / DB if a tester accidentally proceeds.
const SAMPLE_TRANSFER_RESULTS = [
  {
    cabid: "demo-sedan-001",
    cabname: "Toyota Camry (Sedan)",
    cabdetails: "Comfortable 4-seater sedan — A/C, luggage space for 2 large bags.",
    cabpic: "https://b2b.choosenfly.com/assets/details/profilepic/hotel/cab-sedan.jpg",
    noOfCabs: 1,
    searchCabDetailsDTO: [
      {
        types: "PRIVATE",
        location: "Airport",
        dropOff: "Hotel",
        privateRate: 180,
        sicRate: 0,
        totalRate: 180,
        totalRateWithoutMrk: 165,
        travelType: "1",
        dropDetails: "1",
        paxDetails: "3",
        locationId: "1",
        hourDetails: "0",
        luggage: "true",
      },
      {
        types: "SIC",
        location: "Airport",
        dropOff: "Hotel",
        privateRate: 0,
        sicRate: 75,
        totalRate: 75,
        totalRateWithoutMrk: 65,
        travelType: "1",
        dropDetails: "2",
        paxDetails: "3",
        locationId: "1",
        hourDetails: "0",
        luggage: "true",
      },
    ],
  },
  {
    cabid: "demo-suv-002",
    cabname: "Toyota Land Cruiser (SUV)",
    cabdetails: "Premium 6-seater SUV — A/C, leather seats, ample luggage.",
    cabpic: "https://b2b.choosenfly.com/assets/details/profilepic/hotel/cab-suv.jpg",
    noOfCabs: 1,
    searchCabDetailsDTO: [
      {
        types: "PRIVATE",
        location: "Airport",
        dropOff: "Hotel",
        privateRate: 350,
        sicRate: 0,
        totalRate: 350,
        totalRateWithoutMrk: 320,
        travelType: "1",
        dropDetails: "1",
        paxDetails: "5",
        locationId: "1",
        hourDetails: "0",
        luggage: "true",
      },
    ],
  },
  {
    cabid: "demo-van-003",
    cabname: "Toyota Hiace (Van)",
    cabdetails: "Spacious 12-seater van — A/C, perfect for families / groups.",
    cabpic: "https://b2b.choosenfly.com/assets/details/profilepic/hotel/cab-van.jpg",
    noOfCabs: 1,
    searchCabDetailsDTO: [
      {
        types: "PRIVATE",
        location: "Airport",
        dropOff: "Hotel",
        privateRate: 450,
        sicRate: 0,
        totalRate: 450,
        totalRateWithoutMrk: 410,
        travelType: "1",
        dropDetails: "1",
        paxDetails: "11",
        locationId: "1",
        hourDetails: "0",
        luggage: "true",
      },
      {
        types: "SIC",
        location: "Airport",
        dropOff: "Hotel",
        privateRate: 0,
        sicRate: 60,
        totalRate: 60,
        totalRateWithoutMrk: 50,
        travelType: "1",
        dropDetails: "2",
        paxDetails: "11",
        locationId: "1",
        hourDetails: "0",
        luggage: "true",
      },
    ],
  },
];

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────
// v2 prefetch — MakeUrOwnPackageV2 kicks off hotel/transfer/activity
// searches in the background right after the criteria form is submitted
// and stashes the mapped results in sessionStorage. We pick them up on
// mount here so the operator only searches once. Each per-tab Search
// button stays as a manual fallback.
const PREFETCH_KEYS = {
  criteria: "makePkgV2PrefetchCriteriaKey",
  status: "makePkgV2PrefetchStatus",
  hotel: "makePkgV2PrefetchHotel",
  transfer: "makePkgV2PrefetchTransfer",
  tour: "makePkgV2PrefetchTour",
};

const computeCriteriaKey = (c) => {
  try {
    return JSON.stringify({
      travelDate: c?.travelDate || "",
      agentId: c?.agent || "",
      natId: c?.nationality?.value ?? "",
      natCode: c?.nationality?.code ?? "",
      dests: (c?.itinerary || []).map((it) => ({
        v: it?.selectedDestination?.value ?? "",
        n: it?.nights || 1,
      })),
      adults: c?.adults || 1,
      children: c?.children || 0,
      childAges: c?.childAges || [],
    });
  } catch {
    return "";
  }
};

// v2 helpers — read the service gates + visa-required choice from the
// add-ons-first page. Kept inline so the legacy component isn't touched.
const readV2Services = () => {
  try {
    const raw = sessionStorage.getItem("makePkgV2Services");
    if (!raw) return { hotel: true, transfer: true, tour: true };
    return { hotel: true, transfer: true, tour: true, ...JSON.parse(raw) };
  } catch {
    return { hotel: true, transfer: true, tour: true };
  }
};
const readV2VisaRequired = () => {
  try {
    return sessionStorage.getItem("makePkgV2VisaRequired") === "YES" ? "YES" : "NO";
  } catch {
    return "NO";
  }
};

export default function MakePkgCombineSearchV2() {
  const v2VisaRequired = readV2VisaRequired();

  // ── Service gates + add-on flags ─────────────────────────────────
  // Both are component state so the new Step 0 (Select Services) can
  // flip them on/off and the wizard re-derives its step list. Mirrored
  // to the same sessionStorage keys the rest of the flow (booking page,
  // TopBar, AddOnServicesPanel) already reads from — payload / save
  // behaviour stays identical.
  const [v2Services, setV2Services] = useState(() => {
    const s = readV2Services();
    return { ...s, hotel: true };
  });
  const [addonFlags, setAddonFlags] = useState(() => {
    const all = readAddOnServices();
    const out = {};
    ADDON_SERVICES_CATALOG.forEach((svc) => {
      out[svc.key] = !!all[svc.key]?.enabled;
    });
    return out;
  });

  // Persist gate flags whenever the operator flips one (booking page
  // reads `makePkgV2Services` on save). Hotel stays mandatory ON.
  useEffect(() => {
    try {
      sessionStorage.setItem(
        "makePkgV2Services",
        JSON.stringify({ ...v2Services, hotel: true })
      );
    } catch {
      /* private mode / quota — non-fatal */
    }
  }, [v2Services]);

  // Flip an optional gate (transfer / tour). Hotel is mandatory and the
  // toggle is locked in the UI, but guard here too.
  const toggleServiceGate = useCallback((gateKey, value) => {
    if (gateKey === "hotel") return;
    setV2Services((prev) => ({ ...prev, [gateKey]: !!value, hotel: true }));
  }, []);

  // Flip an add-on service. Mirrors the change into the canonical
  // `mypkg_addon_services` blob that <SingleAddOnService/>, the booking
  // page, and the side panels all read — so the per-service detail step
  // picks up the gate the operator just set without re-prompting.
  const toggleAddonService = useCallback((addonKey, value) => {
    setAddonFlags((prev) => ({ ...prev, [addonKey]: !!value }));
    try {
      const all = readAddOnServices();
      const svc = ADDON_SERVICES_CATALOG.find((s) => s.key === addonKey);
      const blank = svc
        ? (() => {
            const f = {};
            (svc.fields || []).forEach((x) => { f[x.name] = ""; });
            return f;
          })()
        : {};
      all[addonKey] = { ...blank, ...(all[addonKey] || {}), enabled: !!value };
      sessionStorage.setItem(ADDON_SERVICES_STORAGE_KEY, JSON.stringify(all));
    } catch {
      /* ignore */
    }
  }, []);

  // Wizard steps — Step 0 is the new "Select Services" picker; every
  // following step is gated by the corresponding flag, so disabled
  // services never get a detail page and never trigger validation.
  // Order: selection → addons (catalogue order) → hotel → cab → tours.
  // Hotel must come before Cab and Activities because the existing
  // hasHotelInCart gate disables the "Add to cart" buttons on Cab and
  // Activity rows until a hotel is in the cart — so the operator needs
  // to land on the Hotel step first.
  const wizardSteps = useMemo(() => {
    const steps = [
      {
        key: "service-select",
        label: "Select Services",
        Icon: FaConciergeBell,
        type: "select",
      },
      ...ADDON_SERVICES_CATALOG
        .filter((svc) => addonFlags[svc.key])
        .map((svc) => ({
          key: `addon-${svc.key}`,
          label: svc.label,
          Icon: FaConciergeBell,
          type: "addon",
          serviceKey: svc.key,
        })),
    ];
    if (v2Services.hotel) {
      steps.push({ key: "accommodation", label: "Hotel", Icon: FaHotel, type: "search" });
    }
    if (v2Services.transfer) {
      steps.push({ key: "transfer", label: "Transfer", Icon: FaCar, type: "search" });
    }
    if (v2Services.tour) {
      steps.push({ key: "tours", label: "Activities", Icon: FaTicketAlt, type: "search" });
    }
    return steps;
  }, [v2Services, addonFlags]);
  const location = useLocation();
  // Pull search criteria from location.state first; fall back to the
  // sessionStorage snapshot written by MakeUrOwnPackageV2 / addons page
  // so destination + nationality survive a refresh of the search page.
  // Without this the hotel search payload would ship empty cityId /
  // countryId / nationalityId / nationalityCode after any page reload.
  const searchCriteria = (() => {
    if (location.state && Object.keys(location.state).length > 0) {
      return location.state;
    }
    try {
      const raw = sessionStorage.getItem("makePkgV2Criteria");
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return {};
  })();
  const {
    travelDate,
    agent,
    nationality,
    destination,
    itinerary,
    adults,
    children,
    childAges: initialChildAges = [],
    nights,
  } = searchCriteria || {};
const [activeAccordion, setActiveAccordion] = useState({});
  const [checkIn, setCheckIn] = useState(travelDate || "");
  const [checkOut, setCheckOut] = useState("");
  const [nightsCount, setNightsCount] = useState(nights || 1);
  const [adultCount, setAdultCount] = useState(adults || 1);
  const [childCount, setChildCount] = useState(children || 0);
  const [itineraryData] = useState(itinerary || []);
  const [destinationLabel] = useState(
    itinerary && itinerary.length > 0
      ? itinerary.map(item => item.selectedDestination?.label).filter(Boolean).join(" , ")
      : destination?.label || ""
  );
  const [agentId, setAgentId] = useState(agent || "");
  // v2: wizard step index — 0 = the new "Select Services" picker.
  const [currentStepIdx, setCurrentStepIdx] = useState(0);

  // If the operator went Back and disabled a service whose detail step
  // was at the current index, clamp so we don't render a missing step.
  useEffect(() => {
    if (currentStepIdx >= wizardSteps.length) {
      setCurrentStepIdx(Math.max(0, wizardSteps.length - 1));
    }
  }, [wizardSteps.length, currentStepIdx]);

  // <SingleAddOnService/> can flip an addon's gate from inside its own
  // step (the Yes/No radio writes to mypkg_addon_services). Re-pull the
  // canonical gates on every navigation tick so the Step 0 toggles and
  // the wizardSteps memo stay in sync with what was just clicked.
  useEffect(() => {
    const all = readAddOnServices();
    setAddonFlags((prev) => {
      let changed = false;
      const next = { ...prev };
      ADDON_SERVICES_CATALOG.forEach((svc) => {
        const enabled = !!all[svc.key]?.enabled;
        if (next[svc.key] !== enabled) {
          next[svc.key] = enabled;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [currentStepIdx]);
  const [isProceeding, setIsProceeding] = useState(false);
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [rooms, setRooms] = useState([
    {
      adults: adults || 1,
      children: children || 0,
      childAges: initialChildAges || [],
    },
  ]);
  const [childAges, setChildAges] = useState(initialChildAges || []);
  const [allResults, setAllResults] = useState([]);
  const [hasSearchResult, setHasSearchResult] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize] = useState(10);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [pollStatus, setPollStatus] = useState("IDLE");
  const [completedChannels, setCompletedChannels] = useState(new Set());
  const [searchId, setSearchId] = useState(null);
  const resultsRef = useRef(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [sortBy, setSortBy] = useState("priceAsc");

  // ── FIXED: starRating is now single-select (null | option) ──
  const [starRating, setStarRating] = useState(null);
  const [hotelType, setHotelType] = useState([]);
  const [channelType, setChannelType] = useState([]);
  const [isInitialResultsLoaded, setIsInitialResultsLoaded] = useState(false);
  const [hotelSearchTerm, setHotelSearchTerm] = useState("");
  const [errors, setErrors] = useState({});
  const [clickedHotelIds, setClickedHotelIds] = useState([]);

  // Inline Room View State
  const [hotelRooms, setHotelRooms] = useState({});
  const [expandedHotels, setExpandedHotels] = useState({});
  const [loadingRooms, setLoadingRooms] = useState({});
  const navigate = useNavigate();

  // Transfer search state
  const [transferResults, setTransferResults] = useState([]);
  const [transferLoading, setTransferLoading] = useState(false);
  const [hasTransferSearched, setHasTransferSearched] = useState(false);
  const [transferAdults, setTransferAdults] = useState(adults || 1);
  const [transferChildren, setTransferChildren] = useState(children || 0);
  const [transferChildAges, setTransferChildAges] = useState(initialChildAges || []);
  const [transferPickupDate, setTransferPickupDate] = useState(travelDate || "");
  const [transferDropoffDate, setTransferDropoffDate] = useState("");

  // ── Cab lookup (pickup / dropoff zones) ──
  // Single set of selections applied to every cab added in this session.
  // Persisted to sessionStorage so the booking page can stamp them onto
  // each cab DTO before sending the booking save payload.
  const [cabLookupOptions, setCabLookupOptions] = useState([]);
  const [cabLookupLoading, setCabLookupLoading] = useState(false);
  const [transferPickupZone, setTransferPickupZone] = useState(() => {
    try {
      const raw = sessionStorage.getItem("makePkgV2TransferPickup");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [transferDropoffZone, setTransferDropoffZone] = useState(() => {
    try {
      const raw = sessionStorage.getItem("makePkgV2TransferDropoff");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [transferZoneErrors, setTransferZoneErrors] = useState({
    pickup: "",
    dropoff: "",
  });

  // Tours and Activities search state
  const [tourResults, setTourResults] = useState([]);
  const [tourLoading, setTourLoading] = useState(false);
  const [hasTourSearched, setHasTourSearched] = useState(false);
  const [tourAdults, setTourAdults] = useState(adults || 1);
  const [tourChildren, setTourChildren] = useState(children || 0);
  const [tourChildAges, setTourChildAges] = useState(initialChildAges || []);
  const [tourDate, setTourDate] = useState(travelDate || "");
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [addingActivityId, setAddingActivityId] = useState(null);
  const [addingTransferId, setAddingTransferId] = useState(null);
  // In v2, the "must add a hotel first" gate is lifted when the booking
  // doesn't include a hotel (services.hotel === false). We achieve that
  // by initialising the flag to true in that case; the existing
  // Redis-refresh logic still runs and just overwrites it harmlessly.
  const [hasHotelInCart, setHasHotelInCart] = useState(!v2Services.hotel);

  const checkHotelInCart = useCallback(async () => {
    const currentAgentId =
      sessionStorage.getItem("makeYourOwnPackageAgentId") ||
      localStorage.getItem("makeYourOwnPackageAgentId") ||
      agent ||
      agentId ||
      "";

    if (!currentAgentId) {
      // v2: when this booking doesn't include a hotel, the gate stays open.
      setHasHotelInCart(!v2Services.hotel);
      return;
    }

    try {
      const response = await axiosInstance.post(
        `/api/makeYourOwnPackageV2/cart/fetch?userId=${encodeURIComponent(
          currentAgentId
        )}`
      );
      if (Array.isArray(response.data)) {
        const hotelExists = response.data.some((item) => !!item.hotel);
        // v2: if the booking doesn't include a hotel, the gate is always open.
        setHasHotelInCart(hotelExists || !v2Services.hotel);
      } else {
        // v2: when this booking doesn't include a hotel, the gate stays open.
      setHasHotelInCart(!v2Services.hotel);
      }
    } catch (err) {
      console.error("Error checking hotel in cart:", err);
      // v2: when this booking doesn't include a hotel, the gate stays open.
      setHasHotelInCart(!v2Services.hotel);
    }
  }, [agent, agentId]);

  useEffect(() => {
    checkHotelInCart();
    window.addEventListener("cartUpdated", checkHotelInCart);
    return () => {
      window.removeEventListener("cartUpdated", checkHotelInCart);
    };
  }, [checkHotelInCart]);

  // Hydrate from the v2 prefetch (started on the criteria form page) so
  // the operator doesn't have to hit Search a second time on each tab.
  // We compare a hash of the criteria so stale results from a previous
  // submit are ignored; if the prefetch is still in flight we poll every
  // 300 ms (up to 60 s) and the per-tab Search buttons stay available
  // as a manual fallback.
  useEffect(() => {
    const storedKey = sessionStorage.getItem(PREFETCH_KEYS.criteria);
    if (!storedKey) return;
    const currentKey = computeCriteriaKey(searchCriteria);
    if (storedKey !== currentKey) return;

    const done = { hotel: false, transfer: false, tour: false };

    const tryHydrate = () => {
      if (!done.hotel && v2Services.hotel) {
        try {
          const raw = sessionStorage.getItem(PREFETCH_KEYS.hotel);
          if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
              setAllResults(arr);
              setTotalElements(arr.length);
              setTotalPages(Math.max(1, Math.ceil(arr.length / pageSize)));
              setHasSearchResult(true);
              setIsInitialResultsLoaded(true);
              setPollStatus("COMPLETED");
              setHasSearched(true);
              setSearchId(null);
              done.hotel = true;
            }
          }
        } catch {
          /* ignore */
        }
      }
      if (!done.transfer && v2Services.transfer) {
        try {
          const raw = sessionStorage.getItem(PREFETCH_KEYS.transfer);
          if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
              setTransferResults(arr);
              setHasTransferSearched(true);
              done.transfer = true;
            }
          }
        } catch {
          /* ignore */
        }
      }
      if (!done.tour && v2Services.tour) {
        try {
          const raw = sessionStorage.getItem(PREFETCH_KEYS.tour);
          if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
              setTourResults(arr);
              setHasTourSearched(true);
              done.tour = true;
            }
          }
        } catch {
          /* ignore */
        }
      }
    };

    tryHydrate();

    const isPending = () =>
      (v2Services.hotel && !done.hotel) ||
      (v2Services.transfer && !done.transfer) ||
      (v2Services.tour && !done.tour);

    const readStatuses = () => {
      try {
        return JSON.parse(sessionStorage.getItem(PREFETCH_KEYS.status) || "{}");
      } catch {
        return {};
      }
    };

    const allTerminal = () => {
      const s = readStatuses();
      return ["hotel", "transfer", "tour"].every((k) => {
        if (!v2Services[k]) return true;
        if (done[k]) return true;
        return s[k] === "error";
      });
    };

    if (!isPending() || allTerminal()) return;

    const startedAt = Date.now();
    const interval = setInterval(() => {
      tryHydrate();
      if (!isPending() || allTerminal() || Date.now() - startedAt > 60_000) {
        clearInterval(interval);
      }
    }, 300);
    return () => clearInterval(interval);
  }, [pageSize]);

  const formatDateToDDMMYYYY = (dateString) => {
    if (!dateString) return "";
    const parsedDate = new Date(dateString);
    if (Number.isNaN(parsedDate.getTime())) return "";
    const day = String(parsedDate.getDate()).padStart(2, "0");
    const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
    const year = parsedDate.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Filter options
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

  const channelTypeOptions = [
    { value: "inhouse", label: "Inhouse" },
    // { value: "iwtx", label: "Iwtx" },
    // { value: "x3", label: "x3" },
    // { value: "ratehawk", label: "Ratehawk" },
    // { value: "darina", label: "Darina" },
  ];

  useEffect(() => {
    if (checkIn && nightsCount) {
      const inDate = new Date(checkIn);
      const outDate = new Date(inDate);
      outDate.setDate(inDate.getDate() + parseInt(nightsCount));
      setCheckOut(outDate.toISOString().split("T")[0]);
    }
  }, [checkIn, nightsCount]);

  useEffect(() => {
    if (agentId) {
      sessionStorage.setItem("makeYourOwnPackageAgentId", agentId);
      localStorage.setItem("makeYourOwnPackageAgentId", agentId);
    }
  }, [agentId]);

  useEffect(() => {
    if (travelDate) {
      sessionStorage.setItem("makePkgTravelDate", travelDate);
    }
  }, [travelDate]);

  // Fetch the cab pickup / dropoff lookup once when the Transfer step
  // becomes active. Filtered to the destination the operator selected
  // on the criteria form so only places under that destination (zones,
  // hotels, airports) are shown. We dedupe by checking if options are
  // already loaded.
  useEffect(() => {
    const isTransferStep =
      wizardSteps[currentStepIdx]?.key === "transfer";
    if (!isTransferStep) return;
    if (cabLookupOptions.length > 0 || cabLookupLoading) return;

    const destinationIds = (Array.isArray(itinerary) ? itinerary : [])
      .map((it) => it?.selectedDestination?.value)
      .filter((v) => v !== undefined && v !== null && v !== "");
    const primaryDestinationId =
      destinationIds[0] ?? destination?.value ?? "";

    if (!primaryDestinationId) {
      // No destination selected on the criteria form → nothing to filter on.
      return;
    }

    let cancelled = false;
    setCabLookupLoading(true);
    axiosInstance
      .get(
        `/api/cab-search/lookup-by-destination?destinationId=${encodeURIComponent(
          primaryDestinationId
        )}&destinationIds=${encodeURIComponent(destinationIds.join(","))}&search=&limit=20`
      )
      .then((res) => {
        if (cancelled) return;
        const data = res?.data || {};
        const groups = [
          { label: "Zones", items: Array.isArray(data.zones) ? data.zones : [] },
          { label: "Hotels", items: Array.isArray(data.hotels) ? data.hotels : [] },
          { label: "Airports", items: Array.isArray(data.airports) ? data.airports : [] },
        ];
        const grouped = groups
          .filter((g) => g.items.length > 0)
          .map((g) => ({
            label: g.label,
            options: g.items.map((it) => ({
              value: `${it.source}-${it.id}`,
              label: it.name,
              subtitle: it.subtitle,
              raw: it,
            })),
          }));
        setCabLookupOptions(grouped);
      })
      .catch((err) => {
        console.error("Failed to load cab lookup:", err);
        toast.error("Failed to load pickup/dropoff options.");
      })
      .finally(() => {
        if (!cancelled) setCabLookupLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentStepIdx]);

  // Persist selections so the booking page can stamp them onto cab DTOs.
  useEffect(() => {
    if (transferPickupZone) {
      sessionStorage.setItem(
        "makePkgV2TransferPickup",
        JSON.stringify(transferPickupZone)
      );
    } else {
      sessionStorage.removeItem("makePkgV2TransferPickup");
    }
  }, [transferPickupZone]);

  useEffect(() => {
    if (transferDropoffZone) {
      sessionStorage.setItem(
        "makePkgV2TransferDropoff",
        JSON.stringify(transferDropoffZone)
      );
    } else {
      sessionStorage.removeItem("makePkgV2TransferDropoff");
    }
  }, [transferDropoffZone]);

  useEffect(() => {
    if (transferChildren > 0) {
      setTransferChildAges((prevAges) => {
        const currentAges = [...prevAges];
        if (initialChildAges && initialChildAges.length === transferChildren) {
          return [...initialChildAges];
        }
        while (currentAges.length < transferChildren) {
          currentAges.push(
            initialChildAges && currentAges.length < initialChildAges.length
              ? initialChildAges[currentAges.length]
              : 5
          );
        }
        if (currentAges.length > transferChildren) {
          currentAges.splice(transferChildren);
        }
        return currentAges;
      });
    } else {
      setTransferChildAges([]);
    }
  }, [transferChildren, initialChildAges]);

  useEffect(() => {
    if (adults || children) {
      const initialRooms = [
        {
          adults: adults || 1,
          children: children || 0,
          childAges: initialChildAges || [],
        },
      ];
      setRooms(initialRooms);
      if (initialChildAges && initialChildAges.length > 0) {
        setChildAges(initialChildAges);
      }
    }
  }, [adults, children, initialChildAges]);

  useEffect(() => {
    if (tourChildren > 0) {
      setTourChildAges((prevAges) => {
        const currentAges = [...prevAges];
        if (initialChildAges && initialChildAges.length === tourChildren) {
          return [...initialChildAges];
        }
        while (currentAges.length < tourChildren) {
          currentAges.push(
            initialChildAges && currentAges.length < initialChildAges.length
              ? initialChildAges[currentAges.length]
              : 5
          );
        }
        if (currentAges.length > tourChildren) {
          currentAges.splice(tourChildren);
        }
        return currentAges;
      });
    } else {
      setTourChildAges([]);
    }
  }, [tourChildren, initialChildAges]);

  const handleChildAgeChange = (index, value) => {
    const updatedAges = [...childAges];
    updatedAges[index] = value;
    setChildAges(updatedAges);
  };

  const fetchHotels = async (page, sid, agtId) => {
    try {
      const params = {
        agentId: agtId || agent || 1,
        page,
        pageSize,
        sortBy:
          sortBy === "priceAsc" || sortBy === "priceDesc" ? "baseRate" : sortBy,
        sortOrder:
          sortBy === "priceAsc" || sortBy === "ratingAsc" || sortBy === "nameAsc"
            ? "asc"
            : "desc",
        // ── FIXED: single-select star ──
        starRating: starRating ? starRating.value : undefined,
        apiType:
          channelType.map((c) => c.value.toUpperCase()).join(",") || undefined,
      };

      const res = await axiosInstance.get(`/hotel-search/results/${sid}`, { params });

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
            badge: hotel.baseRate ? "Rate Available" : "Rate Unavailable",
            image:
              hotel.hotelImage ||
              "https://b2b.choosenfly.com/assets/details/profilepic/hotel/hoteldefault.jpg",
            rating: hotel.starRating || 0,
            hotelType: "hotel",
            channelType: hotel.apiType?.toLowerCase() || "inhouse",
          }))
        : [];

      setAllResults(mappedResults);
      setTotalElements(Number(res.data.totalResults) || mappedResults.length);
      setTotalPages(
        Math.max(
          1,
          Math.ceil(
            (Number(res.data.totalResults) || mappedResults.length) / pageSize
          )
        )
      );
      setHasSearchResult(true);
      return res.data;
    } catch (err) {
      console.error("Fetch hotels failed:", err);
      setPollStatus("ERROR");
      throw err;
    }
  };

  // Filtered results — FIXED: starRating is now single null | option
  const filteredResults = useMemo(() => {
    let results = allResults;

    if (hotelSearchTerm && hotelSearchTerm.trim()) {
      const searchTerm = hotelSearchTerm.trim().toLowerCase();
      results = results.filter((hotel) => {
        const hotelName = (hotel.name || hotel.hotelName || "").trim().toLowerCase();
        return hotelName.includes(searchTerm);
      });
    }

    // ── FIXED: single-select check ──
    if (starRating) {
      results = results.filter(
        (hotel) => Number(hotel.rating) === Number(starRating.value)
      );
    }

    if (hotelType.length > 0) {
      const selectedTypes = hotelType.map((t) => t.value);
      results = results.filter((hotel) => selectedTypes.includes(hotel.hotelType));
    }

    if (channelType.length > 0) {
      const selectedChannels = channelType.map((c) => c.value);
      results = results.filter((hotel) => selectedChannels.includes(hotel.channelType));
    }

    return results;
  }, [allResults, hotelSearchTerm, starRating, hotelType, channelType]);

  const effectiveTotalPages = useMemo(() => Math.max(1, totalPages), [totalPages]);

  const pageNumbers = useMemo(() => {
    const maxPagesToShow = 5;
    const currentPage = pageIndex + 1;
    const start = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    const end = Math.min(totalPages, start + maxPagesToShow - 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [pageIndex, totalPages]);

  const goToPage = (page) => {
    if (page >= 0 && page < totalPages) {
      setPageIndex(page);
      setTimeout(() => {
        if (resultsRef.current) {
          resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 0);
    }
  };

  useEffect(() => {
    if (!searchId || !hasSearched) return;
    setIsLoading(true);
    fetchHotels(pageIndex, searchId, agent).finally(() => setIsLoading(false));
  }, [pageIndex, sortBy, starRating, channelType, searchId, agent, hasSearched]);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .animate-fadeIn { animation: fadeIn 0.5s ease-in; }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  const handleHotelSearchSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    setIsLoading(true);
    setHasSearched(true);
    setHasSearchResult(false);
    setAllResults([]);
    setPollStatus("IDLE");
    setPageIndex(0);
    setTotalElements(0);
    setTotalPages(1);
    setCompletedChannels(new Set());

    try {
      // Fall back to itinerary[0] if `destination` somehow ended up null
      // (e.g. came back from cart with a partially-populated state). This
      // keeps the hotel-search payload populated.
      const dest =
        destination ||
        (itinerary && itinerary.length > 0
          ? itinerary[0]?.selectedDestination
          : null) ||
        {};

      const nationalityId = nationality?.value != null
        ? String(nationality.value)
        : "";
      const nationalityCode = nationality?.code || "";
      const destinationCityId = dest?.value != null ? String(dest.value) : "";
      const destinationCountryId =
        dest?.countryId != null ? String(dest.countryId) : "";

      const destinationCityIds =
        itinerary && itinerary.length > 0
          ? itinerary
              .map((item) => item.selectedDestination?.value)
              .filter((id) => id != null && id !== "")
              .map(String)
          : destinationCityId
            ? [destinationCityId]
            : [];

      const noOfRooms = String(rooms.length);

      const roomConfigurations = rooms.map((room, index) => ({
        roomNo: index + 1,
        adultCount: String(room.adults || 1),
        childCount: String(room.children || 0),
        childAges:
          room.childAges && room.childAges.length > 0
            ? room.childAges.map((age) => parseInt(age) || 0)
            : room.children > 0
            ? Array(room.children).fill(0)
            : [0],
        adultAges: room.adultAges?.length ? room.adultAges : [25],
      }));

      const agentIdFinal = agentId || agent || 1;

      const searchPayloadReq = {
        nationalityId,
        nationalityCode,
        destinationCityId,
        destinationCityIds,
        destinationCountryId,
        checkIn,
        checkOut,
        noOfRooms,
        roomConfigurations,
        agentId: agentIdFinal,
        apiType: ["INHOUSE"],
      };

      const searchRes = await axiosInstance.post(
        "/api/makeYourOwnPackageV2/hotel/search",
        searchPayloadReq
      );

      const ensureHttpImage = (imageUrl) => {
        if (!imageUrl) {
          return "https://b2b.choosenfly.com/assets/details/profilepic/hotel/hoteldefault.jpg";
        }
        if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
        if (typeof imageUrl === "string") {
          const fileName = imageUrl.split(/[/\\]/).pop();
          if (fileName) {
            return `https://b2b.choosenfly.com/assets/details/profilepic/hotel/${fileName}`;
          }
        }
        return "https://b2b.choosenfly.com/assets/details/profilepic/hotel/hoteldefault.jpg";
      };

      const responseData = Array.isArray(searchRes.data) ? searchRes.data : [];

      const mappedResults = responseData.map((hotel, index) => ({
        id: hotel.hotelCode ? `local-${hotel.hotelCode}` : `local-h${index + 1}`,
        searchId: "local",
        hotelCode: hotel.hotelCode || null,
        name: hotel.hotelName || "Unknown Hotel",
        address: hotel.hotelAddress || "",
        city: hotel.hotelAddress
          ? hotel.hotelAddress.split(", ").pop() || "Unknown City"
          : "Unknown City",
        price: hotel.baseRate ?? null,
        badge: hotel.baseRate ? "Rate Available" : "Rate Unavailable",
        image: ensureHttpImage(hotel.hotelImage),
        rating: hotel.starRating || 0,
        hotelType: "hotel",
        channelType: hotel.apiType?.toLowerCase() || "inhouse",
      }));

      setAllResults(mappedResults);
      setTotalElements(mappedResults.length);
      setTotalPages(Math.max(1, Math.ceil(mappedResults.length / pageSize)));
      setHasSearchResult(true);
      setIsInitialResultsLoaded(true);
      setPollStatus("COMPLETED");
      setSearchId(null);
    } catch (err) {
      console.error("Search failed:", err);
      setHasSearched(false);
      setPollStatus("ERROR");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePageChange = async (page) => {
    if (page < 0 || page >= totalPages) return;
    setPageIndex(page);
    setIsLoading(true);
    try {
      await fetchHotels(page, searchId, agentId);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTransferChildAgeChange = (index, value) => {
    const updatedAges = [...transferChildAges];
    updatedAges[index] = parseInt(value) || 5;
    setTransferChildAges(updatedAges);
  };

  const handleTourChildAgeChange = (index, value) => {
    const updatedAges = [...tourChildAges];
    updatedAges[index] = parseInt(value) || 5;
    setTourChildAges(updatedAges);
  };

  const handleTourSearchSubmit = async (e) => {
    e.preventDefault();
    setTourLoading(true);
    setHasTourSearched(true);
    setTourResults([]);

    try {
      const formatDate = (dateString) => {
        if (!dateString) return "";
        const date = new Date(dateString);
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
      };

      const activityPayload = {
        activityDate: formatDate(tourDate || travelDate || checkIn),
        nativeCountryId: nationality?.value ? String(nationality.value) : "",
        destinationCountryId: destination?.countryId || "",
        destinationCityId: destination?.value || "",
        destinationCityIds: itinerary && itinerary.length > 0
          ? itinerary.map(item => String(item.selectedDestination?.value)).filter(id => id && id !== "undefined")
          : [String(destination?.value)].filter(id => id && id !== "undefined"),
        searchCorCtype: destination?.type || "State",
        agentId: String(agentId || agent || 1),
        childAge:
          tourChildAges && tourChildAges.length > 0
            ? tourChildAges.map((age) => String(parseInt(age) || 0))
            : tourChildren > 0
            ? Array(tourChildren).fill("0")
            : [],
        adult: String(tourAdults || adults || 1),
        child: String(tourChildren || children || 0),
      };

      const response = await axiosInstance.post(
        "/api/makeYourOwnPackageV2/getActivityInhouse",
        activityPayload
      );

      const mappedResults = Array.isArray(response.data)
        ? response.data.map((activity, index) => ({
            id: activity.activityId || `activity-${index}`,
            activityName: activity.activityname || "",
            activityDetails: activity.activityDetails || "",
            starRating: activity.starRating || 0,
            totalRate: activity.totalRate || activity.activityRate || 0,
            totalRateWithoutMrk: activity.totalRateWithoutmrk || activity.activityRate || 0,
            activityImage:
              activity.activityImage ||
              "https://via.placeholder.com/400x225?text=Activity",
            childMax: activity.childMax || 0,
            childMin: activity.childMin || 0,
            adultRate: activity.adultRate || 0,
            childRate: activity.childRate || 0,
            activityType: activity.activityType || 1,
            maxPax: activity.maxPax || 0,
            minPaxsic: activity.minPaxsic || 0,
            currency: activity.currencyCode || "AED",
            duration:
              activity.viatorActivityDurationFrom && activity.viatorActivityDurationTo
                ? `${activity.viatorActivityDurationFrom} - ${activity.viatorActivityDurationTo}`
                : null,
            apiType: activity.apiType || null,
            viatorProductCode: activity.viatorProductCode || null,
          }))
        : [];

      setTourResults(mappedResults);
    } catch (err) {
      console.error("Activity search failed:", err);
      setTourResults([]);
    } finally {
      setTourLoading(false);
    }
  };

  const handleViewRooms = async (hotel) => {
    setExpandedHotels((prev) => ({ ...prev, [hotel.id]: !prev[hotel.id] }));
    if (expandedHotels[hotel.id]) return;
    if (hotelRooms[hotel.id]) return;

    setLoadingRooms((prev) => ({ ...prev, [hotel.id]: true }));

    const nationalityCode =
      (nationality?.code || "").length === 2 ? nationality.code : " ";
    const agentIdToUse = agentId || agent || 1;

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
    };

    const apiId = apiIdMapping[hotel.channelType?.toLowerCase()] || 0;

    const payload = {
      checkInDate: checkIn,
      checkOutDate: checkOut,
      hotelCode: hotel.hotelCode || hotel.id?.split("-").slice(1).join("-") || "",
      nationality: nationalityCode,
      agentId: String(agentIdToUse),
      apiId,
      rooms: roomsPayload,
    };

    const meta = {
      hotelName: hotel.name,
      address: hotel.address || hotel.city,
      starRating: hotel.rating || 0,
      phone: "",
      hotelImage: hotel.image,
    };

    try {
      const res = await axiosInstance.post("/api/hotel-rooms/search", payload, { timeout: SUPPLIER_SEARCH_TIMEOUT_MS });

      if (!res.data || res.data.success === false) {
        toast.error(res.data?.message || "Failed to fetch rooms.");
        setLoadingRooms((prev) => ({ ...prev, [hotel.id]: false }));
        return;
      }

      const enriched = {
        ...res.data,
        hotels: (res.data.hotels || []).map((h) => ({
          ...h,
          roomCategories: (h.roomCategories || []).map((c) => ({
            ...c,
            availableRates: (c.availableRates || [])
              .slice()
              .sort((a, b) => (a.totalRate || 0) - (b.totalRate || 0)),
          })),
        })),
        meta: meta || {},
        payload,
      };

      setHotelRooms((prev) => ({ ...prev, [hotel.id]: enriched }));
    } catch (err) {
      console.error("Room search failed:", err);
      toast.error("Failed to fetch rooms. Please try again.");
    } finally {
      setLoadingRooms((prev) => ({ ...prev, [hotel.id]: false }));
    }
  };

  const handleAddToCart = async (hotelId, rate) => {
    const roomData = hotelRooms[hotelId];
    if (!roomData) return;

    const { payload, hotels } = roomData;
    const hotelsdetail = hotels[0];

    console.log("hotels rate::", rate);

    try {
      const searchRoomDTOs = (payload.rooms || []).map((room) => ({
        roomCount: 1,
        adult: String(room.adults || room.adult || 1),
        child: String(room.children || room.child || 0),
        childAge: Array.isArray(room.childAges)
          ? room.childAges.map((age) => Number(age))
          : Array.isArray(room.childAge)
          ? room.childAge.map((age) => Number(age))
          : [],
      }));

      const available = rate.roomStatus === "Available" ? "True" : "False";
      const refundstatus =
        rate.nonRefundable === true ||
        rate.nonRefundable === "true" ||
        String(rate.nonRefundable).toLowerCase() === "true"
          ? "N"
          : "Y";

      const cancellationPolicyList = Array.isArray(hotelsdetail.cancellationPolicies)
        ? hotelsdetail.cancellationPolicies.map((policy) =>
            typeof policy === "string"
              ? policy
              : policy.policyText || policy.text || JSON.stringify(policy)
          )
        : [];

      const cartItem = {
        hotelId: String(hotelsdetail.hotelId || ""),
        hotelName: hotelsdetail.hotelName || "",
        address: hotelsdetail.hotelAddress || "",
        starRating: Number(hotelsdetail.starRating) || 0,
        roomtypeId: String(rate.roomTypeCode || rate.roomtypeId || ""),
        roomcategory: rate.roomCategory || "",
        roomCategory: rate.roomCategory || "",
        roomType: rate.mealPlan || "",
        available,
        api: Number(payload.apiId || payload.api || 0),
        destinationCityId: String(payload.destinationCityId || payload.cityId || ""),
        destinationCountryId: String(payload.destinationCountryId || payload.countryId || ""),
        checkIn: payload.checkInDate || payload.checkIn || "",
        checkOut: payload.checkOutDate || payload.checkOut || "",
        nativeContryId: Number(hotelsdetail.nationalityId) || null,
        nationality: String(payload.nationality || ""),
        noOfRoom: String(hotelsdetail.numberOfRooms || payload.noOfRoom || "1"),
        refundstatus,
        refundTerms: rate.refundTerms,
        searchRoomDTOs,
        agentId: String(payload.agentId || ""),
        totalRate: Number(rate.totalRate) || 0,
        totalRateWithoutmrk: Number(rate.rateBeforeTax || rate.totalRate) || 0,
        cancellationPolicy: cancellationPolicyList,
      };

      const response = await axiosInstance.post(
        "/api/makeYourOwnPackageV2/cart/addHotel",
        cartItem
      );
      // v2 endpoint returns { status: "SUCCESS", cartItemId, type }.
      if (
        response.data?.status === "SUCCESS" ||
        response.data === "1" ||
        response.data === 1
      ) {
        toast.success("Room added to cart successfully!");
        window.dispatchEvent(new CustomEvent("cartUpdated"));
      } else {
        toast.error(response.data?.message || "Failed to add item to cart");
      }
    } catch (err) {
      console.error("Error adding to cart:", err);
      toast.error("Failed to add item to cart. Please try again.");
    }
  };

  const getMealPlanIcon = (mealPlan) => {
    if (!mealPlan) return <FaUtensils className="text-primary" />;
    switch (mealPlan.toLowerCase()) {
      case "room only":
        return <FaBed className="text-muted" />;
      case "breakfast":
        return <FaUtensils className="text-warning" />;
      case "full board":
        return <FaUtensils className="text-success" />;
      default:
        return <FaUtensils className="text-primary" />;
    }
  };

  const getRoomStatusBadge = (roomStatus) => {
    switch (roomStatus) {
      case "On Request":
        return (
          <small>
            This room can be booked{" "}
            <span className="bg-warning text-dark px-2 py-0 rounded">On Request</span>
          </small>
        );
      case "Available":
        return (
          <small>
            This room is{" "}
            <span className="bg-success text-white px-3 py-0 rounded">Available</span>
          </small>
        );
      default:
        return <Badge bg="secondary">{roomStatus}</Badge>;
    }
  };

  const formatPrice = (price) =>
    new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED" }).format(price);

  const handleAddActivityToCart = async (activity) => {
    if (!activity) return;

    const agentValue = String(agentId || agent || 1);
    const activityDateValue =
      formatDateToDDMMYYYY(tourDate) ||
      formatDateToDDMMYYYY(travelDate) ||
      formatDateToDDMMYYYY(checkIn);

    if (!activityDateValue) {
      toast.error("Select a valid activity date before adding to cart.");
      return;
    }
    if (!nationality?.value) {
      toast.error("Select a nationality before adding to cart.");
      return;
    }

    const payload = {
      activityDate: activityDateValue,
      nativeCountryId: String(nationality.value),
      childAge:
        Array.isArray(tourChildAges) && tourChildAges.length > 0
          ? tourChildAges.map((age) => String(age))
          : [],
      adult: String(tourAdults || 1),
      child: String(tourChildren || 0),
      activityId: String(activity.id || activity.activityId || ""),
      activityName: activity.activityName || "",
      agentId: agentValue,
      totalRate: activity.totalRate || 0,
      totalRateWithoutmrk: activity.totalRateWithoutMrk || 0,
    };

    if (!payload.activityId) {
      toast.error("Unable to determine the activity identifier.");
      return;
    }

    setAddingActivityId(activity.id || activity.activityId);

    try {
      const response = await axiosInstance.post(
        "/api/makeYourOwnPackageV2/cart/addActivity",
        payload
      );
      // v2 add-to-cart returns { status: "SUCCESS", cartItemId, type }.
      // Accept either the v2 shape or the legacy "1" string so this code
      // works for both flows if the endpoint is ever swapped.
      if (
        response.data?.status === "SUCCESS" ||
        response.data === "1" ||
        response.data === 1
      ) {
        toast.success("Activity added to cart successfully.");
        window.dispatchEvent(new Event("cartUpdated"));
      } else {
        throw new Error("Unexpected response");
      }
    } catch (error) {
      console.error("Failed to add activity to cart:", error);
      toast.error("Failed to add activity to cart. Please try again.");
    } finally {
      setAddingActivityId(null);
    }
  };

  const renderStars = (rating) =>
    Array.from({ length: Math.floor(rating || 0) }, (_, i) => (
      <FaStar key={i} className="text-warning" size={14} />
    ));

  const handleTransferSearchSubmit = async (e) => {
    e.preventDefault();
    setTransferLoading(true);
    setHasTransferSearched(true);
    setTransferResults([]);

    try {
      const transferPayload = {
        checkIn: transferPickupDate || travelDate || checkIn,
        checkOut: transferDropoffDate || checkOut,
        nativeCountryId: nationality?.value ? Number(nationality.value) : null,
        destinationCountryId: destination?.countryId || "",
        destinationCityId: destination?.value || "",
        destinationCityIds: itinerary && itinerary.length > 0
          ? itinerary.map(item => String(item.selectedDestination?.value)).filter(id => id && id !== "undefined")
          : [String(destination?.value)].filter(id => id && id !== "undefined"),
        searchCorCtype: "city",
        agentid: String(agentId || agent || 1),
        childAge:
          transferChildAges && transferChildAges.length > 0
            ? transferChildAges.map((age) => parseInt(age) || 0)
            : transferChildren > 0
            ? Array(transferChildren).fill(0)
            : [],
        adult: transferAdults || adults || 1,
        child: transferChildren || children || 0,
      };

      const response = await axiosInstance.post(
        "/api/makeYourOwnPackageV2/getTransferInhouse",
        transferPayload
      );

      const ensureHttpImage = (imageUrl) => {
        if (!imageUrl) return "https://via.placeholder.com/400x225?text=Transfer";
        if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
        if (typeof imageUrl === "string") {
          const fileName = imageUrl.split(/[/\\]/).pop();
          if (fileName)
            return `https://b2b.choosenfly.com/assets/details/profilepic/hotel/${fileName}`;
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
            searchCabDetailsDTO: Array.isArray(cab.searchCabDetailsDTO)
              ? cab.searchCabDetailsDTO
              : [],
          }))
        : [];

      setTransferResults(mappedResults);
    } catch (err) {
      console.error("Transfer search failed:", err);
      setTransferResults([]);
    } finally {
      setTransferLoading(false);
    }
  };

  const handleAddTransferToCart = async (cab, cabDetail) => {
    if (!cab || !cabDetail) return;

    const agentValue = String(agentId || agent || 1);
    const pickupDateValue = formatDateToDDMMYYYY(transferPickupDate || travelDate || checkIn);
    const dropoffDateValue = formatDateToDDMMYYYY(transferDropoffDate || checkOut);

    if (!pickupDateValue) {
      toast.error("Select a valid pickup date before adding to cart.");
      return;
    }
    if (!nationality?.value) {
      toast.error("Select a nationality before adding to cart.");
      return;
    }
    if (!transferPickupZone || !transferDropoffZone) {
      setTransferZoneErrors({
        pickup: transferPickupZone ? "" : "Please select a pickup location.",
        dropoff: transferDropoffZone ? "" : "Please select a dropoff location.",
      });
      toast.error("Please select both pickup and dropoff before adding to cart.");
      return;
    }

    const rate =
      cabDetail.types === "SIC" ? cabDetail.sicRate || 0 : cabDetail.privateRate || 0;
    const totalRateWithoutMrk =
      cabDetail.totalRateWithoutMrk !== undefined &&
      cabDetail.totalRateWithoutMrk !== null &&
      cabDetail.totalRateWithoutMrk !== 0
        ? cabDetail.totalRateWithoutMrk
        : rate;
    const totalRate =
      cabDetail.totalRate !== undefined &&
      cabDetail.totalRate !== null &&
      cabDetail.totalRate !== 0
        ? cabDetail.totalRate
        : totalRateWithoutMrk;

    const pickupZoneRaw = transferPickupZone?.raw || null;
    const dropoffZoneRaw = transferDropoffZone?.raw || null;

    const payload = {
      pickupDate: pickupDateValue,
      dropoffDate: dropoffDateValue || pickupDateValue,
      nativeCountryId: String(nationality.value),
      pickupZone: pickupZoneRaw,
      dropoffZone: dropoffZoneRaw,
      pickupSource: pickupZoneRaw?.source || null,
      pickupId: pickupZoneRaw?.id ?? null,
      pickupName: pickupZoneRaw?.name || null,
      dropoffSource: dropoffZoneRaw?.source || null,
      dropoffId: dropoffZoneRaw?.id ?? null,
      dropoffName: dropoffZoneRaw?.name || null,
      childAge:
        Array.isArray(transferChildAges) && transferChildAges.length > 0
          ? transferChildAges.map((age) => parseInt(age) || 0)
          : [],
      adult: parseInt(transferAdults || adults || 1),
      child: parseInt(transferChildren || children || 0),
      cabId: String(cab.cabid || ""),
      noOfCabs: parseInt(cab.noOfCabs || 1),
      travelType: String(cabDetail.travelType || "1"),
      timeDetails: cabDetail.hourDetails ? String(cabDetail.hourDetails) : "0",
      dropDetails: String(cabDetail.dropDetails || "1"),
      locationId: String(cabDetail.locationId || ""),
      paxDetails: String(cabDetail.paxDetails || "1"),
      luggage: cabDetail.luggage !== undefined ? String(cabDetail.luggage) : "true",
      cabName: cab.cabname || "",
      agentId: parseInt(agentValue) || 1,
      totalRate: totalRate || 0,
      totalRateWithoutmrk: totalRateWithoutMrk || 0,
    };

    if (!payload.cabId) {
      toast.error("Unable to determine the transfer identifier.");
      return;
    }

    setAddingTransferId(
      `${cab.cabid}-${cabDetail.dropDetails}-${cabDetail.paxDetails}-${cabDetail.types}`
    );

    try {
      const response = await axiosInstance.post(
        "/api/makeYourOwnPackageV2/cart/addCab",
        payload
      );
      // v2 endpoint returns { status: "SUCCESS", cartItemId, type }.
      if (
        response.data?.status === "SUCCESS" ||
        response.data === "1" ||
        response.data === 1
      ) {
        toast.success("Transfer added to cart successfully.");
        window.dispatchEvent(new Event("cartUpdated"));
      } else {
        throw new Error("Unexpected response");
      }
    } catch (error) {
      console.error("Failed to add transfer to cart:", error);
      toast.error("Failed to add transfer to cart. Please try again.");
    } finally {
      setAddingTransferId(null);
    }
  };

  // ── Helper: clear all hotel filters ──
  const clearAllFilters = () => {
    setStarRating(null);
    setHotelType([]);
    setChannelType([]);
    setSortBy("priceAsc");
    setHotelSearchTerm("");
  };

  const hasActiveFilters =
    hotelSearchTerm || starRating || hotelType.length > 0 || channelType.length > 0;

  const startEntry = totalElements === 0 ? 0 : pageIndex * pageSize + 1;
  const endEntry = Math.min((pageIndex + 1) * pageSize, totalElements);

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <div className="d-flex justify-content-end mb-2">
            <AgentBalanceDisplay agentId={agentId} />
          </div>

          {/* "Booking includes" summary + "Change services" link removed:
              the wizard step indicator already shows the included
              services, and the /addons page is no longer part of the
              flow — services default to all-enabled and add-on
              selection happens as the last wizard step. */}

          <Card className="shadow-sm rounded-xl mb-4">
            <Card.Body>
              <div className="mb-4">
                <h4 className="fw-bold mb-3 d-flex align-items-center">
                  <i className="bi bi-folder2-open me-2 text-primary"></i> Make your own package
                </h4>
                <div 
                  className="d-flex flex-wrap align-items-center bg-light rounded-3 p-1 border shadow-sm"
                  style={{ gap: "2px" }}
                >
                  {itineraryData.length > 0 ? (
                    itineraryData.map((item, idx) => (
                      <React.Fragment key={idx}>
                        <div 
                          className="px-3 py-2 text-dark bg-white rounded-2 d-flex align-items-center border-end"
                          style={{ fontSize: "0.8rem", fontWeight: "500", minWidth: "fit-content" }}
                        >
                          <FaMapMarkerAlt className="text-primary me-2" style={{ fontSize: "0.75rem" }} />
                          {item.selectedDestination?.label?.split(",")[0] || "Destination"}
                          <span className="ms-2 text-muted small">({item.nights}N)</span>
                        </div>
                      </React.Fragment>
                    ))
                  ) : (
                    <div 
                      className="px-3 py-2 text-dark bg-white rounded-2 border"
                      style={{ fontSize: "0.85rem", fontWeight: "500" }}
                    >
                      {destinationLabel}
                    </div>
                  )}
                </div>
              </div>

              {/* ═══════════════════════════════════════
                  WIZARD STEP INDICATOR — compact progress bar
                  (too many steps to fit numbered circles)
              ═══════════════════════════════════════ */}
              {(() => {
                const total = wizardSteps.length;
                const idx = currentStepIdx;
                const pct = total <= 1 ? 100 : Math.round(((idx + 1) / total) * 100);
                const currentStep = wizardSteps[idx];
                const nextStep = wizardSteps[idx + 1];
                const CurrentIcon = currentStep?.Icon;
                return (
                  <div className="mb-4">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <div className="d-flex align-items-center gap-2">
                        {CurrentIcon && (
                          <span
                            style={{
                              width: 36, height: 36,
                              borderRadius: "50%",
                              background: "#6366f1",
                              color: "#fff",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <CurrentIcon />
                          </span>
                        )}
                        <div>
                          <div className="small text-muted text-uppercase" style={{ letterSpacing: "0.05em", fontSize: "0.7rem" }}>
                            Step {idx + 1} of {total}
                          </div>
                          <div className="fw-bold" style={{ fontSize: "1rem" }}>
                            {currentStep?.label}
                          </div>
                        </div>
                      </div>
                      <div className="text-end">
                        <div className="small text-muted" style={{ fontSize: "0.7rem" }}>
                          {nextStep ? "Up next" : "Final step"}
                        </div>
                        <div className="small fw-semibold" style={{ color: "#6366f1" }}>
                          {nextStep ? nextStep.label : "Proceed to Booking"}
                        </div>
                      </div>
                    </div>
                    <div style={{
                      height: 8,
                      background: "#e9ecef",
                      borderRadius: 999,
                      overflow: "hidden",
                    }}>
                      <div style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: "linear-gradient(90deg, #6366f1 0%, #8b5cf6 100%)",
                        borderRadius: 999,
                        transition: "width 0.3s ease",
                      }} />
                    </div>
                  </div>
                );
              })()}

              {/* ═══════════════════════════════════════
                  STEP CONTENT
              ═══════════════════════════════════════ */}

              {/* ── SERVICE SELECTION (Step 0) ──
                  Single picker page — every optional service has a
                  toggle, hotel is locked ON. Only enabled services
                  produce follow-up wizard steps; toggling something OFF
                  here also strips its step (and disabled services don't
                  trigger validation or contribute to the payload). The
                  operator can come back to this step at any time to add
                  more services without losing data already typed into
                  the detail steps — addon field values are preserved
                  across Yes→No→Yes toggles. */}
              {wizardSteps[currentStepIdx]?.type === "select" && (
                <Card className="border-0 shadow-sm rounded-4">
                  <Card.Body className="p-4">
                    <h5 className="fw-bold mb-1">Choose services for this booking</h5>
                    <div className="text-muted mb-4" style={{ fontSize: "0.95rem" }}>
                      Pick the services you want to include. You can come
                      back to this step anytime to enable more — already
                      entered details will not be lost.
                    </div>
                    <Row className="g-3">
                      {(() => {
                        const rows = [
                          {
                            key: "hotel",
                            label: "Hotel",
                            description: "Hotel accommodation for the trip.",
                            Icon: FaHotel,
                            checked: true,
                            mandatory: true,
                          },
                          ...ADDON_SERVICES_CATALOG.map((svc) => ({
                            key: `addon:${svc.key}`,
                            addonKey: svc.key,
                            label: svc.label,
                            description: svc.question || `Add ${svc.label} to this booking.`,
                            Icon: FaConciergeBell,
                            checked: !!addonFlags[svc.key],
                          })),
                          {
                            key: "transfer",
                            label: "Cab / Transfer",
                            description: "Airport, inter-city or hourly transfers.",
                            Icon: FaCar,
                            checked: !!v2Services.transfer,
                          },
                          {
                            key: "tour",
                            label: "Tours & Activities",
                            description: "Sightseeing, day trips, attractions.",
                            Icon: FaTicketAlt,
                            checked: !!v2Services.tour,
                          },
                        ];
                        return rows.map((row) => {
                          const RowIcon = row.Icon;
                          return (
                            <Col xs={12} md={6} key={row.key}>
                              <div
                                className="d-flex align-items-start border rounded-3 p-3 h-100"
                                style={{
                                  background: row.checked ? "#f8f7ff" : "#ffffff",
                                  borderColor: row.checked ? "#c7d2fe" : "#e5e7eb",
                                  transition: "background 0.15s ease, border-color 0.15s ease",
                                }}
                              >
                                <span
                                  className="me-3 d-inline-flex align-items-center justify-content-center"
                                  style={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: "50%",
                                    background: row.checked ? "#6366f1" : "#e5e7eb",
                                    color: row.checked ? "#fff" : "#6b7280",
                                    flexShrink: 0,
                                  }}
                                >
                                  <RowIcon />
                                </span>
                                <div className="flex-grow-1 me-2">
                                  <div className="d-flex align-items-center gap-2">
                                    <span className="fw-semibold">{row.label}</span>
                                    {row.mandatory && (
                                      <Badge bg="warning" text="dark" className="text-uppercase" style={{ fontSize: "0.65rem" }}>
                                        Mandatory
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="small text-muted mt-1">{row.description}</div>
                                </div>
                                <Form.Check
                                  type="switch"
                                  id={`svc-select-${row.key}`}
                                  checked={row.checked}
                                  disabled={row.mandatory}
                                  onChange={(e) => {
                                    if (row.mandatory) return;
                                    if (row.addonKey) {
                                      toggleAddonService(row.addonKey, e.target.checked);
                                    } else if (row.key === "transfer" || row.key === "tour") {
                                      toggleServiceGate(row.key, e.target.checked);
                                    }
                                  }}
                                />
                              </div>
                            </Col>
                          );
                        });
                      })()}
                    </Row>
                    <div className="text-muted small mt-3 fst-italic">
                      Hotel is mandatory and is always included in the package.
                    </div>
                  </Card.Body>
                </Card>
              )}

              {/* ── ADD-ON SERVICE (one per catalogue entry) ──
                  The `key` prop is critical: without it React reuses the
                  same component instance across steps, the internal
                  useState initializer doesn't re-run, and the old
                  service's notes / toggle state bleed into every later
                  step (and overwrite it on edit). Keying on serviceKey
                  forces a clean unmount → mount when the user clicks
                  Next, so each step starts from the correct slot in
                  sessionStorage. */}
              {wizardSteps[currentStepIdx]?.type === "addon" && (
                <SingleAddOnService
                  key={wizardSteps[currentStepIdx].serviceKey}
                  serviceKey={wizardSteps[currentStepIdx].serviceKey}
                />
              )}

              {/* ── HOTEL ── */}
              {wizardSteps[currentStepIdx]?.key === "accommodation" && (
                  <Card className="border-0 shadow-sm">
                    <Card.Body>
                      {/* Search form removed — the criteria submitted on the
                          previous page already drives the hotel results, which
                          are pre-fetched and hydrated on mount. */}

                      {/* ── Loading-while-prefetch state ── */}
                      {!hasSearched && !hasSearchResult && (
                        <Card className="shadow-sm rounded-xl mt-4">
                          <Card.Body className="text-center text-muted py-5">
                            <Spinner animation="border" className="mb-3" />
                            <h4>Loading hotel results…</h4>
                            <p>Fetching availability for the criteria you submitted.</p>
                          </Card.Body>
                        </Card>
                      )}

                      {/* ══════════════════════════════════════════════════
                          RESULTS SECTION — two-column layout
                      ══════════════════════════════════════════════════ */}
                      {hasSearched && (
                        <div ref={resultsRef} className="mt-4">

                          {/* ── Progress bar (visible during loading) ── */}
                          <SearchProgressBar
                            isLoading={isLoading}
                            pollStatus={pollStatus}
                          />

                          <div className="search-layout">
                            <Row className="g-4" style={{ alignItems: "flex-start" }}>

                              {/* ────────────────────────────────────
                                  LEFT SIDEBAR (mirrors HotelSearch)
                              ──────────────────────────────────── */}
                             <Col lg={3} className="leftside d-none d-lg-block" style={{
      position: "sticky",
      top: "90px", // adjust based on TopBar height
      maxHeight: "calc(100vh - 100px)",
      overflowY: "auto",
    }}>
  <div className="left-fixed">
    <Card className="shadow-sm rounded-xl filtersection">
      <Card.Body className="p-2">
        {/* Map Preview */}
        <div className="map-preview-wrapper mb-2">
          <img
            src="/images/map.jpg"
            alt="Map preview"
            className="map-preview-img"
          />
          <button className="map-overlay-btn">
            EXPLORE ON MAP 📍
          </button>
        </div>

        {/* Hotel name search */}
        <Form.Control
          type="text"
          placeholder="Search hotel name..."
          className="mb-3"
          value={hotelSearchTerm}
          onChange={(e) => setHotelSearchTerm(e.target.value)}
        />

        {/* Star Rating */}
        <Form.Group className="mb-3">
          <Form.Label className="fw-semibold small">Star Rating</Form.Label>
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
                width: "100%",
              }),
              menuPortal: (base) => ({ ...base, zIndex: 9999 }),
              menu: (base) => ({ ...base, zIndex: 9999 }),
            }}
          />
        </Form.Group>

        <hr className="my-2" />

        {/* Sort */}
        <Form.Group className="mb-3">
          <Form.Label className="fw-semibold small">Sort By Price</Form.Label>
          <div className="d-flex gap-2">
            <Button
              size="sm"
              className={`sort-pill w-50 ${sortBy === "priceAsc" ? "active" : ""}`}
              onClick={() => setSortBy("priceAsc")}
            >
              Price ↑
            </Button>
            <Button
              size="sm"
              className={`sort-pill w-50 ${sortBy === "priceDesc" ? "active" : ""}`}
              onClick={() => setSortBy("priceDesc")}
            >
              Price ↓
            </Button>
          </div>
        </Form.Group>

        <hr className="my-2" />

        {/* Hotel Type */}
        <Form.Group className="mb-3">
          <Form.Label className="fw-semibold small">Hotel Type</Form.Label>
          <div className="filter-checkbox-list">
            {hotelTypeOptions.map((item) => (
              <Form.Check
                key={item.value}
                type="checkbox"
                id={`pkg-hotel-type-${item.value}`}
                label={item.label}
                checked={hotelType.some((t) => t.value === item.value)}
                onChange={(e) => {
                  if (e.target.checked)
                    setHotelType([...hotelType, item]);
                  else
                    setHotelType(hotelType.filter((t) => t.value !== item.value));
                }}
              />
            ))}
          </div>
        </Form.Group>

        <hr className="my-2" />

        {/* Channel
        <Form.Group className="mb-3">
          <Form.Label className="fw-semibold small">Channel</Form.Label>
          <div className="filter-checkbox-list">
            {channelTypeOptions.map((item) => (
              <Form.Check
                key={item.value}
                type="checkbox"
                id={`pkg-channel-${item.value}`}
                label={item.label}
                checked={channelType.some((c) => c.value === item.value)}
                onChange={(e) => {
                  if (e.target.checked)
                    setChannelType([...channelType, item]);
                  else
                    setChannelType(channelType.filter((c) => c.value !== item.value));
                }}
              />
            ))}
          </div>
        </Form.Group> */}

        <hr className="my-2" />

        {/* Clear All */}
        <Button
          className="clear-pill w-100"
          variant="outline-primary"
          size="sm"
          onClick={clearAllFilters}
        >
          Clear All Filters
        </Button>

      </Card.Body>
    </Card>
  </div>
</Col>

                              {/* ────────────────────────────────────
                                  RIGHT COLUMN
                              ──────────────────────────────────── */}
                              <Col lg={9}>

                            


                                {/* ── Skeleton cards — first load only ── */}
                                {isLoading && allResults.length === 0 && (
                                  <Row xs={1} className="g-4">
                                    {[1, 2, 3].map((i) => (
                                      <SkeletonHotelCard key={i} />
                                    ))}
                                  </Row>
                                )}

                                {/* ── Hotel result cards ── */}
                                {(!isLoading || allResults.length > 0) && (
                                  <Row xs={1} className="g-4">
                                    {filteredResults.length > 0 ? (
                                      filteredResults.map((hotel) => (
                                        <Col key={hotel.id}>
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
                                              <Col md={4} lg={3}>
                                                <div
                                                  style={{
                                                    position: "relative",
                                                    height: "100%",
                                                    minHeight: "180px",
                                                    padding: "12px",
                                                  }}
                                                >
                                                  <LazyImage
                                                    src={hotel.image}
                                                    alt={hotel.name}
                                                    style={{
                                                      width: "100%",
                                                      height: "100%",
                                                      objectFit: "cover",
                                                      borderRadius: "8px",
                                                    }}
                                                  />
                                                  {/* Star + channel badge */}
                                                  <div
                                                    style={{
                                                      position: "absolute",
                                                      top: "22px",
                                                      left: "22px",
                                                      backgroundColor: "rgba(0,0,0,0.7)",
                                                      color: "white",
                                                      padding: "4px 8px",
                                                      borderRadius: "15px",
                                                      fontSize: "12px",
                                                      display: "flex",
                                                      alignItems: "center",
                                                      gap: "4px",
                                                    }}
                                                  >
                                                    <FaStar className="text-warning" />
                                                    {hotel.rating}
                                                    <span
                                                      style={{
                                                        marginLeft: "4px",
                                                        backgroundColor: "#6c757d",
                                                        padding: "1px 6px",
                                                        borderRadius: "10px",
                                                      }}
                                                    >
                                                      {(
                                                        hotel.channelType || ""
                                                      ).toUpperCase()}
                                                    </span>
                                                  </div>
                                                </div>
                                              </Col>

                                              <Col md={8} lg={9}>
                                                <div
                                                  style={{
                                                    padding: "16px",
                                                    height: "100%",
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    justifyContent: "space-between",
                                                  }}
                                                >
                                                  <div>
                                                    <div className="d-flex align-items-center mb-1 gap-2">
                                                      <h6
                                                        style={{
                                                          fontSize: "1rem",
                                                          fontWeight: "600",
                                                          marginBottom: 0,
                                                          color: "#333",
                                                        }}
                                                      >
                                                        {hotel.name || "Hotel Name Not Available"}
                                                      </h6>
                                                      <div className="d-flex gap-1">
                                                        {renderStars(hotel.rating)}
                                                      </div>
                                                    </div>

                                                    <p
                                                      style={{
                                                        fontSize: "0.85rem",
                                                        color: "#666",
                                                        marginBottom: "6px",
                                                      }}
                                                    >
                                                      📍{" "}
                                                      {hotel.address || "Address Not Available"}
                                                    </p>

                                                    {hotel.badge && (
                                                      <span
                                                        style={{
                                                          backgroundColor: "#28a745",
                                                          color: "white",
                                                          padding: "3px 8px",
                                                          borderRadius: "4px",
                                                          fontSize: "0.72rem",
                                                          fontWeight: "500",
                                                          display: "inline-block",
                                                          marginBottom: "8px",
                                                        }}
                                                      >
                                                        {hotel.badge}
                                                      </span>
                                                    )}
                                                  </div>

                                                  <div
                                                    style={{
                                                      display: "flex",
                                                      justifyContent: "space-between",
                                                      alignItems: "center",
                                                      paddingTop: "10px",
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
                                                        ? `AED ${hotel.price.toLocaleString()}`
                                                        : "Price on request"}
                                                    </div>

                                                    <Button
                                                      className="btn-view-rooms"
                                                      size="sm"
                                                      onClick={() => handleViewRooms(hotel)}
                                                    >
                                                      {expandedHotels[hotel.id]
                                                        ? "Hide Rooms"
                                                        : "View Rooms"}
                                                    </Button>
                                                  </div>
                                                </div>
                                              </Col>
                                            </Row>

                                            {/* ── Inline Room List ── */}
                                            {expandedHotels[hotel.id] && (
                                              <div className="border-top p-3 bg-light">
                                                {loadingRooms[hotel.id] ? (
                                                  <div className="text-center py-4">
                                                    <Spinner
                                                      animation="border"
                                                      variant="primary"
                                                    />
                                                    <p className="mt-2 text-muted">
                                                      Fetching rooms...
                                                    </p>
                                                  </div>
                                                ) : hotelRooms[hotel.id] ? (
                                                  <div className="room-categories-section">
                                                    {(
                                                      hotelRooms[hotel.id].hotels[0]
                                                        .roomCategories || []
                                                    ).map((category, idx) => (
                                                     <Accordion
  activeKey={activeAccordion[hotel.id + "-" + idx] || null}
  onSelect={(eventKey) => {
    const key = hotel.id + "-" + idx;
    setActiveAccordion((prev) => ({
      ...prev,
      [key]: prev[key] === eventKey ? null : eventKey,
    }));
  }}
  className="mb-3"
>
  <Accordion.Item
    eventKey="0"
    className="room-category-item border-0 shadow-sm"
  >
    <Accordion.Header className="room-category-header">
      <div className="d-flex justify-content-between align-items-center w-100">

        {/* LEFT CONTENT */}
        <div>
          <h6 className="mb-1 fw-bold">{category.roomCategory}</h6>
          <p className="mb-0 text-muted small">
            {category.baseRoomType}
          </p>
        </div>

        {/* RIGHT CONTENT WITH ARROW */}
        <div className="d-flex align-items-center gap-3">
          <div className="text-end">
            <span className="fw-bold text-primary">
              From {formatPrice(Math.min(...category.availableRates.map(r => r.rate)))}
            </span>
            <div className="small text-muted">
              {category.availableRates.length} rates
            </div>
          </div>

          {/* 🔥 ARROW ICON */}
          <FaChevronDown
            style={{
              transition: "transform 0.3s ease",
              transform:
                activeAccordion[hotel.id + "-" + idx] === "0"
                  ? "rotate(180deg)"
                  : "rotate(0deg)",
            }}
          />
        </div>
      </div>
    </Accordion.Header>
                                                          <Accordion.Body className="room-rates-section p-3">
                                                            <Row>
                                                              {category.availableRates.map(
                                                                (rate, rIdx) => (
                                                                  <Col
                                                                    key={rIdx}
                                                                  md={6} lg={4} xl={5} className="mb-3"
                                                                  >
                                                                    <Card className="rate-card h-100 border-0 shadow-sm">
                                                                      <Card.Body className="p-3">
                                                                        <div className="rate-header mb-3 pb-2 border-bottom">
                                                                          <div className="d-flex align-items-center gap-2 mb-2">
                                                                            {getMealPlanIcon(
                                                                              rate.mealPlan
                                                                            )}
                                                                            <span className="fw-semibold small">
                                                                              {rate.mealPlan}
                                                                            </span>
                                                                          </div>
                                                                          <div className="mb-1">
                                                                            {getRoomStatusBadge(
                                                                              rate.roomStatus
                                                                            )}
                                                                          </div>
                                                                          <div>
                                                                            <RefundBadge rate={rate} />
                                                                          </div>
                                                                        </div>

                                                                        <div className="rate-pricing mb-3 text-center">
                                                                          <div className="current-price fs-4 fw-bold text-success">
                                                                            {formatPrice(
                                                                              rate.totalRate
                                                                            )}
                                                                          </div>
                                                                          {rate.recommendedRetailPrice >
                                                                            rate.totalRate && (
                                                                            <div className="original-price text-muted text-decoration-line-through small">
                                                                              {formatPrice(
                                                                                rate.recommendedRetailPrice
                                                                              )}
                                                                            </div>
                                                                          )}
                                                                          <div className="price-per-night text-muted small">
                                                                            per night
                                                                          </div>
                                                                        </div>

                                                                        <div className="rate-features mb-3">
                                                                          <div className="feature-item d-flex align-items-start gap-2 mb-1">
                                                                            <FaInfoCircle
                                                                              className="text-muted mt-1"
                                                                              size={12}
                                                                            />
                                                                            <span className="small">
                                                                              {rate.contractLabel}
                                                                            </span>
                                                                          </div>
                                                                          {rate.cancellationPolicies &&
                                                                            rate.cancellationPolicies
                                                                              .length > 0 &&
                                                                            typeof rate
                                                                              .cancellationPolicies[0] ===
                                                                              "object" && (
                                                                              <div className="feature-item d-flex align-items-start gap-2">
                                                                                <FaShieldAlt
                                                                                  className="text-muted mt-1"
                                                                                  size={12}
                                                                                />
                                                                                <span
                                                                                  className="small"
                                                                                  title={
                                                                                    rate
                                                                                      .cancellationPolicies[0]
                                                                                      .policyText
                                                                                  }
                                                                                >
                                                                                  Cancellation Policy
                                                                                  Applies
                                                                                </span>
                                                                              </div>
                                                                            )}
                                                                        </div>

                                                                        <div className="d-grid gap-2">
                                                                          <Button
                                                                            variant="primary"
                                                                            size="sm"
                                                                            onClick={() =>
                                                                              handleAddToCart(
                                                                                hotel.id,
                                                                                rate
                                                                              )
                                                                            }
                                                                          >
                                                                            Add to Package
                                                                          </Button>
                                                                        </div>
                                                                      </Card.Body>
                                                                    </Card>
                                                                  </Col>
                                                                )
                                                              )}
                                                            </Row>
                                                          </Accordion.Body>
                                                        </Accordion.Item>
                                                      </Accordion>
                                                    ))}
                                                  </div>
                                                ) : (
                                                  <div className="text-center py-3 text-muted">
                                                    No rooms available.
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </Col>
                                      ))
                                    ) : (
                                      <Col xs={12}>
                                        <Card className="shadow-sm rounded-xl">
                                          <Card.Body className="text-center text-muted py-5">
                                            <FaSearch className="display-4 text-muted mb-3" />
                                            <h5>No results found</h5>
                                            <p>
                                              {channelType.length > 0
                                                ? `No hotels found for selected channel(s): ${channelType
                                                    .map((c) => c.label)
                                                    .join(", ")}`
                                                : hasActiveFilters
                                                ? "No hotels match your current filters. Try adjusting or clearing some filters."
                                                : "Try adjusting your search criteria."}
                                            </p>
                                            {hasActiveFilters && (
                                              <Button
                                                variant="outline-primary"
                                                size="sm"
                                                onClick={clearAllFilters}
                                              >
                                                Clear All Filters
                                              </Button>
                                            )}
                                          </Card.Body>
                                        </Card>
                                      </Col>
                                    )}
                                  </Row>
                                )}

                                {/* ── Bottom pagination ── */}
                                {filteredResults.length > 0 && !hasActiveFilters && (
                                  <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-4">
                                    <small className="text-muted fw-semibold">
                                      Showing {startEntry}–{endEntry} of {totalElements}{" "}
                                      results
                                    </small>
                                    <Pagination className="mb-0 pagination-modern">
                                      <Pagination.Prev
                                        disabled={pageIndex === 0}
                                        onClick={() => goToPage(pageIndex - 1)}
                                      />
                                      {pageNumbers.map((n) => (
                                        <Pagination.Item
                                          key={n}
                                          active={n === pageIndex + 1}
                                          onClick={() => goToPage(n - 1)}
                                        >
                                          {n}
                                        </Pagination.Item>
                                      ))}
                                      <Pagination.Next
                                        disabled={pageIndex >= effectiveTotalPages - 1}
                                        onClick={() => goToPage(pageIndex + 1)}
                                      />
                                    </Pagination>
                                  </div>
                                )}

                              </Col>
                              {/* end right Col */}
                            </Row>
                          </div>
                        </div>
                      )}
                    </Card.Body>
                  </Card>
              )}

              {/* ── TRANSFER ── */}
              {wizardSteps[currentStepIdx]?.key === "transfer" && (
                  <Card className="border-0 shadow-sm rounded-4">
                    <Card.Body>
                      {/* ── Pickup / Dropoff selectors ──
                          Always visible on the transfer step (even when the
                          cab list comes back empty) — the operator needs
                          them to satisfy the wizard's pickup+dropoff
                          requirement, and they're populated independently
                          from the cab list (via /cab-search/lookup-by-
                          destination). Selections persist to sessionStorage
                          and are stamped onto each cab DTO at booking save.
                          Pairs with a manual "Search Transfers" button so
                          the operator can retry the search after picking
                          locations / when the prefetch returned empty. */}
                      <Card className="mb-4 shadow-sm" style={{ borderRadius: "12px" }}>
                        <Card.Body>
                          <Row className="g-3 align-items-end">
                            <Col md={5}>
                              <Form.Label className="fw-semibold">
                                Pickup <span className="text-danger">*</span>
                              </Form.Label>
                              <Select
                                classNamePrefix="rs"
                                isClearable
                                isLoading={cabLookupLoading}
                                options={cabLookupOptions}
                                value={transferPickupZone}
                                placeholder="Select pickup location"
                                onChange={(opt) => {
                                  setTransferPickupZone(opt);
                                  setTransferZoneErrors((e) => ({ ...e, pickup: "" }));
                                }}
                                formatOptionLabel={(opt) => (
                                  <div>
                                    <div>{opt.label}</div>
                                    {opt.subtitle && (
                                      <small className="text-muted">{opt.subtitle}</small>
                                    )}
                                  </div>
                                )}
                                menuPortalTarget={document.body}
                                menuPosition="fixed"
                                styles={{
                                  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                                  menu: (base) => ({ ...base, zIndex: 9999 }),
                                }}
                                noOptionsMessage={() =>
                                  cabLookupLoading ? "Loading…" : "No locations found"
                                }
                              />
                              {transferZoneErrors.pickup && (
                                <div className="text-danger small mt-1">
                                  {transferZoneErrors.pickup}
                                </div>
                              )}
                            </Col>
                            <Col md={5}>
                              <Form.Label className="fw-semibold">
                                Dropoff <span className="text-danger">*</span>
                              </Form.Label>
                              <Select
                                classNamePrefix="rs"
                                isClearable
                                isLoading={cabLookupLoading}
                                options={cabLookupOptions}
                                value={transferDropoffZone}
                                placeholder="Select dropoff location"
                                onChange={(opt) => {
                                  setTransferDropoffZone(opt);
                                  setTransferZoneErrors((e) => ({ ...e, dropoff: "" }));
                                }}
                                formatOptionLabel={(opt) => (
                                  <div>
                                    <div>{opt.label}</div>
                                    {opt.subtitle && (
                                      <small className="text-muted">{opt.subtitle}</small>
                                    )}
                                  </div>
                                )}
                                menuPortalTarget={document.body}
                                menuPosition="fixed"
                                styles={{
                                  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                                  menu: (base) => ({ ...base, zIndex: 9999 }),
                                }}
                                noOptionsMessage={() =>
                                  cabLookupLoading ? "Loading…" : "No locations found"
                                }
                              />
                              {transferZoneErrors.dropoff && (
                                <div className="text-danger small mt-1">
                                  {transferZoneErrors.dropoff}
                                </div>
                              )}
                            </Col>
                            <Col md={2} className="d-grid">
                              <Button
                                variant="primary"
                                onClick={handleTransferSearchSubmit}
                                disabled={transferLoading}
                                title="Re-run the transfer search with the current criteria"
                              >
                                {transferLoading ? (
                                  <>
                                    <Spinner animation="border" size="sm" className="me-2" />
                                    Searching…
                                  </>
                                ) : (
                                  <>
                                    <FaSearch className="me-2" />
                                    Search
                                  </>
                                )}
                              </Button>
                            </Col>
                          </Row>
                        </Card.Body>
                      </Card>

                      {transferLoading && (
                        <Card className="shadow-sm rounded-xl mb-4 mt-4">
                          <Card.Body className="text-center py-5">
                            <div className="results-loader">
                              <div className="loader-ring">
                                <span></span><span></span><span></span><span></span>
                              </div>
                              <h4 className="text-primary fw-bold mt-3 mb-1">
                                Searching Transfers...
                              </h4>
                              <p className="text-muted small mb-0">
                                Finding available transfer options
                              </p>
                            </div>
                          </Card.Body>
                        </Card>
                      )}

                      {!hasTransferSearched && !transferLoading && (
                        <div className="text-center text-muted mt-5">
                          <Spinner animation="border" className="mb-3" />
                          <h6>Loading available transfers…</h6>
                        </div>
                      )}

                      {hasTransferSearched && !transferLoading && transferResults.length > 0 && (
                        <div className="mt-4">
                          <h6 className="fw-bold mb-3">
                            Transfer Results ({transferResults.length})
                          </h6>

                          <Row className="g-4">
                            {transferResults.map((cab) => (
                              <Col key={cab.cabid} lg={10} xl={9} className="mx-auto">
                                <Card className="mb-4 shadow-sm" style={{ borderRadius: "12px" }}>
                                  <Card.Body>
                                    <Row className="mb-3">
                                      <Col md={3} sm={4} xs={12} className="mb-3 mb-md-0">
                                        <div
                                          style={{
                                            width: "100%",
                                            height: "200px",
                                            borderRadius: "8px",
                                            overflow: "hidden",
                                            backgroundColor: "#f5f5f5",
                                          }}
                                        >
                                          <LazyImage src={cab.cabpic} alt={cab.cabname} />
                                        </div>
                                      </Col>
                                      <Col
                                        md={9}
                                        sm={8}
                                        xs={12}
                                        className="d-flex align-items-center"
                                      >
                                        <div>
                                          <h5
                                            className="fw-bold mb-2"
                                            style={{ fontSize: "1.5rem", color: "#333" }}
                                          >
                                            {cab.cabname || "Transfer Vehicle"}
                                          </h5>
                                          {cab.cabdetails && (
                                            <p
                                              className="text-muted mb-0"
                                              style={{ fontSize: "0.9rem" }}
                                            >
                                              {cab.cabdetails}
                                            </p>
                                          )}
                                        </div>
                                      </Col>
                                    </Row>

                                    {cab.searchCabDetailsDTO &&
                                      cab.searchCabDetailsDTO.length > 0 && (
                                        <div className="table-responsive">
                                          <Table striped bordered hover className="mb-0">
                                            <thead style={{ backgroundColor: "#f8f9fa" }}>
                                              <tr>
                                                <th style={{ fontWeight: "600", padding: "12px" }}>
                                                  Transfer Option
                                                </th>
                                                <th style={{ fontWeight: "600", padding: "12px" }}>
                                                  Share Type
                                                </th>
                                                <th style={{ fontWeight: "600", padding: "12px" }}>
                                                  Total Price
                                                </th>
                                                <th
                                                  style={{
                                                    fontWeight: "600",
                                                    padding: "12px",
                                                    width: "150px",
                                                  }}
                                                >
                                                  Action
                                                </th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {cab.searchCabDetailsDTO.map((detail, idx) => {
                                                const rate =
                                                  detail.types === "SIC"
                                                    ? detail.sicRate
                                                    : detail.privateRate;
                                                const totalRate =
                                                  detail.totalRateWithoutMrk || rate || 0;
                                                const uniqueId = `${cab.cabid}-${detail.dropDetails}-${detail.paxDetails}-${detail.types}`;
                                                const isAdding = addingTransferId === uniqueId;

                                                return (
                                                  <tr key={idx}>
                                                    <td
                                                      style={{
                                                        padding: "12px",
                                                        verticalAlign: "middle",
                                                      }}
                                                    >
                                                      {detail.location || "N/A"} -{" "}
                                                      {detail.dropOff || "N/A"}
                                                    </td>
                                                    <td
                                                      style={{
                                                        padding: "12px",
                                                        verticalAlign: "middle",
                                                      }}
                                                    >
                                                      <span
                                                        style={{
                                                          fontSize: "0.9rem",
                                                          fontWeight: 600,
                                                          color: "#333",
                                                        }}
                                                      >
                                                        {detail.types}
                                                      </span>
                                                    </td>
                                                    <td
                                                      style={{
                                                        padding: "12px",
                                                        verticalAlign: "middle",
                                                      }}
                                                    >
                                                      <span
                                                        style={{
                                                          fontSize: "1rem",
                                                          fontWeight: "600",
                                                          color: "#333",
                                                        }}
                                                      >
                                                        AED {totalRate.toLocaleString()}
                                                      </span>
                                                    </td>
                                                    <td
                                                      style={{
                                                        padding: "12px",
                                                        verticalAlign: "middle",
                                                        textAlign: "center",
                                                      }}
                                                    >
                                                      <OverlayTrigger
                                                        placement="top"
                                                        overlay={
                                                          !hasHotelInCart ? (
                                                            <Tooltip id={`tooltip-transfer-${idx}`}>
                                                              Search and add hotels first, then only these will be enabled
                                                            </Tooltip>
                                                          ) : <></>
                                                        }
                                                      >
                                                        <span className="d-inline-block">
                                                          <Button
                                                            variant="success"
                                                            size="sm"
                                                            className="add-transfer-to-cart"
                                                            onClick={() =>
                                                              handleAddTransferToCart(cab, detail)
                                                            }
                                                            disabled={isAdding || !hasHotelInCart}
                                                            style={{ minWidth: "120px", pointerEvents: !hasHotelInCart ? 'none' : 'auto' }}
                                                          >
                                                            {isAdding ? (
                                                              <>
                                                                <Spinner
                                                                  size="sm"
                                                                  className="me-2"
                                                                />
                                                                Adding...
                                                              </>
                                                            ) : (
                                                              "Add to cart"
                                                            )}
                                                          </Button>
                                                        </span>
                                                      </OverlayTrigger>
                                                    </td>
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                          </Table>
                                        </div>
                                      )}
                                  </Card.Body>
                                </Card>
                              </Col>
                            ))}
                          </Row>
                        </div>
                      )}

                      {hasTransferSearched && !transferLoading && transferResults.length === 0 && (
                        <div className="text-center text-muted mt-5">
                          <FaCar className="fs-1 mb-3 text-secondary" />
                          <h6>No transfers found for the selected dates.</h6>
                          <p className="small">
                            Please try different dates or contact support.
                          </p>
                          {/* UI-test helper — populates the cab list with a
                              handful of demo cars so the operator can step
                              through the rest of the wizard end-to-end while
                              the inhouse cab catalogue is being seeded.
                              Click-only; nothing fires automatically. */}
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            className="mt-2"
                            onClick={() => {
                              setTransferResults(SAMPLE_TRANSFER_RESULTS);
                              toast.success(
                                "Loaded sample cabs for UI testing. These are demo entries — replace with a real search before booking a live customer."
                              );
                            }}
                          >
                            Load Sample Cabs (Demo)
                          </Button>
                        </div>
                      )}
                    </Card.Body>
                  </Card>
              )}

              {/* ── TOURS & ACTIVITIES ── */}
              {wizardSteps[currentStepIdx]?.key === "tours" && (
                  <Card className="border-0 shadow-sm rounded-4">
                    <Card.Body>
                      {/* Search form removed — activities are pre-fetched
                          with the criteria from the previous page. */}

                      {tourLoading && (
                        <Card className="shadow-sm rounded-xl mb-4 mt-4">
                          <Card.Body className="text-center py-5">
                            <div className="results-loader">
                              <div className="loader-ring">
                                <span></span><span></span><span></span><span></span>
                              </div>
                              <h4 className="text-primary fw-bold mt-3 mb-1">
                                Searching Activities...
                              </h4>
                              <p className="text-muted small mb-0">
                                Finding available activity options
                              </p>
                            </div>
                          </Card.Body>
                        </Card>
                      )}

                      {!hasTourSearched && !tourLoading && (
                        <div className="text-center text-muted mt-5">
                          <Spinner animation="border" className="mb-3" />
                          <h6>Loading available activities…</h6>
                        </div>
                      )}

                      {hasTourSearched && !tourLoading && tourResults.length > 0 && (
                        <div className="mt-4">
                          <h6 className="fw-bold mb-3">
                            Tour & Activity Results ({tourResults.length})
                          </h6>
                          <Row xs={1} sm={2} md={3} lg={3} xl={3} className="g-4">
                            {tourResults.map((activity) => (
                              <Col key={activity.id}>
                                <div
                                  style={{
                                    backgroundColor: "white",
                                    border: "1px solid #dee2e6",
                                    borderRadius: "12px",
                                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                                    overflow: "hidden",
                                  }}
                                >
                                  <div
                                    style={{
                                      position: "relative",
                                      height: "200px",
                                      overflow: "hidden",
                                    }}
                                  >
                                    <LazyImage
                                      src={activity.activityImage}
                                      alt={activity.activityName}
                                    />
                                    <div
                                      style={{
                                        position: "absolute",
                                        top: "10px",
                                        right: "10px",
                                        backgroundColor: "rgba(0,0,0,0.7)",
                                        color: "white",
                                        padding: "4px 8px",
                                        borderRadius: "15px",
                                        fontSize: "12px",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "4px",
                                      }}
                                    >
                                      {activity.starRating > 0 && (
                                        <>
                                          <FaStar className="text-warning me-1" />
                                          {activity.starRating}
                                        </>
                                      )}
                                      {activity.apiType && !isAgentLogin() && (
                                        <span
                                          style={{
                                            marginLeft: "4px",
                                            backgroundColor: "#6c757d",
                                            padding: "1px 6px",
                                            borderRadius: "10px",
                                          }}
                                        >
                                          {activity.apiType.toUpperCase()}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div style={{ padding: "16px", backgroundColor: "white" }}>
                                    <h6
                                      style={{
                                        fontSize: "1rem",
                                        fontWeight: "600",
                                        marginBottom: "8px",
                                        color: "#333",
                                        lineHeight: "1.3",
                                      }}
                                    >
                                      {activity.activityName || "Activity Name Not Available"}
                                    </h6>

                                    {activity.duration && (
                                      <div
                                        style={{
                                          fontSize: "0.875rem",
                                          color: "#666",
                                          marginBottom: "10px",
                                        }}
                                      >
                                        <FaTicketAlt className="text-info me-2" />
                                        Duration: {activity.duration}
                                      </div>
                                    )}

                                    <div
                                      style={{
                                        backgroundColor:
                                          activity.totalRate > 0 ? "#28a745" : "#6c757d",
                                        color: "white",
                                        padding: "3px 8px",
                                        borderRadius: "4px",
                                        fontSize: "0.72rem",
                                        fontWeight: "500",
                                        display: "inline-block",
                                        marginBottom: "10px",
                                      }}
                                    >
                                      {activity.totalRate > 0
                                        ? "Rate Available"
                                        : "Rate on Request"}
                                    </div>

                                    <div
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        marginTop: "10px",
                                        paddingTop: "10px",
                                        borderTop: "1px solid #eee",
                                      }}
                                    >
                                      <div
                                        style={{
                                          fontSize: "1.2rem",
                                          fontWeight: "600",
                                          color: "#333",
                                        }}
                                      >
                                        {activity.totalRate > 0
                                          ? `${activity.currency} ${activity.totalRate.toLocaleString()}`
                                          : "-"}
                                      </div>

                                      <div className="d-flex gap-2 align-items-center">
                                        <Button
                                          variant="info"
                                          size="sm"
                                          onClick={() => {
                                            setSelectedActivity(activity);
                                            setShowActivityModal(true);
                                          }}
                                          style={{
                                            minWidth: "36px",
                                            padding: "5px 7px",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                          }}
                                          title="View Details"
                                        >
                                          <FaEye size={13} />
                                        </Button>
                                          <OverlayTrigger
                                            placement="top"
                                            overlay={
                                              !hasHotelInCart ? (
                                                <Tooltip id={`tooltip-activity-${activity.id}`}>
                                                  Search and add hotels first, then only these will be enabled
                                                </Tooltip>
                                              ) : <></>
                                            }
                                          >
                                            <span className="d-inline-block">
                                              <Button
                                          variant="primary"
                                          size="sm"
                                          className="activity-add-to-cart"
                                          disabled={
                                            addingActivityId ===
                                              (activity.id || activity.activityId) ||
                                            !hasHotelInCart
                                          }
                                          title={!hasHotelInCart ? "Search and add hotels first, then only these will be enabled" : ""}
                                          onClick={() => handleAddActivityToCart(activity)}
                                        >
                                          {addingActivityId ===
                                          (activity.id || activity.activityId) ? (
                                            <>
                                              <Spinner
                                                animation="border"
                                                size="sm"
                                                className="me-2"
                                              />
                                              Adding...
                                            </>
                                          ) : (
                                            "Add to Cart"
                                          )}
                                            </Button>
                                          </span>
                                        </OverlayTrigger>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </Col>
                            ))}
                          </Row>
                        </div>
                      )}

                      {hasTourSearched && !tourLoading && tourResults.length === 0 && (
                        <div className="text-center text-muted mt-5">
                          <FaTicketAlt className="fs-1 mb-3 text-secondary" />
                          <h6>No activities found for the selected date.</h6>
                          <p className="small">
                            Please try different dates or contact support.
                          </p>
                        </div>
                      )}
                    </Card.Body>
                  </Card>
              )}

              {/* (Old "Add-ons" monolithic step removed — each service is
                  now its own wizard step before the search steps.) */}

              {/* ═══════════════════════════════════════
                  WIZARD NAVIGATION BUTTONS
              ═══════════════════════════════════════ */}
              <div className="d-flex justify-content-between mt-4">
                <Button
                  variant="outline-secondary"
                  onClick={() => setCurrentStepIdx((i) => Math.max(0, i - 1))}
                  disabled={currentStepIdx === 0}
                >
                  ← Back
                </Button>
                <Button
                  style={{ background: "#6366f1", borderColor: "#6366f1", minWidth: 180 }}
                  disabled={isProceeding}
                  onClick={async () => {
                    // ── Transfer step: pickup + dropoff are required
                    // before leaving this step (whether moving to the
                    // next wizard step or proceeding to booking).
                    if (wizardSteps[currentStepIdx]?.key === "transfer") {
                      const nextErrors = {
                        pickup: transferPickupZone ? "" : "Please select a pickup location.",
                        dropoff: transferDropoffZone ? "" : "Please select a dropoff location.",
                      };
                      if (nextErrors.pickup || nextErrors.dropoff) {
                        setTransferZoneErrors(nextErrors);
                        toast.error("Please select both pickup and dropoff.");
                        return;
                      }
                    }
                    if (currentStepIdx < wizardSteps.length - 1) {
                      setCurrentStepIdx((i) => i + 1);
                      return;
                    }
                    // Last step → fetch the server-side cart, stash it
                    // in sessionStorage (the booking page reads from
                    // `makePkgCartData`), then navigate. Without this
                    // the booking page sees no cart and bounces back to
                    // the legacy entry route.
                    setIsProceeding(true);
                    try {
                      const proceedAgentId =
                        sessionStorage.getItem("makeYourOwnPackageAgentId") ||
                        localStorage.getItem("makeYourOwnPackageAgentId") ||
                        agent ||
                        agentId ||
                        "";
                      if (!proceedAgentId) {
                        toast.error("Select an agent before proceeding to checkout.");
                        return;
                      }
                      const res = await axiosInstance.post(
                        `/api/makeYourOwnPackageV2/cart/fetch?userId=${encodeURIComponent(proceedAgentId)}`
                      );
                      const cart = Array.isArray(res.data) ? res.data : [];
                      if (cart.length === 0) {
                        toast.error(
                          "Your cart is empty. Add at least one hotel / transfer / activity before proceeding."
                        );
                        return;
                      }
                      if (v2Services.hotel && !cart.some((it) => !!it.hotel)) {
                        toast.error(
                          "Please add a hotel to your package before proceeding."
                        );
                        return;
                      }
                      sessionStorage.setItem(
                        "makePkgCartData",
                        JSON.stringify(cart)
                      );
                      sessionStorage.setItem("makePkgAgentId", String(proceedAgentId));
                      navigate(
                        "/new-booking/make-your-own-package-v2/booking-page",
                        { state: searchCriteria }
                      );
                    } catch (err) {
                      console.error("Proceed to booking failed:", err);
                      toast.error("Failed to load cart data. Please try again.");
                    } finally {
                      setIsProceeding(false);
                    }
                  }}
                >
                  {currentStepIdx < wizardSteps.length - 1 ? (
                    "Next →"
                  ) : isProceeding ? (
                    <>
                      <Spinner animation="border" size="sm" className="me-2" />
                      Loading cart…
                    </>
                  ) : (
                    "Proceed to Booking →"
                  )}
                </Button>
              </div>
            </Card.Body>
          </Card>

          {/* ═══════════════════════════════════════
              ACTIVITY DETAILS MODAL
          ═══════════════════════════════════════ */}
          <Modal
            show={showActivityModal}
            onHide={() => {
              setShowActivityModal(false);
              setSelectedActivity(null);
            }}
            size="lg"
            centered
          >
            <Modal.Header closeButton>
              <Modal.Title>Activity Details</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {selectedActivity && (
                <>
                  <div className="mb-4">
                    <img
                      src={selectedActivity.activityImage}
                      alt={selectedActivity.activityName}
                      style={{
                        width: "100%",
                        height: "300px",
                        objectFit: "cover",
                        borderRadius: "8px",
                      }}
                      onError={(e) => {
                        e.target.src =
                          "https://via.placeholder.com/800x300?text=Activity+Image";
                      }}
                    />
                  </div>

                  <div className="mb-3">
                    <h4 className="fw-bold">
                      {selectedActivity.activityName || "Activity Name"}
                    </h4>
                    {selectedActivity.starRating > 0 && (
                      <div className="d-flex align-items-center mb-2">
                        <FaStar className="text-warning me-1" />
                        <span>{selectedActivity.starRating} Star Rating</span>
                      </div>
                    )}
                  </div>

                  {selectedActivity.activityDetails && (
                    <div className="mb-3">
                      <h6 className="fw-semibold mb-2">Description</h6>
                      <p className="text-muted" style={{ whiteSpace: "pre-wrap" }}>
                        {selectedActivity.activityDetails}
                      </p>
                    </div>
                  )}

                  <Row className="g-3 mb-3">
                    {selectedActivity.minPaxsic > 0 && (
                      <Col md={6}>
                        <div>
                          <strong>Min Pax:</strong> {selectedActivity.minPaxsic}
                        </div>
                      </Col>
                    )}
                    {selectedActivity.maxPax > 0 && (
                      <Col md={6}>
                        <div>
                          <strong>Max Pax:</strong> {selectedActivity.maxPax}
                        </div>
                      </Col>
                    )}
                    {selectedActivity.childMin > 0 && (
                      <Col md={6}>
                        <div>
                          <strong>Child Age Range:</strong> {selectedActivity.childMin} -{" "}
                          {selectedActivity.childMax} years
                        </div>
                      </Col>
                    )}
                    {selectedActivity.duration && (
                      <Col md={6}>
                        <div>
                          <FaTicketAlt className="me-2" />
                          <strong>Duration:</strong> {selectedActivity.duration}
                        </div>
                      </Col>
                    )}
                    {selectedActivity.adultRate > 0 && (
                      <Col md={6}>
                        <div>
                          <strong>Adult Rate:</strong> {selectedActivity.currency}{" "}
                          {selectedActivity.adultRate.toLocaleString()}
                        </div>
                      </Col>
                    )}
                    {selectedActivity.childRate > 0 && (
                      <Col md={6}>
                        <div>
                          <strong>Child Rate:</strong> {selectedActivity.currency}{" "}
                          {selectedActivity.childRate.toLocaleString()}
                        </div>
                      </Col>
                    )}
                    {selectedActivity.apiType && !isAgentLogin() && (
                      <Col md={6}>
                        <div>
                          <strong>API Type:</strong> {selectedActivity.apiType}
                        </div>
                      </Col>
                    )}
                  </Row>

                  <div className="mt-4 p-3 bg-light rounded">
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <h5 className="mb-0">
                          {selectedActivity.totalRate > 0
                            ? `${selectedActivity.currency} ${selectedActivity.totalRate.toLocaleString()}`
                            : "Price on request"}
                        </h5>
                        {selectedActivity.totalRateWithoutMrk > 0 &&
                          selectedActivity.totalRateWithoutMrk !==
                            selectedActivity.totalRate && (
                            <small className="text-muted">
                              Without markup: {selectedActivity.currency}{" "}
                              {selectedActivity.totalRateWithoutMrk.toLocaleString()}
                            </small>
                          )}
                      </div>
                      <Badge bg={selectedActivity.totalRate > 0 ? "success" : "secondary"}>
                        {selectedActivity.totalRate > 0 ? "Rate Available" : "Rate on Request"}
                      </Badge>
                    </div>
                  </div>
                </>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowActivityModal(false);
                  setSelectedActivity(null);
                }}
              >
                Close
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setShowActivityModal(false);
                  setSelectedActivity(null);
                }}
              >
                Select Activity
              </Button>
            </Modal.Footer>
          </Modal>
        </main>
      </div>
    </div>
  );
}
