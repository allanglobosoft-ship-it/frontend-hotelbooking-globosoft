import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Row,
  Col,
  Card,
  Form,
  Button,
  Accordion,
  Table,
  Badge,
  Alert,
  Spinner,
  Modal,
} from "react-bootstrap";
import {
  FaHotel,
  FaCalendarAlt,
  FaUsers,
  FaBed,
  FaMapMarkerAlt,
  FaCar,
  FaTicketAlt,
  FaChevronDown,
  FaChevronUp,
  FaCheckCircle,
  FaEdit,
  FaShoppingCart,
  FaPlus,
  FaRoute,
  FaClock,
  FaInfoCircle,
  FaArrowLeft,
  FaArrowRight,
} from "react-icons/fa";
import Sidebar from "../../../components/Sidebar";
import TopBar from "../../../components/TopBar";
import AgentBalanceDisplay from "../../../components/AgentBalanceDisplay";
import AddOnServicesPanel, {
  ADDON_SERVICES_CATALOG,
  collectEnabledAddOnServices,
  readAddOnServices,
  loadActiveAddOnCatalog,
  buildAddOnLineItemsForPayload,
} from "../../../components/AddOnServicesPanel";
import axiosInstance from "../../../components/AxiosInstance";
import toast from "react-hot-toast";
import "../../../styles/HotelBookingPage.css";
import "../../../styles/MakePkgBookingPage.css";
import "../../../styles/MakeYourOwnPackageV2.css";
import MyopV2JourneyStepper from "../../../components/myopv2/MyopV2JourneyStepper";

// v2 helpers — read the choice made on the /addons step. Visa is just
// YES/NO in v2; the legacy adult/child/infant rate inputs are removed.
const readV2VisaRequired = () => {
  try {
    return sessionStorage.getItem("makePkgV2VisaRequired") === "YES" ? "YES" : "NO";
  } catch {
    return "NO";
  }
};
const V2_SUPPORT_EMAIL = "support@yourdomain.com";
const V2_SUPPORT_PHONE = "+971-XX-XXXXXXX";

