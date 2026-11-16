import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Card,
  Button,
  Table,
  Modal,
  Form,
  Pagination,
  Row,
  Col,
} from "react-bootstrap";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/TopBar";
import axiosInstance from "../../components/AxiosInstance";
import axios from "axios";
import Select from "react-select";
import { toast } from "react-hot-toast";
import Swal from "sweetalert2";
import {
  FaEdit,
  FaTrash,
  FaEye,
  FaPlus,
  FaDollarSign,
  FaLock,
  FaBackward,
} from "react-icons/fa";

// Fixed catalog of special requirements a cab provider can advertise.
// react-select `{value,label}[]` shape; the value doubles as the string
// stored in the DB (cab_rate_special_requirements.description), so any
// edit here reflects immediately in every downstream display.
const SPECIAL_REQUIREMENTS_OPTIONS = [
  { value: "Name Board", label: "Name Board" },
  { value: "Child Seat", label: "Child Seat" },
  { value: "Baby Seat", label: "Baby Seat" },
  { value: "Booster Seat", label: "Booster Seat" },
  { value: "Wheelchair Accessible", label: "Wheelchair Accessible" },
  { value: "Extra Luggage", label: "Extra Luggage" },
  { value: "Pet Friendly", label: "Pet Friendly" },
  { value: "English Speaking Driver", label: "English Speaking Driver" },
];

