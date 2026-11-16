import React, { useEffect, useMemo, useState, useCallback } from "react";
import Select from "react-select";
import "../../styles/HotelRegModern.css";

import {
  Card,
  Button,
  Form,
  Row,
  Col,
  Tabs,
  Tab,
  Badge,
  Alert,
  Container,
  ProgressBar,
  Spinner,
  Modal,
  InputGroup,
} from "react-bootstrap";
import { useParams, useNavigate } from "react-router-dom";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import HotelTitleBadge from "../../components/HotelTitleBadge";
import axiosInstance from "../../components/AxiosInstance";
import { toast } from "react-hot-toast";
import {
  FaPlus,
  FaTrash,
  FaSave,
  FaHotel,
  FaMapMarkerAlt,
  FaPhone,
  FaUniversity,
  FaCalendarAlt,
  FaSwimmingPool,
  FaBed,
  FaFileContract,
  FaCheckCircle,
  FaExclamationTriangle,
  FaInfoCircle,
  FaArrowLeft,
} from "react-icons/fa";

const formatMarkupOption = (markup) => {
  if (!markup) return "";
  const value = markup.markup;
  if (value === null || value === undefined || String(value).trim() === "") {
    return markup.name || "";
  }
  const isPercent = String(markup.markupType || "").toLowerCase() === "percent";
  return `${markup.name || ""} - ${value}${isPercent ? "%" : ""}`;
};

const sortMarkupTypesByPercentage = (items = []) => {
  return [...items].sort((a, b) => {
    const aMarkup = Number(a?.markup);
    const bMarkup = Number(b?.markup);
    const aValue = Number.isFinite(aMarkup) ? aMarkup : Number.POSITIVE_INFINITY;
    const bValue = Number.isFinite(bMarkup) ? bMarkup : Number.POSITIVE_INFINITY;

    if (aValue !== bValue) return aValue - bValue;
    return String(a?.name || "").localeCompare(String(b?.name || ""));
  });
};

const tabOrder = [
  "hotel-info",
  "location-info",
  "contact-details",
  "bank-details",
  "week-days",
  "amenities",
  "rooms",
  "terms-conditions",
];