const MakePkgBookingPageV2 = () => {
  const v2VisaRequired = readV2VisaRequired();
  const navigate = useNavigate();
  const [cartData, setCartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [primaryGuest, setPrimaryGuest] = useState({
    salutation: "Mr",
    firstName: "",
    middleName: "",
    lastName: "",
    contactNumber: "",
    emailId: "",
    passportNumber: "",
    lpo: "",
  });
  const [visaRequired, setVisaRequired] = useState(false);
  const [visaDetails, setVisaDetails] = useState({
    visaAdult: "0",
    visaAdultRate: "0",
    visaChild: "0",
    visaChildRate: "0",
    visaInfant: "0",
    visaInfantRate: "0",
  });
  // Per-hotel state for Tourism Dirhams, Remarks, Special Request, and Booking Confirmation
  const [hotelTourismDirhams, setHotelTourismDirhams] = useState({});
  const [hotelRemarks, setHotelRemarks] = useState({});
  const [hotelSpecialRequests, setHotelSpecialRequests] = useState({});
  const [hotelBookingConfirmation, setHotelBookingConfirmation] = useState({});
  const [totalPrice, setTotalPrice] = useState(0);
  const [sellingPrice, setSellingPrice] = useState(0);
  // `tourismDirham` is the booking-level Tourism Dirham input shown
  // inside the Order Summary modal. The per-hotel inputs on the main
  // booking form populate `hotelTourismDirhams` (above). The grand
  // total uses BOTH sources via `aggregateTourismDirham` below — that
  // was the bug: the right-rail / order-summary totals previously read
  // only this booking-level field, so per-hotel TDs typed into the form
  // never reached the final payable amount.
  const [tourismDirham, setTourismDirham] = useState("");

  // Sum of every Tourism Dirham source on the page — every per-hotel
  // input + the booking-level input. Returns 0 if all are blank /
  // non-numeric. Used by:
  //   • the right-rail "Total Package Price"
  //   • the Order Summary modal's Selling Price / Total Price cards
  //   • the Rate Split breakdown
  //   • the save payload (sellingPrice, totalPrice, tourismDirham
  //     fields all share the same aggregate, so no double counting)
  const aggregateTourismDirham = React.useMemo(() => {
    const toNum = (v) => {
      if (v === null || v === undefined || v === "") return 0;
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : 0;
    };
    let sum = 0;
    Object.values(hotelTourismDirhams || {}).forEach((v) => {
      sum += toNum(v);
    });
    sum += toNum(tourismDirham);
    return sum;
  }, [hotelTourismDirhams, tourismDirham]);

  // ── Add-On Services badge counter ──────────────────────────────────
  // The actual selections live in sessionStorage (driven by the
  // AddOnServicesPanel) — we just track the count locally so the
  // accordion header can show "(N on)" without re-reading storage on
  // every render. Refreshed when the header is clicked / the inner
  // panel loses focus.
  const [addOnsCount, setAddOnsCount] = useState(() => {
    try {
      const all = readAddOnServices();
      return Object.values(all).filter((v) => v && v.enabled).length;
    } catch {
      return 0;
    }
  });
  const refreshAddOnsCount = () => {
    try {
      const all = readAddOnServices();
      setAddOnsCount(Object.values(all).filter((v) => v && v.enabled).length);
    } catch {
      // ignore — sessionStorage rejected in private mode etc.
    }
  };

  // Dynamic add-on catalog — read from the sessionStorage cache that the
  // search page populates on mount (key `mypkg_addon_catalog_v2`). Falls
  // back to a fresh API call when the booking page is opened directly via
  // a deep link. Drives the add-on price line in the summary and the
  // line-items array on the booking POST payload.
  const [addOnCatalog, setAddOnCatalog] = useState(() => {
    try {
      const raw = sessionStorage.getItem("mypkg_addon_catalog_v2");
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    if (addOnCatalog.length > 0) return;
    let cancelled = false;
    (async () => {
      const list = await loadActiveAddOnCatalog();
      if (!cancelled) setAddOnCatalog(list);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Single source of truth for the figure that gets rolled into the grand
  // total + the bumped totalPrice / sellingPrice on the booking payload.
  // Sums EVERY enabled add-on's unit price (including Visa and Meet &
  // Greet, whose dedicated summary rows below show the same amount —
  // they're not double-counted because `otherAddonsPrice` further down
  // filters them out from the "Add-on Services" row.) Recomputed whenever
  // the catalog changes OR the toggle count changes.
  const addOnsTotal = React.useMemo(() => {
    if (!Array.isArray(addOnCatalog) || addOnCatalog.length === 0) return 0;
    let svcMap = {};
    try { svcMap = readAddOnServices(); } catch { svcMap = {}; }
    return addOnCatalog.reduce((sum, svc) => {
      const slot = svcMap?.[svc.key];
      if (!slot || slot.enabled !== true) return sum;
      const unit = Number(svc.unitPrice) || 0;
      const qty = Number(slot.quantity) > 0 ? Number(slot.quantity) : 1;
      return sum + unit * qty;
    }, 0);
    // addOnsCount is intentionally listed so the memo recomputes whenever
    // the operator flips a toggle (the count is bumped by the panel each
    // time). eslint can't see the indirect read via readAddOnServices().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addOnCatalog, addOnsCount]);

  // Itinerary state
  const [itineraryList, setItineraryList] = useState([]);
  const [selectedItineraries, setSelectedItineraries] = useState({});
  const [loadingItinerary, setLoadingItinerary] = useState(false);
  const [itineraryExpanded, setItineraryExpanded] = useState(false);

  // Itinerary modal state
  const [showItineraryModal, setShowItineraryModal] = useState(false);
  const [currentDay, setCurrentDay] = useState(null); // stores the activity date string
  const [itinerarySearchTerm, setItinerarySearchTerm] = useState("");
  const [filteredItineraryList, setFilteredItineraryList] = useState([]);
  const [expandedDescriptions, setExpandedDescriptions] = useState({});

  // Guest details for each room
  const [roomGuests, setRoomGuests] = useState({});

  // Transfer/Cab details state
  const [transferDetails, setTransferDetails] = useState({});

  // Activity/Tour details state
  const [activityDetails, setActivityDetails] = useState({});

  // Validation errors state
  const [validationErrors, setValidationErrors] = useState({});

  // ── UI-only state (no effect on payload / validation) ──────────
  // Accordion open state is controlled so the sections that need input
  // (Guest Details "5" and Hotels "1", which holds the per-room guest
  // names) start open, and so a failed submit can expand whichever
  // section contains the highlighted fields before handleSubmit scrolls
  // to the first `.is-invalid` control.
  const [openSections, setOpenSections] = useState(["5", "1"]);
  // Toggles the read-only price breakdown in the Package Summary card.
  const [showPriceBreakup, setShowPriceBreakup] = useState(false);
  // Bumped by the page-level submit button right before handleSubmit runs,
  // so the auto-expand below fires once per attempt (handleGuestChange
  // rebuilds the validationErrors object on every keystroke, which would
  // otherwise re-open a section the operator deliberately collapsed).
  const [submitAttempt, setSubmitAttempt] = useState(0);
  useEffect(() => {
    if (submitAttempt === 0) return;
    const keys = Object.keys(validationErrors || {});
    if (keys.length === 0) return;
    const needed = [];
    if (keys.some((k) => k.startsWith("primaryGuest_"))) needed.push("5");
    if (keys.some((k) => k.startsWith("hotel_"))) needed.push("1");
    if (needed.length === 0) return;
    setOpenSections((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      let changed = false;
      needed.forEach((k) => {
        if (!next.includes(k)) {
          next.push(k);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    // validationErrors is read on purpose only when a submit attempt bumps
    // the counter (both updates land in the same event, so the render this
    // effect follows already carries the fresh error map).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitAttempt]);

  // Order summary modal state
  const [showOrderSummaryModal, setShowOrderSummaryModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Pre-Order-Summary policy modal — shown FIRST when the operator clicks
  // the page's "Confirm Booking" button. T&C + Cancellation Policies render
  // service-wise here, with two mandatory global checkboxes; ticking both
  // and clicking "Continue to Order Summary" advances to the Order Summary
  // modal. Closes/cancels return the operator to the booking page with no
  // state change. The acceptance flags ride along with the v2 save payload
  // so the audit columns on mypkg_v2_booking are populated.
  const [showPolicyModal, setShowPolicyModal] = useState(false);

  // ── Service policies (Make Your Own Package V2) ──────────────────
  // Service-wise Terms & Conditions and Cancellation Policies displayed
  // inside the order summary modal. Keyed by item id within each bucket
  // ({ hotel:{ [hotelId]: {terms:[], cancellations:[]} }, cab: {...},
  //   activity:{ [activityId]: {terms:[]} } }). Fetched lazily when the
  // confirmation modal opens — the booking-page mount and all other
  // existing flows are unaffected.
  const [servicePolicies, setServicePolicies] = useState({
    hotel: {},
    cab: {},
    activity: {},
  });
  const [policiesLoading, setPoliciesLoading] = useState(false);
  // Two global acceptance checkboxes — the user must tick both before
  // the "Confirm Booking" button is enabled. Reset whenever the order
  // summary modal closes so they have to re-tick on every confirmation.
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedCancellations, setAcceptedCancellations] = useState(false);

  // Initialize guest details for rooms
  const initializeRoomGuests = (cartItems) => {
    const guests = {};
    const firstHotelIndex = cartItems.findIndex((i) => i.hotel);

    cartItems.forEach((item, hotelIndex) => {
      if (item.hotel) {
        const hotel = item.hotel || {};
        const searchRoomDTOs = hotel.searchRoomDTOs || [];
        searchRoomDTOs.forEach((room, roomIndex) => {
          const adults = parseInt(room.adult || room.adults || 1);
          const children = parseInt(room.child || room.children || 0);
          const totalGuests = adults + children;

          const key = `${hotelIndex}-${roomIndex}`;
          guests[key] = Array.from({ length: totalGuests }, (_, guestIndex) => {
            // Master Guest: First guest of the first room in the first hotel
            const isMasterGuest =
              hotelIndex === firstHotelIndex &&
              roomIndex === 0 &&
              guestIndex === 0;

            if (isMasterGuest) {
              return {
                salutation: primaryGuest.salutation || "Mr",
                firstName: primaryGuest.firstName || "",
                lastName: primaryGuest.lastName || "",
                gender: "Male", // Default for master guest
                isChild: false,
                age: "",
              };
            } else {
              // Dummy data for all other guests (temporary/testing purposes)
              const isChild = guestIndex >= adults;
              return {
                salutation: isChild ? "Master" : "Mr",
                firstName: "",
                lastName: "",
                gender: "Male",
                isChild: isChild,
                age: isChild ? room.childAge?.[guestIndex - adults] || "5" : "",
              };
            }
          });
        });
      }
    });
    setRoomGuests(guests);
  };

  // Initialize transfer details
  const initializeTransferDetails = (cartItems) => {
    const details = {};
    cartItems.forEach((item, index) => {
      if (item.cab) {
        const cab = item.cab || {};
        const cabDetails = cab.details || {};
        details[index] = {
          transporterName:
            cab.transporter ||
            cab.transporterName ||
            cabDetails.transporter ||
            cabDetails.transporterName ||
            "",
          contactNumber: cab.contactNumber || cabDetails.contactNumber || "",
          driverName: cab.driverName || cabDetails.driverName || "",
          driverContact: cab.driverContact || cabDetails.driverContact || "",
        };
      }
    });
    setTransferDetails(details);
  };

  // Initialize activity details
  const initializeActivityDetails = (cartItems) => {
    const details = {};
    cartItems.forEach((item, index) => {
      if (item.activity) {
        const activity = item.activity || {};
        const activityData = activity.details || {};
        details[index] = {
          driverName: activity.driverName || activityData.driverName || "",
          driverContact: activity.driverContact || activityData.driverContact || "",
        };
      }
    });
    setActivityDetails(details);
  };

  // Initialize hotel-specific fields (Tourism Dirhams, Remarks, Special Request, Booking Confirmation)
  const initializeHotelFields = (cartItems) => {
    const tourismDirhams = {};
    const remarks = {};
    const specialRequests = {};
    const bookingConfirmations = {};

    let hotelIndex = 0;
    cartItems.forEach((item) => {
      if (item.hotel) {
        tourismDirhams[hotelIndex] = "0";
        remarks[hotelIndex] = "";
        specialRequests[hotelIndex] = "";
        bookingConfirmations[hotelIndex] = "Book & Voucher";
        hotelIndex++;
      }
    });

    setHotelTourismDirhams(tourismDirhams);
    setHotelRemarks(remarks);
    setHotelSpecialRequests(specialRequests);
    setHotelBookingConfirmation(bookingConfirmations);
  };

  // Load cart data on mount
  useEffect(() => {
    const loadCartData = () => {
      try {
        const stored = sessionStorage.getItem("makePkgCartData");
        if (stored) {
          const parsed = JSON.parse(stored);
          console.log("Cart data loaded:", parsed);
          setCartData(parsed);
          calculatePrices(parsed);
          initializeRoomGuests(parsed);
          initializeTransferDetails(parsed);
          initializeActivityDetails(parsed);
          initializeHotelFields(parsed);
        } else {
          toast.error("No cart data found. Please add items to cart first.");
          navigate("/new-booking/make-your-own-package");
        }
      } catch (err) {
        console.error("Error loading cart data:", err);
        toast.error("Failed to load cart data.");
        navigate("/new-booking/make-your-own-package");
      } finally {
        setLoading(false);
      }
    };

    loadCartData();
  }, [navigate]);

  // Handle guest detail change
  const handleGuestChange = (
    hotelIndex,
    roomIndex,
    guestIndex,
    field,
    value,
  ) => {
    const firstHotelIndex = cartData.findIndex((item) => item.hotel);
    const isFirstHotel = hotelIndex === firstHotelIndex;
    const isMasterGuest =
      isFirstHotel && roomIndex === 0 && guestIndex === 0;

    // 1. Sync to primaryGuest state if Master Guest is edited (First Hotel, Room 1, Adult 1)
    if (isMasterGuest) {
      if (field === "firstName" || field === "lastName") {
        setPrimaryGuest((prev) => ({ ...prev, [field]: value }));
      } else if (field === "gender" || field === "salutation") {
        // Sync salutation directly, or map gender to title (salutation)
        let mappedSalutation = value;
        if (field === "gender") {
          if (value === "Male") mappedSalutation = "Mr";
          else if (value === "Female") mappedSalutation = "Mrs";
        }
        setPrimaryGuest((prev) => ({
          ...prev,
          salutation: mappedSalutation || prev.salutation,
        }));
      }
    }

    setRoomGuests((prev) => {
      const updated = { ...prev };

      // 2. Identify all keys to update. If editing the first hotel, sync across ALL hotels.
      const targetHotelIndices = isFirstHotel
        ? cartData
            .map((item, idx) => (item.hotel ? idx : -1))
            .filter((idx) => idx !== -1)
        : [hotelIndex];

      targetHotelIndices.forEach((idx) => {
        const key = `${idx}-${roomIndex}`;
        if (!updated[key]) {
          updated[key] = [];
        }
        const guests = [...updated[key]];

        // Ensure guest object exists, create if it doesn't
        if (!guests[guestIndex]) {
          guests[guestIndex] = {
            salutation: "",
            firstName: "",
            lastName: "",
            gender: "",
            isChild: false,
            age: "",
          };
        }

        // Update the guest field
        guests[guestIndex] = {
          ...guests[guestIndex],
          [field]: value,
        };

        updated[key] = guests;
      });

      return updated;
    });

    // Clear validation errors for all affected fields
    const targetHotelIndices = isFirstHotel
      ? cartData
          .map((item, idx) => (item.hotel ? idx : -1))
          .filter((idx) => idx !== -1)
      : [hotelIndex];

    setValidationErrors((prev) => {
      const updated = { ...prev };
      targetHotelIndices.forEach((idx) => {
        const errorKey = `hotel_${idx}_room_${roomIndex}_guest_${guestIndex}_${field}`;
        delete updated[errorKey];
      });
      if (isMasterGuest) {
        const primaryPrefix = `primaryGuest_${field === 'gender' ? 'salutation' : field}`;
        delete updated[primaryPrefix];
      }
      return updated;
    });
  };

  // Handle primary guest change
   const handlePrimaryGuestChange = (field, value) => {
    setPrimaryGuest((prev) => ({ ...prev, [field]: value }));

    // Sync Master Guest automatically if primary fields are edited
    const syncFields = ["salutation", "firstName", "lastName"];
    if (syncFields.includes(field)) {
      const firstHotelIndex = cartData.findIndex((item) => item.hotel);
      if (firstHotelIndex !== -1) {
        const guestKey = `${firstHotelIndex}-0`; // Master Guest Key
        setRoomGuests((prevGuests) => {
          if (!prevGuests[guestKey] || prevGuests[guestKey].length === 0)
            return prevGuests;

          const updatedGuests = { ...prevGuests };
          const roomGuestsArray = [...updatedGuests[guestKey]];
          roomGuestsArray[0] = { ...roomGuestsArray[0], [field]: value };
          updatedGuests[guestKey] = roomGuestsArray;
          return updatedGuests;
        });
      }
    }

    // Real-time validation for email format
    if (field === "emailId" && value.trim() !== "") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        setValidationErrors((prev) => ({
          ...prev,
          primaryGuest_emailId: "Please enter a valid email address",
        }));
        return;
      }
    }

    // Clear validation error when user starts typing
    const errorKey = `primaryGuest_${field}`;
    if (validationErrors[errorKey]) {
      setValidationErrors((prev) => {
        const updated = { ...prev };
        delete updated[errorKey];
        return updated;
      });
    }

    // NEW: Sync primary guest name to the first transfer's driver name
    if (field === "firstName" || field === "lastName") {
      syncGuestToDriver();
    }
  };

  // Helper to sync guest names to driver names
  const syncGuestToDriver = (updatedRoomGuests = null) => {
    const guestsToUse = updatedRoomGuests || roomGuests;
    const hotelIndices = cartData
      .map((item, idx) => (item.hotel ? idx : -1))
      .filter((idx) => idx !== -1);
    const transferIndices = cartData
      .map((item, idx) => (item.cab ? idx : -1))
      .filter((idx) => idx !== -1);

    setTransferDetails((prev) => {
      const updated = { ...prev };
      transferIndices.forEach((tIdx, i) => {
        const hIdx = hotelIndices[i];
        if (hIdx !== undefined) {
          const guestKey = `${hIdx}-0`;
          const firstGuest = guestsToUse[guestKey]?.[0];
          if (firstGuest && (firstGuest.firstName || firstGuest.lastName)) {
            const fullName = `${firstGuest.firstName || ""} ${firstGuest.lastName || ""}`.trim();
            if (!updated[tIdx]) updated[tIdx] = {};
            updated[tIdx] = {
              ...updated[tIdx],
              driverName: fullName,
            };
          }
        }
      });
      return updated;
    });

    // NEW: Sync guest name to activity's driver name
    const activityIndices = cartData
      .map((item, idx) => (item.activity ? idx : -1))
      .filter((idx) => idx !== -1);

    setActivityDetails((prev) => {
      const updated = { ...prev };
      activityIndices.forEach((aIdx, i) => {
        const hIdx = hotelIndices[i];
        if (hIdx !== undefined) {
          const guestKey = `${hIdx}-0`;
          const firstGuest = guestsToUse[guestKey]?.[0];
          if (firstGuest && (firstGuest.firstName || firstGuest.lastName)) {
            const fullName = `${firstGuest.firstName || ""} ${firstGuest.lastName || ""}`.trim();
            if (!updated[aIdx]) updated[aIdx] = {};
            updated[aIdx] = {
              ...updated[aIdx],
              driverName: fullName,
            };
          }
        }
      });
      return updated;
    });
  };

  // UseEffect to sync when cartData or roomGuests changes initially
  useEffect(() => {
    if (cartData.length > 0 && Object.keys(roomGuests).length > 0) {
      syncGuestToDriver();
    }
  }, [cartData, roomGuests]);

  // Fetch itinerary details
  const fetchItineraryDetails = async () => {
    if (itineraryList.length > 0) {
      setItineraryExpanded(true);
      return; // Already loaded
    }

    try {
      setLoadingItinerary(true);
      const response = await axiosInstance.get("/api/master/itenaryDetails");
      if (Array.isArray(response.data)) {
        setItineraryList(response.data);
        setFilteredItineraryList(response.data);
        setItineraryExpanded(true);
      } else {
        toast.error("Failed to load itinerary details.");
      }
    } catch (err) {
      console.error("Error fetching itinerary:", err);
      toast.error("Failed to load itinerary details.");
    } finally {
      setLoadingItinerary(false);
    }
  };

  useEffect(() => {
    fetchItineraryDetails();
  }, []);

  // ── Fetch service-wise policies when the confirmation modal opens ──
  // Hotel:   GET /api/hotels/{hotelId}/terms-and-conditions-package  (new endpoint)
  //          GET /api/hotels/{hotelId}/policies               (existing)
  // Cab:     GET /api/cabRates/cab/{cabId}/policies           (new endpoint)
  // Activity:GET /api/activityRate/inclutionAndTerms/{id}     (existing — type=2 only)
  //
  // Only fired when the modal flips open AND only for cart items that
  // are actually in the cart, so unselected services never appear and
  // never trigger network calls. Failures fall back to empty arrays so
  // the user can still tick acceptance and proceed.
  useEffect(() => {
    if (!showPolicyModal) {
      // Re-arm acceptance gates whenever the policy modal closes (either
      // because the operator cancelled or because they continued to the
      // Order Summary). Re-opening the modal forces a fresh tick of both
      // checkboxes, and a follow-on save attempt without going through
      // the modal again still has the in-memory acceptance flags set —
      // we only reset when re-entering the policy step or cancelling.
      // (`proceedFromPolicyModal` sets showPolicyModal=false before this
      //  runs, so the values it just set get cleared; that's by design —
      //  we re-set them in the v2 payload from the modal acceptance, see
      //  `confirmBooking`).
      // ↑ Actually we need to PRESERVE the accepted state into the Order
      // Summary step so the v2 payload sees true. So: only clear on
      // CANCEL (modal explicitly closed without proceeding). We model
      // that with a small ref-like indicator: if proceedFromPolicyModal
      // ran, it sets showOrderSummaryModal=true immediately — so the
      // safest reset is to bind to *both* modals being closed.
      if (!showOrderSummaryModal) {
        setAcceptedTerms(false);
        setAcceptedCancellations(false);
      }
      return;
    }
    let cancelled = false;
    const run = async () => {
      setPoliciesLoading(true);
      try {
        const next = { hotel: {}, cab: {}, activity: {} };

        // Hotel IDs in cart
        const hotelIds = Array.from(
          new Set(
            (cartData || [])
              .filter((it) => it && it.hotel)
              .map((it) => it.hotel?.hotelId)
              .filter((v) => v !== undefined && v !== null && v !== "")
              .map((v) => String(v))
          )
        );
        // Cab IDs in cart
        const cabIds = Array.from(
          new Set(
            (cartData || [])
              .filter((it) => it && it.cab)
              .map((it) => it.cab?.cabId)
              .filter((v) => v !== undefined && v !== null && v !== "")
              .map((v) => String(v))
          )
        );
        // Activity IDs (these are actually activityRate IDs — see
        // TripServiceImpl line 1094, the FE field naming is legacy).
        const activityIds = Array.from(
          new Set(
            (cartData || [])
              .filter((it) => it && it.activity)
              .map((it) => it.activity?.activityId)
              .filter((v) => v !== undefined && v !== null && v !== "")
              .map((v) => String(v))
          )
        );

        await Promise.all([
          // Hotels — terms + cancellation are two separate endpoints.
          ...hotelIds.map(async (hotelId) => {
            const slot = { terms: [], cancellations: [] };
            try {
              const tcRes = await axiosInstance.get(
                `/api/hotels/${hotelId}/terms-and-conditions-package`
              );
              slot.terms = Array.isArray(tcRes.data)
                ? tcRes.data
                    .map((r) => (r && (r.description || r.text)) || "")
                    .filter((s) => typeof s === "string" && s.trim().length > 0)
                : [];
            } catch (e) {
              slot.terms = [];
            }
            try {
              const polRes = await axiosInstance.get(
                `/api/hotels/${hotelId}/policies`
              );
              // Backend returns:
              //   { hotelId, policies: { cancellationPolicy: [...],
              //                          amendmentPolicy: [...],
              //                          childPolicy: [...] },
              //     message, success }
              // — note the nested `policies` wrapper and the SINGULAR field
              // names. The earlier code read `cancellationPolicies` off the
              // top level, which is why nothing rendered. Each entry is a
              // policy DTO with a `policyText` (or `text` / `description`
              // on legacy responses); fall through to date+value as a last
              // resort so a partially-filled row still surfaces something
              // useful instead of an empty bullet. Amendment + child
              // policies are also added — operators want the full picture
              // alongside cancellation, and they share the same UX gate.
              const pol = polRes?.data?.policies || {};
              const cancellation = Array.isArray(pol.cancellationPolicy)
                ? pol.cancellationPolicy
                : [];
              const amendment = Array.isArray(pol.amendmentPolicy)
                ? pol.amendmentPolicy
                : [];
              const child = Array.isArray(pol.childPolicy) ? pol.childPolicy : [];

              const toText = (p, kind) => {
                if (typeof p === "string") return p;
                if (!p || typeof p !== "object") return "";
                const text = p.policyText || p.text || p.description || "";
                if (text && text.trim().length > 0) return text.trim();
                // Synthesise a readable line from the dated row when
                // policyText was never set on the backend side.
                const parts = [];
                if (kind) parts.push(kind);
                if (p.fromDate && p.toDate) {
                  parts.push(`from ${p.fromDate} to ${p.toDate}`);
                } else if (p.fromDate) {
                  parts.push(`from ${p.fromDate}`);
                }
                if (p.value != null) {
                  parts.push(
                    `${p.value}${p.percentOrAmount === "PERCENT" ? "%" : ""}`
                  );
                }
                return parts.join(" — ");
              };

              const cancellationLines = cancellation
                .map((p) => toText(p, "Cancellation charge"))
                .filter((s) => typeof s === "string" && s.trim().length > 0);
              const amendmentLines = amendment
                .map((p) => toText(p, "Amendment charge"))
                .filter((s) => typeof s === "string" && s.trim().length > 0);
              const childLines = child
                .map((p) => toText(p, "Child policy"))
                .filter((s) => typeof s === "string" && s.trim().length > 0);

              // Cancellation section on the modal aggregates all three
              // policy categories — operators view them as one bucket of
              // "what happens after booking" rules. De-dup on the way in.
              const merged = [];
              const seen = new Set();
              [...cancellationLines, ...amendmentLines, ...childLines].forEach(
                (line) => {
                  const key = line.toLowerCase();
                  if (!seen.has(key)) {
                    seen.add(key);
                    merged.push(line);
                  }
                }
              );
              slot.cancellations = merged;
            } catch (e) {
              slot.cancellations = [];
            }
            next.hotel[hotelId] = slot;
          }),
          // Cabs — single endpoint returns both lists.
          ...cabIds.map(async (cabId) => {
            const slot = { terms: [], cancellations: [] };
            try {
              const res = await axiosInstance.get(
                `/api/cabRates/cab/${cabId}/policies`
              );
              const terms = res?.data?.termsAndConditions || [];
              const cancellations = res?.data?.cancellationPolicies || [];
              slot.terms = Array.isArray(terms)
                ? terms.filter((s) => typeof s === "string" && s.trim().length > 0)
                : [];
              slot.cancellations = Array.isArray(cancellations)
                ? cancellations.filter(
                    (s) => typeof s === "string" && s.trim().length > 0
                  )
                : [];
            } catch (e) {
              /* keep empty */
            }
            next.cab[cabId] = slot;
          }),
          // Activities — existing endpoint stores three row types
          // distinguished by `type`:
          //   1 = Inclusions (not shown on the booking modal)
          //   2 = Terms & Conditions
          //   3 = Cancellation Policy (new — added on the activity-rates
          //       page in this iteration; saves through the same /save
          //       endpoint with type=3)
          ...activityIds.map(async (activityId) => {
            const slot = { terms: [], cancellations: [] };
            try {
              const res = await axiosInstance.get(
                `/api/activityRate/inclutionAndTerms/${activityId}`
              );
              const rows = Array.isArray(res?.data) ? res.data : [];
              slot.terms = rows
                .filter((r) => r && Number(r.type) === 2)
                .map((r) => String(r.data || "").trim())
                .filter((s) => s.length > 0);
              slot.cancellations = rows
                .filter((r) => r && Number(r.type) === 3)
                .map((r) => String(r.data || "").trim())
                .filter((s) => s.length > 0);
            } catch (e) {
              /* keep empty */
            }
            next.activity[activityId] = slot;
          }),
        ]);

        if (!cancelled) setServicePolicies(next);
      } finally {
        if (!cancelled) setPoliciesLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [showPolicyModal, showOrderSummaryModal, cartData]);

  // Filter itinerary list based on search term
  useEffect(() => {
    if (itinerarySearchTerm.trim().length >= 4) {
      const filtered = itineraryList.filter((item) => {
        const heading = (item.itineraryHeading || "").toLowerCase();
        const desc = (item.itineraryDesc || "").toLowerCase();
        const search = itinerarySearchTerm.toLowerCase();
        return heading.includes(search) || desc.includes(search);
      });
      setFilteredItineraryList(filtered);
    } else if (itinerarySearchTerm.trim().length === 0) {
      setFilteredItineraryList(itineraryList);
    } else {
      setFilteredItineraryList([]);
    }
  }, [itinerarySearchTerm, itineraryList]);

  // Handle opening itinerary modal for a specific day
  const handleOpenItineraryModal = (day) => {
    setCurrentDay(day);
    setItinerarySearchTerm("");
    setFilteredItineraryList(itineraryList);
    setShowItineraryModal(true);
  };

  // Handle closing itinerary modal
  const handleCloseItineraryModal = () => {
    setShowItineraryModal(false);
    setCurrentDay(null);
    setItinerarySearchTerm("");
    setExpandedDescriptions({});
  };

  // Handle itinerary selection in modal
  const handleItineraryToggle = (itineraryId) => {
    if (!currentDay) return;

    setSelectedItineraries((prev) => {
      const dayItineraries = prev[currentDay] || [];
      if (dayItineraries.includes(itineraryId)) {
        return {
          ...prev,
          [currentDay]: dayItineraries.filter((id) => id !== itineraryId),
        };
      } else {
        return {
          ...prev,
          [currentDay]: [...dayItineraries, itineraryId],
        };
      }
    });
  };

  // Calculate total and selling prices
  const calculatePrices = (cartItems) => {
    let total = 0; // Total Price (without markup) - sum of totalRateWithoutmrk
    let selling = 0; // Selling Price (with markup) - sum of totalRate

    cartItems.forEach((item) => {
      if (item.hotel) {
        const hotel = item.hotel;
        // Selling Price = totalRate (with markup)
        const sellPrice = parseFloat(hotel.totalRate || 0);
        // Total Price = totalRateWithoutmrk (without markup)
        const price = parseFloat(
          hotel.totalRateWithoutmrk || hotel.totalRate || 0,
        );
        total += price;
        selling += sellPrice;
      } else if (item.activity) {
        const activity = item.activity;
        // Selling Price = totalRate (with markup)
        const sellPrice = parseFloat(activity.totalRate || 0);
        // Total Price = totalRateWithoutmrk (without markup)
        const price = parseFloat(
          activity.totalRateWithoutmrk || activity.totalRate || 0,
        );
        total += price;
        selling += sellPrice;
      } else if (item.cab) {
        const cab = item.cab;
        // Selling Price = totalRate (with markup)
        const sellPrice = parseFloat(cab.totalRate || 0);
        // Total Price = totalRateWithoutmrk (without markup)
        const price = parseFloat(cab.totalRateWithoutmrk || cab.totalRate || 0);
        total += price;
        selling += sellPrice;
      }
    });

    setTotalPrice(total);
    setSellingPrice(selling);
  };

  // Get hotels from cart
  const getHotels = () => {
    return cartData.filter((item) => item.hotel);
  };

  // Get activities from cart
  const getActivities = () => {
    return cartData.filter((item) => item.activity);
  };

  // Get transfers from cart
  const getTransfers = () => {
    return cartData.filter((item) => item.cab);
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return "";
    try {
      if (dateString.includes("/")) {
        return dateString;
      }
      const date = new Date(dateString);
      return date.toLocaleDateString("en-GB");
    } catch {
      return dateString;
    }
  };

  // Format activity date for accordion header (e.g., 25 Mar 2026)
  const formatActivityDateHeader = (dateString) => {
    if (!dateString) return "";
    try {
      let date;
      if (dateString.includes("/")) {
        const [day, month, year] = dateString.split("/");
        date = new Date(year, month - 1, day);
      } else {
        date = new Date(dateString);
      }
      if (isNaN(date.getTime())) return dateString;
      return date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  // Format date to YYYY-MM-DD for backend
  const formatDateToYYYYMMDD = (dateString) => {
    if (!dateString) return "";
    try {
      let date;
      if (dateString.includes("/")) {
        // Handle DD/MM/YYYY format
        const [day, month, year] = dateString.split("/");
        date = new Date(year, month - 1, day);
      } else {
        date = new Date(dateString);
      }
      if (isNaN(date.getTime())) return "";
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    } catch {
      return dateString;
    }
  };

  // Format date to DD-MM-YYYY for backend (for tourDate, pickupDate, dropOffDate)
  const formatDateToDDMMYYYY = (dateString) => {
    if (!dateString) return "";
    try {
      let date;
      if (dateString.includes("/")) {
        // Already in DD/MM/YYYY format, convert to DD-MM-YYYY
        return dateString.replace(/\//g, "-");
      } else {
        date = new Date(dateString);
      }
      if (isNaN(date.getTime())) return "";
      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    } catch {
      return dateString;
    }
  };

  // Calculate nights between two dates
  const calculateNights = (checkIn, checkOut) => {
    if (!checkIn || !checkOut) return 1;
    try {
      let start, end;
      if (checkIn.includes("/")) {
        const [day, month, year] = checkIn.split("/");
        start = new Date(year, month - 1, day);
      } else {
        start = new Date(checkIn);
      }

      if (checkOut.includes("/")) {
        const [day, month, year] = checkOut.split("/");
        end = new Date(year, month - 1, day);
      } else {
        end = new Date(checkOut);
      }

      if (isNaN(start.getTime()) || isNaN(end.getTime())) return 1;
      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return Math.max(1, diffDays);
    } catch {
      return 1;
    }
  };

  // Validate form
  const validateForm = () => {
    const errors = {};
    let hasErrors = false;

    // Validate primary guest details
    if (!primaryGuest.salutation || primaryGuest.salutation.trim() === "") {
      errors.primaryGuest_salutation = "Salutation is required";
      hasErrors = true;
    }
    if (!primaryGuest.firstName || primaryGuest.firstName.trim() === "") {
      errors.primaryGuest_firstName = "First Name is required";
      hasErrors = true;
    }
    if (!primaryGuest.lastName || primaryGuest.lastName.trim() === "") {
      errors.primaryGuest_lastName = "Last Name is required";
      hasErrors = true;
    }
    if (
      !primaryGuest.contactNumber ||
      primaryGuest.contactNumber.trim() === ""
    ) {
      errors.primaryGuest_contactNumber = "Contact Number is required";
      hasErrors = true;
    }
    if (!primaryGuest.emailId || primaryGuest.emailId.trim() === "") {
      errors.primaryGuest_emailId = "Email Id is required";
      hasErrors = true;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(primaryGuest.emailId)) {
      errors.primaryGuest_emailId = "Please enter a valid email address";
      hasErrors = true;
    }
    // Validate hotel room guest details
   const hotels = getHotels();
    if (hotels.length > 0) {
      hotels.forEach((item, hotelIndex) => {
        const hotel = item.hotel || {};
        const searchRoomDTOs = hotel.searchRoomDTOs || [];

        // Find hotel index in cartData
        let hotelIndexInCart = -1;
        let hotelCount = 0;
        for (let i = 0; i < cartData.length; i++) {
          if (cartData[i].hotel) {
            if (hotelCount === hotelIndex) {
              hotelIndexInCart = i;
              break;
            }
            hotelCount++;
          }
        }

        if (hotelIndexInCart >= 0) {
          searchRoomDTOs.forEach((room, roomIndex) => {
            const guestKey = `${hotelIndexInCart}-${roomIndex}`;
            const guests = roomGuests[guestKey] || [];

            guests.forEach((guest, guestIndex) => {
              // Use hotelIndexInCart for error key to match the guestKey used in rendering
              const errorPrefix = `hotel_${hotelIndexInCart}_room_${roomIndex}_guest_${guestIndex}`;

              if (
                !guest.salutation ||
                (typeof guest.salutation === "string" &&
                  guest.salutation.trim() === "")
              ) {
                errors[`${errorPrefix}_salutation`] = "Salutation is required";
                hasErrors = true;
              }
              if (
                !guest.firstName ||
                (typeof guest.firstName === "string" &&
                  guest.firstName.trim() === "")
              ) {
                errors[`${errorPrefix}_firstName`] = "First Name is required";
                hasErrors = true;
              }
              if (
                !guest.lastName ||
                (typeof guest.lastName === "string" &&
                  guest.lastName.trim() === "")
              ) {
                errors[`${errorPrefix}_lastName`] = "Last Name is required";
                hasErrors = true;
              }
              if (
                !guest.gender ||
                (typeof guest.gender === "string" && guest.gender.trim() === "")
              ) {
                errors[`${errorPrefix}_gender`] = "Gender is required";
                hasErrors = true;
              }
            });
          });
        }
      });
    } 

    return { errors, hasErrors };
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    if (e && e.preventDefault) {
      e.preventDefault();
    }

    // Validate form
    const { errors, hasErrors } = validateForm();

    if (hasErrors) {
      setValidationErrors(errors);
      toast.error("Please fill in all required fields correctly.");
      // Scroll to first error
      setTimeout(() => {
        const firstErrorField = document.querySelector(".is-invalid");
        if (firstErrorField) {
          firstErrorField.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      }, 100);
      return;
    }

    // Clear validation errors before submission
    setValidationErrors({});

    // Show the pre-summary policy modal first. The Order Summary only
    // opens after the operator ticks both global acceptance checkboxes
    // (see `proceedFromPolicyModal` below) — there's no longer a path
    // from this button straight to the Order Summary.
    setShowPolicyModal(true);
  };

  // Hand-off from the pre-summary policy modal → Order Summary modal.
  // Called when the operator clicks "Continue to Order Summary". The
  // disabled state on that button + a belt-and-braces guard here both
  // refuse to advance until both acceptance gates are ticked.
  const proceedFromPolicyModal = () => {
    if (!acceptedTerms || !acceptedCancellations) {
      toast.error(
        "Please accept the Terms & Conditions and Cancellation Policies to continue."
      );
      return;
    }
    setShowPolicyModal(false);
    setShowOrderSummaryModal(true);
  };

  // Confirm and submit booking
  const confirmBooking = async () => {
    setIsSubmitting(true);
    try {
      const hotels = getHotels();
      const activities = getActivities();
      const transfers = getTransfers();

      // Find hotel index in cartData
      const hotelIndexInCart =
        hotels.length > 0 ? cartData.findIndex((item) => item.hotel) : -1;

      // Prepare booking payload
      const firstHotel = hotels.length > 0 ? hotels[0].hotel : null;
      const checkIn = firstHotel?.checkIn || firstHotel?.checkInDate || "";
      const checkOut = firstHotel?.checkOut || firstHotel?.checkOutDate || "";
      const nights = calculateNights(checkIn, checkOut);

      console.log("firstHotel:", firstHotel);

      // Get travel date from sessionStorage (selected in search page)
      // Priority: sessionStorage travelDate > first activity date > hotel checkIn date
      const storedTravelDate = sessionStorage.getItem("makePkgTravelDate");
      const firstActivity =
        activities.length > 0 ? activities[0].activity : null;

      let tourDate = "";
      if (storedTravelDate) {
        // Use the travel date from sessionStorage (selected in search page)
        tourDate = formatDateToDDMMYYYY(storedTravelDate);
      } else if (firstActivity?.activityDate) {
        // Fallback to first activity date
        tourDate = formatDateToDDMMYYYY(firstActivity.activityDate);
      } else if (checkIn) {
        // Fallback to hotel checkIn date
        tourDate = formatDateToDDMMYYYY(checkIn);
      }

      // Get quoteId if booking is from converted quotation
      const quoteId = sessionStorage.getItem("makePkgQuoteId");

      // Build hotel booking requests for all hotels
      const hotelBookingRequests = hotels.map((item, hotelIndex) => {
        const hotel = item.hotel || {};
        const checkIn = hotel.checkIn || hotel.checkInDate || "";
        const checkOut = hotel.checkOut || hotel.checkOutDate || "";
        const nights = calculateNights(checkIn, checkOut);

        // Find hotel index in cartData to use for per-hotel state and room guests
        let hotelIndexInCart = -1;
        let hotelCount = 0;
        for (let i = 0; i < cartData.length; i++) {
          if (cartData[i].hotel) {
            if (hotelCount === hotelIndex) {
              hotelIndexInCart = i;
              break;
            }
            hotelCount++;
          }
        }
        // Fallback to hotelIndex if not found in cartData
        const actualHotelIndexInCart =
          hotelIndexInCart >= 0 ? hotelIndexInCart : hotelIndex;

        return {
          agentId: String(sessionStorage.getItem("makePkgAgentId") || "0"),
          apiId: String("INHOUSE"),
          hotelId: String(hotel.hotelId || ""),
          hotelName: hotel.hotelName || "",
          address: hotel.hotelAddress || hotel.address || "",
          starRating: parseInt(hotel.starRating || 0),
          checkInDate: formatDateToYYYYMMDD(checkIn),
          checkOutDate: formatDateToYYYYMMDD(checkOut),
          nights: nights,
          employeeId: "1",
          roomStatus:
            hotel.available === false ||
            hotel.available === "False" ||
            hotel.available === "false"
              ? "On Request"
              : "Available",
          cancellationPolicy: (() => {
            const policies = hotel.cancellationPolicy || [];
            if (Array.isArray(policies) && policies.length > 0) {
              // If policies are objects, extract policyText; otherwise use as-is
              return policies.map((p) =>
                typeof p === "string"
                  ? p
                  : p.policyText || p.text || JSON.stringify(p),
              );
            }
            return [];
          })(),
          // Calculate deadlineDate based on nonRefundable and cancellationPolicy
          deadlineDate: (() => {
            const nonRefundable =
              hotel.refundstatus === "N" ||
              hotel.nonRefundable === true ||
              hotel.nonRefundable === "true";

            if (nonRefundable === true || nonRefundable === "true") {
              // Non-refundable: 2 days before current date
              const today = new Date();
              const deadline = new Date(today);
              deadline.setDate(today.getDate() - 2);
              deadline.setHours(0, 0, 0, 0); // Set to midnight
              const year = deadline.getFullYear();
              const month = String(deadline.getMonth() + 1).padStart(2, "0");
              const day = String(deadline.getDate()).padStart(2, "0");
              return `${year}-${month}-${day}T00:00:00`;
            } else {
              // Refundable: 2 days before earliest fromDate from cancellationPolicy
              const policies = hotel.cancellationPolicy || [];
              if (policies.length === 0) {
                return null;
              }

              // Find earliest fromDate
              const dates = policies
                .map((p) => {
                  // Handle both object and string formats
                  if (typeof p === "object" && p.fromDate) {
                    return new Date(p.fromDate);
                  }
                  return null;
                })
                .filter((date) => date !== null && !isNaN(date.getTime()));

              if (dates.length === 0) {
                return null;
              }

              const earliestDate = new Date(
                Math.min(...dates.map((d) => d.getTime())),
              );
              const deadline = new Date(earliestDate);
              deadline.setDate(earliestDate.getDate() - 2);
              deadline.setHours(0, 0, 0, 0); // Set to midnight
              const year = deadline.getFullYear();
              const month = String(deadline.getMonth() + 1).padStart(2, "0");
              const day = String(deadline.getDate()).padStart(2, "0");
              return `${year}-${month}-${day}T00:00:00`;
            }
          })(),
          isBookandVoucher:
            (hotelBookingConfirmation[hotelIndex] || "Book & Voucher") ===
            "Book & Voucher",
          primaryGuest: {
            firstName: primaryGuest.firstName || "",
            middleName: primaryGuest.middleName || "",
            lastName: primaryGuest.lastName || "",
            nativeCountry: hotel.nationality || "",
            email: primaryGuest.emailId || "",
            phone: primaryGuest.contactNumber || "",
            passportNo: primaryGuest.passportNumber || "",
            salutaion: primaryGuest.salutation || "",
            agentlpo: primaryGuest.lpo || "",
          },
          rooms:
            hotel?.searchRoomDTOs?.map((room, idx) => {
              const guestKey = `${actualHotelIndexInCart}-${idx}`;
              const guests = roomGuests[guestKey] || [];

              // Calculate room rate - divide total hotel rate by number of rooms
              const totalRooms = hotel.searchRoomDTOs?.length || 1;
              // Selling Price = totalRate (with markup)
              const hotelTotalRate = parseFloat(hotel.totalRate || 0);
              const roomRate =
                totalRooms > 0 ? hotelTotalRate / totalRooms : hotelTotalRate;
              // Total Price = totalRateWithoutmrk (without markup)
              const hotelTotalRateWithoutMarkup = parseFloat(
                hotel.totalRateWithoutmrk || hotel.totalRate || 0,
              );
              const roomRateWithoutMarkup =
                totalRooms > 0
                  ? hotelTotalRateWithoutMarkup / totalRooms
                  : hotelTotalRateWithoutMarkup;

              return {
                roomNo: idx + 1,
                roomCategory: hotel.roomCategory || "",
                mealPlan: hotel.roomType || "",
                nonRefundable:
                  hotel.refundstatus === "N" ||
                  hotel.nonRefundable === true ||
                  hotel.nonRefundable === "true",
                currency: hotel.currency || "AED",
                rate: roomRate,
                rateWithoutMarkup: roomRateWithoutMarkup,
                adults: parseInt(room.adult || room.adults || 1),
                children: parseInt(room.child || room.children || 0),
                childAges: Array.isArray(room.childAge)
                  ? room.childAge.map((age) => parseInt(age) || 0)
                  : room.childAge
                    ? [parseInt(room.childAge) || 0]
                    : [],
                guests: guests.map((guest) => ({
                  salutation: guest.salutation || "",
                  firstName: guest.firstName || "",
                  middleName: guest.middleName || "",
                  lastName: guest.lastName || "",
                  gender: guest.gender || "",
                  isChild: guest.isChild || false,
                })),
              };
            }) || [],
          remarks: hotelRemarks[hotelIndex] || "",
          specialRequests: hotelSpecialRequests[hotelIndex] || "",
          tourismDirhams:
            parseFloat(hotelTourismDirhams[hotelIndex] || "0") || 0,
          bookingConfirmation:
            hotelBookingConfirmation[hotelIndex] || "Book & Voucher",
        };
      });

      // Use the aggregate so per-hotel TD inputs flow into the final
      // payload + grand total. The per-hotel rows still carry their own
      // `tourismDirhams` value (further down in hotelBookingRequests)
      // — the aggregate is for the BOOKING-level total, not a duplicate
      // of the per-hotel persistence.
      const tdNumber = aggregateTourismDirham;
      const bookingPayload = {
        customPackageId: "",
        quoteId: quoteId ? parseInt(quoteId) : null, // Include quoteId if booking is from quotation
        sellingPrice: String((sellingPrice + tdNumber).toFixed(2)),
        totalPrice: String((totalPrice + tdNumber).toFixed(2)),
        tourismDirham: tdNumber > 0 ? tdNumber : null,
        tourDate: tourDate,
        visaStatus: visaRequired,
        visaAdult: parseInt(visaDetails.visaAdult || "0") || 0,
        visaAdultRate: parseFloat(visaDetails.visaAdultRate || "0") || 0,
        visaChild: parseInt(visaDetails.visaChild || "0") || 0,
        visaChildRate: parseFloat(visaDetails.visaChildRate || "0") || 0,
        visaInfant: parseInt(visaDetails.visaInfant || "0") || 0,
        visaInfantRate: parseFloat(visaDetails.visaInfantRate || "0") || 0,
        hotelBookingRequest:
          hotelBookingRequests.length > 0 ? hotelBookingRequests : [],
        customBookingActivityDTO: activities.map((item, activityArrayIndex) => {
          const activity = item.activity || {};
          const details = activity.details || {};
          // Selling Price = totalRate (with markup)
          const activitySellingPrice = parseFloat(activity.totalRate || 0);
          // Total Price = totalRateWithoutmrk (without markup)
          const activityTotalPrice = parseFloat(
            activity.totalRateWithoutmrk || activity.totalRate || 0,
          );

          // Find actual index in cartData
          let activityIndexInCart = -1;
          let activityCount = 0;
          for (let i = 0; i < cartData.length; i++) {
            if (cartData[i].activity) {
              if (activityCount === activityArrayIndex) {
                activityIndexInCart = i;
                break;
              }
              activityCount++;
            }
          }
          const actualIndex = activityIndexInCart >= 0 ? activityIndexInCart : 0;
          const activityDetail = activityDetails[actualIndex] || {};

          return {
            activityId: parseInt(activity.activityId || "0") || 0,
            tourDate: formatDateToDDMMYYYY(activity.activityDate || ""),
            noOfAdult:
              parseInt(activity.adult || activity.noOfAdult || "1") || 1,
            noOfChild:
              parseInt(activity.child || activity.noOfChild || "0") || 0,
            childAgeArray: Array.isArray(activity.childAge)
              ? activity.childAge.map((age) => String(age))
              : activity.childAge
                ? [String(activity.childAge)]
                : [],
            sellingPrice: String(activitySellingPrice.toFixed(2)),
            totalPrice: String(activityTotalPrice.toFixed(2)),
            driverName: activityDetail.driverName || "",
            driverContact: activityDetail.driverContact || "",
          };
        }),
        customBookingCabDTO: transfers.map((item, transferArrayIndex) => {
          // Find the actual index in cartData for this transfer
          let transferIndexInCart = -1;
          let cabCount = 0;
          for (let i = 0; i < cartData.length; i++) {
            if (cartData[i].cab) {
              if (cabCount === transferArrayIndex) {
                transferIndexInCart = i;
                break;
              }
              cabCount++;
            }
          }
          const actualIndex =
            transferIndexInCart >= 0 ? transferIndexInCart : 0;
          const transferDetail = transferDetails[actualIndex] || {};
          console.log("transferDetail::", transferDetail);
          const cab = item.cab || {};
          const details = cab.details || {};
          // Selling Price = totalRate (with markup)
          const cabTotalRate = parseFloat(cab.totalRate || 0);
          // Total Price = totalRateWithoutmrk (without markup)
          const cabTotalRateWithoutMrk = parseFloat(
            cab.totalRateWithoutmrk || cab.totalRate || 0,
          );

          return {
            cabId: parseInt(cab.cabId || "0") || 0,
            noOfCabs: parseInt(cab.noOfCabs || "1") || 1,
            pickupDate: formatDateToDDMMYYYY(cab.pickupDate || ""),
            dropOffDate: formatDateToDDMMYYYY(
              cab.dropDate || cab.dropOffDate || "",
            ),
            travelType: parseInt(cab.travelType || "1") || 1,
            hourDetails:
              parseInt(cab.hourDetails || cab.timeDetails || "0") || 0,
            dropDetails: parseInt(cab.dropDetails || "1") || 1,
            paxDetails: parseInt(cab.paxDetails || "1") || 1,
            luggage:
              cab.luggage === true ||
              cab.luggage === "true" ||
              String(cab.luggage).toLowerCase() === "true",
            locationId: parseInt(cab.locationId || "0") || 0,
            noOfAdult: parseInt(cab.adult || cab.noOfAdult || "1") || 1,
            noOfChild: parseInt(cab.child || cab.noOfChild || "0") || 0,
            childAgeArray: Array.isArray(cab.childAge)
              ? cab.childAge.map((age) => parseInt(age) || 0)
              : cab.childAge
                ? [parseInt(cab.childAge) || 0]
                : [],
            totalRate: cabTotalRate || 0,
            totalRateWithoutmrk: cabTotalRateWithoutMrk || 0,
            transporter:
              transferDetail.transporterName || cab.transporter || "",
            contactNumber:
              transferDetail.contactNumber || cab.contactNumber || "",
            driverName: transferDetail.driverName || cab.driverName || "",
            driverContact:
              transferDetail.driverContact || cab.driverContact || "",
            pickupZone: cab.pickupZone || null,
            dropoffZone: cab.dropoffZone || null,
            pickupSource: cab.pickupSource || null,
            pickupId: cab.pickupId ?? null,
            pickupName: cab.pickupName || null,
            dropoffSource: cab.dropoffSource || null,
            dropoffId: cab.dropoffId ?? null,
            dropoffName: cab.dropoffName || null,
          };
        }),
        customBookingItinearyDTO: (function () {
          const uniqueDates = [
            ...new Set(
              activities
                .map((item) => {
                  const act = item.activity || {};
                  return (
                    act.activityDate ||
                    (act.details && act.details.activityDate) ||
                    ""
                  );
                })
                .filter(Boolean),
            ),
          ].sort((a, b) => {
            const parse = (d) =>
              d.includes("/")
                ? new Date(
                    d.split("/")[2],
                    d.split("/")[1] - 1,
                    d.split("/")[0],
                  )
                : new Date(d);
            return parse(a) - parse(b);
          });
          const dtos = [];
          uniqueDates.forEach((date, index) => {
            const itins = selectedItineraries[date] || [];
            itins.forEach((itineraryId) => {
              dtos.push({
                itinearyId: parseInt(itineraryId) || 0,
                days: index + 1,
              });
            });
          });
          return dtos;
        })(),
        paymentApiId: null,
        agentId: parseInt(sessionStorage.getItem("makePkgAgentId") || "0"),
        isCartBooking: true,
        // Add-on services captured in the sticky side-panel (Visa, Meet &
        // Greet, transfers, optional tours, rentals, etc.). Only services
        // toggled ON are forwarded; null when none → backend persists
        // null and the booking-details view simply skips the section.
        addOnServices: collectEnabledAddOnServices(),
        // Priced line-items for the new dynamic add-on catalog. Each entry
        // carries the rate snapshotted on the search page so the backend
        // persists exactly what the operator was billed for. Null when no
        // priced add-on is selected.
        selectedAddOnLineItems: buildAddOnLineItemsForPayload(addOnCatalog),
      };

      // Bump the headline prices to include the priced add-on extras BEFORE
      // they flow into the v2 transform below. Hotel + cab + activity sums
      // (sellingPrice / totalPrice) plus tourism dirham already line up;
      // adding `addOnsTotal` is the only thing missing today.
      if (addOnsTotal > 0) {
        const bumpedTotal = (Number(bookingPayload.totalPrice) || 0) + addOnsTotal;
        const bumpedSelling = (Number(bookingPayload.sellingPrice) || 0) + addOnsTotal;
        bookingPayload.totalPrice = String(bumpedTotal.toFixed(2));
        bookingPayload.sellingPrice = String(bumpedSelling.toFixed(2));
      }

      console.log("Makepkg Booking payload (legacy shape):", bookingPayload);

      // ── v2: transform the legacy payload into the v2 wire format ──
      // The v2 backend stores hotels / cabs / activities as flat lists and
      // visa as YES/NO; we keep the legacy bookingPayload assembly above
      // intact so all the nested calculations still run, then project the
      // pieces into the v2 shape here. Sends to /api/makeYourOwnPackageV2.
      // Primary guest + per-room guests are mirrored from HotelBookingPage.jsx
      // so the backend receives the same manifest shape it already understands.
      const firstHotelNationality = (() => {
        const firstHotel = (cartData || []).find((it) => it && it.hotel)?.hotel;
        return firstHotel?.nationality || "";
      })();

      const primaryGuestPayload = {
        salutation: primaryGuest.salutation || "",
        firstName: primaryGuest.firstName || "",
        middleName: primaryGuest.middleName || "",
        lastName: primaryGuest.lastName || "",
        email: primaryGuest.emailId || "",
        phone: primaryGuest.contactNumber || "",
        passportNo: primaryGuest.passportNumber || "",
        agentLpo: primaryGuest.lpo || "",
        nativeCountry: firstHotelNationality,
      };

      // Flat list of every guest captured across all hotels/rooms. The
      // master guest (first room, first guest of the first hotel) IS the
      // primary guest — we don't ship a duplicate entry for the lead
      // traveller. The master row is tagged `primaryGuest: true` and
      // carries the booking-owner contact info (email / phone /
      // agentLpo / nativeCountry); every other row is `primaryGuest:
      // false`. Total entries == real pax count (adults + children).
      const flatGuests = [];
      const firstHotelIdx = (cartData || []).findIndex(
        (it) => it && it.hotel
      );
      (cartData || []).forEach((cartItem, hotelIdx) => {
        if (!cartItem || !cartItem.hotel) return;
        const hotel = cartItem.hotel || {};
        const rooms = hotel.searchRoomDTOs || [];
        rooms.forEach((room, roomIdx) => {
          const guestKey = `${hotelIdx}-${roomIdx}`;
          const guests = roomGuests[guestKey] || [];
          guests.forEach((guest, guestIdx) => {
            const isMaster =
              hotelIdx === firstHotelIdx &&
              roomIdx === 0 &&
              guestIdx === 0;
            const row = {
              hotelIndex: hotelIdx,
              roomIndex: roomIdx,
              guestIndex: guestIdx,
              primaryGuest: isMaster,
              salutation: guest.salutation || "",
              firstName: guest.firstName || "",
              middleName: guest.middleName || "",
              lastName: guest.lastName || "",
              gender: guest.gender || "",
              isChild: !!guest.isChild,
              age: guest.age || "",
            };
            if (isMaster) {
              row.email = primaryGuest.emailId || "";
              row.phone = primaryGuest.contactNumber || "";
              row.passportNo = primaryGuest.passportNumber || "";
              row.nativeCountry = firstHotelNationality;
              row.agentLpo = primaryGuest.lpo || "";
            }
            flatGuests.push(row);
          });
        });
      });

      const v2Payload = {
        agentId: bookingPayload.agentId || null,
        agentName: sessionStorage.getItem("makePkgAgentName") || "",
        userId: bookingPayload.agentId || null,
        salutation: primaryGuest.salutation || null,
        customerFirstName: primaryGuest.firstName || null,
        customerLastName: primaryGuest.lastName || null,
        customerEmail: primaryGuest.emailId || null,
        customerPhone: primaryGuest.contactNumber || null,
        customerPassport: primaryGuest.passportNumber || null,
        customerNationality: firstHotelNationality || null,
        agentLpo: primaryGuest.lpo || null,
        sellingPrice: bookingPayload.sellingPrice || null,
        totalPrice: bookingPayload.totalPrice || null,
        tourismDirham: bookingPayload.tourismDirham || null,
        paymentMode: null,
        visaRequired: v2VisaRequired,
        // Acceptance audit — recorded on the pre-summary policy modal.
        // Backend persists both flags + an acceptedAt timestamp on
        // mypkg_v2_booking.accepted_terms / accepted_cancellation /
        // accepted_at so the booking-details view can show the audit.
        // The Order Summary modal can only open when both flags are
        // true, so confirmed bookings will always carry true here.
        acceptedTermsAndConditions: !!acceptedTerms,
        acceptedCancellationPolicies: !!acceptedCancellations,
        serviceFlags: (() => {
          try {
            return JSON.parse(
              sessionStorage.getItem("makePkgV2Services") || "{}"
            );
          } catch {
            return {};
          }
        })(),
        addOnServices: bookingPayload.addOnServices || null,
        // Primary guest mirrors HotelBookingPage.jsx so the backend gets the
        // same lead-traveller block it already knows how to persist.
        primaryGuest: primaryGuestPayload,
        // Hotels carry the per-room guests[] inline (same shape used by
        // HotelBookingPage.jsx). Falls back to the raw cart shape for any
        // hotel that doesn't have per-room guest entries yet.
        hotels: (cartData || [])
          .filter((it) => it && it.hotel)
          .map((cartItem, hotelIdx) => {
            const hotel = cartItem.hotel || {};
            const searchRooms = hotel.searchRoomDTOs || [];
            const rooms = searchRooms.map((room, roomIdx) => {
              const guestKey = `${hotelIdx}-${roomIdx}`;
              const guests = (roomGuests[guestKey] || []).map((guest) => ({
                salutation: guest.salutation || "",
                firstName: guest.firstName || "",
                middleName: guest.middleName || "",
                lastName: guest.lastName || "",
                gender: guest.gender || "",
                isChild: !!guest.isChild,
                age: guest.age || "",
              }));
              return {
                roomNo: roomIdx + 1,
                adults: parseInt(room.adult || room.adults || 1) || 1,
                children: parseInt(room.child || room.children || 0) || 0,
                childAges: Array.isArray(room.childAge)
                  ? room.childAge.map((a) => parseInt(a) || 0)
                  : room.childAge
                  ? [parseInt(room.childAge) || 0]
                  : [],
                guests,
              };
            });
            return {
              ...hotel,
              rooms,
              tourismDirhams:
                parseFloat(hotelTourismDirhams[hotelIdx] || "0") || 0,
              remarks: hotelRemarks[hotelIdx] || "",
              specialRequests: hotelSpecialRequests[hotelIdx] || "",
              bookingConfirmation:
                hotelBookingConfirmation[hotelIdx] || "Book & Voucher",
            };
          }),
        cabs: Array.isArray(cartData)
          ? (() => {
              // Pickup / dropoff zones picked on the search page are stored
              // in sessionStorage and stamped onto every cab DTO here so
              // the backend receives them inside the cab object.
              let pickupZone = null;
              let dropoffZone = null;
              try {
                const p = sessionStorage.getItem("makePkgV2TransferPickup");
                pickupZone = p ? JSON.parse(p) : null;
              } catch {
                pickupZone = null;
              }
              try {
                const d = sessionStorage.getItem("makePkgV2TransferDropoff");
                dropoffZone = d ? JSON.parse(d) : null;
              } catch {
                dropoffZone = null;
              }
              return cartData
                .filter((it) => it && it.cab)
                .map((it, idx) => {
                  const cab = it.cab || {};
                  const td = transferDetails[idx] || {};
                  return {
                    ...cab,
                    transporter: td.transporterName || cab.transporter || "",
                    driverName: td.driverName || cab.driverName || "",
                    driverContact: td.driverContact || cab.driverContact || "",
                    pickupZone: cab.pickupZone || pickupZone,
                    dropoffZone: cab.dropoffZone || dropoffZone,
                    pickupSource:
                      cab.pickupSource || pickupZone?.source || null,
                    pickupId:
                      cab.pickupId ?? pickupZone?.id ?? null,
                    pickupName:
                      cab.pickupName || pickupZone?.name || null,
                    dropoffSource:
                      cab.dropoffSource || dropoffZone?.source || null,
                    dropoffId:
                      cab.dropoffId ?? dropoffZone?.id ?? null,
                    dropoffName:
                      cab.dropoffName || dropoffZone?.name || null,
                  };
                });
            })()
          : [],
        activities: Array.isArray(cartData)
          ? cartData
              .filter((it) => it && it.activity)
              .map((it) => it.activity)
          : [],
        // Flat guest manifest — every traveller across every room, keyed by
        // hotelIndex/roomIndex so the backend can rebuild the matrix.
        guests: flatGuests,
      };
      console.log("Makepkg Booking payload (v2 shape):", v2Payload);
      const response = await axiosInstance.post(
        "/api/makeYourOwnPackageV2/booking/save",
        v2Payload,
      );

      // v2 response shape: { id: <Long>, status: "SUCCESS" }
      if (
        response.data &&
        response.data.status === "SUCCESS" &&
        response.data.id != null
      ) {
        if (quoteId) sessionStorage.removeItem("makePkgQuoteId");
        // Clear the v2 flow flag so subsequent legacy bookings work as
        // before. Cart was already cleared server-side after save.
        sessionStorage.removeItem("makePkgFlow");
        sessionStorage.removeItem("makePkgV2Services");
        sessionStorage.removeItem("makePkgV2VisaRequired");
        setShowOrderSummaryModal(false);
        toast.success(`Booking saved (id ${response.data.id}).`);
        navigate("/booking-details/make-your-own-package-v2-list");
      } else {
        toast.error(response.data?.message || "Failed to submit booking.");
      }
    } catch (err) {
      console.error("Error submitting booking:", err);
      toast.error("Failed to submit booking. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-vh-100 bg-light d-flex flex-column">
        <TopBar />
        <div className="d-flex flex-grow-1">
          <Sidebar />
          <main className="flex-grow-1 d-flex justify-content-center align-items-center" style={{ minWidth: 0, overflowX: "hidden" }}>
            <div className="loading-container text-center">
              <Spinner animation="border" variant="primary" size="lg" />
              <p className="mt-3 text-muted fw-semibold">
                Loading booking details...
              </p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!cartData || cartData.length === 0) {
    return (
      <div className="min-vh-100 bg-light d-flex flex-column">
        <TopBar />
        <div className="d-flex flex-grow-1">
          <Sidebar />
          <main className="flex-grow-1 d-flex justify-content-center align-items-center p-4" style={{ minWidth: 0, overflowX: "hidden" }}>
            <div className="empty-state">
              <FaShoppingCart size={64} className="text-muted mb-3" />
              <Alert.Heading className="mb-3">No Items in Cart</Alert.Heading>
              <p className="text-muted mb-4">
                Your cart is empty. Please add items to cart first.
              </p>
              <Button
                variant="primary"
                size="lg"
                className="btn-booking btn-booking-primary"
                onClick={() => navigate("/new-booking/make-your-own-package")}
              >
                Go to Search
              </Button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const hotels = getHotels();
  const activities = getActivities();
  const transfers = getTransfers();

  // Read-only counts for the section-header badges — derived from the
  // same validationErrors map the inputs use, nothing else.
  const primaryGuestErrorCount = Object.keys(validationErrors || {}).filter(
    (k) => k.startsWith("primaryGuest_"),
  ).length;
  const hotelGuestErrorCount = Object.keys(validationErrors || {}).filter(
    (k) => k.startsWith("hotel_"),
  ).length;

  const uniqueActivityDates = [
    ...new Set(
      activities
        .map((item) => {
          const act = item.activity || {};
          return (
            act.activityDate || (act.details && act.details.activityDate) || ""
          );
        })
        .filter(Boolean),
    ),
  ].sort((a, b) => {
    const parse = (d) =>
      d.includes("/")
        ? new Date(d.split("/")[2], d.split("/")[1] - 1, d.split("/")[0])
        : new Date(d);
    return parse(a) - parse(b);
  });

  return (
    <div className="make-pkg-booking-container d-flex flex-column myop-v2">

      {/* ── Booking page visual overhaul ──
          One injected stylesheet that modernises every existing card,
          accordion, form input, table and button on this page. Targets
          existing classes so no JSX needs to change — pure UI polish. */}
      <style>{`
        .make-pkg-booking-container .content-wrapper {
          background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
          min-height: 100vh;
        }
        .make-pkg-booking-container h4,
        .make-pkg-booking-container h5,
        .make-pkg-booking-container h6 {
          color: #1f2937;
          letter-spacing: -0.01em;
        }

        /* ── Accordion (the main form container) ───────────────────── */
        .booking-accordion .accordion-item {
          border: 1px solid #e5e7eb !important;
          border-radius: 16px !important;
          overflow: hidden;
          background: #ffffff;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
          margin-bottom: 14px !important;
          transition: box-shadow 0.2s ease, transform 0.2s ease;
        }
        .booking-accordion .accordion-item:hover {
          box-shadow: 0 4px 14px rgba(15, 23, 42, 0.07);
        }
        .booking-accordion .accordion-header { margin: 0; }
        .booking-accordion .accordion-button {
          background: #ffffff !important;
          border: none !important;
          padding: 18px 22px !important;
          font-weight: 600 !important;
          color: #1f2937 !important;
          box-shadow: none !important;
          font-size: 1rem;
        }
        .booking-accordion .accordion-button:not(.collapsed) {
          /* Brand red tint — matches the rest of the MYOP v2 flow. The
             background uses the same soft-red gradient the platform's hero
             band uses (#FFE3EB → #FDF1F4). Was light-purple #f5f7ff → #faf5ff. */
          background: linear-gradient(135deg, #FFE3EB 0%, #FDF1F4 100%) !important;
          color: #EC0B43 !important;
          border-bottom: 1px solid #e5e7eb;
        }
        .booking-accordion .accordion-button:not(.collapsed) h5,
        .booking-accordion .accordion-button:not(.collapsed) h6,
        .booking-accordion .accordion-button:not(.collapsed) svg {
          /* Same brand red so section titles (Itinerary, Hotels, Tours &
             Activities, Guest Details, Selected Add-On Services) render
             red when their accordion is open, matching the header color. */
          color: #EC0B43 !important;
        }
        .booking-accordion .accordion-button:focus { box-shadow: none !important; }
        .booking-accordion .accordion-button::after {
          background-size: 1rem;
          opacity: 0.6;
          transition: transform 0.25s ease;
        }
        .booking-accordion .accordion-body {
          padding: 22px !important;
          background: #ffffff;
        }

        /* ── Form inputs ───────────────────────────────────────────── */
        .make-pkg-booking-container .form-control,
        .make-pkg-booking-container .form-select {
          border: 1.5px solid #e5e7eb;
          border-radius: 10px;
          padding: 9px 13px;
          font-size: 0.92rem;
          background-color: #ffffff;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .make-pkg-booking-container .form-control:hover,
        .make-pkg-booking-container .form-select:hover {
          border-color: #cbd5e1;
        }
        .make-pkg-booking-container .form-control:focus,
        .make-pkg-booking-container .form-select:focus {
          border-color: #818cf8;
          box-shadow: 0 0 0 4px rgba(99,102,241,0.10);
          outline: none;
        }
        .make-pkg-booking-container .form-control.is-invalid,
        .make-pkg-booking-container .form-select.is-invalid {
          border-color: #ef4444;
        }
        .make-pkg-booking-container .form-label {
          font-weight: 600;
          font-size: 0.74rem;
          color: #4b5563;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 6px;
        }
        .make-pkg-booking-container .form-check-input:checked {
          background-color: #6366f1;
          border-color: #6366f1;
        }
        .make-pkg-booking-container .input-group-text {
          background: #f9fafb;
          border: 1.5px solid #e5e7eb;
          border-radius: 10px;
          color: #6b7280;
        }

        /* ── Tables ────────────────────────────────────────────────── */
        .make-pkg-booking-container .table {
          border-collapse: separate;
          border-spacing: 0;
          border-radius: 12px;
          overflow: hidden;
          background: #ffffff;
        }
        .make-pkg-booking-container .table thead th {
          background: linear-gradient(135deg, #f5f7ff 0%, #faf5ff 100%);
          color: #4b5563;
          font-weight: 600;
          font-size: 0.74rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px solid #e5e7eb;
          padding: 14px 12px;
          vertical-align: middle;
        }
        .make-pkg-booking-container .table tbody td {
          padding: 14px 12px;
          vertical-align: middle;
          border-color: #f1f5f9;
          background: #ffffff;
        }
        .make-pkg-booking-container .table tbody tr:hover td {
          background: #fafbff;
        }

        /* ── Nested cards inside accordion bodies ─────────────────── */
        .make-pkg-booking-container .accordion-body .card {
          border: 1px solid #e5e7eb !important;
          border-radius: 12px !important;
          box-shadow: none !important;
          background: #fafbff;
        }
        .make-pkg-booking-container .accordion-body .card .card-header {
          background: transparent !important;
          border-bottom: 1px solid #eef0f4 !important;
          font-weight: 600;
          color: #1f2937;
        }

        /* ── Buttons ───────────────────────────────────────────────── */
        .make-pkg-booking-container .btn:not(.btn-link) {
          border-radius: 10px;
          font-weight: 500;
          transition: transform 0.1s ease, box-shadow 0.15s ease;
        }
        .make-pkg-booking-container .btn-primary {
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          border: none;
        }
        .make-pkg-booking-container .btn-primary:hover,
        .make-pkg-booking-container .btn-primary:focus {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          box-shadow: 0 4px 12px rgba(99,102,241,0.25);
        }
        .make-pkg-booking-container .btn-outline-primary {
          color: #6366f1;
          border-color: #6366f1;
        }
        .make-pkg-booking-container .btn-outline-primary:hover {
          background: #6366f1;
          border-color: #6366f1;
        }

        /* ── Badges ────────────────────────────────────────────────── */
        .make-pkg-booking-container .badge {
          font-weight: 600;
          padding: 5px 10px;
          border-radius: 999px;
          letter-spacing: 0.01em;
        }

        /* ── Itinerary day boxes ───────────────────────────────────── */
        .make-pkg-booking-container .itinerary-day-box {
          background: linear-gradient(135deg, #f5f7ff 0%, #faf5ff 100%);
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          padding: 16px 18px;
        }
        .make-pkg-booking-container .itinerary-plus-btn {
          width: 34px; height: 34px;
          padding: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        /* ── Validation error text ─────────────────────────────────── */
        .make-pkg-booking-container .invalid-feedback,
        .make-pkg-booking-container .text-danger {
          font-size: 0.78rem;
        }
      `}</style>

      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        {/* overflow-x is clipped from the page stylesheet (`clip`, not
            `hidden`) so the sticky Package Summary and action bar keep
            working — `overflow: hidden` would turn <main> into their
            scroll container and make position:sticky inert. */}
        <main className="content-wrapper flex-grow-1" style={{ minWidth: 0 }}>
          <Container fluid>
            {/* ── Top header strip: back arrow + title + agent balance ── */}
            <div className="myop-v2-page-header">
              <div className="d-flex align-items-center">
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="btn btn-link p-0 me-3"
                  style={{ color: "#1f2937", fontSize: "1.4rem", textDecoration: "none" }}
                  aria-label="Back"
                >
                  ‹
                </button>
                <h3 className="fw-bold m-0" style={{ color: "#111827", letterSpacing: "-0.01em" }}>
                  Make Your Own Package
                </h3>
              </div>
              <AgentBalanceDisplay
                agentId={sessionStorage.getItem("makePkgAgentId")}
              />
            </div>

            {/* ── Journey indicator — phase 3 of 3, same component as the
                criteria form and the wizard so the vocabulary matches ── */}
            <MyopV2JourneyStepper current={3} />
            <div className="text-muted small mb-3">
              Review the package, enter the guest details, then continue to the
              policies and order summary. Nothing is booked until you confirm on
              the final summary.
            </div>

            {/* (Old "Confirm Booking" totals card removed — the same
                breakdown now lives in the sticky Package Summary
                sidebar on the right so the operator always sees it
                while filling the form, instead of needing to scroll
                back to the top.) */}

            <Row>
              <Col lg={8}>
                {/* v2: sections that need input come first and start
                    open — Guest Details (5) and Hotels (1, which holds the
                    per-room guest names). The review sections (Transfers /
                    Tours / Itinerary / Add-Ons) follow, collapsed. Open
                    state is controlled so a failed submit can expand the
                    section that contains the highlighted field. eventKeys
                    are unchanged. */}
                <Accordion
                  activeKey={openSections}
                  onSelect={(eventKey) =>
                    setOpenSections(
                      Array.isArray(eventKey)
                        ? eventKey
                        : eventKey != null
                          ? [eventKey]
                          : [],
                    )
                  }
                  alwaysOpen
                  className="booking-accordion"
                >
                  {/* Guest Details Section - Always Open */}
                  <Accordion.Item eventKey="5" className="mb-2">
                    <Accordion.Header>
                      <h5 className="mb-0 fw-bold d-flex align-items-center flex-wrap">
                        Guest Details
                        <span className="myop-v2-section-badges">
                          <Badge bg="light" text="dark" className="border">Required</Badge>
                          {primaryGuestErrorCount > 0 && (
                            <Badge bg="danger">
                              {primaryGuestErrorCount} to fix
                            </Badge>
                          )}
                        </span>
                      </h5>
                    </Accordion.Header>
                    <Accordion.Body>
                      <div className="text-muted small myop-v2-section-intro">
                        Lead guest for this booking. The name entered here is
                        also pre-filled as the first guest of each room below.
                      </div>
                      <Form className="booking-form">
                        <Row className="g-2">
                          <Col md={2}>
                            <Form.Label>
                              Title <span className="text-danger">*</span>
                            </Form.Label>
                            <Form.Select
                              value={primaryGuest.salutation}
                              onChange={(e) =>
                                handlePrimaryGuestChange(
                                  "salutation",
                                  e.target.value,
                                )
                              }
                              isInvalid={
                                !!validationErrors.primaryGuest_salutation
                              }
                              required
                            >
                              <option value="">Select</option>
                              <option value="Mr">Mr</option>
                              <option value="Mrs">Mrs</option>
                              <option value="Ms">Ms</option>
                              <option value="Dr">Dr</option>
                            </Form.Select>
                            <Form.Control.Feedback type="invalid">
                              {validationErrors.primaryGuest_salutation}
                            </Form.Control.Feedback>
                          </Col>
                          <Col md={4}>
                            <Form.Label>
                              First Name <span className="text-danger">*</span>
                            </Form.Label>
                            <Form.Control
                              type="text"
                              value={primaryGuest.firstName}
                              onChange={(e) =>
                                handlePrimaryGuestChange(
                                  "firstName",
                                  e.target.value,
                                )
                              }
                              isInvalid={
                                !!validationErrors.primaryGuest_firstName
                              }
                              required
                            />
                            <Form.Control.Feedback type="invalid">
                              {validationErrors.primaryGuest_firstName}
                            </Form.Control.Feedback>
                          </Col>
                          <Col md={3}>
                            <Form.Label>Middle Name</Form.Label>
                            <Form.Control
                              type="text"
                              value={primaryGuest.middleName}
                              onChange={(e) =>
                                setPrimaryGuest({
                                  ...primaryGuest,
                                  middleName: e.target.value,
                                })
                              }
                            />
                          </Col>
                          <Col md={3}>
                            <Form.Label>
                              Last Name <span className="text-danger">*</span>
                            </Form.Label>
                            <Form.Control
                              type="text"
                              value={primaryGuest.lastName}
                              onChange={(e) =>
                                handlePrimaryGuestChange(
                                  "lastName",
                                  e.target.value,
                                )
                              }
                              isInvalid={
                                !!validationErrors.primaryGuest_lastName
                              }
                              required
                            />
                            <Form.Control.Feedback type="invalid">
                              {validationErrors.primaryGuest_lastName}
                            </Form.Control.Feedback>
                          </Col>
                          <Col md={4}>
                            <Form.Label>
                              Contact Number{" "}
                              <span className="text-danger">*</span>
                            </Form.Label>
                            <Form.Control
                              type="tel"
                              value={primaryGuest.contactNumber}
                              onChange={(e) =>
                                handlePrimaryGuestChange(
                                  "contactNumber",
                                  e.target.value,
                                )
                              }
                              isInvalid={
                                !!validationErrors.primaryGuest_contactNumber
                              }
                              required
                            />
                            <Form.Control.Feedback type="invalid">
                              {validationErrors.primaryGuest_contactNumber}
                            </Form.Control.Feedback>
                          </Col>
                          <Col md={4}>
                            <Form.Label>
                              Email Id <span className="text-danger">*</span>
                            </Form.Label>
                            <Form.Control
                              type="email"
                              value={primaryGuest.emailId}
                              onChange={(e) =>
                                handlePrimaryGuestChange(
                                  "emailId",
                                  e.target.value,
                                )
                              }
                              isInvalid={
                                !!validationErrors.primaryGuest_emailId
                              }
                              required
                            />
                            <Form.Control.Feedback type="invalid">
                              {validationErrors.primaryGuest_emailId}
                            </Form.Control.Feedback>
                          </Col>
                          <Col md={4}>
                            <Form.Label>Passport Number</Form.Label>
                            <Form.Control
                              type="text"
                              value={primaryGuest.passportNumber}
                              onChange={(e) =>
                                setPrimaryGuest({
                                  ...primaryGuest,
                                  passportNumber: e.target.value,
                                })
                              }
                            />
                          </Col>
                        </Row>
                      </Form>
                    </Accordion.Body>
                  </Accordion.Item>

                  {/* Hotel Option Section */}
                  {hotels.length > 0 && (
                    <Accordion.Item eventKey="1" className="mb-2">
                      <Accordion.Header>
                        <h5 className="mb-0 fw-bold d-flex align-items-center flex-wrap">
                          Hotels
                          <span className="badge bg-primary-subtle text-primary ms-2">
                            {hotels.length}
                          </span>
                          <span className="myop-v2-section-badges">
                            <Badge bg="light" text="dark" className="border">Guest names required</Badge>
                            {hotelGuestErrorCount > 0 && (
                              <Badge bg="danger">
                                {hotelGuestErrorCount} to fix
                              </Badge>
                            )}
                          </span>
                        </h5>
                      </Accordion.Header>
                      <Accordion.Body>
                        <div className="text-muted small myop-v2-section-intro">
                          Enter the name of every guest in each room. Tourism
                          dirham, remarks and the voucher option are optional.
                        </div>
                        {hotels.map((item, hotelIndex) => {
                          const hotel = item.hotel || {};
                          const details = hotel.details || {};
                          const checkIn =
                            hotel.checkIn ||
                            hotel.checkInDate ||
                            details.checkInDate ||
                            "";
                          const checkOut =
                            hotel.checkOut ||
                            hotel.checkOutDate ||
                            details.checkOutDate ||
                            "";
                          const searchRoomDTOs =
                            hotel.searchRoomDTOs ||
                            details.searchRoomDTOs ||
                            [];

                          // Calculate date range for pricing table
                          const getDateRange = (startDate, endDate) => {
                            if (!startDate || !endDate) return [];
                            try {
                              // Handle DD/MM/YYYY format
                              let start, end;
                              if (startDate.includes("/")) {
                                const [day, month, year] = startDate.split("/");
                                start = new Date(year, month - 1, day);
                              } else {
                                start = new Date(startDate);
                              }

                              if (endDate.includes("/")) {
                                const [day, month, year] = endDate.split("/");
                                end = new Date(year, month - 1, day);
                              } else {
                                end = new Date(endDate);
                              }

                              const dates = [];
                              const current = new Date(start);
                              while (current < end) {
                                dates.push(new Date(current));
                                current.setDate(current.getDate() + 1);
                              }
                              return dates;
                            } catch {
                              return [];
                            }
                          };

                          const dateRange = getDateRange(checkIn, checkOut);
                          // Total Price = totalRateWithoutmrk (without markup)
                          const hotelTotalPrice = parseFloat(
                            hotel.totalRateWithoutmrk || hotel.totalRate || 0,
                          );
                          // Selling Price = totalRate (with markup)
                          const hotelSellingPrice = parseFloat(
                            hotel.totalRate || 0,
                          );
                          const pricePerNight =
                            dateRange.length > 0
                              ? hotelTotalPrice / dateRange.length
                              : hotelTotalPrice;

                          return (
                            <div
                              key={hotelIndex}
                              className="simple-section-row"
                            >
                              <div className="simple-section-row-title">
                                <FaBed className="text-primary me-2" />
                                <span className="fw-bold">
                                  {hotels.length > 1
                                    ? `Hotel ${hotelIndex + 1}: `
                                    : ""}
                                  {hotel.hotelName || "Hotel"}
                                </span>
                              </div>
                              <div className="simple-section-row-body">
                                <div className="small mb-2">
                                  <FaCalendarAlt className="text-primary me-1" />
                                  <strong>Checkin:</strong>{" "}
                                  {formatDate(checkIn)}
                                  {" / "}
                                  <strong>Checkout:</strong>{" "}
                                  {formatDate(checkOut)}
                                </div>

                                {searchRoomDTOs.length > 0 && (
                                  <>
                                    <Table
                                      striped
                                      bordered
                                      hover
                                      responsive
                                      size="sm"
                                      className="mb-3 room-table"
                                    >
                                      <thead>
                                        <tr>
                                          <th>No.</th>
                                          <th>Room Category</th>
                                          <th>Adult Count</th>
                                          <th>Child Count</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {searchRoomDTOs.map(
                                          (room, roomIndex) => {
                                            let childAges = [];
                                            if (room.childAge) {
                                              childAges = Array.isArray(
                                                room.childAge,
                                              )
                                                ? room.childAge
                                                : [room.childAge];
                                            } else if (room.childAges) {
                                              childAges = Array.isArray(
                                                room.childAges,
                                              )
                                                ? room.childAges
                                                : [room.childAges];
                                            }

                                            const childCount = parseInt(
                                              room.child || room.children || 0,
                                            );

                                            return (
                                              <tr key={roomIndex}>
                                                <td>{roomIndex + 1}</td>
                                                <td>
                                                  {hotel.roomCategory || "-"}
                                                  {hotel.roomType &&
                                                    ` - ${hotel.roomType}`}
                                                </td>
                                                <td>
                                                  {room.adult ||
                                                    room.adults ||
                                                    "-"}
                                                </td>
                                                <td>
                                                  {childCount > 0 ? (
                                                    <>
                                                      {childCount}
                                                      {childAges.length > 0 &&
                                                        childAges.length ===
                                                          1 && (
                                                          <small className="text-muted d-block mt-1">
                                                            {childCount} Child :{" "}
                                                            {childAges[0]} Age
                                                          </small>
                                                        )}
                                                      {childAges.length > 1 && (
                                                        <small className="text-muted d-block mt-1">
                                                          {childAges.map(
                                                            (age, idx) => (
                                                              <span key={idx}>
                                                                {idx + 1} Child
                                                                : {age} Age
                                                                {idx <
                                                                childAges.length -
                                                                  1
                                                                  ? ", "
                                                                  : ""}
                                                              </span>
                                                            ),
                                                          )}
                                                        </small>
                                                      )}
                                                    </>
                                                  ) : (
                                                    "-"
                                                  )}
                                                </td>
                                              </tr>
                                            );
                                          },
                                        )}
                                      </tbody>
                                    </Table>
                                    {/* Guest Details for each room */}
                                    <div className="myop-v2-subheading">
                                      <FaUsers className="text-primary" />
                                      <span className="fw-semibold small">Room guests</span>
                                      <span className="text-muted small">
                                        — required for every guest
                                      </span>
                                    </div>
                                    {searchRoomDTOs.map((room, roomIndex) => {
                                      const adults = parseInt(
                                        room.adult || room.adults || 1,
                                      );
                                      const children = parseInt(
                                        room.child || room.children || 0,
                                      );
                                      const totalGuests = adults + children;

                                      // Find hotel index in cartData to match validation
                                      let hotelIndexInCart = -1;
                                      let hotelCount = 0;
                                      for (
                                        let i = 0;
                                        i < cartData.length;
                                        i++
                                      ) {
                                        if (cartData[i].hotel) {
                                          if (hotelCount === hotelIndex) {
                                            hotelIndexInCart = i;
                                            break;
                                          }
                                          hotelCount++;
                                        }
                                      }

                                      const guestKey =
                                        hotelIndexInCart >= 0
                                          ? `${hotelIndexInCart}-${roomIndex}`
                                          : `${hotelIndex}-${roomIndex}`;
                                      const guests = roomGuests[guestKey] || [];
                                      const actualHotelIndex =
                                        hotelIndexInCart >= 0
                                          ? hotelIndexInCart
                                          : hotelIndex;

                                      if (totalGuests === 0) return null;

                                      return (
                                        <Card
                                          key={`guest-${roomIndex}`}
                                          className="mb-2 guest-details-card myop-v2-nested-card"
                                        >
                                          <Card.Header>
                                            <h6 className="mb-0">
                                              Room {roomIndex + 1} - Guest
                                              Details
                                            </h6>
                                          </Card.Header>
                                          <Card.Body>
                                            {Array.from(
                                              { length: totalGuests },
                                              (_, guestIndex) => {
                                                const isChild =
                                                  guestIndex >= adults;
                                                const guest = guests[
                                                  guestIndex
                                                ] || {
                                                  salutation: "",
                                                  firstName: "",
                                                  lastName: "",
                                                  gender: "",
                                                  isChild: isChild,
                                                };

                                                return (
                                                  <div
                                                    key={guestIndex}
                                                    className="guest-row-item"
                                                  >
                                                    <h6 className="mb-2">
                                                      {isChild
                                                        ? `Child ${guestIndex - adults + 1}${guest.age ? ` (Age: ${guest.age})` : ""}`
                                                        : `Adult ${guestIndex + 1}`}
                                                    </h6>
                                                    <Row className="g-2">
                                                      <Col md={2}>
                                                        <Form.Label className="small">
                                                          Salutation{" "}
                                                          <span className="text-danger">
                                                            *
                                                          </span>
                                                        </Form.Label>
                                                        <Form.Select
                                                          size="sm"
                                                          value={
                                                            guest.salutation
                                                          }
                                                          onChange={(e) =>
                                                            handleGuestChange(
                                                              actualHotelIndex,
                                                              roomIndex,
                                                              guestIndex,
                                                              "salutation",
                                                              e.target.value,
                                                            )
                                                          }
                                                          required
                                                          isInvalid={
                                                            !!validationErrors[
                                                              `hotel_${actualHotelIndex}_room_${roomIndex}_guest_${guestIndex}_salutation`
                                                            ]
                                                          }
                                                        >
                                                          <option value="">
                                                            Select
                                                          </option>
                                                          <option value="Mr">
                                                            Mr
                                                          </option>
                                                          <option value="Mrs">
                                                            Mrs
                                                          </option>
                                                          <option value="Ms">
                                                            Ms
                                                          </option>
                                                          <option value="Miss">
                                                            Miss
                                                          </option>
                                                          <option value="Dr">
                                                            Dr
                                                          </option>
                                                        </Form.Select>
                                                        <Form.Control.Feedback type="invalid">
                                                          {
                                                            validationErrors[
                                                              `hotel_${actualHotelIndex}_room_${roomIndex}_guest_${guestIndex}_salutation`
                                                            ]
                                                          }
                                                        </Form.Control.Feedback>
                                                      </Col>
                                                      <Col md={4}>
                                                        <Form.Label className="small">
                                                          First Name{" "}
                                                          <span className="text-danger">
                                                            *
                                                          </span>
                                                        </Form.Label>
                                                        <Form.Control
                                                          type="text"
                                                          size="sm"
                                                          value={
                                                            guest.firstName ||
                                                            ""
                                                          }
                                                          onChange={(e) =>
                                                            handleGuestChange(
                                                              actualHotelIndex,
                                                              roomIndex,
                                                              guestIndex,
                                                              "firstName",
                                                              e.target.value,
                                                            )
                                                          }
                                                          required
                                                          placeholder="First Name"
                                                          isInvalid={
                                                            !!validationErrors[
                                                              `hotel_${actualHotelIndex}_room_${roomIndex}_guest_${guestIndex}_firstName`
                                                            ]
                                                          }
                                                        />
                                                        <Form.Control.Feedback type="invalid">
                                                          {
                                                            validationErrors[
                                                              `hotel_${actualHotelIndex}_room_${roomIndex}_guest_${guestIndex}_firstName`
                                                            ]
                                                          }
                                                        </Form.Control.Feedback>
                                                      </Col>
                                                      <Col md={3}>
                                                        <Form.Label className="small">
                                                          Last Name{" "}
                                                          <span className="text-danger">
                                                            *
                                                          </span>
                                                        </Form.Label>
                                                        <Form.Control
                                                          type="text"
                                                          size="sm"
                                                          value={
                                                            guest.lastName || ""
                                                          }
                                                          onChange={(e) =>
                                                            handleGuestChange(
                                                              actualHotelIndex,
                                                              roomIndex,
                                                              guestIndex,
                                                              "lastName",
                                                              e.target.value,
                                                            )
                                                          }
                                                          required
                                                          placeholder="Last Name"
                                                          isInvalid={
                                                            !!validationErrors[
                                                              `hotel_${actualHotelIndex}_room_${roomIndex}_guest_${guestIndex}_lastName`
                                                            ]
                                                          }
                                                        />
                                                        <Form.Control.Feedback type="invalid">
                                                          {
                                                            validationErrors[
                                                              `hotel_${actualHotelIndex}_room_${roomIndex}_guest_${guestIndex}_lastName`
                                                            ]
                                                          }
                                                        </Form.Control.Feedback>
                                                      </Col>
                                                      <Col md={3}>
                                                        <Form.Label className="small">
                                                          Gender{" "}
                                                          <span className="text-danger">
                                                            *
                                                          </span>
                                                        </Form.Label>
                                                        <Form.Select
                                                          size="sm"
                                                          value={
                                                            guest.gender || ""
                                                          }
                                                          onChange={(e) =>
                                                            handleGuestChange(
                                                              actualHotelIndex,
                                                              roomIndex,
                                                              guestIndex,
                                                              "gender",
                                                              e.target.value,
                                                            )
                                                          }
                                                          required
                                                          isInvalid={
                                                            !!validationErrors[
                                                              `hotel_${actualHotelIndex}_room_${roomIndex}_guest_${guestIndex}_gender`
                                                            ]
                                                          }
                                                        >
                                                          <option value="">
                                                            Select
                                                          </option>
                                                          <option value="Male">
                                                            Male
                                                          </option>
                                                          <option value="Female">
                                                            Female
                                                          </option>
                                                        </Form.Select>
                                                        <Form.Control.Feedback type="invalid">
                                                          {
                                                            validationErrors[
                                                              `hotel_${actualHotelIndex}_room_${roomIndex}_guest_${guestIndex}_gender`
                                                            ]
                                                          }
                                                        </Form.Control.Feedback>
                                                      </Col>
                                                    </Row>
                                                  </div>
                                                );
                                              },
                                            )}
                                          </Card.Body>
                                        </Card>
                                      );
                                    })}
                                  </>
                                )}

                                {/* Date-wise Pricing Table */}
                                {dateRange.length > 0 && (
                                  <Table
                                    striped
                                    bordered
                                    hover
                                    responsive
                                    size="sm"
                                    className="mb-2 date-pricing-table"
                                  >
                                    <thead>
                                      <tr>
                                        <th>Date</th>
                                        <th>Total Price</th>
                                        <th>Selling Price</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {dateRange.map((date, dateIndex) => {
                                        const dateStr =
                                          date.toLocaleDateString("en-GB");
                                        return (
                                          <tr key={dateIndex}>
                                            <td>{dateStr}</td>
                                            <td>{pricePerNight.toFixed(2)}</td>
                                            <td>{pricePerNight.toFixed(2)}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </Table>
                                )}

                                {/* Stay totals — read-only, same figures the
                                    Package Summary and Order Summary use. */}
                                <Row className="g-2 small mb-3">
                                  <Col xs={12} md>
                                    <span className="text-muted">
                                      {dateRange.length > 0
                                        ? `${dateRange.length} night${dateRange.length === 1 ? "" : "s"} · stay total`
                                        : "Stay total"}
                                    </span>
                                  </Col>
                                  <Col xs={6} md="auto" className="ms-md-auto text-md-end myop-v2-money">
                                    <span className="text-muted">Selling: </span>
                                    <strong className="text-success">
                                      AED {hotelSellingPrice.toFixed(2)}
                                    </strong>
                                  </Col>
                                  <Col xs={6} md="auto" className="text-md-end myop-v2-money">
                                    <span className="text-muted">Total: </span>
                                    <strong className="text-primary">
                                      AED {hotelTotalPrice.toFixed(2)}
                                    </strong>
                                  </Col>
                                </Row>

                                {/* Selling Price and Total Price */}
                                {/* <div className="mb-3">
                                <Row className="g-2">
                                  <Col sm={6}>
                                    <div className="d-flex justify-content-between align-items-center">
                                      <strong>Selling Price:</strong>
                                      <span className="text-success fw-bold">
                                        {hotelSellingPrice.toFixed(2)}
                                      </span>
                                    </div>
                                  </Col>
                                  <Col sm={6}>
                                    <div className="d-flex justify-content-between align-items-center">
                                      <strong>Total Price:</strong>
                                      <span className="text-primary fw-bold">
                                        {hotelTotalPrice.toFixed(2)}
                                      </span>
                                    </div>
                                  </Col>
                                </Row>
                              </div> */}

                                {/* Hotel booking options — grouped so the
                                    optional operator inputs read as one block
                                    after the required guest names. */}
                                <div className="myop-v2-fieldgroup mt-3">
                                <div className="myop-v2-fieldgroup__title">
                                  <span className="fw-semibold small text-dark">
                                    <FaBed className="text-primary" />
                                    Hotel booking options
                                  </span>
                                  <span className="text-muted small">Optional</span>
                                </div>
                                <Row className="g-3 mb-2">
                                  {/* Tourism Dirhams */}
                                  <Col md={4}>
                                    <Form.Label>
                                      Tourism Dirhams (AED)
                                    </Form.Label>
                                    <Form.Control
                                      type="number"
                                      value={
                                        hotelTourismDirhams[hotelIndex] || "0"
                                      }
                                      onChange={(e) =>
                                        setHotelTourismDirhams({
                                          ...hotelTourismDirhams,
                                          [hotelIndex]: e.target.value,
                                        })
                                      }
                                      min="0"
                                    />
                                  </Col>
                                  {/* Booking Confirmation */}
                                  <Col md={8}>
                                    <Form.Label className="mb-2">
                                      Voucher option
                                    </Form.Label>
                                    <div>
                                      <Form.Check
                                        type="radio"
                                        label="Book & Voucher"
                                        name={`bookingConfirmation-${hotelIndex}`}
                                        value="Book & Voucher"
                                        checked={
                                          hotelBookingConfirmation[hotelIndex] ===
                                          "Book & Voucher"
                                        }
                                        onChange={(e) =>
                                          setHotelBookingConfirmation({
                                            ...hotelBookingConfirmation,
                                            [hotelIndex]: e.target.value,
                                          })
                                        }
                                        inline
                                        className="me-3"
                                      />
                                      <Form.Check
                                        type="radio"
                                        label="Book Now & Voucher later"
                                        name={`bookingConfirmation-${hotelIndex}`}
                                        value="Book Now & Voucher later"
                                        checked={
                                          hotelBookingConfirmation[hotelIndex] ===
                                          "Book Now & Voucher later"
                                        }
                                        onChange={(e) =>
                                          setHotelBookingConfirmation({
                                            ...hotelBookingConfirmation,
                                            [hotelIndex]: e.target.value,
                                          })
                                        }
                                        inline
                                      />
                                    </div>
                                  </Col>
                                </Row>

                                <Row className="g-3">
                                  {/* Remarks */}
                                  <Col md={6}>
                                    <Form.Label>Remarks</Form.Label>
                                    <Form.Control
                                      as="textarea"
                                      rows={2}
                                      value={hotelRemarks[hotelIndex] || ""}
                                      onChange={(e) =>
                                        setHotelRemarks({
                                          ...hotelRemarks,
                                          [hotelIndex]: e.target.value,
                                        })
                                      }
                                      placeholder="Enter any remarks..."
                                    />
                                  </Col>
                                  {/* Special Request */}
                                  <Col md={6}>
                                    <Form.Label>Special Request</Form.Label>
                                    <Form.Control
                                      as="textarea"
                                      rows={2}
                                      value={
                                        hotelSpecialRequests[hotelIndex] || ""
                                      }
                                      onChange={(e) =>
                                        setHotelSpecialRequests({
                                          ...hotelSpecialRequests,
                                          [hotelIndex]: e.target.value,
                                        })
                                      }
                                      placeholder="Enter any special requests..."
                                    />
                                  </Col>
                                </Row>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </Accordion.Body>
                    </Accordion.Item>
                  )}

                  {/* Transfer Option Section */}
                  {transfers.length > 0 && (
                    <Accordion.Item eventKey="3" className="mb-2">
                      <Accordion.Header>
                        <h5 className="mb-0 fw-bold d-flex align-items-center flex-wrap">
                          Transfers
                          <span className="badge bg-info-subtle text-info ms-2">
                            {transfers.length}
                          </span>
                          <span className="myop-v2-section-badges">
                            <Badge bg="light" text="dark" className="border">Optional input</Badge>
                          </span>
                        </h5>
                      </Accordion.Header>
                      <Accordion.Body>
                        <div className="text-muted small myop-v2-section-intro">
                          Review the transfers in the package. The transporter
                          name can be filled in now or left for later.
                        </div>
                        {transfers.map((item, transferIndex) => {
                          const cab = item.cab || {};
                          const details = cab.details || {};
                          const vehicleName =
                            cab.vehicleName ||
                            details.vehicleName ||
                            cab.cabName ||
                            "Transfer";
                          // Route names are stamped on the v2 cab payload by
                          // the wizard (pickupName / dropoffName) — display
                          // only, nothing is written back.
                          const routeText =
                            cab.pickupName || cab.dropoffName
                              ? `${cab.pickupName || "—"} → ${cab.dropoffName || "—"}`
                              : "";
                          const capacity =
                            cab.capacity || details.capacity || "";
                          const pickupDate = cab.pickupDate || "";
                          const dropDate = cab.dropoffDate || "";
                          const adult =
                            cab.adult || details.adult || cab.noOfAdult || "0";
                          const child =
                            cab.child || details.child || cab.noOfChild || "0";
                          const travelType =
                            cab.travelType || details.travelType || "1";
                          const shareType =
                            cab.shareType || details.shareType || "Private";

                          // Handle childAge
                          let childAges = [];
                          if (cab.childAge) {
                            childAges = Array.isArray(cab.childAge)
                              ? cab.childAge
                              : [cab.childAge];
                          } else if (cab.childAges) {
                            childAges = Array.isArray(cab.childAges)
                              ? cab.childAges
                              : [cab.childAges];
                          } else if (cab.childAgeArray) {
                            childAges = Array.isArray(cab.childAgeArray)
                              ? cab.childAgeArray
                              : [cab.childAgeArray];
                          } else if (details.childAge) {
                            childAges = Array.isArray(details.childAge)
                              ? details.childAge
                              : [details.childAge];
                          } else if (details.childAgeArray) {
                            childAges = Array.isArray(details.childAgeArray)
                              ? details.childAgeArray
                              : [details.childAgeArray];
                          }

                          const transferDetail =
                            transferDetails[transferIndex] || {};
                          // Selling Price = totalRate (with markup)
                          const sellingPrice = parseFloat(cab.totalRate || 0);
                          // Total Price = totalRateWithoutmrk (without markup)
                          const totalPrice = parseFloat(
                            cab.totalRateWithoutmrk || cab.totalRate || 0,
                          );

                          // Get travel type label
                          const getTravelTypeLabel = (type) => {
                            if (type === "1") return "Arrival & Departure";
                            if (type === "2") return "Arrival";
                            if (type === "3") return "Departure";
                            return type;
                          };

                          return (
                            <div
                              key={transferIndex}
                              className="simple-section-row"
                            >
                              <div className="simple-section-row-title">
                                <FaCar className="text-primary me-2" />
                                <span className="fw-bold">
                                  {transfers.length > 1
                                    ? `Transfer ${transferIndex + 1}: `
                                    : ""}
                                  {capacity
                                    ? `${capacity} Seater`
                                    : vehicleName}
                                </span>
                              </div>
                              <div className="simple-section-row-body">
                                {routeText && (
                                  <div className="small mb-2">
                                    <FaMapMarkerAlt className="text-primary me-1" />
                                    <strong>Route:</strong> {routeText}
                                  </div>
                                )}
                                <Row className="g-2 align-items-center small mb-2">
                                  <Col md={4}>
                                    <FaCalendarAlt className="text-primary me-1" />
                                    <strong>Pickup:</strong>{" "}
                                    {formatDate(pickupDate)}
                                    {" / "}
                                    <strong>Drop:</strong>{" "}
                                    {formatDate(dropDate)}
                                  </Col>
                                  <Col md={3}>
                                    <span className="text-muted">Type: </span>
                                    <strong>
                                      {getTravelTypeLabel(travelType)} /{" "}
                                      {shareType}
                                    </strong>
                                  </Col>
                                  <Col md={2}>
                                    <span className="text-muted">Adults: </span>
                                    <strong>{adult}</strong>
                                  </Col>
                                  <Col md={3}>
                                    <span className="text-muted">Children: </span>
                                    <strong>{child}</strong>
                                    {childAges.length > 0 && (
                                      <span className="text-muted ms-1">
                                        ({childAges.join(", ")})
                                      </span>
                                    )}
                                  </Col>
                                </Row>
                                <Row className="g-2 align-items-end mb-2">
                                  <Col md={6}>
                                    <Form.Label className="small mb-1">
                                      Transporter Name
                                    </Form.Label>
                                    <Form.Control
                                      size="sm"
                                      type="text"
                                      value={
                                        transferDetails[transferIndex]
                                          ?.transporterName !== undefined
                                          ? transferDetails[transferIndex]
                                              .transporterName
                                          : primaryGuest.firstName || ""
                                      }
                                      onChange={(e) =>
                                        setTransferDetails({
                                          ...transferDetails,
                                          [transferIndex]: {
                                            ...transferDetail,
                                            transporterName: e.target.value,
                                          },
                                        })
                                      }
                                      placeholder="Enter transporter name"
                                    />
                                  </Col>
                                  <Col xs={6} md="auto" className="ms-md-auto text-md-end myop-v2-money">
                                    <span className="text-muted small">
                                      Selling:{" "}
                                    </span>
                                    <strong className="text-success">
                                      AED {sellingPrice.toFixed(2)}
                                    </strong>
                                  </Col>
                                  <Col xs={6} md="auto" className="text-md-end myop-v2-money">
                                    <span className="text-muted small">
                                      Total:{" "}
                                    </span>
                                    <strong className="text-primary">
                                      AED {totalPrice.toFixed(2)}
                                    </strong>
                                  </Col>
                                </Row>
                              </div>
                            </div>
                          );
                        })}
                      </Accordion.Body>
                    </Accordion.Item>
                  )}

                  {/* Activity Option Section */}
                  {activities.length > 0 && (
                    <Accordion.Item eventKey="2" className="mb-2">
                      <Accordion.Header>
                        <h5 className="mb-0 fw-bold d-flex align-items-center flex-wrap">
                          Tours &amp; Activities
                          <span className="badge bg-warning-subtle text-warning ms-2">
                            {activities.length}
                          </span>
                          <span className="myop-v2-section-badges">
                            <Badge bg="light" text="dark" className="border">Review</Badge>
                          </span>
                        </h5>
                      </Accordion.Header>
                      <Accordion.Body>
                        {activities.map((item, activityIndex) => {
                          const activity = item.activity || {};
                          const details = activity.details || {};
                          const activityName =
                            activity.activityName ||
                            details.activityName ||
                            "Activity";
                          const activityDate =
                            activity.activityDate || details.activityDate || "";
                          const adult =
                            activity.adult ||
                            details.adult ||
                            activity.noOfAdult ||
                            "0";
                          const child =
                            activity.child ||
                            details.child ||
                            activity.noOfChild ||
                            "0";

                          let childAges = [];
                          if (activity.childAge) {
                            childAges = Array.isArray(activity.childAge)
                              ? activity.childAge
                              : [activity.childAge];
                          }

                          // Selling Price = totalRate (with markup)
                          const sellingPrice = parseFloat(
                            activity.totalRate || 0,
                          );
                          // Total Price = totalRateWithoutmrk (without markup)
                          const totalPrice = parseFloat(
                            activity.totalRateWithoutmrk ||
                              activity.totalRate ||
                              0,
                          );

                          // Find actual index in cartData for activityDetails
                          let activityIndexInCart = -1;
                          let activityCount = 0;
                          for (let i = 0; i < cartData.length; i++) {
                            if (cartData[i].activity) {
                              if (activityCount === activityIndex) {
                                activityIndexInCart = i;
                                break;
                              }
                              activityCount++;
                            }
                          }
                          const actualIndex = activityIndexInCart >= 0 ? activityIndexInCart : 0;
                          const activityDetail = activityDetails[actualIndex] || {};

                          return (
                            <div
                              key={activityIndex}
                              className="simple-section-row"
                            >
                              <div className="simple-section-row-title">
                                <FaTicketAlt className="text-primary me-2" />
                                <span className="fw-bold">
                                  {activities.length > 1
                                    ? `Activity ${activityIndex + 1}: `
                                    : ""}
                                  {activityName}
                                </span>
                              </div>
                              <div className="simple-section-row-body">
                                <Row className="g-2 align-items-center small">
                                  <Col xs={12} md="auto">
                                    <FaCalendarAlt className="text-primary me-1" />
                                    <strong>Tour date:</strong>{" "}
                                    {formatDate(activityDate)}
                                  </Col>
                                  <Col xs={6} md="auto">
                                    <span className="text-muted">Adults: </span>
                                    <strong>{adult}</strong>
                                  </Col>
                                  <Col xs={6} md="auto">
                                    <span className="text-muted">Children: </span>
                                    <strong>{child}</strong>
                                    {childAges.length > 0 && (
                                      <span className="text-muted ms-1">
                                        ({childAges.join(", ")})
                                      </span>
                                    )}
                                  </Col>
                                  <Col xs={6} md="auto" className="ms-md-auto text-md-end myop-v2-money">
                                    <span className="text-muted">Selling: </span>
                                    <strong className="text-success">
                                      AED {sellingPrice.toFixed(2)}
                                    </strong>
                                  </Col>
                                  <Col xs={6} md="auto" className="text-md-end myop-v2-money">
                                    <span className="text-muted">Total: </span>
                                    <strong className="text-primary">
                                      AED {totalPrice.toFixed(2)}
                                    </strong>
                                  </Col>
                                </Row>

                                {/* <div className="mb-3 p-3 bg-light rounded mt-3">
                                  <h6 className="mb-3 fw-bold text-primary">
                                    Driver Details
                                  </h6>
                                  <Row className="g-3">
                                    <Col md={6}>
                                      <Form.Label>Driver Name</Form.Label>
                                      <Form.Control
                                        type="text"
                                        value={activityDetail.driverName || ""}
                                        onChange={(e) =>
                                          setActivityDetails({
                                            ...activityDetails,
                                            [actualIndex]: {
                                              ...activityDetail,
                                              driverName: e.target.value,
                                            },
                                          })
                                        }
                                        placeholder="Enter driver name"
                                      />
                                    </Col>
                                    <Col md={6}>
                                      <Form.Label>Driver Contact</Form.Label>
                                      <Form.Control
                                        type="text"
                                        value={activityDetail.driverContact || ""}
                                        onChange={(e) =>
                                          setActivityDetails({
                                            ...activityDetails,
                                            [actualIndex]: {
                                              ...activityDetail,
                                              driverContact: e.target.value,
                                            },
                                          })
                                        }
                                        placeholder="Enter driver contact"
                                      />
                                    </Col>
                                  </Row>
                                </div> */}
                              </div>
                            </div>
                          );
                        })}
                      </Accordion.Body>
                    </Accordion.Item>
                  )}

                  {/* Itinerary Option Section */}
                  <Accordion.Item eventKey="0" className="mb-2">
                    <Accordion.Header>
                      <h5 className="mb-0 fw-bold d-flex align-items-center flex-wrap">
                        Itinerary
                        {uniqueActivityDates.length > 0 && (
                          <span className="badge bg-info-subtle text-info ms-2">
                            {uniqueActivityDates.length} day
                            {uniqueActivityDates.length === 1 ? "" : "s"}
                          </span>
                        )}
                        <span className="myop-v2-section-badges">
                          <Badge bg="light" text="dark" className="border">Optional</Badge>
                        </span>
                      </h5>
                    </Accordion.Header>
                    <Accordion.Body>
                      <div className="text-muted small myop-v2-section-intro">
                        Optionally attach day-wise itinerary notes to each
                        activity date using the <FaPlus size={10} /> button.
                      </div>
                      <div className="itinerary-days-container">
                        {uniqueActivityDates.map((dateString, index) => (
                          <div className="itinerary-day-box mb-3" key={index}>
                            <div className="d-flex justify-content-between align-items-center">
                               <h6 className="mb-0 fw-bold">
                                <small className="fw-normal text-muted">
                                  Itinerary for activity on
                                </small>{" "}
                                {formatActivityDateHeader(dateString)}
                              </h6>
                              <Button
                                variant="outline-danger"
                                size="sm"
                                className="rounded-circle itinerary-plus-btn"
                                onClick={() =>
                                  handleOpenItineraryModal(dateString)
                                }
                              >
                                <FaPlus />
                              </Button>
                            </div>
                            {/* Selected Itineraries Preview */}
                            {(selectedItineraries[dateString] || []).length >
                              0 && (
                              <div className="mt-3 pt-3 border-top">
                                {(selectedItineraries[dateString] || []).map(
                                  (itineraryId) => {
                                    const itinerary = itineraryList.find(
                                      (item) =>
                                        item.itineraryId === itineraryId,
                                    );
                                    if (!itinerary) return null;
                                    return (
                                      <div
                                        key={itineraryId}
                                        className="d-flex justify-content-between align-items-center mb-2 itinerary-preview-item"
                                      >
                                        <div className="d-flex align-items-center flex-grow-1">
                                          <FaCheckCircle
                                            className="text-success me-2"
                                            size={14}
                                          />
                                          <span className="small">
                                            {itinerary.itineraryHeading ||
                                              "Untitled"}
                                          </span>
                                        </div>
                                        <Button
                                          variant="link"
                                          size="sm"
                                          className="text-danger p-0 ms-2"
                                          style={{
                                            fontSize: "0.75rem",
                                            minWidth: "auto",
                                          }}
                                          onClick={() => {
                                            setSelectedItineraries((prev) => ({
                                              ...prev,
                                              [dateString]: prev[
                                                dateString
                                              ].filter(
                                                (id) => id !== itineraryId,
                                              ),
                                            }));
                                          }}
                                        >
                                          ×
                                        </Button>
                                      </div>
                                    );
                                  },
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                        {uniqueActivityDates.length === 0 && (
                          <div className="text-muted small">
                            No activities found to generate itinerary days.
                          </div>
                        )}
                      </div>
                    </Accordion.Body>
                  </Accordion.Item>

                  {/* Visa Information accordion removed in v2 — the
                      Visa YES/NO + support contact is captured on the
                      /addons step and surfaced in the "Selected Add-On
                      Services" panel below alongside the other add-ons,
                      so duplicating it as its own accordion here was
                      redundant. */}

                  {/* ── Add-On Services accordion ──────────────────
                       Lives alongside Itinerary / Hotel / Activity /
                       Cab / Visa / Primary-Guest so the operator can
                       expand it from the booking page just like any
                       other section. The inner panel manages its own
                       sessionStorage; on close we refresh the count
                       badge in the header. */}
                  {/* v2: Add-Ons accordion REMOVED — replaced by a
                       read-only "Selected Add-On Services" panel below
                       so the operator can verify what they picked on
                       /addons before confirming the booking. Selections
                       still live in sessionStorage and are picked up by
                       the save handler via collectEnabledAddOnServices(). */}
                  <Accordion.Item eventKey="6" className="mb-2">
                    <Accordion.Header>
                      <h5 className="mb-0 fw-bold d-flex align-items-center flex-wrap">
                        Selected Add-On Services
                        <span
                          className={`badge ms-2 bg-${
                            addOnsCount > 0 ? "success" : "secondary"
                          }`}
                        >
                          {addOnsCount > 0 ? `${addOnsCount} on` : "None"}
                        </span>
                        <span className="myop-v2-section-badges">
                          <Badge bg="light" text="dark" className="border">Review</Badge>
                        </span>
                      </h5>
                    </Accordion.Header>
                    <Accordion.Body>
                      {(() => {
                        const all = readAddOnServices() || {};
                        // Display-only: list every enabled add-on, using the
                        // admin-managed catalog (with the static one as a
                        // fallback) so dynamic entries appear here too.
                        const displayCatalog =
                          addOnCatalog.length > 0 ? addOnCatalog : ADDON_SERVICES_CATALOG;
                        const enabled = displayCatalog.filter(
                          (svc) => all[svc.key]?.enabled
                        );
                        const priceFor = (svc) => {
                          const unit = Number(svc.unitPrice) || 0;
                          const qty = Number(all[svc.key]?.quantity) > 0
                            ? Number(all[svc.key].quantity)
                            : 1;
                          return unit * qty;
                        };
                        if (enabled.length === 0) {
                          return (
                            <div className="text-muted small fst-italic">
                              No add-on services were selected on the Select
                              Services step. Add-ons are optional — use Edit
                              package to change your selection.
                            </div>
                          );
                        }
                        return (
                          <>
                          <Row className="g-3">
                            {enabled.map((svc) => {
                              const data = all[svc.key] || {};
                              const filled = (svc.fields || []).filter((f) => {
                                const v = data[f.name];
                                return v !== undefined && v !== "" && v !== null;
                              });
                              const price = priceFor(svc);
                              return (
                                <Col md={6} key={svc.key}>
                                  <Card className="h-100 border-success-subtle mb-0">
                                    <Card.Header className="bg-success-subtle py-2 d-flex justify-content-between align-items-center gap-2">
                                      <strong className="small">
                                        {svc.label}
                                      </strong>
                                      {price > 0 && (
                                        <span className="small fw-semibold myop-v2-money">
                                          {(svc.currency || "AED")} {price.toLocaleString()}
                                        </span>
                                      )}
                                    </Card.Header>
                                    <Card.Body className="p-2">
                                      {filled.length === 0 ? (
                                        <span className="small text-muted fst-italic">
                                          Enabled (no extra details captured)
                                        </span>
                                      ) : (
                                        <table className="table table-sm mb-0">
                                          <tbody>
                                            {filled.map((f) => (
                                              <tr key={f.name}>
                                                <td
                                                  className="small text-muted fw-semibold"
                                                  style={{ width: "45%" }}
                                                >
                                                  {f.label}
                                                </td>
                                                <td className="small">
                                                  {String(data[f.name])}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      )}
                                    </Card.Body>
                                  </Card>
                                </Col>
                              );
                            })}
                          </Row>
                          {addOnsTotal > 0 && (
                            <div className="d-flex justify-content-end mt-3 small">
                              <span className="text-muted me-2">Add-ons subtotal:</span>
                              <strong className="myop-v2-money">
                                AED {Number(addOnsTotal).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </strong>
                            </div>
                          )}
                          </>
                        );
                      })()}
                    </Accordion.Body>
                  </Accordion.Item>
                </Accordion>
              </Col>

              {/* ── Right-side Package Summary sidebar (image-style) ── */}
              <Col lg={4}>
                <div className="myop-v2-summary-sticky pkg-summary-scroll">
                  <Card
                    className="border-0 rounded-3 myop-v2-summary-card"
                    style={{
                      background: "#ffffff",
                      boxShadow: "0 1px 4px rgba(15, 23, 42, 0.06)",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <Card.Body className="px-4 pt-4 pb-3">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <h5 className="fw-bold m-0" style={{ color: "#111827", letterSpacing: "-0.01em", fontSize: "1.05rem" }}>
                          Package Summary
                        </h5>
                        <button
                          type="button"
                          className="btn btn-link p-0 fw-semibold"
                          style={{
                            color: "#3b82f6",
                            textDecoration: "none",
                            fontSize: "0.85rem",
                          }}
                          onClick={() => navigate(-1)}
                          title="Go back to the package builder"
                        >
                          Edit package
                        </button>
                      </div>
                      {/* Slim, modern scrollbar — replaces the chunky
                          default. Scoped to this scroll container via
                          the `pkg-summary-scroll` class so it doesn't
                          touch the rest of the page. */}
                      <style>{`
                        .pkg-summary-scroll {
                          scrollbar-width: thin;
                          scrollbar-color: #cbd5e1 transparent;
                        }
                        .pkg-summary-scroll::-webkit-scrollbar {
                          width: 6px;
                        }
                        .pkg-summary-scroll::-webkit-scrollbar-track {
                          background: transparent;
                        }
                        .pkg-summary-scroll::-webkit-scrollbar-thumb {
                          background-color: #cbd5e1;
                          border-radius: 999px;
                        }
                        .pkg-summary-scroll::-webkit-scrollbar-thumb:hover {
                          background-color: #94a3b8;
                        }
                      `}</style>
                      <div className="pkg-summary-scroll" style={{ marginLeft: -4, marginRight: -4, paddingRight: 6 }}>
                        {(() => {
                          // ── Data sources already populated by earlier
                          // steps — every value below is read-only. No
                          // editing UI lives in this panel; it only
                          // reflects what was already captured.
                          const hotels = cartData.filter((it) => it.hotel);
                          const activities = cartData.filter((it) => it.activity);
                          const allCabs = cartData.filter((it) => it.cab);
                          // travelType: "1" = Arrival & Departure, "2" =
                          // Arrival, "3" = Departure. A round-trip cab
                          // (type 1) counts as BOTH an arrival and a
                          // departure entry in the summary, with the
                          // price split evenly so the package total
                          // doesn't double-count.
                          const arrivalCabs = allCabs.filter((it) => {
                            const t = String(it.cab?.travelType || "");
                            return t === "1" || t === "2";
                          });
                          const departureCabs = allCabs.filter((it) => {
                            const t = String(it.cab?.travelType || "");
                            return t === "1" || t === "3";
                          });
                          const cabSliceRate = (cabItem) => {
                            const rate = Number(cabItem.cab?.totalRate || 0);
                            const t = String(cabItem.cab?.travelType || "");
                            // Round-trip: split rate across the two rows
                            return t === "1" ? rate / 2 : rate;
                          };

                          let svcMap = {};
                          try {
                            svcMap = JSON.parse(
                              sessionStorage.getItem("mypkg_addon_services") || "{}"
                            );
                          } catch {
                            svcMap = {};
                          }
                          const visaSvc = svcMap?.visa;
                          const mgSvc = svcMap?.meetAndGreet;
                          const visaSelected = !!(visaSvc && visaSvc.enabled) || !!visaRequired;
                          const mgSelected = !!(mgSvc && mgSvc.enabled);

                          // Visa price is sourced from the booking-page
                          // Resolve the catalog source FIRST — visa/M&G
                          // pricing and the "other add-ons" filter both
                          // depend on it, so declaring it before either is
                          // required to dodge the temporal-dead-zone trap.
                          // Source the catalog dynamically so admin-added
                          // entries (yacht, jet ski, …) appear here too, with
                          // the static catalog as a fallback for backwards
                          // compatibility with the 5 legacy hard-coded ones.
                          const dynCatalog = addOnCatalog.length > 0 ? addOnCatalog : ADDON_SERVICES_CATALOG;

                          // Visa / Meet & Greet pricing — prefer the unit
                          // price set on the new dynamic add-on catalog
                          // (admin-managed via /registration/package-addons).
                          // Falls back to the legacy adult/child/infant
                          // adult-rate breakdown when no catalog rate has
                          // been registered yet — keeps existing bookings
                          // that relied on the legacy form working.
                          const catalogPriceFor = (key) => {
                            const entry = dynCatalog.find((s) => s.key === key);
                            if (!entry || !svcMap?.[key]?.enabled) return 0;
                            const unit = Number(entry.unitPrice) || 0;
                            const qty = Number(svcMap[key].quantity) > 0
                              ? Number(svcMap[key].quantity) : 1;
                            return unit * qty;
                          };
                          const visaPriceFromCatalog = catalogPriceFor("visa");
                          const visaPriceLegacy =
                            (parseInt(visaDetails.visaAdult || "0") || 0) * (parseFloat(visaDetails.visaAdultRate || "0") || 0) +
                            (parseInt(visaDetails.visaChild || "0") || 0) * (parseFloat(visaDetails.visaChildRate || "0") || 0) +
                            (parseInt(visaDetails.visaInfant || "0") || 0) * (parseFloat(visaDetails.visaInfantRate || "0") || 0);
                          const visaPrice = visaPriceFromCatalog > 0
                            ? visaPriceFromCatalog
                            : visaPriceLegacy;
                          const mgPrice = catalogPriceFor("meetAndGreet");

                          // Other add-ons: every enabled add-on EXCEPT visa /
                          // meetAndGreet (those have dedicated rows above).
                          const otherAddons = dynCatalog.filter(
                            (svc) => svc.key !== "visa" && svc.key !== "meetAndGreet" && svcMap?.[svc.key]?.enabled
                          );

                          const hotelsPrice = hotels.reduce((s, it) => s + Number(it.hotel?.totalRate || 0), 0);
                          const activitiesPrice = activities.reduce((s, it) => s + Number(it.activity?.totalRate || 0), 0);
                          const arrivalPrice = arrivalCabs.reduce((s, it) => s + cabSliceRate(it), 0);
                          const departurePrice = departureCabs.reduce((s, it) => s + cabSliceRate(it), 0);
                          // Sum the unit price × quantity for every enabled
                          // OTHER add-on (visa keeps its bespoke maths above).
                          const otherAddonsPrice = otherAddons.reduce((s, svc) => {
                            const unit = Number(svc.unitPrice) || 0;
                            const qty = Number(svcMap?.[svc.key]?.quantity) > 0
                              ? Number(svcMap[svc.key].quantity)
                              : 1;
                            return s + unit * qty;
                          }, 0);

                          // ── Row shell — one unified look used by every
                          // entry below: title + No (red) or Yes (green)
                          // + price on the right, optional details list
                          // underneath.
                          const SectionRow = ({ Icon, iconBg, iconColor, title, selected, price, details, lastInGroup, hideYesNo }) => {
                            // hideYesNo: skip the Yes/No fallback on the
                            // right side — used by the Add-on Services
                            // row, which the operator only wants to see
                            // as the list of selected services (no
                            // Yes/No badge). Right column then shows the
                            // price string when supplied, or nothing.
                            const rightContent = hideYesNo
                              ? (price || "")
                              : (selected ? (price || "Yes") : "No");
                            const detailsVisible = hideYesNo
                              ? !!(details && details.length > 0)
                              : (selected && details && details.length > 0);
                            return (
                              <div
                                className={lastInGroup ? "" : "border-bottom"}
                                style={{ padding: "12px 4px" }}
                              >
                                <div className="d-flex align-items-start" style={{ gap: 12 }}>
                                  <span
                                    style={{
                                      width: 30, height: 30, borderRadius: 8,
                                      background: iconBg,
                                      color: iconColor,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      flexShrink: 0,
                                      fontSize: "0.82rem",
                                    }}
                                  >
                                    <Icon />
                                  </span>
                                  <div className="flex-grow-1" style={{ minWidth: 0 }}>
                                    <div className="d-flex justify-content-between align-items-baseline">
                                      <div className="fw-bold" style={{ fontSize: "0.9rem", color: "#111827" }}>
                                        {title}
                                      </div>
                                      {rightContent !== "" && (
                                        <div
                                          className="fw-bold text-end"
                                          style={{
                                            fontSize: "0.88rem",
                                            color: (hideYesNo ? true : selected) ? "#111827" : "#9ca3af",
                                            whiteSpace: "nowrap",
                                            marginLeft: 8,
                                          }}
                                        >
                                          {rightContent}
                                        </div>
                                      )}
                                    </div>
                                    {detailsVisible && (
                                      <div className="mt-1" style={{ fontSize: "0.76rem", color: "#6b7280", lineHeight: 1.5 }}>
                                        {details.map((d, i) => (
                                          <div key={i} style={{ whiteSpace: "normal" }}>{d}</div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          };

                          // Visa details — surface only the fields the
                          // operator actually filled in, so we don't show
                          // empty rows for blank inputs.
                          const visaDetailLines = [];
                          if (visaSelected) {
                            if (visaSvc?.visaType) visaDetailLines.push(`Type: ${visaSvc.visaType}`);
                            if (visaSvc?.visaStatus) visaDetailLines.push(`Status: ${visaSvc.visaStatus}`);
                            if (visaSvc?.visaNumber) visaDetailLines.push(`Visa #: ${visaSvc.visaNumber}`);
                            if (visaSvc?.visaExpiryDate) visaDetailLines.push(`Expiry: ${formatDate(visaSvc.visaExpiryDate)}`);
                            const heads = [
                              (parseInt(visaDetails.visaAdult || "0") || 0) ? `${visaDetails.visaAdult} Adult` : "",
                              (parseInt(visaDetails.visaChild || "0") || 0) ? `${visaDetails.visaChild} Child` : "",
                              (parseInt(visaDetails.visaInfant || "0") || 0) ? `${visaDetails.visaInfant} Infant` : "",
                            ].filter(Boolean);
                            if (heads.length > 0) visaDetailLines.push(heads.join(" • "));
                          }

                          const mgDetailLines = [];
                          if (mgSelected) {
                            if (mgSvc?.airportName) mgDetailLines.push(`Airport: ${mgSvc.airportName}`);
                            if (mgSvc?.flightNumber) mgDetailLines.push(`Flight: ${mgSvc.flightNumber}`);
                            if (mgSvc?.arrivalTime) mgDetailLines.push(`Arrival: ${mgSvc.arrivalTime}`);
                            if (mgSvc?.passengerCount) mgDetailLines.push(`Pax: ${mgSvc.passengerCount}`);
                            if (mgSvc?.vipAssistance) mgDetailLines.push(`VIP: ${mgSvc.vipAssistance}`);
                          }

                          // Arrival / Departure transfer details — pull
                          // flight # and time from the Meet & Greet
                          // addon if the operator captured them there
                          // (the cab record itself doesn't carry a flight
                          // number field, but the M&G addon does and
                          // semantically describes the same arrival).
                          const buildCabDetails = (cabItem, kind) => {
                            const cab = cabItem.cab || {};
                            const lines = [];
                            const date = kind === "arrival" ? cab.pickupDate : cab.dropoffDate;
                            if (date) lines.push(`Date: ${formatDate(date)}`);
                            const vName = cab.vehicleName || cab.cabName;
                            if (vName) lines.push(`Vehicle: ${vName}`);
                            if (kind === "arrival" && mgSvc?.flightNumber) lines.push(`Flight: ${mgSvc.flightNumber}`);
                            if (kind === "arrival" && mgSvc?.arrivalTime) lines.push(`ETA: ${mgSvc.arrivalTime}`);
                            return lines;
                          };
                          const arrivalDetailLines = arrivalCabs.flatMap((it, i) => {
                            const head = arrivalCabs.length > 1 ? [`Transfer ${i + 1}`] : [];
                            return [...head, ...buildCabDetails(it, "arrival")];
                          });
                          const departureDetailLines = departureCabs.flatMap((it, i) => {
                            const head = departureCabs.length > 1 ? [`Transfer ${i + 1}`] : [];
                            return [...head, ...buildCabDetails(it, "departure")];
                          });

                          const hotelDetailLines = hotels.flatMap((it) => {
                            const h = it.hotel || {};
                            const checkIn = h.checkIn || h.checkInDate || "";
                            const checkOut = h.checkOut || h.checkOutDate || "";
                            const nights = calculateNights(checkIn, checkOut);
                            const lines = [];
                            if (h.hotelName) lines.push(h.hotelName);
                            const nightLabel = String(nights).padStart(2, "0");
                            lines.push(`${nightLabel} ${nights === 1 ? "night" : "nights"}`);
                            if (checkIn) lines.push(`Check-in: ${formatDate(checkIn)}`);
                            if (checkOut) lines.push(`Check-out: ${formatDate(checkOut)}`);
                            return lines;
                          });

                          // Tours: one line per activity — name — date.
                          // Headline still summarises the count + total.
                          const tourDetailLines = activities.map((it) => {
                            const a = it.activity || {};
                            const name = a.activityName || a.activityname || "Activity";
                            const date = a.activityDate ? formatDate(a.activityDate) : "";
                            return date ? `${name} — ${date}` : name;
                          });

                          const otherAddonDetailLines = otherAddons.map((svc) => svc.label);

                          const fmtAed = (n) =>
                            `AED ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

                          return (
                            <>
                              {/* Add-on rows are hidden entirely when the
                                  operator picked "No" — only services that
                                  are part of the package belong in the
                                  Package Summary. */}
                              {visaSelected && (
                                <SectionRow
                                  Icon={FaPlus}
                                  iconBg="#eef2ff"
                                  iconColor="#6366f1"
                                  title="Visa"
                                  selected={visaSelected}
                                  price={visaPrice > 0 ? fmtAed(visaPrice) : "Yes"}
                                  details={visaDetailLines}
                                />
                              )}
                              {mgSelected && (
                                <SectionRow
                                  Icon={FaUsers}
                                  iconBg="#fef3c7"
                                  iconColor="#d97706"
                                  title="Meet & Greet"
                                  selected={mgSelected}
                                  price={mgPrice > 0 ? fmtAed(mgPrice) : "Yes"}
                                  details={mgDetailLines}
                                />
                              )}
                              <SectionRow
                                Icon={FaCar}
                                iconBg="#ecfdf5"
                                iconColor="#059669"
                                title="Arrival Transfer"
                                selected={arrivalCabs.length > 0}
                                price={arrivalCabs.length > 0 ? fmtAed(arrivalPrice) : null}
                                details={arrivalDetailLines}
                              />
                              <SectionRow
                                Icon={FaHotel}
                                iconBg="#eef2ff"
                                iconColor="#6366f1"
                                title="Hotel"
                                selected={hotels.length > 0}
                                price={hotels.length > 0 ? fmtAed(hotelsPrice) : null}
                                details={hotelDetailLines}
                              />
                              <SectionRow
                                Icon={FaTicketAlt}
                                iconBg="#fef3c7"
                                iconColor="#d97706"
                                title="Tours & Activities"
                                selected={activities.length > 0}
                                price={activities.length > 0 ? fmtAed(activitiesPrice) : null}
                                details={tourDetailLines}
                              />
                              <SectionRow
                                Icon={FaCar}
                                iconBg="#ecfdf5"
                                iconColor="#059669"
                                title="Departure Transfer"
                                selected={departureCabs.length > 0}
                                price={departureCabs.length > 0 ? fmtAed(departurePrice) : null}
                                details={departureDetailLines}
                              />
                              {otherAddons.length > 0 && (
                                <SectionRow
                                  Icon={FaPlus}
                                  iconBg="#fce7f3"
                                  iconColor="#db2777"
                                  title="Add-on Services"
                                  hideYesNo
                                  price={fmtAed(otherAddonsPrice)}
                                  details={otherAddonDetailLines}
                                  lastInGroup
                                />
                              )}
                            </>
                          );
                        })()}
                      </div>
                      {(() => {
                        // Right-rail "Total Package Price" — sums the
                        // tourism-dirham aggregate on top of the line-
                        // item total. Note the rows above show each
                        // service's selling `totalRate`, while `totalPrice`
                        // is the without-markup sum — the "View Price
                        // Breakup" disclosure below lists both figures.
                        const tdNum = aggregateTourismDirham;
                        // Roll dynamic add-on prices into the grand total so
                        // the headline reflects exactly what the operator
                        // sees in the rows above AND what gets billed.
                        const totalWithTd = totalPrice + tdNum + addOnsTotal;
                        const fmtAed = (n) =>
                          `AED ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

                        // Non-refundable detection — if ANY single
                        // selected service is non-refundable, the whole
                        // package must be labelled non-refundable.
                        const isNonRefundable = (() => {
                          const flag = (rec) =>
                            rec?.refundstatus === "N" ||
                            rec?.nonRefundable === true ||
                            rec?.nonRefundable === "true";
                          return cartData.some(
                            (it) => flag(it.hotel) || flag(it.cab) || flag(it.activity)
                          );
                        })();

                        // Time limit — the earliest cancellation-policy
                        // fromDate across every hotel in the cart,
                        // minus 2 days (mirrors the deadline rule the
                        // save payload uses). Non-refundable items
                        // fall back to "today − 2 days" per spec.
                        const timeLimit = (() => {
                          try {
                            const hotelsArr = cartData.filter((it) => it.hotel);
                            if (hotelsArr.length === 0) return null;
                            if (isNonRefundable) {
                              const d = new Date();
                              d.setDate(d.getDate() - 2);
                              return d;
                            }
                            const dates = [];
                            hotelsArr.forEach((it) => {
                              const policies = it.hotel?.cancellationPolicy || [];
                              policies.forEach((p) => {
                                if (p && p.fromDate) {
                                  const dd = new Date(p.fromDate);
                                  if (!isNaN(dd.getTime())) dates.push(dd);
                                }
                              });
                            });
                            if (dates.length === 0) return null;
                            const earliest = new Date(Math.min(...dates.map((d) => d.getTime())));
                            earliest.setDate(earliest.getDate() - 2);
                            return earliest;
                          } catch {
                            return null;
                          }
                        })();
                        const timeLimitText = timeLimit
                          ? timeLimit.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                          : null;

                        return (
                          <>
                            <div
                              className="d-flex justify-content-between align-items-center pt-3 mt-2"
                              style={{ borderTop: "1px solid #e5e7eb" }}
                            >
                              <div>
                                <div
                                  className="fw-bold"
                                  style={{ color: "#111827", fontSize: "0.95rem" }}
                                >
                                  Total Package Price
                                </div>
                                <div style={{ fontSize: "0.72rem", color: "#9ca3af", marginTop: 2 }}>
                                  (All prices are in AED)
                                </div>
                              </div>
                              <div
                                className="fw-bold"
                                style={{ fontSize: "1.3rem", color: "#111827" }}
                              >
                                AED {totalWithTd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </div>
                            </div>
                            <div className="mt-3">
                              <button
                                type="button"
                                className="btn btn-link p-0 fw-semibold"
                                style={{
                                  color: "#3b82f6",
                                  textDecoration: "none",
                                  fontSize: "0.85rem",
                                }}
                                onClick={() => setShowPriceBreakup((v) => !v)}
                                aria-expanded={showPriceBreakup}
                              >
                                {showPriceBreakup ? "Hide Price Breakup" : "View Price Breakup"}
                              </button>
                              {showPriceBreakup && (
                                <div className="mt-2" style={{ fontSize: "0.8rem", color: "#374151" }}>
                                  {/* Read-only — the same state values the
                                      Order Summary's Rate Split uses. */}
                                  <div className="myop-v2-breakup-row">
                                    <span>Services — selling price (for reference)</span>
                                    <span className="myop-v2-money">{fmtAed(sellingPrice)}</span>
                                  </div>
                                  <div className="myop-v2-breakup-row">
                                    <span>Services — without markup</span>
                                    <span className="myop-v2-money">{fmtAed(totalPrice)}</span>
                                  </div>
                                  <div className="myop-v2-breakup-row">
                                    <span>Tourism dirham</span>
                                    <span className="myop-v2-money">{fmtAed(tdNum)}</span>
                                  </div>
                                  {/* Booking-level Tourism Dirham — moved here from
                                      the Order Summary modal so the final review is
                                      read-only. Same state + handler as before; the
                                      aggregate already sums it with the per-hotel
                                      inputs entered in the Hotels section. */}
                                  <div className="my-2 p-2 rounded" style={{ background: "#f9fafb", border: "1px solid #e5e7eb" }}>
                                    <label
                                      className="form-label fw-semibold mb-1"
                                      style={{ fontSize: "0.875rem" }}
                                      htmlFor="myop-v2-booking-level-td"
                                    >
                                      Extra Tourism Dirham for the whole booking (optional)
                                    </label>
                                    <input
                                      id="myop-v2-booking-level-td"
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      className="form-control"
                                      placeholder="0.00"
                                      value={tourismDirham}
                                      onChange={(e) => setTourismDirham(e.target.value)}
                                    />
                                    <small className="text-muted">
                                      Added on top of the per-hotel Tourism Dirham entered
                                      in the Hotels section; both are included in the total.
                                    </small>
                                  </div>
                                  <div className="myop-v2-breakup-row">
                                    <span>Add-on services</span>
                                    <span className="myop-v2-money">{fmtAed(addOnsTotal)}</span>
                                  </div>
                                  <div className="myop-v2-breakup-row myop-v2-breakup-row--total fw-bold">
                                    <span>Total Package Price</span>
                                    <span className="myop-v2-money">{fmtAed(totalWithTd)}</span>
                                  </div>
                                  <div className="text-end" style={{ fontSize: "0.72rem", color: "#9ca3af" }}>
                                    = without markup + Tourism dirham + add-ons
                                  </div>
                                </div>
                              )}
                            </div>


                            {/* ── Terms & Conditions block ──
                                Tick-to-accept + price/availability time
                                limit + non-refundable badge. The
                                `acceptedTerms` flag is already in scope
                                (used by the existing Order Summary modal
                                gate) — wiring the checkbox here keeps a
                                single source of truth for acceptance. */}
                            <div
                              className="mt-3 pt-3"
                              style={{ borderTop: "1px solid #e5e7eb" }}
                            >
                              <div className="fw-bold mb-2" style={{ color: "#111827", fontSize: "0.9rem" }}>
                                Terms & Conditions
                              </div>
                              <Form.Check
                                type="checkbox"
                                id="pkg-summary-accept-terms"
                                checked={!!acceptedTerms}
                                onChange={(e) => setAcceptedTerms(e.target.checked)}
                                label={
                                  <span style={{ fontSize: "0.8rem", color: "#374151" }}>
                                    I accept the terms and conditions
                                  </span>
                                }
                              />
                              <div className="mt-1" style={{ fontSize: "0.76rem", color: "#6b7280" }}>
                                Ticking this pre-fills the Terms &amp; Conditions acceptance on
                                the policy review step that opens next; the Cancellation Policies
                                are shown and accepted there.
                              </div>
                              {timeLimitText && (
                                <div className="mt-2" style={{ fontSize: "0.78rem", color: "#6b7280" }}>
                                  <span className="fw-semibold">Time limit:</span> Quoted price &amp; availability valid until <span className="fw-semibold">{timeLimitText}</span>
                                </div>
                              )}
                              {isNonRefundable && (
                                <div
                                  className="mt-2 px-2 py-1 rounded"
                                  style={{
                                    background: "#fef2f2",
                                    border: "1px solid #fecaca",
                                    color: "#b91c1c",
                                    fontSize: "0.76rem",
                                  }}
                                >
                                  <span className="fw-bold">Non-Refundable:</span> One or more selected services
                                  are non-refundable, so the entire package is
                                  treated as non-refundable.
                                </div>
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </Card.Body>
                  </Card>
                </div>
              </Col>
            </Row>

            {/* ── Bottom action bar — sticky so Back / Review & Confirm
                stay reachable while the long form is being filled ── */}
            <div className="myop-v2-action-bar mt-4">
                  <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="btn fw-semibold d-flex align-items-center"
                    style={{
                      background: "#ffffff",
                      border: "1px solid #d1d5db",
                      color: "#374151",
                      padding: "9px 22px",
                      borderRadius: 10,
                      fontSize: "0.95rem",
                    }}
                  >
                    <FaArrowLeft className="me-2" /> Back
                  </button>
                  <div className="myop-v2-action-bar__center">
                    <div className="fw-bold" style={{ fontSize: "0.95rem", color: "#111827" }}>
                      Total Package Price: AED {(totalPrice + aggregateTourismDirham + addOnsTotal).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "#9ca3af" }}>
                      Next: review policies → order summary → confirm
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      // UI only: lets the accordion expand the sections that
                      // hold highlighted fields for this attempt. handleSubmit
                      // itself is unchanged.
                      setSubmitAttempt((n) => n + 1);
                      handleSubmit(e);
                    }}
                    className="btn fw-semibold d-flex align-items-center"
                    style={{
                      // Brand red gradient — matches btn-search-modern and
                      // every other primary CTA on the MYOP v2 flow (Next
                      // wizard button, View Rooms, Add to Cart). Was near-
                      // black #111827.
                      background: "linear-gradient(135deg, #EC0B43 0%, #C90939 100%)",
                      border: "none",
                      color: "#ffffff",
                      padding: "11px 26px",
                      borderRadius: 10,
                      fontSize: "0.95rem",
                      // Shadow retinted to the red family for coherence.
                      boxShadow: "0 2px 6px rgba(236, 11, 67,0.25)",
                    }}
                  >
                    Review &amp; Confirm Booking
                    <FaArrowRight className="ms-2" />
                  </button>
            </div>
          </Container>
        </main>
      </div>

      {/* Order Summary Modal - Industry Standard Design */}
      <Modal
        show={showOrderSummaryModal}
        onHide={() => !isSubmitting && setShowOrderSummaryModal(false)}
        size="lg"
        centered
        scrollable
        backdrop="static"
        keyboard={false}
        className="order-summary-modal"
      >
        <Modal.Header
          closeButton={!isSubmitting}
          style={{
            borderBottom: "2px solid #e9ecef",
            padding: "1.25rem 1.5rem",
          }}
        >
          <Modal.Title
            className="d-flex align-items-center"
            style={{ fontSize: "1.5rem", fontWeight: "600" }}
          >
            <div
              className="d-flex align-items-center justify-content-center me-3"
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "12px",
                backgroundColor: "#e7f5ff",
                color: "#0d6efd",
              }}
            >
              <FaCheckCircle size={24} />
            </div>
            <div>
              <div
                style={{
                  fontSize: "1.5rem",
                  fontWeight: "600",
                  color: "#212529",
                }}
              >
                Order Summary
              </div>
              <div
                style={{
                  fontSize: "0.875rem",
                  color: "#6c757d",
                  fontWeight: "400",
                }}
              >
                Please review your booking details
              </div>
            </div>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ padding: "1.5rem" }}>
          <div className="order-summary">
            {/* Guest Information Section */}
            <div className="mb-4">
              <div className="d-flex align-items-center mb-3">
                <FaUsers className="me-2 text-primary" size={18} />
                <h6
                  className="mb-0 fw-bold"
                  style={{ fontSize: "1rem", color: "#212529" }}
                >
                  Guest Information
                </h6>
              </div>
              <div
                className="p-3 rounded"
                style={{
                  backgroundColor: "#f8f9fa",
                  border: "1px solid #e9ecef",
                }}
              >
                <Row className="g-3">
                  <Col md={6}>
                    <div className="mb-2">
                      <small
                        className="text-muted d-block mb-1"
                        style={{ fontSize: "0.75rem", fontWeight: "500" }}
                      >
                        Full Name
                      </small>
                      <div
                        style={{
                          fontSize: "0.9375rem",
                          fontWeight: "500",
                          color: "#212529",
                        }}
                      >
                        {primaryGuest.salutation} {primaryGuest.firstName}{" "}
                        {primaryGuest.lastName}
                      </div>
                    </div>
                    <div className="mb-2">
                      <small
                        className="text-muted d-block mb-1"
                        style={{ fontSize: "0.75rem", fontWeight: "500" }}
                      >
                        Email Address
                      </small>
                      <div style={{ fontSize: "0.9375rem", color: "#495057" }}>
                        {primaryGuest.emailId}
                      </div>
                    </div>
                  </Col>
                  <Col md={6}>
                    <div className="mb-2">
                      <small
                        className="text-muted d-block mb-1"
                        style={{ fontSize: "0.75rem", fontWeight: "500" }}
                      >
                        Contact Number
                      </small>
                      <div style={{ fontSize: "0.9375rem", color: "#495057" }}>
                        {primaryGuest.contactNumber}
                      </div>
                    </div>
                  </Col>
                  {primaryGuest.passportNumber && (
                    <Col md={12}>
                      <div>
                        <small
                          className="text-muted d-block mb-1"
                          style={{ fontSize: "0.75rem", fontWeight: "500" }}
                        >
                          Passport Number
                        </small>
                        <div
                          style={{ fontSize: "0.9375rem", color: "#495057" }}
                        >
                          {primaryGuest.passportNumber}
                        </div>
                      </div>
                    </Col>
                  )}
                </Row>
              </div>
            </div>

            {/* Booking Items Section */}
            <div className="mb-4">
              <h6
                className="mb-3 fw-bold"
                style={{ fontSize: "1rem", color: "#212529" }}
              >
                Booking Details
              </h6>

              {/* Hotel Details */}
              {hotels.length > 0 && (
                <div
                  className="mb-3 p-3 rounded"
                  style={{
                    backgroundColor: "#fff",
                    border: "1px solid #e9ecef",
                    borderLeft: "4px solid #0dcaf0",
                  }}
                >
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <div className="d-flex align-items-center">
                      <FaHotel className="me-2 text-info" size={18} />
                      <strong style={{ fontSize: "0.9375rem" }}>
                        Accommodation
                      </strong>
                    </div>
                    <Badge bg="info">
                      {hotels.length} {hotels.length === 1 ? "Hotel" : "Hotels"}
                    </Badge>
                  </div>
                  {hotels.map((item, idx) => {
                    const hotel = item.hotel || {};
                    const checkIn = hotel.checkIn || hotel.checkInDate || "";
                    const checkOut = hotel.checkOut || hotel.checkOutDate || "";
                    const hotelSellingPrice = parseFloat(hotel.totalRate || 0);
                    const hotelTotalPrice = parseFloat(
                      hotel.totalRateWithoutmrk || hotel.totalRate || 0,
                    );

                    return (
                      <div
                        key={idx}
                        className={idx > 0 ? "mt-3 pt-3 border-top" : ""}
                      >
                        <div className="mb-2">
                          <strong
                            style={{ fontSize: "0.9375rem", color: "#212529" }}
                          >
                            {hotel.hotelName || "Hotel"}
                          </strong>
                        </div>
                        <div
                          className="d-flex flex-wrap gap-3 mb-2"
                          style={{ fontSize: "0.8125rem", color: "#6c757d" }}
                        >
                          <span>
                            <FaCalendarAlt className="me-1" />
                            Check-in: {formatDate(checkIn)}
                          </span>
                          <span>
                            <FaCalendarAlt className="me-1" />
                            Check-out: {formatDate(checkOut)}
                          </span>
                        </div>
                        <div className="d-flex justify-content-between align-items-center">
                          <span
                            style={{ fontSize: "0.8125rem", color: "#6c757d" }}
                          >
                            Selling Price
                          </span>
                          <strong
                            style={{ fontSize: "0.9375rem", color: "#198754" }}
                          >
                            AED {hotelSellingPrice.toFixed(2)}
                          </strong>
                        </div>
                        <div className="d-flex justify-content-between align-items-center">
                          <span
                            style={{ fontSize: "0.8125rem", color: "#6c757d" }}
                          >
                            Total Price
                          </span>
                          <strong
                            style={{ fontSize: "0.9375rem", color: "#0d6efd" }}
                          >
                            AED {hotelTotalPrice.toFixed(2)}
                          </strong>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Activity Details */}
              {activities.length > 0 && (
                <div
                  className="mb-3 p-3 rounded"
                  style={{
                    backgroundColor: "#fff",
                    border: "1px solid #e9ecef",
                    borderLeft: "4px solid #198754",
                  }}
                >
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <div className="d-flex align-items-center">
                      <FaTicketAlt className="me-2 text-success" size={18} />
                      <strong style={{ fontSize: "0.9375rem" }}>
                        Tours & Activities
                      </strong>
                    </div>
                    <Badge bg="success">
                      {activities.length}{" "}
                      {activities.length === 1 ? "Activity" : "Activities"}
                    </Badge>
                  </div>
                  {activities.map((item, idx) => {
                    const activity = item.activity || {};
                    const activitySellingPrice = parseFloat(
                      activity.totalRate || 0,
                    );
                    const activityTotalPrice = parseFloat(
                      activity.totalRateWithoutmrk || activity.totalRate || 0,
                    );

                    return (
                      <div
                        key={idx}
                        className={idx > 0 ? "mt-3 pt-3 border-top" : ""}
                      >
                        <div className="mb-2">
                          <strong
                            style={{ fontSize: "0.9375rem", color: "#212529" }}
                          >
                            {activity.activityName || "Activity"}
                          </strong>
                        </div>
                        <div
                          className="d-flex flex-wrap gap-3 mb-2"
                          style={{ fontSize: "0.8125rem", color: "#6c757d" }}
                        >
                          <span>
                            <FaCalendarAlt className="me-1" />
                            Date: {formatDate(activity.activityDate || "")}
                          </span>
                          <span>
                            <FaUsers className="me-1" />
                            Adults: {activity.adult || 0} | Children:{" "}
                            {activity.child || 0}
                          </span>
                        </div>
                        <div className="d-flex justify-content-between align-items-center">
                          <span
                            style={{ fontSize: "0.8125rem", color: "#6c757d" }}
                          >
                            Selling Price
                          </span>
                          <strong
                            style={{ fontSize: "0.9375rem", color: "#198754" }}
                          >
                            AED {activitySellingPrice.toFixed(2)}
                          </strong>
                        </div>
                        <div className="d-flex justify-content-between align-items-center">
                          <span
                            style={{ fontSize: "0.8125rem", color: "#6c757d" }}
                          >
                            Total Price
                          </span>
                          <strong
                            style={{ fontSize: "0.9375rem", color: "#0d6efd" }}
                          >
                            AED {activityTotalPrice.toFixed(2)}
                          </strong>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Transfer Details */}
              {transfers.length > 0 && (
                <div
                  className="mb-3 p-3 rounded"
                  style={{
                    backgroundColor: "#fff",
                    border: "1px solid #e9ecef",
                    borderLeft: "4px solid #ffc107",
                  }}
                >
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <div className="d-flex align-items-center">
                      <FaCar className="me-2 text-warning" size={18} />
                      <strong style={{ fontSize: "0.9375rem" }}>
                        Transfers
                      </strong>
                    </div>
                    <Badge bg="warning" text="dark">
                      {transfers.length}{" "}
                      {transfers.length === 1 ? "Transfer" : "Transfers"}
                    </Badge>
                  </div>
                  {transfers.map((item, idx) => {
                    const cab = item.cab || {};
                    const cabSellingPrice = parseFloat(cab.totalRate || 0);
                    const cabTotalPrice = parseFloat(
                      cab.totalRateWithoutmrk || cab.totalRate || 0,
                    );

                    return (
                      <div
                        key={idx}
                        className={idx > 0 ? "mt-3 pt-3 border-top" : ""}
                      >
                        <div className="mb-2">
                          <strong
                            style={{ fontSize: "0.9375rem", color: "#212529" }}
                          >
                            {cab.cabName || "Transfer"}
                          </strong>
                        </div>
                        <div
                          className="d-flex flex-wrap gap-3 mb-2"
                          style={{ fontSize: "0.8125rem", color: "#6c757d" }}
                        >
                          <span>
                            <FaCalendarAlt className="me-1" />
                            Pickup: {formatDate(cab.pickupDate || "")}
                          </span>
                          <span>
                            <FaCalendarAlt className="me-1" />
                            Dropoff: {formatDate(cab.dropoffDate || "")}
                          </span>
                        </div>
                        <div className="d-flex justify-content-between align-items-center">
                          <span
                            style={{ fontSize: "0.8125rem", color: "#6c757d" }}
                          >
                            Selling Price
                          </span>
                          <strong
                            style={{ fontSize: "0.9375rem", color: "#198754" }}
                          >
                            AED {cabSellingPrice.toFixed(2)}
                          </strong>
                        </div>
                        <div className="d-flex justify-content-between align-items-center">
                          <span
                            style={{ fontSize: "0.8125rem", color: "#6c757d" }}
                          >
                            Total Price
                          </span>
                          <strong
                            style={{ fontSize: "0.9375rem", color: "#0d6efd" }}
                          >
                            AED {cabTotalPrice.toFixed(2)}
                          </strong>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Price Summary — mirrors HotelBookingPage.jsx: a Selling
                Price card (admin-only style), a Total Price card, and a
                Rate Split panel showing how Selling + TD = Total. */}
            {(() => {
              // Order Summary Price panel — also reads the aggregate so
              // Selling + TD and Total + TD reflect every TD source
              // typed on the page, not just the booking-level field.
              const tdAmount = aggregateTourismDirham;
              const sellingWithTd = sellingPrice + tdAmount + addOnsTotal;
              const totalWithTd = totalPrice + tdAmount + addOnsTotal;
              const formatAed = (n) =>
                `AED ${Number(n || 0).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`;
              return (
                <>
                  {/* ── Accepted-policies indicator ────────────────────
                      Order Summary no longer carries the T&C / Cancellation
                      content or the acceptance checkboxes — those live on
                      the dedicated pre-summary policy modal (see
                      `showPolicyModal`). The Order Summary just shows a
                      confirmation badge so the operator knows what's
                      already been ticked. */}
                  <Card className="mt-2 mb-3 shadow-sm rounded-3" style={{ borderLeft: "4px solid #16a34a" }}>
                    <Card.Body className="d-flex align-items-start gap-3">
                      <FaCheckCircle size={22} className="text-success mt-1" />
                      <div className="small">
                        <div className="fw-semibold text-success mb-1">
                          Terms &amp; Conditions and Cancellation Policies accepted
                        </div>
                        <div className="text-muted">
                          The customer has reviewed and accepted both policy
                          sections. This acceptance will be saved with the
                          booking for the audit trail.
                        </div>
                      </div>
                    </Card.Body>
                  </Card>

                  <h6
                    className="mb-2 fw-bold"
                    style={{ fontSize: "1rem", color: "#212529" }}
                  >
                    Price Summary
                  </h6>
                  {/* Rate split first so the operator can follow how the
                      two headline figures below are built up. The booking-
                      level Tourism Dirham is entered on the form (Package
                      Summary card), so this review is read-only. */}
                  <div className="p-3 bg-white border rounded">
                    <h6 className="fw-bold mb-2">Rate Split</h6>
                    <div className="d-flex justify-content-between">
                      <span>Selling Price</span>
                      <span>{formatAed(sellingPrice)}</span>
                    </div>
                    <div className="d-flex justify-content-between">
                      <span>Total Price (without markup)</span>
                      <span>{formatAed(totalPrice)}</span>
                    </div>
                    <div className="d-flex justify-content-between">
                      <span>Tourism Dirhams</span>
                      <span>{formatAed(tdAmount)}</span>
                    </div>
                    <div className="d-flex justify-content-between">
                      <span>Add-on services</span>
                      <span>{formatAed(addOnsTotal)}</span>
                    </div>
                    <hr className="my-2" />
                    <div className="d-flex justify-content-between fw-bold text-success">
                      <span>Selling Price + Tourism Dirham + add-ons</span>
                      <span>{formatAed(sellingWithTd)}</span>
                    </div>
                  </div>

                  <div
                    className="p-3 rounded text-white text-center mt-2"
                    style={{
                      background:
                        "linear-gradient(135deg, #198754 0%, #0d6efd 100%)",
                    }}
                  >
                    <h6 className="mb-0 fw-bold">Total Package Price</h6>
                    <h4 className="mb-0">{formatAed(totalWithTd)}</h4>
                    <div className="small" style={{ opacity: 0.9 }}>
                      without markup + Tourism Dirham + add-ons
                    </div>
                  </div>

                  {/* v2 Add-Ons summary — each enabled service expanded
                      with the field-level details the operator captured. */}
                  {(() => {
                    let svcMap = {};
                    try {
                      svcMap = JSON.parse(
                        sessionStorage.getItem("mypkg_addon_services") || "{}"
                      );
                    } catch {
                      svcMap = {};
                    }
                    const enabled = ADDON_SERVICES_CATALOG.filter(
                      (svc) => svcMap[svc.key]?.enabled
                    );
                    if (enabled.length === 0) return null;
                    return (
                      <div className="mt-3 p-3 bg-white border rounded">
                        <h6 className="fw-bold mb-2">Add-on Services</h6>
                        <div className="d-flex flex-column gap-2">
                          {enabled.map((svc) => {
                            const data = svcMap[svc.key] || {};
                            const filled = (svc.fields || []).filter((f) => {
                              const v = data[f.name];
                              return v !== undefined && v !== "" && v !== null;
                            });
                            return (
                              <div
                                key={svc.key}
                                className="p-2 rounded border bg-light"
                                style={{ fontSize: "0.8125rem" }}
                              >
                                <div className="fw-semibold text-success mb-1">
                                  {svc.label}
                                </div>
                                {filled.length === 0 ? (
                                  <span className="text-muted fst-italic">
                                    Enabled (no extra details captured)
                                  </span>
                                ) : (
                                  <div className="d-flex flex-column gap-1">
                                    {filled.map((f) => (
                                      <div
                                        key={f.name}
                                        className="d-flex justify-content-between"
                                      >
                                        <span className="text-muted">
                                          {f.label}
                                        </span>
                                        <span>{String(data[f.name])}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Legacy IIFE — kept to preserve outer brace balance,
                      but neutralised. The full T&C / cancellation
                      accordions and the two checkboxes now live in the
                      pre-summary policy modal. */}
                  {(() => {
                    const hotelsInCart = (cartData || []).filter((it) => it && it.hotel);
                    const cabsInCart = (cartData || []).filter((it) => it && it.cab);
                    const activitiesInCart = (cartData || []).filter(
                      (it) => it && it.activity
                    );

                    const renderList = (items) =>
                      items.length > 0 ? (
                        <ul className="mb-0 ps-3 small">
                          {items.map((t, i) => (
                            <li key={i} style={{ whiteSpace: "pre-wrap" }}>
                              {t}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-muted small fst-italic">
                          No policies available.
                        </div>
                      );

                    const hotelTerms = (hotel) =>
                      servicePolicies.hotel[String(hotel?.hotelId)]?.terms || [];
                    const hotelCancel = (hotel) =>
                      servicePolicies.hotel[String(hotel?.hotelId)]?.cancellations ||
                      [];
                    const cabTerms = (cab) =>
                      servicePolicies.cab[String(cab?.cabId)]?.terms || [];
                    const cabCancel = (cab) =>
                      servicePolicies.cab[String(cab?.cabId)]?.cancellations || [];
                    const activityTerms = (activity) =>
                      servicePolicies.activity[String(activity?.activityId)]?.terms ||
                      [];

                    // ── Build the two sections only if any service has
                    // non-empty content for that section; otherwise the
                    // section header doesn't render (clean UI). The
                    // global checkboxes always render though, so the
                    // operator can't bypass acceptance gating even if
                    // a hotel/cab/activity has no policies on file.
                    const anyTermsContent =
                      hotelsInCart.some((it) => hotelTerms(it.hotel).length > 0) ||
                      cabsInCart.some((it) => cabTerms(it.cab).length > 0) ||
                      activitiesInCart.some(
                        (it) => activityTerms(it.activity).length > 0
                      );
                    const anyCancellationContent =
                      hotelsInCart.some(
                        (it) => hotelCancel(it.hotel).length > 0
                      ) ||
                      cabsInCart.some((it) => cabCancel(it.cab).length > 0);

                    // All policy display + acceptance UI has moved to the
                    // pre-summary policy modal (see further down — modal is
                    // rendered with `show={showPolicyModal}`). The variables
                    // and helpers above stay in scope only for the modal's
                    // own JSX, which reuses the same lookup functions.
                    void anyTermsContent; void anyCancellationContent;
                    void hotelTerms; void hotelCancel;
                    void cabTerms; void cabCancel; void activityTerms;
                    void renderList; void hotelsInCart; void cabsInCart;
                    void activitiesInCart;
                    return null;
                  })()}

                  <div className="mt-4 text-center">
                    <p className="text-muted small mb-0">
                      Please review the booking details carefully before
                      confirming. Cancelling returns you to the form; the
                      policies will need to be accepted again.
                    </p>
                  </div>
                </>
              );
            })()}
          </div>
        </Modal.Body>
        <Modal.Footer
          className="myop-v2-modal-footer"
          style={{
            borderTop: "2px solid #e9ecef",
            padding: "1.25rem 1.5rem",
            justifyContent: "space-between",
          }}
        >
          <Button
            variant="outline-secondary"
            onClick={() => setShowOrderSummaryModal(false)}
            disabled={isSubmitting}
            style={{
              minWidth: "120px",
              fontWeight: "500",
            }}
          >
            Cancel
          </Button>
          {/* Read-only total next to the irreversible action so the
              amount and the button are never apart on screen. */}
          <div className="myop-v2-modal-footer__total">
            <div style={{ fontSize: "0.75rem", color: "#6c757d", fontWeight: "500" }}>
              Total Package Price
            </div>
            <div style={{ fontSize: "1rem", fontWeight: "600", color: "#212529" }}>
              AED {Number(totalPrice + aggregateTourismDirham + addOnsTotal).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>
          <Button
            variant="primary"
            onClick={() => {
              // Belt-and-braces: even if the disabled gate is bypassed
              // (browser dev tools, stale state, etc.), refuse to submit
              // until both global acceptance checkboxes are ticked.
              if (!acceptedTerms || !acceptedCancellations) {
                toast.error(
                  "Please accept the Terms & Conditions and Cancellation Policies before confirming."
                );
                return;
              }
              confirmBooking();
            }}
            disabled={isSubmitting || !acceptedTerms || !acceptedCancellations}
            title={
              !acceptedTerms || !acceptedCancellations
                ? "Tick both acceptance checkboxes to enable booking confirmation."
                : undefined
            }
            style={{
              minWidth: "160px",
              fontWeight: "600",
              fontSize: "1rem",
            }}
          >
            {isSubmitting ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Processing...
              </>
            ) : (
              <>
                <FaCheckCircle className="me-2" />
                Confirm Booking
              </>
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ════════════════════════════════════════════════════════════
          PRE-ORDER-SUMMARY POLICY MODAL
          ────────────────────────────────────────────────────────────
          Shown the moment the operator clicks the booking page's
          "Confirm Booking" button — the Order Summary modal only opens
          afterwards, via `proceedFromPolicyModal()`. T&C + Cancellation
          Policies render service-wise (one accordion per hotel / cab /
          activity in the cart). Two global checkboxes gate the
          "Continue to Order Summary" button; cancelling returns the
          operator to the booking page with no booking saved.
          Acceptance flags propagate through into the booking-save
          payload (acceptedTermsAndConditions / acceptedCancellationPolicies)
          and ultimately land on the mypkg_v2_booking.accepted_* audit
          columns.
      ════════════════════════════════════════════════════════════ */}
      <Modal
        show={showPolicyModal}
        onHide={() => !isSubmitting && setShowPolicyModal(false)}
        size="lg"
        centered
        scrollable
        backdrop="static"
        keyboard={false}
      >
        <Modal.Header
          closeButton
          style={{
            background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
            color: "white",
            border: "none",
          }}
        >
          <Modal.Title className="fw-bold d-flex align-items-center gap-2">
            <FaCheckCircle />
            Review &amp; Accept Policies
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ background: "#f8f9fa" }}>
          <div className="text-muted small mb-3">
            Please review the Terms &amp; Conditions and Cancellation
            Policies for every service in this booking. You must accept
            both before continuing to the Order Summary.
          </div>
          {(() => {
            const hotelsInCart = (cartData || []).filter((it) => it && it.hotel);
            const cabsInCart = (cartData || []).filter((it) => it && it.cab);
            const activitiesInCart = (cartData || []).filter(
              (it) => it && it.activity
            );
            const renderList = (items) =>
              items.length > 0 ? (
                <ul className="mb-0 ps-3 small">
                  {items.map((t, i) => (
                    <li key={i} style={{ whiteSpace: "pre-wrap" }}>
                      {t}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-muted small fst-italic">
                  No policies available.
                </div>
              );
            const hotelT = (h) =>
              servicePolicies.hotel[String(h?.hotelId)]?.terms || [];
            const hotelC = (h) =>
              servicePolicies.hotel[String(h?.hotelId)]?.cancellations || [];
            const cabT = (c) =>
              servicePolicies.cab[String(c?.cabId)]?.terms || [];
            const cabC = (c) =>
              servicePolicies.cab[String(c?.cabId)]?.cancellations || [];
            const actT = (a) =>
              servicePolicies.activity[String(a?.activityId)]?.terms || [];
            const actC = (a) =>
              servicePolicies.activity[String(a?.activityId)]?.cancellations || [];

            const anyT =
              hotelsInCart.some((it) => hotelT(it.hotel).length > 0) ||
              cabsInCart.some((it) => cabT(it.cab).length > 0) ||
              activitiesInCart.some((it) => actT(it.activity).length > 0);
            const anyC =
              hotelsInCart.some((it) => hotelC(it.hotel).length > 0) ||
              cabsInCart.some((it) => cabC(it.cab).length > 0) ||
              activitiesInCart.some((it) => actC(it.activity).length > 0);

            return (
              <>
                {policiesLoading && (
                  <div className="text-muted small d-flex align-items-center gap-2 mb-3">
                    <Spinner animation="border" size="sm" />
                    Loading policies…
                  </div>
                )}

                {/* Terms & Conditions */}
                <Card className="mb-3 shadow-sm rounded-3">
                  <Card.Body>
                    <h6 className="fw-bold mb-3">Terms &amp; Conditions</h6>
                    {!anyT && !policiesLoading && (
                      <div className="text-muted small fst-italic">
                        No Terms &amp; Conditions configured for the
                        services in this booking. Please confirm with
                        the provider before proceeding.
                      </div>
                    )}
                    {anyT && (
                      <Accordion alwaysOpen flush>
                        {hotelsInCart.map((it, idx) => {
                          const list = hotelT(it.hotel);
                          if (list.length === 0) return null;
                          return (
                            <Accordion.Item
                              key={`pm-h-t-${idx}`}
                              eventKey={`pm-h-t-${idx}`}
                            >
                              <Accordion.Header>
                                <FaHotel className="me-2 text-primary" />
                                Hotel — {it.hotel?.hotelName || "Hotel"}
                              </Accordion.Header>
                              <Accordion.Body>{renderList(list)}</Accordion.Body>
                            </Accordion.Item>
                          );
                        })}
                        {cabsInCart.map((it, idx) => {
                          const list = cabT(it.cab);
                          if (list.length === 0) return null;
                          return (
                            <Accordion.Item
                              key={`pm-c-t-${idx}`}
                              eventKey={`pm-c-t-${idx}`}
                            >
                              <Accordion.Header>
                                <FaCar className="me-2 text-primary" />
                                Cab — {it.cab?.cabName || "Cab"}
                              </Accordion.Header>
                              <Accordion.Body>{renderList(list)}</Accordion.Body>
                            </Accordion.Item>
                          );
                        })}
                        {activitiesInCart.map((it, idx) => {
                          const list = actT(it.activity);
                          if (list.length === 0) return null;
                          return (
                            <Accordion.Item
                              key={`pm-a-t-${idx}`}
                              eventKey={`pm-a-t-${idx}`}
                            >
                              <Accordion.Header>
                                <FaTicketAlt className="me-2 text-primary" />
                                Activity —{" "}
                                {it.activity?.activityName || "Activity"}
                              </Accordion.Header>
                              <Accordion.Body>{renderList(list)}</Accordion.Body>
                            </Accordion.Item>
                          );
                        })}
                      </Accordion>
                    )}
                  </Card.Body>
                </Card>

                {/* Cancellation Policies */}
                <Card className="mb-3 shadow-sm rounded-3">
                  <Card.Body>
                    <h6 className="fw-bold mb-3">Cancellation Policies</h6>
                    {!anyC && !policiesLoading && (
                      <div className="text-muted small fst-italic">
                        No Cancellation Policies configured for the
                        services in this booking. Please confirm with
                        the provider before proceeding.
                      </div>
                    )}
                    {anyC && (
                      <Accordion alwaysOpen flush>
                        {hotelsInCart.map((it, idx) => {
                          const list = hotelC(it.hotel);
                          if (list.length === 0) return null;
                          return (
                            <Accordion.Item
                              key={`pm-h-c-${idx}`}
                              eventKey={`pm-h-c-${idx}`}
                            >
                              <Accordion.Header>
                                <FaHotel className="me-2 text-primary" />
                                Hotel — {it.hotel?.hotelName || "Hotel"}
                              </Accordion.Header>
                              <Accordion.Body>{renderList(list)}</Accordion.Body>
                            </Accordion.Item>
                          );
                        })}
                        {cabsInCart.map((it, idx) => {
                          const list = cabC(it.cab);
                          if (list.length === 0) return null;
                          return (
                            <Accordion.Item
                              key={`pm-c-c-${idx}`}
                              eventKey={`pm-c-c-${idx}`}
                            >
                              <Accordion.Header>
                                <FaCar className="me-2 text-primary" />
                                Cab — {it.cab?.cabName || "Cab"}
                              </Accordion.Header>
                              <Accordion.Body>{renderList(list)}</Accordion.Body>
                            </Accordion.Item>
                          );
                        })}
                        {activitiesInCart.map((it, idx) => {
                          const list = actC(it.activity);
                          if (list.length === 0) return null;
                          return (
                            <Accordion.Item
                              key={`pm-a-c-${idx}`}
                              eventKey={`pm-a-c-${idx}`}
                            >
                              <Accordion.Header>
                                <FaTicketAlt className="me-2 text-primary" />
                                Activity —{" "}
                                {it.activity?.activityName || "Activity"}
                              </Accordion.Header>
                              <Accordion.Body>{renderList(list)}</Accordion.Body>
                            </Accordion.Item>
                          );
                        })}
                      </Accordion>
                    )}
                  </Card.Body>
                </Card>

                {/* Acceptance gates live in the footer (below) so they stay
                    visible however long the policy lists get. */}
              </>
            );
          })()}
        </Modal.Body>
        <Modal.Footer className="myop-v2-modal-footer" style={{ justifyContent: "space-between" }}>
          {/* Acceptance gates — always visible next to the button they
              unlock, instead of at the bottom of the scrollable list. */}
          <div className="myop-v2-modal-footer__block">
            <Card className="mb-1 shadow-sm rounded-3" style={{ borderLeft: "4px solid #6366f1" }}>
              <Card.Body>
                <Form.Check
                  type="checkbox"
                  id="myop-policy-modal-terms"
                  className="mb-2"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  label={
                    <span>
                      I have read and accept the{" "}
                      <span className="fw-semibold">Terms &amp; Conditions</span>{" "}
                      for all services in this booking.
                    </span>
                  }
                />
                <Form.Check
                  type="checkbox"
                  id="myop-policy-modal-cancellation"
                  checked={acceptedCancellations}
                  onChange={(e) => setAcceptedCancellations(e.target.checked)}
                  label={
                    <span>
                      I have read and accept the{" "}
                      <span className="fw-semibold">Cancellation Policies</span>{" "}
                      for all services in this booking.
                    </span>
                  }
                />
                {(!acceptedTerms || !acceptedCancellations) && (
                  <div className="text-muted small mt-2">
                    <FaInfoCircle className="me-1" />
                    Tick both boxes to enable <span className="fw-semibold">Continue to Order Summary</span>.
                  </div>
                )}
              </Card.Body>
            </Card>
          </div>
          <Button
            variant="outline-secondary"
            onClick={() => setShowPolicyModal(false)}
            style={{ minWidth: 120, fontWeight: 500 }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={proceedFromPolicyModal}
            disabled={!acceptedTerms || !acceptedCancellations}
            title={
              !acceptedTerms || !acceptedCancellations
                ? "Tick both acceptance checkboxes to continue."
                : undefined
            }
            style={{ minWidth: 220, fontWeight: 600 }}
          >
            Continue to Order Summary →
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Detailed Itinerary Modal */}
      <Modal
        show={showItineraryModal}
        onHide={handleCloseItineraryModal}
        size="lg"
        centered
        scrollable
        className="itinerary-modal"
      >
        <Modal.Header
          closeButton
          className="itinerary-modal-header"
          style={{
            background: "linear-gradient(135deg, #0d6efd 0%, #0056b3 100%)",
            color: "white",
            border: "none",
            padding: "1.25rem 1.5rem",
          }}
        >
          <Modal.Title className="fw-bold d-flex align-items-center gap-2">
            <FaRoute />
            Detailed Itinerary
            {currentDay && (
              <Badge bg="light" text="dark" className="ms-2">
                {currentDay === "day1" ? "Day 1" : "Day 2"}
              </Badge>
            )}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ padding: "1.5rem" }}>
          {/* Search Bar */}
          <Form.Group className="mb-4">
            <div className="position-relative">
              <Form.Control
                type="text"
                placeholder="Search by terms (Type atleast 4 letters)"
                value={itinerarySearchTerm}
                onChange={(e) => setItinerarySearchTerm(e.target.value)}
                className="itinerary-search-input"
                style={{
                  padding: "0.875rem 1rem 0.875rem 2.75rem",
                  borderRadius: "8px",
                  border: "2px solid #dee2e6",
                  fontSize: "0.9rem",
                }}
              />
              <FaClock
                className="position-absolute"
                style={{
                  left: "1rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#6c757d",
                  fontSize: "0.9rem",
                }}
              />
            </div>
            {itinerarySearchTerm.trim().length > 0 &&
              itinerarySearchTerm.trim().length < 4 && (
                <small className="text-muted mt-2 d-block">
                  <FaClock className="me-1" />
                  Type at least 4 letters to search
                </small>
              )}
          </Form.Group>

          {/* Itinerary List */}
          {loadingItinerary ? (
            <div className="text-center py-5">
              <Spinner animation="border" size="sm" variant="primary" />
              <p className="mt-2 text-muted small">
                Loading itinerary details...
              </p>
            </div>
          ) : filteredItineraryList.length > 0 ? (
            <div className="itinerary-modal-list">
              {filteredItineraryList.map((itinerary) => {
                const isSelected =
                  currentDay &&
                  selectedItineraries[currentDay]?.includes(
                    itinerary.itineraryId,
                  );
                const description = itinerary.itineraryDesc || "";
                const shortDesc =
                  description.length > 100
                    ? description.substring(0, 100) + "..."
                    : description;
                const showFullDesc =
                  expandedDescriptions[itinerary.itineraryId] || false;

                return (
                  <div
                    key={itinerary.itineraryId}
                    className={`itinerary-modal-item mb-3 ${isSelected ? "itinerary-modal-item-selected" : ""}`}
                    style={{
                      backgroundColor: isSelected ? "#e7f3ff" : "white",
                      border: `2px solid ${isSelected ? "#0d6efd" : "#dee2e6"}`,
                      borderRadius: "12px",
                      padding: "1.25rem",
                      transition: "all 0.3s ease",
                      cursor: "pointer",
                    }}
                    onClick={() => handleItineraryToggle(itinerary.itineraryId)}
                  >
                    <div className="d-flex align-items-start">
                      <Form.Check
                        type="checkbox"
                        id={`modal-itinerary-${itinerary.itineraryId}`}
                        checked={isSelected || false}
                        onChange={() =>
                          handleItineraryToggle(itinerary.itineraryId)
                        }
                        className="me-3 mt-1"
                        style={{ flexShrink: 0 }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-grow-1">
                        <div className="d-flex align-items-center gap-2 mb-2">
                          <h6
                            className="mb-0 fw-bold"
                            style={{
                              color: isSelected ? "#0d6efd" : "#212529",
                            }}
                          >
                            {itinerary.itineraryHeading || "Untitled"}
                          </h6>
                          {isSelected && (
                            <Badge bg="success" className="ms-auto">
                              <FaCheckCircle className="me-1" />
                              Selected
                            </Badge>
                          )}
                        </div>
                        <p
                          className="mb-0 text-muted"
                          style={{ fontSize: "0.875rem", lineHeight: "1.6" }}
                        >
                          {showFullDesc ? description : shortDesc}
                          {description.length > 100 && (
                            <button
                              className="btn btn-link p-0 ms-2 text-primary"
                              style={{
                                fontSize: "0.875rem",
                                textDecoration: "none",
                                fontWeight: "500",
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedDescriptions((prev) => ({
                                  ...prev,
                                  [itinerary.itineraryId]: !showFullDesc,
                                }));
                              }}
                            >
                              {showFullDesc ? "Show Less" : "Read More"}
                            </button>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : itinerarySearchTerm.trim().length > 0 &&
            itinerarySearchTerm.trim().length < 4 ? (
            <div className="text-center py-5">
              <FaClock size={48} className="text-muted mb-3" />
              <p className="text-muted fw-semibold">
                Please type at least 4 letters to search
              </p>
            </div>
          ) : (
            <div className="text-center py-5">
              <FaRoute size={48} className="text-muted mb-3" />
              <p className="text-muted fw-semibold">
                No itinerary details found.
              </p>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer
          style={{ borderTop: "2px solid #dee2e6", padding: "1rem 1.5rem" }}
        >
          <div className="d-flex justify-content-between align-items-center w-100">
            <small className="text-muted">
              {currentDay && selectedItineraries[currentDay]?.length > 0 && (
                <>
                  <FaCheckCircle className="text-success me-1" />
                  {selectedItineraries[currentDay].length} item(s) selected
                </>
              )}
            </small>
            <Button
              variant="primary"
              onClick={handleCloseItineraryModal}
              style={{ minWidth: "120px" }}
            >
              Done
            </Button>
          </div>
        </Modal.Footer>
      </Modal>

    </div>
  );
};

export default MakePkgBookingPageV2;
