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
} from "react-icons/fa";
import Sidebar from "../../../components/Sidebar";
import TopBar from "../../../components/TopBar";
import AgentBalanceDisplay from "../../../components/AgentBalanceDisplay";
import AddOnServicesPanel, {
  collectEnabledAddOnServices,
  readAddOnServices,
} from "../../../components/AddOnServicesPanel";
import axiosInstance from "../../../components/AxiosInstance";
import toast from "react-hot-toast";
import "../../../styles/HotelBookingPage.css";
import "../../../styles/MakePkgBookingPage.css";

const MakePkgBookingPage = () => {
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
  const [tourismDirham, setTourismDirham] = useState("");

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

  // Order summary modal state
  const [showOrderSummaryModal, setShowOrderSummaryModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    if (!primaryGuest.lpo || primaryGuest.lpo.trim() === "") {
      errors.primaryGuest_lpo = "LPO is required";
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

    // Show order summary modal
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
              // The backend's own last free day, when the rate carries it.
              if (hotel.refundTerms?.cutoff) {
                return `${hotel.refundTerms.cutoff}T00:00:00`;
              }
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
                refundTerms: hotel.refundTerms,
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

      const tdNumber =
        tourismDirham !== "" && !isNaN(Number(tourismDirham))
          ? Number(tourismDirham)
          : 0;
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
      };

      console.log("Makepkg Booking payload:", bookingPayload);

      const response = await axiosInstance.post(
        "/api/makeYourOwnPackage/saveMakeYourOwnPackageBooking",
        bookingPayload,
      );

      // Check booking response structure
      if (
        response.data &&
        response.data.bookingId != null &&
        response.data.bookingId != 0 &&
        response.data.message === "Booking completed successfully"
      ) {
        // Clear quoteId from sessionStorage after successful booking
        if (quoteId) {
          sessionStorage.removeItem("makePkgQuoteId");
        }
        setShowOrderSummaryModal(false);
        toast.success(
          response.data.message || "Booking submitted successfully!",
        );
        navigate("/booking-details/custom-booking-list");
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
    <div className="make-pkg-booking-container d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="content-wrapper py-4 flex-grow-1" style={{ minWidth: 0, overflowX: "hidden" }}>
          <Container fluid>
            <div className="d-flex justify-content-end mb-2">
              <AgentBalanceDisplay
                agentId={sessionStorage.getItem("makePkgAgentId")}
              />
            </div>
            {/* ── Booking Summary card (HotelBookingPage-style) ──
                Mirrors the layout of the standard hotel booking summary
                so the operator sees a consistent breakdown:
                   Base prices  ▶ Tourism Dirham ▶ Final totals.
                TD is always rolled into the displayed numbers — so the
                Selling / Total figures shown here equal what the
                booking POST will save. */}
            {(() => {
              const tdNum =
                tourismDirham !== "" && !isNaN(Number(tourismDirham))
                  ? Number(tourismDirham)
                  : 0;
              const sellingWithTd = sellingPrice + tdNum;
              const totalWithTd = totalPrice + tdNum;
              return (
                <Card className="shadow-sm border-0 rounded-4 mb-3">
                  <Card.Body className="p-3">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <h4 className="mb-0 fw-bold text-primary d-flex align-items-center">
                        <FaHotel className="me-2" />
                        Confirm Booking
                      </h4>
                      <Badge
                        bg="success-subtle"
                        text="success"
                        className="px-3 py-2"
                        style={{ fontSize: "0.85rem" }}
                      >
                        Grand Total: AED {totalWithTd.toFixed(2)}
                      </Badge>
                    </div>
                    <div className="px-2">
                      <Row className="g-2">
                        <Col md={3}>
                          <div className="border rounded p-2 h-100">
                            <div className="text-muted small">Selling Price</div>
                            <div className="fw-bold text-dark">
                              AED {sellingPrice.toFixed(2)}
                            </div>
                          </div>
                        </Col>
                        <Col md={3}>
                          <div className="border rounded p-2 h-100">
                            <div className="text-muted small">Total Price</div>
                            <div className="fw-bold text-dark">
                              AED {totalPrice.toFixed(2)}
                            </div>
                          </div>
                        </Col>
                        <Col md={3}>
                          <div className="border rounded p-2 h-100">
                            <div className="text-muted small">Tourism Dirham</div>
                            <div className="fw-bold text-primary">
                              {tdNum > 0 ? `+ AED ${tdNum.toFixed(2)}` : "—"}
                            </div>
                          </div>
                        </Col>
                        <Col md={3}>
                          <div className="border rounded p-2 h-100 bg-success bg-opacity-10">
                            <div className="text-muted small">Final Selling</div>
                            <div className="fw-bold text-success">
                              AED {sellingWithTd.toFixed(2)}
                            </div>
                            <div className="text-muted x-small mt-1">
                              Total billable: AED {totalWithTd.toFixed(2)}
                            </div>
                          </div>
                        </Col>
                      </Row>
                    </div>
                  </Card.Body>
                </Card>
              );
            })()}

            <Row>
              <Col lg={12}>
                <Accordion
                  defaultActiveKey={["0", "5"]}
                  alwaysOpen
                  className="booking-accordion"
                >
                  {/* Itinerary Option Section */}
                  <Accordion.Item eventKey="0" className="mb-2">
                    <Accordion.Header>
                      <h5 className="mb-0 fw-bold">Itinerary option</h5>
                    </Accordion.Header>
                    <Accordion.Body>
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

                  {/* Hotel Option Section */}
                  {hotels.length > 0 && (
                    <Accordion.Item eventKey="1" className="mb-2">
                      <Accordion.Header>
                        <h5 className="mb-0 fw-bold">Hotel option</h5>
                      </Accordion.Header>
                      <Accordion.Body>
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
                            <Card
                              key={hotelIndex}
                              className="mb-3 hotel-item-card"
                            >
                              <Card.Header className="hotel-section-header">
                                <div className="d-flex align-items-center gap-2">
                                  <FaBed className="text-primary" size={20} />
                                  <h6 className="mb-0 fw-bold">
                                    {hotels.length > 1
                                      ? `Hotel ${hotelIndex + 1}: `
                                      : ""}
                                    {hotel.hotelName || "Hotel"}
                                  </h6>
                                </div>
                              </Card.Header>
                              <Card.Body>
                                <div className="date-display">
                                  <FaCalendarAlt className="text-primary me-2" />
                                  <strong>Checkin :</strong>{" "}
                                  {formatDate(checkIn)}{" "}
                                  <strong className="ms-3">Checkout :</strong>{" "}
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
                                          className="mb-2 guest-details-card"
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
                                                      <Col md={3}>
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
                                                      <Col md={5}>
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
                                                      <Col md={4}>
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

                                {/* Tourism Dirhams */}
                                <Row className="mb-2">
                                  <Col md={6}>
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
                                </Row>

                                {/* Remarks */}
                                <Row className="mb-2">
                                  <Col>
                                    <Form.Label>Remarks</Form.Label>
                                    <Form.Control
                                      as="textarea"
                                      rows={3}
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
                                </Row>

                                {/* Special Request */}
                                <Row className="mb-2">
                                  <Col>
                                    <Form.Label>Special Request</Form.Label>
                                    <Form.Control
                                      as="textarea"
                                      rows={3}
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

                                {/* Booking Confirmation */}
                                <div className="mb-3">
                                  <Form.Label className="mb-2">
                                    Are you sure to continue booking?
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
                                </div>
                              </Card.Body>
                            </Card>
                          );
                        })}
                      </Accordion.Body>
                    </Accordion.Item>
                  )}

                  {/* Activity Option Section */}
                  {activities.length > 0 && (
                    <Accordion.Item eventKey="2" className="mb-2">
                      <Accordion.Header>
                        <h5 className="mb-0 fw-bold">Tour option</h5>
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
                            <Card
                              key={activityIndex}
                              className="mb-3 activity-item-card"
                            >
                              <Card.Header className="activity-header">
                                <div className="d-flex align-items-center gap-2">
                                  <FaTicketAlt
                                    className="text-primary"
                                    size={20}
                                  />
                                  <h6 className="mb-0 fw-bold">
                                    {activities.length > 1
                                      ? `Activity ${activityIndex + 1}: `
                                      : ""}
                                    {activityName}
                                  </h6>
                                </div>
                              </Card.Header>
                              <Card.Body>
                                <div className="date-display">
                                  <FaCalendarAlt className="text-primary me-2" />
                                  <strong>Tour date:</strong>{" "}
                                  {formatDate(activityDate)}
                                </div>

                                <div className="activity-info-summary mt-2 pt-2 border-top">
                                  <Row className="g-3 align-items-end">
                                    <Col xs={6} sm={3} md={2}>
                                      <label className="text-muted small d-block mb-1">Adult Count</label>
                                      <div className="fw-bold fs-6">{adult}</div>
                                    </Col>
                                    <Col xs={6} sm={3} md={2}>
                                      <label className="text-muted small d-block mb-1">Child Count</label>
                                      <div className="fw-bold fs-6">
                                        {child}
                                        {childAges.length > 0 && (
                                          <span className="text-muted ms-1 small" style={{ fontSize: '0.75rem' }}>
                                            ({childAges.join(', ')})
                                          </span>
                                        )}
                                      </div>
                                    </Col>
                                    <Col xs={6} sm={3} md={4} className="text-sm-end">
                                      <label className="text-muted small d-block mb-1">Selling Price</label>
                                      <div className="text-success fw-bold fs-5">
                                        <small className="me-1">AED</small>
                                        {sellingPrice.toFixed(2)}
                                      </div>
                                    </Col>
                                    <Col xs={6} sm={3} md={4} className="text-sm-end">
                                      <label className="text-muted small d-block mb-1">Total Price</label>
                                      <div className="text-primary fw-bold fs-5">
                                        <small className="me-1">AED</small>
                                        {totalPrice.toFixed(2)}
                                      </div>
                                    </Col>
                                  </Row>
                                </div>

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
                              </Card.Body>
                            </Card>
                          );
                        })}
                      </Accordion.Body>
                    </Accordion.Item>
                  )}

                  {/* Transfer Option Section */}
                  {transfers.length > 0 && (
                    <Accordion.Item eventKey="3" className="mb-2">
                      <Accordion.Header>
                        <h5 className="mb-0 fw-bold">Transfer option</h5>
                      </Accordion.Header>
                      <Accordion.Body>
                        {transfers.map((item, transferIndex) => {
                          const cab = item.cab || {};
                          const details = cab.details || {};
                          const vehicleName =
                            cab.vehicleName ||
                            details.vehicleName ||
                            "Transfer";
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
                            <Card
                              key={transferIndex}
                              className="mb-3 transfer-item-card"
                            >
                              <Card.Header className="transfer-header">
                                <div className="d-flex align-items-center gap-2">
                                  <FaCar className="text-primary" size={20} />
                                  <h6 className="mb-0 fw-bold">
                                    {transfers.length > 1
                                      ? `Transfer ${transferIndex + 1}: `
                                      : ""}
                                    {capacity
                                      ? `${capacity} Seater`
                                      : vehicleName}
                                  </h6>
                                </div>
                              </Card.Header>
                              <Card.Body>
                                <div className="date-display">
                                  <FaCalendarAlt className="text-primary me-2" />
                                  <strong>Pickup date :</strong>{" "}
                                  {formatDate(pickupDate)}{" "}
                                  <strong className="ms-3">Drop date :</strong>{" "}
                                  {formatDate(dropDate)}
                                </div>

                                {/* Transfer Option/Share type Table */}
                                <Table
                                  striped
                                  bordered
                                  hover
                                  responsive
                                  size="sm"
                                  className="mb-3 transfer-table"
                                >
                                  <thead>
                                    <tr>
                                      <th>Transfer Option/Share type</th>
                                      <th>Adult Count</th>
                                      <th>Child Count</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    <tr>
                                      <td>
                                        {getTravelTypeLabel(travelType)} /{" "}
                                        {shareType}
                                      </td>
                                      <td>{adult}</td>
                                      <td>
                                        {child}
                                        {childAges.length > 0 &&
                                          childAges.length === 1 && (
                                            <small className="text-muted d-block">
                                              {child} Child : {childAges[0]} Age
                                            </small>
                                          )}
                                        {childAges.length > 1 && (
                                          <small className="text-muted d-block">
                                            {childAges.map((age, idx) => (
                                              <span key={idx}>
                                                {idx + 1} Child : {age} Age
                                                {idx < childAges.length - 1
                                                  ? ", "
                                                  : ""}
                                              </span>
                                            ))}
                                          </small>
                                        )}
                                      </td>
                                    </tr>
                                  </tbody>
                                </Table>

                                {/* Transporter and Driver Details */}
                                <div className="mb-3 p-3 bg-light rounded">
                                  <h6 className="mb-3 fw-bold text-primary">
                                    Transporter & Driver Details
                                  </h6>
                                  <Row className="g-3">
                                    <Col md={6}>
                                      <Form.Label>Transporter Name</Form.Label>
                                      <Form.Control
  type="text"
  value={
    transferDetails[transferIndex]?.transporterName !== undefined
      ? transferDetails[transferIndex].transporterName
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
                                    <Col md={6}>
                                      <Form.Label>Contact Number</Form.Label>
                                      <Form.Control
                                        type="text"
                                        value={
                                          transferDetail.contactNumber || ""
                                        }
                                        onChange={(e) =>
                                          setTransferDetails({
                                            ...transferDetails,
                                            [transferIndex]: {
                                              ...transferDetail,
                                              contactNumber: e.target.value,
                                            },
                                          })
                                        }
                                        placeholder="Enter contact number"
                                      />
                                    </Col>
                                    {/* <Col md={6}>
                                      <Form.Label>Driver Name</Form.Label>
                                      <Form.Control
                                        type="text"
                                        value={transferDetail.driverName || ""}
                                        onChange={(e) =>
                                          setTransferDetails({
                                            ...transferDetails,
                                            [transferIndex]: {
                                              ...transferDetail,
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
                                        value={
                                          transferDetail.driverContact || ""
                                        }
                                        onChange={(e) =>
                                          setTransferDetails({
                                            ...transferDetails,
                                            [transferIndex]: {
                                              ...transferDetail,
                                              driverContact: e.target.value,
                                            },
                                          })
                                        }
                                        placeholder="Enter driver contact"
                                      />
                                    </Col> */}
                                  </Row>
                                </div>

                                {/* Selling Price and Total Price */}
                                <Row className="g-3">
                                  <Col md={6}>
                                    <div className="d-flex align-items-center justify-content-between">
                                      <strong>Selling Price</strong>
                                      <div className="d-flex align-items-center gap-2">
                                        <span className="text-success fw-bold">
                                          {sellingPrice.toFixed(2)}
                                        </span>
                                        <FaEdit className="text-success edit-icon" />
                                      </div>
                                    </div>
                                  </Col>
                                  <Col md={6}>
                                    <div className="d-flex align-items-center justify-content-between">
                                      <strong>Total Price</strong>
                                      <div className="d-flex align-items-center gap-2">
                                        <span className="text-primary fw-bold">
                                          {totalPrice.toFixed(2)}
                                        </span>
                                        <FaEdit className="text-success edit-icon" />
                                      </div>
                                    </div>
                                  </Col>
                                </Row>
                              </Card.Body>
                            </Card>
                          );
                        })}
                      </Accordion.Body>
                    </Accordion.Item>
                  )}

                  {/* Visa Information Section */}
                  <Accordion.Item eventKey="4" className="mb-2">
                    <Accordion.Header>
                      <h5 className="mb-0 fw-bold">Visa Information</h5>
                    </Accordion.Header>
                    <Accordion.Body>
                      <Form.Check
                        type="checkbox"
                        label="Visa Required"
                        checked={visaRequired}
                        onChange={(e) => setVisaRequired(e.target.checked)}
                        className="mb-2"
                      />

                      {visaRequired && (
                        <div className="visa-section">
                          <h6 className="mb-3 fw-bold text-warning">
                            Visa Details
                          </h6>
                          <Row className="g-3 visa-form-row">
                            <Col md={6}>
                              <Form.Label>Visa Adult</Form.Label>
                              <Form.Control
                                type="number"
                                value={visaDetails.visaAdult}
                                onChange={(e) =>
                                  setVisaDetails({
                                    ...visaDetails,
                                    visaAdult: e.target.value,
                                  })
                                }
                                min="0"
                              />
                            </Col>
                            <Col md={6}>
                              <Form.Label>Visa Adult Rate</Form.Label>
                              <Form.Control
                                type="number"
                                value={visaDetails.visaAdultRate}
                                onChange={(e) =>
                                  setVisaDetails({
                                    ...visaDetails,
                                    visaAdultRate: e.target.value,
                                  })
                                }
                                min="0"
                                step="0.01"
                              />
                            </Col>
                            <Col md={6}>
                              <Form.Label>Visa Child</Form.Label>
                              <Form.Control
                                type="number"
                                value={visaDetails.visaChild}
                                onChange={(e) =>
                                  setVisaDetails({
                                    ...visaDetails,
                                    visaChild: e.target.value,
                                  })
                                }
                                min="0"
                              />
                            </Col>
                            <Col md={6}>
                              <Form.Label>Visa Child Rate</Form.Label>
                              <Form.Control
                                type="number"
                                value={visaDetails.visaChildRate}
                                onChange={(e) =>
                                  setVisaDetails({
                                    ...visaDetails,
                                    visaChildRate: e.target.value,
                                  })
                                }
                                min="0"
                                step="0.01"
                              />
                            </Col>
                            <Col md={6}>
                              <Form.Label>Visa Infant</Form.Label>
                              <Form.Control
                                type="number"
                                value={visaDetails.visaInfant}
                                onChange={(e) =>
                                  setVisaDetails({
                                    ...visaDetails,
                                    visaInfant: e.target.value,
                                  })
                                }
                                min="0"
                              />
                            </Col>
                            <Col md={6}>
                              <Form.Label>Visa Infant Rate</Form.Label>
                              <Form.Control
                                type="number"
                                value={visaDetails.visaInfantRate}
                                onChange={(e) =>
                                  setVisaDetails({
                                    ...visaDetails,
                                    visaInfantRate: e.target.value,
                                  })
                                }
                                min="0"
                                step="0.01"
                              />
                            </Col>
                          </Row>
                        </div>
                      )}
                    </Accordion.Body>
                  </Accordion.Item>

                  {/* Guest Details Section - Always Open */}
                  <Accordion.Item eventKey="5" className="mb-2">
                    <Accordion.Header
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      style={{ cursor: "default" }}
                    >
                      <h5 className="mb-0 fw-bold">Guest Details</h5>
                    </Accordion.Header>
                    <Accordion.Body>
                      <Form className="booking-form">
                        <Row className="g-2">
                          <Col md={3}>
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
                          <Col md={5}>
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
                          <Col md={4}>
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
                          <Col md={4}>
                            <Form.Label>
                              LPO <span className="text-danger">*</span>
                            </Form.Label>
                            <Form.Control
                              type="text"
                              value={primaryGuest.lpo}
                              onChange={(e) =>
                                handlePrimaryGuestChange("lpo", e.target.value)
                              }
                              isInvalid={!!validationErrors.primaryGuest_lpo}
                              required
                            />
                            <Form.Control.Feedback type="invalid">
                              {validationErrors.primaryGuest_lpo}
                            </Form.Control.Feedback>
                          </Col>
                        </Row>
                      </Form>
                    </Accordion.Body>
                  </Accordion.Item>

                  {/* ── Add-On Services accordion ──────────────────
                       Lives alongside Itinerary / Hotel / Activity /
                       Cab / Visa / Primary-Guest so the operator can
                       expand it from the booking page just like any
                       other section. The inner panel manages its own
                       sessionStorage; on close we refresh the count
                       badge in the header. */}
                  <Accordion.Item eventKey="6" className="mb-2">
                    <Accordion.Header
                      onClick={() => refreshAddOnsCount()}
                    >
                      <h5 className="mb-0 fw-bold d-flex align-items-center">
                        Add-On Services
                        <Badge
                          bg={addOnsCount > 0 ? "success" : "secondary-subtle"}
                          text={addOnsCount > 0 ? "light" : "secondary"}
                          className="ms-2"
                          style={{ fontSize: "0.7rem" }}
                        >
                          {addOnsCount > 0 ? `${addOnsCount} on` : "Optional"}
                        </Badge>
                      </h5>
                    </Accordion.Header>
                    <Accordion.Body
                      onBlur={() => refreshAddOnsCount()}
                    >
                      <small className="text-muted d-block mb-2">
                        Visa, Meet &amp; Greet, transfers, tours, rentals —
                        toggle any service to <strong>Yes</strong> and fill in
                        the details. Everything you enter here is saved with
                        the booking.
                      </small>
                      <AddOnServicesPanel title="Services" />
                    </Accordion.Body>
                  </Accordion.Item>
                </Accordion>
              </Col>
            </Row>

            {/* Action Buttons at the end of page */}
            <Row className="mt-4">
              <Col lg={12}>
                <div className="d-flex gap-2 justify-content-end">
                  <Button
                    type="button"
                    variant="danger"
                    size="lg"
                    className="btn-booking btn-booking-danger"
                    onClick={() => navigate(-1)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="lg"
                    className="btn-booking btn-booking-primary"
                    onClick={handleSubmit}
                  >
                    <FaCheckCircle className="me-2" />
                    Book
                  </Button>
                </div>
              </Col>
            </Row>
          </Container>
        </main>
      </div>

      {/* Order Summary Modal - Industry Standard Design */}
      <Modal
        show={showOrderSummaryModal}
        onHide={() => !isSubmitting && setShowOrderSummaryModal(false)}
        size="lg"
        centered
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
        <Modal.Body
          style={{ maxHeight: "70vh", overflowY: "auto", padding: "1.5rem" }}
        >
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
                    <div className="mb-2">
                      <small
                        className="text-muted d-block mb-1"
                        style={{ fontSize: "0.75rem", fontWeight: "500" }}
                      >
                        LPO Number
                      </small>
                      <div style={{ fontSize: "0.9375rem", color: "#495057" }}>
                        {primaryGuest.lpo || "N/A"}
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

            {/* Price Summary Section */}
            <div
              className="p-4 rounded"
              style={{
                backgroundColor: "#f8f9fa",
                border: "2px solid #0d6efd",
              }}
            >
              <h6
                className="mb-3 fw-bold"
                style={{ fontSize: "1rem", color: "#212529" }}
              >
                Price Summary
              </h6>

              <div className="mb-3">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span style={{ fontSize: "0.9375rem", color: "#495057" }}>
                    Subtotal (Selling Price)
                  </span>
                  <strong style={{ fontSize: "1.125rem", color: "#198754" }}>
                    AED {(
                      sellingPrice +
                      (tourismDirham !== "" && !isNaN(Number(tourismDirham))
                        ? Number(tourismDirham)
                        : 0)
                    ).toFixed(2)}
                  </strong>
                </div>
                <div className="d-flex justify-content-between align-items-center">
                  <span style={{ fontSize: "0.9375rem", color: "#495057" }}>
                    Subtotal (Without Markup)
                  </span>
                  <strong style={{ fontSize: "1.125rem", color: "#0d6efd" }}>
                    AED {(
                      totalPrice +
                      (tourismDirham !== "" && !isNaN(Number(tourismDirham))
                        ? Number(tourismDirham)
                        : 0)
                    ).toFixed(2)}
                  </strong>
                </div>
              </div>

              <div className="mb-3 pt-3 border-top">
                <label
                  className="form-label fw-semibold"
                  style={{ fontSize: "0.875rem" }}
                >
                  Tourism Dirham
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="form-control"
                  placeholder="0.00"
                  value={tourismDirham}
                  onChange={(e) => setTourismDirham(e.target.value)}
                />
                <small className="text-muted">
                  Optional — added to both subtotals above.
                </small>
              </div>

              {visaRequired && (
                <div className="pt-3 mt-3 border-top">
                  <h6
                    className="mb-2 fw-semibold"
                    style={{ fontSize: "0.875rem", color: "#495057" }}
                  >
                    Visa Charges
                  </h6>
                  {parseInt(visaDetails.visaAdult || "0") > 0 && (
                    <div
                      className="d-flex justify-content-between mb-1"
                      style={{ fontSize: "0.8125rem" }}
                    >
                      <span className="text-muted">
                        Adults ({visaDetails.visaAdult})
                      </span>
                      <span>
                        AED{" "}
                        {parseFloat(visaDetails.visaAdultRate || "0").toFixed(
                          2,
                        )}
                      </span>
                    </div>
                  )}
                  {parseInt(visaDetails.visaChild || "0") > 0 && (
                    <div
                      className="d-flex justify-content-between mb-1"
                      style={{ fontSize: "0.8125rem" }}
                    >
                      <span className="text-muted">
                        Children ({visaDetails.visaChild})
                      </span>
                      <span>
                        AED{" "}
                        {parseFloat(visaDetails.visaChildRate || "0").toFixed(
                          2,
                        )}
                      </span>
                    </div>
                  )}
                  {parseInt(visaDetails.visaInfant || "0") > 0 && (
                    <div
                      className="d-flex justify-content-between"
                      style={{ fontSize: "0.8125rem" }}
                    >
                      <span className="text-muted">
                        Infants ({visaDetails.visaInfant})
                      </span>
                      <span>
                        AED{" "}
                        {parseFloat(visaDetails.visaInfantRate || "0").toFixed(
                          2,
                        )}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div
                className="mt-3 pt-3 border-top d-flex justify-content-between align-items-center"
                style={{ borderColor: "#0d6efd !important" }}
              >
                <span
                  className="fw-bold"
                  style={{ fontSize: "1.125rem", color: "#212529" }}
                >
                  Total Amount
                </span>
                <span
                  className="fw-bold"
                  style={{
                    fontSize: "1.5rem",
                    color: "#0d6efd",
                  }}
                >
                  AED {sellingPrice.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer
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
          <Button
            variant="primary"
            onClick={confirmBooking}
            disabled={isSubmitting}
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

      {/* Detailed Itinerary Modal */}
      <Modal
        show={showItineraryModal}
        onHide={handleCloseItineraryModal}
        size="lg"
        centered
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
        <Modal.Body
          style={{ maxHeight: "70vh", overflowY: "auto", padding: "1.5rem" }}
        >
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

export default MakePkgBookingPage;