const HotelReg = () => {
  // Stepper state
  const [activeTab, setActiveTab] = useState(tabOrder[0]);
  const [masterAmenityIds, setMasterAmenityIds] = useState([]);  


  // Per-step validation logic
  const validateStep = (step) => {
    const errors = {};
    if (step === "hotel-info") {
      if (!formData.hotelName.trim())
        errors.hotelName = "Hotel name is required";
      if (!formData.hotelDescription.trim())
        errors.hotelDescription = "Hotel description is required";
      if (!formData.hotelCurrencyId)
        errors.hotelCurrencyId = "Currency is required";
      if (!formData.hotelCategoryId)
        errors.hotelCategoryId = "Hotel category is required";
      if (!formData.hotelTypeId) errors.hotelTypeId = "Hotel type is required";
      if (!formData.markupTypeId)
        errors.markupTypeId = "Markup type is required";
      if (!formData.childComAgeMin)
        errors.childComAgeMin = "Child complimentary age minimum is required";
      if (!formData.childComAgeMax)
        errors.childComAgeMax = "Child complimentary age maximum is required";
      if (!formData.childChargeableAgeMin)
        errors.childChargeableAgeMin =
          "Child chargeable age minimum is required";
      if (!formData.childChargeableAgeMax)
        errors.childChargeableAgeMax =
          "Child chargeable age maximum is required";
    }
    if (step === "location-info") {
      if (!formData.regionId) errors.regionId = "Region is required";
      if (!formData.countryId) errors.countryId = "Country is required";
      if (!formData.stateId) errors.stateId = "State/Province is required";
      if (!formData.placeId) errors.placeId = "City is required";
      if (!formData.address.trim()) errors.address = "Address is required";
      if (!formData.zipcode.trim()) errors.zipcode = "Zipcode is required";
    }
    if (step === "contact-details") {
      if (formData.contactDetails.length === 0)
        errors.contactDetails = "At least one contact detail is required";
    }
    if (step === "bank-details") {
      if (formData.bankDetails.length === 0)
        errors.bankDetails = "At least one bank detail is required";
      formData.bankDetails.forEach((bank, index) => {
        if (!bank.bankId)
          errors[`bank_${index}_bankId`] = "Bank name is required";
        if (!bank.accountNo)
          errors[`bank_${index}_accountNo`] = "Bank Account is required";
      });
    }

    if (step === "rooms") {
      if (formData.rooms.length === 0)
        errors.rooms = "At least one room category is required";
      formData.rooms.forEach((room, roomIndex) => {
        if (!room.roomCategoryId)
          errors[`room_${roomIndex}_category`] = "Room category is required";
        if (!room.roomTypes || room.roomTypes.length === 0)
          errors[`room_${roomIndex}_types`] =
            "At least one room type is required for this category";
      });
    }
    if (step === "terms-conditions") {
      if (formData.termsAndConditions.length === 0)
        errors.termsAndConditions =
          "At least one term and condition is required";
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Navigation logic
  const handleTabSelect = (k) => {
    // Only allow navigation to current or previous tabs
    const currentIdx = tabOrder.indexOf(activeTab);
    const nextIdx = tabOrder.indexOf(k);
    if (nextIdx <= currentIdx) setActiveTab(k);
  };

  const handleNextStep = () => {
    const idx = tabOrder.indexOf(activeTab);
    if (validateStep(activeTab)) {
      if (idx < tabOrder.length - 1) setActiveTab(tabOrder[idx + 1]);
    } else {
      // Validation errors shown by validateStep
    }
  };

  const handleRegister = (e) => {
    e.preventDefault();
    // Validate all steps before submitting
    let allValid = true;
    for (let i = 0; i < tabOrder.length - 1; i++) {
      if (!validateStep(tabOrder[i])) {
        setActiveTab(tabOrder[i]);
        allValid = false;
        break;
      }
    }
    if (allValid && validateStep("terms-conditions")) {
      handleSubmit(e);
    }
  };
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditMode = !!id;

  // Master data states
  const [currencies, setCurrencies] = useState([]);
  const [hotelCategories, setHotelCategories] = useState([]);
  const [hotelTypes, setHotelTypes] = useState([]);
  const [markupTypes, setMarkupTypes] = useState([]);
  const [regions, setRegions] = useState([]);
  const [countries, setCountries] = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [places, setPlaces] = useState([]);
  const [subLocations, setSubLocations] = useState([]);
  const [contactTypes, setContactTypes] = useState([]);
  const [banks, setBanks] = useState([]);
  const [amenities, setAmenities] = useState([]);
  const [roomCategories, setRoomCategories] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [filteredRoomTypes, setFilteredRoomTypes] = useState({});
  const [masterAmenityData, setMasterAmenityData] = useState({});
  const [isDataReady, setIsDataReady] = useState(false);


  // Form data state
  const [formData, setFormData] = useState({
    hotelName: "",
    hotelDescription: "",
    image360: "",
    image360File: null,
    address: "",
    zipcode: "",
    latitude: "",
    longitude: "",
    childComAgeMin: "",
    childComAgeMax: "",
    childChargeableAgeMin: "",
    childChargeableAgeMax: "",
    hotelCurrencyId: "",
    hotelCategoryId: "",
    hotelTypeId: "",
    markupTypeId: "",
    regionId: "",
    countryId: "",
    stateId: "",
    placeId: "",
    subLocationId: "",
    isDeleted: false,
    contactDetails: [],
    bankDetails: [],
    weekDays: {
      wdSunday: false,
      wdMonday: false,
      wdTuesday: false,
      wdWednesday: false,
      wdThursday: false,
      wdFriday: false,
      wdSaturday: false,
      wedSunday: false,
      wedMonday: false,
      wedTuesday: false,
      wedWednesday: false,
      wedThursday: false,
      wedFriday: false,
      wedSaturday: false,
    },
    rooms: [],
    termsAndConditions: [],
    amenityIds: [],
  });

  const [isLoading, setIsLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [isLoadingHotelData, setIsLoadingHotelData] = useState(false);

  // Locality (sub-location) quick-add modal state
  const [showLocalityModal, setShowLocalityModal] = useState(false);
  const [localityName, setLocalityName] = useState("");
  const [localityCode, setLocalityCode] = useState("");
  const [localityError, setLocalityError] = useState("");
  const [isSavingLocality, setIsSavingLocality] = useState(false);

  const openLocalityModal = () => {
    if (!formData.countryId || !formData.stateId || !formData.placeId) {
      toast.error("Please select Country, State and City first");
      return;
    }
    setLocalityName("");
    setLocalityCode("");
    setLocalityError("");
    setShowLocalityModal(true);
  };

  const closeLocalityModal = () => {
    if (isSavingLocality) return;
    setShowLocalityModal(false);
    setLocalityName("");
    setLocalityCode("");
    setLocalityError("");
  };

  const handleSaveLocality = async () => {
    if (!localityName.trim()) {
      setLocalityError("Locality name is required");
      return;
    }
    if (!localityCode.trim()) {
      setLocalityError("Locality code is required");
      return;
    }
    try {
      setIsSavingLocality(true);
      const payload = {
        countryId: `${formData.countryId}`,
        stateId: `${formData.stateId}`,
        placeId: `${formData.placeId}`,
        locationName: localityName.trim(),
        locationCode: localityCode.trim(),
      };
      const res = await axiosInstance.post("/api/sub-locations/save", payload);
      // Backend returns the new sub-location id as a bare Long
      const newId =
        res?.data && typeof res.data === "object" ? res.data.id : res?.data;
      if (newId) {
        toast.success("Locality added successfully");
        await loadSubLocations(formData.placeId);
        setFormData((prev) => ({ ...prev, subLocationId: newId }));
        setShowLocalityModal(false);
        setLocalityName("");
        setLocalityCode("");
        setLocalityError("");
      }
    } catch (error) {
      console.error("Error saving locality:", error);
      setLocalityError("Failed to save locality");
      toast.error("Failed to save locality");
    } finally {
      setIsSavingLocality(false);
    }
  };

  // Debug: Monitor formData.weekDays changes
  useEffect(() => {
  }, [formData.weekDays]);

  // Weekdays configuration
  const weekdays = [
    { key: "wdSunday", label: "Sunday" },
    { key: "wdMonday", label: "Monday" },
    { key: "wdTuesday", label: "Tuesday" },
    { key: "wdWednesday", label: "Wednesday" },
    { key: "wdThursday", label: "Thursday" },
    { key: "wdFriday", label: "Friday" },
    { key: "wdSaturday", label: "Saturday" },
  ];

  // Load hotel data for edit mode
const loadHotelData = async () => {
  if (!isEditMode) return;

  try {
    setIsLoadingHotelData(true);

    // Ensure amenities are loaded first
    if (amenities.length === 0) {
      await loadAmenities();
    }

    const response = await axiosInstance.get(`/api/hotels/${id}`);
    const hotelData = response.data;
     console.log("Loaded hotel data for edit:", hotelData);

    // Step 1: Set the form data first with the loaded hotel data
    const rooms = hotelData.roomCategories?.map((roomCategory) => {
      // Find associated room types from the roomTypes array
      const associatedRoomTypes =
        hotelData.roomTypes?.filter(
          (rt) => rt.hotelRoomCategoryId === roomCategory.hotelRoomCategoryId
        ) || [];
      
      
      return {
        roomCategoryId: roomCategory.roomCategoryId ?? "",
        roomCategoryName: roomCategory.name ?? "",
        roomTypes: associatedRoomTypes.map((rt) => ({
          roomTypeId: rt.roomTypeId ?? "",
          roomTypeName: rt.name ?? "",
        })),
      };
    }) || [];

    const termsAndConditions =
      hotelData.termsAndConditions?.map((term) => term.description) || [];

    // Ensure amenityIds are numbers and properly mapped
    const amenityIds = hotelData.amenities?.map((amenity) => {
      // Convert to number to ensure proper comparison
      const id = Number(amenity.amenityId || amenity.amenitiesId);
      return id;
    }) || [];
    
    
    // Additional debug: show first few amenities
    if (amenities.length > 0) {
      
      // Check if the amenity IDs from hotel data exist in loaded amenities
      amenityIds.forEach(amenityId => {
        const found = amenities.find(a => (a.amenitiesId || a.amenityId) == amenityId);
        if (found) {
        }
      });
    }
    
    // Check if amenities match
    if (hotelData.amenities.length > 0) {
      amenityIds.forEach(amenityId => {
        // Try both field names: amenitiesId and amenityId
        const foundAmenity = hotelData.amenities.find(a => 
          a.amenitiesId === amenityId || a.amenityId === amenityId
        );
      });
    }

    const weekDays = {
      id: hotelData.weekDays?.id ?? "",
      wdSunday: hotelData.weekDays?.wdSunday ?? false,
      wdMonday: hotelData.weekDays?.wdMonday ?? false,
      wdTuesday: hotelData.weekDays?.wdTuesday ?? false,
      wdWednesday: hotelData.weekDays?.wdWednesday ?? false,
      wdThursday: hotelData.weekDays?.wdThursday ?? false,
      wdFriday: hotelData.weekDays?.wdFriday ?? false,
      wdSaturday: hotelData.weekDays?.wdSaturday ?? false,
      wedSunday: hotelData.weekDays?.wedSunday ?? false,
      wedMonday: hotelData.weekDays?.wedMonday ?? false,
      wedTuesday: hotelData.weekDays?.wedTuesday ?? false,
      wedWednesday: hotelData.weekDays?.wedWednesday ?? false,
      wedThursday: hotelData.weekDays?.wedThursday ?? false,
      wedFriday: hotelData.weekDays?.wedFriday ?? false,
      wedSaturday: hotelData.weekDays?.wedSaturday ?? false,
    };


    // Set the main form data first
    const formDataToSet = {
      hotelName: hotelData.hotelName ?? "",
      hotelDescription: hotelData.hotelDescription ?? "",
      image360: hotelData.image360 ?? "",
      image360File: null,
      address: hotelData.address ?? "",
      zipcode: hotelData.zipcode ?? "",
      latitude: hotelData.latitude ?? "",
      longitude: hotelData.longitude ?? "",
      childComAgeMin: hotelData.childComAgeMin ?? "",
      childComAgeMax: hotelData.childComAgeMax ?? "",
      childChargeableAgeMin: hotelData.childChargeableAgeMin ?? "",
      childChargeableAgeMax: hotelData.childChargeableAgeMax ?? "",
      hotelCurrencyId: hotelData.hotelCurrencyId ?? "",
      hotelCategoryId: hotelData.hotelCategoryId ?? "",
      hotelTypeId: hotelData.hotelTypeId ?? "",
      markupTypeId: hotelData.markupTypeId ?? "",
      regionId: hotelData.regionId ?? "",
      countryId: hotelData.countryId ?? "",
      stateId: hotelData.stateId ?? "",
      placeId: hotelData.placeId ?? "",
      subLocationId: hotelData.subLocationId ?? "",
      isDeleted: hotelData.isDeleted ?? false,
      contactDetails: hotelData.contactDetails ?? [],
      bankDetails: hotelData.bankDetails ?? [],
      weekDays,
      rooms,
      termsAndConditions,
      amenityIds, // This should now contain [7, 8, 9] as numbers
    };
    
    setFormData(formDataToSet);
    
    // Fetch master amenity IDs after hotel data is loaded
    await fetchHotelMasterAmenityIds(hotelData);

    // Now load dependent lists in correct order
    if (hotelData.countryId) {
      const provincesRes = await axiosInstance.get(
        `/api/province/getByCountryId/${hotelData.countryId}`
      );
      setProvinces(provincesRes.data || []);

      if (hotelData.stateId) {
        const placesRes = await axiosInstance.get(
          `/api/destination/getplaces/${hotelData.stateId}`
        );
        setPlaces(placesRes.data || []);
      }

      if (hotelData.placeId) {
        await loadSubLocations(hotelData.placeId);
      }
    }

  } catch (error) {
    console.error("Error loading hotel data:", error);
    toast.error("Failed to load hotel data for editing");
    navigate("/registration/hotel");
  } finally {
    setIsLoadingHotelData(false);
  }
};

  // Load master data on component mount
  useEffect(() => {
    loadCurrencies();
    loadHotelCategories();
    loadHotelTypes();
    loadMarkupTypes();
    loadRegions();
    loadContactTypes();
    loadBanks();
    loadAmenities();
    loadRoomCategories();
    loadRoomTypes();
  }, []);

  // Load hotel data for edit mode
  useEffect(() => {
    if (isEditMode) {
      loadHotelData();
    }
  }, [isEditMode, id]);


  //  Load countries when region changes
  useEffect(() => {
    // Skip clearing during initial load
    if (!isLoadingHotelData && formData.regionId) {
      loadCountries(formData.regionId);
    }
  }, [formData.regionId, isLoadingHotelData]);

  //  Load provinces when country changes
  useEffect(() => {
    // Skip clearing during initial load
    if (!isLoadingHotelData && formData.countryId) {
      loadProvinces(formData.countryId);
    }
  }, [formData.countryId, isLoadingHotelData]);

  //  Load places when state changes
  useEffect(() => {
    if (!isLoadingHotelData && formData.stateId) {
      loadPlaces(formData.stateId);
    }
  }, [formData.stateId, isLoadingHotelData]);

  //  Load sub-locations (localities) when place changes
  useEffect(() => {
    if (!isLoadingHotelData && formData.placeId) {
      loadSubLocations(formData.placeId);
    } else if (!formData.placeId) {
      setSubLocations([]);
    }
  }, [formData.placeId, isLoadingHotelData]);




  // Load currencies
  const loadCurrencies = async () => {
    try {
      const response = await axiosInstance.get("/api/currency");
      // console.log("Currencies response:", response.data);
      setCurrencies(response.data || []);
    } catch (error) {
      console.error("Error loading currencies:", error);
      toast.error("Failed to load currencies");
    }
  };

  // Load hotel categories
  const loadHotelCategories = async () => {
    try {
      const response = await axiosInstance.get("/api/hotelcategory");
      // console.log("Hotel Categories response:", response.data);
      setHotelCategories(response.data || []);
    } catch (error) {
      console.error("Error loading hotel categories:", error);
      toast.error("Failed to load hotel categories");
    }
  };

  // Load hotel types
  const loadHotelTypes = async () => {
    try {
      const response = await axiosInstance.get("/api/hotelType");
      // console.log("Hotel Types response:", response.data);
      setHotelTypes(response.data || []);
    } catch (error) {
      console.error("Error loading hotel types:", error);
      toast.error("Failed to load hotel types");
    }
  };

  // Load markup types
  const loadMarkupTypes = async () => {
    try {
      const response = await axiosInstance.get("/api/markupType");
      // console.log("Markup Types response:", response.data);
      setMarkupTypes(sortMarkupTypesByPercentage(Array.isArray(response.data) ? response.data : []));
    } catch (error) {
      console.error("Error loading markup types:", error);
      toast.error("Failed to load markup types");
    }
  };

  // Load regions
  const loadRegions = async () => {
    try {
      const response = await axiosInstance.get("/api/region");
      // console.log("Regions response:", response.data);
      setRegions(response.data || []);
    } catch (error) {
      console.error("Error loading regions:", error);
      toast.error("Failed to load regions");
    }
  };

  // Load countries
  const loadCountries = async (regionId) => {
    try {
      const response = await axiosInstance.post(`/api/country/getListBasedOnRegions/${regionId}`);
      // console.log("Countries response:", response.data);
      setCountries(response.data || []);
    } catch (error) {
      console.error("Error loading countries:", error);
      toast.error("Failed to load countries");
    }
  };

  // Load contact types
  const loadContactTypes = async () => {
    try {
      const response = await axiosInstance.get("/api/contacttype");
      // console.log("Contact Types response:", response.data);
      setContactTypes(response.data || []);
    } catch (error) {
      console.error("Error loading contact types:", error);
      toast.error("Failed to load contact types");
    }
  };

  // Load banks
  const loadBanks = async () => {
    try {
      const response = await axiosInstance.get("/api/bank");
      // console.log("Banks response:", response.data);
      setBanks(response.data || []);
    } catch (error) {
      console.error("Error loading banks:", error);
      toast.error("Failed to load banks");
    }
  };

  // Load amenities
  const loadAmenities = async () => {
    try {
      // Try different approaches to get all amenities
      // console.log("=== LOADING AMENITIES ===");
      
      // First try: without pagination parameters
      try {
        const response1 = await axiosInstance.get("/api/hotelAmenity");
        // console.log("Response without pagination:", response1.data);
        // console.log("Length without pagination:", response1.data?.length);
      } catch (e) {
        // console.log("Error without pagination:", e);
      }
      
      // Second try: with high limit
      try {
        const response2 = await axiosInstance.get("/api/hotelAmenity?page=0&limit=1000");
        // console.log("Response with high limit:", response2.data);
        // console.log("Length with high limit:", response2.data?.length);
        // console.log("First amenity structure:", response2.data?.[0]);
        // console.log("Total amenities from API:", response2.data?.length);
        // console.log("Amenity ID range:", response2.data?.map(a => a.amenitiesId || a.amenityId).sort((a, b) => a - b));
        setAmenities(response2.data || []);
      } catch (e) {
        // console.log("Error with high limit:", e);
      }
      
      // Third try: try to get all pages
      try {
        let allAmenities = [];
        let page = 0;
        let hasMore = true;
        
        while (hasMore) {
          const response = await axiosInstance.get(`/api/hotelAmenity?page=${page}&limit=100`);
          // console.log(`Page ${page} response:`, response.data);
          
          if (response.data && response.data.length > 0) {
            allAmenities = [...allAmenities, ...response.data];
            page++;
            hasMore = response.data.length === 100; // If we get less than 100, we're done
          } else {
            hasMore = false;
          }
        }
        
        // console.log("All amenities from pagination:", allAmenities);
        // console.log("Total amenities from pagination:", allAmenities.length);
        // console.log("Amenity ID range from pagination:", allAmenities.map(a => a.amenitiesId || a.amenityId).sort((a, b) => a - b));
        
        if (allAmenities.length > 0) {
          setAmenities(allAmenities);
        }
      } catch (e) {
        // console.log("Error with pagination:", e);
      }
      
    } catch (error) {
      console.error("Error loading amenities:", error);
      toast.error("Failed to load amenities");
    }
  };

  // Load room categories
  const loadRoomCategories = async (searchTerm = "") => {
    try {
      const response = await axiosInstance.get("/api/roomCategory", {
        params: { searchterm: searchTerm }
      });
      // console.log("Room Categories response:", response.data);
      setRoomCategories(response.data || []);
    } catch (error) {
      console.error("Error loading room categories:", error);
      toast.error("Failed to load room categories");
    }
  };


  // Load room types
  const loadRoomTypes = async () => {
    try {
      const response = await axiosInstance.get("/api/roomType");
      // console.log("Room Types response:", response.data);
      setRoomTypes(response.data || []);
    } catch (error) {
      console.error("Error loading room types:", error);
      toast.error("Failed to load room types");
    }
  };

  const loadProvinces = async (countryId) => {
    try {
      const response = await axiosInstance.get(
        `/api/province/getByCountryId/${countryId}`
      );
      setProvinces(response.data || []);
    } catch (error) {
      console.error("Error loading provinces:", error);
      toast.error("Failed to load provinces");
    }
  };

  const loadPlaces = async (stateId) => {
    try {
      const response = await axiosInstance.get(
        `/api/destination/getplaces/${stateId}`
      );
      setPlaces(response.data || []);
    } catch (error) {
      console.error("Error loading places:", error);
      toast.error("Failed to load places");
    }
  };

  // Load sub-locations (localities) for the selected place from the backend
  const loadSubLocations = async (placeId) => {
    if (!placeId) {
      setSubLocations([]);
      return;
    }
    try {
      const response = await axiosInstance.get(
        `/api/sub-locations?page=0&limit=1000&placeId=${placeId}`
      );
      const list = Array.isArray(response.data) ? response.data : [];
      setSubLocations(list);
    } catch (error) {
      console.error("Error loading sub-locations:", error);
      toast.error("Failed to load localities");
      setSubLocations([]);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked, files } = e.target;

    setFormData((prev) => {
      let updated = { 
        ...prev, 
        [name]: type === "checkbox" ? checked : type === "file" ? files[0] : value 
      };

      // Reset dependent fields only on user input
      if (name === "regionId") {
        updated.countryId = "";
        updated.stateId = "";
        updated.placeId = "";
        updated.subLocationId = "";
        setCountries([]);
        setProvinces([]);
        setPlaces([]);
        setSubLocations([]);
      } else if (name === "countryId") {
        updated.stateId = "";
        updated.placeId = "";
        updated.subLocationId = "";
        setProvinces([]);
        setPlaces([]);
        setSubLocations([]);
      } else if (name === "stateId") {
        updated.placeId = "";
        updated.subLocationId = "";
        setPlaces([]);
        setSubLocations([]);
      } else if (name === "placeId") {
        updated.subLocationId = "";
        setSubLocations([]);
      }

      return updated;
    });

    // Remove validation error for this field if any
    setValidationErrors((prev) => {
      if (!prev[name]) return prev;
      const updated = { ...prev };
      delete updated[name];
      return updated;
    });
  };

  // Build the preview URL for the 360 image.
  //   - When the operator just picked a new file, blob it via createObjectURL
  //     so the page shows it immediately (no server round-trip).
  //   - Otherwise return the path the backend gave us VERBATIM. The hotel
  //     listing page (HotelList) renders `<img src={hotel.image360}>` straight
  //     out of /api/hotels/{id}, so the same string works here. The previous
  //     implementation stripped the path to just a filename and prepended
  //     `/api/images/{filename}` — an endpoint that doesn't exist — which
  //     is why the image disappeared when re-opening edit.
  const getImagePreviewUrl = (imagePath, file) => {
    if (file && typeof file !== "string") {
      try { return URL.createObjectURL(file); } catch { /* unsupported */ }
    }
    if (!imagePath) return null;
    return imagePath;
  };

  const handleWeekdayChange = (e) => {
    const { name, checked } = e.target;
    // console.log(`Weekday change: ${name} = ${checked}`);
    setFormData((prev) => ({
      ...prev,
      weekDays: {
        ...prev.weekDays,
        [name]: checked,
      },
    }));
  };

  const handleWeekEndDayChange = (e) => {
    const { name, checked } = e.target;
    // console.log(`Weekend day change: ${name} = ${checked}`);
    setFormData((prev) => {
      const updatedWeekDays = {
        ...prev.weekDays,
        [name]: checked,
      };
      // console.log(`Updated weekDays:`, updatedWeekDays);
      return {
        ...prev,
        weekDays: updatedWeekDays,
      };
    });
  };

  //Amenity managenment
const handleAmenityChange = (e) => {
  const { value, checked } = e.target;
  const amenityId = parseInt(value);
  
  setFormData((prev) => ({
    ...prev,
    amenityIds: checked
      ? [...prev.amenityIds, amenityId]
      : prev.amenityIds.filter((id) => id !== amenityId),
  }));
};

  // Contact Details Management
  const addContactDetail = () => {
    setFormData((prev) => ({
      ...prev,
      contactDetails: [
        ...prev.contactDetails,
        {
          contactTypeId: "",
          contactPerson: "",
          personalEmail: "",
          teleNumber: "",
          mobileNumber: "",
        },
      ],
    }));
  };

  const removeContactDetail = (index) => {
    setFormData((prev) => ({
      ...prev,
      contactDetails: prev.contactDetails.filter((_, i) => i !== index),
    }));
  };

  const updateContactDetail = (index, field, value) => {
    setFormData((prev) => ({
      ...prev,
      contactDetails: prev.contactDetails.map((contact, i) =>
        i === index ? { ...contact, [field]: value } : contact
      ),
    }));
  };

  // Bank Details Management
  const addBankDetail = () => {
    setFormData((prev) => ({
      ...prev,
      bankDetails: [
        ...prev.bankDetails,
        {
          bankId: "",
          accountNo: "",
          iban: "",
          swiftCode: "",
          bankAddress: "",
          telephone: "",
          faxNumber: "",
          contactPerson: "",
        },
      ],
    }));
  };

  const removeBankDetail = (index) => {
    setFormData((prev) => ({
      ...prev,
      bankDetails: prev.bankDetails.filter((_, i) => i !== index),
    }));
  };

  const updateBankDetail = (index, field, value) => {
    setFormData((prev) => ({
      ...prev,
      bankDetails: prev.bankDetails.map((bank, i) =>
        i === index ? { ...bank, [field]: value } : bank
      ),
    }));
    // Clear this field's error once it has a value again, so the red
    // message goes away as soon as the user fixes it.
    const errorKey = `bank_${index}_${field}`;
    if (String(value ?? "").trim()) {
      setValidationErrors((prev) => {
        if (!prev[errorKey]) return prev;
        const next = { ...prev };
        delete next[errorKey];
        return next;
      });
    }
  };

  // Room Category and Types Management
  const [selectedRoomCategory, setSelectedRoomCategory] = useState("");
  const [selectedRoomTypes, setSelectedRoomTypes] = useState([]);
  const [availableRoomTypes, setAvailableRoomTypes] = useState([]);
  
  // Handle searching for room categories
  const handleRoomCategorySearch = (inputValue) => {
    if (inputValue) {
      loadRoomCategories(inputValue);
    } else {
      loadRoomCategories(); // Load default list if empty
    }
  };

  const usedRoomCategoryIds = useMemo(() => {

    return new Set(
      (formData.rooms || []).map((room) => String(room.roomCategoryId))
    );
  }, [formData.rooms]);

  // Load room types when room category is selected
  const handleRoomCategoryChange = async (roomCategoryId) => {
    setSelectedRoomCategory(roomCategoryId);
    setSelectedRoomTypes([]);

    if (roomCategoryId) {
      try {
        const response = await axiosInstance.get(
          `/api/roomType?roomCategoryId=${roomCategoryId}`
        );
        setAvailableRoomTypes(response.data || []);
      } catch (error) {
        console.error("Error loading room types for category:", error);
        toast.error("Failed to load room types for selected category");
        setAvailableRoomTypes([]);
      }
    } else {
      setAvailableRoomTypes([]);
    }
  };

    const fetchHotelMasterAmenityIds= async (hotelData) => {
    
     try {
        // Extract amenity IDs from the loaded hotel data
        const amenityIds = hotelData?.amenities?.map((amenity) => {
          return Number(amenity.amenityId);
        }) || [];
        
        console.log("Sending amenity IDs to backend:", amenityIds);
        
        const response = await axiosInstance.post(
          `/api/hotels/${id}/fetchHotelEditAmenities`,
          amenityIds
        );
        const masterAmenities = response.data || [];
        setMasterAmenityIds(masterAmenities);
        
        // Update formData.amenityIds with master amenity IDs for proper checking
        if (masterAmenities.length > 0) {
          const masterIds = masterAmenities.map(amenity => Number(amenity.amenitiesId || amenity.amenityId));
          console.log("Updating formData.amenityIds with master IDs:", masterIds);
          setFormData(prev => ({
            ...prev,
            amenityIds: masterIds
          }));
        }
      } catch (error) {
        console.error("Error loading master amenities for hotel", error);
            }
      }


  // Handle room type selection (multiple selection)
  const handleRoomTypeSelection = (roomTypeId) => {
    const stringId = String(roomTypeId);
    // console.log("=== ROOM TYPE SELECTION ===");
    // console.log("Room Type ID:", stringId, "Type:", typeof stringId);
    // console.log("Current selected array:", selectedRoomTypes);

    setSelectedRoomTypes((prev) => {
      // Create a new array to avoid mutation issues
      const currentArray = [...prev];
      const index = currentArray.indexOf(stringId);

      if (index > -1) {
        // Remove if exists
        currentArray.splice(index, 1);
        // console.log("REMOVED room type:", stringId);
      } else {
        // Add if doesn't exist
        currentArray.push(stringId);
        // console.log("ADDED room type:", stringId);
      }

      // console.log("Final selected array:", currentArray);
      return currentArray;
    });
  };

  // Add selected room category and types to the rooms array
  const addRoomCategoryAndTypes = () => {
    if (!selectedRoomCategory) {
      toast.error("Please select a room category");
      return;
    }

    if (selectedRoomTypes.length === 0) {
      toast.error("Please select at least one room type");
      return;
    }

    // Find category by converting both to numbers for comparison
    const selectedCategory = roomCategories.find(
      (cat) => Number(cat.roomCategoryId) === Number(selectedRoomCategory)
    );

    const selectedTypes = availableRoomTypes.filter((type, index) => {
      const uniqueId = type.roomtypeId || `index-${index}`;
      return selectedRoomTypes.includes(String(uniqueId));
    });

    const newRoom = {
      roomCategoryId: selectedRoomCategory,
      roomCategoryName: selectedCategory?.roomCategory || "",
      roomTypes: selectedTypes.map((type) => ({
        roomTypeId: type.roomtypeId,
        roomTypeName: type.name || "",
      })),
    };

    // console.log("New room object:", newRoom);

    setFormData((prev) => ({
      ...prev,
      rooms: [...prev.rooms, newRoom],
    }));

    // Reset selection
    setSelectedRoomCategory("");
    setSelectedRoomTypes([]);
    setAvailableRoomTypes([]);
  };

  const removeRoom = (index) => {
    setFormData((prev) => ({
      ...prev,
      rooms: prev.rooms.filter((_, i) => i !== index),
    }));
  };

  // Terms and Conditions Management
  const addTermAndCondition = () => {
    setFormData((prev) => ({
      ...prev,
      termsAndConditions: [...prev.termsAndConditions, ""],
    }));
  };

  const removeTermAndCondition = (index) => {
    setFormData((prev) => ({
      ...prev,
      termsAndConditions: prev.termsAndConditions.filter((_, i) => i !== index),
    }));
  };

  const updateTermAndCondition = (index, value) => {
    setFormData((prev) => ({
      ...prev,
      termsAndConditions: prev.termsAndConditions.map((term, i) =>
        i === index ? value : term
      ),
    }));
  };

  // Form validation
  const validateForm = () => {
    const errors = {};

    // Basic hotel information validation
    if (!formData.hotelName.trim()) errors.hotelName = "Hotel name is required";
    if (!formData.hotelDescription.trim())
      errors.hotelDescription = "Hotel description is required";
    if (!formData.address.trim()) errors.address = "Address is required";
    if (!formData.zipcode.trim()) errors.zipcode = "Zipcode is required";
    if (!formData.hotelCurrencyId)
      errors.hotelCurrencyId = "Currency is required";
    if (!formData.hotelCategoryId)
      errors.hotelCategoryId = "Hotel category is required";
    if (!formData.hotelTypeId) errors.hotelTypeId = "Hotel type is required";
    if (!formData.markupTypeId) errors.markupTypeId = "Markup type is required";
    if (!formData.regionId) errors.regionId = "Region is required";
    if (!formData.countryId) errors.countryId = "Country is required";
    if (!formData.stateId) errors.stateId = "State/Province is required";
    if (!formData.placeId) errors.placeId = "City is required";

    // Age validation
    if (!formData.childComAgeMin)
      errors.childComAgeMin = "Child complimentary age minimum is required";
    if (!formData.childComAgeMax)
      errors.childComAgeMax = "Child complimentary age maximum is required";
    if (!formData.childChargeableAgeMin)
      errors.childChargeableAgeMin = "Child chargeable age minimum is required";
    if (!formData.childChargeableAgeMax)
      errors.childChargeableAgeMax = "Child chargeable age maximum is required";

    // Contact details validation
    if (formData.contactDetails.length === 0) {
      errors.contactDetails = "At least one contact detail is required";
    }

    // Bank details validation - only bank name and address are required
    if (formData.bankDetails.length === 0) {
      errors.bankDetails = "At least one bank detail is required";
    } else {
      formData.bankDetails.forEach((bank, index) => {
        if (!bank.bankId) {
          errors[`bank_${index}_bankId`] = "Bank name is required";
        }
        if (!bank.accountNo) {
          errors[`bank_${index}_accountNo`] = "Bank Account is required";
        }
      });
    }

    // Rooms validation
    if (formData.rooms.length === 0) {
      errors.rooms = "At least one room category is required";
    } else {
      formData.rooms.forEach((room, roomIndex) => {
        if (!room.roomCategoryId) {
          errors[`room_${roomIndex}_category`] = "Room category is required";
        }
        if (!room.roomTypes || room.roomTypes.length === 0) {
          errors[`room_${roomIndex}_types`] =
            "At least one room type is required for this category";
        }
        if (room.roomTypes) {
          room.roomTypes.forEach((roomType, typeIndex) => {
            if (!roomType.roomTypeId) {
              errors[`room_${roomIndex}_type_${typeIndex}`] =
                "Room type is required";
            }
          });
        }
      });
    }

    // Terms and conditions validation
    if (formData.termsAndConditions.length === 0) {
      errors.termsAndConditions = "At least one term and condition is required";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit form
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("Please fix the validation errors");
      return;
    }

    try {
      setIsLoading(true);

      // Transform rooms data to match API structure
      const roomCategories = formData.rooms.map((room, index) => ({
        hotelRoomCategoryId: null, // Will be set by backend
        hotelId: null, // Will be set by backend
        roomCategoryId: parseInt(room.roomCategoryId),
        name: room.roomCategoryName,
        noOfRooms: 10, // Default value, adjust if needed
        roomTypes: room.roomTypes || [],
      }));

      // Transform room types data
      const roomTypes = [];
      // console.log("formData.rooms::", formData.rooms);

      formData.rooms.forEach((room, roomIndex) => {
        room.roomTypes.forEach((roomType) => {
          roomTypes.push({
            hotelRoomTypeId: null, // Will be set by backend
            hotelRoomCategoryId: parseInt(room.roomCategoryId), // Set from parent room
            hotelId: null, // Will be set by backend
            roomTypeId: parseInt(roomType.roomTypeId), // Set from inner roomType
          });
        });
      });

      // Transform terms and conditions
      const termsAndConditions = formData.termsAndConditions.map((term) => ({
        id: null, // Will be set by backend
        hotelId: null, // Will be set by backend
        description: term,
      }));

      // Transform amenities data
      const hotelAmenities = formData.amenityIds.map((amenityId) => {
        const amenity = amenities.find(
          (a) => (a.amenitiesId === parseInt(amenityId)) || (a.amenityId === parseInt(amenityId))
        );
        return {
          amenityId: parseInt(amenityId),
          amenityName: amenity?.amenityName || "",
        };
      });

      // Create FormData object
      const formDataToSend = new FormData();

      // Basic hotel information
      formDataToSend.append("hotelName", formData.hotelName);
      formDataToSend.append(
        "hotelCurrencyId",
        parseInt(formData.hotelCurrencyId)
      );
      formDataToSend.append(
        "hotelCategoryId",
        parseInt(formData.hotelCategoryId)
      );
      formDataToSend.append("hotelTypeId", parseInt(formData.hotelTypeId));
      formDataToSend.append("markupTypeId", parseInt(formData.markupTypeId));
      formDataToSend.append("hotelDescription", formData.hotelDescription);
      formDataToSend.append(
        "childComAgeMin",
        parseInt(formData.childComAgeMin)
      );
      formDataToSend.append(
        "childComAgeMax",
        parseInt(formData.childComAgeMax)
      );
      formDataToSend.append(
        "childChargeableAgeMin",
        parseInt(formData.childChargeableAgeMin)
      );
      formDataToSend.append(
        "childChargeableAgeMax",
        parseInt(formData.childChargeableAgeMax)
      );
      formDataToSend.append("regionId", parseInt(formData.regionId));
      formDataToSend.append("countryId", parseInt(formData.countryId));
      formDataToSend.append("stateId", parseInt(formData.stateId));
      formDataToSend.append("placeId", parseInt(formData.placeId));
      if (formData.subLocationId) {
        formDataToSend.append(
          "subLocationId",
          parseInt(formData.subLocationId)
        );
      }
      formDataToSend.append("address", formData.address);
      formDataToSend.append("zipcode", formData.zipcode);
      formDataToSend.append("latitude", parseFloat(formData.latitude) || 0);
      formDataToSend.append("longitude", parseFloat(formData.longitude) || 0);
      formDataToSend.append("isDeleted", formData.isDeleted.toString());

      // Contact details
      formData.contactDetails.forEach((contact, index) => {
        formDataToSend.append(`contactDetails[${index}].id`, contact.id || "");
        formDataToSend.append(
          `contactDetails[${index}].hotelId`,
          contact.hotelId || ""
        );
        formDataToSend.append(
          `contactDetails[${index}].contactTypeId`,
          parseInt(contact.contactTypeId)
        );
        formDataToSend.append(
          `contactDetails[${index}].contactPerson`,
          contact.contactPerson || ""
        );
        formDataToSend.append(
          `contactDetails[${index}].personalEmail`,
          contact.personalEmail || ""
        );
        formDataToSend.append(
          `contactDetails[${index}].teleNumber`,
          contact.teleNumber || ""
        );
        formDataToSend.append(
          `contactDetails[${index}].mobileNumber`,
          contact.mobileNumber || ""
        );
        // Omit mailTyIds if it's empty or not used, or send as an array if populated
        if (
          contact.mailTyIds &&
          Array.isArray(contact.mailTyIds) &&
          contact.mailTyIds.length > 0
        ) {
          contact.mailTyIds.forEach((mailTyId, mailIndex) => {
            formDataToSend.append(
              `contactDetails[${index}].mailTyIds[${mailIndex}]`,
              mailTyId
            );
          });
        }
      });

      // Bank details
      formData.bankDetails.forEach((bank, index) => {
        // formDataToSend.append(`bankDetails[${index}].id`, bank.id || '');
        // formDataToSend.append(`bankDetails[${index}].hotelId`, bank.hotelId || '');
        formDataToSend.append(
          `bankDetails[${index}].bankId`,
          parseInt(bank.bankId)
        );
        formDataToSend.append(
          `bankDetails[${index}].accountNo`,
          bank.accountNo || ""
        );
        formDataToSend.append(`bankDetails[${index}].iban`, bank.iban || "");
        formDataToSend.append(
          `bankDetails[${index}].swiftCode`,
          bank.swiftCode || ""
        );
        formDataToSend.append(
          `bankDetails[${index}].bankAddress`,
          bank.bankAddress || ""
        );
        formDataToSend.append(
          `bankDetails[${index}].telephone`,
          bank.telephone || ""
        );
        formDataToSend.append(
          `bankDetails[${index}].faxNumber`,
          bank.faxNumber || ""
        );
        formDataToSend.append(
          `bankDetails[${index}].contactPerson`,
          bank.contactPerson || ""
        );
      });

      // Week days
      // console.log("=== WEEKDAYS DEBUG ===");
      // console.log("Complete formData.weekDays:", formData.weekDays);
      // console.log("WeekDays data being sent:", formData.weekDays);
      formDataToSend.append("weekDays.id", formData.weekDays.id || "");
      Object.keys(formData.weekDays).forEach((key) => {
        if (key !== 'id') { // Skip id as it's already appended above
          // console.log(`Appending weekDays.${key}: ${formData.weekDays[key]} (${typeof formData.weekDays[key]})`);
          formDataToSend.append(
            `weekDays.${key}`,
            formData.weekDays[key].toString()
          );
        }
      });
      // console.log("=== END WEEKDAYS DEBUG ===");

      // Room categories
      roomCategories.forEach((room, catIndex) => {
        formDataToSend.append(
          `roomCategories[${catIndex}].roomCategoryId`,
          parseInt(room.roomCategoryId)
        );
        formDataToSend.append(`roomCategories[${catIndex}].name`, room.name);
        formDataToSend.append(
          `roomCategories[${catIndex}].noOfRooms`,
          room.noOfRooms
        );

        // Make sure roomTypes belongs to this category
        room.roomTypes.forEach((roomType, typeIndex) => {
          formDataToSend.append(
            `roomCategories[${catIndex}].hotelRoomTypes[${typeIndex}].roomTypeId`,
            parseInt(roomType.roomTypeId)
          );
        });
      });

      // Room types - Map to the correct roomCategoryId index

      // roomTypes.forEach((roomType, index) => {
      //   // Find the index of the room category that this room type belongs to
      //   const roomCategoryIndex = roomCategories.findIndex(
      //     (room) =>
      //       parseInt(room.roomCategoryId) === parseInt(roomType.roomCategoryId)
      //   );
      //   // formDataToSend.append(
      //   //   `roomTypes[${index}].hotelRoomTypeId`,
      //   //   roomType.hotelRoomTypeId || ""
      //   // );
      //   formDataToSend.append(
      //     `roomTypes[${index}].hotelRoomCategoryId`,
      //     roomCategoryIndex >= 0 ? roomCategoryIndex : ""
      //   );
      //   // formDataToSend.append(
      //   //   `roomTypes[${index}].hotelId`,
      //   //   roomType.hotelId || ""
      //   // );
      //   formDataToSend.append(
      //     `roomTypes[${index}].roomTypeId`,
      //     parseInt(roomType.roomTypeId)
      //   );
      // });

      // roomTypes.forEach((roomType, index) => {
      //   // formDataToSend.append(
      //   //   `roomTypes[${index}].hotelRoomTypeId`,
      //   //   roomType.hotelRoomTypeId || ""
      //   // );
      //   formDataToSend.append(
      //     `roomTypes[${index}].hotelRoomCategoryId`,
      //     parseInt(roomType.hotelRoomCategoryId)
      //   );
      //   // formDataToSend.append(
      //   //   `roomTypes[${index}].hotelId`,
      //   //   roomType.hotelId || ""
      //   // );
      //   formDataToSend.append(
      //     `roomTypes[${index}].roomTypeId`,
      //     parseInt(roomType.roomTypeId)
      //   );
      // });

      // Terms and conditions
      termsAndConditions.forEach((term, index) => {
        formDataToSend.append(`termsAndConditions[${index}].id`, term.id || "");
        formDataToSend.append(
          `termsAndConditions[${index}].hotelId`,
          term.hotelId || ""
        );
        formDataToSend.append(
          `termsAndConditions[${index}].description`,
          term.description
        );
      });

      // Amenities
      formData.amenityIds.forEach((amenityId, index) => {
        const amenity = amenities.find(
          (a) => (a.amenitiesId === parseInt(amenityId)) || (a.amenityId === parseInt(amenityId))
        );
        formDataToSend.append(
          `amenities[${index}].amenityId`,
          parseInt(amenityId)
        );
        formDataToSend.append(
          `amenities[${index}].amenityName`,
          amenity?.amenityName || ""
        );
      });

      // Always send the EXISTING image path. The backend's HotelMapper
      // unconditionally writes `hotel.image360 = dto.image360` and only
      // overrides it when a new file is uploaded — so omitting this field
      // on edit wipes the saved image. Sending the current path keeps the
      // image intact when the operator just edits other fields, and is
      // harmlessly overwritten by the uploaded URL when a new file IS
      // picked (see HotelMapper line 386 in HotelMapper.java).
      formDataToSend.append("image360", formData.image360 || "");

      // New image file (only when the operator picked one this session).
      if (formData.image360File) {
        formDataToSend.append("image360File", formData.image360File);
      }

      // Log FormData for debugging
      // console.log("FormData being sent:");
      for (let [key, value] of formDataToSend.entries()) {
        // console.log(`${key}: ${value}`);
      }

      // console.log("Submitting form data:", formDataToSend);
      let response;
      if (isEditMode) {
        response = await axiosInstance.put(
          `/api/hotels/${id}`,
          formDataToSend     
        );

        // console.log("Update response:", response);
        toast.success("Hotel updated successfully!");
      } else {
        response = await axiosInstance.post("/api/hotels", formDataToSend, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });
        toast.success("Hotel registered successfully!");
      }

      if (response.data) {
        if (!isEditMode) {
          // Reset form data
          setFormData({
            hotelName: "",
            hotelDescription: "",
            image360: "",
            image360File: null,
            address: "",
            zipcode: "",
            latitude: "",
            longitude: "",
            childComAgeMin: "",
            childComAgeMax: "",
            childChargeableAgeMin: "",
            childChargeableAgeMax: "",
            hotelCurrencyId: "",
            hotelCategoryId: "",
            hotelTypeId: "",
            markupTypeId: "",
            regionId: "",
            countryId: "",
            stateId: "",
            placeId: "",
            subLocationId: "",
            isDeleted: false,
            contactDetails: [],
            bankDetails: [],
            weekDays: {
              wdSunday: false,
              wdMonday: false,
              wdTuesday: false,
              wdWednesday: false,
              wdThursday: false,
              wdFriday: false,
              wdSaturday: false,
              wedSunday: false,
              wedMonday: false,
              wedTuesday: false,
              wedWednesday: false,
              wedThursday: false,
              wedFriday: false,
              wedSaturday: false,
            },
            rooms: [],
            termsAndConditions: [],
            amenityIds: [],
          });
          setSelectedRoomCategory("");
          setSelectedRoomTypes([]);
          setAvailableRoomTypes([]);
        }
        setValidationErrors({});
        // Extranet (hotel) users edit their OWN profile via this shared page —
        // after a successful update send them back to their dashboard. Admin
        // behavior is unchanged (still returns to the registration list).
        const activeRole = (
          sessionStorage.getItem("currentActiveRole") ||
          sessionStorage.getItem("userRole") ||
          ""
        ).toLowerCase();
        if (isEditMode && activeRole.includes("extranet")) {
          navigate("/extranetDashboard");
        } else {
          navigate("/registration/hotel");
        }
      }
    } catch (error) {
      console.error("Error submitting hotel:", error);
      // Surface the backend's actual message when present (validation errors,
      // server failures) instead of a generic fallback. Field-level errors
      // come back under `errors`; a single message under `message`.
      const data = error?.response?.data;
      let serverMsg = data?.message;
      if (!serverMsg && data?.errors && typeof data.errors === "object") {
        serverMsg = Object.values(data.errors).join(", ");
        setValidationErrors(data.errors);
      }
      toast.error(
        serverMsg ||
          (isEditMode ? "Failed to update hotel" : "Failed to register hotel")
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate form completion percentage
  const calculateCompletion = () => {
    const totalFields = 12;
    let completedFields = 0;

    if (formData.hotelName) completedFields++;
    if (formData.hotelDescription) completedFields++;
    if (formData.address) completedFields++;
    if (formData.zipcode) completedFields++;
    if (formData.hotelCurrencyId) completedFields++;
    if (formData.hotelCategoryId) completedFields++;
    if (formData.hotelTypeId) completedFields++;
    if (formData.markupTypeId) completedFields++;
    if (formData.regionId) completedFields++;
    if (formData.countryId) completedFields++;
    if (formData.stateId) completedFields++;
    if (formData.placeId) completedFields++;

    return Math.round((completedFields / totalFields) * 100);
  };

  // Show loading state when loading hotel data for edit
  if (isLoadingHotelData) {
    return (
      <div
        className="min-vh-100 bg-gradient-light d-flex flex-column"
        style={{
          background: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
        }}
      >
        <Topbar />
        <div className="d-flex flex-grow-1">
          <Sidebar />
          <main className="flex-grow-1 d-flex justify-content-center align-items-center">
            <div className="text-center">
              <Spinner animation="border" variant="primary" size="lg" />
              <p className="mt-3 text-muted">
                Loading hotel data for editing...
              </p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-vh-100 bg-gradient-light d-flex flex-column hreg-page"
      style={{
        background: "#FAFAF8",
      }}
    >
      <style>
        {`
          .weekday-checkbox .form-check-input:checked {
            background-color: #fd7e14 !important;
            border-color: #fd7e14 !important;
          }
          .weekday-checkbox .form-check-input:focus {
            box-shadow: 0 0 0 0.25rem rgba(253, 126, 20, 0.25);
          }
          .week-days-container {
            background-color: #f8f9fa !important;
            border: 1px solid #dee2e6 !important;
          }
          .nav-tabs .nav-link {
            background-color: #f8f9fa;
            border: 1px solid #dee2e6;
            border-bottom: none;
            margin-right: 4px;
            border-radius: 0.25rem 0.25rem 0 0;
            color: #495057;
            font-weight: 500;
            padding: 0.5rem 1rem;
            font-size: 0.875rem;
          }
          .nav-tabs .nav-link.active {
            background-color: #fff;
            border-color: #dee2e6 #dee2e6 #fff;
            color: #EC0B43;
            font-weight: 600;
            box-shadow: inset 0 2px 0 #EC0B43;
          }
          .nav-tabs .nav-link:hover {
            border-color: #dee2e6 #dee2e6 #fff;
            background-color: #e9ecef;
          }
          .tab-content {
            background-color: #fff;
            border: 1px solid #dee2e6;
            border-top: none;
            border-radius: 0 0 0.375rem 0.375rem;
            padding: 1.5rem;
          }
        `}
      </style>
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        {/* minWidth:0 lets this flex item shrink to the viewport instead of
            growing to its content's intrinsic width, which was causing
            horizontal overflow on mobile. */}
        <main className="flex-grow-1 p-4" style={{ minWidth: 0 }}>
          <Container fluid>
            {/* Header Section */}
            <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-4">
              <div>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => navigate("/registration/hotel")}
                  className="mb-2 d-inline-flex align-items-center gap-1"
                >
                  <FaArrowLeft />
                  Back
                </Button>
                <h2 className="text-primary mb-1 d-flex align-items-center gap-2">
                  <FaHotel className="me-2" />
                  {isEditMode ? "Edit Hotel" : "Hotel Registration"}
                  {/* Badge only appears in edit mode — there's no hotel
                      id to resolve when registering a brand-new one. */}
                  {isEditMode && <HotelTitleBadge hotelId={id} />}
                </h2>
                <p className="text-muted mb-0">
                  {isEditMode
                    ? "Update hotel information and details"
                    : "Register a new hotel with complete details"}
                </p>
              </div>
              <div className="text-end">
                <Badge
                  className="fs-6 px-3 py-2"
                  style={{ backgroundColor: isEditMode ? "#2F3E53" : "#EC0B43" }}
                >
                  <FaCheckCircle className="me-1" />
                  {isEditMode ? "Edit Mode" : "New Hotel"}
                </Badge>
                <div className="mt-2">
                  <small className="text-muted">Form Completion</small>
                  <ProgressBar
                    now={calculateCompletion()}
                    variant="danger"
                    className="mt-1"
                    style={{ height: "8px", borderRadius: "4px" }}
                  />
                  <small className="text-muted d-block mt-1">
                    {calculateCompletion()}% Complete
                  </small>
                </div>
              </div>
            </div>

            <Card
              className="shadow-lg border-0 rounded-4"
              style={{
                boxShadow: "0 20px 40px rgba(0,0,0,0.1)",
                backdropFilter: "blur(10px)",
                backgroundColor: "rgba(255,255,255,0.95)",
              }}
            >
              <Card.Header
                className="text-white border-0 rounded-top-4"
                style={{
                  background:
                    "linear-gradient(135deg, #EC0B43 0%, #C90939 100%)",
                }}
              >
                <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center">
                  <h4 className="mb-0">
                    <FaHotel className="me-2" />
                    Hotel Registration Form
                  </h4>
                  <div className="d-flex gap-2">
                    <Badge bg="light" text="dark" className="px-3 py-2">
                      <FaInfoCircle className="me-1" />
                      All fields marked with * are required
                    </Badge>
                  </div>
                </div>
              </Card.Header>
              <Card.Body>
                <Form>
                  <Tabs
                    activeKey={activeTab}
                    onSelect={handleTabSelect}
                    id="hotel-tabs"
                    className="mb-3"
                  >
                    {/* Hotel Information Tab */}
                    <Tab
                      eventKey="hotel-info"
                      title={
                        <span>
                          <FaHotel className="me-2" /> Hotel Info
                        </span>
                      }
                    >
                      <div className="p-4">
                        <Row>
                          <Col md={6}>
                            <Form.Group className="mb-3">
                              <Form.Label>
                                Hotel Name{" "}
                                <span className="text-danger">*</span>
                              </Form.Label>
                              <Form.Control
                                type="text"
                                name="hotelName"
                                value={formData.hotelName}
                                onChange={handleInputChange}
                                placeholder="Enter hotel name"
                                isInvalid={!!validationErrors.hotelName}
                              />
                              <Form.Control.Feedback type="invalid">
                                {validationErrors.hotelName}
                              </Form.Control.Feedback>
                            </Form.Group>
                          </Col>
                          <Col md={6}>
                            <Form.Group className="mb-3">
                              <Form.Label>360° Image</Form.Label>
                              {formData.image360 && (
                                <div className="mb-2">
                                  <div className="border rounded p-2 bg-light">
                                    <div className="d-flex align-items-center mb-2">
                                      <i className="fas fa-image text-muted me-2"></i>
                                      <small className="text-muted">
                                        Current image: {formData.image360.split(/[/\\]/).pop()}
                                      </small>
                                    </div>
                                    <div className="text-center">
                                      <div 
                                        className="d-flex align-items-center justify-content-center bg-white border rounded position-relative"
                                        style={{
                                          width: "200px",
                                          height: "150px",
                                          margin: "0 auto"
                                        }}
                                      >
                                        {getImagePreviewUrl(formData.image360, formData.image360File) ? (
                                          <img
                                            src={getImagePreviewUrl(formData.image360, formData.image360File)}
                                            alt="Hotel 360° Image"
                                            style={{
                                              maxWidth: "100%",
                                              maxHeight: "100%",
                                              objectFit: "cover",
                                              borderRadius: "4px"
                                            }}
                                            onError={(e) => {
                                              // If image fails to load, show fallback
                                              e.target.style.display = 'none';
                                              e.target.nextSibling.style.display = 'block';
                                            }}
                                          />
                                        ) : null}
                                        <div 
                                          className="text-center"
                                          style={{ display: getImagePreviewUrl(formData.image360, formData.image360File) ? 'none' : 'block' }}
                                        >
                                          <i className="fas fa-image fa-3x text-muted mb-2"></i>
                                          <div className="text-muted small">
                                            Image Preview
                                          </div>
                                          <div className="text-muted small">
                                            {formData.image360.split(/[/\\]/).pop()}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                              <Form.Control
                                type="file"
                                name="image360File"
                                onChange={handleInputChange}
                                accept="image/*"
                              />
                              <Form.Text className="text-muted">
                                {formData.image360 
                                  ? "Select a new image to replace the current one" 
                                  : "Upload a 360° image file for the hotel"
                                }
                              </Form.Text>
                            </Form.Group>
                          </Col>
                        </Row>

                        <Form.Group className="mb-3">
                          <Form.Label>
                            Hotel Description{" "}
                            <span className="text-danger">*</span>
                          </Form.Label>
                          <Form.Control
                            as="textarea"
                            rows={3}
                            name="hotelDescription"
                            value={formData.hotelDescription}
                            onChange={handleInputChange}
                            placeholder="Enter hotel description"
                            isInvalid={!!validationErrors.hotelDescription}
                          />
                          <Form.Control.Feedback type="invalid">
                            {validationErrors.hotelDescription}
                          </Form.Control.Feedback>
                        </Form.Group>

                        <Row>
                          <Col md={3}>
                            <Form.Group className="mb-3">
                              <Form.Label>
                                Currency <span className="text-danger">*</span>
                              </Form.Label>
                              <Form.Select
                                name="hotelCurrencyId"
                                value={formData.hotelCurrencyId}
                                onChange={handleInputChange}
                                isInvalid={!!validationErrors.hotelCurrencyId}
                              >
                                <option value="">Select Currency</option>
                                {currencies.map((currency) => (
                                  <option
                                    key={currency.currencyId}
                                    value={currency.currencyId}
                                  >
                                    {currency.name}
                                  </option>
                                ))}
                              </Form.Select>
                              <Form.Control.Feedback type="invalid">
                                {validationErrors.hotelCurrencyId}
                              </Form.Control.Feedback>
                            </Form.Group>
                          </Col>
                          <Col md={3}>
                            <Form.Group className="mb-3">
                              <Form.Label>
                                Hotel Category{" "}
                                <span className="text-danger">*</span>
                              </Form.Label>
                              <Form.Select
                                name="hotelCategoryId"
                                value={formData.hotelCategoryId}
                                onChange={handleInputChange}
                                isInvalid={!!validationErrors.hotelCategoryId}
                              >
                                <option value="">Select Category</option>
                                {hotelCategories.map((category) => (
                                  <option
                                    key={category.hotelCategoryId}
                                    value={category.hotelCategoryId}
                                  >
                                    {category.hotelCategory}
                                  </option>
                                ))}
                              </Form.Select>
                              <Form.Control.Feedback type="invalid">
                                {validationErrors.hotelCategoryId}
                              </Form.Control.Feedback>
                            </Form.Group>
                          </Col>
                          <Col md={3}>
                            <Form.Group className="mb-3">
                              <Form.Label>
                                Hotel Type{" "}
                                <span className="text-danger">*</span>
                              </Form.Label>
                              <Form.Select
                                name="hotelTypeId"
                                value={formData.hotelTypeId}
                                onChange={handleInputChange}
                                isInvalid={!!validationErrors.hotelTypeId}
                              >
                                <option value="">Select Type</option>
                                {hotelTypes.map((type) => (
                                  <option
                                    key={type.hotelTypeId}
                                    value={type.hotelTypeId}
                                  >
                                    {type.name}
                                  </option>
                                ))}
                              </Form.Select>
                              <Form.Control.Feedback type="invalid">
                                {validationErrors.hotelTypeId}
                              </Form.Control.Feedback>
                            </Form.Group>
                          </Col>
                          <Col md={3}>
                            <Form.Group className="mb-3">
                              <Form.Label>
                                Markup Type{" "}
                                <span className="text-danger">*</span>
                              </Form.Label>
                              <Form.Select
                                name="markupTypeId"
                                value={formData.markupTypeId}
                                onChange={handleInputChange}
                                isInvalid={!!validationErrors.markupTypeId}
                              >
                                <option value="">Select Markup Type</option>
                                {markupTypes.map((markup) => (
                                  <option key={markup.id} value={markup.id}>
                                    {formatMarkupOption(markup)}
                                  </option>
                                ))}
                              </Form.Select>
                              <Form.Control.Feedback type="invalid">
                                {validationErrors.markupTypeId}
                              </Form.Control.Feedback>
                            </Form.Group>
                          </Col>
                        </Row>

                        <Row>
                          <Col md={3}>
                            <Form.Group className="mb-3">
                              <Form.Label>
                                Child Complimentary Age Min{" "}
                                <span className="text-danger">*</span>
                              </Form.Label>
                              <Form.Control
                                type="number"
                                min={0}
                                name="childComAgeMin"
                                value={formData.childComAgeMin}
                                onChange={handleInputChange}
                                placeholder="5"
                                isInvalid={!!validationErrors.childComAgeMin}
                              />
                              <Form.Control.Feedback type="invalid">
                                {validationErrors.childComAgeMin}
                              </Form.Control.Feedback>
                            </Form.Group>
                          </Col>
                          <Col md={3}>
                            <Form.Group className="mb-3">
                              <Form.Label>
                                Child Complimentary Age Max{" "}
                                <span className="text-danger">*</span>
                              </Form.Label>
                              <Form.Control
                                type="number"
                                min={0}
                                name="childComAgeMax"
                                value={formData.childComAgeMax}
                                onChange={handleInputChange}
                                placeholder="10"
                                isInvalid={!!validationErrors.childComAgeMax}
                              />
                              <Form.Control.Feedback type="invalid">
                                {validationErrors.childComAgeMax}
                              </Form.Control.Feedback>
                            </Form.Group>
                          </Col>
                          <Col md={3}>
                            <Form.Group className="mb-3">
                              <Form.Label>
                                Child Chargeable Age Min{" "}
                                <span className="text-danger">*</span>
                              </Form.Label>
                              <Form.Control
                                type="number"
                                min={0}
                                name="childChargeableAgeMin"
                                value={formData.childChargeableAgeMin}
                                onChange={handleInputChange}
                                placeholder="11"
                                isInvalid={
                                  !!validationErrors.childChargeableAgeMin
                                }
                              />
                              <Form.Control.Feedback type="invalid">
                                {validationErrors.childChargeableAgeMin}
                              </Form.Control.Feedback>
                            </Form.Group>
                          </Col>
                          <Col md={3}>
                            <Form.Group className="mb-3">
                              <Form.Label>
                                Child Chargeable Age Max{" "}
                                <span className="text-danger">*</span>
                              </Form.Label>
                              <Form.Control
                                type="number"
                                min={0}
                                name="childChargeableAgeMax"
                                value={formData.childChargeableAgeMax}
                                onChange={handleInputChange}
                                placeholder="17"
                                isInvalid={
                                  !!validationErrors.childChargeableAgeMax
                                }
                              />
                              <Form.Control.Feedback type="invalid">
                                {validationErrors.childChargeableAgeMax}
                              </Form.Control.Feedback>
                            </Form.Group>
                          </Col>
                        </Row>
                      </div>
                    </Tab>

                    {/* Location Information Tab */}
                    <Tab
                      eventKey="location-info"
                      title={
                        <span>
                          <FaMapMarkerAlt className="me-2" /> Location Info
                        </span>
                      }
                    >
                      <div className="p-4">
                        <Row>
                          <Col md={3}>
                            <Form.Group className="mb-3">
                              <Form.Label>
                                Region <span className="text-danger">*</span>
                              </Form.Label>
                              <Form.Select
                                name="regionId"
                                value={formData.regionId}
                                onChange={handleInputChange}
                                isInvalid={!!validationErrors.regionId}
                              >
                                <option value="">Select Region</option>
                                {regions.map((region) => (
                                  <option key={region.id} value={region.id}>
                                    {region.name}
                                  </option>
                                ))}
                              </Form.Select>
                              <Form.Control.Feedback type="invalid">
                                {validationErrors.regionId}
                              </Form.Control.Feedback>
                            </Form.Group>
                          </Col>
                          <Col md={3}>
                            <Form.Group className="mb-3">
                              <Form.Label>
                                Country <span className="text-danger">*</span>
                              </Form.Label>
                              <Form.Select
                                name="countryId"
                                value={formData.countryId}
                                onChange={handleInputChange}
                                isInvalid={!!validationErrors.countryId}
                              >
                                <option value="">Select Country</option>
                                {countries.map((country) => (
                                  <option key={country.id} value={country.id}>
                                    {country.name}
                                  </option>
                                ))}
                              </Form.Select>
                              <Form.Control.Feedback type="invalid">
                                {validationErrors.countryId}
                              </Form.Control.Feedback>
                            </Form.Group>
                          </Col>
                          <Col md={3}>
                            <Form.Group className="mb-3">
                              <Form.Label>
                                City{" "}
                                <span className="text-danger">*</span>
                              </Form.Label>
                              <Form.Select
                                key={`state-${provinces.length}-${formData.countryId}`}
                                name="stateId"
                                value={formData.stateId}
                                onChange={handleInputChange}
                                disabled={!formData.countryId}
                                isInvalid={!!validationErrors.stateId}
                              >
                                <option value="">Select State/Province</option>
                                {provinces.map((province) => {
                                  // console.log("Rendering province:", province, "formData.stateId:", formData.stateId, "match:", province.id == formData.stateId);
                                  return (
                                    <option key={province.id} value={province.id}>
                                      {province.stateName}
                                    </option>
                                  );
                                })}
                              </Form.Select>
                              {provinces.length > 0 && (
                                <small className="text-muted">
                                  {provinces.length} provinces loaded
                                </small>
                              )}
                              <Form.Control.Feedback type="invalid">
                                {validationErrors.stateId}
                              </Form.Control.Feedback>
                            </Form.Group>
                          </Col>
                          <Col md={3}>
                            <Form.Group className="mb-3">
                              <Form.Label>
                                Location <span className="text-danger">*</span>
                              </Form.Label>
                              <Form.Select
                                key={`place-${places.length}-${formData.stateId}`}
                                name="placeId"
                                value={formData.placeId}
                                onChange={handleInputChange}
                                disabled={!formData.stateId}
                                isInvalid={!!validationErrors.placeId}
                              >
                                <option value="">Select City</option>
                                {places.map((place) => {
                                  // console.log("Rendering place:", place, "formData.placeId:", formData.placeId, "match:", place.id == formData.placeId);
                                  return (
                                    <option key={place.id} value={place.id}>
                                      {place.name}
                                    </option>
                                  );
                                })}
                              </Form.Select>
                              {places.length > 0 && (
                                <small className="text-muted">
                                  {places.length} places loaded
                                </small>
                              )}
                              <Form.Control.Feedback type="invalid">
                                {validationErrors.placeId}
                              </Form.Control.Feedback>
                            </Form.Group>
                          </Col>
                        </Row>

                        <Row>
                          <Col md={6}>
                            <Form.Group className="mb-3">
                              <Form.Label>Sub Location</Form.Label>
                              <InputGroup>
                                <Form.Select
                                  key={`subloc-${subLocations.length}-${formData.placeId}`}
                                  name="subLocationId"
                                  value={formData.subLocationId}
                                  onChange={handleInputChange}
                                  disabled={!formData.placeId}
                                >
                                  <option value="">Select Locality</option>
                                  {subLocations.map((sl) => (
                                    <option key={sl.id} value={sl.id}>
                                      {sl.locationName}
                                      {sl.locationCode ? ` (${sl.locationCode})` : ""}
                                    </option>
                                  ))}
                                </Form.Select>
                                <Button
                                  variant="outline-primary"
                                  type="button"
                                  onClick={openLocalityModal}
                                  disabled={!formData.placeId}
                                  title="Add new locality"
                                >
                                  <FaPlus />
                                </Button>
                              </InputGroup>
                              {formData.placeId && subLocations.length === 0 && (
                                <small className="text-muted">
                                  No localities yet — click + to add one
                                </small>
                              )}
                              {subLocations.length > 0 && (
                                <small className="text-muted">
                                  {subLocations.length} localities loaded
                                </small>
                              )}
                            </Form.Group>
                          </Col>
                        </Row>

                        <Form.Group className="mb-3">
                          <Form.Label>
                            Address <span className="text-danger">*</span>
                          </Form.Label>
                          <Form.Control
                            as="textarea"
                            rows={2}
                            name="address"
                            value={formData.address}
                            onChange={handleInputChange}
                            placeholder="Enter complete address"
                            isInvalid={!!validationErrors.address}
                          />
                          <Form.Control.Feedback type="invalid">
                            {validationErrors.address}
                          </Form.Control.Feedback>
                        </Form.Group>

                        <Row>
                          <Col md={4}>
                            <Form.Group className="mb-3">
                              <Form.Label>
                                Zipcode <span className="text-danger">*</span>
                              </Form.Label>
                              <Form.Control
                                type="text"
                                name="zipcode"
                                value={formData.zipcode}
                                onChange={handleInputChange}
                                placeholder="123456"
                                isInvalid={!!validationErrors.zipcode}
                              />
                              <Form.Control.Feedback type="invalid">
                                {validationErrors.zipcode}
                              </Form.Control.Feedback>
                            </Form.Group>
                          </Col>
                          <Col md={4}>
                            <Form.Group className="mb-3">
                              <Form.Label>Latitude</Form.Label>
                              <Form.Control
                                type="number"
                                step="any"
                                name="latitude"
                                value={formData.latitude}
                                onChange={handleInputChange}
                                placeholder="37.7749"
                              />
                            </Form.Group>
                          </Col>
                          <Col md={4}>
                            <Form.Group className="mb-3">
                              <Form.Label>Longitude</Form.Label>
                              <Form.Control
                                type="number"
                                step="any"
                                name="longitude"
                                value={formData.longitude}
                                onChange={handleInputChange}
                                placeholder="-122.4194"
                              />
                            </Form.Group>
                          </Col>
                        </Row>
                      </div>
                    </Tab>

                    {/* Contact Details Tab */}
                    <Tab
                      eventKey="contact-details"
                      title={
                        <span>
                          <FaPhone className="me-2" /> Contact
                          <Badge bg="info" className="ms-1">
                            {formData.contactDetails.length}
                          </Badge>
                        </span>
                      }
                    >
                      <div className="p-4">
                        {validationErrors.contactDetails && (
                          <Alert variant="danger" className="mb-3">
                            {validationErrors.contactDetails}
                          </Alert>
                        )}

                        {formData.contactDetails &&
                          formData.contactDetails.map((contact, index) => (
                            <Card key={index} className="mb-3">
                              <Card.Header className="d-flex justify-content-between align-items-center">
                                <h6 className="mb-0">Contact {index + 1}</h6>
                                <Button
                                  variant="outline-danger"
                                  size="sm"
                                  onClick={() => removeContactDetail(index)}
                                >
                                  <FaTrash />
                                </Button>
                              </Card.Header>
                              <Card.Body>
                                <Row>
                                  <Col md={6}>
                                    <Form.Group className="mb-3">
                                      <Form.Label>Contact Type</Form.Label>
                                      <Form.Select
                                        value={contact.contactTypeId}
                                        onChange={(e) =>
                                          updateContactDetail(
                                            index,
                                            "contactTypeId",
                                            e.target.value
                                          )
                                        }
                                      >
                                        <option value="">
                                          Select Contact Type
                                        </option>
                                        {contactTypes.map((type) => (
                                          <option
                                            key={type.contacttypeId}
                                            value={type.contacttypeId}
                                          >
                                            {type.name}
                                          </option>
                                        ))}
                                      </Form.Select>
                                    </Form.Group>
                                  </Col>
                                  <Col md={6}>
                                    <Form.Group className="mb-3">
                                      <Form.Label>Contact Person</Form.Label>
                                      <Form.Control
                                        type="text"
                                        value={contact.contactPerson}
                                        onChange={(e) =>
                                          updateContactDetail(
                                            index,
                                            "contactPerson",
                                            e.target.value
                                          )
                                        }
                                        placeholder="Enter contact person name"
                                      />
                                    </Form.Group>
                                  </Col>
                                </Row>
                                <Row>
                                  <Col md={6}>
                                    <Form.Group className="mb-3">
                                      <Form.Label>Personal Email</Form.Label>
                                      <Form.Control
                                        type="email"
                                        value={contact.personalEmail}
                                        onChange={(e) =>
                                          updateContactDetail(
                                            index,
                                            "personalEmail",
                                            e.target.value
                                          )
                                        }
                                        placeholder="Enter email address"
                                      />
                                    </Form.Group>
                                  </Col>
                                  <Col md={3}>
                                    <Form.Group className="mb-3">
                                      <Form.Label>Telephone</Form.Label>
                                      <Form.Control
                                        type="tel"
                                        value={contact.teleNumber}
                                        onChange={(e) =>
                                          updateContactDetail(
                                            index,
                                            "teleNumber",
                                            e.target.value
                                          )
                                        }
                                        placeholder="Enter telephone"
                                      />
                                    </Form.Group>
                                  </Col>
                                  <Col md={3}>
                                    <Form.Group className="mb-3">
                                      <Form.Label>Mobile</Form.Label>
                                      <Form.Control
                                        type="tel"
                                        value={contact.mobileNumber}
                                        onChange={(e) =>
                                          updateContactDetail(
                                            index,
                                            "mobileNumber",
                                            e.target.value
                                          )
                                        }
                                        placeholder="Enter mobile"
                                      />
                                    </Form.Group>
                                  </Col>
                                </Row>
                              </Card.Body>
                            </Card>
                          ))}

                        <Button
                          variant="outline-primary"
                          onClick={addContactDetail}
                          className="d-flex align-items-center gap-2"
                        >
                          <FaPlus /> Add Contact Detail
                        </Button>
                      </div>
                    </Tab>

                    {/* Bank Details Tab */}
                    <Tab
                      eventKey="bank-details"
                      title={
                        <span>
                          <FaUniversity className="me-2" /> Bank
                          <Badge bg="dark" className="ms-1">
                            {formData.bankDetails.length}
                          </Badge>
                        </span>
                      }
                    >
                      <div className="p-4">
                        {validationErrors.bankDetails && (
                          <Alert variant="danger" className="mb-3">
                            {validationErrors.bankDetails}
                          </Alert>
                        )}

                        {formData.bankDetails &&
                          formData.bankDetails.map((bank, index) => (
                            <Card key={index} className="mb-3">
                              <Card.Header className="d-flex justify-content-between align-items-center">
                                <h6 className="mb-0">Bank {index + 1}</h6>
                                <Button
                                  variant="outline-danger"
                                  size="sm"
                                  onClick={() => removeBankDetail(index)}
                                >
                                  <FaTrash />
                                </Button>
                              </Card.Header>
                              <Card.Body>
                                <Row>
                                  <Col md={6}>
                                    <Form.Group className="mb-3">
                                      <Form.Label>
                                        Bank{" "}
                                        <span className="text-danger">*</span>
                                      </Form.Label>
                                      <Form.Select
                                        value={bank.bankId}
                                        onChange={(e) =>
                                          updateBankDetail(
                                            index,
                                            "bankId",
                                            e.target.value
                                          )
                                        }
                                        isInvalid={
                                          !!validationErrors[
                                            `bank_${index}_bankId`
                                          ]
                                        }
                                      >
                                        <option value="">Select Bank</option>
                                        {banks.map((bankItem) => (
                                          <option
                                            key={bankItem.bankId}
                                            value={bankItem.bankId}
                                          >
                                            {bankItem.name}
                                          </option>
                                        ))}
                                      </Form.Select>
                                      <Form.Control.Feedback type="invalid">
                                        {
                                          validationErrors[
                                            `bank_${index}_bankId`
                                          ]
                                        }
                                      </Form.Control.Feedback>
                                    </Form.Group>
                                  </Col>
                                  <Col md={6}>
                                    <Form.Group className="mb-3">
                                      <Form.Label>Account Number <span className="text-danger">*</span></Form.Label>
                                      <Form.Control
                                        type="text"
                                        value={bank.accountNo}
                                        onChange={(e) =>
                                          updateBankDetail(
                                            index,
                                            "accountNo",
                                            e.target.value
                                          )
                                        }
                                        placeholder="Enter account number"
                                        isInvalid={
                                          !!validationErrors[
                                            `bank_${index}_accountNo`
                                          ]
                                        }
                                      />
                                      <Form.Control.Feedback type="invalid">
                                        {
                                          validationErrors[
                                            `bank_${index}_accountNo`
                                          ]
                                        }
                                      </Form.Control.Feedback>
                                    </Form.Group>
                                  </Col>
                                </Row>
                                <Row>
                                  <Col md={6}>
                                    <Form.Group className="mb-3">
                                      <Form.Label>IBAN</Form.Label>
                                      <Form.Control
                                        type="text"
                                        value={bank.iban}
                                        onChange={(e) =>
                                          updateBankDetail(
                                            index,
                                            "iban",
                                            e.target.value
                                          )
                                        }
                                        placeholder="Enter IBAN"
                                      />
                                    </Form.Group>
                                  </Col>
                                  <Col md={6}>
                                    <Form.Group className="mb-3">
                                      <Form.Label>SWIFT Code</Form.Label>
                                      <Form.Control
                                        type="text"
                                        value={bank.swiftCode}
                                        onChange={(e) =>
                                          updateBankDetail(
                                            index,
                                            "swiftCode",
                                            e.target.value
                                          )
                                        }
                                        placeholder="Enter SWIFT code"
                                      />
                                    </Form.Group>
                                  </Col>
                                </Row>
                                <Form.Group className="mb-3">
                                  <Form.Label>
                                    Bank Address{" "}
                                    {/* <span className="text-danger">*</span> */}
                                  </Form.Label>
                                  <Form.Control
                                    as="textarea"
                                    rows={2}
                                    value={bank.bankAddress}
                                    onChange={(e) =>
                                      updateBankDetail(
                                        index,
                                        "bankAddress",
                                        e.target.value
                                      )
                                    }
                                    placeholder="Enter bank address"
                                    isInvalid={
                                      !!validationErrors[
                                        `bank_${index}_bankAddress`
                                      ]
                                    }
                                  />
                                  <Form.Control.Feedback type="invalid">
                                    {
                                      validationErrors[
                                        `bank_${index}_bankAddress`
                                      ]
                                    }
                                  </Form.Control.Feedback>
                                </Form.Group>
                                <Row>
                                  <Col md={4}>
                                    <Form.Group className="mb-3">
                                      <Form.Label>Telephone</Form.Label>
                                      <Form.Control
                                        type="tel"
                                        value={bank.telephone}
                                        onChange={(e) =>
                                          updateBankDetail(
                                            index,
                                            "telephone",
                                            e.target.value
                                          )
                                        }
                                        placeholder="Enter telephone"
                                      />
                                    </Form.Group>
                                  </Col>
                                  <Col md={4}>
                                    <Form.Group className="mb-3">
                                      <Form.Label>Fax Number</Form.Label>
                                      <Form.Control
                                        type="tel"
                                        value={bank.faxNumber}
                                        onChange={(e) =>
                                          updateBankDetail(
                                            index,
                                            "faxNumber",
                                            e.target.value
                                          )
                                        }
                                        placeholder="Enter fax number"
                                      />
                                    </Form.Group>
                                  </Col>
                                  <Col md={4}>
                                    <Form.Group className="mb-3">
                                      <Form.Label>Contact Person</Form.Label>
                                      <Form.Control
                                        type="text"
                                        value={bank.contactPerson}
                                        onChange={(e) =>
                                          updateBankDetail(
                                            index,
                                            "contactPerson",
                                            e.target.value
                                          )
                                        }
                                        placeholder="Enter contact person"
                                      />
                                    </Form.Group>
                                  </Col>
                                </Row>
                              </Card.Body>
                            </Card>
                          ))}

                        <Button
                          variant="outline-primary"
                          onClick={addBankDetail}
                          className="d-flex align-items-center gap-2"
                        >
                          <FaPlus /> Add Bank Detail
                        </Button>
                      </div>
                    </Tab>

                    {/* Week Days Tab */}
                    <Tab
                      eventKey="week-days"
                      title={
                        <span>
                          <FaCalendarAlt className="me-2" /> Week Days
                        </span>
                      }
                    >
                      <div className="p-4">
                        <div className="week-days-container p-4 bg-light rounded-3 border">
                          <h6 className="text-danger fw-bold mb-3">
                            Week Details
                          </h6>

                          {/* Week Days Row */}
                          <div className="mb-4">
                            <div className="d-flex flex-wrap align-items-center mb-2">
                              <span
                                className="text-danger fw-bold me-3"
                                style={{ minWidth: "120px" }}
                              >
                                Week Days
                              </span>
                              <div className="d-flex flex-wrap gap-4">
                                {weekdays.map((day) => {
                                  const isChecked = formData.weekDays[day.key];
                                  // console.log(`Weekday ${day.label}: fieldName=${day.key}, isChecked=${isChecked}`);
                                  return (
                                    <Form.Check
                                      key={day.key}
                                      type="checkbox"
                                      id={`wd-${day.key}`}
                                      name={day.key}
                                      label={day.label}
                                      checked={isChecked}
                                      onChange={handleWeekdayChange}
                                      className="weekday-checkbox"
                                      style={{
                                        "--bs-form-check-input-checked-bg-color":
                                          "#fd7e14",
                                        "--bs-form-check-input-checked-border-color":
                                          "#fd7e14",
                                      }}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          {/* Week End Days Row */}
                          <div>
                            <div className="d-flex flex-wrap align-items-center">
                              <span
                                className="text-danger fw-bold me-3"
                                style={{ minWidth: "120px" }}
                              >
                                Week End Days
                              </span>
                              <div className="d-flex flex-wrap gap-4">
                                {weekdays.map((day) => {
                                  // Remove 'wd' prefix and capitalize first letter
                                  const dayName = day.key.replace('wd', '');
                                  const fieldName = `wed${dayName.charAt(0).toUpperCase() + dayName.slice(1)}`;
                                  const isChecked = formData.weekDays[fieldName];
                                  // console.log(`Weekend day ${day.label}: day.key=${day.key}, dayName=${dayName}, fieldName=${fieldName}, isChecked=${isChecked}`);
                                  return (
                                    <Form.Check
                                      key={`wed-${day.key}`}
                                      type="checkbox"
                                      id={`wed-${day.key}`}
                                      name={fieldName}
                                      label={day.label}
                                      checked={isChecked}
                                      onChange={handleWeekEndDayChange}
                                      className="weekday-checkbox"
                                      style={{
                                        "--bs-form-check-input-checked-bg-color":
                                          "#fd7e14",
                                        "--bs-form-check-input-checked-border-color":
                                          "#fd7e14",
                                      }}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Tab>

                    {/* Amenities Tab */}
                    <Tab
                      eventKey="amenities"
                      title={
                        <span>
                          <FaSwimmingPool className="me-2" /> Amenities
                          <Badge bg="info" className="ms-1">
                            {formData.amenityIds.length}
                          </Badge>
                        </span>
                      }
                    >
                      <div className="p-4">
                        <Row>
                          {/* Show all amenities, but check the ones from masterAmenityIds in edit mode */}
                          {amenities.map((amenity) => {
                            // Handle both field name possibilities: amenitiesId and amenityId
                            const amenityId = amenity.amenitiesId || amenity.amenityId;
                            const isChecked = formData.amenityIds.includes(Number(amenityId));
                            
                            // Enhanced debugging for specific amenity IDs
                            if (amenityId == 38 || amenityId == 39) {
                              // console.log(`=== DEBUGGING AMENITY ID ${amenityId} ===`);
                              // console.log(`Amenity object:`, amenity);
                              // console.log(`Extracted amenityId:`, amenityId);
                              // console.log(`formData.amenityIds:`, formData.amenityIds);
                              // console.log(`Number(amenityId):`, Number(amenityId));
                              // console.log(`formData.amenityIds.includes(Number(amenityId)):`, isChecked);
                              // console.log(`=== END DEBUGGING AMENITY ID ${amenityId} ===`);
                            }
                            
                            // console.log(`Amenity ${amenity.amenityName} (ID: ${amenityId}): checked=${isChecked}, formData.amenityIds=`, formData.amenityIds);
                            return (
                              <Col
                                md={4}
                                key={amenityId}
                                className="mb-3"
                              >
                                <Form.Check
                                  type="checkbox"
                                  id={`amenity-${amenityId}`}
                                  value={amenityId}
                                  label={amenity.amenityName}
                                  checked={isChecked}
                                  onChange={handleAmenityChange}
                                  className="custom-orange-checkbox"
                                />
                              </Col>
                            );
                          })}
                        </Row>
                       
                      </div>
                    </Tab>

                    {/* Rooms Tab */}
                    <Tab
                      eventKey="rooms"
                      title={
                        <span>
                          <FaBed className="me-2" /> Rooms
                          <Badge bg="warning" className="ms-1">
                            {formData.rooms.length}
                          </Badge>
                        </span>
                      }
                    >
                      <div className="p-4">
                        {validationErrors.rooms && (
                          <Alert variant="danger" className="mb-3">
                            <FaExclamationTriangle className="me-2" />
                            {validationErrors.rooms}
                          </Alert>
                        )}

                        {/* Room Category Selection Section */}
                        <Card className="mb-4 border-0 shadow-sm">
                          <Card.Header className="bg-light border-0">
                            <h5 className="mb-0 text-primary">
                              <FaBed className="me-2" />
                              Room Category
                            </h5>
                          </Card.Header>
                          <Card.Body>
                            <Row className="align-items-end">
                              <Col md={4}>
                                <Form.Group className="mb-3">
                                  <Form.Label className="fw-bold">
                                    <span className="text-danger">*</span> Room
                                    Category
                                  </Form.Label>
                                  <div className="flex-grow-1">
                                    <Select
  placeholder="SEARCH ROOM CATEGORY..."
  options={roomCategories.map(category => ({
    value: String(category.roomCategoryId),
    label: category.roomCategory,
    isDisabled:
      usedRoomCategoryIds.has(String(category.roomCategoryId)) &&
      String(selectedRoomCategory) !== String(category.roomCategoryId)
  }))}
  value={
    selectedRoomCategory
      ? {
          value: selectedRoomCategory,
          label:
            roomCategories.find(
              cat =>
                String(cat.roomCategoryId) === String(selectedRoomCategory)
            )?.roomCategory || "SELECT"
        }
      : null
  }
  onChange={(selectedOption) =>
    handleRoomCategoryChange(selectedOption?.value || "")
  }
  onInputChange={(newValue, { action }) => {
    if (action === "input-change") {
      handleRoomCategorySearch(newValue);
    }
  }}
  isClearable

  // ✅ FIX START
  menuPortalTarget={document.body}
  menuPosition="fixed"
  menuPlacement="auto"
  // ✅ FIX END

  className="react-select-container"
  classNamePrefix="react-select"
  styles={{
    control: (base) => ({
      ...base,
      borderColor: "#dee2e6",
      "&:hover": { borderColor: "#007bff" }
    }),
    menuPortal: (base) => ({
      ...base,
      zIndex: 9999   // 🔥 VERY IMPORTANT
    }),
    menu: (base) => ({
      ...base,
      zIndex: 9999
    })
  }}
/>
                                  </div>

                                </Form.Group>
                              </Col>
                              <Col md={8}>
                                {availableRoomTypes.length > 0 && (
                                  <Form.Group className="mb-3">
                                    <Form.Label className="fw-bold text-success">
                                      <FaBed className="me-2" />
                                      Room Type
                                    </Form.Label>
                                    <div className="d-flex flex-wrap gap-3">
                                      
                                      {availableRoomTypes.map(
                                        (roomType, index) => {
                                          {
                                            // console.log( "roomType:::::::::::", roomType);
                                          }
                                          const uniqueId = roomType.roomtypeId;
                                          const isChecked =
                                            selectedRoomTypes.includes(
                                              String(uniqueId)
                                            );
                                         
                                          return (
                                            <div
                                              key={`${uniqueId}-${index}`}
                                              className="form-check"
                                            >
                                              <input
                                                className="form-check-input"
                                                type="checkbox"
                                                id={`roomType-${uniqueId}-${index}`}
                                                checked={isChecked}
                                                onChange={(e) => {
                                                  
                                                  handleRoomTypeSelection(
                                                    uniqueId
                                                  );
                                                }}
                                              />
                                              <label
                                                className="form-check-label"
                                                htmlFor={`roomType-${uniqueId}-${index}`}
                                              >
                                                {roomType.name}
                                              </label>
                                            </div>
                                          );
                                        }
                                      )}
                                    </div>
                                  </Form.Group>
                                )}
                              </Col>
                            </Row>

                            <div className="text-center mt-3">
                              <div className="d-flex gap-2 justify-content-center">
                                <Button
                                  variant="outline-secondary"
                                  onClick={() => {
                                    // console.log("Clearing all selections");
                                    setSelectedRoomTypes([]);
                                  }}
                                  className="d-flex align-items-center gap-2 px-3 py-2"
                                >
                                  Clear All
                                </Button>
                                <Button
                                  variant="success"
                                  onClick={addRoomCategoryAndTypes}
                                  disabled={
                                    !selectedRoomCategory ||
                                    selectedRoomTypes.length === 0
                                  }
                                  className="d-flex align-items-center gap-2 px-4 py-2"
                                >
                                  <FaPlus />
                                  Add
                                </Button>
                              </div>
                            </div>
                          </Card.Body>
                        </Card>

                        {/* Added Room Categories Display */}
                     
                        {formData.rooms &&
                          formData.rooms.map((room, roomIndex) => (
                            <Card
                              key={roomIndex}
                              className="mb-4 border-0 shadow-sm"
                            >
                              <Card.Header className="bg-light border-0">
                                <div className="d-flex justify-content-between align-items-center">
                                  <div className="d-flex align-items-center">
                                    <div className="bg-success text-white rounded-circle p-2 me-3">
                                      <FaBed size={16} />
                                    </div>
                                    <div>
                                      <h6 className="mb-0 text-primary">
                                        {(() => {
                                        

                                          // Find the category by matching roomCategoryId (convert to number for comparison)
                                          const foundCategory =
                                            roomCategories.find(
                                              (cat) =>
                                                Number(cat.roomCategoryId) ===
                                                Number(room.roomCategoryId)
                                            );

                                        

                                          const categoryName =
                                            foundCategory?.roomCategory ||
                                            `Room Category ${roomIndex + 1}`;

                                          return categoryName;
                                        })()}
                                      </h6>
                                      <small className="text-muted">
                                        {room.roomTypes?.length || 0} room
                                        type(s) configured
                                      </small>
                                    </div>
                                  </div>
                                  <Button
                                    variant="outline-danger"
                                    size="sm"
                                    onClick={() => removeRoom(roomIndex)}
                                    className="rounded-pill"
                                  >
                                    <FaTrash className="me-1" />
                                    Remove
                                  </Button>
                                </div>
                              </Card.Header>
                              <Card.Body>
                                <div className="mb-3">
                                  <h6 className="text-success fw-bold mb-2">
                                    <FaBed className="me-2" />
                                    Room Type
                                  </h6>
                                  <div className="d-flex flex-wrap gap-3">
                                    {room.roomTypes?.map(
                                      (roomType, typeIndex) => (
                                        <div
                                          key={typeIndex}
                                          className="form-check"
                                        >
                                          <input
                                            className="form-check-input"
                                            type="checkbox"
                                            id={`room-${roomIndex}-type-${typeIndex}`}
                                            checked={true}
                                            readOnly
                                          />
                                          <label
                                            className="form-check-label"
                                            htmlFor={`room-${roomIndex}-type-${typeIndex}`}
                                          >
                                            {roomType.roomTypeName ||
                                              roomType.name ||
                                              `Room Type ${typeIndex + 1}`}
                                          </label>
                                        </div>
                                      )
                                    )}
                                  </div>
                                </div>
                              </Card.Body>
                            </Card>
                          ))}

                        {formData.rooms.length === 0 && (
                          <div className="text-center py-5 text-muted">
                            <FaBed size={64} className="mb-3 opacity-50" />
                            <h5 className="mb-2">No Room Categories Added</h5>
                            <p className="mb-4">
                              Select a room category above and choose room types
                              to get started.
                            </p>
                          </div>
                        )}
                      </div>
                    </Tab>

                    {/* Terms and Conditions Tab */}
                    <Tab
                      eventKey="terms-conditions"
                      title={
                        <span>
                          <FaFileContract className="me-2" /> Terms
                          <Badge bg="danger" className="ms-1">
                            {formData.termsAndConditions.length}
                          </Badge>
                        </span>
                      }
                    >
                      <div className="p-4">
                        {validationErrors.termsAndConditions && (
                          <Alert variant="danger" className="mb-3">
                            {validationErrors.termsAndConditions}
                          </Alert>
                        )}

                        {formData.termsAndConditions &&
                          formData.termsAndConditions.map((term, index) => (
                            <Card key={index} className="mb-3">
                              <Card.Header className="d-flex justify-content-between align-items-center">
                                <h6 className="mb-0">Term {index + 1}</h6>
                                <Button
                                  variant="outline-danger"
                                  size="sm"
                                  onClick={() => removeTermAndCondition(index)}
                                >
                                  <FaTrash />
                                </Button>
                              </Card.Header>
                              <Card.Body>
                                <Form.Group className="mb-3">
                                  <Form.Label>Term and Condition</Form.Label>
                                  <Form.Control
                                    as="textarea"
                                    rows={3}
                                    value={term}
                                    onChange={(e) =>
                                      updateTermAndCondition(
                                        index,
                                        e.target.value
                                      )
                                    }
                                    placeholder="Enter term and condition"
                                  />
                                </Form.Group>
                              </Card.Body>
                            </Card>
                          ))}

                        <Button
                          variant="outline-primary"
                          onClick={addTermAndCondition}
                          className="d-flex align-items-center gap-2"
                        >
                          <FaPlus /> Add Term and Condition
                        </Button>
                      </div>
                    </Tab>
                  </Tabs>

                  {/* Step Navigation & Submit Button Section */}
                  <div className="bg-light rounded-4 p-4 mt-4">
                    <Row className="align-items-center">
                      <Col md={8}>
                        <div className="d-flex align-items-center">
                          <div className="text-white rounded-circle p-3 me-3" style={{ background: "#EC0B43" }}>
                            <FaCheckCircle size={24} />
                          </div>
                          <div>
                            <h5 className="mb-1" style={{ color: "#EC0B43", fontWeight: 700, letterSpacing: "-0.02em" }}>
                              {activeTab === "terms-conditions"
                                ? "Ready to Register Hotel"
                                : "Continue Registration"}
                            </h5>
                            <p className="text-muted mb-0">
                              {activeTab === "terms-conditions"
                                ? "Review all information and click Register to complete."
                                : "Fill out all required fields and click Next to proceed."}
                            </p>
                          </div>
                        </div>
                      </Col>
                      <Col md={4} className="text-end">
                        {activeTab !== "terms-conditions" ? (
                          <Button
                            type="button"
                            variant="primary"
                            size="lg"
                            disabled={isLoading}
                            className="d-flex align-items-center gap-2 px-5 py-2 rounded-pill shadow handleNextStep"
                            onClick={handleNextStep}
                          >
                            Next
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="primary"
                            size="lg"
                            disabled={isLoading}
                            className="d-flex align-items-center gap-2 px-4 py-3 rounded-pill shadow handleRegister"
                            onClick={handleRegister}
                          >
                            {isLoading ? (
                              <>
                                <span
                                  className="spinner-border spinner-border-sm me-2"
                                  role="status"
                                  aria-hidden="true"
                                ></span>
                                {isEditMode
                                  ? "Updating Hotel..."
                                  : "Registering Hotel..."}
                              </>
                            ) : (
                              <>
                                <FaSave />
                                {isEditMode ? "Update Hotel" : "Register"}
                              </>
                            )}
                          </Button>
                        )}
                      </Col>
                    </Row>
                  </div>
                </Form>
              </Card.Body>
            </Card>
          </Container>
        </main>
      </div>

      {/* Quick-add Locality Modal */}
      <Modal
        show={showLocalityModal}
        onHide={closeLocalityModal}
        centered
        backdrop="static"
        keyboard={false}
      >
        <Modal.Header closeButton={!isSavingLocality}>
          <Modal.Title>Add Locality</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>
                Locality Name <span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                value={localityName}
                onChange={(e) => {
                  setLocalityName(e.target.value);
                  setLocalityError("");
                }}
                placeholder="Enter locality name"
                isInvalid={!!localityError && !localityName.trim()}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>
                Locality Code <span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                value={localityCode}
                onChange={(e) => {
                  setLocalityCode(e.target.value);
                  setLocalityError("");
                }}
                placeholder="Enter locality code"
                isInvalid={!!localityError && !localityCode.trim()}
              />
            </Form.Group>
            {localityError && (
              <div className="alert alert-danger py-2 small mb-0">
                {localityError}
              </div>
            )}
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={closeLocalityModal}
            disabled={isSavingLocality}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSaveLocality}
            disabled={isSavingLocality}
          >
            {isSavingLocality ? (
              <>
                <span
                  className="spinner-border spinner-border-sm me-2"
                  role="status"
                  aria-hidden="true"
                />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default HotelReg;
