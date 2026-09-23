import React, { useEffect, useState, useRef } from "react";
import {
  Card,
  Button,
  Row,
  Col,
  Form,
  Badge,
  Spinner,
} from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";
import Select from "react-select";
import axiosInstance from "../../components/AxiosInstance";
import AgentBalanceDisplay from "../../components/AgentBalanceDisplay";
import AdvertisementCarousel from "../../components/AdvertisementCarousel";
import {
  FaSearch,
  FaGlobe,
  FaUser,
  FaCalendarAlt,
  FaMapMarkerAlt,
  FaUsers,
  FaChild,
  FaPlus,
  FaArrowRight,
} from "react-icons/fa";

import { useNavigate } from "react-router-dom";
import MyopV2JourneyStepper from "../../components/myopv2/MyopV2JourneyStepper";
import "../../styles/MakeYourOwnPackageV2.css";

// ── v2 prefetch ────────────────────────────────────────────────────────
// The next page (MakePkgCombineSearchV2) ships the same hotel/transfer/
// activity payloads that this page already has all the inputs for, so we
// fire those three searches in the background here and stash the mapped
// results in sessionStorage keyed by a hash of the criteria. The combined
// search page reads them on mount and skips its own per-tab search — the
// operator only hits "Search" once.
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
    return String(Date.now());
  }
};

const ensureHotelImage = (imageUrl) => {
  if (!imageUrl) return "https://b2b.choosenfly.com/assets/details/profilepic/hotel/hoteldefault.jpg";
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  if (typeof imageUrl === "string") {
    const fileName = imageUrl.split(/[/\\]/).pop();
    if (fileName) return `https://b2b.choosenfly.com/assets/details/profilepic/hotel/${fileName}`;
  }
  return "https://b2b.choosenfly.com/assets/details/profilepic/hotel/hoteldefault.jpg";
};

const ensureTransferImage = (imageUrl) => {
  if (!imageUrl) return "https://via.placeholder.com/400x225?text=Transfer";
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  if (typeof imageUrl === "string") {
    const fileName = imageUrl.split(/[/\\]/).pop();
    if (fileName) return `https://b2b.choosenfly.com/assets/details/profilepic/hotel/${fileName}`;
  }
  return "https://via.placeholder.com/400x225?text=Transfer";
};

const formatActivityDate = (dateString) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const computeCheckOutIso = (checkIn, nights) => {
  if (!checkIn || !nights) return "";
  const d = new Date(checkIn);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + parseInt(nights));
  return d.toISOString().split("T")[0];
};

const setPrefetchStatus = (patch) => {
  try {
    const raw = sessionStorage.getItem(PREFETCH_KEYS.status);
    const cur = raw ? JSON.parse(raw) : {};
    sessionStorage.setItem(
      PREFETCH_KEYS.status,
      JSON.stringify({ ...cur, ...patch })
    );
  } catch {
    /* private mode / quota — non-fatal */
  }
};

