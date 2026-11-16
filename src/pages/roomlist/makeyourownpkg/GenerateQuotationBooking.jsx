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
import axiosInstance from "../../../components/AxiosInstance";
import toast from "react-hot-toast";
import "../../../styles/HotelBookingPage.css";
import "../../../styles/MakePkgBookingPage.css";

const GenerateQuotationBooking = () => {
  const navigate = useNavigate();
  const [cartData, setCartData] = useState([]);
  console.log("Cart Data:", cartData);
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
  const [hotelTourismDirhams, setHotelTourismDirhams] = useState({});
  const [hotelRemarks, setHotelRemarks] = useState({});
  const [hotelSpecialRequests, setHotelSpecialRequests] = useState({});
  const [hotelBookingConfirmation, setHotelBookingConfirmation] = useState({});
  const [totalPrice, setTotalPrice] = useState(0);
  const [sellingPrice, setSellingPrice] = useState(0);
  
  const [itineraryList, setItineraryList] = useState([]);
  const [selectedItineraries, setSelectedItineraries] = useState({
    day1: [],
    day2: []
  });
  const [loadingItinerary, setLoadingItinerary] = useState(false);
  const [itineraryExpanded, setItineraryExpanded] = useState(false);
  
  const [showItineraryModal, setShowItineraryModal] = useState(false);
  const [currentDay, setCurrentDay] = useState(null);
  const [itinerarySearchTerm, setItinerarySearchTerm] = useState("");
  const [filteredItineraryList, setFilteredItineraryList] = useState([]);
  const [expandedDescriptions, setExpandedDescriptions] = useState({});

  const [roomGuests, setRoomGuests] = useState({});
  const [transferDetails, setTransferDetails] = useState({});
  const [validationErrors, setValidationErrors] = useState({});
  const [showOrderSummaryModal, setShowOrderSummaryModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const initializeRoomGuests = (cartItems) => {
    const guests = {};
    cartItems.forEach((item, hotelIndex) => {
      if (item.hotel) {
        const hotel = item.hotel || {};
        const searchRoomDTOs = hotel.searchRoomDTOs || [];
        searchRoomDTOs.forEach((room, roomIndex) => {
          const adults = parseInt(room.adult || room.adults || 1);
          const children = parseInt(room.child || room.children || 0);
          const totalGuests = adults + children;
          const key = `${hotelIndex}-${roomIndex}`;
          guests[key] = Array.from({ length: totalGuests }, (_, guestIndex) => ({
            salutation: "",
            firstName: "",
            lastName: "",
            gender: "",
            isChild: guestIndex >= adults,
            age: guestIndex >= adults ? (room.childAge?.[guestIndex - adults] || "") : "",
          }));
        });
      }
    });
    setRoomGuests(guests);
  };

  const initializeTransferDetails = (cartItems) => {
    const details = {};
    cartItems.forEach((item, index) => {
      if (item.cab) {
        const cab = item.cab || {};
        const cabDetails = cab.details || {};
        details[index] = {
          transporterName: cab.transporter || cab.transporterName || cabDetails.transporter || cabDetails.transporterName || "",
          contactNumber: cab.contactNumber || cabDetails.contactNumber || "",
          driverName: cab.driverName || cabDetails.driverName || "",
          driverContact: cab.driverContact || cabDetails.driverContact || "",
        };
      }
    });
    setTransferDetails(details);
  };

  const initializeHotelState = (cartItems) => {
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
          initializeHotelState(parsed);
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

  const handleGuestChange = (hotelIndex, roomIndex, guestIndex, field, value) => {
    const key = `${hotelIndex}-${roomIndex}`;
    setRoomGuests((prev) => {
      const updated = { ...prev };
      if (!updated[key]) updated[key] = [];
      const guests = [...updated[key]];
      if (!guests[guestIndex]) {
        guests[guestIndex] = { salutation: "", firstName: "", lastName: "", gender: "", isChild: false, age: "" };
      }
      guests[guestIndex] = { ...guests[guestIndex], [field]: value };
      updated[key] = guests;
      return updated;
    });
    const errorKey = `hotel_${hotelIndex}_room_${roomIndex}_guest_${guestIndex}_${field}`;
    if (validationErrors[errorKey]) {
      setValidationErrors((prev) => { const updated = { ...prev }; delete updated[errorKey]; return updated; });
    }
  };

  const handlePrimaryGuestChange = (field, value) => {
    setPrimaryGuest((prev) => ({ ...prev, [field]: value }));
    if (field === "emailId" && value.trim() !== "") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        setValidationErrors((prev) => ({ ...prev, primaryGuest_emailId: "Please enter a valid email address" }));
        return;
      }
    }
    const errorKey = `primaryGuest_${field}`;
    if (validationErrors[errorKey]) {
      setValidationErrors((prev) => { const updated = { ...prev }; delete updated[errorKey]; return updated; });
    }
  };

  const fetchItineraryDetails = async () => {
    if (itineraryList.length > 0) { setItineraryExpanded(true); return; }
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

  useEffect(() => { fetchItineraryDetails(); }, []);

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

  const handleOpenItineraryModal = (day) => {
    setCurrentDay(day);
    setItinerarySearchTerm("");
    setFilteredItineraryList(itineraryList);
    setShowItineraryModal(true);
  };

  const handleCloseItineraryModal = () => {
    setShowItineraryModal(false);
    setCurrentDay(null);
    setItinerarySearchTerm("");
    setExpandedDescriptions({});
  };

  const handleItineraryToggle = (itineraryId) => {
    if (!currentDay) return;
    setSelectedItineraries((prev) => {
      const dayItineraries = prev[currentDay] || [];
      if (dayItineraries.includes(itineraryId)) {
        return { ...prev, [currentDay]: dayItineraries.filter((id) => id !== itineraryId) };
      } else {
        return { ...prev, [currentDay]: [...dayItineraries, itineraryId] };
      }
    });
  };

  const calculatePrices = (cartItems) => {
    let total = 0;
    let selling = 0;
    cartItems.forEach((item) => {
      if (item.hotel) {
        total += parseFloat(item.hotel.totalRateWithoutmrk || item.hotel.totalRate || 0);
        selling += parseFloat(item.hotel.totalRate || 0);
      } else if (item.activity) {
        total += parseFloat(item.activity.totalRateWithoutmrk || item.activity.totalRate || 0);
        selling += parseFloat(item.activity.totalRate || 0);
      } else if (item.cab) {
        total += parseFloat(item.cab.totalRateWithoutmrk || item.cab.totalRate || 0);
        selling += parseFloat(item.cab.totalRate || 0);
      }
    });
    setTotalPrice(total);
    setSellingPrice(selling);
  };

  const getHotels = () => cartData.filter((item) => item.hotel);
  const getActivities = () => cartData.filter((item) => item.activity);
  const getTransfers = () => cartData.filter((item) => item.cab);

  const formatDate = (dateString) => {
    if (!dateString) return "";
    try {
      if (dateString.includes("/")) return dateString;
      const date = new Date(dateString);
      return date.toLocaleDateString("en-GB");
    } catch { return dateString; }
  };

  const formatDateToYYYYMMDD = (dateString) => {
    if (!dateString) return "";
    try {
      let date;
      if (dateString.includes("/")) {
        const [day, month, year] = dateString.split("/");
        date = new Date(year, month - 1, day);
      } else { date = new Date(dateString); }
      if (isNaN(date.getTime())) return "";
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    } catch { return dateString; }
  };

  const formatDateToDDMMYYYY = (dateString) => {
    if (!dateString) return "";
    try {
      if (dateString.includes("/")) return dateString.replace(/\//g, "-");
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "";
      return `${String(date.getDate()).padStart(2, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${date.getFullYear()}`;
    } catch { return dateString; }
  };

  const calculateNights = (checkIn, checkOut) => {
    if (!checkIn || !checkOut) return 1;
    try {
      let start, end;
      if (checkIn.includes("/")) { const [d, m, y] = checkIn.split("/"); start = new Date(y, m - 1, d); } else { start = new Date(checkIn); }
      if (checkOut.includes("/")) { const [d, m, y] = checkOut.split("/"); end = new Date(y, m - 1, d); } else { end = new Date(checkOut); }
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return 1;
      return Math.max(1, Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)));
    } catch { return 1; }
  };

  const validateForm = () => {
    const errors = {};
    let hasErrors = false;
    if (!primaryGuest.salutation || primaryGuest.salutation.trim() === "") { errors.primaryGuest_salutation = "Salutation is required"; hasErrors = true; }
    if (!primaryGuest.firstName || primaryGuest.firstName.trim() === "") { errors.primaryGuest_firstName = "First Name is required"; hasErrors = true; }
    if (!primaryGuest.lastName || primaryGuest.lastName.trim() === "") { errors.primaryGuest_lastName = "Last Name is required"; hasErrors = true; }
    if (!primaryGuest.contactNumber || primaryGuest.contactNumber.trim() === "") { errors.primaryGuest_contactNumber = "Contact Number is required"; hasErrors = true; }
    if (!primaryGuest.emailId || primaryGuest.emailId.trim() === "") { errors.primaryGuest_emailId = "Email Id is required"; hasErrors = true; }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(primaryGuest.emailId)) { errors.primaryGuest_emailId = "Please enter a valid email address"; hasErrors = true; }
    if (!primaryGuest.lpo || primaryGuest.lpo.trim() === "") { errors.primaryGuest_lpo = "LPO is required"; hasErrors = true; }

    const hotels = getHotels();
    if (hotels.length > 0) {
      hotels.forEach((item, hotelIndex) => {
        const hotel = item.hotel || {};
        const searchRoomDTOs = hotel.searchRoomDTOs || [];
        let hotelIndexInCart = -1;
        let hotelCount = 0;
        for (let i = 0; i < cartData.length; i++) {
          if (cartData[i].hotel) { if (hotelCount === hotelIndex) { hotelIndexInCart = i; break; } hotelCount++; }
        }
        if (hotelIndexInCart >= 0) {
          searchRoomDTOs.forEach((room, roomIndex) => {
            const guestKey = `${hotelIndexInCart}-${roomIndex}`;
            const guests = roomGuests[guestKey] || [];
            guests.forEach((guest, guestIndex) => {
              const errorPrefix = `hotel_${hotelIndexInCart}_room_${roomIndex}_guest_${guestIndex}`;
              if (!guest.salutation || (typeof guest.salutation === 'string' && guest.salutation.trim() === "")) { errors[`${errorPrefix}_salutation`] = "Salutation is required"; hasErrors = true; }
              if (!guest.firstName || (typeof guest.firstName === 'string' && guest.firstName.trim() === "")) { errors[`${errorPrefix}_firstName`] = "First Name is required"; hasErrors = true; }
              if (!guest.lastName || (typeof guest.lastName === 'string' && guest.lastName.trim() === "")) { errors[`${errorPrefix}_lastName`] = "Last Name is required"; hasErrors = true; }
              if (!guest.gender || (typeof guest.gender === 'string' && guest.gender.trim() === "")) { errors[`${errorPrefix}_gender`] = "Gender is required"; hasErrors = true; }
            });
          });
        }
      });
    }
    return { errors, hasErrors };
  };

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const { errors, hasErrors } = validateForm();
    if (hasErrors) {
      setValidationErrors(errors);
      toast.error("Please fill in all required fields correctly.");
      setTimeout(() => { const firstErrorField = document.querySelector('.is-invalid'); if (firstErrorField) firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 100);
      return;
    }
    setValidationErrors({});
    setShowOrderSummaryModal(true);
  };

  const formatDateToDateObject = (dateString) => {
    if (!dateString) return null;
    try {
      let date;
      if (dateString.includes("/")) { const [day, month, year] = dateString.split("/"); date = new Date(year, month - 1, day); }
      else if (dateString.includes("-")) { const [day, month, year] = dateString.split("-"); date = new Date(year, month - 1, day); }
      else { date = new Date(dateString); }
      if (isNaN(date.getTime())) return null;
      return date;
    } catch { return null; }
  };

  const confirmQuotation = async () => {
    setIsSubmitting(true);
    try {
      const hotels = getHotels();
      const activities = getActivities();
      const transfers = getTransfers();
      const firstHotel = hotels.length > 0 ? hotels[0].hotel : null;
      const checkIn = firstHotel?.checkIn || firstHotel?.checkInDate || "";
      const checkOut = firstHotel?.checkOut || firstHotel?.checkOutDate || "";
      const nights = calculateNights(checkIn, checkOut);
      const firstActivity = activities.length > 0 ? activities[0].activity : null;
      const tourDateObj = firstActivity?.activityDate ? formatDateToDateObject(firstActivity.activityDate) : (checkIn ? formatDateToDateObject(checkIn) : new Date());
      const currencyCode = firstHotel?.currency || firstActivity?.currency || "AED";
      const currencyId = firstHotel?.currencyId || firstActivity?.currencyId || 1;
      const markup = sellingPrice - totalPrice;
      const markupType = 1;
      const markupTypeName = "Percent";
      const agentId = parseInt(sessionStorage.getItem("makePkgAgentId") || "0");
      const employeeId = firstHotel?.employeeId || "1";
      const agent = sessionStorage.getItem("UserName") || "";

      const quoteItineraryDTOList = [];
      if (selectedItineraries.day1.length > 0) {
        quoteItineraryDTOList.push({ days: 1, itineraryList: selectedItineraries.day1.map((id) => { const it = itineraryList.find(i => i.itineraryId === id); return { itinearyId: parseInt(id) || 0, heading: it?.itineraryHeading || "", description: it?.itineraryDesc || "", imagePath: it?.itineraryImg || "" }; }) });
      }
      if (selectedItineraries.day2.length > 0) {
        quoteItineraryDTOList.push({ days: 2, itineraryList: selectedItineraries.day2.map((id) => { const it = itineraryList.find(i => i.itineraryId === id); return { itinearyId: parseInt(id) || 0, heading: it?.itineraryHeading || "", description: it?.itineraryDesc || "", imagePath: it?.itineraryImg || "" }; }) });
      }

      const quoteActivityDTOList = activities.map((item) => {
        const activity = item.activity || {};
        const childAge = activity.childAge ? (Array.isArray(activity.childAge) ? activity.childAge[0] : activity.childAge) : null;
        return { activityId: parseInt(activity.activityId || "0") || 0, tourDate: formatDateToDateObject(activity.activityDate || ""), nOfAdult: parseInt(activity.adult || activity.noOfAdult || "1") || 1, noOfChild: parseInt(activity.child || activity.noOfChild || "0") || 0, childAge: childAge ? parseInt(childAge) : null, sellingPrice: parseFloat(activity.totalRate || 0), totalPrice: parseFloat(activity.totalRateWithoutmrk || activity.totalRate || 0) };
      });

      const quoteCabDTOList = transfers.map((item, transferArrayIndex) => {
        let transferIndexInCart = -1; let cabCount = 0;
        for (let i = 0; i < cartData.length; i++) { if (cartData[i].cab) { if (cabCount === transferArrayIndex) { transferIndexInCart = i; break; } cabCount++; } }
        const cab = item.cab || {};
        let childAgeStr = "";
        if (cab.childAge) { childAgeStr = Array.isArray(cab.childAge) ? cab.childAge.join(",") : String(cab.childAge); }
        return { quoteCabId: null, quoteId: null, cabId: parseInt(cab.cabId || "0") || 0, noOfCabs: parseInt(cab.noOfCabs || "1") || 1, travelType: parseInt(cab.travelType || "1") || 1, hourDetails: parseInt(cab.hourDetails || cab.timeDetails || "0") || 0, locationId: parseInt(cab.locationId || "0") || 0, dropDetails: parseInt(cab.dropDetails || "1") || 1, paxDetails: parseInt(cab.paxDetails || "1") || 1, pickupDate: formatDateToDateObject(cab.pickupDate || ""), dropOffDate: formatDateToDateObject(cab.dropDate || cab.dropOffDate || cab.dropoffDate || ""), sellingPrice: parseFloat(cab.totalRate || 0), totalPrice: parseFloat(cab.totalRateWithoutmrk || cab.totalRate || 0), luggage: cab.luggage === true || cab.luggage === "true" || String(cab.luggage).toLowerCase() === "true", cabName: cab.cabName || cab.vehicleName || "", noOfAdult: parseInt(cab.adult || cab.noOfAdult || "1") || 1, noOfChild: parseInt(cab.child || cab.noOfChild || "0") || 0, childAge: childAgeStr, paxDetailsTerm: cab.paxDetailsTerm || "", dropDetailsTerm: cab.dropDetailsTerm || "", location: cab.location || cab.pickupLocation || "" };
      });

      const quoteHotelDTOList = hotels.map((item, hotelIndex) => {
        const hotel = item.hotel || {};
        let hotelIndexInCart = -1; let hotelCount = 0;
        for (let i = 0; i < cartData.length; i++) { if (cartData[i].hotel) { if (hotelCount === hotelIndex) { hotelIndexInCart = i; break; } hotelCount++; } }
        const actualHotelIndexInCart = hotelIndexInCart >= 0 ? hotelIndexInCart : hotelIndex;
        const checkIn = hotel.checkIn || hotel.checkInDate || "";
        const checkOut = hotel.checkOut || hotel.checkOutDate || "";
        const nights = calculateNights(checkIn, checkOut);
        return {
          agentId: String(sessionStorage.getItem("makePkgAgentId") || "0"), apiId: "INHOUSE", hotelId: String(hotel.hotelId || ""), hotelName: hotel.hotelName || "", address: hotel.hotelAddress || hotel.address || "", starRating: parseInt(hotel.starRating || 0), checkInDate: formatDateToYYYYMMDD(checkIn), checkOutDate: formatDateToYYYYMMDD(checkOut), nights, employeeId: "1",
          roomStatus: hotel.available === false || hotel.available === "False" ? "On Request" : "Available",
          cancellationPolicy: (() => { const policies = hotel.cancellationPolicy || []; if (Array.isArray(policies) && policies.length > 0) return policies.map((p) => typeof p === 'string' ? p : (p.policyText || p.text || JSON.stringify(p))); return []; })(),
          deadlineDate: (() => { const nonRefundable = hotel.refundstatus === "N" || hotel.nonRefundable === true || hotel.nonRefundable === "true"; if (nonRefundable) { const today = new Date(); const deadline = new Date(today); deadline.setDate(today.getDate() - 2); deadline.setHours(0, 0, 0, 0); return `${deadline.getFullYear()}-${String(deadline.getMonth() + 1).padStart(2, "0")}-${String(deadline.getDate()).padStart(2, "0")}T00:00:00`; } else { const policies = hotel.cancellationPolicy || []; if (policies.length === 0) return null; const dates = policies.map(p => typeof p === 'object' && p.fromDate ? new Date(p.fromDate) : null).filter(date => date !== null && !isNaN(date.getTime())); if (dates.length === 0) return null; const earliestDate = new Date(Math.min(...dates.map(d => d.getTime()))); const deadline = new Date(earliestDate); deadline.setDate(earliestDate.getDate() - 2); deadline.setHours(0, 0, 0, 0); return `${deadline.getFullYear()}-${String(deadline.getMonth() + 1).padStart(2, "0")}-${String(deadline.getDate()).padStart(2, "0")}T00:00:00`; } })(),
          isBookandVoucher: (hotelBookingConfirmation[hotelIndex] || "Book & Voucher") === "Book & Voucher",
          primaryGuest: { firstName: primaryGuest.firstName || "", middleName: primaryGuest.middleName || "", lastName: primaryGuest.lastName || "", nativeCountry: hotel.nationality || "", email: primaryGuest.emailId || "", phone: primaryGuest.contactNumber || "", passportNo: primaryGuest.passportNumber || "", salutaion: primaryGuest.salutation || "", agentLpo: primaryGuest.lpo || "" },
          rooms: hotel?.searchRoomDTOs?.map((room, idx) => {
            const guestKey = `${actualHotelIndexInCart}-${idx}`;
            const guests = roomGuests[guestKey] || [];
            const roomRate = parseFloat(hotel.totalRate || 0);
            const roomRateWithoutMarkup = parseFloat(hotel.totalRateWithoutmrk || hotel.totalRate || 0);
            return { roomNo: idx + 1, roomCategory: hotel.roomCategory || "", mealPlan: hotel.roomType || "", nonRefundable: hotel.nonRefundable === true || hotel.nonRefundable === "true" || hotel.refundstatus === "N", refundTerms: hotel.refundTerms, currency: hotel.currency || "AED", rate: roomRate, rateWithoutMarkup: roomRateWithoutMarkup, adults: parseInt(room.adult || room.adults || 1), children: parseInt(room.child || room.children || 0), childAges: Array.isArray(room.childAge) ? room.childAge.map(age => parseInt(age) || 0) : (room.childAge ? [parseInt(room.childAge) || 0] : []), guests: guests.map((guest) => ({ salutation: guest.salutation || "", firstName: guest.firstName || "", middleName: guest.middleName || "", lastName: guest.lastName || "", gender: guest.gender || "", isChild: guest.isChild || false })) };
          }) || [],
          remarks: hotelRemarks[hotelIndex] || "", specialRequests: hotelSpecialRequests[hotelIndex] || "", tourismDirhams: parseFloat(hotelTourismDirhams[hotelIndex] || "0") || 0, bookingConfirmation: hotelBookingConfirmation[hotelIndex] || "Book & Voucher",
        };
      });

      const quotationPayload = { quoteId: null, bookingDate: new Date(), quoteCode: null, tourDate: tourDateObj, currencyId, markUp: Math.round(markup * 100) / 100, noOfNights: nights, nativeCountry: firstHotel?.nativeContryId ? parseInt(firstHotel.nativeContryId) : null, markUpType: markupType, markUpTypeName: markupTypeName, agent, employee: "", employeeMail: "", agentId, employeeId: parseInt(employeeId) || 1, sellingPrice: Math.round(sellingPrice * 100) / 100, currencyCode, totalPrice: Math.round(totalPrice * 100) / 100, visaStatus: visaRequired, visaAdult: parseInt(visaDetails.visaAdult || "0") || 0, visaAdultRate: visaDetails.visaAdultRate || "0", visaChild: parseInt(visaDetails.visaChild || "0") || 0, visaChildRate: visaDetails.visaChildRate || "0", visaInfant: parseInt(visaDetails.visaInfant || "0") || 0, visaInfantRate: visaDetails.visaInfantRate || "0", quoteCabDTOList, quoteItineraryDTOList, customPackageListItineraryDTOList: quoteItineraryDTOList, quoteActivityDTOList, quoteHotelDTOList };

      console.log("Quotation payload:", quotationPayload);
      const response = await axiosInstance.post("/api/makeYourOwnPackage/saveQuotations", quotationPayload);
      if (response.data && response.data != null) {
        setShowOrderSummaryModal(false);
        toast.success("Quotation saved successfully!");
        navigate("/booking-details/quotation-booking-list");
      } else {
        toast.error("Failed to save quotation.");
      }
    } catch (err) {
      console.error("Error saving quotation:", err);
      toast.error(err.response?.data?.message || "Failed to save quotation. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmBooking = async () => {
    setIsSubmitting(true);
    try {
      const hotels = getHotels();
      const activities = getActivities();
      const transfers = getTransfers();
      const hotelIndexInCart = hotels.length > 0 ? cartData.findIndex((item) => item.hotel) : -1;
      const firstHotel = hotels.length > 0 ? hotels[0].hotel : null;
      const checkIn = firstHotel?.checkIn || firstHotel?.checkInDate || "";
      const checkOut = firstHotel?.checkOut || firstHotel?.checkOutDate || "";
      const nights = calculateNights(checkIn, checkOut);
      const firstActivity = activities.length > 0 ? activities[0].activity : null;
      const tourDate = firstActivity?.activityDate ? formatDateToDDMMYYYY(firstActivity.activityDate) : (activities.length > 0 ? formatDateToDDMMYYYY(checkIn) : "");

      const bookingPayload = {
        customPackageId: "", sellingPrice: String(sellingPrice.toFixed(2)), totalPrice: String(totalPrice.toFixed(2)), tourDate, visaStatus: visaRequired,
        visaAdult: parseInt(visaDetails.visaAdult || "0") || 0, visaAdultRate: parseFloat(visaDetails.visaAdultRate || "0") || 0,
        visaChild: parseInt(visaDetails.visaChild || "0") || 0, visaChildRate: parseFloat(visaDetails.visaChildRate || "0") || 0,
        visaInfant: parseInt(visaDetails.visaInfant || "0") || 0, visaInfantRate: parseFloat(visaDetails.visaInfantRate || "0") || 0,
        hotelBookingRequest: hotels.length > 0 && firstHotel ? {
          agentId: String(sessionStorage.getItem("makePkgAgentId") || "0"), apiId: "INHOUSE", hotelId: String(firstHotel.hotelId || ""), hotelName: firstHotel.hotelName || "", address: firstHotel.hotelAddress || firstHotel.address || "", starRating: parseInt(firstHotel.starRating || 0), checkInDate: formatDateToYYYYMMDD(checkIn), checkOutDate: formatDateToYYYYMMDD(checkOut), nights, employeeId: "1",
          roomStatus: firstHotel.available === false ? "On Request" : "Available",
          cancellationPolicy: (() => { const policies = firstHotel.cancellationPolicy || []; if (Array.isArray(policies) && policies.length > 0) return policies.map((p) => typeof p === 'string' ? p : (p.policyText || p.text || JSON.stringify(p))); return []; })(),
          deadlineDate: (() => { const nonRefundable = firstHotel.refundstatus === "N"; if (nonRefundable === "false" || nonRefundable === false) { const today = new Date(); const deadline = new Date(today); deadline.setDate(today.getDate() - 2); deadline.setHours(0, 0, 0, 0); return `${deadline.getFullYear()}-${String(deadline.getMonth() + 1).padStart(2, "0")}-${String(deadline.getDate()).padStart(2, "0")}T00:00:00`; } else { const policies = firstHotel.cancellationPolicy || []; if (policies.length === 0) return null; const dates = policies.map(p => typeof p === 'object' && p.fromDate ? new Date(p.fromDate) : null).filter(date => date !== null && !isNaN(date.getTime())); if (dates.length === 0) return null; const earliestDate = new Date(Math.min(...dates.map(d => d.getTime()))); const deadline = new Date(earliestDate); deadline.setDate(earliestDate.getDate() - 2); deadline.setHours(0, 0, 0, 0); return `${deadline.getFullYear()}-${String(deadline.getMonth() + 1).padStart(2, "0")}-${String(deadline.getDate()).padStart(2, "0")}T00:00:00`; } })(),
          isBookandVoucher: (hotelBookingConfirmation[0] || "Book & Voucher") === "Book & Voucher",
          primaryGuest: { firstName: primaryGuest.firstName || "", middleName: primaryGuest.middleName || "", lastName: primaryGuest.lastName || "", nativeCountry: firstHotel.nationality || "", email: primaryGuest.emailId || "", phone: primaryGuest.contactNumber || "", passportNo: primaryGuest.passportNumber || "", salutaion: primaryGuest.salutation || "", agentlpo: primaryGuest.lpo || "" },
          rooms: firstHotel?.searchRoomDTOs?.map((room, idx) => {
            const guestKey = `${hotelIndexInCart}-${idx}`;
            const guests = roomGuests[guestKey] || [];
            return { roomNo: idx + 1, roomCategory: firstHotel.roomCategory || "", mealPlan: firstHotel.roomType || "", nonRefundable: firstHotel.nonRefundable === true || firstHotel.nonRefundable === "true" || firstHotel.refundstatus === "N", refundTerms: firstHotel.refundTerms, currency: firstHotel.currency || "AED", rate: parseFloat(firstHotel.totalRate || 0), rateWithoutMarkup: parseFloat(firstHotel.totalRateWithoutmrk || firstHotel.totalRate || 0), adults: parseInt(room.adult || room.adults || 1), children: parseInt(room.child || room.children || 0), childAges: Array.isArray(room.childAge) ? room.childAge.map(age => parseInt(age) || 0) : (room.childAge ? [parseInt(room.childAge) || 0] : []), guests: guests.map((guest) => ({ salutation: guest.salutation || "", firstName: guest.firstName || "", middleName: guest.middleName || "", lastName: guest.lastName || "", gender: guest.gender || "", isChild: guest.isChild || false })) };
          }) || [],
          remarks: hotelRemarks[0] || "", specialRequests: hotelSpecialRequests[0] || "", tourismDirhams: parseFloat(hotelTourismDirhams[0] || "0") || 0, bookingConfirmation: hotelBookingConfirmation[0] || "Book & Voucher",
        } : null,
        customBookingActivityDTO: activities.map((item) => { const activity = item.activity || {}; return { activityId: parseInt(activity.activityId || "0") || 0, tourDate: formatDateToDDMMYYYY(activity.activityDate || ""), noOfAdult: parseInt(activity.adult || activity.noOfAdult || "1") || 1, noOfChild: parseInt(activity.child || activity.noOfChild || "0") || 0, childAgeArray: Array.isArray(activity.childAge) ? activity.childAge.map(age => String(age)) : (activity.childAge ? [String(activity.childAge)] : []), sellingPrice: String(parseFloat(activity.totalRate || 0).toFixed(2)), totalPrice: String(parseFloat(activity.totalRateWithoutmrk || activity.totalRate || 0).toFixed(2)) }; }),
        customBookingCabDTO: transfers.map((item, transferArrayIndex) => {
          let transferIndexInCart = -1; let cabCount = 0;
          for (let i = 0; i < cartData.length; i++) { if (cartData[i].cab) { if (cabCount === transferArrayIndex) { transferIndexInCart = i; break; } cabCount++; } }
          const actualIndex = transferIndexInCart >= 0 ? transferIndexInCart : 0;
          const transferDetail = transferDetails[actualIndex] || {};
          const cab = item.cab || {};
          return { cabId: parseInt(cab.cabId || "0") || 0, noOfCabs: parseInt(cab.noOfCabs || "1") || 1, pickupDate: formatDateToDDMMYYYY(cab.pickupDate || ""), dropOffDate: formatDateToDDMMYYYY(cab.dropDate || cab.dropOffDate || ""), travelType: parseInt(cab.travelType || "1") || 1, hourDetails: parseInt(cab.hourDetails || cab.timeDetails || "0") || 0, dropDetails: parseInt(cab.dropDetails || "1") || 1, paxDetails: parseInt(cab.paxDetails || "1") || 1, luggage: cab.luggage === true || cab.luggage === "true" || String(cab.luggage).toLowerCase() === "true", locationId: parseInt(cab.locationId || "0") || 0, noOfAdult: parseInt(cab.adult || cab.noOfAdult || "1") || 1, noOfChild: parseInt(cab.child || cab.noOfChild || "0") || 0, childAgeArray: Array.isArray(cab.childAge) ? cab.childAge.map(age => parseInt(age) || 0) : (cab.childAge ? [parseInt(cab.childAge) || 0] : []), totalRate: parseFloat(cab.totalRate || 0), totalRateWithoutmrk: parseFloat(cab.totalRateWithoutmrk || cab.totalRate || 0), transporter: transferDetail.transporterName || cab.transporter || "", contactNumber: transferDetail.contactNumber || cab.contactNumber || "", driverName: transferDetail.driverName || cab.driverName || "", driverContact: transferDetail.driverContact || cab.driverContact || "" };
        }),
        customBookingItinearyDTO: [ ...selectedItineraries.day1.map((itineraryId) => ({ itinearyId: parseInt(itineraryId) || 0, days: 1 })), ...selectedItineraries.day2.map((itineraryId) => ({ itinearyId: parseInt(itineraryId) || 0, days: 2 })) ],
        paymentApiId: null, agentId: parseInt(sessionStorage.getItem("makePkgAgentId") || "0"), isCartBooking: true,
      };

      console.log("Makepkg Booking payload:", bookingPayload);
      const response = await axiosInstance.post("/api/makeYourOwnPackage/saveMakeYourOwnPackageBooking", bookingPayload);
      if (response.data && response.data.bookingId != null && response.data.bookingId != 0 && response.data.message === "Booking completed successfully") {
        setShowOrderSummaryModal(false);
        toast.success(response.data.message || "Booking submitted successfully!");
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
      <div className="make-pkg-booking-container d-flex flex-column">
        <TopBar />
        <div className="d-flex flex-grow-1">
          <Sidebar />
          <main className="content-wrapper flex-grow-1" style={{ minWidth: 0, overflowX: "hidden" }}>
            <div className="d-flex justify-content-center align-items-center" style={{ minHeight: "60vh" }}>
              <div className="loading-container text-center">
                <Spinner animation="border" variant="primary" size="lg" />
                <p className="mt-3 text-muted fw-semibold">Loading booking details...</p>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!cartData || cartData.length === 0) {
    return (
      <div className="make-pkg-booking-container d-flex flex-column">
        <TopBar />
        <div className="d-flex flex-grow-1">
          <Sidebar />
          <main className="content-wrapper flex-grow-1" style={{ minWidth: 0, overflowX: "hidden" }}>
            <div className="d-flex justify-content-center align-items-center p-4" style={{ minHeight: "60vh" }}>
              <div className="empty-state text-center">
                <FaShoppingCart size={64} className="text-muted mb-3" />
                <h4 className="mb-3">No Items in Cart</h4>
                <p className="text-muted mb-4">Your cart is empty. Please add items to cart first.</p>
                <Button variant="primary" size="lg" className="btn-booking btn-booking-primary" onClick={() => navigate("/new-booking/make-your-own-package")}>Go to Search</Button>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const hotels = getHotels();
  const activities = getActivities();
  const transfers = getTransfers();

  return (
    <div className="make-pkg-booking-container d-flex flex-column">
      <TopBar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="content-wrapper py-4 flex-grow-1" style={{ minWidth: 0, overflowX: "hidden" }}>
          <Container fluid>
            <div className="booking-page-header mb-3">
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <h2 className="mb-1">Confirm Quotation</h2>
                </div>
                <div className="d-flex align-items-center gap-4">
                  <div className="text-end">
                    <div className="text-muted small mb-1">Selling Price</div>
                    <div className="h4 mb-0 fw-bold text-primary">{sellingPrice.toFixed(2)}</div>
                  </div>
                  <div className="text-end">
                    <div className="text-muted small mb-1">Total Price</div>
                    <div className="h4 mb-0 fw-bold text-primary">{totalPrice.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            </div>

            <Row>
              <Col lg={12}>
                {/* FIX 1: defaultActiveKey now includes all section keys so all panels open by default */}
                <Accordion defaultActiveKey={["0", "1", "2", "3", "4", "5"]} alwaysOpen className="booking-accordion">

                  {/* Itinerary Option Section */}
                  <Accordion.Item eventKey="0" className="mb-2">
                    <Accordion.Header>
                      <h5 className="mb-0 fw-bold">Itinerary option</h5>
                    </Accordion.Header>
                    <Accordion.Body>
                      <div className="itinerary-days-container">
                        <div className="itinerary-day-box mb-3">
                          <div className="d-flex justify-content-between align-items-center">
                            <h6 className="mb-0 fw-bold">Day 1:</h6>
                            <Button variant="outline-danger" size="sm" className="rounded-circle itinerary-plus-btn" onClick={() => handleOpenItineraryModal("day1")}>
                              <FaPlus />
                            </Button>
                          </div>
                          {selectedItineraries.day1.length > 0 && (
                            <div className="mt-3 pt-3 border-top">
                              {selectedItineraries.day1.map((itineraryId) => {
                                const itinerary = itineraryList.find(item => item.itineraryId === itineraryId);
                                if (!itinerary) return null;
                                return (
                                  <div key={itineraryId} className="d-flex justify-content-between align-items-center mb-2 itinerary-preview-item">
                                    <div className="d-flex align-items-center flex-grow-1">
                                      <FaCheckCircle className="text-success me-2" size={14} />
                                      <span className="small">{itinerary.itineraryHeading || "Untitled"}</span>
                                    </div>
                                    <Button variant="link" size="sm" className="text-danger p-0 ms-2" style={{ fontSize: "0.75rem", minWidth: "auto" }} onClick={() => setSelectedItineraries(prev => ({ ...prev, day1: prev.day1.filter(id => id !== itineraryId) }))}>×</Button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <div className="itinerary-day-box mb-3">
                          <div className="d-flex justify-content-between align-items-center">
                            <h6 className="mb-0 fw-bold">Day 2:</h6>
                            <Button variant="outline-danger" size="sm" className="rounded-circle itinerary-plus-btn" onClick={() => handleOpenItineraryModal("day2")}>
                              <FaPlus />
                            </Button>
                          </div>
                          {selectedItineraries.day2.length > 0 && (
                            <div className="mt-3 pt-3 border-top">
                              {selectedItineraries.day2.map((itineraryId) => {
                                const itinerary = itineraryList.find(item => item.itineraryId === itineraryId);
                                if (!itinerary) return null;
                                return (
                                  <div key={itineraryId} className="d-flex justify-content-between align-items-center mb-2 itinerary-preview-item">
                                    <div className="d-flex align-items-center flex-grow-1">
                                      <FaCheckCircle className="text-success me-2" size={14} />
                                      <span className="small">{itinerary.itineraryHeading || "Untitled"}</span>
                                    </div>
                                    <Button variant="link" size="sm" className="text-danger p-0 ms-2" style={{ fontSize: "0.75rem", minWidth: "auto" }} onClick={() => setSelectedItineraries(prev => ({ ...prev, day2: prev.day2.filter(id => id !== itineraryId) }))}>×</Button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
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
                          const checkIn = hotel.checkIn || hotel.checkInDate || details.checkInDate || "";
                          const checkOut = hotel.checkOut || hotel.checkOutDate || details.checkOutDate || "";
                          const searchRoomDTOs = hotel.searchRoomDTOs || details.searchRoomDTOs || [];
                          const getDateRange = (startDate, endDate) => {
                            if (!startDate || !endDate) return [];
                            try {
                              let start, end;
                              if (startDate.includes("/")) { const [d, m, y] = startDate.split("/"); start = new Date(y, m - 1, d); } else { start = new Date(startDate); }
                              if (endDate.includes("/")) { const [d, m, y] = endDate.split("/"); end = new Date(y, m - 1, d); } else { end = new Date(endDate); }
                              const dates = []; const current = new Date(start);
                              while (current < end) { dates.push(new Date(current)); current.setDate(current.getDate() + 1); }
                              return dates;
                            } catch { return []; }
                          };
                          const dateRange = getDateRange(checkIn, checkOut);
                          const hotelTotalPrice = parseFloat(hotel.totalRateWithoutmrk || hotel.totalRate || 0);
                          const hotelSellingPrice = parseFloat(hotel.totalRate || 0);
                          const pricePerNight = dateRange.length > 0 ? hotelTotalPrice / dateRange.length : hotelTotalPrice;
                          let hotelIndexInCart = -1; let hotelCount = 0;
                          for (let i = 0; i < cartData.length; i++) { if (cartData[i].hotel) { if (hotelCount === hotelIndex) { hotelIndexInCart = i; break; } hotelCount++; } }
                          const actualHotelIndex = hotelIndexInCart >= 0 ? hotelIndexInCart : hotelIndex;

                          return (
                            <Card key={hotelIndex} className="mb-3 hotel-item-card">
                              <Card.Header className="hotel-section-header">
                                <div className="d-flex align-items-center gap-2">
                                  <FaBed className="text-primary" size={20} />
                                  <h6 className="mb-0 fw-bold">{hotels.length > 1 ? `Hotel ${hotelIndex + 1}: ` : ""}{hotel.hotelName || "Hotel"}</h6>
                                </div>
                              </Card.Header>
                              <Card.Body>
                                <div className="date-display">
                                  <FaCalendarAlt className="text-primary me-2" />
                                  <strong>Checkin :</strong> {formatDate(checkIn)} <strong className="ms-3">Checkout :</strong> {formatDate(checkOut)}
                                </div>
                                {searchRoomDTOs.length > 0 && (
                                  <>
                                    <Table striped bordered hover responsive size="sm" className="mb-3 room-table">
                                      <thead>
                                        <tr><th>No.</th><th>Room Category</th><th>Adult Count</th><th>Child Count</th></tr>
                                      </thead>
                                      <tbody>
                                        {searchRoomDTOs.map((room, roomIndex) => {
                                          let childAges = [];
                                          if (room.childAge) childAges = Array.isArray(room.childAge) ? room.childAge : [room.childAge];
                                          else if (room.childAges) childAges = Array.isArray(room.childAges) ? room.childAges : [room.childAges];
                                          const childCount = parseInt(room.child || room.children || 0);
                                          return (
                                            <tr key={roomIndex}>
                                              <td>{roomIndex + 1}</td>
                                              <td>{hotel.roomCategory || "-"}{hotel.roomType && ` - ${hotel.roomType}`}</td>
                                              <td>{room.adult || room.adults || "-"}</td>
                                              <td>
                                                {childCount > 0 ? (<>{childCount}{childAges.length > 0 && childAges.length === 1 && (<small className="text-muted d-block mt-1">{childCount} Child : {childAges[0]} Age</small>)}{childAges.length > 1 && (<small className="text-muted d-block mt-1">{childAges.map((age, idx) => (<span key={idx}>{idx + 1} Child : {age} Age{idx < childAges.length - 1 ? ", " : ""}</span>))}</small>)}</>) : "-"}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </Table>
                                    {searchRoomDTOs.map((room, roomIndex) => {
                                      const adults = parseInt(room.adult || room.adults || 1);
                                      const children = parseInt(room.child || room.children || 0);
                                      const totalGuests = adults + children;
                                      const guestKey = actualHotelIndex >= 0 ? `${actualHotelIndex}-${roomIndex}` : `${hotelIndex}-${roomIndex}`;
                                      const guests = roomGuests[guestKey] || [];
                                      if (totalGuests === 0) return null;
                                      return (
                                        <Card key={`guest-${roomIndex}`} className="mb-2 guest-details-card">
                                          <Card.Header><h6 className="mb-0">Room {roomIndex + 1} - Guest Details</h6></Card.Header>
                                          <Card.Body>
                                            {Array.from({ length: totalGuests }, (_, guestIndex) => {
                                              const isChild = guestIndex >= adults;
                                              const guest = guests[guestIndex] || { salutation: "", firstName: "", lastName: "", gender: "", isChild, };
                                              return (
                                                <div key={guestIndex} className="guest-row-item">
                                                  <h6 className="mb-2">{isChild ? `Child ${guestIndex - adults + 1}${guest.age ? ` (Age: ${guest.age})` : ""}` : `Adult ${guestIndex + 1}`}</h6>
                                                  <Row className="g-2">
                                                    <Col md={3}>
                                                      <Form.Label className="small">Salutation <span className="text-danger">*</span></Form.Label>
                                                      <Form.Select size="sm" value={guest.salutation} onChange={(e) => handleGuestChange(actualHotelIndex, roomIndex, guestIndex, "salutation", e.target.value)} required isInvalid={!!validationErrors[`hotel_${actualHotelIndex}_room_${roomIndex}_guest_${guestIndex}_salutation`]}>
                                                        <option value="">Select</option><option value="Mr">Mr</option><option value="Mrs">Mrs</option><option value="Ms">Ms</option><option value="Miss">Miss</option><option value="Dr">Dr</option>
                                                      </Form.Select>
                                                      <Form.Control.Feedback type="invalid">{validationErrors[`hotel_${actualHotelIndex}_room_${roomIndex}_guest_${guestIndex}_salutation`]}</Form.Control.Feedback>
                                                    </Col>
                                                    <Col md={4}>
                                                      <Form.Label className="small">First Name <span className="text-danger">*</span></Form.Label>
                                                      <Form.Control type="text" size="sm" value={guest.firstName || ""} onChange={(e) => handleGuestChange(actualHotelIndex, roomIndex, guestIndex, "firstName", e.target.value)} required placeholder="First Name" isInvalid={!!validationErrors[`hotel_${actualHotelIndex}_room_${roomIndex}_guest_${guestIndex}_firstName`]} />
                                                      <Form.Control.Feedback type="invalid">{validationErrors[`hotel_${actualHotelIndex}_room_${roomIndex}_guest_${guestIndex}_firstName`]}</Form.Control.Feedback>
                                                    </Col>
                                                    <Col md={5}>
                                                      <Form.Label className="small">Last Name <span className="text-danger">*</span></Form.Label>
                                                      <Form.Control type="text" size="sm" value={guest.lastName || ""} onChange={(e) => handleGuestChange(actualHotelIndex, roomIndex, guestIndex, "lastName", e.target.value)} required placeholder="Last Name" isInvalid={!!validationErrors[`hotel_${actualHotelIndex}_room_${roomIndex}_guest_${guestIndex}_lastName`]} />
                                                      <Form.Control.Feedback type="invalid">{validationErrors[`hotel_${actualHotelIndex}_room_${roomIndex}_guest_${guestIndex}_lastName`]}</Form.Control.Feedback>
                                                    </Col>
                                                    <Col md={4}>
                                                      <Form.Label className="small">Gender <span className="text-danger">*</span></Form.Label>
                                                      <Form.Select size="sm" value={guest.gender || ""} onChange={(e) => handleGuestChange(actualHotelIndex, roomIndex, guestIndex, "gender", e.target.value)} required isInvalid={!!validationErrors[`hotel_${actualHotelIndex}_room_${roomIndex}_guest_${guestIndex}_gender`]}>
                                                        <option value="">Select</option><option value="Male">Male</option><option value="Female">Female</option>
                                                      </Form.Select>
                                                      <Form.Control.Feedback type="invalid">{validationErrors[`hotel_${actualHotelIndex}_room_${roomIndex}_guest_${guestIndex}_gender`]}</Form.Control.Feedback>
                                                    </Col>
                                                  </Row>
                                                </div>
                                              );
                                            })}
                                          </Card.Body>
                                        </Card>
                                      );
                                    })}
                                  </>
                                )}
                                {dateRange.length > 0 && (
                                  <Table striped bordered hover responsive size="sm" className="mb-2 date-pricing-table">
                                    <thead><tr><th>Date</th><th>Total Price</th><th>Selling Price</th></tr></thead>
                                    <tbody>
                                      {dateRange.map((date, dateIndex) => (
                                        <tr key={dateIndex}><td>{date.toLocaleDateString("en-GB")}</td><td>{pricePerNight.toFixed(2)}</td><td>{pricePerNight.toFixed(2)}</td></tr>
                                      ))}
                                    </tbody>
                                  </Table>
                                )}
                                <Row className="mb-2">
                                  <Col md={6}>
                                    <Form.Label>Tourism Dirhams (AED)</Form.Label>
                                    <Form.Control type="number" value={hotelTourismDirhams[hotelIndex] || "0"} onChange={(e) => setHotelTourismDirhams({ ...hotelTourismDirhams, [hotelIndex]: e.target.value })} min="0" />
                                  </Col>
                                </Row>
                                <Row className="mb-2">
                                  <Col>
                                    <Form.Label>Remarks</Form.Label>
                                    <Form.Control as="textarea" rows={3} value={hotelRemarks[hotelIndex] || ""} onChange={(e) => setHotelRemarks({ ...hotelRemarks, [hotelIndex]: e.target.value })} placeholder="Enter any remarks..." />
                                  </Col>
                                </Row>
                                <Row className="mb-2">
                                  <Col>
                                    <Form.Label>Special Request</Form.Label>
                                    <Form.Control as="textarea" rows={3} value={hotelSpecialRequests[hotelIndex] || ""} onChange={(e) => setHotelSpecialRequests({ ...hotelSpecialRequests, [hotelIndex]: e.target.value })} placeholder="Enter any special requests..." />
                                  </Col>
                                </Row>
                                <div className="mb-3">
                                  <Form.Label className="mb-2">Are you sure to continue booking?</Form.Label>
                                  <div>
                                    <Form.Check type="radio" label="Book & Voucher" name={`bookingConfirmation-${hotelIndex}`} value="Book & Voucher" checked={hotelBookingConfirmation[hotelIndex] === "Book & Voucher"} onChange={(e) => setHotelBookingConfirmation({ ...hotelBookingConfirmation, [hotelIndex]: e.target.value })} inline className="me-3" />
                                    <Form.Check type="radio" label="Book Now & Voucher later" name={`bookingConfirmation-${hotelIndex}`} value="Book Now & Voucher later" checked={hotelBookingConfirmation[hotelIndex] === "Book Now & Voucher later"} onChange={(e) => setHotelBookingConfirmation({ ...hotelBookingConfirmation, [hotelIndex]: e.target.value })} inline />
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
                      <Accordion.Header><h5 className="mb-0 fw-bold">Tour option</h5></Accordion.Header>
                      <Accordion.Body>
                        {activities.map((item, activityIndex) => {
                          const activity = item.activity || {};
                          const details = activity.details || {};
                          const activityName = activity.activityName || details.activityName || "Activity";
                          const activityDate = activity.activityDate || details.activityDate || "";
                          const adult = activity.adult || details.adult || activity.noOfAdult || "0";
                          const child = activity.child || details.child || activity.noOfChild || "0";
                          let childAges = [];
                          if (activity.childAge) childAges = Array.isArray(activity.childAge) ? activity.childAge : [activity.childAge];
                          const sellingPrice = parseFloat(activity.totalRate || 0);
                          const totalPrice = parseFloat(activity.totalRateWithoutmrk || activity.totalRate || 0);
                          return (
                            <Card key={activityIndex} className="mb-3 activity-item-card">
                              <Card.Header className="activity-header">
                                <div className="d-flex align-items-center gap-2">
                                  <FaTicketAlt className="text-primary" size={20} />
                                  <h6 className="mb-0 fw-bold">{activities.length > 1 ? `Activity ${activityIndex + 1}: ` : ""}{activityName}</h6>
                                </div>
                              </Card.Header>
                              <Card.Body>
                                <div className="date-display"><FaCalendarAlt className="text-primary me-2" /><strong>Tour date:</strong> {formatDate(activityDate)}</div>
                                <Row className="g-3 mb-3">
                                  <Col md={6}><div><strong>Adult Count</strong><div className="mt-1"><Form.Control type="text" value={adult} readOnly className="bg-light" /></div></div></Col>
                                  <Col md={6}><div><strong>Child Count</strong><div className="mt-1"><Form.Control type="text" value={child} readOnly className="bg-light" /></div>{childAges.length > 0 && childAges.length === 1 && (<small className="text-muted d-block mt-1">{child} Child : {childAges[0]} Age</small>)}{childAges.length > 1 && (<small className="text-muted d-block mt-1">{childAges.map((age, idx) => (<span key={idx}>{idx + 1} Child : {age} Age{idx < childAges.length - 1 ? ", " : ""}</span>))}</small>)}</div></Col>
                                </Row>
                                <Row className="g-3 mb-3">
                                  <Col md={6}><div className="d-flex align-items-center justify-content-between"><strong>Selling Price</strong><div className="d-flex align-items-center gap-2"><span className="text-success fw-bold">{sellingPrice.toFixed(2)}</span></div></div></Col>
                                  <Col md={6}><div className="d-flex align-items-center justify-content-between"><strong>Total Price</strong><div className="d-flex align-items-center gap-2"><span className="text-primary fw-bold">{totalPrice.toFixed(2)}</span></div></div></Col>
                                </Row>
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
                      <Accordion.Header><h5 className="mb-0 fw-bold">Transfer option</h5></Accordion.Header>
                      <Accordion.Body>
                        {transfers.map((item, transferIndex) => {
                          const cab = item.cab || {};
                          const details = cab.details || {};
                          const vehicleName = cab.vehicleName || details.vehicleName || "Transfer";
                          const capacity = cab.capacity || details.capacity || "";
                          const pickupDate = cab.pickupDate || "";
                          const dropDate = cab.dropoffDate || "";
                          const adult = cab.adult || details.adult || cab.noOfAdult || "0";
                          const child = cab.child || details.child || cab.noOfChild || "0";
                          const travelType = cab.travelType || details.travelType || "1";
                          const shareType = cab.shareType || details.shareType || "Private";
                          let childAges = [];
                          if (cab.childAge) childAges = Array.isArray(cab.childAge) ? cab.childAge : [cab.childAge];
                          else if (cab.childAges) childAges = Array.isArray(cab.childAges) ? cab.childAges : [cab.childAges];
                          else if (cab.childAgeArray) childAges = Array.isArray(cab.childAgeArray) ? cab.childAgeArray : [cab.childAgeArray];
                          else if (details.childAge) childAges = Array.isArray(details.childAge) ? details.childAge : [details.childAge];
                          else if (details.childAgeArray) childAges = Array.isArray(details.childAgeArray) ? details.childAgeArray : [details.childAgeArray];
                          const transferDetail = transferDetails[transferIndex] || {};
                          const sellingPrice = parseFloat(cab.totalRate || 0);
                          const totalPrice = parseFloat(cab.totalRateWithoutmrk || cab.totalRate || 0);
                          const getTravelTypeLabel = (type) => { if (type === "1") return "Arrival & Departure"; if (type === "2") return "Arrival"; if (type === "3") return "Departure"; return type; };
                          return (
                            <Card key={transferIndex} className="mb-3 transfer-item-card">
                              <Card.Header className="transfer-header">
                                <div className="d-flex align-items-center gap-2">
                                  <FaCar className="text-primary" size={20} />
                                  <h6 className="mb-0 fw-bold">{transfers.length > 1 ? `Transfer ${transferIndex + 1}: ` : ""}{capacity ? `${capacity} Seater` : vehicleName}</h6>
                                </div>
                              </Card.Header>
                              <Card.Body>
                                <div className="date-display"><FaCalendarAlt className="text-primary me-2" /><strong>Pickup date :</strong> {formatDate(pickupDate)} <strong className="ms-3">Drop date :</strong> {formatDate(dropDate)}</div>
                                <Table striped bordered hover responsive size="sm" className="mb-3 transfer-table">
                                  <thead><tr><th>Transfer Option/Share type</th><th>Adult Count</th><th>Child Count</th></tr></thead>
                                  <tbody>
                                    <tr>
                                      <td>{getTravelTypeLabel(travelType)} / {shareType}</td>
                                      <td>{adult}</td>
                                      <td>{child}{childAges.length > 0 && childAges.length === 1 && (<small className="text-muted d-block">{child} Child : {childAges[0]} Age</small>)}{childAges.length > 1 && (<small className="text-muted d-block">{childAges.map((age, idx) => (<span key={idx}>{idx + 1} Child : {age} Age{idx < childAges.length - 1 ? ", " : ""}</span>))}</small>)}</td>
                                    </tr>
                                  </tbody>
                                </Table>
                                <Row className="g-3">
                                  <Col md={6}><div className="d-flex align-items-center justify-content-between"><strong>Selling Price</strong><div className="d-flex align-items-center gap-2"><span className="text-success fw-bold">{sellingPrice.toFixed(2)}</span><FaEdit className="text-success edit-icon" /></div></div></Col>
                                  <Col md={6}><div className="d-flex align-items-center justify-content-between"><strong>Total Price</strong><div className="d-flex align-items-center gap-2"><span className="text-primary fw-bold">{totalPrice.toFixed(2)}</span><FaEdit className="text-success edit-icon" /></div></div></Col>
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
                    <Accordion.Header><h5 className="mb-0 fw-bold">Visa Information</h5></Accordion.Header>
                    <Accordion.Body>
                      <Form.Check type="checkbox" label="Visa Required" checked={visaRequired} onChange={(e) => setVisaRequired(e.target.checked)} className="mb-2" />
                      {visaRequired && (
                        <div className="visa-section">
                          <h6 className="mb-3 fw-bold text-warning">Visa Details</h6>
                          <Row className="g-3 visa-form-row">
                            <Col md={6}><Form.Label>Visa Adult</Form.Label><Form.Control type="number" value={visaDetails.visaAdult} onChange={(e) => setVisaDetails({ ...visaDetails, visaAdult: e.target.value })} min="0" /></Col>
                            <Col md={6}><Form.Label>Visa Adult Rate</Form.Label><Form.Control type="number" value={visaDetails.visaAdultRate} onChange={(e) => setVisaDetails({ ...visaDetails, visaAdultRate: e.target.value })} min="0" step="0.01" /></Col>
                            <Col md={6}><Form.Label>Visa Child</Form.Label><Form.Control type="number" value={visaDetails.visaChild} onChange={(e) => setVisaDetails({ ...visaDetails, visaChild: e.target.value })} min="0" /></Col>
                            <Col md={6}><Form.Label>Visa Child Rate</Form.Label><Form.Control type="number" value={visaDetails.visaChildRate} onChange={(e) => setVisaDetails({ ...visaDetails, visaChildRate: e.target.value })} min="0" step="0.01" /></Col>
                            <Col md={6}><Form.Label>Visa Infant</Form.Label><Form.Control type="number" value={visaDetails.visaInfant} onChange={(e) => setVisaDetails({ ...visaDetails, visaInfant: e.target.value })} min="0" /></Col>
                            <Col md={6}><Form.Label>Visa Infant Rate</Form.Label><Form.Control type="number" value={visaDetails.visaInfantRate} onChange={(e) => setVisaDetails({ ...visaDetails, visaInfantRate: e.target.value })} min="0" step="0.01" /></Col>
                          </Row>
                        </div>
                      )}
                    </Accordion.Body>
                  </Accordion.Item>

                  {/* Guest Details Section */}
                  {/* FIX 2: Removed broken onClick from Accordion.Header that was calling
                      e.preventDefault() + e.stopPropagation(), which disrupted Bootstrap's
                      accordion state machine and caused all panels to appear collapsed */}
                  <Accordion.Item eventKey="5" className="mb-2">
                    <Accordion.Header>
                      <h5 className="mb-0 fw-bold">Guest Details</h5>
                    </Accordion.Header>
                    <Accordion.Body>
                      <Form className="booking-form">
                        <Row className="g-2">
                          <Col md={3}>
                            <Form.Label>Title <span className="text-danger">*</span></Form.Label>
                            <Form.Select value={primaryGuest.salutation} onChange={(e) => handlePrimaryGuestChange("salutation", e.target.value)} isInvalid={!!validationErrors.primaryGuest_salutation} required>
                              <option value="">Select</option><option value="Mr">Mr</option><option value="Mrs">Mrs</option><option value="Ms">Ms</option><option value="Dr">Dr</option>
                            </Form.Select>
                            <Form.Control.Feedback type="invalid">{validationErrors.primaryGuest_salutation}</Form.Control.Feedback>
                          </Col>
                          <Col md={4}>
                            <Form.Label>First Name <span className="text-danger">*</span></Form.Label>
                            <Form.Control type="text" value={primaryGuest.firstName} onChange={(e) => handlePrimaryGuestChange("firstName", e.target.value)} isInvalid={!!validationErrors.primaryGuest_firstName} required />
                            <Form.Control.Feedback type="invalid">{validationErrors.primaryGuest_firstName}</Form.Control.Feedback>
                          </Col>
                          <Col md={5}>
                            <Form.Label>Middle Name</Form.Label>
                            <Form.Control type="text" value={primaryGuest.middleName} onChange={(e) => setPrimaryGuest({ ...primaryGuest, middleName: e.target.value })} />
                          </Col>
                          <Col md={4}>
                            <Form.Label>Last Name <span className="text-danger">*</span></Form.Label>
                            <Form.Control type="text" value={primaryGuest.lastName} onChange={(e) => handlePrimaryGuestChange("lastName", e.target.value)} isInvalid={!!validationErrors.primaryGuest_lastName} required />
                            <Form.Control.Feedback type="invalid">{validationErrors.primaryGuest_lastName}</Form.Control.Feedback>
                          </Col>
                          <Col md={4}>
                            <Form.Label>Contact Number <span className="text-danger">*</span></Form.Label>
                            <Form.Control type="tel" value={primaryGuest.contactNumber} onChange={(e) => handlePrimaryGuestChange("contactNumber", e.target.value)} isInvalid={!!validationErrors.primaryGuest_contactNumber} required />
                            <Form.Control.Feedback type="invalid">{validationErrors.primaryGuest_contactNumber}</Form.Control.Feedback>
                          </Col>
                          <Col md={4}>
                            <Form.Label>Email Id <span className="text-danger">*</span></Form.Label>
                            <Form.Control type="email" value={primaryGuest.emailId} onChange={(e) => handlePrimaryGuestChange("emailId", e.target.value)} isInvalid={!!validationErrors.primaryGuest_emailId} required />
                            <Form.Control.Feedback type="invalid">{validationErrors.primaryGuest_emailId}</Form.Control.Feedback>
                          </Col>
                          <Col md={4}>
                            <Form.Label>Passport Number</Form.Label>
                            <Form.Control type="text" value={primaryGuest.passportNumber} onChange={(e) => setPrimaryGuest({ ...primaryGuest, passportNumber: e.target.value })} />
                          </Col>
                          <Col md={4}>
                            <Form.Label>LPO <span className="text-danger">*</span></Form.Label>
                            <Form.Control type="text" value={primaryGuest.lpo} onChange={(e) => handlePrimaryGuestChange("lpo", e.target.value)} isInvalid={!!validationErrors.primaryGuest_lpo} required />
                            <Form.Control.Feedback type="invalid">{validationErrors.primaryGuest_lpo}</Form.Control.Feedback>
                          </Col>
                        </Row>
                      </Form>
                    </Accordion.Body>
                  </Accordion.Item>
                </Accordion>
              </Col>
            </Row>

            <Row className="mt-4">
              <Col lg={12}>
                <div className="d-flex gap-2 justify-content-end">
                  <Button type="button" variant="danger" size="lg" className="btn-booking btn-booking-danger" onClick={() => navigate(-1)}>Cancel</Button>
                  <Button type="button" variant="primary" size="lg" className="btn-booking btn-booking-primary" onClick={handleSubmit}>
                    <FaCheckCircle className="me-2" />Book
                  </Button>
                </div>
              </Col>
            </Row>
          </Container>
        </main>
      </div>

      {/* Order Summary Modal */}
      <Modal show={showOrderSummaryModal} onHide={() => !isSubmitting && setShowOrderSummaryModal(false)} size="lg" centered backdrop="static" keyboard={false} className="order-summary-modal">
        <Modal.Header closeButton={!isSubmitting} style={{ borderBottom: "2px solid #e9ecef", padding: "1.25rem 1.5rem" }}>
          <Modal.Title className="d-flex align-items-center" style={{ fontSize: "1.5rem", fontWeight: "600" }}>
            <div className="d-flex align-items-center justify-content-center me-3" style={{ width: "48px", height: "48px", borderRadius: "12px", backgroundColor: "#e7f5ff", color: "#0d6efd" }}>
              <FaCheckCircle size={24} />
            </div>
            <div>
              <div style={{ fontSize: "1.5rem", fontWeight: "600", color: "#212529" }}>Order Summary</div>
              <div style={{ fontSize: "0.875rem", color: "#6c757d", fontWeight: "400" }}>Please review your booking details</div>
            </div>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ maxHeight: "70vh", overflowY: "auto", padding: "1.5rem" }}>
          <div className="order-summary">
            <div className="mb-4">
              <div className="d-flex align-items-center mb-3"><FaUsers className="me-2 text-primary" size={18} /><h6 className="mb-0 fw-bold" style={{ fontSize: "1rem", color: "#212529" }}>Guest Information</h6></div>
              <div className="p-3 rounded" style={{ backgroundColor: "#f8f9fa", border: "1px solid #e9ecef" }}>
                <Row className="g-3">
                  <Col md={6}>
                    <div className="mb-2"><small className="text-muted d-block mb-1" style={{ fontSize: "0.75rem", fontWeight: "500" }}>Full Name</small><div style={{ fontSize: "0.9375rem", fontWeight: "500", color: "#212529" }}>{primaryGuest.salutation} {primaryGuest.firstName} {primaryGuest.lastName}</div></div>
                    <div className="mb-2"><small className="text-muted d-block mb-1" style={{ fontSize: "0.75rem", fontWeight: "500" }}>Email Address</small><div style={{ fontSize: "0.9375rem", color: "#495057" }}>{primaryGuest.emailId}</div></div>
                  </Col>
                  <Col md={6}>
                    <div className="mb-2"><small className="text-muted d-block mb-1" style={{ fontSize: "0.75rem", fontWeight: "500" }}>Contact Number</small><div style={{ fontSize: "0.9375rem", color: "#495057" }}>{primaryGuest.contactNumber}</div></div>
                    <div className="mb-2"><small className="text-muted d-block mb-1" style={{ fontSize: "0.75rem", fontWeight: "500" }}>LPO Number</small><div style={{ fontSize: "0.9375rem", color: "#495057" }}>{primaryGuest.lpo || "N/A"}</div></div>
                  </Col>
                  {primaryGuest.passportNumber && (<Col md={12}><div><small className="text-muted d-block mb-1" style={{ fontSize: "0.75rem", fontWeight: "500" }}>Passport Number</small><div style={{ fontSize: "0.9375rem", color: "#495057" }}>{primaryGuest.passportNumber}</div></div></Col>)}
                </Row>
              </div>
            </div>
            <div className="mb-4">
              <h6 className="mb-3 fw-bold" style={{ fontSize: "1rem", color: "#212529" }}>Booking Details</h6>
              {hotels.length > 0 && (
                <div className="mb-3 p-3 rounded" style={{ backgroundColor: "#fff", border: "1px solid #e9ecef", borderLeft: "4px solid #0dcaf0" }}>
                  <div className="d-flex align-items-center justify-content-between mb-2"><div className="d-flex align-items-center"><FaHotel className="me-2 text-info" size={18} /><strong style={{ fontSize: "0.9375rem" }}>Accommodation</strong></div><Badge bg="info">{hotels.length} {hotels.length === 1 ? 'Hotel' : 'Hotels'}</Badge></div>
                  {hotels.map((item, idx) => {
                    const hotel = item.hotel || {};
                    const checkIn = hotel.checkIn || hotel.checkInDate || "";
                    const checkOut = hotel.checkOut || hotel.checkOutDate || "";
                    return (
                      <div key={idx} className={idx > 0 ? "mt-3 pt-3 border-top" : ""}>
                        <div className="mb-2"><strong style={{ fontSize: "0.9375rem", color: "#212529" }}>{hotel.hotelName || "Hotel"}</strong></div>
                        <div className="d-flex flex-wrap gap-3 mb-2" style={{ fontSize: "0.8125rem", color: "#6c757d" }}><span><FaCalendarAlt className="me-1" />Check-in: {formatDate(checkIn)}</span><span><FaCalendarAlt className="me-1" />Check-out: {formatDate(checkOut)}</span></div>
                        <div className="d-flex justify-content-between align-items-center"><span style={{ fontSize: "0.8125rem", color: "#6c757d" }}>Selling Price</span><strong style={{ fontSize: "0.9375rem", color: "#198754" }}>AED {parseFloat(hotel.totalRate || 0).toFixed(2)}</strong></div>
                        <div className="d-flex justify-content-between align-items-center"><span style={{ fontSize: "0.8125rem", color: "#6c757d" }}>Total Price</span><strong style={{ fontSize: "0.9375rem", color: "#0d6efd" }}>AED {parseFloat(hotel.totalRateWithoutmrk || hotel.totalRate || 0).toFixed(2)}</strong></div>
                      </div>
                    );
                  })}
                </div>
              )}
              {activities.length > 0 && (
                <div className="mb-3 p-3 rounded" style={{ backgroundColor: "#fff", border: "1px solid #e9ecef", borderLeft: "4px solid #198754" }}>
                  <div className="d-flex align-items-center justify-content-between mb-2"><div className="d-flex align-items-center"><FaTicketAlt className="me-2 text-success" size={18} /><strong style={{ fontSize: "0.9375rem" }}>Tours & Activities</strong></div><Badge bg="success">{activities.length} {activities.length === 1 ? 'Activity' : 'Activities'}</Badge></div>
                  {activities.map((item, idx) => {
                    const activity = item.activity || {};
                    return (
                      <div key={idx} className={idx > 0 ? "mt-3 pt-3 border-top" : ""}>
                        <div className="mb-2"><strong style={{ fontSize: "0.9375rem", color: "#212529" }}>{activity.activityName || "Activity"}</strong></div>
                        <div className="d-flex flex-wrap gap-3 mb-2" style={{ fontSize: "0.8125rem", color: "#6c757d" }}><span><FaCalendarAlt className="me-1" />Date: {formatDate(activity.activityDate || "")}</span><span><FaUsers className="me-1" />Adults: {activity.adult || 0} | Children: {activity.child || 0}</span></div>
                        <div className="d-flex justify-content-between align-items-center"><span style={{ fontSize: "0.8125rem", color: "#6c757d" }}>Selling Price</span><strong style={{ fontSize: "0.9375rem", color: "#198754" }}>AED {parseFloat(activity.totalRate || 0).toFixed(2)}</strong></div>
                        <div className="d-flex justify-content-between align-items-center"><span style={{ fontSize: "0.8125rem", color: "#6c757d" }}>Total Price</span><strong style={{ fontSize: "0.9375rem", color: "#0d6efd" }}>AED {parseFloat(activity.totalRateWithoutmrk || activity.totalRate || 0).toFixed(2)}</strong></div>
                      </div>
                    );
                  })}
                </div>
              )}
              {transfers.length > 0 && (
                <div className="mb-3 p-3 rounded" style={{ backgroundColor: "#fff", border: "1px solid #e9ecef", borderLeft: "4px solid #ffc107" }}>
                  <div className="d-flex align-items-center justify-content-between mb-2"><div className="d-flex align-items-center"><FaCar className="me-2 text-warning" size={18} /><strong style={{ fontSize: "0.9375rem" }}>Transfers</strong></div><Badge bg="warning" text="dark">{transfers.length} {transfers.length === 1 ? 'Transfer' : 'Transfers'}</Badge></div>
                  {transfers.map((item, idx) => {
                    const cab = item.cab || {};
                    return (
                      <div key={idx} className={idx > 0 ? "mt-3 pt-3 border-top" : ""}>
                        <div className="mb-2"><strong style={{ fontSize: "0.9375rem", color: "#212529" }}>{cab.cabName || "Transfer"}</strong></div>
                        <div className="d-flex flex-wrap gap-3 mb-2" style={{ fontSize: "0.8125rem", color: "#6c757d" }}><span><FaCalendarAlt className="me-1" />Pickup: {formatDate(cab.pickupDate || "")}</span><span><FaCalendarAlt className="me-1" />Dropoff: {formatDate(cab.dropoffDate || "")}</span></div>
                        <div className="d-flex justify-content-between align-items-center"><span style={{ fontSize: "0.8125rem", color: "#6c757d" }}>Selling Price</span><strong style={{ fontSize: "0.9375rem", color: "#198754" }}>AED {parseFloat(cab.totalRate || 0).toFixed(2)}</strong></div>
                        <div className="d-flex justify-content-between align-items-center"><span style={{ fontSize: "0.8125rem", color: "#6c757d" }}>Total Price</span><strong style={{ fontSize: "0.9375rem", color: "#0d6efd" }}>AED {parseFloat(cab.totalRateWithoutmrk || cab.totalRate || 0).toFixed(2)}</strong></div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="p-4 rounded" style={{ backgroundColor: "#f8f9fa", border: "2px solid #0d6efd" }}>
              <h6 className="mb-3 fw-bold" style={{ fontSize: "1rem", color: "#212529" }}>Price Summary</h6>
              <div className="mb-3">
                <div className="d-flex justify-content-between align-items-center mb-2"><span style={{ fontSize: "0.9375rem", color: "#495057" }}>Subtotal (Selling Price)</span><strong style={{ fontSize: "1.125rem", color: "#198754" }}>AED {sellingPrice.toFixed(2)}</strong></div>
                <div className="d-flex justify-content-between align-items-center"><span style={{ fontSize: "0.9375rem", color: "#495057" }}>Subtotal (Without Markup)</span><strong style={{ fontSize: "1.125rem", color: "#0d6efd" }}>AED {totalPrice.toFixed(2)}</strong></div>
              </div>
              {visaRequired && (
                <div className="pt-3 mt-3 border-top">
                  <h6 className="mb-2 fw-semibold" style={{ fontSize: "0.875rem", color: "#495057" }}>Visa Charges</h6>
                  {parseInt(visaDetails.visaAdult || "0") > 0 && (<div className="d-flex justify-content-between mb-1" style={{ fontSize: "0.8125rem" }}><span className="text-muted">Adults ({visaDetails.visaAdult})</span><span>AED {parseFloat(visaDetails.visaAdultRate || "0").toFixed(2)}</span></div>)}
                  {parseInt(visaDetails.visaChild || "0") > 0 && (<div className="d-flex justify-content-between mb-1" style={{ fontSize: "0.8125rem" }}><span className="text-muted">Children ({visaDetails.visaChild})</span><span>AED {parseFloat(visaDetails.visaChildRate || "0").toFixed(2)}</span></div>)}
                  {parseInt(visaDetails.visaInfant || "0") > 0 && (<div className="d-flex justify-content-between" style={{ fontSize: "0.8125rem" }}><span className="text-muted">Infants ({visaDetails.visaInfant})</span><span>AED {parseFloat(visaDetails.visaInfantRate || "0").toFixed(2)}</span></div>)}
                </div>
              )}
              <div className="mt-3 pt-3 border-top d-flex justify-content-between align-items-center">
                <span className="fw-bold" style={{ fontSize: "1.125rem", color: "#212529" }}>Total Amount</span>
                <span className="fw-bold" style={{ fontSize: "1.5rem", color: "#0d6efd" }}>AED {sellingPrice.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer style={{ borderTop: "2px solid #e9ecef", padding: "1.25rem 1.5rem", justifyContent: "space-between" }}>
          <Button variant="outline-secondary" onClick={() => setShowOrderSummaryModal(false)} disabled={isSubmitting} style={{ minWidth: "120px", fontWeight: "500" }}>Cancel</Button>
          <Button variant="primary" onClick={confirmQuotation} disabled={isSubmitting} style={{ minWidth: "160px", fontWeight: "600", fontSize: "1rem" }}>
            {isSubmitting ? (<><Spinner animation="border" size="sm" className="me-2" />Processing...</>) : (<><FaCheckCircle className="me-2" />Save Quotation</>)}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Itinerary Modal */}
      <Modal show={showItineraryModal} onHide={handleCloseItineraryModal} size="lg" centered className="itinerary-modal">
        <Modal.Header closeButton className="itinerary-modal-header" style={{ background: "linear-gradient(135deg, #0d6efd 0%, #0056b3 100%)", color: "white", border: "none", padding: "1.25rem 1.5rem" }}>
          <Modal.Title className="fw-bold d-flex align-items-center gap-2">
            <FaRoute />Detailed Itinerary
            {currentDay && (<Badge bg="light" text="dark" className="ms-2">{currentDay === "day1" ? "Day 1" : "Day 2"}</Badge>)}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ maxHeight: "70vh", overflowY: "auto", padding: "1.5rem" }}>
          <Form.Group className="mb-4">
            <div className="position-relative">
              <Form.Control type="text" placeholder="Search by terms (Type atleast 4 letters)" value={itinerarySearchTerm} onChange={(e) => setItinerarySearchTerm(e.target.value)} className="itinerary-search-input" style={{ padding: "0.875rem 1rem 0.875rem 2.75rem", borderRadius: "8px", border: "2px solid #dee2e6", fontSize: "0.9rem" }} />
              <FaClock className="position-absolute" style={{ left: "1rem", top: "50%", transform: "translateY(-50%)", color: "#6c757d", fontSize: "0.9rem" }} />
            </div>
            {itinerarySearchTerm.trim().length > 0 && itinerarySearchTerm.trim().length < 4 && (<small className="text-muted mt-2 d-block"><FaClock className="me-1" />Type at least 4 letters to search</small>)}
          </Form.Group>
          {loadingItinerary ? (
            <div className="text-center py-5"><Spinner animation="border" size="sm" variant="primary" /><p className="mt-2 text-muted small">Loading itinerary details...</p></div>
          ) : filteredItineraryList.length > 0 ? (
            <div className="itinerary-modal-list">
              {filteredItineraryList.map((itinerary) => {
                const isSelected = currentDay && selectedItineraries[currentDay]?.includes(itinerary.itineraryId);
                const description = itinerary.itineraryDesc || "";
                const shortDesc = description.length > 100 ? description.substring(0, 100) + "..." : description;
                const showFullDesc = expandedDescriptions[itinerary.itineraryId] || false;
                return (
                  <div key={itinerary.itineraryId} className={`itinerary-modal-item mb-3 ${isSelected ? "itinerary-modal-item-selected" : ""}`} style={{ backgroundColor: isSelected ? "#e7f3ff" : "white", border: `2px solid ${isSelected ? "#0d6efd" : "#dee2e6"}`, borderRadius: "12px", padding: "1.25rem", transition: "all 0.3s ease", cursor: "pointer" }} onClick={() => handleItineraryToggle(itinerary.itineraryId)}>
                    <div className="d-flex align-items-start">
                      <Form.Check type="checkbox" id={`modal-itinerary-${itinerary.itineraryId}`} checked={isSelected || false} onChange={() => handleItineraryToggle(itinerary.itineraryId)} className="me-3 mt-1" style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()} />
                      <div className="flex-grow-1">
                        <div className="d-flex align-items-center gap-2 mb-2">
                          <h6 className="mb-0 fw-bold" style={{ color: isSelected ? "#0d6efd" : "#212529" }}>{itinerary.itineraryHeading || "Untitled"}</h6>
                          {isSelected && (<Badge bg="success" className="ms-auto"><FaCheckCircle className="me-1" />Selected</Badge>)}
                        </div>
                        <p className="mb-0 text-muted" style={{ fontSize: "0.875rem", lineHeight: "1.6" }}>
                          {showFullDesc ? description : shortDesc}
                          {description.length > 100 && (<button className="btn btn-link p-0 ms-2 text-primary" style={{ fontSize: "0.875rem", textDecoration: "none", fontWeight: "500" }} onClick={(e) => { e.stopPropagation(); setExpandedDescriptions(prev => ({ ...prev, [itinerary.itineraryId]: !showFullDesc })); }}>{showFullDesc ? "Show Less" : "Read More"}</button>)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : itinerarySearchTerm.trim().length > 0 && itinerarySearchTerm.trim().length < 4 ? (
            <div className="text-center py-5"><FaClock size={48} className="text-muted mb-3" /><p className="text-muted fw-semibold">Please type at least 4 letters to search</p></div>
          ) : (
            <div className="text-center py-5"><FaRoute size={48} className="text-muted mb-3" /><p className="text-muted fw-semibold">No itinerary details found.</p></div>
          )}
        </Modal.Body>
        <Modal.Footer style={{ borderTop: "2px solid #dee2e6", padding: "1rem 1.5rem" }}>
          <div className="d-flex justify-content-between align-items-center w-100">
            <small className="text-muted">{currentDay && selectedItineraries[currentDay]?.length > 0 && (<><FaCheckCircle className="text-success me-1" />{selectedItineraries[currentDay].length} item(s) selected</>)}</small>
            <Button variant="primary" onClick={handleCloseItineraryModal} style={{ minWidth: "120px" }}>Done</Button>
          </div>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default GenerateQuotationBooking;