const CabRates = () => {
  const navigate = useNavigate();
  const location = useLocation();
  console.log("location state:::", location.state);

  // Get cabProviderId from navigation state - make it reactive
  const [cabProviderId, setCabProviderId] = useState(() => {
    const state = location.state;
    const id =
      state?.cabProviderId ??
      state?.cabProvider?.cabprovider ??
      state?.cabProvider?.cabproviderId ??
      state?.cabProvider?.id ??
      "";
    return String(id || "");
  });
  const [cabProviderName, setCabProviderName] = useState(() => {
    return location.state?.cabProviderName || "";
  });
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [isViewMode, setIsViewMode] = useState(false);
  const [search, setSearch] = useState("");
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [marketTypeList, setMarketTypeList] = useState([]);
  const [cabFullList, setCabFullList] = useState([]);
  const [validationErrors, setValidationErrors] = useState({});

  // Selected cab's zone (pickup/dropoff locations from CabZone master)
  const [cabZonePickup, setCabZonePickup] = useState([]); // [{id, locationId, locationName, source}]
  const [cabZoneDropoff, setCabZoneDropoff] = useState([]);

  const fetchCabZone = async (cabId) => {
    if (!cabId) {
      setCabZonePickup([]);
      setCabZoneDropoff([]);
      return;
    }
    try {
      const res = await axiosInstance.get(`/api/cab-zones/by-cab/${cabId}`);
      const zone = res.data || {};
      const pickups = Array.isArray(zone.pickupLocations) ? zone.pickupLocations : [];
      const dropoffs = Array.isArray(zone.dropoffLocations) ? zone.dropoffLocations : [];
      console.log(
        `[CabRates] zone for cab ${cabId}:`,
        pickups.length,
        "pickup |",
        dropoffs.length,
        "dropoff"
      );
      setCabZonePickup(pickups);
      setCabZoneDropoff(dropoffs);
    } catch (err) {
      console.error("Error loading cab zone:", err);
      setCabZonePickup([]);
      setCabZoneDropoff([]);
    }
  };

  // Form state for modal
  const [formData, setFormData] = useState({
    cabId: "",
    rateCode: "",
    marketType: [],
    cabProviderId: cabProviderId,
    cabratesId: "",
  });

  // Safety-net: any code path that sets formData.cabId (handleEdit, handleView,
  // updateFormData, programmatic seeds, etc.) refetches the cab's zone here.
  useEffect(() => {
    if (formData.cabId) {
      fetchCabZone(formData.cabId);
    } else {
      setCabZonePickup([]);
      setCabZoneDropoff([]);
    }
  }, [formData.cabId]);

  // Rate Grid state — Transfers only (travelType "1"); no Hours field.
  const newTransferRow = (id) => ({
    id,
    pickupZoneLocationId: "",
    dropoffZoneLocationId: "",
    pickupTime: "",
    dropoffTime: "",
    minPax: "",
    maxPax: "",
    sicPerWay: "",
    privateTotal: "",
    privatePerPax: "",
    luggage: false,
    // Per-route driver/distance fields surfaced on the search-result View
    // modal. Optional — blank means the modal renders "—" for that line.
    driverWaitingTime: "",
    distance: "",
  });

  const [transfersRows, setTransfersRows] = useState([newTransferRow(1)]);

  // Validity dates state
  const [validityDates, setValidityDates] = useState([
    {
      id: 1,
      validityFrom: "",
      validityTo: "",
    },
  ]);

  // ── Terms & Conditions / Cancellation Policies state ──────────────
  // Two independent dynamic lists, edited as rows in the modal and sent
  // back to the API as `termsAndConditions` / `cancellationPolicies`
  // arrays of strings on the CabRateDTO. Empty rows are filtered out at
  // save-time (backend also defends).
  const newPolicyRow = (id) => ({ id, value: "" });
  const [termsRows, setTermsRows] = useState([newPolicyRow(1)]);
  const [cancellationRows, setCancellationRows] = useState([newPolicyRow(1)]);

  // Special Requirements — multi-select picked from SPECIAL_REQUIREMENTS_OPTIONS.
  // Held as the react-select `{value,label}[]` shape; flattened to string[]
  // in transformToPayload and hydrated back to option-objects in handleEdit.
  const [selectedSpecialRequirements, setSelectedSpecialRequirements] = useState([]);

  const addPolicyRow = (setter) =>
    setter((prev) => [...prev, newPolicyRow(Date.now())]);
  const removePolicyRow = (setter, id) =>
    setter((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  const updatePolicyRow = (setter, id, value) =>
    setter((prev) => prev.map((r) => (r.id === id ? { ...r, value } : r)));

  const openCreate = () => {
    setEditing(null);
    setIsViewMode(false);
    setValidationErrors({}); // Clear any existing validation errors
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setIsViewMode(false);
    // Clear validation errors
    setValidationErrors({});
    // Reset form data
    setFormData({
      cabId: "",
      rateCode: "",
      marketType: [],
      cabProviderId: cabProviderId,
      cabratesId: "",
    });
    // Reset rate grid
    setTransfersRows([newTransferRow(1)]);
    // Reset cab zone (so next open starts clean)
    setCabZonePickup([]);
    setCabZoneDropoff([]);
    // Reset validity dates
    setValidityDates([
      {
        id: 1,
        validityFrom: "",
        validityTo: "",
      },
    ]);
    // Reset T&C / cancellation rows + special requirements picks
    setTermsRows([newPolicyRow(1)]);
    setCancellationRows([newPolicyRow(1)]);
    setSelectedSpecialRequirements([]);
  };

  // ── Rate Grid helpers (per-grid: transfers + carRental) ───────────────
  const addTransferRow = () =>
    setTransfersRows((prev) => [...prev, newTransferRow(Date.now())]);
  const removeTransferRow = (id) =>
    setTransfersRows((prev) =>
      prev.length > 1 ? prev.filter((r) => r.id !== id) : prev
    );
  const updateTransferRow = (id, field, value) =>
    setTransfersRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );

  // Add new validity date range
  const addValidityDate = () => {
    const newDate = {
      id: Date.now(),
      validityFrom: "",
      validityTo: "",
    };
    setValidityDates([...validityDates, newDate]);
  };

  // Remove validity date range
  const removeValidityDate = (id) => {
    if (validityDates.length > 1) {
      setValidityDates(validityDates.filter((date) => date.id !== id));
    }
  };

  // Update validity date
  const updateValidityDate = (id, field, value) => {
    setValidityDates(
      validityDates.map((date) =>
        date.id === id ? { ...date, [field]: value } : date
      )
    );
  };

  // Update form data
  const updateFormData = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    // When the cab changes, refresh the per-cab zone (used by the Pickup /
    // Dropoff dropdowns inside the rate grid) and reset any prior zone
    // selections on existing rate-grid rows so we don't keep stale ids.
    if (field === "cabId") {
      fetchCabZone(value);
      const clearZones = (rows) =>
        rows.map((row) => ({
          ...row,
          pickupZoneLocationId: "",
          dropoffZoneLocationId: "",
        }));
      setTransfersRows(clearZones);
    }

    // Clear validation error when user makes changes
    if (validationErrors[field]) {
      setValidationErrors((prev) => ({
        ...prev,
        [field]: "",
      }));
    }
  };

  // Validation function
  const validateCabRateForm = (data) => {
    const newErrors = {};

    const getStringValue = (value) => {
      return value ? String(value).trim() : "";
    };

    // Required field validations
    if (!getStringValue(data.cabId)) newErrors.cabId = "Cab is required";
    if (!getStringValue(data.rateCode))
      newErrors.rateCode = "Rate code is required";
    if (!data.marketType || data.marketType.length === 0)
      newErrors.marketType = "Market is required";

    return newErrors;
  };

  // Validation function for validity dates
  const validateValidityDates = () => {
    const errors = [];
    
    validityDates.forEach((date, index) => {
      if (date.validityFrom && date.validityTo) {
        const fromDate = new Date(date.validityFrom);
        const toDate = new Date(date.validityTo);
        
        if (toDate <= fromDate) {
          errors.push(`Validity period ${index + 1}: "To" date must be after "From" date`);
        }
      }
    });
    
    return errors;
  };

  // Helper function to convert date from YYYY-MM-DD to DD/MM/YYYY
  const formatDateForAPI = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Helper function to convert date from DD/MM/YYYY to YYYY-MM-DD for form inputs
  const convertDateFromAPI = (dateString) => {
    if (!dateString) return "";
    // Split DD/MM/YYYY format
    const parts = dateString.split('/');
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }
    return dateString;
  };

  // Helper function to get minimum date for "To" date (next day after "From" date)
  const getMinToDate = (fromDate) => {
    if (!fromDate) return "";
    const date = new Date(fromDate);
    date.setDate(date.getDate() + 1);
    return date.toISOString().split('T')[0];
  };

  // Transform data to match API payload
  const transformToPayload = () => {
    const payload = {
      marketype: formData.marketType,
      cabId: parseInt(formData.cabId) || 0,
      cabratesId: editing ? parseInt(editing.cabratesId) : null,
      rateCode: formData.rateCode,
      cabproviderId: formData.cabProviderId ? parseInt(formData.cabProviderId) : null,
      cabRateValidityDTOList: validityDates.map((date) => ({
        cabValidityId: editing ? (date.cabValidityId || null) : null,
        validityFrom: formatDateForAPI(date.validityFrom),
        validityTo: formatDateForAPI(date.validityTo)
      })),
      cabRateDetailsDTOList: transfersRows.map((row) => ({
        minpax: parseInt(row.minPax) || 0,
        maxpax: parseInt(row.maxPax) || 0,
        locationId: 0,
        sicRate: parseFloat(row.sicPerWay) || 0,
        luggage: Boolean(row.luggage),
        hourDetails: "",
        cabRatesdetailsId: editing ? (row.cabRatesdetailsId || null) : null,
        travelType: "1",
        pickupZoneLocationId: row.pickupZoneLocationId
          ? parseInt(row.pickupZoneLocationId)
          : null,
        dropoffZoneLocationId: row.dropoffZoneLocationId
          ? parseInt(row.dropoffZoneLocationId)
          : null,
        pickupTime: row.pickupTime || "",
        dropoffTime: row.dropoffTime || "",
        privateTotalRate:
          row.privateTotal !== "" && row.privateTotal != null
            ? parseFloat(row.privateTotal)
            : null,
        privatePerPaxRate:
          row.privatePerPax !== "" && row.privatePerPax != null
            ? parseFloat(row.privatePerPax)
            : null,
        // Per-route driver-side details. Blank values become null so the
        // server stores SQL NULL (treated as "—" on the search View modal)
        // rather than empty-string / zero artefacts.
        driverWaitingTime:
          row.driverWaitingTime && String(row.driverWaitingTime).trim() !== ""
            ? String(row.driverWaitingTime).trim()
            : null,
        distance:
          row.distance !== "" && row.distance != null
            ? parseFloat(row.distance)
            : null,
      })),
      // T&C / Cancellation rows — drop blanks; backend stores via
      // @ElementCollection on CabRates. Optional fields — sending []
      // (or omitting them entirely) keeps existing behaviour intact.
      termsAndConditions: termsRows
        .map((r) => (r.value || "").trim())
        .filter((v) => v.length > 0),
      cancellationPolicies: cancellationRows
        .map((r) => (r.value || "").trim())
        .filter((v) => v.length > 0),
      // Multi-select picks flatten to a plain string list — matches the
      // @ElementCollection<String> shape on CabRates. Empty selection sends
      // an empty array, which the backend treats as "no special services".
      specialRequirements: (selectedSpecialRequirements || [])
        .map((opt) => (opt?.value || "").trim())
        .filter((v) => v.length > 0),
    };
    return payload;
  };

  // Save cab rate
  const saveCabRate = async () => {
    try {
      // Form validation
      const errors = validateCabRateForm(formData);
      if (Object.keys(errors).length > 0) {
        setValidationErrors(errors);
        return;
      }

      if (!formData.cabProviderId) {
        toast.error(
          "No Cab Provider selected. Please navigate from Cab Provider page."
        );
        return;
      }

      if (
        validityDates.some((date) => !date.validityFrom || !date.validityTo)
      ) {
        toast.error("Please fill in all validity date ranges");
        return;
      }

      // Validate validity dates
      const validityErrors = validateValidityDates();
      if (validityErrors.length > 0) {
        toast.error(validityErrors[0]);
        return;
      }

      const transferRowInvalid = (row) =>
        !row.minPax ||
        !row.maxPax ||
        !row.sicPerWay ||
        !row.privateTotal ||
        !row.privatePerPax;

      if (transfersRows.some(transferRowInvalid)) {
        toast.error("Please fill in all rate grid fields");
        return;
      }

      const payload = transformToPayload();
      console.log("Payload:", JSON.stringify(payload, null, 2));
      console.log("Date format examples:");
      console.log(
        "validityFrom:",
        payload.cabRateValidityDTOList[0]?.validityFrom
      );
      console.log("validityTo:", payload.cabRateValidityDTOList[0]?.validityTo);

      setLoading(true);
      const response = await axiosInstance.post(
        "/api/cabRates/register",
        payload
      );

      if (response.data) {
        toast.success("Cab rate saved successfully!");
        closeModal();
        fetchCabRatesList(search);
      }
    } catch (error) {
      console.error("Error saving cab rate:", error);
      toast.error("Failed to save cab rate. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const loadMarketTypes = async () => {
    try {
      const response = await axiosInstance.get("/api/marketType");
      setMarketTypeList(response.data || []);
    } catch (error) {
      console.error("Error loading market types:", error);
      // toast.error("Failed to load countries");
    }
  };

  // Fetch cab rates list
  const fetchCabRatesList = async (searchTerm = "") => {
  if (!cabProviderId) {
    setRates([]);
    return;
  }

  try {
    setIsLoading(true);
    setRates([]);

    const response = await axiosInstance.get(`/api/cabRates`, {
      params: {
        providerId: cabProviderId,
        page: 0,
        limit: 20,
        search: searchTerm || ""
      }
    });

    setRates(response.data || []);
    console.log("cab rates list ::", response.data);

  } catch (error) {
    console.error("Error loading cab rates:", error);
    setRates([]);
  } finally {
    setIsLoading(false);
  }
};


  
  //cab list 
  const cabsList = async () => {
    if (!cabProviderId) return;
    try {
   const cabList = await axiosInstance.get(`/api/cabProvider/cabs/${cabProviderId}`);
   console.log("cab list::", cabList.data);
   setCabFullList(cabList.data);
      
    } catch (error) {
      console.error("cab list error:", error);
     
    }
  };

  useEffect(() => {
    loadMarketTypes();
  }, []);

  // Update cabProviderId and cabProviderName when location.state changes
  useEffect(() => {
    const state = location.state;
    const newProviderId =
      state?.cabProviderId ??
      state?.cabProvider?.cabprovider ??
      state?.cabProvider?.cabproviderId ??
      state?.cabProvider?.id ??
      "";
    const newProviderName = state?.cabProviderName || "";

    // Normalize IDs to strings for comparison
    const normalizedNewId = String(newProviderId || "");
    const normalizedCurrentId = String(cabProviderId || "");

    // If provider ID changed, clear rates immediately and update state
    if (normalizedNewId !== normalizedCurrentId && normalizedNewId !== "") {
      setRates([]); // Clear rates immediately to prevent showing stale data
      setCabFullList([]); // Clear cab list as well
      setSearch(""); // Clear search term
      setCabProviderId(normalizedNewId);
      setCabProviderName(newProviderName);
    } else if (newProviderName !== cabProviderName) {
      setCabProviderName(newProviderName);
    }
  }, [location.state, location.key, cabProviderId, cabProviderName]);

  useEffect(() => {
    if (cabProviderId) {
      fetchCabRatesList();
      cabsList();
    } else {
      setRates([]);
      setCabFullList([]);
    }
  }, [cabProviderId]);

  // Search functionality
  useEffect(() => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    const timeout = setTimeout(() => {
      fetchCabRatesList(search);
    }, 500);

    setSearchTimeout(timeout);

    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [search]);

  // Update formData when cabProviderId changes
  useEffect(() => {
    if (cabProviderId) {
      console.log("Received cabProviderId:", cabProviderId);
      setFormData((prev) => ({ ...prev, cabProviderId: cabProviderId }));
    }
  }, [cabProviderId]);

  // Edit cab rate
  const handleEdit = (rate) => {
    console.log("Edit rate data:", rate);
    setEditing(rate);
    setIsViewMode(false);
    setShowModal(true);

    // Populate form with existing data - mapping API structure
    setFormData({
      cabId: rate.cabId ? rate.cabId.toString() : "",
      rateCode: rate.rateCode || "",
      marketType: rate.marketype || [],
      cabProviderId: rate.cabproviderId || cabProviderId,
      cabratesId: rate.cabratesId ? rate.cabratesId.toString() : ""
    });

    // Load this cab's zone so the per-row Pickup/Dropoff dropdowns are populated
    if (rate.cabId) {
      fetchCabZone(rate.cabId);
    }

    // Populate validity dates - mapping API structure
    if (rate.cabRateValidityDTOList && rate.cabRateValidityDTOList.length > 0) {
      const mappedValidityDates = rate.cabRateValidityDTOList.map((date, index) => ({
        id: index + 1,
        validityFrom: date.validityFrom ? convertDateFromAPI(date.validityFrom) : "",
        validityTo: date.validityTo ? convertDateFromAPI(date.validityTo) : ""
      }));
      setValidityDates(mappedValidityDates);
    } else {
      // Reset to default if no validity dates
      setValidityDates([{
        id: 1,
        validityFrom: "",
        validityTo: "",
      }]);
    }

    // Split incoming rate details by travelType into the two grids.
    populateGridsFromRateDetails(rate.cabRateDetailsDTOList);

    // T&C / Cancellation — seed from the loaded rate. Falls back to a
    // single empty row so the operator can immediately start typing.
    populatePolicyRowsFromRate(rate);
  };

  // Map the server's list-of-strings policy fields back into the local
  // editable row shape (`{id, value}`). Empty input → one blank row.
  // Also hydrates selectedSpecialRequirements from the same rate — the
  // stored strings are matched back to their SPECIAL_REQUIREMENTS_OPTIONS
  // entry when possible; unknown values (e.g. an option removed from the
  // catalog) are kept as {value: x, label: x} so nothing silently vanishes.
  const populatePolicyRowsFromRate = (rate) => {
    const seed = (list) =>
      Array.isArray(list) && list.length > 0
        ? list.map((v, i) => ({ id: i + 1, value: String(v ?? "") }))
        : [newPolicyRow(1)];
    setTermsRows(seed(rate?.termsAndConditions));
    setCancellationRows(seed(rate?.cancellationPolicies));

    const seedSpecial = Array.isArray(rate?.specialRequirements)
      ? rate.specialRequirements
          .filter((v) => v != null && String(v).trim().length > 0)
          .map((v) => {
            const value = String(v);
            const match = SPECIAL_REQUIREMENTS_OPTIONS.find(
              (opt) => opt.value === value,
            );
            return match || { value, label: value };
          })
      : [];
    setSelectedSpecialRequirements(seedSpecial);
  };

  // Helper: map a server-side cabRateDetailsDTOList into transfer rows.
  const populateGridsFromRateDetails = (list) => {
    if (!Array.isArray(list) || list.length === 0) {
      setTransfersRows([newTransferRow(1)]);
      return;
    }
    const transfers = list
      .filter((detail) => String(detail.travelType) !== "2")
      .map((detail, index) => ({
        id: index + 1,
        minPax: detail.minpax != null ? detail.minpax.toString() : "",
        maxPax: detail.maxpax != null ? detail.maxpax.toString() : "",
        sicPerWay: detail.sicRate != null ? detail.sicRate.toString() : "",
        privateTotal:
          detail.privateTotalRate != null ? detail.privateTotalRate.toString() : "",
        privatePerPax:
          detail.privatePerPaxRate != null ? detail.privatePerPaxRate.toString() : "",
        luggage: detail.luggage || false,
        pickupZoneLocationId: detail.pickupZoneLocationId
          ? detail.pickupZoneLocationId.toString()
          : "",
        dropoffZoneLocationId: detail.dropoffZoneLocationId
          ? detail.dropoffZoneLocationId.toString()
          : "",
        pickupTime: detail.pickupTime || "",
        dropoffTime: detail.dropoffTime || "",
        driverWaitingTime: detail.driverWaitingTime || "",
        distance:
          detail.distance != null ? detail.distance.toString() : "",
        cabRatesdetailsId: detail.cabRatesdetailsId || null,
      }));
    setTransfersRows(transfers.length > 0 ? transfers : [newTransferRow(1)]);
  };

  // View cab rate
  const handleView = (rate) => {
    setEditing(rate);
    setIsViewMode(true);
    setShowModal(true);

    // Populate form with existing data - mapping API structure (same as edit)
    setFormData({
      cabId: rate.cabId ? rate.cabId.toString() : "",
      rateCode: rate.rateCode || "",
      marketType: rate.marketype || [],
      cabProviderId: rate.cabproviderId || cabProviderId,
      cabratesId: rate.cabratesId ? rate.cabratesId.toString() : ""
    });

    if (rate.cabId) {
      fetchCabZone(rate.cabId);
    }
    
    // Populate validity dates - mapping API structure
    if (rate.cabRateValidityDTOList && rate.cabRateValidityDTOList.length > 0) {
      const mappedValidityDates = rate.cabRateValidityDTOList.map((date, index) => ({
        id: index + 1,
        validityFrom: date.validityFrom ? convertDateFromAPI(date.validityFrom) : "",
        validityTo: date.validityTo ? convertDateFromAPI(date.validityTo) : ""
      }));
      setValidityDates(mappedValidityDates);
    } else {
      setValidityDates([{
        id: 1,
        validityFrom: "",
        validityTo: "",
      }]);
    }
    
    // Populate rate grid - mapping API structure
    populateGridsFromRateDetails(rate.cabRateDetailsDTOList);

    // T&C / Cancellation — view mode reuses the same seed helper.
    populatePolicyRowsFromRate(rate);
  };

  // Delete cab rate
  const handleDelete = (rate) => {

     Swal.fire({
      titleText: `Are you sure? You want to delete rate: ${rate.rateCode}`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete it!",
      customClass: {
        popup: "swal-small",
        title: "swal-small-title",
        htmlContainer: "swal-small-text",
      },
    }).then((result) => {
      if (result.isConfirmed) {
        deleteCabRate(rate.cabratesId);
      }
    });
  };

  // Delete API call
  const deleteCabRate = async (id) => {
    try {
      await axiosInstance.delete(`/api/cabRates/${id}`);
      toast.success("Cab rate deleted successfully");
      fetchCabRatesList(search);
    } catch (error) {
      console.error("Delete error:", error);
      toast.error(
        `Failed to delete cab rate: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  };

  // Update cab rate
  const updateCabRate = async () => {
    try {
      // Form validation
      const errors = validateCabRateForm(formData);
      if (Object.keys(errors).length > 0) {
        setValidationErrors(errors);
        return;
      }

      if (!formData.cabProviderId) {
        toast.error(
          "No Cab Provider selected. Please navigate from Cab Provider page."
        );
        return;
      }

      if (
        validityDates.some((date) => !date.validityFrom || !date.validityTo)
      ) {
        toast.error("Please fill in all validity date ranges");
        return;
      }

      // Validate validity dates
      const validityErrors = validateValidityDates();
      if (validityErrors.length > 0) {
        toast.error(validityErrors[0]);
        return;
      }

      const transferRowInvalid = (row) =>
        !row.minPax ||
        !row.maxPax ||
        !row.sicPerWay ||
        !row.privateTotal ||
        !row.privatePerPax;

      if (transfersRows.some(transferRowInvalid)) {
        toast.error("Please fill in all rate grid fields");
        return;
      }

      const payload = transformToPayload();
      console.log("Update Payload:", JSON.stringify(payload, null, 2));

      setLoading(true);
      const response = await axiosInstance.put(
        `/api/cabRates/${editing.cabratesId}`,
        payload
      );

      if (response.data) {
        toast.success("Cab rate updated successfully!");
        closeModal();
        fetchCabRatesList(search);
      }
    } catch (error) {
      console.error("Error updating cab rate:", error);
      toast.error("Failed to update cab rate. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">
      <Topbar />
      <div className="d-flex flex-grow-1">
        <Sidebar />
        <main className="flex-grow-1 p-4">
          <Card className="shadow-sm rounded-xl">
            <Card.Header className="d-flex justify-content-between align-items-center">
              <div>
                <Button
                  variant="outline-primary"
                  onClick={() => navigate("/registration/cabProvider")}
                  className="mb-2 me-3"
                  size="sm"
                >
                  <FaBackward className="me-2" />
                  Back to Cab Providers
                </Button>
                <span className="fw-semibold">
                  <FaDollarSign className="me-2 text-success" />
                  Cab Rates
                  {cabProviderId ? (
                    <span className="text-muted ms-2">
                      (Provider ID: {cabProviderId})
                    </span>
                  ) : (
                    <span className="text-warning ms-2">
                      (No Provider Selected)
                    </span>
                  )}
                </span>
              </div>
              <div className="d-flex align-items-center gap-3">
                <div className="position-relative">
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Search rates..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ width: "250px" }}
                  />
                  <i className="fas fa-search position-absolute top-50 end-0 translate-middle-y me-2 text-muted"></i>
                </div>
                <Button className="btn-green" onClick={openCreate}>
                  + Create
                </Button>
              </div>
            </Card.Header>
            <Card.Body className="p-0">
              <Table responsive hover striped className="mb-0 align-middle">
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>S/N</th>
                    <th>Rate Code</th>
                    <th>Cab Provider</th>
                    <th>Cab</th>
                    <th>Market</th>
                    <th>Validity From</th>
                    <th>Validity To</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td colSpan="8" className="text-center text-muted py-4">
                        <div
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                        >
                          <span className="visually-hidden">Loading...</span>
                        </div>
                        Loading cab rates...
                      </td>
                    </tr>
                  )}
                  {!isLoading && rates.length === 0 && (
                    <tr>
                      <td colSpan="8" className="text-center text-muted py-4">
                        No rates found. Click "Create" to add new rates.
                      </td>
                    </tr>
                  )}
                  {console.log("Rates:", rates)}
                  {!isLoading &&
                    rates.map((rate, index) => (
                      <tr key={rate.cabratesId || index}>
                        <td>{index + 1}</td>
                        <td>{rate.rateCode || "N/A"}</td>
                        <td>{cabProviderName || "N/A"}</td>
                        <td>{rate.cabId || "N/A"}</td>
                        <td>
                          {rate.marketype && rate.marketype.length > 0
                            ? rate.marketype.join(", ")
                            : "N/A"}
                        </td>
                        <td>
                          {rate.cabRateValidityDTOList?.[0]?.validityFrom ||
                            "N/A"}
                        </td>
                        <td>
                          {rate.cabRateValidityDTOList?.[0]?.validityTo ||
                            "N/A"}
                        </td>

                        <td>
                          <div className="d-flex gap-2">
                            <FaEdit
                              className="text-primary edit"
                              style={{ cursor: "pointer", fontSize: "18px" }}
                              onClick={() => handleEdit(rate)}
                              title="Edit"
                            />
                            <FaEye
                              className="text-info view"
                              style={{ cursor: "pointer", fontSize: "18px" }}
                              onClick={() => handleView(rate)}
                              title="View"
                            />
                            <FaTrash
                              className="text-danger delete"
                              style={{ cursor: "pointer", fontSize: "18px" }}
                              onClick={() => handleDelete(rate)}
                              title="Delete"
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>

          {/* Modal with exact fields from screenshot */}
          <style>{`
            .cab-rate-modal-wide { max-width: 95vw; }
            .cab-rate-modal-wide .rate-grid-table { min-width: 1400px; }
            .cab-rate-modal-wide .rate-grid-table th,
            .cab-rate-modal-wide .rate-grid-table td { vertical-align: middle; }
          `}</style>
          <Modal
            show={showModal}
            onHide={closeModal}
            centered
            size="xl"
            dialogClassName="cab-rate-modal-wide"
          >
            <Modal.Header closeButton>
              <Modal.Title>
                {isViewMode
                  ? "View Cab Rate"
                  : editing
                  ? "Edit Cab Rate"
                  : "Save Cab Rate"}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form>
                {/* Main Form Fields - Matching Screenshot */}
                <Row>
                  <Col md={4}>
                    <Form.Group className="mb-3">
                      <Form.Label>
                        Cab <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Select
                        value={formData.cabId}
                        onChange={(e) =>
                          updateFormData("cabId", e.target.value)
                        }
                        isInvalid={!!validationErrors.cabId}
                        disabled={isViewMode}
                      >
                        <option value="">SELECT</option>
                        {cabFullList.map((cab) => (
                          <option key={cab.cabId} value={cab.cabId}>
                            {cab.cabName}
                          </option>
                        ))}
                      </Form.Select>
                      {validationErrors.cabId && (
                        <Form.Control.Feedback type="invalid">
                          {validationErrors.cabId}
                        </Form.Control.Feedback>
                      )}
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group className="mb-3">
                      <Form.Label>
                        Rate code <span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Control
                        type="text"
                        placeholder="Enter rate code"
                        value={formData.rateCode}
                        onChange={(e) =>
                          updateFormData("rateCode", e.target.value)
                        }
                        isInvalid={!!validationErrors.rateCode}
                        disabled={isViewMode}
                      />
                      {validationErrors.rateCode && (
                        <Form.Control.Feedback type="invalid">
                          {validationErrors.rateCode}
                        </Form.Control.Feedback>
                      )}
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group className="mb-3">
                      <Form.Label>
                        Market<span className="text-danger">*</span>
                      </Form.Label>
                      <Form.Select
                        value={formData.marketType[0] || ""}
                        onChange={(e) =>
                          updateFormData("marketType", [e.target.value])
                        }
                        isInvalid={!!validationErrors.marketType}
                        disabled={isViewMode}
                      >
                        <option value="">Select Market</option>
                        {marketTypeList.map((market) => (
                          <option
                            key={market.marketTypeId}
                            value={market.marketTypeId}
                          >
                            {market.name}
                          </option>
                        ))}
                      </Form.Select>
                      {validationErrors.marketType && (
                        <Form.Control.Feedback type="invalid">
                          {validationErrors.marketType}
                        </Form.Control.Feedback>
                      )}
                    </Form.Group>
                  </Col>
                </Row>

                {/* Multiple Validity Date Ranges */}
                <div className="mb-3">
                  <h6 className="text-muted mb-3">Validity Periods</h6>
                  {validityDates.map((date, index) => (
                    <Row key={date.id} className="mb-2">
                      <Col md={5}>
                        <Form.Group>
                          <Form.Label>Validity From </Form.Label>
                          <Form.Control
                            type="date"
                            value={date.validityFrom}
                            onChange={(e) => {
                              updateValidityDate(
                                date.id,
                                "validityFrom",
                                e.target.value
                              );
                              // Clear "To" date if it's before the new "From" date
                              if (date.validityTo && e.target.value && new Date(date.validityTo) <= new Date(e.target.value)) {
                                updateValidityDate(date.id, "validityTo", "");
                              }
                            }}
                            disabled={isViewMode}
                          />
                        </Form.Group>
                      </Col>
                      <Col md={5}>
                        <Form.Group>
                          <Form.Label>Validity To </Form.Label>
                          <Form.Control
                            type="date"
                            value={date.validityTo}
                            min={getMinToDate(date.validityFrom)}
                            onChange={(e) =>
                              updateValidityDate(
                                date.id,
                                "validityTo",
                                e.target.value
                              )
                            }
                            disabled={isViewMode}
                            placeholder={!date.validityFrom ? "Select From date first" : ""}
                          />
                          {!date.validityFrom && (
                            <Form.Text className="text-muted">
                              Please select "From" date first
                            </Form.Text>
                          )}
                        </Form.Group>
                      </Col>
                      {!isViewMode && (
                        <Col md={2}>
                          <div className="d-flex gap-1 mt-4">
                            <Button
                              variant="outline-primary"
                              size="sm"
                              onClick={addValidityDate}
                              title="Add Validity Period"
                            >
                              <FaPlus size={10} />
                            </Button>
                            {validityDates.length > 1 && (
                              <Button
                                variant="outline-danger"
                                size="sm"
                                onClick={() => removeValidityDate(date.id)}
                                title="Remove Validity Period"
                              >
                                <FaTrash size={10} />
                              </Button>
                            )}
                          </div>
                        </Col>
                      )}
                    </Row>
                  ))}
                </div>

                {/* ── Transfers Rate Grid (travelType "1") ───────────── */}
                <div className="border-top pt-3 mt-3">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h6 className="text-muted mb-0">Rate Grid — Transfers</h6>
                    {!isViewMode && (
                      <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={addTransferRow}
                        title="Add Transfer Row"
                      >
                        <FaPlus className="me-2" />
                        Add Row
                      </Button>
                    )}
                  </div>
                  <div className="table-responsive">
                    <Table
                      striped
                      bordered
                      hover
                      size="sm"
                      className="rate-grid-table"
                    >
                      <thead className="table-light">
                        <tr>
                          <th style={{ minWidth: 170 }}>Pickup</th>
                          <th style={{ minWidth: 110 }}>Pickup Time</th>
                          <th style={{ minWidth: 170 }}>Dropoff</th>
                          <th style={{ minWidth: 110 }}>Dropoff Time</th>
                          <th style={{ minWidth: 80 }}>Min Pax</th>
                          <th style={{ minWidth: 80 }}>Max Pax</th>
                          <th style={{ minWidth: 110 }}>SIC</th>
                          <th style={{ minWidth: 130 }}>Private (Total)</th>
                          <th style={{ minWidth: 130 }}>Private Per Pax</th>
                          <th style={{ minWidth: 70 }}>Luggage</th>
                          <th style={{ minWidth: 130 }}>Driver Waiting Time</th>
                          <th style={{ minWidth: 110 }}>Distance (Km)</th>
                          {!isViewMode && <th style={{ minWidth: 90 }}>Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {transfersRows.map((row) => (
                          <tr key={row.id}>
                            <td>
                              <Form.Select
                                size="sm"
                                value={row.pickupZoneLocationId || ""}
                                onChange={(e) =>
                                  updateTransferRow(row.id, "pickupZoneLocationId", e.target.value)
                                }
                                disabled={isViewMode || !formData.cabId}
                              >
                                <option value="">
                                  {!formData.cabId
                                    ? "Select cab first"
                                    : cabZonePickup.length === 0
                                    ? "No pickup zones"
                                    : "Select pickup"}
                                </option>
                                {cabZonePickup.map((loc) => (
                                  <option key={loc.id} value={loc.id}>
                                    {loc.locationName}
                                  </option>
                                ))}
                              </Form.Select>
                            </td>
                            <td>
                              <Form.Control
                                type="time"
                                size="sm"
                                value={row.pickupTime || ""}
                                onChange={(e) =>
                                  updateTransferRow(row.id, "pickupTime", e.target.value)
                                }
                                disabled={isViewMode}
                              />
                            </td>
                            <td>
                              <Form.Select
                                size="sm"
                                value={row.dropoffZoneLocationId || ""}
                                onChange={(e) =>
                                  updateTransferRow(row.id, "dropoffZoneLocationId", e.target.value)
                                }
                                disabled={isViewMode || !formData.cabId}
                              >
                                <option value="">
                                  {!formData.cabId
                                    ? "Select cab first"
                                    : cabZoneDropoff.length === 0
                                    ? "No dropoff zones"
                                    : "Select dropoff"}
                                </option>
                                {cabZoneDropoff.map((loc) => (
                                  <option key={loc.id} value={loc.id}>
                                    {loc.locationName}
                                  </option>
                                ))}
                              </Form.Select>
                            </td>
                            <td>
                              <Form.Control
                                type="time"
                                size="sm"
                                value={row.dropoffTime || ""}
                                onChange={(e) =>
                                  updateTransferRow(row.id, "dropoffTime", e.target.value)
                                }
                                disabled={isViewMode}
                              />
                            </td>
                            <td>
                              <Form.Control
                                type="number" size="sm" placeholder="Min"
                                value={row.minPax}
                                onChange={(e) => updateTransferRow(row.id, "minPax", e.target.value)}
                                disabled={isViewMode}
                              />
                            </td>
                            <td>
                              <Form.Control
                                type="number" size="sm" placeholder="Max"
                                value={row.maxPax}
                                onChange={(e) => updateTransferRow(row.id, "maxPax", e.target.value)}
                                disabled={isViewMode}
                              />
                            </td>
                            <td>
                              <Form.Control
                                type="number" size="sm" placeholder="SIC"
                                value={row.sicPerWay}
                                onChange={(e) => updateTransferRow(row.id, "sicPerWay", e.target.value)}
                                disabled={isViewMode}
                              />
                            </td>
                            <td>
                              <Form.Control
                                type="number" size="sm" placeholder="Total"
                                value={row.privateTotal || ""}
                                onChange={(e) => updateTransferRow(row.id, "privateTotal", e.target.value)}
                                disabled={isViewMode}
                              />
                            </td>
                            <td>
                              <Form.Control
                                type="number" size="sm" placeholder="Per Pax"
                                value={row.privatePerPax || ""}
                                onChange={(e) => updateTransferRow(row.id, "privatePerPax", e.target.value)}
                                disabled={isViewMode}
                              />
                            </td>
                            <td>
                              <Form.Check
                                type="checkbox"
                                checked={row.luggage}
                                onChange={(e) => updateTransferRow(row.id, "luggage", e.target.checked)}
                                disabled={isViewMode}
                              />
                            </td>
                            <td>
                              <Form.Control
                                type="text" size="sm" placeholder="e.g. 45 Min"
                                value={row.driverWaitingTime || ""}
                                onChange={(e) => updateTransferRow(row.id, "driverWaitingTime", e.target.value)}
                                disabled={isViewMode}
                              />
                            </td>
                            <td>
                              <Form.Control
                                type="number" step="0.001" size="sm" placeholder="Km"
                                value={row.distance || ""}
                                onChange={(e) => updateTransferRow(row.id, "distance", e.target.value)}
                                disabled={isViewMode}
                              />
                            </td>
                            {!isViewMode && (
                              <td>
                                <div className="d-flex gap-1">
                                  <Button variant="outline-primary" size="sm" onClick={addTransferRow} title="Clone Row">
                                    <FaPlus size={10} />
                                  </Button>
                                  {transfersRows.length > 1 && (
                                    <Button variant="outline-danger" size="sm" onClick={() => removeTransferRow(row.id)} title="Remove Row">
                                      <FaTrash size={10} />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                </div>

                {/* Car Rental rate grid removed from CabRates — handled in Scheffer/Lumousin pages */}

                {/* ── Special Requirements ──────────────────────────────
                    Multi-select of add-on services the provider actually
                    supports for this rate (Name Board, Child Seat, etc.).
                    Only these picks are offered to the customer on the
                    Cab Booking page — nothing outside this list shows up
                    there, so the operator's checkbox effectively gates
                    what the customer can request. */}
                <div className="border-top pt-3 mt-3">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h6 className="text-muted mb-0">Special Requirements</h6>
                  </div>
                  <Row>
                    <Col md={12}>
                      <Select
                        isMulti
                        isClearable
                        closeMenuOnSelect={false}
                        placeholder="Select the special requirements this rate supports"
                        options={SPECIAL_REQUIREMENTS_OPTIONS}
                        value={selectedSpecialRequirements}
                        onChange={(vals) =>
                          setSelectedSpecialRequirements(vals || [])
                        }
                        isDisabled={isViewMode}
                        classNamePrefix="cabrate-special-req"
                      />
                      <Form.Text className="text-muted">
                        Customers will only see the items you tick here as
                        selectable options when booking this rate.
                      </Form.Text>
                    </Col>
                  </Row>
                </div>

                {/* ── Terms & Conditions ────────────────────────────────
                    Dynamic list of free-form sentences saved per rate.
                    Shown service-wise on the Make-Your-Own-Package
                    booking confirmation modal. Empty rows are dropped
                    at save-time (frontend + backend defend). */}
                <div className="border-top pt-3 mt-3">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h6 className="text-muted mb-0">Terms &amp; Conditions</h6>
                    {!isViewMode && (
                      <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={() => addPolicyRow(setTermsRows)}
                        title="Add Terms &amp; Conditions"
                      >
                        <FaPlus className="me-2" />
                        Add
                      </Button>
                    )}
                  </div>
                  {termsRows.map((row, idx) => (
                    <Row key={row.id} className="mb-2">
                      <Col md={10}>
                        <Form.Control
                          as="textarea"
                          rows={2}
                          value={row.value}
                          placeholder={`Term ${idx + 1} — e.g. "Driver waiting time is 30 mins"`}
                          onChange={(e) =>
                            updatePolicyRow(setTermsRows, row.id, e.target.value)
                          }
                          disabled={isViewMode}
                        />
                      </Col>
                      {!isViewMode && (
                        <Col md={2}>
                          <div className="d-flex gap-1">
                            {termsRows.length > 1 && (
                              <Button
                                variant="outline-danger"
                                size="sm"
                                onClick={() => removePolicyRow(setTermsRows, row.id)}
                                title="Remove"
                              >
                                <FaTrash size={10} />
                              </Button>
                            )}
                          </div>
                        </Col>
                      )}
                    </Row>
                  ))}
                </div>

                {/* ── Cancellation Policies ───────────────────────────── */}
                <div className="border-top pt-3 mt-3">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h6 className="text-muted mb-0">Cancellation Policies</h6>
                    {!isViewMode && (
                      <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={() => addPolicyRow(setCancellationRows)}
                        title="Add Cancellation Policy"
                      >
                        <FaPlus className="me-2" />
                        Add
                      </Button>
                    )}
                  </div>
                  {cancellationRows.map((row, idx) => (
                    <Row key={row.id} className="mb-2">
                      <Col md={10}>
                        <Form.Control
                          as="textarea"
                          rows={2}
                          value={row.value}
                          placeholder={`Policy ${idx + 1} — e.g. "Free cancellation before 24 hours"`}
                          onChange={(e) =>
                            updatePolicyRow(setCancellationRows, row.id, e.target.value)
                          }
                          disabled={isViewMode}
                        />
                      </Col>
                      {!isViewMode && (
                        <Col md={2}>
                          <div className="d-flex gap-1">
                            {cancellationRows.length > 1 && (
                              <Button
                                variant="outline-danger"
                                size="sm"
                                onClick={() => removePolicyRow(setCancellationRows, row.id)}
                                title="Remove"
                              >
                                <FaTrash size={10} />
                              </Button>
                            )}
                          </div>
                        </Col>
                      )}
                    </Row>
                  ))}
                </div>
              </Form>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="danger" onClick={closeModal}>
                <i className="fas fa-times me-2"></i>
                {isViewMode ? "Close" : "Cancel"}
              </Button>
              {!isViewMode && (
                <Button
                  variant="success"
                  onClick={editing ? updateCabRate : saveCabRate}
                  disabled={loading}
                >
                  <i className="fas fa-arrow-right me-2"></i>
                  {loading
                    ? editing
                      ? "Updating..."
                      : "Saving..."
                    : editing
                    ? "Update"
                    : "Create"}
                </Button>
              )}
            </Modal.Footer>
          </Modal>
        </main>
      </div>
    </div>
  );
};

export default CabRates;