// Kick off hotel + transfer + tour searches in parallel. Returns
// immediately; each call writes its mapped result to sessionStorage when
// it resolves so the combined search page can pick it up.
const prefetchCombinedResults = (criteria) => {
  const {
    travelDate,
    agent,
    nationality,
    itinerary,
    adults,
    children,
    childAges,
    destination,
    nights,
  } = criteria || {};

  const checkIn = travelDate || "";
  const checkOut = computeCheckOutIso(checkIn, nights || 1);

  const dest =
    destination ||
    (itinerary && itinerary.length > 0 ? itinerary[0]?.selectedDestination : null) ||
    {};

  const nationalityId =
    nationality?.value != null ? String(nationality.value) : "";
  const nationalityCode = nationality?.code || "";
  const destinationCityId = dest?.value != null ? String(dest.value) : "";
  const destinationCountryId =
    dest?.countryId != null ? String(dest.countryId) : "";
  const destinationCityIds =
    itinerary && itinerary.length > 0
      ? itinerary
          .map((it) => it.selectedDestination?.value)
          .filter((v) => v != null && v !== "")
          .map(String)
      : destinationCityId
        ? [destinationCityId]
        : [];

  const agentIdFinal = agent || 1;

  const childAgeNums =
    childAges && childAges.length > 0
      ? childAges.map((a) => parseInt(a) || 0)
      : children > 0
        ? Array(children).fill(0)
        : [];

  const hotelPayload = {
    nationalityId,
    nationalityCode,
    destinationCityId,
    destinationCityIds,
    destinationCountryId,
    checkIn,
    checkOut,
    noOfRooms: "1",
    roomConfigurations: [
      {
        roomNo: 1,
        adultCount: String(adults || 1),
        childCount: String(children || 0),
        childAges: childAgeNums.length > 0 ? childAgeNums : [0],
        adultAges: [25],
      },
    ],
    agentId: agentIdFinal,
    apiType: ["INHOUSE"],
  };

  const transferPayload = {
    checkIn,
    checkOut,
    nativeCountryId: nationality?.value ? Number(nationality.value) : null,
    destinationCountryId,
    destinationCityId,
    destinationCityIds,
    searchCorCtype: "city",
    agentid: String(agentIdFinal),
    childAge: childAgeNums,
    adult: adults || 1,
    child: children || 0,
  };

  const tourPayload = {
    activityDate: formatActivityDate(travelDate),
    nativeCountryId: nationality?.value ? String(nationality.value) : "",
    destinationCountryId,
    destinationCityId,
    destinationCityIds,
    searchCorCtype: dest?.type || "State",
    agentId: String(agentIdFinal),
    childAge:
      childAges && childAges.length > 0
        ? childAges.map((a) => String(parseInt(a) || 0))
        : children > 0
          ? Array(children).fill("0")
          : [],
    adult: String(adults || 1),
    child: String(children || 0),
  };

  axiosInstance
    .post("/api/makeYourOwnPackageV2/hotel/search", hotelPayload)
    .then((res) => {
      const data = Array.isArray(res.data) ? res.data : [];
      const mapped = data.map((hotel, index) => ({
        id: hotel.hotelCode ? `local-${hotel.hotelCode}` : `local-h${index + 1}`,
        searchId: "local",
        hotelCode: hotel.hotelCode || null,
        name: hotel.hotelName || "Unknown Hotel",
        address: hotel.hotelAddress || "",
        cityId: hotel.cityId != null ? String(hotel.cityId) : "",
        city:
          hotel.cityName ||
          (hotel.hotelAddress
            ? hotel.hotelAddress.split(", ").pop() || "Unknown City"
            : "Unknown City"),
        price: hotel.baseRate ?? null,
        badge: hotel.baseRate ? "Rate Available" : "Rate Unavailable",
        image: ensureHotelImage(hotel.hotelImage),
        rating: hotel.starRating || 0,
        hotelType: "hotel",
        channelType: hotel.apiType?.toLowerCase() || "inhouse",
      }));
      try {
        sessionStorage.setItem(PREFETCH_KEYS.hotel, JSON.stringify(mapped));
      } catch {
        /* ignore */
      }
      setPrefetchStatus({ hotel: "success" });
    })
    .catch(() => setPrefetchStatus({ hotel: "error" }));

  axiosInstance
    .post("/api/makeYourOwnPackageV2/getTransferInhouse", transferPayload)
    .then((res) => {
      const mapped = Array.isArray(res.data)
        ? res.data.map((cab, index) => ({
            cabid: cab.cabid || cab.cabId || `cab-${index}`,
            cabname: cab.cabname || cab.cabName || "Transfer Vehicle",
            cabdetails: cab.cabdetails || "",
            cabpic: ensureTransferImage(cab.cabpic || cab.cabPic),
            noOfCabs: cab.noOfCabs || 1,
            cityId: cab.cityId != null ? String(cab.cityId) : "",
            cityName: cab.cityName || "",
            searchCabDetailsDTO: Array.isArray(cab.searchCabDetailsDTO)
              ? cab.searchCabDetailsDTO
              : [],
          }))
        : [];
      try {
        sessionStorage.setItem(PREFETCH_KEYS.transfer, JSON.stringify(mapped));
      } catch {
        /* ignore */
      }
      setPrefetchStatus({ transfer: "success" });
    })
    .catch(() => setPrefetchStatus({ transfer: "error" }));

  axiosInstance
    .post("/api/makeYourOwnPackageV2/getActivityInhouse", tourPayload)
    .then((res) => {
      const mapped = Array.isArray(res.data)
        ? res.data.map((activity, index) => ({
            id: activity.activityId || `activity-${index}`,
            activityName: activity.activityname || "",
            activityDetails: activity.activityDetails || "",
            cityId: activity.cityId != null ? String(activity.cityId) : "",
            cityName: activity.cityName || "",
            starRating: activity.starRating || 0,
            totalRate: activity.totalRate || activity.activityRate || 0,
            totalRateWithoutMrk:
              activity.totalRateWithoutmrk || activity.activityRate || 0,
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
              activity.viatorActivityDurationFrom &&
              activity.viatorActivityDurationTo
                ? `${activity.viatorActivityDurationFrom} - ${activity.viatorActivityDurationTo}`
                : null,
            apiType: activity.apiType || null,
            viatorProductCode: activity.viatorProductCode || null,
          }))
        : [];
      try {
        sessionStorage.setItem(PREFETCH_KEYS.tour, JSON.stringify(mapped));
      } catch {
        /* ignore */
      }
      setPrefetchStatus({ tour: "success" });
    })
    .catch(() => setPrefetchStatus({ tour: "error" }));
};

export default function MakeUrOwnPackageV2() {
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

  const [nationalityList, setNationalityList] = useState([]);
  const [selectedNationality, setSelectedNationality] = useState(null);
  const [destinationOptions, setDestinationOptions] = useState([]);
  const [isDestinationLoading, setIsDestinationLoading] = useState(false);
  const [isNationalityLoading, setIsNationalityLoading] = useState(false);

  const [itinerary, setItinerary] = useState([
    { id: Date.now(), selectedDestination: null, nights: 1 }
  ]);
  const [travelDate, setTravelDate] = useState("");
  const [agent, setAgent] = useState("");
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [childAges, setChildAges] = useState([]);
  const [agents, setAgents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});

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
  const debouncedCitySearch = React.useRef(
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
        }));
        setDestinationOptions(options);
      } catch (error) {
        console.log("axios call error for city list:", error);
        setDestinationOptions([]);
      } finally {
        setIsDestinationLoading(false);
      }
    }, 300)
  ).current;

  // Debounced country search function
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
        console.log("axios call error for country list:", error);
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

  const agentList = async () => {
    try {
      const response = await axiosInstance.get("/api/agent?activeOnly=true");
      setAgents(response.data);
    } catch (error) {
      console.log("error for agent axios list:", error);
      setAgents([]);
    }
  };

  useEffect(() => {
    countryList();
    agentList();
  }, []);

  const addDestination = () => {
    setItinerary([...itinerary, { id: Date.now(), selectedDestination: null, nights: 1 }]);
  };

  const removeDestination = (id) => {
    if (itinerary.length > 1) {
      setItinerary(itinerary.filter(item => item.id !== id));
    }
  };

  const updateDestination = (id, destination) => {
    setItinerary(itinerary.map(item => 
      item.id === id ? { ...item, selectedDestination: destination } : item
    ));
    if (destination) clearError(`destination_${id}`);
  };

  const updateNights = (id, nights) => {
    setItinerary(itinerary.map(item => 
      item.id === id ? { ...item, nights: parseInt(nights) || 1 } : item
    ));
    if (nights) clearError(`nights_${id}`);
  };

  const formatDate = (date) => date.toISOString().split("T")[0];
  const today = formatDate(new Date());

  const validateForm = () => {
    const newErrors = {};

    if (!travelDate) {
      newErrors.travelDate = "Travel Date is required";
    }

    if (!isAgentRole && !agent) {
      newErrors.agent = "Agent is required";
    }

    if (!selectedNationality) {
      newErrors.nationality = "Native Country of Guest is required";
    }

    if (children > 0 && childAges.some(age => !age || age < 0 || age > 17)) {
      newErrors.childAges = "Child age must be between 0 and 17";
    }

    itinerary.forEach((item, index) => {
      if (!item.selectedDestination) {
        newErrors[`destination_${item.id}`] = "Destination is required";
      }
      if (!item.nights || item.nights < 1) {
        newErrors[`nights_${item.id}`] = "Nights must be at least 1";
      }
    });

    return newErrors;
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
      return;
    }

    if (agent) {
      sessionStorage.setItem("makeYourOwnPackageAgentId", agent);
      localStorage.setItem("makeYourOwnPackageAgentId", agent);
    }

    // Store travel date in sessionStorage for use in booking page
    if (travelDate) {
      sessionStorage.setItem("makePkgTravelDate", travelDate);
    }

    // v2 flow flag — tells TopBar to route the cart "Proceed" button to
    // the v2 booking-page instead of the legacy one.
    sessionStorage.setItem("makePkgFlow", "v2");

    // Build the criteria payload once so we can both pass it via
    // location.state AND persist it to sessionStorage as a fallback —
    // location.state evaporates on page refresh / back-forward cache,
    // and the v2 search page falls back to sessionStorage when state is
    // missing so the hotel-search payload always carries destination +
    // nationality.
    const criteriaPayload = {
      travelDate,
      agent,
      nationality: selectedNationality,
      itinerary,
      adults,
      children,
      childAges: childAges.map((age) => parseInt(age) || 0),
      destination: itinerary[0].selectedDestination,
      nights: itinerary.reduce((acc, curr) => acc + curr.nights, 0),
    };
    try {
      sessionStorage.setItem(
        "makePkgV2Criteria",
        JSON.stringify(criteriaPayload)
      );
    } catch {
      /* private mode / quota — non-fatal */
    }

    // Drop any prior prefetch (criteria may have changed) and kick off
    // the three search endpoints in the background — by the time the
    // user reaches the combined search page it can hydrate from
    // sessionStorage without re-asking the operator.
    try {
      sessionStorage.removeItem(PREFETCH_KEYS.hotel);
      sessionStorage.removeItem(PREFETCH_KEYS.transfer);
      sessionStorage.removeItem(PREFETCH_KEYS.tour);
      sessionStorage.setItem(
        PREFETCH_KEYS.criteria,
        computeCriteriaKey(criteriaPayload)
      );
      sessionStorage.setItem(
        PREFETCH_KEYS.status,
        JSON.stringify({ hotel: "loading", transfer: "loading", tour: "loading" })
      );
    } catch {
      /* ignore */
    }
    prefetchCombinedResults(criteriaPayload);

    // The dedicated /addons page is removed from the flow — services are
    // all enabled by default and add-on selection happens as the last
    // wizard step on the search page itself. Persist the defaults the
    // search page expects to read from sessionStorage on mount.
    try {
      sessionStorage.setItem(
        "makePkgV2Services",
        JSON.stringify({ hotel: true, transfer: true, tour: true })
      );
      sessionStorage.setItem("makePkgV2VisaRequired", "NO");
    } catch {
      /* ignore */
    }

    // Clear any previous Redis cart in the background so the v2 flow
    // starts clean (used to be done on entry to /addons).
    const cartAgentId =
      sessionStorage.getItem("makeYourOwnPackageAgentId") ||
      localStorage.getItem("makeYourOwnPackageAgentId");
    if (cartAgentId) {
      axiosInstance
        .post(`/api/makeYourOwnPackageV2/cart/clear?userId=${cartAgentId}`)
        .then(() => {
          try {
            window.dispatchEvent(new Event("cartUpdated"));
          } catch {
            /* ignore */
          }
        })
        .catch(() => {
          /* best-effort */
        });
    }

    // Skip the /addons page and go straight to the combined search page.
    navigate("/new-booking/make-your-own-package-v2/search", {
      state: criteriaPayload,
    });

  };


  // const handleSearchSubmit = async (e) => {
  //   e.preventDefault();
  //   const formErrors = validateForm();
  //   if (Object.keys(formErrors).length > 0) {
  //     setErrors(formErrors);
  //     return;
  //   }
  //   setErrors({});
  //   setIsLoading(true);

  //   try {
  //     // Here you would implement the package search logic
  //     console.log("Package search submitted:", {
  //       travelDate,
  //       agent,
  //       nationality: selectedNationality,
  //       destination: selectedDestination,
  //       adults,
  //       children,
  //       nights,
  //     });

  //     // Simulate API call
  //     await new Promise(resolve => setTimeout(resolve, 2000));

  //     // Navigate to results or show success message
  //     alert("Package search completed! (This is a demo)");
  //   } catch (err) {
  //     console.error("Search failed:", err);
  //   } finally {
  //     setIsLoading(false);
  //   }
  // };

  // Read-only helpers for the layout below — no business logic lives
  // here; they only summarise state that already exists so the operator
  // can see the trip taking shape while filling the form.
  const totalNights = itinerary.reduce(
    (acc, curr) => acc + (parseInt(curr.nights) || 0),
    0
  );
  const hasFormErrors = Object.keys(errors).length > 0;

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4 hs-page myop-v2">
          {/* Journey indicator — same component on all three V2 pages so
              the operator always knows which phase they are in. */}
          <MyopV2JourneyStepper current={1} />

          {/* ── Search Card + Ads ── */}
          <div className="d-flex gap-3 align-items-start mb-4 hs-search-ads-row">
           <div className="flex-grow-1" style={{ minWidth: 0 }}>
          <Card
            className="shadow-sm rounded-xl myop-v2-static-card"
            style={{ backgroundColor: '#ffffff' }}
          >
            <Card.Body className="p-4">
              <div className="d-flex align-items-center mb-4">
                <div className="me-3">
                  <div className="bg-primary rounded p-2">
                    <FaSearch className="text-white" size={24} />
                  </div>
                </div>
                <div>
                  <h2 className="fw-bold text-dark mb-1">
                    Build Your Own Package
                  </h2>
                  <p className="text-muted mb-0">
                    Tell us when, who and where.
                  </p>
                </div>
              </div>

              <Form onSubmit={handleSearchSubmit}>
                {/* ── Group 1: travel details ── */}
                <div className="myop-v2-fieldgroup">
                  <div className="myop-v2-fieldgroup__title">
                    <span className="fw-semibold text-dark">
                      <FaCalendarAlt className="text-primary" />
                      Travel details
                    </span>
                    <span className="text-muted small">
                      Fields marked <span className="text-danger">*</span> are required
                    </span>
                  </div>
                  <Row className="g-4">
                    <Col lg={3} md={6}>
                      <Form.Group>
                        <Form.Label className="fw-semibold text-dark">
                          <FaCalendarAlt className="me-2" />
                          Travel Date <span className="text-danger">*</span>
                        </Form.Label>
                        <Form.Control
                          type="date"
                          value={travelDate}
                          min={today}
                          onChange={(e) => {
                            setTravelDate(e.target.value);
                            if (e.target.value) clearError("travelDate");
                          }}
                          className="form-control-modern"
                          isInvalid={!!errors.travelDate}
                        />
                        {errors.travelDate && (
                          <div className="text-danger small mt-1">
                            {errors.travelDate}
                          </div>
                        )}
                      </Form.Group>
                    </Col>

                    {!isAgentRole && (
                    <Col lg={3} md={6}>
                      <Form.Group>
                        <Form.Label className="fw-semibold text-dark">
                          <FaUser className="me-2" />
                          Agent <span className="text-danger">*</span>
                        </Form.Label>
                        <Form.Select
                          value={agent}
                          onChange={(e) => {
                            setAgent(e.target.value);
                            if (e.target.value) clearError("agent");
                          }}
                          className="form-control-modern"
                          isInvalid={!!errors.agent}
                        >
                          <option value="">SELECT</option>
                          {agents.map((agentItem) => (
                            <option key={agentItem.id} value={agentItem.id}>
                              {agentItem.companyName}
                            </option>
                          ))}
                        </Form.Select>
                        {errors.agent && (
                          <div className="text-danger small mt-1">
                            {errors.agent}
                          </div>
                        )}
                        <AgentBalanceDisplay agentId={agent} />
                      </Form.Group>
                    </Col>
                    )}

                    <Col lg={3} md={6}>
                      <Form.Group>
                        <Form.Label className="fw-semibold text-dark">
                          <FaGlobe className="me-2" />
                          Native Country of Guest <span className="text-danger">*</span>
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
                          placeholder="SELECT"
                          isSearchable
                          isClearable
                          className="modern-select"
                          menuPortalTarget={document.body}
                          styles={{
                            menuPortal: base => ({ ...base, zIndex: 9999 }),
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
                        {/* Surface UAE-resident status to the operator so
                            they can apply the resident rate. Matched on
                            country code "AE" so a label change can't
                            break the rule. */}
                        {selectedNationality?.code === "AE" && (
                          <div
                            className="mt-1 small fw-semibold"
                            style={{ color: "#0f7a3a" }}
                          >
                            Select "United Arab Emirates" if guest resident of UAE
                          </div>
                        )}
                      </Form.Group>
                    </Col>
                  </Row>
                </div>

                {/* ── Group 2: travellers ── */}
                <div className="myop-v2-fieldgroup">
                  <div className="myop-v2-fieldgroup__title">
                    <span className="fw-semibold text-dark">
                      <FaUsers className="text-primary" />
                      Travellers
                    </span>
                    <span className="text-muted small">
                      {adults} adult{adults === 1 ? "" : "s"}
                      {children > 0 ? ` · ${children} child${children === 1 ? "" : "ren"}` : ""}
                    </span>
                  </div>
                  <Row className="g-4">
                    <Col lg={3} md={6}>
                      <Form.Group>
                        <Form.Label className="fw-semibold text-dark">
                          <FaUsers className="me-2" />
                          No of adult <span className="text-danger">*</span>
                        </Form.Label>
                        <Form.Select
                          value={adults}
                          onChange={(e) => {
                            setAdults(parseInt(e.target.value) || 1);
                            if (e.target.value) clearError("adults");
                          }}
                          className="form-control-modern"
                          isInvalid={!!errors.adults}
                        >
                          {Array.from({ length: 9 }, (_, i) => i + 1).map((num) => (
                            <option key={num} value={num}>
                              {num}
                            </option>
                          ))}
                        </Form.Select>
                      </Form.Group>
                    </Col>

                    <Col lg={3} md={6}>
                      <Form.Group>
                        <Form.Label className="fw-semibold text-dark">
                          <FaChild className="me-2" />
                          No of Child
                        </Form.Label>
                        <Form.Select
                          value={children}
                          onChange={(e) => {
                            const newChildren = parseInt(e.target.value) || 0;
                            setChildren(newChildren);
                            // Initialize or adjust child ages array
                            if (newChildren > 0) {
                              const newChildAges = Array.from({ length: newChildren }, (_, i) =>
                                childAges[i] || ""
                              );
                              setChildAges(newChildAges);
                            } else {
                              setChildAges([]);
                            }
                            if (e.target.value) clearError("children");
                            clearError("childAges");
                          }}
                          className="form-control-modern"
                          isInvalid={!!errors.children}
                        >
                          {Array.from({ length: 6 }, (_, i) => i).map((num) => (
                            <option key={num} value={num}>
                              {num}
                            </option>
                          ))}
                        </Form.Select>
                      </Form.Group>
                    </Col>

                    {/* Child Age Fields — one per child, on the same grid
                        rhythm as the other traveller fields. The single
                        validation message is repeated under every flagged
                        input so it sits next to the box that is red. */}
                    {children > 0 && (
                      <>
                        {Array.from({ length: children }, (_, i) => {
                          // Display-only: the single validation key flags the
                          // group; highlight just the boxes that fail the same
                          // 0–17 rule so the operator sees which one to fix.
                          const ageValue = childAges[i];
                          const ageBad =
                            !!errors.childAges &&
                            (!ageValue || ageValue < 0 || ageValue > 17);
                          return (
                          <Col key={i} lg={3} md={6}>
                            <Form.Group>
                              <Form.Label className="fw-semibold text-dark">
                                <FaChild className="me-2" />
                                Child {i + 1} Age <span className="text-danger">*</span>
                              </Form.Label>
                              <Form.Control
                                type="number"
                                min="0"
                                max="17"
                                value={childAges[i] || ""}
                                onChange={(e) => {
                                  const newAges = [...childAges];
                                  newAges[i] = e.target.value;
                                  setChildAges(newAges);
                                  clearError("childAges");
                                }}
                                placeholder="Enter age"
                                className="form-control-modern"
                                isInvalid={ageBad}
                              />
                              {ageBad && (
                                <div className="text-danger small mt-1">
                                  {errors.childAges}
                                </div>
                              )}
                            </Form.Group>
                          </Col>
                          );
                        })}
                      </>
                    )}
                  </Row>
                </div>

                {/* ── Group 3: destinations & nights ── */}
                <div className="myop-v2-fieldgroup">
                  <div className="myop-v2-fieldgroup__title">
                    <span className="fw-semibold text-dark">
                      <FaMapMarkerAlt className="text-primary" />
                      Destinations &amp; nights
                    </span>
                    <span className="text-muted small">
                      {itinerary.length} destination{itinerary.length === 1 ? "" : "s"} · Total nights:{" "}
                      <span className="fw-semibold text-dark">{totalNights}</span>
                    </span>
                  </div>

                  {itinerary.map((item, index) => (
                    <div className="myop-v2-itin-row" key={item.id}>
                      <Row className="g-3 align-items-start">
                        <Col lg={7} md={7}>
                          <Form.Group>
                            <Form.Label className="fw-semibold text-dark">
                              <FaMapMarkerAlt className="me-2" />
                              Search Destination {itinerary.length > 1 ? `#${index + 1}` : ""} <span className="text-danger">*</span>
                            </Form.Label>
                            <div className="d-flex align-items-center gap-2">
                              {itinerary.length > 1 && (
                                <span className="myop-v2-itin-row__index small text-muted">
                                  {index + 1}
                                </span>
                              )}
                              <div className="flex-grow-1">
                                <Select
                                  options={destinationOptions}
                                  value={item.selectedDestination}
                                  onChange={(option) => updateDestination(item.id, option)}
                                  placeholder="Search destinations..."
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
                                    menuPortal: base => ({ ...base, zIndex: 9999 }),
                                    control: (base) => ({
                                      ...base,
                                      minHeight: "42px",
                                      border: "1px solid #dee2e6",
                                      "&:hover": { borderColor: "#86b7fe" },
                                    }),
                                  }}
                                />
                              </div>
                            </div>
                            {errors[`destination_${item.id}`] && (
                              <div className="text-danger small mt-1">
                                {errors[`destination_${item.id}`]}
                              </div>
                            )}
                          </Form.Group>
                        </Col>

                        <Col lg={3} md={3}>
                          <Form.Group>
                            <Form.Label className="fw-semibold text-dark">
                              <FaCalendarAlt className="me-2" />
                              Number of nights <span className="text-danger">*</span>
                            </Form.Label>
                            <Form.Control
                              type="number"
                              min="1"
                              max="30"
                              value={item.nights}
                              onChange={(e) => updateNights(item.id, e.target.value)}
                              className="form-control-modern"
                              isInvalid={!!errors[`nights_${item.id}`]}
                            />
                            {errors[`nights_${item.id}`] && (
                              <div className="text-danger small mt-1">
                                {errors[`nights_${item.id}`]}
                              </div>
                            )}
                          </Form.Group>
                        </Col>

                        {itinerary.length > 1 && (
                          <Col lg={2} md={2}>
                            <Form.Group>
                              {/* Invisible label keeps the button level with
                                  the inputs beside it. */}
                              <Form.Label className="fw-semibold text-dark d-none d-md-block">
                                &nbsp;
                              </Form.Label>
                              <div>
                                <Button
                                  variant="outline-danger"
                                  className="rounded-circle myop-v2-icon-btn"
                                  onClick={() => removeDestination(item.id)}
                                  title="Remove destination"
                                  aria-label={`Remove destination ${index + 1}`}
                                >
                                  <span className="fw-bold">×</span>
                                </Button>
                              </div>
                            </Form.Group>
                          </Col>
                        )}
                      </Row>
                    </div>
                  ))}

                  {/* One add action for the whole list instead of a "+"
                      on every row. Same handler as before. */}
                  <div className="mt-2">
                    <Button
                      variant="outline-primary"
                      onClick={addDestination}
                      title="Add another destination"
                    >
                      <FaPlus className="me-2" />
                      Add another destination
                    </Button>
                  </div>
                </div>

                <Row className="mt-4">
                  <Col className="d-flex flex-column align-items-center gap-2">
                    {hasFormErrors && (
                      <div className="text-danger small fw-semibold">
                        Please complete the highlighted fields above.
                      </div>
                    )}
                    <Button
                      type="submit"
                      // btn-search-modern is the shared red-pill CTA already
                      // used by SEARCH LONG STAY / SEARCH DAY STAY / SEARCH
                      // HOTEL / etc. — same red gradient (#EC0B43 → #C90939),
                      // same pill shape, same padding + hover elevation. So
                      // this page's primary CTA now visually rhymes with the
                      // rest of the platform. Bootstrap's btn-lg/px-5/py-3/
                      // rounded-pill are dropped since the shared class
                      // already covers size and shape.
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
                          Preparing your search...
                        </>
                      ) : (
                        <>
                          Continue to build your package
                          <FaArrowRight className="ms-2" />
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
           <AdvertisementCarousel
             cityId={itinerary?.[0]?.selectedDestination?.value}
             cityName={itinerary?.[0]?.selectedDestination?.label}
           />
          </div>

          {/* "What happens next" — replaces the static placeholder card so
              the space below the form explains the journey instead of
              looking like an empty results area. */}
          <Card className="shadow-sm rounded-xl myop-v2-static-card">
            <Card.Body className="p-4">
              <h4 className="fw-bold text-dark mb-3">What happens next</h4>
              <div className="myop-v2-next-steps">
                <div className="myop-v2-next-steps__item">
                  <span className="myop-v2-journey__dot small">1</span>
                  <div>
                    <div className="fw-semibold text-dark">Choose services</div>
                    <div className="text-muted small">
                      Hotel and tours &amp; activities are part of every package;
                      transfers and add-ons such as visa or meet &amp; greet are optional.
                    </div>
                  </div>
                </div>
                <div className="myop-v2-next-steps__item">
                  <span className="myop-v2-journey__dot small">2</span>
                  <div>
                    <div className="fw-semibold text-dark">Build the package</div>
                    <div className="text-muted small">
                      Add hotel rooms first, then transfers and activities from the
                      results prepared for these dates and destinations.
                    </div>
                  </div>
                </div>
                <div className="myop-v2-next-steps__item">
                  <span className="myop-v2-journey__dot small">3</span>
                  <div>
                    <div className="fw-semibold text-dark">Review &amp; book</div>
                    <div className="text-muted small">
                      Enter guest details, check prices and policies, then confirm
                      the booking.
                    </div>
                  </div>
                </div>
              </div>
            </Card.Body>
          </Card>
        </main>
      </div>
    </div>
  );
}
